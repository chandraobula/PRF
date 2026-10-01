import { buildPushPayload } from '@block65/webcrypto-web-push';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  buildFinanceDigest,
  daysBetweenDates,
  isInsideWindow,
  localClock,
} from '../../shared/notifications/finance.js';

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(scheduleFinanceNotifications(env, new Date(controller.scheduledTime)));
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await deliverJob(env, message.body?.jobId);
        message.ack();
      } catch (error) {
        console.error('notification delivery failed', error);
        message.retry({ delaySeconds: Math.min(900, 30 * (message.attempts || 1)) });
      }
    }
  },
};

export async function scheduleFinanceNotifications(env, now = new Date()) {
  const users = await env.DB.prepare(
    `SELECT u.id, u.email, COALESCE(up.timezone, 'UTC') AS timezone,
            COALESCE(np.window_start_minute, 1200) AS window_start_minute,
            COALESCE(np.window_end_minute, 1320) AS window_end_minute,
            COALESCE(np.max_daily_reminders, 1) AS max_daily_reminders,
            COALESCE(np.in_app_enabled, 1) AS in_app_enabled,
            COALESCE(np.push_enabled, 0) AS push_enabled,
            COALESCE(np.email_enabled, 0) AS email_enabled,
            COALESCE(np.expense_reminders, 1) AS expense_reminders,
            COALESCE(np.bill_reminders, 1) AS bill_reminders,
            COALESCE(np.budget_alerts, 1) AS budget_alerts,
            COALESCE(np.friendly_reminders, 1) AS friendly_reminders
     FROM users u
     LEFT JOIN user_preferences up ON up.user_id = u.id
     LEFT JOIN notification_preferences np ON np.user_id = u.id
     WHERE u.role != 'suspended'`,
  ).all();

  for (const user of users.results || []) {
    const clock = localClock(now, user.timezone);
    if (!isInsideWindow(clock.minute, Number(user.window_start_minute), Number(user.window_end_minute))) continue;

    const sentToday = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM notification_jobs
       WHERE user_id = ? AND local_date = ? AND status IN ('pending','processing','sent','partial')`,
    ).bind(user.id, clock.date).first();
    if (Number(sentToday?.count || 0) >= Number(user.max_daily_reminders || 1)) continue;

    const signals = await financeSignals(env.DB, user.id, clock);
    const digest = buildFinanceDigest({
      localDate: clock.date,
      preferences: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        expenseReminders: Boolean(user.expense_reminders),
        billReminders: Boolean(user.bill_reminders),
        budgetAlerts: Boolean(user.budget_alerts),
        friendlyReminders: Boolean(user.friendly_reminders),
      },
      signals,
    });
    if (!digest) continue;

    const channels = [];
    if (user.in_app_enabled) channels.push('in_app');
    if (user.push_enabled) channels.push('push');
    if (user.email_enabled) channels.push('email');
    if (!channels.length) continue;

    const id = crypto.randomUUID();
    const idempotencyKey = `${user.id}:finance_digest:${clock.date}`;
    const inserted = await env.DB.prepare(
      `INSERT OR IGNORE INTO notification_jobs
       (id, user_id, kind, local_date, scheduled_for, title, body, target_url, payload_json, channels_json, idempotency_key)
       VALUES (?, ?, 'finance_digest', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      user.id,
      clock.date,
      now.toISOString(),
      digest.title,
      digest.body,
      digest.targetUrl,
      JSON.stringify({ ...digest, email: user.email }),
      JSON.stringify(channels),
      idempotencyKey,
    ).run();

    if (inserted.meta?.changes) await env.NOTIFICATION_QUEUE.send({ jobId: id });
  }
}

async function financeSignals(db, userId, clock) {
  const [transactionSummary, subscriptions, recurring, liabilities, budgets] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS activity_count,
              SUM(CASE WHEN type = 'expense' AND status != 'deleted' AND occurred_on = ? THEN 1 ELSE 0 END) AS expense_today,
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count
       FROM finance_transactions WHERE user_id = ?`,
    ).bind(clock.date, userId).first(),
    db.prepare(
      `SELECT name, next_renewal_on AS due_on, reminder_days_before
       FROM subscriptions WHERE user_id = ? AND status = 'active' AND next_renewal_on IS NOT NULL`,
    ).bind(userId).all(),
    db.prepare(
      `SELECT name, next_due_on AS due_on, reminder_days_before
       FROM finance_recurring_rules
       WHERE user_id = ? AND is_active = 1 AND type = 'expense' AND next_due_on IS NOT NULL`,
    ).bind(userId).all(),
    db.prepare(
      `SELECT name, next_payment_on AS due_on, 3 AS reminder_days_before
       FROM finance_liabilities WHERE user_id = ? AND status = 'active' AND next_payment_on IS NOT NULL`,
    ).bind(userId).all(),
    db.prepare(
      `SELECT b.id, b.name, b.limit_minor, b.alert_threshold_percent,
              COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.status != 'deleted' THEN t.amount_minor ELSE 0 END), 0) AS spent_minor
       FROM finance_budgets b
       LEFT JOIN finance_transactions t ON t.user_id = b.user_id AND t.category_id = b.category_id
         AND t.occurred_on BETWEEN b.period_start AND b.period_end
       WHERE b.user_id = ? AND ? BETWEEN b.period_start AND b.period_end
       GROUP BY b.id`,
    ).bind(userId, clock.date).all(),
  ]);

  const due = (rows) => (rows.results || []).map((row) => ({
    name: row.name,
    daysUntil: daysBetweenDates(clock.date, row.due_on),
  })).filter((row, index) => row.daysUntil <= Number((rows.results || [])[index]?.reminder_days_before || 0));

  return {
    weekday: clock.weekday,
    hasFinanceActivity: Number(transactionSummary?.activity_count || 0) > 0,
    expenseCountToday: Number(transactionSummary?.expense_today || 0),
    pendingTransactions: Number(transactionSummary?.pending_count || 0),
    dueSubscriptions: due(subscriptions),
    duePayments: [...due(recurring), ...due(liabilities)],
    budgetAlerts: (budgets.results || []).map((row) => ({
      name: row.name,
      percent: Number(row.limit_minor) > 0 ? (Number(row.spent_minor) / Number(row.limit_minor)) * 100 : 0,
    })).filter((row, index) => row.percent >= Number((budgets.results || [])[index]?.alert_threshold_percent || 80)),
  };
}

async function deliverJob(env, jobId) {
  if (!jobId) return;
  const job = await env.DB.prepare('SELECT * FROM notification_jobs WHERE id = ?').bind(jobId).first();
  if (!job || job.status === 'sent') return;

  await env.DB.prepare(
    "UPDATE notification_jobs SET status = 'processing', attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(jobId).run();

  const channels = safeJson(job.channels_json, ['in_app']);
  const payload = safeJson(job.payload_json, {});
  let sent = 0;
  let failed = 0;

  for (const channel of channels) {
    try {
      const outcome = channel === 'in_app'
        ? await deliverInApp(env.DB, job)
        : channel === 'push'
          ? await deliverPush(env, job)
          : await deliverEmail(env, job, payload.email);
      await recordDelivery(env.DB, job.id, channel, outcome.sent ? 'sent' : 'skipped', outcome.detail);
      if (outcome.sent) sent += 1;
    } catch (error) {
      failed += 1;
      await recordDelivery(env.DB, job.id, channel, 'failed', error instanceof Error ? error.message : String(error));
      if (channel !== 'email' || env.EMAIL_ENABLED === 'true') throw error;
    }
  }

  const status = failed ? (sent ? 'partial' : 'failed') : 'sent';
  await env.DB.prepare(
    `UPDATE notification_jobs SET status = ?, last_error = NULL,
     delivered_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE delivered_at END,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).bind(status, status, job.id).run();
}

async function deliverInApp(db, job) {
  await db.prepare(
    `INSERT OR IGNORE INTO app_notifications
     (id, user_id, job_id, category, notification_type, title, body, target_url)
     VALUES (?, ?, ?, 'finance', ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), job.user_id, job.id, job.kind, job.title, job.body, job.target_url).run();
  return { sent: true };
}

async function deliverPush(env, job) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { sent: false, detail: 'VAPID keys are not configured.' };
  const subscriptions = await env.DB.prepare(
    "SELECT id, endpoint, p256dh_key, auth_key FROM push_subscriptions WHERE user_id = ? AND status = 'active'",
  ).bind(job.user_id).all();
  let delivered = 0;
  for (const subscription of subscriptions.results || []) {
    const request = await buildPushPayload(
      { data: JSON.stringify({ title: job.title, body: job.body, url: job.target_url, tag: `finance-${job.local_date}` }), options: { ttl: 3600 } },
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh_key, auth: subscription.auth_key } },
      { subject: env.VAPID_SUBJECT || 'mailto:notifications@example.com', publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
    );
    const response = await fetch(subscription.endpoint, request);
    if (response.status === 404 || response.status === 410) {
      await env.DB.prepare("UPDATE push_subscriptions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(subscription.id).run();
      continue;
    }
    if (!response.ok) throw new Error(`Push service returned ${response.status}.`);
    delivered += 1;
    await env.DB.prepare('UPDATE push_subscriptions SET last_success_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(subscription.id).run();
  }
  return { sent: delivered > 0, detail: delivered ? `${delivered} device(s)` : 'No active devices.' };
}

async function deliverEmail(env, job, recipient) {
  if (env.EMAIL_ENABLED !== 'true' || !env.EMAIL || !env.EMAIL_FROM) return { sent: false, detail: 'Email delivery is not configured.' };
  if (!recipient) return { sent: false, detail: 'The account has no email address.' };
  await env.EMAIL.send({
    to: recipient,
    from: env.EMAIL_FROM,
    subject: job.title,
    text: `${job.body}\n\nOpen LifeOS: ${env.APP_URL || ''}${job.target_url}`,
    html: `<p>${escapeHtml(job.body)}</p><p><a href="${escapeHtml(`${env.APP_URL || ''}${job.target_url}`)}">Open LifeOS</a></p>`,
  });
  return { sent: true };
}

async function recordDelivery(db, jobId, channel, status, detail = null) {
  await db.prepare(
    `INSERT INTO notification_deliveries (id, job_id, channel, status, attempt_count, last_error, delivered_at)
     VALUES (?, ?, ?, ?, 1, ?, CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END)
     ON CONFLICT(job_id, channel) DO UPDATE SET status = excluded.status,
       attempt_count = notification_deliveries.attempt_count + 1, last_error = excluded.last_error,
       delivered_at = CASE WHEN excluded.status = 'sent' THEN CURRENT_TIMESTAMP ELSE notification_deliveries.delivered_at END,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), jobId, channel, status, detail, status).run();
}

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

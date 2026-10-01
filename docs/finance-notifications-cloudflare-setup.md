# Finance notifications on Cloudflare

The application code is ready for in-app reminders, PWA push, and optional email. The scheduled Worker runs every five minutes, but each user receives at most one finance digest per local day and only inside the time window saved in Settings.

## 1. Apply the production migration

```powershell
npx wrangler d1 migrations apply DB --remote
```

This applies `015_finance_notifications.sql`. Run it before deploying the Pages application or scheduled Worker.

## 2. Create the queues once

```powershell
npx wrangler queues create lifeos-notifications
npx wrangler queues create lifeos-notifications-dlq
```

## 3. Configure PWA push once

Generate a VAPID key pair locally:

```powershell
npm run notifications:vapid
```

- Keep `VAPID_PRIVATE_KEY` secret and add it to the Worker with `npx wrangler secret put VAPID_PRIVATE_KEY --config workers/notifications/wrangler.toml`.
- Add `VAPID_PUBLIC_KEY` as a normal variable on both the notification Worker and the Pages project.
- Add `VAPID_SUBJECT` to the Worker, normally `mailto:your-address@example.com`.
- Add `APP_URL`, such as the production `https://...pages.dev` or custom-domain URL, to the Worker.

Then deploy the scheduler:

```powershell
npx wrangler deploy --config workers/notifications/wrangler.toml
```

Users can then enable push from Settings → Notifications. On iPhone/iPad, the site must be installed to the Home Screen before Web Push can be enabled.

## 4. Add email later

Leave `EMAIL_ENABLED = "false"` until the sender domain and the two destination addresses are verified in Cloudflare Email Routing / Email Service.

After verification, add this binding to `workers/notifications/wrangler.toml`, replacing the examples with the exact verified addresses:

```toml
[[send_email]]
name = "EMAIL"
allowed_sender_addresses = ["reminders@your-domain.example"]
allowed_destination_addresses = ["first@example.com", "second@example.com"]
```

Also set these Worker variables:

```toml
[vars]
EMAIL_ENABLED = "true"
EMAIL_FROM = "reminders@your-domain.example"
APP_URL = "https://your-lifeos-domain.example"
VAPID_PUBLIC_KEY = "your-public-key"
VAPID_SUBJECT = "mailto:your-address@example.com"
```

Set the Pages variable `EMAIL_NOTIFICATIONS_AVAILABLE=true` so Settings describes email as available. Each reminder is addressed to the email stored on that user's LifeOS account; a registrant never becomes the sender.

## Free-tier fit for two users

At this scale, the five-minute cron, one queue job per active user per day, D1 reads/writes, and Web Push traffic are far below Cloudflare's free allowances. Verified-destination email sending is also free under the current Cloudflare Email Service model. Cloudflare limits and product terms can change, so recheck them before expanding beyond a small private deployment.

## Operational behavior

- The database idempotency key prevents duplicate daily reminders.
- Queue retries cover temporary push or provider failures; exhausted messages go to the dead-letter queue.
- Expired push subscriptions are disabled automatically.
- Email silently remains skipped until its binding and sender are configured.
- In-app notifications remain available even when push or email is disabled.

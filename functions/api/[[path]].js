const DEFAULT_USER_ID = 'demo-user';
const DEFAULT_USER_EMAIL = 'demo@lifeos.local';

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-user-email,x-user-id',
};

const defaultExpenseCategories = [
  ['cat-exp-food', 'Food', '#F59E0B', 'Utensils', 10],
  ['cat-exp-shopping', 'Shopping', '#A855F7', 'ShoppingBag', 20],
  ['cat-exp-travel', 'Travel', '#06B6D4', 'Plane', 30],
  ['cat-exp-fuel', 'Fuel', '#EF4444', 'Fuel', 40],
  ['cat-exp-health', 'Health', '#10B981', 'HeartPulse', 50],
  ['cat-exp-entertainment', 'Entertainment', '#6366F1', 'Clapperboard', 60],
  ['cat-exp-education', 'Education', '#2563EB', 'GraduationCap', 70],
  ['cat-exp-utilities', 'Utilities', '#64748B', 'Plug', 80],
  ['cat-exp-rent', 'Rent', '#334155', 'Home', 90],
  ['cat-exp-family', 'Family', '#EC4899', 'Users', 100],
  ['cat-exp-pets', 'Pets', '#84CC16', 'PawPrint', 110],
  ['cat-exp-taxes', 'Taxes', '#991B1B', 'ReceiptText', 120],
  ['cat-exp-charity', 'Charity', '#16A34A', 'HandHeart', 130],
  ['cat-exp-care', 'Personal Care', '#DB2777', 'Sparkles', 140],
  ['cat-exp-misc', 'Miscellaneous', '#475569', 'Circle', 150],
];

const defaultIncomeCategories = [
  ['cat-income-salary', 'Salary', '#22C55E', 'BriefcaseBusiness', 10],
  ['cat-income-freelance', 'Freelance', '#14B8A6', 'Laptop', 20],
  ['cat-income-interest', 'Interest', '#0EA5E9', 'Percent', 30],
  ['cat-income-gifts', 'Gifts', '#EC4899', 'Gift', 40],
  ['cat-income-rental', 'Rental', '#8B5CF6', 'Home', 50],
  // Credits picked up from imported statements land here so they never inflate
  // the salary/freelance figures the user actually earns.
  ['cat-income-misc', 'Miscellaneous income', '#94A3B8', 'ArrowDownLeft', 90],
];

// Income categories that represent genuine earnings, as opposed to transfers,
// repayments and reimbursements that merely arrive as credits. Matched by name
// because category ids are namespaced per user.
const PRIMARY_INCOME_CATEGORY_NAMES = ['Salary', 'Freelance'];

export const MISC_INCOME_CATEGORY = 'Miscellaneous income';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  try {
    if (!env.DB) {
      return sendJson(
        {
          error: 'Database binding missing',
          message: 'Bind a Cloudflare D1 database as DB to enable the backend.',
        },
        503,
      );
    }

    const url = new URL(request.url);
    const route = normalizeRoute(url.pathname);

    if (route[0] === 'health') {
      return sendJson({ ok: true, service: 'LifeOS API' });
    }

    if (route[0] === 'meta') {
      return await handleMetaRoute({ request });
    }

    if (route[0] === 'auth') {
      return await handleAuthRoute({ db: env.DB, request, route: route.slice(1), env });
    }

    const auth = await authenticateRequest(request, env.DB, env);

    if (auth.error) {
      return sendJson({ error: auth.error }, 401);
    }

    await ensureUser(env.DB, auth);

    if (route[0] === 'finance') {
      return await handleFinanceRoute({ db: env.DB, request, url, route: route.slice(1), user: auth, env });
    }

    if (route[0] === 'pantry') {
      return await handlePantryRoute({ db: env.DB, request, route: route.slice(1), user: auth, env });
    }

    if (route[0] === 'car') {
      return await handleCarRoute({ db: env.DB, request, route: route.slice(1), user: auth });
    }

    if (route[0] === 'subscriptions') {
      return await handleSubscriptionsRoute({ db: env.DB, request, route: route.slice(1), user: auth });
    }

    if (route[0] === 'dates') {
      return await handleDatesRoute({ db: env.DB, request, route: route.slice(1), user: auth });
    }

    if (route[0] === 'notes') {
      return await handleNotesRoute({ db: env.DB, request, route: route.slice(1), user: auth, env });
    }

    if (route[0] === 'sticky-notes') {
      return await handleStickyNotesRoute({ db: env.DB, request, url, route: route.slice(1), user: auth });
    }

    if (route[0] === 'admin') {
      return await handleAdminRoute({ db: env.DB, request, url, route: route.slice(1), user: auth });
    }

    if (route[0] === 'planner') {
      return await handlePlannerRoute({ db: env.DB, request, url, route: route.slice(1), user: auth, env });
    }

    return sendJson({ error: 'Not found' }, 404);
  } catch (error) {
    if (error instanceof HttpError) {
      return sendJson({ error: error.message }, error.status);
    }

    return sendJson(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
}

// ---------------------------------------------------------------------------
// Sticky notes — the Work Hub board
// ---------------------------------------------------------------------------

const STICKY_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'];
const STICKY_FONTS = ['hand', 'print', 'clean'];
const STICKY_MAX_BODY = 8000;

// Sticky note bodies are rich text, so they are stored as HTML. Only these tags
// survive, and every attribute is dropped — see sanitizeStickyHtml.
const STICKY_ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'mark',
  'br', 'div', 'p', 'ul', 'ol', 'li',
]);

/**
 * Allowlist sanitiser for sticky-note HTML.
 *
 * Rather than trying to scrub dangerous attributes, every tag is re-emitted from
 * scratch with no attributes at all — so there is nowhere for `onerror`,
 * `href="javascript:"` or a style expression to live. Disallowed tags are
 * dropped but their text content is kept.
 */
function sanitizeStickyHtml(value) {
  let html = String(value == null ? '' : value).slice(0, STICKY_MAX_BODY);

  // Elements whose *content* must go too, not just their tags.
  html = html.replace(/<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '');
  html = html.replace(/<(script|style|iframe|object|embed|noscript|template)\b[^>]*>/gi, '');

  // Comments can hide conditional markup.
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g, (match, rawTag) => {
    const tag = rawTag.toLowerCase();
    if (!STICKY_ALLOWED_TAGS.has(tag)) return '';
    if (match.startsWith('</')) return `</${tag}>`;
    return tag === 'br' ? '<br>' : `<${tag}>`;
  });

  // Anything left that looks like a stray angle bracket is literal text.
  html = html.replace(/<(?![/a-zA-Z])/g, '&lt;');

  return html.slice(0, STICKY_MAX_BODY);
}

async function handleStickyNotesRoute({ db, request, url, route, user }) {
  const [id] = route;
  const board = (url.searchParams.get('board') || 'work').slice(0, 40);

  if (!id) {
    if (request.method === 'GET') {
      return sendJson({ notes: await listStickyNotes(db, user.userId, board) });
    }

    if (request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ note: await createStickyNote(db, user.userId, payload) }, 201);
    }
  }

  if (id === 'reorder' && request.method === 'POST') {
    const payload = await readJson(request);
    await reorderStickyNotes(db, user.userId, payload.order || []);
    return sendJson({ ok: true });
  }

  if (id && request.method === 'PATCH') {
    const payload = await readJson(request);
    return sendJson({ note: await updateStickyNote(db, user.userId, id, payload) });
  }

  if (id && request.method === 'DELETE') {
    await deleteStickyNote(db, user.userId, id);
    return sendJson({ ok: true });
  }

  throw new HttpError(405, 'Method not allowed');
}

async function listStickyNotes(db, userId, board = 'work') {
  const result = await db
    .prepare(
      `
      SELECT * FROM sticky_notes
      WHERE user_id = ? AND board = ? AND status = 'active'
      ORDER BY is_pinned DESC, sort_order ASC, created_at ASC
    `,
    )
    .bind(userId, board)
    .all();

  return (result.results || []).map(mapStickyNote);
}

async function createStickyNote(db, userId, payload) {
  const id = payload.id || crypto.randomUUID();
  const board = (payload.board || 'work').slice(0, 40);

  // New notes go to the end of the board.
  const row = await db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM sticky_notes WHERE user_id = ? AND board = ?')
    .bind(userId, board)
    .first();

  await db
    .prepare(
      `
      INSERT INTO sticky_notes (id, user_id, board, body, color, font, rotation, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      id,
      userId,
      board,
      sanitizeStickyHtml(payload.body),
      normalizeStickyColor(payload.color),
      normalizeStickyFont(payload.font),
      normalizeStickyRotation(payload.rotation),
      Number(row?.max_order ?? -1) + 1,
    )
    .run();

  return getStickyNote(db, userId, id);
}

async function updateStickyNote(db, userId, id, payload) {
  const allowed = {
    body: payload.body === undefined ? undefined : sanitizeStickyHtml(payload.body),
    color: payload.color === undefined ? undefined : normalizeStickyColor(payload.color),
    font: payload.font === undefined ? undefined : normalizeStickyFont(payload.font),
    rotation: payload.rotation === undefined ? undefined : normalizeStickyRotation(payload.rotation),
    is_pinned: payload.isPinned === undefined ? undefined : (payload.isPinned ? 1 : 0),
    status: payload.status === undefined ? undefined : (payload.status === 'archived' ? 'archived' : 'active'),
  };

  const updates = Object.entries(allowed).filter(([, value]) => value !== undefined);

  if (updates.length) {
    const result = await db
      .prepare(
        `
        UPDATE sticky_notes
        SET ${updates.map(([key]) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `,
      )
      .bind(...updates.map(([, value]) => value), id, userId)
      .run();

    if (result.meta && result.meta.changes === 0) {
      throw new HttpError(404, 'Note not found');
    }
  }

  return getStickyNote(db, userId, id);
}

async function deleteStickyNote(db, userId, id) {
  const result = await db
    .prepare('DELETE FROM sticky_notes WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  if (result.meta && result.meta.changes === 0) {
    throw new HttpError(404, 'Note not found');
  }
}

/** Persist a drag-and-drop rearrangement: ids in their new visual order. */
async function reorderStickyNotes(db, userId, order) {
  if (!Array.isArray(order) || !order.length) return;

  const statements = order.slice(0, 200).map((id, index) => db
    .prepare('UPDATE sticky_notes SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
    .bind(index, id, userId));

  await db.batch(statements);
}

async function getStickyNote(db, userId, id) {
  const row = await db
    .prepare('SELECT * FROM sticky_notes WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();

  if (!row) {
    throw new HttpError(404, 'Note not found');
  }

  return mapStickyNote(row);
}

function mapStickyNote(row) {
  return {
    id: row.id,
    board: row.board,
    body: row.body || '',
    color: row.color || 'yellow',
    font: row.font || 'hand',
    rotation: Number(row.rotation || 0),
    sortOrder: Number(row.sort_order || 0),
    isPinned: Number(row.is_pinned || 0) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeStickyColor(value) {
  const text = String(value || '').toLowerCase();
  return STICKY_COLORS.includes(text) ? text : 'yellow';
}

function normalizeStickyFont(value) {
  const text = String(value || '').toLowerCase();
  return STICKY_FONTS.includes(text) ? text : 'hand';
}

function normalizeStickyRotation(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  // Clamp the tilt so a note can never end up unreadable.
  return Math.max(-4, Math.min(4, Math.round(numeric * 100) / 100));
}

async function handleFinanceRoute({ db, request, url, route, user, env }) {
  const [resource, id] = route;

  if (!resource || resource === 'summary') {
    assertMethod(request, 'GET');
    return sendJson(await getFinanceSummary(db, user.userId, url));
  }

  if (resource === 'scan' && request.method === 'POST') {
    const payload = await readJson(request);
    return sendJson(await scanDocument(env, payload));
  }

  if (resource === 'transactions') {
    if (request.method === 'GET') {
      return sendJson({ transactions: await listTransactions(db, user.userId, url) });
    }

    if (request.method === 'POST') {
      const payload = await readJson(request);
      const transaction = await createTransaction(db, user.userId, payload);
      return sendJson({ transaction }, 201);
    }

    if (id && request.method === 'PATCH') {
      const payload = await readJson(request);
      const transaction = await updateTransaction(db, user.userId, id, payload);
      return sendJson({ transaction });
    }

    if (id && request.method === 'DELETE') {
      await softDeleteTransaction(db, user.userId, id);
      return sendJson({ ok: true });
    }
  }

  if (resource === 'categories') {
    assertMethod(request, 'GET');
    return sendJson({ categories: await listCategories(db, user.userId) });
  }

  if (resource === 'budgets') {
    if (request.method === 'GET') {
      return sendJson({ budgets: await listBudgets(db, user.userId, url) });
    }

    if (request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ budget: await createBudget(db, user.userId, payload) }, 201);
    }

    if (id && request.method === 'PATCH') {
      const payload = await readJson(request);
      return sendJson({ budget: await updateBudget(db, user.userId, id, payload) });
    }

    if (id && request.method === 'DELETE') {
      await deleteBudget(db, user.userId, id);
      return sendJson({ ok: true });
    }
  }

  if (resource === 'goals') {
    if (request.method === 'GET') {
      return sendJson({ goals: await listGoals(db, user.userId, url.searchParams.get('currency')) });
    }

    // Must be checked before the bare POST below, otherwise createGoal claims it.
    if (id && route[2] === 'contribute' && request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ goal: await contributeToGoal(db, user.userId, id, payload) });
    }

    if (request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ goal: await createGoal(db, user.userId, payload) }, 201);
    }

    if (id && request.method === 'PATCH') {
      const payload = await readJson(request);
      return sendJson({ goal: await updateGoal(db, user.userId, id, payload) });
    }

    if (id && request.method === 'DELETE') {
      await deleteGoal(db, user.userId, id);
      return sendJson({ ok: true });
    }
  }

  if (resource === 'insights') {
    assertMethod(request, 'GET');
    return sendJson({ insights: await listInsights(db, user.userId) });
  }

  if (resource === 'analytics') {
    assertMethod(request, 'GET');
    return sendJson(await getFinanceAnalytics(db, user.userId, url));
  }

  if (resource === 'import') {
    assertMethod(request, 'POST');
    const payload = await readJson(request);
    return sendJson(await importTransactions(db, user.userId, payload));
  }

  if (resource === 'reports') {
    assertMethod(request, 'GET');
    return sendJson({ report: await buildMonthlyReport(db, user.userId, url) });
  }

  if (resource === 'export.csv') {
    assertMethod(request, 'GET');
    return exportTransactionsCsv(db, user.userId, url);
  }

  if (resource === 'receipts') {
    if (request.method === 'GET') {
      return sendJson({ receipts: await listReceiptTransactions(db, user.userId, url) });
    }

    if (request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ receipt: await createReceiptTransaction(db, user.userId, payload) }, 201);
    }

    if (id && request.method === 'PATCH') {
      const payload = await readJson(request);
      return sendJson({ receipt: await updateTransaction(db, user.userId, id, payload) });
    }

    if (id && request.method === 'DELETE') {
      await softDeleteTransaction(db, user.userId, id);
      return sendJson({ ok: true });
    }
  }

  if (resource === 'liabilities') {
    if (request.method === 'GET') {
      return sendJson({ liabilities: await listLiabilities(db, user.userId, url.searchParams.get('currency')) });
    }

    if (id && route[2] === 'payment' && request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ liability: await recordLiabilityPayment(db, user.userId, id, payload) });
    }

    if (request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ liability: await createLiability(db, user.userId, payload) }, 201);
    }

    if (id && request.method === 'PATCH') {
      const payload = await readJson(request);
      return sendJson({ liability: await updateLiability(db, user.userId, id, payload) });
    }

    if (id && request.method === 'DELETE') {
      await deleteLiability(db, user.userId, id);
      return sendJson({ ok: true });
    }
  }

  return sendJson({ error: 'Not found' }, 404);
}

async function handlePantryRoute({ db, request, route, user, env }) {
  const [resource, id, action] = route;

  if (!resource || resource === 'summary') {
    assertMethod(request, 'GET');
    return sendJson(await getPantrySummary(db, user.userId));
  }

  if (resource === 'scan' && request.method === 'POST') {
    const payload = await readJson(request);
    return sendJson(await scanDocument(env, payload));
  }

  if (resource === 'items') {
    if (request.method === 'GET') {
      return sendJson({ items: await listPantryItems(db, user.userId) });
    }

    if (id === 'bulk' && request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ items: await createPantryItemsBulk(db, user.userId, payload.items) }, 201);
    }

    if (id && action === 'consume' && request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ item: await consumePantryItem(db, user.userId, id, payload) });
    }

    if (request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ item: await createPantryItem(db, user.userId, payload) }, 201);
    }

    if (id && request.method === 'PATCH') {
      const payload = await readJson(request);
      return sendJson({ item: await updatePantryItem(db, user.userId, id, payload) });
    }

    if (id && request.method === 'DELETE') {
      await deletePantryItem(db, user.userId, id);
      return sendJson({ ok: true });
    }
  }

  if (resource === 'shopping') {
    if (request.method === 'GET') {
      return sendJson({ shoppingItems: await listShoppingItems(db, user.userId) });
    }

    if (request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ shoppingItem: await createShoppingItem(db, user.userId, payload) }, 201);
    }

    if (id && request.method === 'PATCH') {
      const payload = await readJson(request);
      return sendJson({ shoppingItem: await updateShoppingItem(db, user.userId, id, payload) });
    }

    if (id && request.method === 'DELETE') {
      await updateShoppingItem(db, user.userId, id, { status: 'deleted' });
      return sendJson({ ok: true });
    }
  }

  if (resource === 'recipes' && request.method === 'POST') {
    return sendJson({ recipes: await generatePantryRecipes(db, user.userId) }, 201);
  }

  if (resource === 'meal-plan') {
    if (request.method === 'GET') {
      const mealUrl = new URL(request.url);
      const from = mealUrl.searchParams.get('from') ? normalizeDate(mealUrl.searchParams.get('from')) : addDays(today(), -7);
      const to = mealUrl.searchParams.get('to') ? normalizeDate(mealUrl.searchParams.get('to')) : addDays(today(), 21);
      return sendJson({ entries: await listMealPlan(db, user.userId, from, to) });
    }

    if (id === 'generate' && request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson(await generateMealPlan(db, env, user.userId, payload), 201);
    }

    if (!id && request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ entry: await createMealPlanEntry(db, user.userId, payload) }, 201);
    }

    if (id && request.method === 'PATCH') {
      const payload = await readJson(request);
      return sendJson({ entry: await updateMealPlanEntry(db, user.userId, id, payload) });
    }

    if (id && request.method === 'DELETE') {
      await deleteMealPlanEntry(db, user.userId, id);
      return sendJson({ ok: true });
    }
  }

  return sendJson({ error: 'Not found' }, 404);
}

async function handleCarRoute({ db, request, route, user }) {
  const [resource, id, action] = route;

  if (!resource || resource === 'summary') {
    assertMethod(request, 'GET');
    return sendJson(await getCarSummary(db, user.userId));
  }

  if (resource === 'vehicles') {
    if (request.method === 'GET') {
      return sendJson({ vehicles: await listVehicles(db, user.userId) });
    }

    if (id && action === 'maintenance' && request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ maintenanceItem: await createMaintenanceItem(db, user.userId, id, payload) }, 201);
    }

    if (request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ vehicle: await createVehicle(db, user.userId, payload) }, 201);
    }

    if (id && request.method === 'PATCH') {
      const payload = await readJson(request);
      return sendJson({ vehicle: await updateVehicle(db, user.userId, id, payload) });
    }

    if (id && request.method === 'DELETE') {
      await updateVehicle(db, user.userId, id, { status: 'deleted' });
      return sendJson({ ok: true });
    }
  }

  if (resource === 'maintenance') {
    if (request.method === 'GET') {
      return sendJson({ maintenanceItems: await listMaintenanceItems(db, user.userId) });
    }

    if (id && request.method === 'PATCH') {
      const payload = await readJson(request);
      return sendJson({ maintenanceItem: await updateMaintenanceItem(db, user.userId, id, payload) });
    }

    if (id && request.method === 'DELETE') {
      await updateMaintenanceItem(db, user.userId, id, { status: 'deleted' });
      return sendJson({ ok: true });
    }
  }

  return sendJson({ error: 'Not found' }, 404);
}

async function handleAuthRoute({ db, request, route, env }) {
  const [resource] = route;

  if (resource === 'register' && request.method === 'POST') {
    const payload = await readJson(request);
    const email = normalizeEmail(payload.email);
    const password = String(payload.password || '');

    if (password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters.');
    }

    const existing = await db
      .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1')
      .bind(email)
      .first();

    if (existing) {
      throw new HttpError(409, 'An account already exists for this email.');
    }

    const userId = `user-${crypto.randomUUID()}`;
    const salt = randomToken(16);
    const passwordHash = await hashPassword(password, salt);
    const displayName = payload.displayName || email.split('@')[0];

    // Check registration_open config
    const regConfig = await db.prepare("SELECT value FROM admin_config WHERE key = 'registration_open'").first();
    if (regConfig && regConfig.value === 'false') {
      throw new HttpError(403, 'Registration is currently closed.');
    }

    // First user ever registered becomes the owner
    const userCount = await db.prepare('SELECT COUNT(*) AS cnt FROM users').first();
    const role = (userCount && Number(userCount.cnt) === 0) ? 'owner' : 'user';

    await db
      .prepare('INSERT INTO users (id, email, display_name, role, has_completed_onboarding) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, email, displayName, role, 1)
      .run();

    await db
      .prepare(
        `
        INSERT INTO auth_credentials (user_id, email, password_hash, password_salt)
        VALUES (?, ?, ?, ?)
      `,
      )
      .bind(userId, email, passwordHash, salt)
      .run();

    await ensureUser(db, { userId, email, displayName });

    return createLoginResponse(db, request, { userId, email, displayName, role, hasCompletedOnboarding: true }, env);
  }

  if (resource === 'login' && request.method === 'POST') {
    const payload = await readJson(request);
    const email = normalizeEmail(payload.email);
    const password = String(payload.password || '');
    const row = await db
      .prepare(
        `
        SELECT u.id, u.email, u.display_name, u.role, u.has_completed_onboarding, c.password_hash, c.password_salt
        FROM auth_credentials c
        JOIN users u ON u.id = c.user_id
        WHERE LOWER(c.email) = LOWER(?)
        LIMIT 1
      `,
      )
      .bind(email)
      .first();

    if (!row) {
      throw new HttpError(401, 'Invalid email or password.');
    }

    const passwordHash = await hashPassword(password, row.password_salt);

    if (passwordHash !== row.password_hash) {
      throw new HttpError(401, 'Invalid email or password.');
    }

    if (row.role === 'suspended') {
      throw new HttpError(403, 'Your account has been suspended. Contact the administrator.');
    }

    return createLoginResponse(db, request, {
      userId: row.id,
      email: row.email,
      displayName: row.display_name || row.email.split('@')[0],
      role: row.role || 'user',
      hasCompletedOnboarding: Boolean(row.has_completed_onboarding),
    }, env);
  }

  if (resource === 'me' && request.method === 'GET') {
    const auth = await authenticateRequest(request, db, env, { allowDemo: false });

    if (auth.error) {
      return sendJson({ authenticated: false });
    }

    const userRow = await db
      .prepare('SELECT has_completed_onboarding FROM users WHERE id = ?')
      .bind(auth.userId)
      .first();

    return sendJson({
      authenticated: true,
      user: {
        id: auth.userId,
        email: auth.email,
        displayName: auth.displayName,
        mode: auth.mode,
        role: auth.role || 'user',
        hasCompletedOnboarding: Boolean(userRow?.has_completed_onboarding),
      },
    });
  }

  if (resource === 'logout' && request.method === 'POST') {
    const token = readCookie(request, 'lifeos_session');

    if (token) {
      await db
        .prepare('DELETE FROM auth_sessions WHERE session_hash = ?')
        .bind(await sha256Base64Url(token))
        .run();
    }

    return sendJson({ ok: true }, 200, {
      'set-cookie': expiredSessionCookie(request),
    });
  }

  return sendJson({ error: 'Not found' }, 404);
}

async function ensureUser(db, user) {
  await db
    .prepare(
      `
      INSERT OR IGNORE INTO users (id, email, display_name)
      VALUES (?, ?, ?)
    `,
    )
    .bind(user.userId, user.email, user.displayName)
    .run();

  await db
    .prepare(
      `
      INSERT OR IGNORE INTO finance_profiles (
        user_id,
        currency,
        secondary_currency,
        enabled_currencies_json,
        date_format,
        month_start_day,
        dashboard_widgets_json
      )
      VALUES (?, 'USD', 'INR', '["USD","INR"]', 'YYYY-MM-DD', 1, '["cash_flow","budgets","goals","insights","recent_transactions"]')
    `,
    )
    .bind(user.userId)
    .run();

  await db
    .prepare(
      `
      INSERT OR IGNORE INTO finance_accounts (id, user_id, name, type, currency, opening_balance_minor, current_balance_minor)
      VALUES (?, ?, 'USD Wallet', 'wallet', 'USD', 0, 0)
    `,
    )
    .bind(`acct-${user.userId}-usd`, user.userId)
    .run();

  await db
    .prepare(
      `
      INSERT OR IGNORE INTO finance_accounts (id, user_id, name, type, currency, opening_balance_minor, current_balance_minor)
      VALUES (?, ?, 'INR Wallet', 'wallet', 'INR', 0, 0)
    `,
    )
    .bind(`acct-${user.userId}-inr`, user.userId)
    .run();

  for (const category of defaultIncomeCategories) {
    await ensureCategory(db, user.userId, category, 'income');
  }

  for (const category of defaultExpenseCategories) {
    await ensureCategory(db, user.userId, category, 'expense');
  }

  await ensureCategory(db, user.userId, ['cat-transfer', 'Transfer', '#0058be', 'Repeat2', 10], 'transfer');
}

async function ensureCategory(db, userId, category, type) {
  const [id, name, color, icon, sortOrder] = category;

  await db
    .prepare(
      `
      INSERT OR IGNORE INTO finance_categories
        (id, user_id, name, type, color, icon, sort_order, is_system)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `,
    )
    .bind(idForUser(id, userId), userId, name, type, color, icon, sortOrder)
    .run();
}

async function getFinanceSummary(db, userId, url) {
  const asOf = url.searchParams.get('asOf') || today();
  const { start, nextStart, previousStart } = monthBounds(asOf);
  const profile = await getProfile(db, userId);
  const selectedCurrency = normalizeCurrency(url.searchParams.get('currency') || profile.currency);
  const cashflow = await monthlyCashflow(db, userId, start, nextStart, selectedCurrency);
  const previousCashflow = await monthlyCashflow(db, userId, previousStart, start, selectedCurrency);
  const balance = await accountBalance(db, userId, selectedCurrency);
  const budgets = await listBudgets(db, userId, url, selectedCurrency);
  const goals = await listGoals(db, userId, selectedCurrency);
  const insights = await listInsights(db, userId);
  const habits = await listHabits(db, userId);
  const notifications = await listNotifications(db, userId);
  const categories = await listCategories(db, userId);
  const recentTransactions = await listTransactions(db, userId, url, 6);
  const categorySpend = await spendingByCategory(db, userId, start, nextStart, selectedCurrency);

  const netCashflowMinor = cashflow.incomeMinor - cashflow.expenseMinor;
  const savingsRate = cashflow.incomeMinor > 0
    ? Math.round((netCashflowMinor / cashflow.incomeMinor) * 1000) / 10
    : 0;

  return {
    profile,
    summary: {
      currency: selectedCurrency,
      monthStart: start,
      monthEnd: addDays(nextStart, -1),
      balanceMinor: balance.balanceMinor,
      incomeMinor: cashflow.incomeMinor,
      expenseMinor: cashflow.expenseMinor,
      refundMinor: cashflow.refundMinor,
      netCashflowMinor,
      savingsRate,
      previousIncomeMinor: previousCashflow.incomeMinor,
      previousExpenseMinor: previousCashflow.expenseMinor,
      transactionCount: cashflow.transactionCount,
      budgetUsagePercent: budgetUsagePercent(budgets),
    },
    categorySpend,
    budgets,
    goals,
    insights,
    habits,
    notifications,
    categories,
    recentTransactions,
  };
}

async function getProfile(db, userId) {
  const row = await db
    .prepare(
      `
      SELECT
        user_id,
        currency,
        secondary_currency,
        enabled_currencies_json,
        date_format,
        month_start_day,
        dashboard_widgets_json
      FROM finance_profiles
      WHERE user_id = ?
    `,
    )
    .bind(userId)
    .first();

  return {
    userId,
    currency: row?.currency || 'USD',
    secondaryCurrency: row?.secondary_currency || 'INR',
    enabledCurrencies: parseJson(row?.enabled_currencies_json, ['USD', 'INR']),
    dateFormat: row?.date_format || 'YYYY-MM-DD',
    monthStartDay: row?.month_start_day || 1,
    dashboardWidgets: parseJson(row?.dashboard_widgets_json, []),
  };
}

async function monthlyCashflow(db, userId, start, nextStart, currency) {
  const row = await db
    .prepare(
      `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_minor ELSE 0 END), 0) AS income_minor,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_minor ELSE 0 END), 0) AS expense_minor,
        COALESCE(SUM(CASE WHEN type = 'refund' THEN amount_minor ELSE 0 END), 0) AS refund_minor,
        COUNT(*) AS transaction_count
      FROM finance_transactions
      WHERE user_id = ?
        AND status != 'deleted'
        AND occurred_on >= ?
        AND occurred_on < ?
        AND currency = ?
    `,
    )
    .bind(userId, start, nextStart, currency)
    .first();

  return {
    incomeMinor: Number(row?.income_minor || 0),
    expenseMinor: Math.max(0, Number(row?.expense_minor || 0) - Number(row?.refund_minor || 0)),
    refundMinor: Number(row?.refund_minor || 0),
    transactionCount: Number(row?.transaction_count || 0),
  };
}

async function accountBalance(db, userId, currency) {
  const row = await db
    .prepare(
      `
      SELECT COALESCE(SUM(current_balance_minor), 0) AS balance_minor
      FROM finance_accounts
      WHERE user_id = ? AND currency = ? AND is_archived = 0
    `,
    )
    .bind(userId, currency)
    .first();

  return { balanceMinor: Number(row?.balance_minor || 0) };
}

async function listTransactions(db, userId, url, defaultLimit = 50) {
  const filters = transactionFilters(url, defaultLimit);
  const where = ['t.user_id = ?', "t.status != 'deleted'"];
  const values = [userId];

  if (filters.type) {
    where.push('t.type = ?');
    values.push(filters.type);
  }

  if (filters.currency) {
    where.push('t.currency = ?');
    values.push(filters.currency);
  }

  if (filters.categoryId) {
    where.push('t.category_id = ?');
    values.push(filters.categoryId);
  }

  if (filters.startDate) {
    where.push('t.occurred_on >= ?');
    values.push(filters.startDate);
  }

  if (filters.endDate) {
    where.push('t.occurred_on <= ?');
    values.push(filters.endDate);
  }

  if (filters.search) {
    where.push(
      `(LOWER(t.merchant) LIKE ? OR LOWER(t.payee) LIKE ? OR LOWER(t.notes) LIKE ? OR LOWER(t.tags_json) LIKE ? OR LOWER(c.name) LIKE ?)`,
    );
    values.push(filters.search, filters.search, filters.search, filters.search, filters.search);
  }

  if (filters.minAmountMinor !== null) {
    where.push('t.amount_minor >= ?');
    values.push(filters.minAmountMinor);
  }

  if (filters.maxAmountMinor !== null) {
    where.push('t.amount_minor <= ?');
    values.push(filters.maxAmountMinor);
  }

  const result = await db
    .prepare(
      `
      SELECT
        t.*,
        c.name AS category_name,
        c.color AS category_color,
        a.name AS account_name,
        r.file_name AS receipt_file_name
      FROM finance_transactions t
      LEFT JOIN finance_categories c ON c.id = t.category_id
      LEFT JOIN finance_accounts a ON a.id = t.account_id
      LEFT JOIN finance_receipts r ON r.id = t.receipt_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.occurred_on DESC, t.created_at DESC
      LIMIT ?
    `,
    )
    .bind(...values, filters.limit)
    .all();

  return (result.results || []).map(mapTransaction);
}

async function createTransaction(db, userId, payload) {
  const id = payload.id || crypto.randomUUID();
  const type = normalizeTransactionType(payload.type);
  const amountMinor = normalizeMoney(payload.amountMinor, payload.amount);
  const currency = normalizeCurrency(payload.currency || 'USD');
  const occurredOn = normalizeDate(payload.occurredOn || payload.date || today());
  const categoryId = await resolveCategoryId(db, userId, type, payload.categoryId, payload.category);
  const accountId = payload.accountId || (await defaultAccountId(db, userId, currency));
  const receiptId = payload.receiptId || null;

  await db
    .prepare(
      `
      INSERT INTO finance_transactions (
        id,
        user_id,
        account_id,
        category_id,
        receipt_id,
        type,
        status,
        occurred_on,
        amount_minor,
        currency,
        merchant,
        payee,
        payment_method,
        notes,
        tags_json,
        source,
        ai_category_confidence
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      id,
      userId,
      accountId,
      categoryId,
      receiptId,
      type,
      payload.status || 'posted',
      occurredOn,
      amountMinor,
      currency,
      payload.merchant || payload.payee || null,
      payload.payee || payload.merchant || null,
      payload.paymentMethod || null,
      payload.notes || null,
      JSON.stringify(payload.tags || []),
      payload.source || 'manual',
      payload.aiCategoryConfidence ?? null,
    )
    .run();

  await applyAccountDelta(db, accountId, accountDelta(type, amountMinor));

  return getTransaction(db, userId, id);
}

async function updateTransaction(db, userId, id, payload) {
  const existing = await getTransaction(db, userId, id);

  if (!existing) {
    throw new HttpError(404, 'Transaction not found');
  }

  const allowed = {
    type: payload.type ? normalizeTransactionType(payload.type) : undefined,
    occurred_on: payload.occurredOn || payload.date ? normalizeDate(payload.occurredOn || payload.date) : undefined,
    amount_minor: payload.amountMinor !== undefined || payload.amount !== undefined
      ? normalizeMoney(payload.amountMinor, payload.amount)
      : undefined,
    category_id: payload.categoryId,
    merchant: payload.merchant,
    payee: payload.payee,
    payment_method: payload.paymentMethod,
    notes: payload.notes,
    tags_json: payload.tags ? JSON.stringify(payload.tags) : undefined,
    status: payload.status,
  };

  if (!allowed.category_id && payload.category) {
    allowed.category_id = await resolveCategoryId(db, userId, allowed.type || existing.type, null, payload.category);
  }

  const updates = Object.entries(allowed).filter(([, value]) => value !== undefined);

  if (updates.length === 0) {
    return existing;
  }

  const assignments = updates.map(([key]) => `${key} = ?`);
  const values = updates.map(([, value]) => value);

  await db
    .prepare(
      `
      UPDATE finance_transactions
      SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
    )
    .bind(...values, id, userId)
    .run();

  const updated = await getTransaction(db, userId, id);

  await applyAccountDelta(db, existing.accountId, -accountDelta(existing.type, existing.amountMinor));
  await applyAccountDelta(db, updated.accountId, accountDelta(updated.type, updated.amountMinor));

  return updated;
}

async function softDeleteTransaction(db, userId, id) {
  const existing = await getTransaction(db, userId, id);

  await db
    .prepare(
      `
      UPDATE finance_transactions
      SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
    )
    .bind(id, userId)
    .run();

  if (existing) {
    await applyAccountDelta(db, existing.accountId, -accountDelta(existing.type, existing.amountMinor));
  }
}

async function getTransaction(db, userId, id) {
  const row = await db
    .prepare(
      `
      SELECT
        t.*,
        c.name AS category_name,
        c.color AS category_color,
        a.name AS account_name,
        r.file_name AS receipt_file_name
      FROM finance_transactions t
      LEFT JOIN finance_categories c ON c.id = t.category_id
      LEFT JOIN finance_accounts a ON a.id = t.account_id
      LEFT JOIN finance_receipts r ON r.id = t.receipt_id
      WHERE t.id = ? AND t.user_id = ? AND t.status != 'deleted'
    `,
    )
    .bind(id, userId)
    .first();

  return row ? mapTransaction(row) : null;
}

async function listCategories(db, userId) {
  const result = await db
    .prepare(
      `
      SELECT id, name, parent_id, type, color, icon, sort_order, is_system, is_archived
      FROM finance_categories
      WHERE user_id = ? AND is_archived = 0
      ORDER BY type, sort_order, name
    `,
    )
    .bind(userId)
    .all();

  return (result.results || []).map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    type: row.type,
    color: row.color,
    icon: row.icon,
    sortOrder: Number(row.sort_order || 0),
    isSystem: Boolean(row.is_system),
  }));
}

async function listBudgets(db, userId, url, selectedCurrency) {
  const asOf = url.searchParams.get('asOf') || today();
  const currency = normalizeCurrency(selectedCurrency || url.searchParams.get('currency') || 'USD');
  const { start, nextStart } = monthBounds(asOf);

  const result = await db
    .prepare(
      `
      SELECT
        b.*,
        c.name AS category_name,
        c.color AS category_color,
        COALESCE((
          SELECT SUM(CASE WHEN t.type = 'refund' THEN -t.amount_minor ELSE t.amount_minor END)
          FROM finance_transactions t
          WHERE t.user_id = b.user_id
            AND t.status != 'deleted'
            AND t.type IN ('expense', 'refund')
            AND t.currency = b.currency
            AND (b.category_id IS NULL OR t.category_id = b.category_id)
            AND t.occurred_on BETWEEN b.period_start AND b.period_end
        ), 0) AS spent_minor
      FROM finance_budgets b
      LEFT JOIN finance_categories c ON c.id = b.category_id
      WHERE b.user_id = ?
        AND b.currency = ?
        AND b.period_start < ?
        AND b.period_end >= ?
      ORDER BY b.period_start DESC, b.name
    `,
    )
    .bind(userId, currency, nextStart, start)
    .all();

  return (result.results || []).map((row) => mapBudget(row, asOf));
}

async function createBudget(db, userId, payload) {
  const id = payload.id || crypto.randomUUID();
  const { start, nextStart } = monthBounds(today());
  const categoryId = payload.categoryId
    || (payload.category ? await resolveCategoryId(db, userId, 'expense', null, payload.category) : null);

  await db
    .prepare(
      `
      INSERT INTO finance_budgets (
        id,
        user_id,
        category_id,
        name,
        period,
        period_start,
        period_end,
        currency,
        limit_minor,
        carry_forward_minor,
        alert_threshold_percent,
        is_flexible
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      id,
      userId,
      categoryId,
      payload.name || 'New budget',
      payload.period || 'monthly',
      normalizeDate(payload.periodStart || start),
      normalizeDate(payload.periodEnd || addDays(nextStart, -1)),
      normalizeCurrency(payload.currency || 'USD'),
      normalizeMoney(payload.limitMinor, payload.limit),
      normalizeMoney(payload.carryForwardMinor, payload.carryForward ?? 0),
      payload.alertThresholdPercent || 80,
      payload.isFlexible ? 1 : 0,
    )
    .run();

  return getBudget(db, userId, id);
}

async function updateBudget(db, userId, id, payload) {
  const existing = await db
    .prepare('SELECT * FROM finance_budgets WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();

  if (!existing) {
    throw new HttpError(404, 'Budget not found');
  }

  const categoryId = payload.categoryId !== undefined
    ? payload.categoryId || null
    : (payload.category ? await resolveCategoryId(db, userId, 'expense', null, payload.category) : undefined);

  const allowed = {
    name: payload.name,
    category_id: categoryId,
    period: payload.period,
    period_start: payload.periodStart ? normalizeDate(payload.periodStart) : undefined,
    period_end: payload.periodEnd ? normalizeDate(payload.periodEnd) : undefined,
    limit_minor: payload.limitMinor !== undefined || payload.limit !== undefined
      ? normalizeMoney(payload.limitMinor, payload.limit)
      : undefined,
    carry_forward_minor: payload.carryForwardMinor !== undefined || payload.carryForward !== undefined
      ? normalizeMoney(payload.carryForwardMinor, payload.carryForward)
      : undefined,
    alert_threshold_percent: payload.alertThresholdPercent,
    is_flexible: payload.isFlexible === undefined ? undefined : (payload.isFlexible ? 1 : 0),
  };

  const updates = Object.entries(allowed).filter(([, value]) => value !== undefined);

  if (updates.length) {
    await db
      .prepare(
        `
        UPDATE finance_budgets
        SET ${updates.map(([key]) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `,
      )
      .bind(...updates.map(([, value]) => value), id, userId)
      .run();
  }

  return getBudget(db, userId, id);
}

async function deleteBudget(db, userId, id) {
  const result = await db
    .prepare('DELETE FROM finance_budgets WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  if (result.meta && result.meta.changes === 0) {
    throw new HttpError(404, 'Budget not found');
  }
}

/**
 * Fetch one budget with its spend rolled up. Deliberately does NOT go through
 * listBudgets — that filters to periods overlapping the current month, so a
 * budget with a custom period would come back null right after being saved.
 */
async function getBudget(db, userId, id) {
  const row = await db
    .prepare(
      `
      SELECT
        b.*,
        c.name AS category_name,
        c.color AS category_color,
        COALESCE((
          SELECT SUM(CASE WHEN t.type = 'refund' THEN -t.amount_minor ELSE t.amount_minor END)
          FROM finance_transactions t
          WHERE t.user_id = b.user_id
            AND t.status != 'deleted'
            AND t.type IN ('expense', 'refund')
            AND t.currency = b.currency
            AND (b.category_id IS NULL OR t.category_id = b.category_id)
            AND t.occurred_on BETWEEN b.period_start AND b.period_end
        ), 0) AS spent_minor
      FROM finance_budgets b
      LEFT JOIN finance_categories c ON c.id = b.category_id
      WHERE b.id = ? AND b.user_id = ?
    `,
    )
    .bind(id, userId)
    .first();

  return row ? mapBudget(row) : null;
}

async function listGoals(db, userId, selectedCurrency) {
  const currency = selectedCurrency ? normalizeCurrency(selectedCurrency) : null;
  const where = ['user_id = ?', "status != 'archived'"];
  const values = [userId];

  if (currency) {
    where.push('currency = ?');
    values.push(currency);
  }

  const result = await db
    .prepare(
      `
      SELECT *
      FROM finance_goals
      WHERE ${where.join(' AND ')}
      ORDER BY priority ASC, target_date ASC
    `,
    )
    .bind(...values)
    .all();

  const asOf = today();
  return (result.results || []).map((row) => mapGoal(row, asOf));
}

async function createGoal(db, userId, payload) {
  const id = payload.id || crypto.randomUUID();

  await db
    .prepare(
      `
      INSERT INTO finance_goals (
        id,
        user_id,
        name,
        goal_type,
        target_amount_minor,
        saved_amount_minor,
        currency,
        target_date,
        priority,
        recommendation
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      id,
      userId,
      payload.name || 'New goal',
      payload.goalType || 'custom',
      normalizeMoney(payload.targetAmountMinor, payload.targetAmount),
      normalizeMoney(payload.savedAmountMinor, payload.savedAmount ?? 0),
      normalizeCurrency(payload.currency || 'USD'),
      payload.targetDate ? normalizeDate(payload.targetDate) : null,
      payload.priority || 3,
      payload.recommendation || null,
    )
    .run();

  const row = await db
    .prepare('SELECT * FROM finance_goals WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();

  return row ? mapGoal(row) : null;
}

async function updateGoal(db, userId, id, payload) {
  const allowed = {
    name: payload.name,
    goal_type: payload.goalType,
    target_amount_minor: payload.targetAmountMinor !== undefined || payload.targetAmount !== undefined
      ? normalizeMoney(payload.targetAmountMinor, payload.targetAmount)
      : undefined,
    saved_amount_minor: payload.savedAmountMinor !== undefined || payload.savedAmount !== undefined
      ? normalizeMoney(payload.savedAmountMinor, payload.savedAmount)
      : undefined,
    target_date: payload.targetDate ? normalizeDate(payload.targetDate) : undefined,
    priority: payload.priority,
    status: payload.status,
    recommendation: payload.recommendation,
  };
  const updates = Object.entries(allowed).filter(([, value]) => value !== undefined);

  if (updates.length) {
    await db
      .prepare(
        `
        UPDATE finance_goals
        SET ${updates.map(([key]) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `,
      )
      .bind(...updates.map(([, value]) => value), id, userId)
      .run();
  }

  // Read the row back directly — listGoals hides archived goals, so archiving
  // one through this endpoint would otherwise return undefined.
  const row = await db
    .prepare('SELECT * FROM finance_goals WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();

  if (!row) {
    throw new HttpError(404, 'Goal not found');
  }

  return mapGoal(row);
}

async function deleteGoal(db, userId, id) {
  const result = await db
    .prepare('DELETE FROM finance_goals WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  if (result.meta && result.meta.changes === 0) {
    throw new HttpError(404, 'Goal not found');
  }
}

/**
 * Move money into (or, with a negative amount, back out of) a goal.
 * Reads and writes in one statement so two quick taps can't both read the same
 * starting balance and lose one of the contributions.
 */
async function contributeToGoal(db, userId, id, payload) {
  const existing = await db
    .prepare('SELECT * FROM finance_goals WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();

  if (!existing) {
    throw new HttpError(404, 'Goal not found');
  }

  const rawAmount = payload.amountMinor !== undefined && payload.amountMinor !== null && payload.amountMinor !== ''
    ? normalizeAmount(payload.amountMinor, true)
    : normalizeAmount(payload.amount, false);

  if (!rawAmount) {
    throw new HttpError(400, 'Enter an amount to add.');
  }

  const direction = payload.direction === 'withdraw' ? -1 : 1;
  const delta = rawAmount * direction;
  const target = Number(existing.target_amount_minor || 0);

  await db
    .prepare(
      `
      UPDATE finance_goals
      SET saved_amount_minor = MAX(0, MIN(?, saved_amount_minor + ?)),
          status = CASE
            WHEN MAX(0, MIN(?, saved_amount_minor + ?)) >= ? AND ? > 0 THEN 'completed'
            WHEN status = 'completed' THEN 'active'
            ELSE status
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
    )
    .bind(target, delta, target, delta, target, target, id, userId)
    .run();

  const row = await db
    .prepare('SELECT * FROM finance_goals WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first();

  return row ? mapGoal(row) : null;
}

async function listInsights(db, userId) {
  const result = await db
    .prepare(
      `
      SELECT *
      FROM finance_ai_insights
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `,
    )
    .bind(userId)
    .all();

  return (result.results || []).map((row) => ({
    id: row.id,
    type: row.insight_type,
    title: row.title,
    body: row.body,
    severity: row.severity,
    actionLabel: row.action_label,
    actionUrl: row.action_url,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  }));
}

async function listHabits(db, userId) {
  const result = await db
    .prepare(
      `
      SELECT *
      FROM finance_habits
      WHERE user_id = ? AND status = 'active'
      ORDER BY habit_type, name
    `,
    )
    .bind(userId)
    .all();

  return (result.results || []).map((row) => ({
    id: row.id,
    type: row.habit_type,
    name: row.name,
    currentStreak: Number(row.current_streak || 0),
    bestStreak: Number(row.best_streak || 0),
    lastCompletedOn: row.last_completed_on,
    cadence: row.cadence,
  }));
}

async function listNotifications(db, userId) {
  const result = await db
    .prepare(
      `
      SELECT *
      FROM finance_notifications
      WHERE user_id = ? AND status = 'pending'
      ORDER BY due_at ASC
      LIMIT 8
    `,
    )
    .bind(userId)
    .all();

  return (result.results || []).map((row) => ({
    id: row.id,
    type: row.notification_type,
    title: row.title,
    body: row.body,
    dueAt: row.due_at,
    channel: row.channel,
    status: row.status,
  }));
}

async function spendingByCategory(db, userId, start, nextStart, currency) {
  const result = await db
    .prepare(
      `
      SELECT
        c.id,
        c.name,
        c.color,
        COALESCE(SUM(CASE WHEN t.type = 'refund' THEN -t.amount_minor ELSE t.amount_minor END), 0) AS amount_minor,
        COUNT(t.id) AS transaction_count
      FROM finance_transactions t
      LEFT JOIN finance_categories c ON c.id = t.category_id
      WHERE t.user_id = ?
        AND t.status != 'deleted'
        AND t.type IN ('expense', 'refund')
        AND t.occurred_on >= ?
        AND t.occurred_on < ?
        AND t.currency = ?
      GROUP BY c.id, c.name, c.color
      ORDER BY amount_minor DESC
      LIMIT 8
    `,
    )
    .bind(userId, start, nextStart, currency)
    .all();

  return (result.results || []).map((row) => ({
    id: row.id,
    name: row.name || 'Uncategorized',
    color: row.color || '#64748B',
    amountMinor: Number(row.amount_minor || 0),
    transactionCount: Number(row.transaction_count || 0),
  }));
}

// ---------------------------------------------------------------------------
// Spending analytics — trend, movers, merchants, pace and recurring detection.
// Everything is derived from finance_transactions so it needs no new tables.
// ---------------------------------------------------------------------------

const TREND_MONTHS = 6;

async function getFinanceAnalytics(db, userId, url) {
  const asOf = url.searchParams.get('asOf') || today();
  const currency = normalizeCurrency(url.searchParams.get('currency') || 'USD');
  const { start, nextStart, previousStart } = monthBounds(asOf);

  const [trend, current, previous, topMerchants, largest, weekday, recurring, incomeBreakdown] = await Promise.all([
    monthlyTrend(db, userId, currency, asOf),
    spendingByCategory(db, userId, start, nextStart, currency),
    spendingByCategory(db, userId, previousStart, start, currency),
    topMerchantsFor(db, userId, start, nextStart, currency),
    largestExpenses(db, userId, start, nextStart, currency),
    weekdaySplit(db, userId, start, nextStart, currency),
    detectRecurring(db, userId, currency, asOf),
    incomeByCategory(db, userId, start, nextStart, currency),
  ]);

  return {
    currency,
    monthStart: start,
    monthEnd: addDays(nextStart, -1),
    trend,
    categoryDeltas: buildCategoryDeltas(current, previous),
    topMerchants,
    largest,
    weekday,
    recurring,
    incomeBreakdown,
    pace: spendingPace(trend, asOf, start, nextStart),
  };
}

/**
 * Split income into what the user actually earns (salary, freelance) and
 * everything else — repayments, gifts and the credits picked up from imported
 * statements. Lumping them together makes earnings look bigger than they are.
 */
async function incomeByCategory(db, userId, start, nextStart, currency) {
  const result = await db
    .prepare(
      `
      SELECT
        COALESCE(c.name, 'Uncategorized') AS name,
        COALESCE(c.color, '#94A3B8') AS color,
        SUM(t.amount_minor) AS amount_minor,
        COUNT(t.id) AS transaction_count
      FROM finance_transactions t
      LEFT JOIN finance_categories c ON c.id = t.category_id
      WHERE t.user_id = ?
        AND t.status != 'deleted'
        AND t.type = 'income'
        AND t.occurred_on >= ?
        AND t.occurred_on < ?
        AND t.currency = ?
      GROUP BY c.id, c.name, c.color
      ORDER BY amount_minor DESC
    `,
    )
    .bind(userId, start, nextStart, currency)
    .all();

  const byCategory = (result.results || []).map((row) => ({
    name: row.name,
    color: row.color,
    amountMinor: Number(row.amount_minor || 0),
    transactionCount: Number(row.transaction_count || 0),
    isPrimary: PRIMARY_INCOME_CATEGORY_NAMES.includes(row.name),
  }));

  const primaryMinor = byCategory
    .filter((row) => row.isPrimary)
    .reduce((sum, row) => sum + row.amountMinor, 0);
  const otherMinor = byCategory
    .filter((row) => !row.isPrimary)
    .reduce((sum, row) => sum + row.amountMinor, 0);

  return {
    primaryMinor,
    otherMinor,
    totalMinor: primaryMinor + otherMinor,
    byCategory,
  };
}

/** Income/expense per month for the trailing TREND_MONTHS window, oldest first. */
async function monthlyTrend(db, userId, currency, asOf) {
  const months = [];
  let cursor = monthBounds(asOf).start;

  for (let i = 0; i < TREND_MONTHS; i += 1) {
    months.unshift(cursor);
    cursor = monthBounds(addDays(cursor, -1)).start;
  }

  const windowStart = months[0];
  const windowEnd = monthBounds(asOf).nextStart;

  const result = await db
    .prepare(
      `
      SELECT
        substr(occurred_on, 1, 7) AS month,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_minor ELSE 0 END), 0) AS income_minor,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_minor ELSE 0 END), 0) AS expense_minor,
        COALESCE(SUM(CASE WHEN type = 'refund' THEN amount_minor ELSE 0 END), 0) AS refund_minor,
        COUNT(*) AS transaction_count
      FROM finance_transactions
      WHERE user_id = ?
        AND status != 'deleted'
        AND currency = ?
        AND occurred_on >= ?
        AND occurred_on < ?
      GROUP BY month
    `,
    )
    .bind(userId, currency, windowStart, windowEnd)
    .all();

  const byMonth = new Map((result.results || []).map((row) => [row.month, row]));

  return months.map((monthStart) => {
    const key = monthStart.slice(0, 7);
    const row = byMonth.get(key);
    const incomeMinor = Number(row?.income_minor || 0);
    const expenseMinor = Math.max(0, Number(row?.expense_minor || 0) - Number(row?.refund_minor || 0));

    return {
      month: key,
      monthStart,
      incomeMinor,
      expenseMinor,
      netMinor: incomeMinor - expenseMinor,
      transactionCount: Number(row?.transaction_count || 0),
    };
  });
}

/** Category spend this month vs last, sorted by the size of the swing. */
function buildCategoryDeltas(current, previous) {
  const previousByName = new Map(previous.map((row) => [row.name, row.amountMinor]));
  const names = new Set([...current.map((row) => row.name), ...previous.map((row) => row.name)]);

  return [...names]
    .map((name) => {
      const currentRow = current.find((row) => row.name === name);
      const previousRow = previous.find((row) => row.name === name);
      const currentMinor = currentRow?.amountMinor || 0;
      const previousMinor = previousByName.get(name) || 0;
      const deltaMinor = currentMinor - previousMinor;

      return {
        id: currentRow?.id || previousRow?.id || name,
        name,
        color: currentRow?.color || previousRow?.color || '#64748B',
        currentMinor,
        previousMinor,
        deltaMinor,
        // Percent is meaningless against a zero base — the UI shows "new" instead.
        deltaPercent: previousMinor > 0 ? Math.round((deltaMinor / previousMinor) * 100) : null,
        transactionCount: currentRow?.transactionCount || 0,
      };
    })
    .filter((row) => row.currentMinor > 0 || row.previousMinor > 0)
    .sort((a, b) => Math.abs(b.deltaMinor) - Math.abs(a.deltaMinor));
}

async function topMerchantsFor(db, userId, start, nextStart, currency) {
  const result = await db
    .prepare(
      `
      SELECT
        COALESCE(NULLIF(TRIM(merchant), ''), NULLIF(TRIM(payee), ''), 'Unknown') AS name,
        SUM(amount_minor) AS amount_minor,
        COUNT(*) AS transaction_count
      FROM finance_transactions
      WHERE user_id = ?
        AND status != 'deleted'
        AND type = 'expense'
        AND occurred_on >= ?
        AND occurred_on < ?
        AND currency = ?
      GROUP BY LOWER(name)
      ORDER BY amount_minor DESC
      LIMIT 8
    `,
    )
    .bind(userId, start, nextStart, currency)
    .all();

  return (result.results || []).map((row) => ({
    name: row.name,
    amountMinor: Number(row.amount_minor || 0),
    transactionCount: Number(row.transaction_count || 0),
  }));
}

async function largestExpenses(db, userId, start, nextStart, currency) {
  const result = await db
    .prepare(
      `
      SELECT t.id, t.occurred_on, t.amount_minor, t.merchant, t.payee, c.name AS category_name
      FROM finance_transactions t
      LEFT JOIN finance_categories c ON c.id = t.category_id
      WHERE t.user_id = ?
        AND t.status != 'deleted'
        AND t.type = 'expense'
        AND t.occurred_on >= ?
        AND t.occurred_on < ?
        AND t.currency = ?
      ORDER BY t.amount_minor DESC
      LIMIT 5
    `,
    )
    .bind(userId, start, nextStart, currency)
    .all();

  return (result.results || []).map((row) => ({
    id: row.id,
    occurredOn: row.occurred_on,
    amountMinor: Number(row.amount_minor || 0),
    merchant: row.merchant || row.payee || 'Transaction',
    categoryName: row.category_name || 'Uncategorized',
  }));
}

/** SQLite strftime('%w'): 0 = Sunday, 6 = Saturday. */
async function weekdaySplit(db, userId, start, nextStart, currency) {
  const result = await db
    .prepare(
      `
      SELECT
        COALESCE(SUM(CASE WHEN CAST(strftime('%w', occurred_on) AS INTEGER) IN (0, 6) THEN amount_minor ELSE 0 END), 0) AS weekend_minor,
        COALESCE(SUM(CASE WHEN CAST(strftime('%w', occurred_on) AS INTEGER) BETWEEN 1 AND 5 THEN amount_minor ELSE 0 END), 0) AS weekday_minor
      FROM finance_transactions
      WHERE user_id = ?
        AND status != 'deleted'
        AND type = 'expense'
        AND occurred_on >= ?
        AND occurred_on < ?
        AND currency = ?
    `,
    )
    .bind(userId, start, nextStart, currency)
    .first();

  return {
    weekdayMinor: Number(result?.weekday_minor || 0),
    weekendMinor: Number(result?.weekend_minor || 0),
  };
}

/**
 * Flag merchants billing a near-constant amount on a regular cadence over the
 * trailing 4 months — the charges people forget they signed up for.
 */
async function detectRecurring(db, userId, currency, asOf) {
  const { nextStart } = monthBounds(asOf);
  let windowStart = monthBounds(asOf).start;
  for (let i = 0; i < 3; i += 1) {
    windowStart = monthBounds(addDays(windowStart, -1)).start;
  }

  const result = await db
    .prepare(
      `
      SELECT
        COALESCE(NULLIF(TRIM(merchant), ''), NULLIF(TRIM(payee), '')) AS name,
        amount_minor,
        occurred_on
      FROM finance_transactions
      WHERE user_id = ?
        AND status != 'deleted'
        AND type = 'expense'
        AND occurred_on >= ?
        AND occurred_on < ?
        AND currency = ?
        AND COALESCE(NULLIF(TRIM(merchant), ''), NULLIF(TRIM(payee), '')) IS NOT NULL
      ORDER BY occurred_on ASC
    `,
    )
    .bind(userId, windowStart, nextStart, currency)
    .all();

  const groups = new Map();
  for (const row of result.results || []) {
    const key = String(row.name).toLowerCase();
    if (!groups.has(key)) groups.set(key, { name: row.name, entries: [] });
    groups.get(key).entries.push({
      amountMinor: Number(row.amount_minor || 0),
      occurredOn: row.occurred_on,
    });
  }

  const recurring = [];

  for (const group of groups.values()) {
    if (group.entries.length < 3) continue;

    const amounts = group.entries.map((entry) => entry.amountMinor);
    const average = amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
    if (average <= 0) continue;

    // Charges must be within 15% of the average to count as "the same" bill.
    const isStable = amounts.every((value) => Math.abs(value - average) / average <= 0.15);
    if (!isStable) continue;

    const gaps = [];
    for (let i = 1; i < group.entries.length; i += 1) {
      gaps.push(daysBetweenDates(group.entries[i - 1].occurredOn, group.entries[i].occurredOn));
    }
    const averageGap = gaps.reduce((sum, value) => sum + value, 0) / gaps.length;
    const cadence = classifyCadence(averageGap);
    if (!cadence) continue;

    const last = group.entries[group.entries.length - 1];
    recurring.push({
      name: group.name,
      amountMinor: Math.round(average),
      cadence,
      occurrences: group.entries.length,
      lastSeen: last.occurredOn,
      nextExpected: addDays(last.occurredOn, Math.round(averageGap)),
      monthlyEquivalentMinor: Math.round(average * (30.44 / Math.max(averageGap, 1))),
    });
  }

  return recurring.sort((a, b) => b.monthlyEquivalentMinor - a.monthlyEquivalentMinor).slice(0, 8);
}

function classifyCadence(averageGap) {
  if (averageGap >= 5 && averageGap <= 9) return 'weekly';
  if (averageGap >= 12 && averageGap <= 18) return 'fortnightly';
  if (averageGap >= 26 && averageGap <= 35) return 'monthly';
  if (averageGap >= 85 && averageGap <= 95) return 'quarterly';
  return null;
}

function daysBetweenDates(from, to) {
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

/** Burn rate so far and a straight-line projection to month end. */
function spendingPace(trend, asOf, start, nextStart) {
  const currentMonth = trend[trend.length - 1] || { expenseMinor: 0 };
  const previousMonth = trend[trend.length - 2] || { expenseMinor: 0 };
  const daysInMonth = daysBetweenDates(start, nextStart);
  const elapsed = Math.min(Math.max(daysBetweenDates(start, asOf) + 1, 1), daysInMonth);
  const dailyBurnMinor = Math.round(currentMonth.expenseMinor / elapsed);

  // Averaging the trailing window gives a steadier bar than last month alone.
  const history = trend.slice(0, -1).filter((month) => month.expenseMinor > 0);
  const averageExpenseMinor = history.length
    ? Math.round(history.reduce((sum, month) => sum + month.expenseMinor, 0) / history.length)
    : 0;

  // Extrapolating from one or two days turns a single rent payment into an
  // absurd month-end figure, so the projection only unlocks once there's a
  // meaningful sample.
  const MIN_DAYS_FOR_PROJECTION = 5;
  const projectionReliable = elapsed >= MIN_DAYS_FOR_PROJECTION;

  return {
    daysInMonth,
    daysElapsed: elapsed,
    dailyBurnMinor,
    projectionReliable,
    projectedExpenseMinor: projectionReliable ? dailyBurnMinor * daysInMonth : null,
    previousExpenseMinor: previousMonth.expenseMinor,
    averageExpenseMinor,
  };
}

// ---------------------------------------------------------------------------
// Bulk import — takes rows already parsed and column-mapped by the client.
// ---------------------------------------------------------------------------

const IMPORT_MAX_ROWS = 2000;

async function importTransactions(db, userId, payload) {
  const rows = Array.isArray(payload?.transactions) ? payload.transactions : [];

  if (!rows.length) {
    throw new HttpError(400, 'No rows to import.');
  }

  if (rows.length > IMPORT_MAX_ROWS) {
    throw new HttpError(413, `Too many rows — import at most ${IMPORT_MAX_ROWS} at a time.`);
  }

  const currency = normalizeCurrency(payload.currency || 'USD');
  const skipDuplicates = payload.skipDuplicates !== false;

  // One read of the existing keys beats a per-row SELECT inside the loop.
  const existing = new Set();
  if (skipDuplicates) {
    const known = await db
      .prepare(
        `
        SELECT occurred_on, amount_minor, type,
               LOWER(COALESCE(NULLIF(TRIM(merchant), ''), NULLIF(TRIM(payee), ''), '')) AS name
        FROM finance_transactions
        WHERE user_id = ? AND status != 'deleted' AND currency = ?
      `,
      )
      .bind(userId, currency)
      .all();

    for (const row of known.results || []) {
      existing.add(`${row.occurred_on}|${row.amount_minor}|${row.type}|${row.name}`);
    }
  }

  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];

    try {
      const type = normalizeTransactionType(row.type);
      const amountMinor = normalizeMoney(row.amountMinor, row.amount);
      const occurredOn = normalizeDate(row.occurredOn || row.date);
      const name = String(row.merchant || row.payee || '').trim();

      if (!amountMinor || amountMinor <= 0) {
        throw new Error('Amount must be greater than zero');
      }

      const key = `${occurredOn}|${amountMinor}|${type}|${name.toLowerCase()}`;
      if (skipDuplicates && existing.has(key)) {
        skipped += 1;
        continue;
      }

      await createTransaction(db, userId, {
        type,
        amountMinor,
        occurredOn,
        currency,
        merchant: name || null,
        category: row.category || null,
        notes: row.notes || null,
        source: 'import',
      });

      existing.add(key);
      imported += 1;
    } catch (error) {
      // Report the row number the user sees in their spreadsheet (1-based + header).
      if (errors.length < 25) {
        errors.push({ row: index + 2, message: error.message || 'Could not import this row' });
      }
    }
  }

  return { imported, skipped, failed: errors.length, errors };
}

async function buildMonthlyReport(db, userId, url) {
  const asOf = url.searchParams.get('asOf') || today();
  const currency = normalizeCurrency(url.searchParams.get('currency') || 'USD');
  const { start, nextStart } = monthBounds(asOf);
  const cashflow = await monthlyCashflow(db, userId, start, nextStart, currency);
  const categorySpend = await spendingByCategory(db, userId, start, nextStart, currency);
  const goals = await listGoals(db, userId, currency);
  const budgets = await listBudgets(db, userId, url, currency);

  return {
    type: 'monthly',
    currency,
    periodStart: start,
    periodEnd: addDays(nextStart, -1),
    incomeMinor: cashflow.incomeMinor,
    expenseMinor: cashflow.expenseMinor,
    savingsMinor: cashflow.incomeMinor - cashflow.expenseMinor,
    topCategories: categorySpend.slice(0, 5),
    budgetsNearingLimit: budgets.filter((budget) => budget.usagePercent >= budget.alertThresholdPercent),
    goalsOnTrack: goals.filter((goal) => goal.progressPercent >= 50).length,
  };
}

async function listReceiptTransactions(db, userId, url) {
  const receiptUrl = new URL(url.toString());
  receiptUrl.searchParams.set('type', 'expense');

  const transactions = await listTransactions(db, userId, receiptUrl, 100);
  return transactions.filter((transaction) => transaction.source === 'receipt' || transaction.receiptId);
}

async function createReceiptTransaction(db, userId, payload) {
  let receipt = null;

  if (payload.fileName || payload.fileKey || payload.mimeType || payload.sizeBytes) {
    receipt = await createReceiptMetadata(db, userId, {
      accountId: payload.accountId,
      fileKey: payload.fileKey,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      sizeBytes: payload.sizeBytes,
      uploadStatus: payload.uploadStatus || 'metadata_only',
      extracted: payload.extracted || {},
    });
  }

  const transaction = await createTransaction(db, userId, {
    ...payload,
    type: 'expense',
    receiptId: receipt?.id || payload.receiptId,
    source: 'receipt',
  });

  return {
    ...transaction,
    receipt,
  };
}

async function listLiabilities(db, userId, selectedCurrency) {
  const currency = selectedCurrency ? normalizeCurrency(selectedCurrency) : null;
  const where = ['user_id = ?', "status != 'archived'"];
  const values = [userId];

  if (currency) {
    where.push('currency = ?');
    values.push(currency);
  }

  const result = await db
    .prepare(
      `
      SELECT *
      FROM finance_liabilities
      WHERE ${where.join(' AND ')}
      ORDER BY status, next_payment_on ASC, created_at DESC
    `,
    )
    .bind(...values)
    .all();

  return (result.results || []).map(mapLiability);
}

async function createLiability(db, userId, payload) {
  const id = payload.id || crypto.randomUUID();
  const originalAmountMinor = requiredMoneyFromPayload(
    payload,
    ['originalAmountMinor', 'principalAmountMinor'],
    ['originalAmount', 'principalAmount', 'amount'],
    'Original loan amount is required.',
  );
  const currentBalanceMinor = moneyFromPayload(payload, ['currentBalanceMinor', 'balanceMinor'], ['currentBalance', 'balance']);
  const paidAmountMinor = currentBalanceMinor !== undefined
    ? Math.max(0, originalAmountMinor - currentBalanceMinor)
    : moneyFromPayload(payload, ['paidAmountMinor'], ['paidAmount']) ?? 0;
  const monthlyPaymentMinor = moneyFromPayload(payload, ['monthlyPaymentMinor'], ['monthlyPayment']) ?? 0;
  const nextPaymentOn = payload.nextPaymentOn
    ? normalizeDate(payload.nextPaymentOn)
    : payload.dueDay
      ? nextPaymentDateFromDueDay(payload.dueDay)
      : null;

  await db
    .prepare(
      `
      INSERT INTO finance_liabilities (
        id,
        user_id,
        name,
        provider,
        liability_type,
        currency,
        original_amount_minor,
        paid_amount_minor,
        apr_percent,
        monthly_payment_minor,
        next_payment_on,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `,
    )
    .bind(
      id,
      userId,
      requiredText(payload.name, 'Loan name is required.'),
      payload.provider || payload.lender || null,
      normalizeLiabilityType(payload.liabilityType || payload.type || 'loan'),
      normalizeCurrency(payload.currency || 'USD'),
      originalAmountMinor,
      paidAmountMinor,
      Number(payload.aprPercent ?? payload.interestRate ?? payload.apy ?? 0),
      monthlyPaymentMinor,
      nextPaymentOn,
    )
    .run();

  return getLiability(db, userId, id);
}

async function updateLiability(db, userId, id, payload) {
  const existing = await getLiability(db, userId, id);

  if (!existing) {
    throw new HttpError(404, 'Loan not found.');
  }

  const originalAmountMinor = moneyFromPayload(
    payload,
    ['originalAmountMinor', 'principalAmountMinor'],
    ['originalAmount', 'principalAmount', 'amount'],
  );
  const currentBalanceMinor = moneyFromPayload(payload, ['currentBalanceMinor', 'balanceMinor'], ['currentBalance', 'balance']);
  const paidAmountMinor = currentBalanceMinor !== undefined
    ? Math.max(0, (originalAmountMinor ?? existing.originalAmountMinor) - currentBalanceMinor)
    : moneyFromPayload(payload, ['paidAmountMinor'], ['paidAmount']);
  const monthlyPaymentMinor = moneyFromPayload(payload, ['monthlyPaymentMinor'], ['monthlyPayment']);
  const nextPaymentOn = payload.nextPaymentOn !== undefined
    ? (payload.nextPaymentOn ? normalizeDate(payload.nextPaymentOn) : null)
    : payload.dueDay
      ? nextPaymentDateFromDueDay(payload.dueDay)
      : undefined;

  const allowed = {
    name: payload.name,
    provider: payload.provider ?? payload.lender,
    liability_type: payload.liabilityType || payload.type ? normalizeLiabilityType(payload.liabilityType || payload.type) : undefined,
    currency: payload.currency ? normalizeCurrency(payload.currency) : undefined,
    original_amount_minor: originalAmountMinor,
    paid_amount_minor: paidAmountMinor,
    apr_percent: payload.aprPercent !== undefined || payload.interestRate !== undefined || payload.apy !== undefined
      ? Number(payload.aprPercent ?? payload.interestRate ?? payload.apy)
      : undefined,
    monthly_payment_minor: monthlyPaymentMinor,
    next_payment_on: nextPaymentOn,
    status: payload.status,
  };
  const updates = Object.entries(allowed).filter(([, value]) => value !== undefined);

  if (updates.length) {
    await db
      .prepare(
        `
        UPDATE finance_liabilities
        SET ${updates.map(([key]) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `,
      )
      .bind(...updates.map(([, value]) => value), id, userId)
      .run();
  }

  return getLiability(db, userId, id);
}

async function recordLiabilityPayment(db, userId, id, payload) {
  const liability = await getLiability(db, userId, id);

  if (!liability) {
    throw new HttpError(404, 'Loan not found.');
  }

  const paymentMinor = normalizeMoney(payload.amountMinor, payload.amount ?? liability.monthlyPaymentMinor);
  const paidAmountMinor = Math.min(liability.originalAmountMinor, liability.paidAmountMinor + paymentMinor);
  const status = paidAmountMinor >= liability.originalAmountMinor ? 'paid_off' : 'active';

  await db
    .prepare(
      `
      UPDATE finance_liabilities
      SET paid_amount_minor = ?, status = ?, next_payment_on = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
    )
    .bind(
      paidAmountMinor,
      status,
      payload.nextPaymentOn ? normalizeDate(payload.nextPaymentOn) : liability.nextPaymentOn,
      id,
      userId,
    )
    .run();

  return getLiability(db, userId, id);
}

async function deleteLiability(db, userId, id) {
  await db
    .prepare(
      `
      UPDATE finance_liabilities
      SET status = 'archived', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
    )
    .bind(id, userId)
    .run();
}

async function getLiability(db, userId, id) {
  const row = await db
    .prepare(
      `
      SELECT *
      FROM finance_liabilities
      WHERE id = ? AND user_id = ? AND status != 'archived'
      LIMIT 1
    `,
    )
    .bind(id, userId)
    .first();

  return row ? mapLiability(row) : null;
}

async function getPantrySummary(db, userId) {
  const items = await listPantryItems(db, userId);
  const shoppingItems = await listShoppingItems(db, userId);
  const recipes = await listPantryRecipes(db, userId);
  const lowStockItems = items.filter((item) => item.quantity <= item.lowStockThreshold);
  const expiringItems = items.filter((item) => item.expiresOn && daysBetween(today(), item.expiresOn) <= 7);

  return {
    itemCount: items.length,
    lowStockCount: lowStockItems.length,
    expiringCount: expiringItems.length,
    openShoppingCount: shoppingItems.filter((item) => item.status === 'open').length,
    items,
    lowStockItems,
    expiringItems,
    shoppingItems,
    recipes,
  };
}

async function listPantryItems(db, userId) {
  const result = await db
    .prepare(
      `
      SELECT *
      FROM pantry_items
      WHERE user_id = ? AND status != 'deleted'
      ORDER BY category ASC, name ASC
    `,
    )
    .bind(userId)
    .all();

  return (result.results || []).map(mapPantryItem);
}

async function createPantryItem(db, userId, payload) {
  const id = payload.id || crypto.randomUUID();

  await db
    .prepare(
      `
      INSERT INTO pantry_items (
        id,
        user_id,
        name,
        category,
        quantity,
        unit,
        location,
        low_stock_threshold,
        expires_on,
        notes,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `,
    )
    .bind(
      id,
      userId,
      requiredText(payload.name, 'Pantry item name is required.'),
      payload.category || 'Miscellaneous',
      normalizeQuantity(payload.quantity ?? 1),
      payload.unit || 'item',
      payload.location || null,
      normalizeQuantity(payload.lowStockThreshold ?? 1),
      payload.expiresOn ? normalizeDate(payload.expiresOn) : null,
      payload.notes || null,
    )
    .run();

  return getPantryItem(db, userId, id);
}

async function updatePantryItem(db, userId, id, payload) {
  const allowed = {
    name: payload.name,
    category: payload.category,
    quantity: payload.quantity !== undefined ? normalizeQuantity(payload.quantity) : undefined,
    unit: payload.unit,
    location: payload.location,
    low_stock_threshold: payload.lowStockThreshold !== undefined ? normalizeQuantity(payload.lowStockThreshold) : undefined,
    expires_on: payload.expiresOn ? normalizeDate(payload.expiresOn) : payload.expiresOn === null ? null : undefined,
    notes: payload.notes,
    status: payload.status ? normalizePantryStatus(payload.status) : undefined,
  };

  await updateById(db, 'pantry_items', userId, id, allowed);
  return getPantryItem(db, userId, id);
}

async function consumePantryItem(db, userId, id, payload) {
  const item = await getPantryItem(db, userId, id);

  if (!item) {
    throw new HttpError(404, 'Pantry item not found.');
  }

  const amount = normalizeQuantity(payload.amount ?? 1);
  const quantity = Math.max(0, item.quantity - amount);
  const status = quantity <= 0 ? 'used' : 'active';

  await updateById(db, 'pantry_items', userId, id, { quantity, status });

  if (quantity <= item.lowStockThreshold) {
    await createShoppingItem(db, userId, {
      pantryItemId: id,
      name: item.name,
      category: item.category,
      quantity: Math.max(item.lowStockThreshold || 1, 1),
      unit: item.unit,
      source: 'low_stock',
    });
  }

  return getPantryItem(db, userId, id);
}

async function deletePantryItem(db, userId, id) {
  await updateById(db, 'pantry_items', userId, id, { status: 'deleted' });
}

async function getPantryItem(db, userId, id) {
  const row = await db
    .prepare(
      `
      SELECT *
      FROM pantry_items
      WHERE id = ? AND user_id = ? AND status != 'deleted'
      LIMIT 1
    `,
    )
    .bind(id, userId)
    .first();

  return row ? mapPantryItem(row) : null;
}

async function listShoppingItems(db, userId) {
  const result = await db
    .prepare(
      `
      SELECT *
      FROM pantry_shopping_items
      WHERE user_id = ? AND status != 'deleted'
      ORDER BY status ASC, created_at DESC
    `,
    )
    .bind(userId)
    .all();

  return (result.results || []).map(mapShoppingItem);
}

async function createShoppingItem(db, userId, payload) {
  const id = payload.id || crypto.randomUUID();

  await db
    .prepare(
      `
      INSERT INTO pantry_shopping_items (
        id,
        user_id,
        pantry_item_id,
        name,
        category,
        quantity,
        unit,
        source,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')
    `,
    )
    .bind(
      id,
      userId,
      payload.pantryItemId || null,
      requiredText(payload.name, 'Shopping item name is required.'),
      payload.category || 'Miscellaneous',
      normalizeQuantity(payload.quantity ?? 1),
      payload.unit || 'item',
      normalizeShoppingSource(payload.source || 'manual'),
    )
    .run();

  return getShoppingItem(db, userId, id);
}

async function updateShoppingItem(db, userId, id, payload) {
  const allowed = {
    name: payload.name,
    category: payload.category,
    quantity: payload.quantity !== undefined ? normalizeQuantity(payload.quantity) : undefined,
    unit: payload.unit,
    source: payload.source ? normalizeShoppingSource(payload.source) : undefined,
    status: payload.status ? normalizeShoppingStatus(payload.status) : undefined,
  };

  await updateById(db, 'pantry_shopping_items', userId, id, allowed);
  return getShoppingItem(db, userId, id);
}

async function getShoppingItem(db, userId, id) {
  const row = await db
    .prepare(
      `
      SELECT *
      FROM pantry_shopping_items
      WHERE id = ? AND user_id = ? AND status != 'deleted'
      LIMIT 1
    `,
    )
    .bind(id, userId)
    .first();

  return row ? mapShoppingItem(row) : null;
}

async function listPantryRecipes(db, userId) {
  const result = await db
    .prepare(
      `
      SELECT *
      FROM pantry_recipes
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 6
    `,
    )
    .bind(userId)
    .all();

  return (result.results || []).map(mapRecipe);
}

async function generatePantryRecipes(db, userId) {
  const items = await listPantryItems(db, userId);
  const available = items.filter((item) => item.quantity > 0).slice(0, 6);
  const title = available.length >= 3
    ? `${available.slice(0, 3).map((item) => item.name).join(', ')} bowl`
    : available.length > 0
      ? `${available.map((item) => item.name).join(' and ')} quick plate`
      : 'Restock pantry starter list';
  const ingredients = available.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
  }));
  const missingItems = available.length >= 2 ? [] : ['Protein', 'Vegetable', 'Staple grain'];
  const recipe = {
    id: crypto.randomUUID(),
    title,
    description: available.length
      ? 'A simple pantry-led meal idea based on what is currently in stock.'
      : 'Add pantry items to generate recipes from your inventory.',
    ingredients,
    steps: available.length
      ? ['Prepare ingredients.', 'Cook the fastest-spoiling items first.', 'Season, combine, and serve.']
      : ['Add pantry inventory.', 'Mark low stock.', 'Generate recipes again.'],
    missingItems,
  };

  await db
    .prepare(
      `
      INSERT INTO pantry_recipes (id, user_id, title, description, ingredients_json, steps_json, missing_items_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      recipe.id,
      userId,
      recipe.title,
      recipe.description,
      JSON.stringify(recipe.ingredients),
      JSON.stringify(recipe.steps),
      JSON.stringify(recipe.missingItems),
    )
    .run();

  return listPantryRecipes(db, userId);
}

async function createPantryItemsBulk(db, userId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, 'Provide at least one item to add.');
  }

  if (items.length > 100) {
    throw new HttpError(400, 'Too many items in one request (max 100).');
  }

  const created = [];

  for (const item of items) {
    created.push(await createPantryItem(db, userId, item));
  }

  return created;
}

const PANTRY_SCAN_CATEGORIES = [
  'Produce',
  'Dairy',
  'Meat & Seafood',
  'Bakery',
  'Beverages',
  'Frozen',
  'Pantry',
  'Snacks',
  'Household',
  'Miscellaneous',
];

const EXPENSE_SCAN_CATEGORIES = [
  'Food',
  'Shopping',
  'Travel',
  'Fuel',
  'Health',
  'Entertainment',
  'Education',
  'Utilities',
  'Rent',
  'Family',
  'Pets',
  'Taxes',
  'Charity',
  'Personal Care',
  'Miscellaneous',
];

async function scanDocument(env, payload) {
  const apiKey = env && env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new HttpError(400, 'AI scanning is not configured. Add GEMINI_API_KEY to .dev.vars and restart the dev server.');
  }

  const image = typeof payload.image === 'string' ? payload.image.trim() : '';

  if (!image) {
    throw new HttpError(400, 'A file is required to scan.');
  }

  const isDataUrl = image.startsWith('data:');
  const base64 = isDataUrl ? image.slice(image.indexOf(',') + 1) : image;
  const mimeType = payload.mimeType
    || (isDataUrl ? image.slice(5, image.indexOf(';')) : 'image/jpeg');

  if (!base64) {
    throw new HttpError(400, 'The file could not be read.');
  }

  const isSupported = mimeType.startsWith('image/') || mimeType === 'application/pdf';

  if (!isSupported) {
    throw new HttpError(400, 'Unsupported file type. Upload an image (JPG, PNG, HEIC) or a PDF.');
  }

  const model = (env && env.GEMINI_MODEL) || 'gemini-flash-latest';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = [
    'You are a finance and kitchen assistant analyzing an uploaded file.',
    'The file may be: a store/grocery receipt, an invoice, a credit-card or utility bill, or a photo of grocery/pantry items.',
    'If it is a multi-page document, read every page.',
    '',
    'Return two things:',
    '1) "items": every distinct edible or household grocery item visible.',
    `For each item: name (short, singular), category (one of: ${PANTRY_SCAN_CATEGORIES.join(', ')}),`,
    'quantity (number, estimate count/packages, default 1), unit (one of: item, lb, oz, kg, g, l, ml, dozen, pack, can, bottle, box, bag, bunch),',
    'and unitPrice (the price for that line if shown, else 0).',
    'For a plain photo of vegetables with no prices, still list the items with unitPrice 0.',
    '',
    '2) "receipt": the bill/spend summary when the file is a receipt, invoice, or bill (otherwise leave fields empty/0).',
    'receipt.merchant (store or biller name), receipt.total (the grand total paid, a number),',
    'receipt.currency (ISO code like USD, INR; default USD), receipt.date (YYYY-MM-DD of the transaction),',
    `receipt.category (best expense category, one of: ${EXPENSE_SCAN_CATEGORIES.join(', ')}),`,
    'and receipt.lineItems (array of { description, amount } for each charge line).',
    'If there is no bill/total in the file, set receipt.total to 0 and leave merchant empty.',
    '',
    '3) "transactions": if the file is a PAYMENT-APP or BANK STATEMENT listing many separate',
    'transactions (PhonePe, Google Pay, Paytm, UPI history, a bank passbook or card statement),',
    'return EVERY transaction as its own entry. Do NOT total them up and do NOT merge them.',
    'For each: date (YYYY-MM-DD, take the year from the statement), description (the counterparty —',
    'the name after "Paid to" or "Received from"), direction ("debit" when money left the account,',
    '"credit" when money came in), amount (a positive number, no currency symbol),',
    `and category (best guess, one of: ${EXPENSE_SCAN_CATEGORIES.join(', ')}) for debits only.`,
    'Read every page and include transactions from all of them.',
    'If the file is a single receipt or bill rather than a statement, return an empty transactions array.',
  ].join(' ');

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                category: { type: 'STRING' },
                quantity: { type: 'NUMBER' },
                unit: { type: 'STRING' },
                unitPrice: { type: 'NUMBER' },
              },
              required: ['name'],
            },
          },
          receipt: {
            type: 'OBJECT',
            properties: {
              merchant: { type: 'STRING' },
              total: { type: 'NUMBER' },
              currency: { type: 'STRING' },
              date: { type: 'STRING' },
              category: { type: 'STRING' },
              lineItems: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    description: { type: 'STRING' },
                    amount: { type: 'NUMBER' },
                  },
                },
              },
            },
          },
          transactions: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                date: { type: 'STRING' },
                description: { type: 'STRING' },
                direction: { type: 'STRING' },
                amount: { type: 'NUMBER' },
                category: { type: 'STRING' },
              },
              required: ['date', 'description', 'direction', 'amount'],
            },
          },
        },
      },
    },
  };

  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    throw new HttpError(502, `Could not reach the AI service: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new HttpError(502, `AI scan failed (${response.status}). ${detail.slice(0, 300)}`);
  }

  const data = await response.json().catch(() => null);
  const text = (data
    && data.candidates
    && data.candidates[0]
    && data.candidates[0].content
    && data.candidates[0].content.parts
    ? data.candidates[0].content.parts.map((part) => part.text).filter(Boolean).join('')
    : '') || '';
  const parsed = parseJson(text, null);

  if (!parsed || typeof parsed !== 'object') {
    throw new HttpError(502, 'The AI response could not be understood. Please try another file.');
  }

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items = rawItems
    .filter((entry) => entry && typeof entry.name === 'string' && entry.name.trim())
    .slice(0, 100)
    .map((entry) => ({
      name: String(entry.name).trim().slice(0, 120),
      category: normalizeScanCategory(entry.category),
      quantity: sanitizeScanQuantity(entry.quantity),
      unit: typeof entry.unit === 'string' && entry.unit.trim()
        ? entry.unit.trim().slice(0, 24)
        : 'item',
      priceMinor: toMinor(entry.unitPrice),
    }));

  const receipt = normalizeScanReceipt(parsed.receipt);
  const transactions = normalizeScanTransactions(parsed.transactions);

  return { items, receipt, transactions };
}

/**
 * Statement rows stay as individual entries — one per payment — so the user sees
 * who they paid and when, rather than a single meaningless total. Credits are
 * kept separate so they can land in miscellaneous income instead of salary.
 */
function normalizeScanTransactions(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;

      const amountMinor = toMinor(entry.amount);
      const description = String(entry.description || '').trim().slice(0, 160);
      const occurredOn = normalizeStatementDate(entry.date);

      if (!amountMinor || amountMinor <= 0 || !occurredOn) return null;

      const isCredit = String(entry.direction || '').toLowerCase().startsWith('cr');

      return {
        occurredOn,
        description: description || (isCredit ? 'Received' : 'Payment'),
        direction: isCredit ? 'credit' : 'debit',
        amountMinor,
        category: isCredit ? MISC_INCOME_CATEGORY : normalizeScanExpenseCategory(entry.category),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1))
    .slice(0, 500);
}

/**
 * Strict statement-row date. Unlike normalizeScanDate this returns null instead
 * of falling back to today — a row whose date we cannot read must be dropped,
 * not silently filed under the wrong day.
 */
function normalizeStatementDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (!match) return null;

  const iso = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);

  return Number.isNaN(date.getTime()) ? null : iso;
}

function normalizeScanReceipt(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const totalMinor = toMinor(raw.total);
  const merchant = String(raw.merchant || '').trim().slice(0, 160);

  if (!merchant && totalMinor <= 0) {
    return null;
  }

  const lineItems = (Array.isArray(raw.lineItems) ? raw.lineItems : [])
    .filter((line) => line && (line.description || line.amount))
    .slice(0, 100)
    .map((line) => ({
      description: String(line.description || '').trim().slice(0, 160),
      amountMinor: toMinor(line.amount),
    }));

  return {
    merchant,
    totalMinor,
    currency: normalizeCurrency(raw.currency || 'USD'),
    date: normalizeScanDate(raw.date),
    category: normalizeScanExpenseCategory(raw.category),
    lineItems,
  };
}

function normalizeScanCategory(value) {
  const text = String(value || '').trim();
  const match = PANTRY_SCAN_CATEGORIES.find((category) => category.toLowerCase() === text.toLowerCase());
  return match || 'Miscellaneous';
}

function normalizeScanExpenseCategory(value) {
  const text = String(value || '').trim();
  const match = EXPENSE_SCAN_CATEGORIES.find((category) => category.toLowerCase() === text.toLowerCase());
  return match || 'Miscellaneous';
}

function normalizeScanDate(value) {
  const text = String(value || '').trim().slice(0, 10);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  return today();
}

function sanitizeScanQuantity(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 1;
  }

  return Math.round(numeric * 100) / 100;
}

function toMinor(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return Math.round(numeric * 100);
}

async function listMealPlan(db, userId, from, to) {
  const result = await db
    .prepare(
      `
      SELECT entry.*, recipe.title AS recipe_title
      FROM meal_plan_entries entry
      LEFT JOIN pantry_recipes recipe ON recipe.id = entry.recipe_id
      WHERE entry.user_id = ? AND entry.plan_date >= ? AND entry.plan_date <= ?
      ORDER BY entry.plan_date ASC, entry.meal_slot ASC, entry.created_at ASC
    `,
    )
    .bind(userId, from, to)
    .all();

  return (result.results || []).map(mapMealEntry);
}

async function getMealPlanEntry(db, userId, id) {
  const row = await db
    .prepare(
      `
      SELECT entry.*, recipe.title AS recipe_title
      FROM meal_plan_entries entry
      LEFT JOIN pantry_recipes recipe ON recipe.id = entry.recipe_id
      WHERE entry.id = ? AND entry.user_id = ?
    `,
    )
    .bind(id, userId)
    .first();

  return row ? mapMealEntry(row) : null;
}

async function createMealPlanEntry(db, userId, payload) {
  const id = payload.id || crypto.randomUUID();
  const recipeId = payload.recipeId || null;
  const customTitle = String(payload.customTitle || payload.title || '').trim();

  if (!recipeId && !customTitle) {
    throw new HttpError(400, 'A meal needs a title or a selected recipe.');
  }

  await db
    .prepare(
      `
      INSERT INTO meal_plan_entries (
        id,
        user_id,
        plan_date,
        meal_slot,
        recipe_id,
        custom_title,
        servings,
        status,
        leftover_of_id,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      id,
      userId,
      normalizeDate(payload.planDate),
      normalizeMealSlot(payload.mealSlot),
      recipeId,
      customTitle || null,
      normalizeQuantity(payload.servings ?? 1),
      payload.status ? normalizeMealStatus(payload.status) : 'planned',
      payload.leftoverOfId || null,
      payload.notes ? String(payload.notes).trim() : null,
    )
    .run();

  return getMealPlanEntry(db, userId, id);
}

async function updateMealPlanEntry(db, userId, id, payload) {
  const existing = await getMealPlanEntry(db, userId, id);

  if (!existing) {
    throw new HttpError(404, 'Meal plan entry not found.');
  }

  const allowed = {
    plan_date: payload.planDate ? normalizeDate(payload.planDate) : undefined,
    meal_slot: payload.mealSlot ? normalizeMealSlot(payload.mealSlot) : undefined,
    recipe_id: payload.recipeId !== undefined ? (payload.recipeId || null) : undefined,
    custom_title: payload.customTitle !== undefined
      ? (String(payload.customTitle || '').trim() || null)
      : payload.title !== undefined
        ? (String(payload.title || '').trim() || null)
        : undefined,
    servings: payload.servings !== undefined ? normalizeQuantity(payload.servings) : undefined,
    status: payload.status ? normalizeMealStatus(payload.status) : undefined,
    notes: payload.notes !== undefined ? (String(payload.notes || '').trim() || null) : undefined,
  };

  await updateById(db, 'meal_plan_entries', userId, id, allowed);
  return getMealPlanEntry(db, userId, id);
}

async function deleteMealPlanEntry(db, userId, id) {
  await db
    .prepare('DELETE FROM meal_plan_entries WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();
}

function normalizeMealSlot(value) {
  return normalizeEnum(value, ['breakfast', 'lunch', 'dinner', 'snack'], 'Invalid meal slot.');
}

function normalizeMealStatus(value) {
  return normalizeEnum(value, ['planned', 'cooked', 'skipped', 'leftover'], 'Invalid meal status.');
}

function mapMealEntry(row) {
  return {
    id: row.id,
    planDate: row.plan_date,
    mealSlot: row.meal_slot,
    recipeId: row.recipe_id,
    customTitle: row.custom_title,
    title: row.custom_title || row.recipe_title || 'Untitled meal',
    servings: Number(row.servings || 1),
    status: row.status,
    leftoverOfId: row.leftover_of_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function generateMealPlan(db, env, userId, payload) {
  const from = normalizeDate(payload.from || today());
  const to = normalizeDate(payload.to || addDays(from, 6));
  const requestedSlots = Array.isArray(payload.slots) && payload.slots.length
    ? payload.slots.map(normalizeMealSlot)
    : ['breakfast', 'lunch', 'dinner'];
  const replace = payload.replace !== false;

  const items = await listPantryItems(db, userId);
  const inStock = items.filter((item) => item.quantity > 0);

  if (inStock.length === 0) {
    throw new HttpError(400, 'Add some pantry items first so AI can plan meals around them.');
  }

  const dates = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    dates.push(day);
    if (dates.length >= 21) break;
  }

  const inventoryText = inStock
    .slice(0, 200)
    .map((item) => `- ${item.name} (${item.quantity} ${item.unit}${item.expiresOn ? `, expires ${item.expiresOn}` : ''})`)
    .join('\n');

  const prompt = [
    'You are a meal planning assistant. Plan meals for a household using mostly what is already in their pantry.',
    `Today is ${today()}.`,
    `Pantry inventory:\n${inventoryText}`,
    `Plan meals for these dates: ${dates.join(', ')}.`,
    `For each date plan these meal slots: ${requestedSlots.join(', ')}.`,
    'Rules: prioritise ingredients that expire soonest so nothing is wasted; keep meals balanced and varied and do not repeat the same dish on consecutive days; prefer meals that can be made mainly from the pantry; keep them realistic and quick to cook.',
    'For every meal return: date (YYYY-MM-DD, must be one of the listed dates), slot (exactly one of the requested slots), title (short dish name), servings (number, default 2), ingredients (array of pantry item names used), missing (array of items NOT in the pantry that must be bought), and notes (one short helpful line).',
  ].join('\n\n');

  const schema = {
    type: 'OBJECT',
    properties: {
      meals: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            date: { type: 'STRING' },
            slot: { type: 'STRING' },
            title: { type: 'STRING' },
            servings: { type: 'NUMBER' },
            ingredients: { type: 'ARRAY', items: { type: 'STRING' } },
            missing: { type: 'ARRAY', items: { type: 'STRING' } },
            notes: { type: 'STRING' },
          },
          required: ['date', 'slot', 'title'],
        },
      },
    },
  };

  const parsed = await geminiGenerateJson(env, prompt, schema);
  const meals = Array.isArray(parsed.meals) ? parsed.meals : [];
  const dateSet = new Set(dates);
  const slotSet = new Set(requestedSlots);

  if (replace) {
    await db
      .prepare("DELETE FROM meal_plan_entries WHERE user_id = ? AND plan_date >= ? AND plan_date <= ? AND status = 'planned'")
      .bind(userId, from, to)
      .run();
  }

  const missingItems = new Set();
  let created = 0;

  for (const meal of meals) {
    const date = String(meal.date || '').slice(0, 10);
    const slot = String(meal.slot || '').trim().toLowerCase();

    if (!dateSet.has(date) || !slotSet.has(slot) || !meal.title) {
      continue;
    }

    const noteParts = [];
    if (Array.isArray(meal.ingredients) && meal.ingredients.length) {
      noteParts.push(`Uses: ${meal.ingredients.slice(0, 8).join(', ')}`);
    }
    if (Array.isArray(meal.missing) && meal.missing.length) {
      noteParts.push(`Buy: ${meal.missing.slice(0, 8).join(', ')}`);
      meal.missing.forEach((entry) => {
        const name = String(entry || '').trim();
        if (name) missingItems.add(name);
      });
    }
    if (meal.notes) {
      noteParts.push(String(meal.notes));
    }

    await createMealPlanEntry(db, userId, {
      planDate: date,
      mealSlot: slot,
      customTitle: String(meal.title).slice(0, 160),
      servings: sanitizeScanQuantity(meal.servings || 2),
      notes: noteParts.join(' · ').slice(0, 500),
    });
    created += 1;
  }

  const entries = await listMealPlan(db, userId, from, to);

  return { entries, created, missingItems: Array.from(missingItems).slice(0, 40) };
}

async function geminiGenerateJson(env, promptText, schema) {
  const apiKey = env && env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new HttpError(400, 'AI is not configured. Add GEMINI_API_KEY to .dev.vars and restart the dev server.');
  }

  const model = (env && env.GEMINI_MODEL) || 'gemini-flash-latest';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestBody = {
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    throw new HttpError(502, `Could not reach the AI service: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new HttpError(502, `AI request failed (${response.status}). ${detail.slice(0, 300)}`);
  }

  const data = await response.json().catch(() => null);
  const text = (data
    && data.candidates
    && data.candidates[0]
    && data.candidates[0].content
    && data.candidates[0].content.parts
    ? data.candidates[0].content.parts.map((part) => part.text).filter(Boolean).join('')
    : '') || '';
  const parsed = parseJson(text, null);

  if (!parsed || typeof parsed !== 'object') {
    throw new HttpError(502, 'The AI response could not be understood. Please try again.');
  }

  return parsed;
}

async function getCarSummary(db, userId) {
  const vehicles = await listVehicles(db, userId);
  const maintenanceItems = await listMaintenanceItems(db, userId);
  const activeVehicle = vehicles[0] || null;

  return {
    vehicleCount: vehicles.length,
    openMaintenanceCount: maintenanceItems.filter((item) => item.status === 'open' || item.status === 'scheduled').length,
    activeVehicle,
    ownership: activeVehicle ? buildOwnership(activeVehicle, maintenanceItems) : null,
    vehicles,
    maintenanceItems,
  };
}

function buildOwnership(vehicle, maintenanceItems) {
  const now = today();
  const renewal = (label, key, date) => (date
    ? { key, label, date, daysUntil: daysBetween(now, date) }
    : { key, label, date: null, daysUntil: null });

  const nextService = maintenanceItems
    .filter((item) => item.vehicleId === vehicle.id && (item.status === 'open' || item.status === 'scheduled') && item.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || null;

  const renewals = [
    renewal('Insurance', 'insurance', vehicle.insuranceExpiresOn),
    renewal('Registration', 'registration', vehicle.registrationExpiresOn),
    renewal('Warranty', 'warranty', vehicle.warrantyExpiresOn),
    nextService
      ? { key: 'service', label: 'Next service', date: nextService.dueDate, daysUntil: daysBetween(now, nextService.dueDate), title: nextService.title }
      : { key: 'service', label: 'Next service', date: null, daysUntil: null },
  ];

  return {
    currentValueMinor: vehicle.currentValueMinor,
    purchasePriceMinor: vehicle.purchasePriceMinor,
    insuranceProvider: vehicle.insuranceProvider,
    policyNumber: vehicle.policyNumber,
    renewals,
    dueSoonCount: renewals.filter((item) => item.daysUntil !== null && item.daysUntil <= 30).length,
  };
}

async function listVehicles(db, userId) {
  const result = await db
    .prepare(
      `
      SELECT *
      FROM vehicles
      WHERE user_id = ? AND status != 'deleted'
      ORDER BY updated_at DESC, created_at DESC
    `,
    )
    .bind(userId)
    .all();

  return (result.results || []).map(mapVehicle);
}

async function createVehicle(db, userId, payload) {
  const id = payload.id || crypto.randomUUID();

  await db
    .prepare(
      `
      INSERT INTO vehicles (
        id,
        user_id,
        name,
        make,
        model,
        year,
        vin,
        odometer_miles,
        battery_percent,
        range_miles,
        interior_temp_f,
        location,
        purchase_price_minor,
        current_value_minor,
        insurance_provider,
        policy_number,
        insurance_expires_on,
        registration_expires_on,
        warranty_expires_on,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      id,
      userId,
      requiredText(payload.name, 'Vehicle name is required.'),
      payload.make || null,
      payload.model || null,
      payload.year ? Number(payload.year) : null,
      payload.vin || null,
      Math.max(0, Math.round(Number(payload.odometerMiles ?? 0))),
      payload.batteryPercent === '' || payload.batteryPercent === undefined ? null : clampInteger(payload.batteryPercent, 0, 100),
      payload.rangeMiles === '' || payload.rangeMiles === undefined ? null : Math.max(0, Math.round(Number(payload.rangeMiles))),
      payload.interiorTempF === '' || payload.interiorTempF === undefined ? null : Math.round(Number(payload.interiorTempF)),
      payload.location || null,
      moneyOrNull(payload.purchasePrice),
      moneyOrNull(payload.currentValue),
      payload.insuranceProvider || null,
      payload.policyNumber || null,
      dateOrNull(payload.insuranceExpiresOn),
      dateOrNull(payload.registrationExpiresOn),
      dateOrNull(payload.warrantyExpiresOn),
      normalizeVehicleStatus(payload.status || 'parked'),
    )
    .run();

  return getVehicle(db, userId, id);
}

async function updateVehicle(db, userId, id, payload) {
  const allowed = {
    name: payload.name,
    make: payload.make,
    model: payload.model,
    year: payload.year !== undefined && payload.year !== '' ? Number(payload.year) : undefined,
    vin: payload.vin,
    odometer_miles: payload.odometerMiles !== undefined ? Math.max(0, Math.round(Number(payload.odometerMiles))) : undefined,
    battery_percent: payload.batteryPercent !== undefined && payload.batteryPercent !== '' ? clampInteger(payload.batteryPercent, 0, 100) : undefined,
    range_miles: payload.rangeMiles !== undefined && payload.rangeMiles !== '' ? Math.max(0, Math.round(Number(payload.rangeMiles))) : undefined,
    interior_temp_f: payload.interiorTempF !== undefined && payload.interiorTempF !== '' ? Math.round(Number(payload.interiorTempF)) : undefined,
    location: payload.location,
    purchase_price_minor: payload.purchasePrice !== undefined ? moneyOrNull(payload.purchasePrice) : undefined,
    current_value_minor: payload.currentValue !== undefined ? moneyOrNull(payload.currentValue) : undefined,
    insurance_provider: payload.insuranceProvider,
    policy_number: payload.policyNumber,
    insurance_expires_on: payload.insuranceExpiresOn !== undefined ? dateOrNull(payload.insuranceExpiresOn) : undefined,
    registration_expires_on: payload.registrationExpiresOn !== undefined ? dateOrNull(payload.registrationExpiresOn) : undefined,
    warranty_expires_on: payload.warrantyExpiresOn !== undefined ? dateOrNull(payload.warrantyExpiresOn) : undefined,
    status: payload.status ? normalizeVehicleStatus(payload.status) : undefined,
  };

  await updateById(db, 'vehicles', userId, id, allowed);
  return getVehicle(db, userId, id);
}

async function getVehicle(db, userId, id) {
  const row = await db
    .prepare(
      `
      SELECT *
      FROM vehicles
      WHERE id = ? AND user_id = ? AND status != 'deleted'
      LIMIT 1
    `,
    )
    .bind(id, userId)
    .first();

  return row ? mapVehicle(row) : null;
}

async function listMaintenanceItems(db, userId) {
  const result = await db
    .prepare(
      `
      SELECT m.*, v.name AS vehicle_name
      FROM vehicle_maintenance_items m
      LEFT JOIN vehicles v ON v.id = m.vehicle_id
      WHERE m.user_id = ? AND m.status != 'deleted'
      ORDER BY
        CASE m.status WHEN 'open' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
        m.due_date ASC,
        m.created_at DESC
    `,
    )
    .bind(userId)
    .all();

  return (result.results || []).map(mapMaintenanceItem);
}

async function createMaintenanceItem(db, userId, vehicleId, payload) {
  const vehicle = await getVehicle(db, userId, vehicleId);

  if (!vehicle) {
    throw new HttpError(404, 'Vehicle not found.');
  }

  const id = payload.id || crypto.randomUUID();

  await db
    .prepare(
      `
      INSERT INTO vehicle_maintenance_items (
        id,
        user_id,
        vehicle_id,
        title,
        due_mileage,
        due_date,
        priority,
        status,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      id,
      userId,
      vehicleId,
      requiredText(payload.title, 'Maintenance title is required.'),
      payload.dueMileage ? Math.max(0, Math.round(Number(payload.dueMileage))) : null,
      payload.dueDate ? normalizeDate(payload.dueDate) : null,
      normalizePriority(payload.priority || 'normal'),
      normalizeMaintenanceStatus(payload.status || 'open'),
      payload.notes || null,
    )
    .run();

  return getMaintenanceItem(db, userId, id);
}

async function updateMaintenanceItem(db, userId, id, payload) {
  const allowed = {
    title: payload.title,
    due_mileage: payload.dueMileage !== undefined && payload.dueMileage !== '' ? Math.max(0, Math.round(Number(payload.dueMileage))) : undefined,
    due_date: payload.dueDate ? normalizeDate(payload.dueDate) : payload.dueDate === null ? null : undefined,
    priority: payload.priority ? normalizePriority(payload.priority) : undefined,
    status: payload.status ? normalizeMaintenanceStatus(payload.status) : undefined,
    notes: payload.notes,
  };

  await updateById(db, 'vehicle_maintenance_items', userId, id, allowed);
  return getMaintenanceItem(db, userId, id);
}

async function getMaintenanceItem(db, userId, id) {
  const row = await db
    .prepare(
      `
      SELECT m.*, v.name AS vehicle_name
      FROM vehicle_maintenance_items m
      LEFT JOIN vehicles v ON v.id = m.vehicle_id
      WHERE m.id = ? AND m.user_id = ? AND m.status != 'deleted'
      LIMIT 1
    `,
    )
    .bind(id, userId)
    .first();

  return row ? mapMaintenanceItem(row) : null;
}

async function createReceiptMetadata(db, userId, payload) {
  const id = payload.id || crypto.randomUUID();

  await db
    .prepare(
      `
      INSERT INTO finance_receipts (
        id,
        user_id,
        account_id,
        file_key,
        file_name,
        mime_type,
        size_bytes,
        upload_status,
        extracted_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      id,
      userId,
      payload.accountId || null,
      payload.fileKey || null,
      payload.fileName || null,
      payload.mimeType || null,
      payload.sizeBytes || null,
      payload.uploadStatus || 'metadata_only',
      JSON.stringify(payload.extracted || {}),
    )
    .run();

  const row = await db
    .prepare(
      `
      SELECT *
      FROM finance_receipts
      WHERE id = ? AND user_id = ?
    `,
    )
    .bind(id, userId)
    .first();

  return {
    id: row.id,
    accountId: row.account_id,
    fileKey: row.file_key,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadStatus: row.upload_status,
    extracted: parseJson(row.extracted_json, {}),
    createdAt: row.created_at,
  };
}

async function exportTransactionsCsv(db, userId, url) {
  const rows = await listTransactions(db, userId, url, 500);
  const fields = [
    'date',
    'type',
    'merchant',
    'category',
    'amount',
    'currency',
    'payment_method',
    'account',
    'tags',
    'notes',
  ];
  const body = [
    fields.join(','),
    ...rows.map((row) => [
      row.occurredOn,
      row.type,
      row.merchant || '',
      row.categoryName || '',
      (row.amountMinor / 100).toFixed(2),
      row.currency,
      row.paymentMethod || '',
      row.accountName || '',
      (row.tags || []).join('|'),
      row.notes || '',
    ].map(csvCell).join(',')),
  ].join('\n');

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="lifeos-transactions.csv"',
      'access-control-allow-origin': '*',
    },
  });
}

async function resolveCategoryId(db, userId, type, categoryId, categoryName) {
  if (categoryId) {
    return categoryId;
  }

  if (!categoryName) {
    return null;
  }

  const row = await db
    .prepare(
      `
      SELECT id
      FROM finance_categories
      WHERE user_id = ? AND LOWER(name) = LOWER(?) AND type = ?
      LIMIT 1
    `,
    )
    .bind(userId, categoryName, type === 'refund' ? 'expense' : type)
    .first();

  return row?.id || null;
}

async function defaultAccountId(db, userId, currency = 'USD') {
  const row = await db
    .prepare(
      `
      SELECT default_account_id
      FROM finance_profiles
      WHERE user_id = ?
    `,
    )
    .bind(userId)
    .first();

  if (row?.default_account_id) {
    const defaultAccount = await db
      .prepare(
        `
        SELECT id
        FROM finance_accounts
        WHERE id = ? AND user_id = ? AND currency = ? AND is_archived = 0
        LIMIT 1
      `,
      )
      .bind(row.default_account_id, userId, currency)
      .first();

    if (defaultAccount?.id) {
      return defaultAccount.id;
    }
  }

  const account = await db
    .prepare(
      `
      SELECT id
      FROM finance_accounts
      WHERE user_id = ? AND currency = ? AND is_archived = 0
      ORDER BY created_at ASC
      LIMIT 1
    `,
    )
    .bind(userId, currency)
    .first();

  return account?.id || null;
}

async function applyAccountDelta(db, accountId, deltaMinor) {
  if (!accountId) {
    return;
  }

  await db
    .prepare(
      `
      UPDATE finance_accounts
      SET current_balance_minor = current_balance_minor + ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    )
    .bind(deltaMinor, accountId)
    .run();
}

function accountDelta(type, amountMinor) {
  return type === 'income' || type === 'refund' ? amountMinor : -amountMinor;
}

function idForUser(baseId, userId) {
  if (userId === DEFAULT_USER_ID) {
    return baseId;
  }

  return `${baseId}-${String(userId).toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
}

function mapTransaction(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    accountName: row.account_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryColor: row.category_color,
    receiptId: row.receipt_id,
    receiptFileName: row.receipt_file_name,
    type: row.type,
    status: row.status,
    occurredOn: row.occurred_on,
    amountMinor: Number(row.amount_minor || 0),
    currency: row.currency || 'USD',
    merchant: row.merchant,
    payee: row.payee,
    paymentMethod: row.payment_method,
    notes: row.notes,
    tags: parseJson(row.tags_json, []),
    source: row.source,
    aiCategoryConfidence: row.ai_category_confidence,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBudget(row, asOf = today()) {
  const spentMinor = Math.max(0, Number(row.spent_minor || 0));
  const limitMinor = Number(row.limit_minor || 0);
  const carryForwardMinor = Number(row.carry_forward_minor || 0);

  // Carry-forward is spendable money, so it belongs in the denominator too.
  // Previously usage was measured against the bare limit while "remaining"
  // included the carry-forward, so the two numbers disagreed with each other.
  const effectiveLimitMinor = limitMinor + carryForwardMinor;
  const usagePercent = effectiveLimitMinor > 0
    ? Math.round((spentMinor / effectiveLimitMinor) * 1000) / 10
    : 0;

  // Signed: negative means overspent. The UI needs the real number, not a clamp.
  const remainingMinor = effectiveLimitMinor - spentMinor;

  const totalDays = Math.max(1, daysInclusive(row.period_start, row.period_end));
  const elapsedDays = Math.min(
    Math.max(1, daysInclusive(row.period_start, clampDate(asOf, row.period_start, row.period_end))),
    totalDays,
  );
  const daysRemaining = Math.max(0, totalDays - elapsedDays);

  // Straight-line projection of where this budget lands if the current daily
  // rate holds. Suppressed early in the period: on day 1 a single rent payment
  // would extrapolate to an absurd month-end figure and trip a false alarm.
  const projectionReliable = elapsedDays >= Math.min(5, totalDays);
  const projectedSpendMinor = projectionReliable
    ? Math.round((spentMinor / elapsedDays) * totalDays)
    : null;
  const alertThresholdPercent = Number(row.alert_threshold_percent || 80);

  let status = 'on_track';
  if (remainingMinor < 0) status = 'over';
  else if (usagePercent >= alertThresholdPercent) status = 'warning';
  else if (projectionReliable && effectiveLimitMinor > 0 && projectedSpendMinor > effectiveLimitMinor) {
    status = 'projected_over';
  }

  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name || 'All categories',
    categoryColor: row.category_color || '#0058be',
    name: row.name,
    period: row.period,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    currency: row.currency || 'USD',
    limitMinor,
    spentMinor,
    carryForwardMinor,
    effectiveLimitMinor,
    alertThresholdPercent,
    isFlexible: Boolean(row.is_flexible),
    usagePercent,
    remainingMinor,
    overspentMinor: Math.max(0, -remainingMinor),
    totalDays,
    elapsedDays,
    daysRemaining,
    projectionReliable,
    projectedSpendMinor,
    // What's left per remaining day if they want to finish inside the limit.
    dailyAllowanceMinor: daysRemaining > 0 && remainingMinor > 0
      ? Math.floor(remainingMinor / daysRemaining)
      : 0,
    status,
  };
}

/** Inclusive day count between two ISO dates (same day === 1). */
function daysInclusive(start, end) {
  const from = new Date(`${start}T00:00:00Z`).getTime();
  const to = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 1;
  return Math.floor((to - from) / 86400000) + 1;
}

function clampDate(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function mapGoal(row, asOf = today()) {
  const targetAmountMinor = Number(row.target_amount_minor || 0);
  const savedAmountMinor = Number(row.saved_amount_minor || 0);
  const progressPercent = targetAmountMinor > 0
    ? Math.min(100, Math.round((savedAmountMinor / targetAmountMinor) * 1000) / 10)
    : 0;
  const remainingMinor = Math.max(0, targetAmountMinor - savedAmountMinor);

  // Months left, rounded up — a target 10 days out still needs one payment.
  const monthsRemaining = row.target_date
    ? Math.max(0, monthsBetween(asOf, row.target_date))
    : null;

  let requiredMonthlyMinor = null;
  if (remainingMinor > 0 && monthsRemaining !== null) {
    requiredMonthlyMinor = monthsRemaining > 0
      ? Math.ceil(remainingMinor / monthsRemaining)
      : remainingMinor; // Due this month (or overdue) — the whole rest is needed now.
  }

  const isComplete = remainingMinor === 0 && targetAmountMinor > 0;
  const isOverdue = Boolean(row.target_date) && !isComplete && row.target_date < asOf;

  return {
    id: row.id,
    name: row.name,
    goalType: row.goal_type,
    targetAmountMinor,
    savedAmountMinor,
    remainingMinor,
    currency: row.currency || 'USD',
    targetDate: row.target_date,
    priority: Number(row.priority || 3),
    status: row.status,
    recommendation: row.recommendation,
    progressPercent,
    monthsRemaining,
    requiredMonthlyMinor,
    isComplete,
    isOverdue,
  };
}

/** Whole months from `from` to `to`, rounded up, floored at 0. */
function monthsBetween(from, to) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end <= start) return 0;

  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12
    + (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() > start.getUTCDate()) months += 1;

  return Math.max(months, 1);
}

function mapLiability(row) {
  const originalAmountMinor = Number(row.original_amount_minor || 0);
  const paidAmountMinor = Number(row.paid_amount_minor || 0);
  const remainingAmountMinor = Math.max(0, originalAmountMinor - paidAmountMinor);
  const progressPercent = originalAmountMinor > 0
    ? Math.min(100, Math.round((paidAmountMinor / originalAmountMinor) * 1000) / 10)
    : 0;

  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    liabilityType: row.liability_type,
    currency: row.currency || 'USD',
    originalAmountMinor,
    principalAmountMinor: originalAmountMinor,
    paidAmountMinor,
    remainingAmountMinor,
    currentBalanceMinor: remainingAmountMinor,
    aprPercent: Number(row.apr_percent || 0),
    interestRate: Number(row.apr_percent || 0),
    monthlyPaymentMinor: Number(row.monthly_payment_minor || 0),
    nextPaymentOn: row.next_payment_on,
    status: row.status,
    progressPercent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPantryItem(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    quantity: Number(row.quantity || 0),
    unit: row.unit,
    location: row.location,
    lowStockThreshold: Number(row.low_stock_threshold || 0),
    expiresOn: row.expires_on,
    notes: row.notes,
    status: row.status,
    isLowStock: Number(row.quantity || 0) <= Number(row.low_stock_threshold || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapShoppingItem(row) {
  return {
    id: row.id,
    pantryItemId: row.pantry_item_id,
    name: row.name,
    category: row.category,
    quantity: Number(row.quantity || 0),
    unit: row.unit,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRecipe(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    ingredients: parseJson(row.ingredients_json, []),
    steps: parseJson(row.steps_json, []),
    missingItems: parseJson(row.missing_items_json, []),
    createdAt: row.created_at,
  };
}

function mapVehicle(row) {
  return {
    id: row.id,
    name: row.name,
    make: row.make,
    model: row.model,
    year: row.year ? Number(row.year) : null,
    vin: row.vin,
    odometerMiles: Number(row.odometer_miles || 0),
    batteryPercent: row.battery_percent === null || row.battery_percent === undefined ? null : Number(row.battery_percent),
    rangeMiles: row.range_miles === null || row.range_miles === undefined ? null : Number(row.range_miles),
    interiorTempF: row.interior_temp_f === null || row.interior_temp_f === undefined ? null : Number(row.interior_temp_f),
    location: row.location,
    purchasePriceMinor: row.purchase_price_minor === null || row.purchase_price_minor === undefined ? null : Number(row.purchase_price_minor),
    currentValueMinor: row.current_value_minor === null || row.current_value_minor === undefined ? null : Number(row.current_value_minor),
    insuranceProvider: row.insurance_provider || null,
    policyNumber: row.policy_number || null,
    insuranceExpiresOn: row.insurance_expires_on || null,
    registrationExpiresOn: row.registration_expires_on || null,
    warrantyExpiresOn: row.warranty_expires_on || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function moneyOrNull(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return Math.round(numeric * 100);
}

function dateOrNull(value) {
  if (!value) {
    return null;
  }
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function mapMaintenanceItem(row) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    vehicleName: row.vehicle_name,
    title: row.title,
    dueMileage: row.due_mileage === null || row.due_mileage === undefined ? null : Number(row.due_mileage),
    dueDate: row.due_date,
    priority: row.priority,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function transactionFilters(url, defaultLimit) {
  const params = url.searchParams;

  return {
    type: params.get('type'),
    currency: params.get('currency') ? normalizeCurrency(params.get('currency')) : null,
    categoryId: params.get('categoryId'),
    startDate: params.get('startDate'),
    endDate: params.get('endDate'),
    search: params.get('search') ? `%${params.get('search').toLowerCase().trim()}%` : null,
    minAmountMinor: params.get('minAmount') ? normalizeMoney(null, params.get('minAmount')) : null,
    maxAmountMinor: params.get('maxAmount') ? normalizeMoney(null, params.get('maxAmount')) : null,
    limit: Math.min(Number(params.get('limit') || defaultLimit), 500),
  };
}

function budgetUsagePercent(budgets) {
  const limit = budgets.reduce((sum, budget) => sum + budget.limitMinor, 0);
  const spent = budgets.reduce((sum, budget) => sum + budget.spentMinor, 0);

  return limit > 0 ? Math.round((spent / limit) * 1000) / 10 : 0;
}

function normalizeRoute(pathname) {
  return pathname
    .replace(/^\/api\/?/, '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Admin — platform management (owner / admin only)
// ---------------------------------------------------------------------------

function requireAdmin(user) {
  if (user.role !== 'owner' && user.role !== 'admin') {
    throw new HttpError(403, 'Admin access required.');
  }
}

function requireOwner(user) {
  if (user.role !== 'owner') {
    throw new HttpError(403, 'Owner access required.');
  }
}

async function auditLog(db, actorId, action, targetType, targetId, details, ip) {
  await db
    .prepare(
      `INSERT INTO admin_audit_log (id, actor_id, action, target_type, target_id, details_json, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actorId,
      action,
      targetType || null,
      targetId || null,
      JSON.stringify(details || {}),
      ip || null,
    )
    .run();
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || null;
}

async function handleAdminRoute({ db, request, url, route, user }) {
  requireAdmin(user);

  const [resource, id, action] = route;

  // GET /api/admin/dashboard — platform stats
  if (!resource || resource === 'dashboard') {
    assertMethod(request, 'GET');
    return sendJson(await getAdminDashboard(db));
  }

  // /api/admin/users — user management
  if (resource === 'users') {
    if (!id && request.method === 'GET') {
      return sendJson({ users: await listAllUsers(db, url) });
    }

    if (id && request.method === 'GET') {
      return sendJson({ user: await getAdminUserDetail(db, id) });
    }

    if (id && request.method === 'PATCH') {
      const payload = await readJson(request);
      const result = await updateUserRole(db, user, id, payload);
      await auditLog(db, user.userId, 'user.update', 'user', id, payload, clientIp(request));
      return sendJson({ user: result });
    }

    if (id && request.method === 'DELETE') {
      requireOwner(user);
      if (id === user.userId) {
        throw new HttpError(400, 'You cannot delete your own account.');
      }
      await deleteUserCascade(db, id);
      await auditLog(db, user.userId, 'user.delete', 'user', id, {}, clientIp(request));
      return sendJson({ ok: true });
    }
  }

  // /api/admin/audit-log
  if (resource === 'audit-log') {
    assertMethod(request, 'GET');
    return sendJson({ entries: await listAuditLog(db, url) });
  }

  // /api/admin/config
  if (resource === 'config') {
    if (request.method === 'GET') {
      return sendJson({ config: await listAdminConfig(db) });
    }

    if (request.method === 'PATCH') {
      requireOwner(user);
      const payload = await readJson(request);
      await updateAdminConfig(db, user.userId, payload);
      await auditLog(db, user.userId, 'config.update', 'config', null, payload, clientIp(request));
      return sendJson({ ok: true });
    }
  }

  // /api/admin/announcements
  if (resource === 'announcements') {
    if (!id && request.method === 'GET') {
      return sendJson({ announcements: await listAnnouncements(db) });
    }

    if (!id && request.method === 'POST') {
      const payload = await readJson(request);
      const announcement = await createAnnouncement(db, user.userId, payload);
      await auditLog(db, user.userId, 'announcement.create', 'announcement', announcement.id, payload, clientIp(request));
      return sendJson({ announcement }, 201);
    }

    if (id && request.method === 'PATCH') {
      const payload = await readJson(request);
      const announcement = await updateAnnouncement(db, id, payload);
      await auditLog(db, user.userId, 'announcement.update', 'announcement', id, payload, clientIp(request));
      return sendJson({ announcement });
    }

    if (id && request.method === 'DELETE') {
      await deleteAnnouncement(db, id);
      await auditLog(db, user.userId, 'announcement.delete', 'announcement', id, {}, clientIp(request));
      return sendJson({ ok: true });
    }
  }

  return sendJson({ error: 'Not found' }, 404);
}

// --- Admin: platform dashboard ---

async function getAdminDashboard(db) {
  const totalUsers = await db.prepare('SELECT COUNT(*) AS cnt FROM users').first();
  const roleBreakdown = await db
    .prepare('SELECT role, COUNT(*) AS cnt FROM users GROUP BY role')
    .all();

  const activeSessions = await db
    .prepare("SELECT COUNT(*) AS cnt FROM auth_sessions WHERE expires_at > CURRENT_TIMESTAMP")
    .first();

  const recentUsers = await db
    .prepare('SELECT COUNT(*) AS cnt FROM users WHERE created_at >= date(CURRENT_TIMESTAMP, \'-7 days\')')
    .first();

  const totalTransactions = await db
    .prepare("SELECT COUNT(*) AS cnt FROM finance_transactions WHERE status != 'deleted'")
    .first();

  const totalPantryItems = await db
    .prepare("SELECT COUNT(*) AS cnt FROM pantry_items WHERE status = 'active'")
    .first();

  const totalVehicles = await db
    .prepare("SELECT COUNT(*) AS cnt FROM vehicles WHERE status != 'deleted'")
    .first();

  const totalSubscriptions = await db
    .prepare("SELECT COUNT(*) AS cnt FROM subscriptions WHERE status = 'active'")
    .first();

  const totalNotes = await db
    .prepare("SELECT COUNT(*) AS cnt FROM notes WHERE status = 'active'")
    .first();

  const recentAuditEntries = await db
    .prepare(
      `SELECT a.*, u.email AS actor_email, u.display_name AS actor_name
       FROM admin_audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC LIMIT 10`,
    )
    .all();

  return {
    stats: {
      totalUsers: Number(totalUsers?.cnt || 0),
      roleBreakdown: (roleBreakdown.results || []).reduce((acc, row) => {
        acc[row.role] = Number(row.cnt);
        return acc;
      }, {}),
      activeSessions: Number(activeSessions?.cnt || 0),
      newUsersLast7Days: Number(recentUsers?.cnt || 0),
      totalTransactions: Number(totalTransactions?.cnt || 0),
      totalPantryItems: Number(totalPantryItems?.cnt || 0),
      totalVehicles: Number(totalVehicles?.cnt || 0),
      totalSubscriptions: Number(totalSubscriptions?.cnt || 0),
      totalNotes: Number(totalNotes?.cnt || 0),
    },
    recentAuditLog: (recentAuditEntries.results || []).map(mapAuditEntry),
  };
}

// --- Admin: user management ---

async function listAllUsers(db, url) {
  const search = url.searchParams.get('search');
  const role = url.searchParams.get('role');
  const sort = url.searchParams.get('sort') || 'created_at';
  const order = (url.searchParams.get('order') || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 200);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);

  const where = [];
  const values = [];

  if (search) {
    where.push('(LOWER(u.email) LIKE ? OR LOWER(u.display_name) LIKE ?)');
    const searchTerm = `%${search.toLowerCase()}%`;
    values.push(searchTerm, searchTerm);
  }

  if (role) {
    where.push('u.role = ?');
    values.push(role);
  }

  const allowedSorts = new Set(['created_at', 'email', 'display_name', 'role']);
  const sortCol = allowedSorts.has(sort) ? `u.${sort}` : 'u.created_at';

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const result = await db
    .prepare(
      `SELECT u.id, u.email, u.display_name, u.role, u.created_at, u.updated_at,
              (SELECT COUNT(*) FROM auth_sessions s WHERE s.user_id = u.id AND s.expires_at > CURRENT_TIMESTAMP) AS active_sessions,
              (SELECT COUNT(*) FROM finance_transactions t WHERE t.user_id = u.id AND t.status != 'deleted') AS transaction_count
       FROM users u
       ${whereClause}
       ORDER BY ${sortCol} ${order}
       LIMIT ? OFFSET ?`,
    )
    .bind(...values, limit, offset)
    .all();

  const countResult = await db
    .prepare(`SELECT COUNT(*) AS cnt FROM users u ${whereClause}`)
    .bind(...values)
    .first();

  return {
    items: (result.results || []).map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      activeSessions: Number(row.active_sessions || 0),
      transactionCount: Number(row.transaction_count || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    total: Number(countResult?.cnt || 0),
  };
}

async function getAdminUserDetail(db, userId) {
  const user = await db
    .prepare('SELECT id, email, display_name, role, created_at, updated_at FROM users WHERE id = ?')
    .bind(userId)
    .first();

  if (!user) {
    throw new HttpError(404, 'User not found.');
  }

  const sessions = await db
    .prepare("SELECT COUNT(*) AS cnt FROM auth_sessions WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP")
    .bind(userId)
    .first();

  const transactions = await db
    .prepare("SELECT COUNT(*) AS cnt FROM finance_transactions WHERE user_id = ? AND status != 'deleted'")
    .bind(userId)
    .first();

  const pantryItems = await db
    .prepare("SELECT COUNT(*) AS cnt FROM pantry_items WHERE user_id = ? AND status = 'active'")
    .bind(userId)
    .first();

  const vehicles = await db
    .prepare("SELECT COUNT(*) AS cnt FROM vehicles WHERE user_id = ? AND status != 'deleted'")
    .bind(userId)
    .first();

  const subscriptions = await db
    .prepare("SELECT COUNT(*) AS cnt FROM subscriptions WHERE user_id = ? AND status = 'active'")
    .bind(userId)
    .first();

  const notes = await db
    .prepare("SELECT COUNT(*) AS cnt FROM notes WHERE user_id = ? AND status = 'active'")
    .bind(userId)
    .first();

  const lastSession = await db
    .prepare('SELECT last_seen_at FROM auth_sessions WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 1')
    .bind(userId)
    .first();

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastSeenAt: lastSession?.last_seen_at || null,
    activeSessions: Number(sessions?.cnt || 0),
    stats: {
      transactions: Number(transactions?.cnt || 0),
      pantryItems: Number(pantryItems?.cnt || 0),
      vehicles: Number(vehicles?.cnt || 0),
      subscriptions: Number(subscriptions?.cnt || 0),
      notes: Number(notes?.cnt || 0),
    },
  };
}

async function updateUserRole(db, actor, targetId, payload) {
  if (targetId === actor.userId) {
    throw new HttpError(400, 'You cannot change your own role.');
  }

  const target = await db.prepare('SELECT id, role FROM users WHERE id = ?').bind(targetId).first();

  if (!target) {
    throw new HttpError(404, 'User not found.');
  }

  // Only the owner can promote/demote admins or change the owner
  if (target.role === 'owner') {
    throw new HttpError(403, 'The owner account cannot be modified by another user.');
  }

  if (payload.role) {
    const newRole = normalizeEnum(payload.role, ['admin', 'user', 'suspended'], 'Invalid role. Must be admin, user, or suspended.');

    // Only owner can set admin role
    if (newRole === 'admin' && actor.role !== 'owner') {
      throw new HttpError(403, 'Only the owner can promote users to admin.');
    }

    // If target is admin, only owner can change
    if (target.role === 'admin' && actor.role !== 'owner') {
      throw new HttpError(403, 'Only the owner can modify admin accounts.');
    }

    await db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(newRole, targetId)
      .run();

    // If suspending, kill all their sessions
    if (newRole === 'suspended') {
      await db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(targetId).run();
    }
  }

  return getAdminUserDetail(db, targetId);
}

async function deleteUserCascade(db, userId) {
  const user = await db.prepare('SELECT id, role FROM users WHERE id = ?').bind(userId).first();

  if (!user) {
    throw new HttpError(404, 'User not found.');
  }

  if (user.role === 'owner') {
    throw new HttpError(403, 'The owner account cannot be deleted.');
  }

  // The ON DELETE CASCADE in the schema handles most tables.
  // Delete sessions first, then the user row cascades everything else.
  await db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM auth_credentials WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
}

// --- Admin: audit log ---

async function listAuditLog(db, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 200);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
  const actionFilter = url.searchParams.get('action');

  const where = [];
  const values = [];

  if (actionFilter) {
    where.push('a.action LIKE ?');
    values.push(`${actionFilter}%`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const result = await db
    .prepare(
      `SELECT a.*, u.email AS actor_email, u.display_name AS actor_name
       FROM admin_audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...values, limit, offset)
    .all();

  const countResult = await db
    .prepare(`SELECT COUNT(*) AS cnt FROM admin_audit_log a ${whereClause}`)
    .bind(...values)
    .first();

  return {
    items: (result.results || []).map(mapAuditEntry),
    total: Number(countResult?.cnt || 0),
  };
}

function mapAuditEntry(row) {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorEmail: row.actor_email || null,
    actorName: row.actor_name || null,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: parseJson(row.details_json, {}),
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  };
}

// --- Admin: config ---

async function listAdminConfig(db) {
  const result = await db
    .prepare('SELECT key, value, updated_by, updated_at FROM admin_config ORDER BY key')
    .all();

  return (result.results || []).map((row) => ({
    key: row.key,
    value: row.value,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }));
}

async function updateAdminConfig(db, actorId, payload) {
  const entries = Object.entries(payload);

  for (const [key, value] of entries) {
    await db
      .prepare(
        `INSERT INTO admin_config (key, value, updated_by, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .bind(key, String(value), actorId)
      .run();
  }
}

// --- Admin: announcements ---

async function listAnnouncements(db) {
  const result = await db
    .prepare(
      `SELECT a.*, u.email AS author_email, u.display_name AS author_name
       FROM admin_announcements a
       LEFT JOIN users u ON u.id = a.author_id
       ORDER BY a.created_at DESC`,
    )
    .all();

  return (result.results || []).map(mapAnnouncement);
}

async function createAnnouncement(db, authorId, payload) {
  const id = crypto.randomUUID();
  const title = requiredText(payload.title, 'Announcement title is required.');
  const body = requiredText(payload.body, 'Announcement body is required.');
  const severity = normalizeEnum(
    payload.severity || 'info',
    ['info', 'warning', 'critical'],
    'Severity must be info, warning, or critical.',
  );

  await db
    .prepare(
      `INSERT INTO admin_announcements (id, author_id, title, body, severity, is_active, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?)`,
    )
    .bind(id, authorId, title, body, severity, payload.endsAt || null)
    .run();

  return getAnnouncement(db, id);
}

async function updateAnnouncement(db, id, payload) {
  const existing = await getAnnouncement(db, id);

  if (!existing) {
    throw new HttpError(404, 'Announcement not found.');
  }

  const fields = {};

  if (payload.title !== undefined) fields.title = payload.title;
  if (payload.body !== undefined) fields.body = payload.body;
  if (payload.severity !== undefined) {
    fields.severity = normalizeEnum(payload.severity, ['info', 'warning', 'critical'], 'Invalid severity.');
  }
  if (payload.isActive !== undefined) fields.is_active = payload.isActive ? 1 : 0;
  if (payload.endsAt !== undefined) fields.ends_at = payload.endsAt;

  const updates = Object.entries(fields).filter(([, v]) => v !== undefined);

  if (updates.length > 0) {
    const assignments = updates.map(([key]) => `${key} = ?`).join(', ');
    const values = updates.map(([, value]) => value);

    await db
      .prepare(`UPDATE admin_announcements SET ${assignments} WHERE id = ?`)
      .bind(...values, id)
      .run();
  }

  return getAnnouncement(db, id);
}

async function deleteAnnouncement(db, id) {
  await db.prepare('DELETE FROM admin_announcements WHERE id = ?').bind(id).run();
}

async function getAnnouncement(db, id) {
  const row = await db
    .prepare(
      `SELECT a.*, u.email AS author_email, u.display_name AS author_name
       FROM admin_announcements a
       LEFT JOIN users u ON u.id = a.author_id
       WHERE a.id = ?`,
    )
    .bind(id)
    .first();

  return row ? mapAnnouncement(row) : null;
}

function mapAnnouncement(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    authorEmail: row.author_email || null,
    authorName: row.author_name || null,
    title: row.title,
    body: row.body,
    severity: row.severity,
    isActive: Boolean(row.is_active),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Subscriptions & bill radar
// ---------------------------------------------------------------------------

async function handleSubscriptionsRoute({ db, request, route, user }) {
  const [resource] = route;

  if (!resource) {
    if (request.method === 'GET') {
      return sendJson(await getSubscriptionsSummary(db, user.userId));
    }
    if (request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ subscription: await createSubscription(db, user.userId, payload) }, 201);
    }
  }

  if (resource === 'detect' && request.method === 'POST') {
    return sendJson({ candidates: await detectSubscriptions(db, user.userId) });
  }

  if (resource && request.method === 'PATCH') {
    const payload = await readJson(request);
    return sendJson({ subscription: await updateSubscription(db, user.userId, resource, payload) });
  }

  if (resource && request.method === 'DELETE') {
    await db.prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?').bind(resource, user.userId).run();
    return sendJson({ ok: true });
  }

  return sendJson({ error: 'Not found' }, 404);
}

const CADENCE_PER_MONTH = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, custom: 1 };

async function getSubscriptionsSummary(db, userId) {
  const result = await db
    .prepare("SELECT * FROM subscriptions WHERE user_id = ? AND status != 'cancelled' ORDER BY next_renewal_on IS NULL, next_renewal_on ASC, name ASC")
    .bind(userId)
    .all();
  const subscriptions = (result.results || []).map(mapSubscription);
  const active = subscriptions.filter((item) => item.status === 'active');

  const monthlyEstimateMinor = Math.round(active.reduce((sum, item) => sum + item.amountMinor * (CADENCE_PER_MONTH[item.cadence] || 1), 0));
  const now = today();
  const upcoming = active
    .filter((item) => item.nextRenewalOn && daysBetween(now, item.nextRenewalOn) >= 0 && daysBetween(now, item.nextRenewalOn) <= 30)
    .map((item) => ({ ...item, daysUntil: daysBetween(now, item.nextRenewalOn) }))
    .sort((a, b) => a.daysUntil - b.daysUntil);
  const priceHikes = active.filter((item) => item.previousAmountMinor != null && item.amountMinor > item.previousAmountMinor)
    .map((item) => ({ ...item, increaseMinor: item.amountMinor - item.previousAmountMinor }));

  return {
    subscriptions,
    activeCount: active.length,
    monthlyEstimateMinor,
    yearlyEstimateMinor: monthlyEstimateMinor * 12,
    upcoming,
    priceHikes,
  };
}

async function createSubscription(db, userId, payload) {
  const id = payload.id || crypto.randomUUID();
  const amountMinor = moneyOrNull(payload.amount) ?? 0;

  await db
    .prepare(
      `INSERT INTO subscriptions (id, user_id, name, provider, category, amount_minor, previous_amount_minor, currency, cadence, next_renewal_on, reminder_days_before, status, merchant_key, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      requiredText(payload.name, 'Subscription name is required.'),
      payload.provider || null,
      payload.category || 'Other',
      amountMinor,
      moneyOrNull(payload.previousAmount),
      normalizeCurrency(payload.currency || 'USD'),
      normalizeEnum(payload.cadence || 'monthly', ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'], 'Invalid cadence.'),
      dateOrNull(payload.nextRenewalOn),
      Number.isFinite(Number(payload.reminderDaysBefore)) ? Math.max(0, Math.round(Number(payload.reminderDaysBefore))) : 3,
      normalizeEnum(payload.status || 'active', ['active', 'paused', 'cancelled'], 'Invalid status.'),
      payload.merchantKey || (payload.name ? normalizeMerchantKey(payload.name) : null),
      payload.notes || null,
    )
    .run();

  return getSubscription(db, userId, id);
}

async function updateSubscription(db, userId, id, payload) {
  const allowed = {
    name: payload.name,
    provider: payload.provider,
    category: payload.category,
    amount_minor: payload.amount !== undefined ? (moneyOrNull(payload.amount) ?? 0) : undefined,
    previous_amount_minor: payload.previousAmount !== undefined ? moneyOrNull(payload.previousAmount) : undefined,
    currency: payload.currency ? normalizeCurrency(payload.currency) : undefined,
    cadence: payload.cadence ? normalizeEnum(payload.cadence, ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'], 'Invalid cadence.') : undefined,
    next_renewal_on: payload.nextRenewalOn !== undefined ? dateOrNull(payload.nextRenewalOn) : undefined,
    reminder_days_before: payload.reminderDaysBefore !== undefined ? Math.max(0, Math.round(Number(payload.reminderDaysBefore))) : undefined,
    status: payload.status ? normalizeEnum(payload.status, ['active', 'paused', 'cancelled'], 'Invalid status.') : undefined,
    notes: payload.notes,
  };

  await updateById(db, 'subscriptions', userId, id, allowed);
  return getSubscription(db, userId, id);
}

async function getSubscription(db, userId, id) {
  const row = await db.prepare('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?').bind(id, userId).first();
  return row ? mapSubscription(row) : null;
}

async function detectSubscriptions(db, userId) {
  const existing = await db.prepare("SELECT merchant_key FROM subscriptions WHERE user_id = ? AND status != 'cancelled'").bind(userId).all();
  const tracked = new Set((existing.results || []).map((row) => row.merchant_key).filter(Boolean));

  const result = await db
    .prepare(
      `SELECT merchant, currency, amount_minor, occurred_on
       FROM finance_transactions
       WHERE user_id = ? AND type = 'expense' AND status != 'deleted' AND merchant IS NOT NULL AND merchant != ''
       ORDER BY occurred_on ASC`,
    )
    .bind(userId)
    .all();

  const groups = new Map();
  for (const row of result.results || []) {
    const key = normalizeMerchantKey(row.merchant);
    if (!key || tracked.has(key)) continue;
    if (!groups.has(key)) groups.set(key, { key, merchant: row.merchant, currency: row.currency, charges: [] });
    groups.get(key).charges.push({ amountMinor: Number(row.amount_minor || 0), date: row.occurred_on });
  }

  const candidates = [];
  for (const group of groups.values()) {
    if (group.charges.length < 2) continue;

    const gaps = [];
    for (let i = 1; i < group.charges.length; i += 1) {
      gaps.push(daysBetween(group.charges[i - 1].date, group.charges[i].date));
    }
    const medianGap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || 30;
    const cadence = cadenceFromGap(medianGap);
    if (!cadence) continue; // irregular spacing — probably not a subscription

    const amounts = group.charges.map((charge) => charge.amountMinor);
    const latest = group.charges[group.charges.length - 1];
    const firstAmount = amounts[0];
    const increaseMinor = latest.amountMinor > firstAmount ? latest.amountMinor - firstAmount : 0;

    candidates.push({
      merchant: group.merchant,
      merchantKey: group.key,
      amountMinor: latest.amountMinor,
      previousAmountMinor: increaseMinor > 0 ? firstAmount : null,
      increaseMinor,
      currency: group.currency || 'USD',
      cadence,
      occurrences: group.charges.length,
      lastDate: latest.date,
      nextRenewalOn: addDays(latest.date, cadenceDays(cadence)),
    });
  }

  return candidates.sort((a, b) => b.occurrences - a.occurrences).slice(0, 20);
}

function cadenceFromGap(days) {
  if (days >= 5 && days <= 9) return 'weekly';
  if (days >= 25 && days <= 35) return 'monthly';
  if (days >= 84 && days <= 96) return 'quarterly';
  if (days >= 350 && days <= 380) return 'yearly';
  return null;
}

function cadenceDays(cadence) {
  return { weekly: 7, monthly: 30, quarterly: 91, yearly: 365 }[cadence] || 30;
}

function normalizeMerchantKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function mapSubscription(row) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    category: row.category,
    amountMinor: Number(row.amount_minor || 0),
    previousAmountMinor: row.previous_amount_minor === null || row.previous_amount_minor === undefined ? null : Number(row.previous_amount_minor),
    currency: row.currency,
    cadence: row.cadence,
    nextRenewalOn: row.next_renewal_on,
    reminderDaysBefore: Number(row.reminder_days_before || 0),
    status: row.status,
    merchantKey: row.merchant_key,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Important-dates vault
// ---------------------------------------------------------------------------

async function handleDatesRoute({ db, request, route, user }) {
  const [resource] = route;

  if (!resource) {
    if (request.method === 'GET') {
      return sendJson(await getDatesSummary(db, user.userId));
    }
    if (request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ date: await createImportantDate(db, user.userId, payload) }, 201);
    }
  }

  if (resource && request.method === 'PATCH') {
    const payload = await readJson(request);
    return sendJson({ date: await updateImportantDate(db, user.userId, resource, payload) });
  }

  if (resource && request.method === 'DELETE') {
    await db.prepare('DELETE FROM important_dates WHERE id = ? AND user_id = ?').bind(resource, user.userId).run();
    return sendJson({ ok: true });
  }

  return sendJson({ error: 'Not found' }, 404);
}

async function getDatesSummary(db, userId) {
  const result = await db
    .prepare("SELECT * FROM important_dates WHERE user_id = ? AND status = 'active' ORDER BY due_on ASC")
    .bind(userId)
    .all();
  const now = today();
  const dates = (result.results || []).map(mapImportantDate).map((item) => {
    const nextOn = nextOccurrence(item.dueOn, item.recurs, now);
    return { ...item, nextOn, daysUntil: nextOn ? daysBetween(now, nextOn) : null };
  }).sort((a, b) => (a.daysUntil ?? 1e9) - (b.daysUntil ?? 1e9));

  const upcoming = dates.filter((item) => item.daysUntil !== null && item.daysUntil >= 0 && item.daysUntil <= 60);
  const overdue = dates.filter((item) => item.daysUntil !== null && item.daysUntil < 0);

  return { dates, upcoming, overdue, count: dates.length };
}

function nextOccurrence(dueOn, recurs, now) {
  if (!dueOn) return null;
  if (recurs === 'none') return dueOn;

  const base = new Date(`${dueOn}T00:00:00Z`);
  const current = new Date(`${now}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return dueOn;

  const next = new Date(base.getTime());
  if (recurs === 'annual') {
    next.setUTCFullYear(current.getUTCFullYear());
    if (next < current) next.setUTCFullYear(current.getUTCFullYear() + 1);
  } else if (recurs === 'monthly') {
    next.setUTCFullYear(current.getUTCFullYear());
    next.setUTCMonth(current.getUTCMonth());
    if (next < current) next.setUTCMonth(current.getUTCMonth() + 1);
  }
  return next.toISOString().slice(0, 10);
}

async function createImportantDate(db, userId, payload) {
  const id = payload.id || crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO important_dates (id, user_id, title, category, person, due_on, recurs, reminder_days_before, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    )
    .bind(
      id,
      userId,
      requiredText(payload.title, 'A title is required.'),
      normalizeEnum(payload.category || 'other', ['passport', 'license', 'visa', 'warranty', 'insurance', 'registration', 'birthday', 'anniversary', 'subscription', 'tax', 'medical', 'other'], 'Invalid category.'),
      payload.person || null,
      normalizeDate(payload.dueOn),
      normalizeEnum(payload.recurs || 'none', ['none', 'annual', 'monthly'], 'Invalid recurrence.'),
      Number.isFinite(Number(payload.reminderDaysBefore)) ? Math.max(0, Math.round(Number(payload.reminderDaysBefore))) : 14,
      payload.notes || null,
    )
    .run();
  return getImportantDate(db, userId, id);
}

async function updateImportantDate(db, userId, id, payload) {
  const allowed = {
    title: payload.title,
    category: payload.category ? normalizeEnum(payload.category, ['passport', 'license', 'visa', 'warranty', 'insurance', 'registration', 'birthday', 'anniversary', 'subscription', 'tax', 'medical', 'other'], 'Invalid category.') : undefined,
    person: payload.person,
    due_on: payload.dueOn ? normalizeDate(payload.dueOn) : undefined,
    recurs: payload.recurs ? normalizeEnum(payload.recurs, ['none', 'annual', 'monthly'], 'Invalid recurrence.') : undefined,
    reminder_days_before: payload.reminderDaysBefore !== undefined ? Math.max(0, Math.round(Number(payload.reminderDaysBefore))) : undefined,
    notes: payload.notes,
    status: payload.status ? normalizeEnum(payload.status, ['active', 'archived'], 'Invalid status.') : undefined,
  };
  await updateById(db, 'important_dates', userId, id, allowed);
  return getImportantDate(db, userId, id);
}

async function getImportantDate(db, userId, id) {
  const row = await db.prepare('SELECT * FROM important_dates WHERE id = ? AND user_id = ?').bind(id, userId).first();
  return row ? mapImportantDate(row) : null;
}

function mapImportantDate(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    person: row.person,
    dueOn: row.due_on,
    recurs: row.recurs,
    reminderDaysBefore: Number(row.reminder_days_before || 0),
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Notes / inbox
// ---------------------------------------------------------------------------

async function handleNotesRoute({ db, request, route, user, env }) {
  const [resource] = route;

  if (!resource) {
    if (request.method === 'GET') {
      return sendJson({ notes: await listNotes(db, user.userId) });
    }
    if (request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ note: await createNote(db, user.userId, payload) }, 201);
    }
  }

  if (resource === 'resurface' && request.method === 'GET') {
    return sendJson(await resurfaceNotes(db, env, user.userId));
  }

  if (resource && request.method === 'PATCH') {
    const payload = await readJson(request);
    return sendJson({ note: await updateNote(db, user.userId, resource, payload) });
  }

  if (resource && request.method === 'DELETE') {
    await db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').bind(resource, user.userId).run();
    return sendJson({ ok: true });
  }

  return sendJson({ error: 'Not found' }, 404);
}

async function listNotes(db, userId) {
  const result = await db
    .prepare("SELECT * FROM notes WHERE user_id = ? AND status != 'archived' ORDER BY is_pinned DESC, created_at DESC LIMIT 200")
    .bind(userId)
    .all();
  return (result.results || []).map(mapNote);
}

async function createNote(db, userId, payload) {
  const id = payload.id || crypto.randomUUID();
  await db
    .prepare('INSERT INTO notes (id, user_id, body, kind, tags_json, is_pinned, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(
      id,
      userId,
      requiredText(payload.body, 'Write something first.'),
      normalizeEnum(payload.kind || 'note', ['note', 'idea', 'question', 'follow_up'], 'Invalid note kind.'),
      JSON.stringify(Array.isArray(payload.tags) ? payload.tags.slice(0, 20) : []),
      payload.isPinned ? 1 : 0,
      normalizeEnum(payload.status || 'active', ['active', 'done', 'archived'], 'Invalid status.'),
    )
    .run();
  return getNote(db, userId, id);
}

async function updateNote(db, userId, id, payload) {
  const allowed = {
    body: payload.body,
    kind: payload.kind ? normalizeEnum(payload.kind, ['note', 'idea', 'question', 'follow_up'], 'Invalid note kind.') : undefined,
    tags_json: payload.tags !== undefined ? JSON.stringify(Array.isArray(payload.tags) ? payload.tags.slice(0, 20) : []) : undefined,
    is_pinned: payload.isPinned !== undefined ? (payload.isPinned ? 1 : 0) : undefined,
    status: payload.status ? normalizeEnum(payload.status, ['active', 'done', 'archived'], 'Invalid status.') : undefined,
  };
  await updateById(db, 'notes', userId, id, allowed);
  return getNote(db, userId, id);
}

async function getNote(db, userId, id) {
  const row = await db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').bind(id, userId).first();
  return row ? mapNote(row) : null;
}

async function resurfaceNotes(db, env, userId) {
  const result = await db
    .prepare("SELECT * FROM notes WHERE user_id = ? AND status = 'active' ORDER BY created_at ASC LIMIT 30")
    .bind(userId)
    .all();
  const notes = (result.results || []).map(mapNote);
  const cutoff = addDays(today(), -7);
  const candidates = notes.filter((note) => String(note.createdAt || '').slice(0, 10) <= cutoff).slice(0, 5);

  if (candidates.length === 0) {
    return { items: [] };
  }

  try {
    if (env && env.GEMINI_API_KEY) {
      const prompt = [
        'You are a helpful "second brain". The user saved these notes a while ago and may have forgotten them.',
        'For each note, write ONE short, friendly follow-up question to check whether it is still relevant or already resolved.',
        'Notes:',
        candidates.map((note, index) => `${index + 1}. (${String(note.createdAt).slice(0, 10)}) ${note.body}`).join('\n'),
      ].join('\n');
      const schema = {
        type: 'OBJECT',
        properties: {
          followUps: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { index: { type: 'NUMBER' }, question: { type: 'STRING' } },
              required: ['index', 'question'],
            },
          },
        },
      };
      const parsed = await geminiGenerateJson(env, prompt, schema);
      const map = new Map((parsed.followUps || []).map((entry) => [Number(entry.index), entry.question]));
      return { items: candidates.map((note, index) => ({ ...note, followUp: map.get(index + 1) || 'Is this still relevant, or already done?' })) };
    }
  } catch {
    // Fall back to a generic nudge.
  }

  return { items: candidates.map((note) => ({ ...note, followUp: 'Is this still relevant, or already done?' })) };
}

function mapNote(row) {
  return {
    id: row.id,
    body: row.body,
    kind: row.kind,
    tags: parseJson(row.tags_json, []),
    isPinned: Number(row.is_pinned || 0) === 1,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function handleMetaRoute({ request }) {
  const url = new URL(request.url);
  const resource = normalizeRoute(url.pathname)[1];

  if (resource && resource !== 'context') {
    return sendJson({ error: 'Not found' }, 404);
  }

  const cf = request.cf || {};
  const location = {
    city: cf.city || null,
    region: cf.region || null,
    country: cf.country || null,
    timezone: cf.timezone || null,
    latitude: cf.latitude ? Number(cf.latitude) : null,
    longitude: cf.longitude ? Number(cf.longitude) : null,
  };

  return sendJson({
    serverTime: new Date().toISOString(),
    location,
    fx: await getExchangeRates(),
  });
}

async function getExchangeRates() {
  try {
    const cache = caches.default;
    const cacheKey = new Request('https://lifeos.local/__fx/usd-inr');
    let cached = cache ? await cache.match(cacheKey) : null;

    if (!cached) {
      const response = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR');
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      const body = JSON.stringify({
        base: data.base || 'USD',
        date: data.date || null,
        rates: data.rates || {},
      });
      cached = new Response(body, {
        headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
      });
      if (cache) {
        await cache.put(cacheKey, cached.clone());
      }
    }

    return await cached.json();
  } catch {
    return null;
  }
}

async function authenticateRequest(request, db, env, options = {}) {
  const allowDemo = options.allowDemo ?? true;
  const accessEmail = request.headers.get('cf-access-authenticated-user-email');
  const authMode = env.AUTH_MODE || (env.REQUIRE_ACCESS === 'true' ? 'access' : 'demo');

  if (accessEmail) {
    return {
      userId: request.headers.get('cf-access-authenticated-user-id') || accessEmail,
      email: accessEmail,
      displayName: accessEmail.split('@')[0],
      mode: 'access',
    };
  }

  if (authMode === 'access') {
    return { error: 'Authentication required' };
  }

  const sessionToken = readCookie(request, 'lifeos_session');

  if (sessionToken) {
    const sessionHash = await sha256Base64Url(sessionToken);
    const row = await db
      .prepare(
        `
        SELECT u.id, u.email, u.display_name, u.role
        FROM auth_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.session_hash = ?
          AND s.expires_at > CURRENT_TIMESTAMP
        LIMIT 1
      `,
      )
      .bind(sessionHash)
      .first();

    if (row) {
      // Suspended users cannot continue even with a valid session
      if (row.role === 'suspended') {
        await db.prepare('DELETE FROM auth_sessions WHERE session_hash = ?').bind(sessionHash).run();
        return { error: 'Your account has been suspended. Contact the administrator.' };
      }

      // Sliding expiration: every authenticated request pushes the expiry out,
      // so a continuously-active session never times out. Idle sessions still expire.
      const days = Number(env.SESSION_DAYS || 30);
      const newExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      await db
        .prepare('UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP, expires_at = ? WHERE session_hash = ?')
        .bind(newExpiry, sessionHash)
        .run();

      return {
        userId: row.id,
        email: row.email,
        displayName: row.display_name || row.email.split('@')[0],
        role: row.role || 'user',
        mode: 'public',
      };
    }
  }

  if (authMode === 'public') {
    return { error: 'Please sign in to continue.' };
  }

  if (!allowDemo) {
    return { error: 'Not signed in.' };
  }

  const email = request.headers.get('x-user-email') || env.DEV_USER_EMAIL || DEFAULT_USER_EMAIL;

  return {
    userId: request.headers.get('x-user-id') || env.DEV_USER_ID || DEFAULT_USER_ID,
    email,
    displayName: email.split('@')[0],
    mode: 'demo',
  };
}

async function createLoginResponse(db, request, user, env) {
  const token = randomToken(32);
  const sessionHash = await sha256Base64Url(token);
  const days = Number(env.SESSION_DAYS || 30);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  await db
    .prepare(
      `
      INSERT INTO auth_sessions (id, user_id, session_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `,
    )
    .bind(crypto.randomUUID(), user.userId, sessionHash, expiresAt.toISOString())
    .run();

  return sendJson({
    authenticated: true,
    user: {
      id: user.userId,
      email: user.email,
      displayName: user.displayName,
      role: user.role || 'user',
      hasCompletedOnboarding: user.hasCompletedOnboarding || false,
      mode: 'public',
    },
  }, 200, {
    'set-cookie': sessionCookie(request, token, days),
  });
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: base64UrlToBytes(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    key,
    256,
  );

  return bytesToBase64Url(new Uint8Array(bits));
}

async function sha256Base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToBase64Url(new Uint8Array(digest));
}

function normalizeEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new HttpError(400, 'Enter a valid email address.');
  }

  return normalized;
}

function readCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function sessionCookie(request, token, days) {
  const secure = isLocalRequest(request) ? '' : '; Secure';
  const maxAge = days * 24 * 60 * 60;

  return `lifeos_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function expiredSessionCookie(request) {
  const secure = isLocalRequest(request) ? '' : '; Secure';
  return `lifeos_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

function isLocalRequest(request) {
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function randomToken(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlToBytes(value) {
  const padded = `${value.replaceAll('-', '+').replaceAll('_', '/')}${'='.repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function normalizeTransactionType(type) {
  const normalized = String(type || '').toLowerCase();
  const allowed = new Set(['income', 'expense', 'transfer', 'refund']);

  if (!allowed.has(normalized)) {
    throw new HttpError(400, 'Transaction type must be income, expense, transfer, or refund.');
  }

  return normalized;
}

function normalizeLiabilityType(type) {
  const normalized = String(type || '').toLowerCase();
  const allowed = new Set(['loan', 'credit_card', 'emi', 'mortgage', 'other']);

  if (!allowed.has(normalized)) {
    throw new HttpError(400, 'Loan type must be loan, credit_card, emi, mortgage, or other.');
  }

  return normalized;
}

function normalizePantryStatus(status) {
  return normalizeEnum(status, ['active', 'used', 'expired', 'deleted'], 'Invalid pantry status.');
}

function normalizeShoppingStatus(status) {
  return normalizeEnum(status, ['open', 'purchased', 'dismissed', 'deleted'], 'Invalid shopping status.');
}

function normalizeShoppingSource(source) {
  return normalizeEnum(source, ['manual', 'low_stock', 'recipe', 'system'], 'Invalid shopping source.');
}

function normalizeVehicleStatus(status) {
  return normalizeEnum(status, ['parked', 'driving', 'charging', 'service', 'inactive', 'deleted'], 'Invalid vehicle status.');
}

function normalizeMaintenanceStatus(status) {
  return normalizeEnum(status, ['open', 'scheduled', 'done', 'dismissed', 'deleted'], 'Invalid maintenance status.');
}

function normalizePriority(priority) {
  return normalizeEnum(priority, ['low', 'normal', 'high'], 'Invalid priority.');
}

function normalizeEnum(value, allowed, message) {
  const normalized = String(value || '').trim().toLowerCase();

  if (!allowed.includes(normalized)) {
    throw new HttpError(400, message);
  }

  return normalized;
}

function normalizeCurrency(currency) {
  const normalized = String(currency || 'USD').trim().toUpperCase();

  if (!['USD', 'INR'].includes(normalized)) {
    throw new HttpError(400, 'Currency must be USD or INR.');
  }

  return normalized;
}

function normalizeMoney(amountMinor, amount) {
  if (amountMinor !== undefined && amountMinor !== null && amountMinor !== '') {
    return normalizeAmount(amountMinor, true);
  }

  return normalizeAmount(amount, false);
}

function moneyFromPayload(payload, minorKeys, amountKeys) {
  for (const key of minorKeys) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
      return normalizeAmount(payload[key], true);
    }
  }

  for (const key of amountKeys) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
      return normalizeAmount(payload[key], false);
    }
  }

  return undefined;
}

function requiredMoneyFromPayload(payload, minorKeys, amountKeys, message) {
  const value = moneyFromPayload(payload, minorKeys, amountKeys);

  if (value === undefined) {
    throw new HttpError(400, message || 'Amount is required.');
  }

  return value;
}

function normalizeAmount(value, alreadyMinor) {
  if (value === undefined || value === null || value === '') {
    throw new HttpError(400, 'Amount is required.');
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new HttpError(400, 'Amount must be a positive number.');
  }

  return alreadyMinor ? Math.round(numeric) : Math.round(numeric * 100);
}

function requiredText(value, message) {
  const text = String(value || '').trim();

  if (!text) {
    throw new HttpError(400, message);
  }

  return text;
}

function normalizeQuantity(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new HttpError(400, 'Quantity must be a positive number.');
  }

  return numeric;
}

function clampInteger(value, min, max) {
  const numeric = Math.round(Number(value));

  if (!Number.isFinite(numeric)) {
    throw new HttpError(400, 'Enter a valid number.');
  }

  return Math.min(max, Math.max(min, numeric));
}

function daysBetween(start, end) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  return Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000);
}

async function updateById(db, tableName, userId, id, fields) {
  const allowedTables = new Set([
    'pantry_items',
    'pantry_shopping_items',
    'meal_plan_entries',
    'vehicles',
    'vehicle_maintenance_items',
    'subscriptions',
    'important_dates',
    'notes',
  ]);

  if (!allowedTables.has(tableName)) {
    throw new HttpError(500, 'Invalid update target.');
  }

  const updates = Object.entries(fields).filter(([, value]) => value !== undefined);

  if (!updates.length) {
    return;
  }

  await db
    .prepare(
      `
      UPDATE ${tableName}
      SET ${updates.map(([key]) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
    )
    .bind(...updates.map(([, value]) => value), id, userId)
    .run();
}

function normalizeDate(value) {
  if (!value) {
    throw new HttpError(400, 'Date is required.');
  }

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'Date must be a valid YYYY-MM-DD value.');
  }

  return date.toISOString().slice(0, 10);
}

function monthBounds(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  const startDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const nextDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const previousDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));

  return {
    start: startDate.toISOString().slice(0, 10),
    nextStart: nextDate.toISOString().slice(0, 10),
    previousStart: previousDate.toISOString().slice(0, 10),
  };
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextPaymentDateFromDueDay(value) {
  const dueDay = clampInteger(value, 1, 31);
  const now = new Date(`${today()}T00:00:00Z`);
  const currentMonthDay = Math.min(
    dueDay,
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate(),
  );
  let paymentDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), currentMonthDay));

  if (paymentDate < now) {
    const nextMonthDay = Math.min(
      dueDay,
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0)).getUTCDate(),
    );
    paymentDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, nextMonthDay));
  }

  return paymentDate.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function csvCell(value) {
  const text = String(value ?? '');

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function assertMethod(request, method) {
  if (request.method !== method) {
    throw new HttpError(405, `Method ${request.method} is not allowed.`);
  }
}

function sendJson(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...jsonHeaders,
      ...headers,
    },
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// AI Dev Planner & Comprehension Tool (admin only)
// Notes -> structured tasks -> prompts -> estimates -> status -> comprehension
// summary -> standup digest. Reuses the existing Gemini integration.
// ---------------------------------------------------------------------------

const PLANNER_STATUSES = ['planned', 'in_progress', 'done', 'blocked'];
const PLANNER_PRIORITIES = ['critical', 'high', 'medium', 'low'];
const PLANNER_VALIDATION_STATUSES = ['pending', 'confirmed', 'edited', 'rejected', 'merged', 'split'];
const PLANNER_MAX_NOTES = 40000;

async function handlePlannerRoute({ db, request, url, route, user, env }) {
  requireAdmin(user);

  const [resource, second, third] = route;

  // --- WorkOS dashboard (aggregate landing page) ---
  if (resource === 'dashboard' && request.method === 'GET') {
    return sendJson(await getPlannerDashboard(db, user.userId, url));
  }

  // --- Projects (D4) ---
  if (resource === 'projects') {
    if (!second && request.method === 'GET') {
      return sendJson({ projects: await listPlannerProjects(db, user.userId) });
    }

    if (!second && request.method === 'POST') {
      const project = await createPlannerProject(db, user.userId, await readJson(request));
      await auditLog(db, user.userId, 'planner.project.create', 'planner_project', project.id, { name: project.name }, clientIp(request));
      return sendJson({ project }, 201);
    }

    if (second && !third && request.method === 'GET') {
      return sendJson(await getPlannerProjectDetail(db, user.userId, second));
    }

    if (second && request.method === 'PATCH') {
      return sendJson({ project: await updatePlannerProject(db, user.userId, second, await readJson(request)) });
    }

    if (second && request.method === 'DELETE') {
      await db.prepare('DELETE FROM planner_projects WHERE id = ? AND created_by = ?').bind(second, user.userId).run();
      await auditLog(db, user.userId, 'planner.project.delete', 'planner_project', second, {}, clientIp(request));
      return sendJson({ ok: true });
    }
  }

  // --- Prompt library ---
  if (resource === 'prompt-templates') {
    if (!second && request.method === 'GET') {
      return sendJson({ templates: await listPlannerPromptTemplates(db, user.userId, url) });
    }

    if (!second && request.method === 'POST') {
      return sendJson({ template: await createPlannerPromptTemplate(db, user.userId, await readJson(request)) }, 201);
    }

    if (second && request.method === 'PUT') {
      return sendJson({ template: await updatePlannerPromptTemplate(db, user.userId, second, await readJson(request)) });
    }

    if (second && request.method === 'DELETE') {
      await db.prepare('DELETE FROM planner_prompt_templates WHERE id = ? AND created_by = ?').bind(second, user.userId).run();
      return sendJson({ ok: true });
    }
  }

  // --- Module A: structure free-text notes into task drafts (not persisted) ---
  if (resource === 'structure' && request.method === 'POST') {
    const payload = await readJson(request);
    return sendJson(await structurePlannerNotes(env, payload));
  }

  // --- MOM import: meeting -> deliverables -> tasks ---
  if (resource === 'meetings') {
    // Extract a meeting summary + deliverables + task proposals (nothing persisted yet).
    if (second === 'extract' && request.method === 'POST') {
      return sendJson(await extractPlannerMeeting(env, await readJson(request)));
    }

    // Commit the reviewed tree (meeting + deliverables + accepted tasks).
    if (second === 'commit' && request.method === 'POST') {
      const result = await commitPlannerMeeting(db, user.userId, await readJson(request));
      await auditLog(db, user.userId, 'planner.meeting.commit', 'planner_meeting', result.meeting.id, { tasks: result.tasks.length }, clientIp(request));
      return sendJson(result, 201);
    }

    if (second && request.method === 'GET') {
      return sendJson(await getPlannerMeeting(db, user.userId, second));
    }
  }

  // --- Tasks ---
  if (resource === 'tasks') {
    // A4-A6: bulk-accept edited drafts
    if (second === 'accept' && request.method === 'POST') {
      const result = await acceptPlannerTasks(db, user.userId, await readJson(request));
      await auditLog(db, user.userId, 'planner.tasks.accept', 'planner_task', null, { count: result.tasks.length }, clientIp(request));
      return sendJson(result, 201);
    }

    if (!second && request.method === 'GET') {
      return sendJson(await listPlannerTasks(db, user.userId, url));
    }

    if (!second && request.method === 'POST') {
      return sendJson({ task: await createPlannerTask(db, user.userId, await readJson(request)) }, 201);
    }

    // Sub-resources on a single task
    if (second && third === 'prompt' && request.method === 'POST') {
      return sendJson({ task: await generatePlannerPrompt(db, env, user.userId, second) });
    }

    if (second && third === 'prompt-used' && request.method === 'PATCH') {
      const payload = await readJson(request);
      return sendJson({ task: await setPlannerPromptUsed(db, user.userId, second, payload) });
    }

    if (second && third === 'estimate' && request.method === 'POST') {
      return sendJson({ task: await generatePlannerEstimate(db, env, user.userId, second) });
    }

    if (second && third === 'comprehension' && request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ task: await generatePlannerComprehension(db, env, user.userId, second, payload) });
    }

    if (second && third === 'comprehension' && request.method === 'PATCH') {
      const payload = await readJson(request);
      return sendJson({ task: await updatePlannerComprehension(db, user.userId, second, payload) });
    }

    // Task-to-task dependencies (blocks / blocked-by)
    if (second && third === 'dependencies' && request.method === 'PUT') {
      const payload = await readJson(request);
      return sendJson({ dependencies: await setPlannerTaskDependencies(db, user.userId, second, payload.dependsOn) });
    }

    // Validation actions: confirm / reject / merge / split
    if (second && third === 'validate' && request.method === 'POST') {
      const payload = await readJson(request);
      const result = await validatePlannerTask(db, user, second, payload);
      await auditLog(db, user.userId, `planner.task.${result.action}`, 'planner_task', second, {}, clientIp(request));
      return sendJson(result);
    }

    // Read-only AI Workspace brief (assembles execution context; prompt-only, no code gen)
    if (second && third === 'workspace' && request.method === 'GET') {
      return sendJson(await getPlannerTaskWorkspace(db, user.userId, second));
    }

    if (second && !third && request.method === 'GET') {
      return sendJson(await getPlannerTaskDetail(db, user.userId, second));
    }

    if (second && !third && request.method === 'PUT') {
      return sendJson({ task: await updatePlannerTask(db, user.userId, second, await readJson(request)) });
    }

    if (second && !third && request.method === 'DELETE') {
      await db.prepare('DELETE FROM planner_tasks WHERE id = ? AND created_by = ?').bind(second, user.userId).run();
      return sendJson({ ok: true });
    }
  }

  // --- Module F: standup digest ---
  if (resource === 'standup' && request.method === 'GET') {
    return sendJson(await getPlannerStandup(db, user.userId, url));
  }

  // --- Data export (NFR: no lock-in) ---
  if (resource === 'export' && request.method === 'GET') {
    return await exportPlannerTasks(db, user.userId, url);
  }

  // --- Knowledge base: cross-entity search ---
  if (resource === 'knowledge' && second === 'search' && request.method === 'GET') {
    return sendJson(await searchPlannerKnowledge(db, user.userId, url));
  }

  // --- Analytics: delivery efficiency ---
  if (resource === 'analytics' && request.method === 'GET') {
    return sendJson(await getPlannerAnalytics(db, user.userId, url));
  }

  return sendJson({ error: 'Not found' }, 404);
}

// --- Planner: projects ---

const PLANNER_PROJECT_STATUSES = ['active', 'paused', 'archived'];

// Per-project rollups reused by the list and dashboard.
const PLANNER_PROJECT_STATS_SQL = `
  (SELECT COUNT(*) FROM planner_tasks t WHERE t.project_id = p.id) AS task_count,
  (SELECT COUNT(*) FROM planner_tasks t WHERE t.project_id = p.id AND t.status NOT IN ('done')) AS open_task_count,
  (SELECT COUNT(*) FROM planner_tasks t WHERE t.project_id = p.id AND t.validation_status = 'pending') AS pending_validation,
  (SELECT COUNT(*) FROM planner_meetings m WHERE m.project_id = p.id) AS meeting_count,
  (SELECT COUNT(*) FROM planner_deliverables d WHERE d.project_id = p.id) AS deliverable_count,
  (SELECT MAX(m.meeting_date) FROM planner_meetings m WHERE m.project_id = p.id) AS last_meeting_date`;

async function listPlannerProjects(db, userId) {
  const rows = await db
    .prepare(
      `SELECT p.*, ${PLANNER_PROJECT_STATS_SQL}
       FROM planner_projects p
       WHERE p.created_by = ?
       ORDER BY p.status = 'archived', p.updated_at DESC`,
    )
    .bind(userId)
    .all();

  return (rows.results || []).map(mapPlannerProject);
}

function plannerProjectFields(payload, { partial }) {
  const fields = {};

  if (payload.name !== undefined || !partial) {
    fields.name = requiredText(payload.name, 'A project name is required.').slice(0, 200);
  }

  const setText = (key, column, max = 8000) => {
    if (payload[key] !== undefined) {
      fields[column] = payload[key] === null ? null : String(payload[key]).trim().slice(0, max) || null;
    }
  };

  setText('description', 'description', 2000);
  setText('code', 'code', 40);
  setText('repoUrl', 'repo_url', 500);
  setText('architecture', 'architecture');
  setText('codingStandards', 'coding_standards');
  setText('folderStructure', 'folder_structure');

  if (payload.status !== undefined) {
    fields.status = normalizeEnum(payload.status, PLANNER_PROJECT_STATUSES, 'Invalid project status.');
  }

  if (payload.techStack !== undefined) {
    const stack = Array.isArray(payload.techStack) ? payload.techStack : String(payload.techStack || '').split(',');
    fields.tech_stack_json = JSON.stringify(stack.map((item) => String(item).trim()).filter(Boolean).slice(0, 40));
  }

  return fields;
}

async function createPlannerProject(db, userId, payload) {
  const fields = plannerProjectFields(payload, { partial: false });
  const id = `pproj-${crypto.randomUUID()}`;
  const row = { id, created_by: userId, ...fields };
  const columns = Object.keys(row);

  await db
    .prepare(`INSERT INTO planner_projects (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .bind(...Object.values(row))
    .run();

  return getPlannerProject(db, userId, id);
}

async function updatePlannerProject(db, userId, id, payload) {
  const fields = plannerProjectFields(payload, { partial: true });

  if (!Object.keys(fields).length) {
    throw new HttpError(400, 'Nothing to update.');
  }

  const assignments = Object.keys(fields).map((column) => `${column} = ?`);
  const result = await db
    .prepare(`UPDATE planner_projects SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND created_by = ?`)
    .bind(...Object.values(fields), id, userId)
    .run();

  if (!result.meta || result.meta.changes === 0) {
    throw new HttpError(404, 'Project not found.');
  }

  return getPlannerProject(db, userId, id);
}

async function getPlannerProject(db, userId, id) {
  const row = await db
    .prepare(
      `SELECT p.*, ${PLANNER_PROJECT_STATS_SQL} FROM planner_projects p WHERE p.id = ? AND p.created_by = ?`,
    )
    .bind(id, userId)
    .first();

  if (!row) {
    throw new HttpError(404, 'Project not found.');
  }

  return mapPlannerProject(row);
}

async function getPlannerProjectDetail(db, userId, id) {
  const project = await getPlannerProject(db, userId, id);

  const meetings = await db
    .prepare(
      `SELECT m.*,
              (SELECT COUNT(*) FROM planner_deliverables d WHERE d.meeting_id = m.id) AS deliverable_count,
              (SELECT COUNT(*) FROM planner_tasks t WHERE t.meeting_id = m.id) AS task_count
       FROM planner_meetings m WHERE m.project_id = ? AND m.created_by = ?
       ORDER BY COALESCE(m.meeting_date, m.created_at) DESC`,
    )
    .bind(id, userId)
    .all();

  const deliverables = await db
    .prepare(
      `SELECT d.*, (SELECT COUNT(*) FROM planner_tasks t WHERE t.deliverable_id = d.id) AS task_count
       FROM planner_deliverables d WHERE d.project_id = ? ORDER BY d.order_index, d.created_at`,
    )
    .bind(id)
    .all();

  const tasks = await db
    .prepare(
      `SELECT t.*, p.name AS project_name, m.title AS meeting_title, d.title AS deliverable_title
       FROM planner_tasks t
       LEFT JOIN planner_projects p ON p.id = t.project_id
       LEFT JOIN planner_meetings m ON m.id = t.meeting_id
       LEFT JOIN planner_deliverables d ON d.id = t.deliverable_id
       WHERE t.project_id = ? AND t.created_by = ?
       ORDER BY CASE t.status WHEN 'in_progress' THEN 0 WHEN 'blocked' THEN 1 WHEN 'planned' THEN 2 ELSE 3 END,
                t.order_index`,
    )
    .bind(id, userId)
    .all();

  const templates = await db
    .prepare('SELECT * FROM planner_prompt_templates WHERE project_id = ? AND created_by = ? ORDER BY updated_at DESC')
    .bind(id, userId)
    .all();

  // Objectives from this project's meetings, surfaced as lightweight "AI understanding".
  const objectives = [];
  for (const meeting of meetings.results || []) {
    for (const objective of parseJson(meeting.objectives_json, [])) {
      if (objectives.length < 12 && !objectives.includes(objective)) {
        objectives.push(objective);
      }
    }
  }

  return {
    project,
    meetings: (meetings.results || []).map(mapPlannerMeeting),
    deliverables: (deliverables.results || []).map(mapPlannerDeliverable),
    tasks: (tasks.results || []).map(mapPlannerTask),
    promptTemplates: (templates.results || []).map(mapPlannerPromptTemplate),
    objectives,
  };
}

// --- Planner: WorkOS dashboard ---

async function getPlannerDashboard(db, userId, url) {
  const day = url && url.searchParams.get('date') ? normalizeDate(url.searchParams.get('date')) : today();

  const counts = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM planner_projects WHERE created_by = ?1 AND status != 'archived') AS projects,
         (SELECT COUNT(*) FROM planner_meetings WHERE created_by = ?1) AS meetings,
         (SELECT COUNT(*) FROM planner_deliverables WHERE created_by = ?1) AS deliverables,
         (SELECT COUNT(*) FROM planner_tasks WHERE created_by = ?1) AS total_tasks,
         (SELECT COUNT(*) FROM planner_tasks WHERE created_by = ?1 AND validation_status = 'pending') AS pending_validation,
         (SELECT COUNT(*) FROM planner_tasks WHERE created_by = ?1 AND status = 'done') AS done_tasks,
         (SELECT COUNT(*) FROM planner_tasks WHERE created_by = ?1 AND status = 'blocked') AS blocked_tasks,
         (SELECT COUNT(*) FROM planner_tasks WHERE created_by = ?1 AND status IN ('planned', 'in_progress', 'blocked')) AS open_tasks`,
    )
    .bind(userId)
    .first();

  const todayTasks = await db
    .prepare(
      `SELECT t.*, p.name AS project_name, m.title AS meeting_title, d.title AS deliverable_title
       FROM planner_tasks t
       LEFT JOIN planner_projects p ON p.id = t.project_id
       LEFT JOIN planner_meetings m ON m.id = t.meeting_id
       LEFT JOIN planner_deliverables d ON d.id = t.deliverable_id
       WHERE t.created_by = ? AND t.plan_date = ? AND t.status != 'done'
       ORDER BY t.scheduled_minute IS NULL, t.scheduled_minute, t.order_index
       LIMIT 12`,
    )
    .bind(userId, day)
    .all();

  const validationQueue = await db
    .prepare(
      `SELECT t.*, p.name AS project_name, m.title AS meeting_title, d.title AS deliverable_title
       FROM planner_tasks t
       LEFT JOIN planner_projects p ON p.id = t.project_id
       LEFT JOIN planner_meetings m ON m.id = t.meeting_id
       LEFT JOIN planner_deliverables d ON d.id = t.deliverable_id
       WHERE t.created_by = ? AND t.validation_status = 'pending'
       ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                COALESCE(t.confidence, 0) ASC
       LIMIT 8`,
    )
    .bind(userId)
    .all();

  const recentMeetings = await db
    .prepare(
      `SELECT m.*, pr.name AS project_name,
              (SELECT COUNT(*) FROM planner_deliverables d WHERE d.meeting_id = m.id) AS deliverable_count,
              (SELECT COUNT(*) FROM planner_tasks t WHERE t.meeting_id = m.id) AS task_count
       FROM planner_meetings m
       LEFT JOIN planner_projects pr ON pr.id = m.project_id
       WHERE m.created_by = ?
       ORDER BY m.created_at DESC LIMIT 6`,
    )
    .bind(userId)
    .all();

  const todayList = (todayTasks.results || []).map(mapPlannerTask);

  return {
    date: day,
    stats: {
      projects: Number(counts?.projects || 0),
      meetings: Number(counts?.meetings || 0),
      deliverables: Number(counts?.deliverables || 0),
      totalTasks: Number(counts?.total_tasks || 0),
      openTasks: Number(counts?.open_tasks || 0),
      doneTasks: Number(counts?.done_tasks || 0),
      blockedTasks: Number(counts?.blocked_tasks || 0),
      pendingValidation: Number(counts?.pending_validation || 0),
    },
    todayTasks: todayList,
    todayEstimatedMinutes: todayList.reduce((sum, task) => sum + (task.estimatedMinutes || 0), 0),
    validationQueue: (validationQueue.results || []).map(mapPlannerTask),
    recentMeetings: (recentMeetings.results || []).map((row) => ({
      ...mapPlannerMeeting(row),
      projectName: row.project_name || null,
      deliverableCount: Number(row.deliverable_count || 0),
      taskCount: Number(row.task_count || 0),
    })),
  };
}

// --- Planner: prompt library ---

async function listPlannerPromptTemplates(db, userId, url) {
  const projectId = url && url.searchParams.get('projectId');
  const rows = projectId
    ? await db
      .prepare('SELECT * FROM planner_prompt_templates WHERE created_by = ? AND project_id = ? ORDER BY updated_at DESC')
      .bind(userId, projectId)
      .all()
    : await db
      .prepare('SELECT * FROM planner_prompt_templates WHERE created_by = ? ORDER BY updated_at DESC LIMIT 100')
      .bind(userId)
      .all();

  return (rows.results || []).map(mapPlannerPromptTemplate);
}

async function createPlannerPromptTemplate(db, userId, payload) {
  const id = `ptpl-${crypto.randomUUID()}`;
  await db
    .prepare(
      `INSERT INTO planner_prompt_templates (id, project_id, name, category, body, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      payload.projectId ? String(payload.projectId) : null,
      requiredText(payload.name, 'A template name is required.').slice(0, 200),
      String(payload.category || 'general').trim().slice(0, 60) || 'general',
      requiredText(payload.body, 'A template body is required.').slice(0, 20000),
      userId,
    )
    .run();

  const row = await db.prepare('SELECT * FROM planner_prompt_templates WHERE id = ?').bind(id).first();
  return mapPlannerPromptTemplate(row);
}

async function updatePlannerPromptTemplate(db, userId, id, payload) {
  const fields = {};

  if (payload.name !== undefined) {
    fields.name = requiredText(payload.name, 'A template name is required.').slice(0, 200);
  }

  if (payload.category !== undefined) {
    fields.category = String(payload.category || 'general').trim().slice(0, 60) || 'general';
  }

  if (payload.body !== undefined) {
    fields.body = requiredText(payload.body, 'A template body is required.').slice(0, 20000);
  }

  if (payload.incrementUsage) {
    fields.usage_count = clampInteger((payload.usageCount || 0) + 1, 0, 1000000);
  }

  if (!Object.keys(fields).length) {
    throw new HttpError(400, 'Nothing to update.');
  }

  const assignments = Object.keys(fields).map((column) => `${column} = ?`);
  const result = await db
    .prepare(`UPDATE planner_prompt_templates SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND created_by = ?`)
    .bind(...Object.values(fields), id, userId)
    .run();

  if (!result.meta || result.meta.changes === 0) {
    throw new HttpError(404, 'Prompt template not found.');
  }

  const row = await db.prepare('SELECT * FROM planner_prompt_templates WHERE id = ?').bind(id).first();
  return mapPlannerPromptTemplate(row);
}

function mapPlannerPromptTemplate(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    category: row.category,
    body: row.body,
    usageCount: Number(row.usage_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Planner: Module A (structure notes) ---

async function structurePlannerNotes(env, payload) {
  const notes = String(payload.notes || '').trim();

  if (!notes) {
    throw new HttpError(400, 'Paste some notes to structure into tasks.');
  }

  const prompt = [
    'You are a planning assistant for a software developer who works with an AI coding assistant.',
    'Read the raw standup notes / meeting minutes below and break them into discrete, actionable engineering tasks.',
    `Today is ${today()}.`,
    'For each task return:',
    '- title: a short imperative name.',
    '- description: one or two sentences on what needs to happen.',
    '- acceptanceCriteria: 1-4 checkable statements of what "done" means (infer sensible ones if not stated).',
    '- projectTag: the project or area this belongs to if identifiable from context, else an empty string.',
    '- estimatedMinutes: a rough whole-number estimate of focused time for an AI-assisted developer.',
    '- estimateLabel: a human range matching the estimate, e.g. "15-30 min" or "1-2 hrs".',
    '- complexity: one of trivial, simple, moderate, complex.',
    'Only extract real work implied by the notes. If nothing actionable is present, return an empty tasks array.',
    '',
    'NOTES:',
    notes.slice(0, PLANNER_MAX_NOTES),
  ].join('\n');

  const schema = {
    type: 'OBJECT',
    properties: {
      tasks: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            description: { type: 'STRING' },
            acceptanceCriteria: { type: 'ARRAY', items: { type: 'STRING' } },
            projectTag: { type: 'STRING' },
            estimatedMinutes: { type: 'NUMBER' },
            estimateLabel: { type: 'STRING' },
            complexity: { type: 'STRING' },
          },
          required: ['title', 'description', 'acceptanceCriteria', 'estimatedMinutes', 'estimateLabel'],
        },
      },
    },
    required: ['tasks'],
  };

  const result = await geminiGenerateJson(env, prompt, schema);
  const tasks = (Array.isArray(result.tasks) ? result.tasks : [])
    .map((task) => {
      const minutes = Math.round(Number(task?.estimatedMinutes));
      return {
        title: String(task?.title || '').trim(),
        description: String(task?.description || '').trim(),
        acceptanceCriteria: plannerStringList(task?.acceptanceCriteria).slice(0, 8),
        projectTag: String(task?.projectTag || '').trim(),
        estimatedMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, 4800) : 60,
        estimateLabel: String(task?.estimateLabel || '').trim() || plannerMinutesToLabel(minutes),
        complexity: String(task?.complexity || '').trim().toLowerCase(),
      };
    })
    .filter((task) => task.title)
    .slice(0, 40);

  return { tasks };
}

// --- Planner: MOM import (meeting -> deliverables -> tasks) ---

async function extractPlannerMeeting(env, payload) {
  const notes = String(payload.notes || '').trim();

  if (!notes) {
    throw new HttpError(400, 'Paste the meeting notes to extract from.');
  }

  const prompt = [
    'You are an engineering meeting analyst. Read the raw minutes / standup notes below and structure them.',
    `Today is ${today()}.`,
    'Return:',
    '- meeting: { title (short), summary (2-3 sentences), objectives (array of goals), participants (array of {name, role}), confidence (0-1 overall) }.',
    '- deliverables: distinct units of value committed in the meeting. Each has { title, note (evidence/why, e.g. "mentioned 3x" or owner), confidence (0-1), tasks: [...] }.',
    '  Each task under a deliverable has: title (imperative), description, acceptanceCriteria (1-4 checkable items), category (e.g. Backend, Frontend, Docs, Infra), priority (critical|high|medium|low), estimatedMinutes (whole number of focused time), estimateLabel (e.g. "1-2 hrs"), confidence (0-1), sourceExcerpt (the sentence from the notes this came from).',
    'Only extract real work implied by the notes. If nothing actionable is present, return an empty deliverables array.',
    '',
    'NOTES:',
    notes.slice(0, PLANNER_MAX_NOTES),
  ].join('\n');

  const taskSchema = {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING' },
      description: { type: 'STRING' },
      acceptanceCriteria: { type: 'ARRAY', items: { type: 'STRING' } },
      category: { type: 'STRING' },
      priority: { type: 'STRING' },
      estimatedMinutes: { type: 'NUMBER' },
      estimateLabel: { type: 'STRING' },
      confidence: { type: 'NUMBER' },
      sourceExcerpt: { type: 'STRING' },
    },
    required: ['title', 'description', 'acceptanceCriteria', 'estimatedMinutes', 'priority'],
  };

  const schema = {
    type: 'OBJECT',
    properties: {
      meeting: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          summary: { type: 'STRING' },
          objectives: { type: 'ARRAY', items: { type: 'STRING' } },
          participants: {
            type: 'ARRAY',
            items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, role: { type: 'STRING' } }, required: ['name'] },
          },
          confidence: { type: 'NUMBER' },
        },
        required: ['title', 'summary', 'objectives', 'confidence'],
      },
      deliverables: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            note: { type: 'STRING' },
            confidence: { type: 'NUMBER' },
            tasks: { type: 'ARRAY', items: taskSchema },
          },
          required: ['title', 'tasks'],
        },
      },
    },
    required: ['meeting', 'deliverables'],
  };

  const result = await geminiGenerateJson(env, prompt, schema);
  const m = result.meeting || {};

  const meeting = {
    title: String(m.title || 'Imported meeting').trim().slice(0, 300),
    summary: String(m.summary || '').trim().slice(0, 4000),
    objectives: plannerStringList(m.objectives).slice(0, 12),
    participants: (Array.isArray(m.participants) ? m.participants : [])
      .map((p) => ({ name: String(p?.name || '').trim().slice(0, 120), role: String(p?.role || '').trim().slice(0, 120) }))
      .filter((p) => p.name)
      .slice(0, 20),
    confidence: plannerConfidence(m.confidence),
    rawText: notes.slice(0, PLANNER_MAX_NOTES),
  };

  const deliverables = (Array.isArray(result.deliverables) ? result.deliverables : [])
    .map((d) => ({
      title: String(d?.title || '').trim().slice(0, 300),
      note: String(d?.note || '').trim().slice(0, 1000),
      confidence: plannerConfidence(d?.confidence),
      tasks: (Array.isArray(d?.tasks) ? d.tasks : [])
        .map((task) => {
          const minutes = Math.round(Number(task?.estimatedMinutes));
          const criteria = plannerStringList(task?.acceptanceCriteria).slice(0, 8);
          return {
            title: String(task?.title || '').trim().slice(0, 300),
            description: String(task?.description || '').trim().slice(0, 6000),
            acceptanceCriteria: criteria.length ? criteria : ['Works as described in the meeting notes.'],
            category: String(task?.category || '').trim().slice(0, 80),
            priority: plannerPriority(task?.priority),
            estimatedMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, 4800) : 60,
            estimateLabel: String(task?.estimateLabel || '').trim() || plannerMinutesToLabel(minutes) || '30-60 min',
            confidence: plannerConfidence(task?.confidence),
            sourceExcerpt: String(task?.sourceExcerpt || '').trim().slice(0, 1000),
          };
        })
        .filter((task) => task.title)
        .slice(0, 20),
    }))
    .filter((d) => d.title)
    .slice(0, 20);

  return { meeting, deliverables };
}

async function commitPlannerMeeting(db, userId, payload) {
  const meetingPayload = payload.meeting || {};
  const deliverables = Array.isArray(payload.deliverables) ? payload.deliverables : [];

  if (!deliverables.length) {
    throw new HttpError(400, 'No deliverables to import.');
  }

  const planDate = payload.planDate ? normalizeDate(payload.planDate) : today();
  const projectId = payload.projectId ? String(payload.projectId) : null;

  const meetingId = `pmeet-${crypto.randomUUID()}`;
  await db
    .prepare(
      `INSERT INTO planner_meetings
         (id, project_id, title, meeting_date, source_type, raw_text, summary, objectives_json, participants_json, confidence, status, created_by)
       VALUES (?, ?, ?, ?, 'paste', ?, ?, ?, ?, ?, 'processed', ?)`,
    )
    .bind(
      meetingId,
      projectId,
      requiredText(meetingPayload.title, 'A meeting title is required.').slice(0, 300),
      payload.meetingDate ? normalizeDate(payload.meetingDate) : planDate,
      String(meetingPayload.rawText || '').slice(0, PLANNER_MAX_NOTES),
      meetingPayload.summary ? String(meetingPayload.summary).trim().slice(0, 4000) : null,
      JSON.stringify(plannerStringList(meetingPayload.objectives).slice(0, 12)),
      JSON.stringify(Array.isArray(meetingPayload.participants) ? meetingPayload.participants.slice(0, 20) : []),
      plannerConfidence(meetingPayload.confidence),
      userId,
    )
    .run();

  const createdTaskIds = [];
  let taskOrder = 0;
  let deliverableOrder = 0;

  for (const deliverable of deliverables.slice(0, 30)) {
    const tasks = Array.isArray(deliverable?.tasks) ? deliverable.tasks : [];
    if (!tasks.length) {
      continue;
    }

    deliverableOrder += 10;
    const deliverableId = `pdel-${crypto.randomUUID()}`;
    await db
      .prepare(
        `INSERT INTO planner_deliverables (id, meeting_id, project_id, title, note, confidence, status, order_index, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?)`,
      )
      .bind(
        deliverableId,
        meetingId,
        projectId,
        requiredText(deliverable.title, 'A deliverable title is required.').slice(0, 300),
        deliverable.note ? String(deliverable.note).trim().slice(0, 1000) : null,
        plannerConfidence(deliverable.confidence),
        deliverableOrder,
        userId,
      )
      .run();

    for (const task of tasks.slice(0, 40)) {
      const title = requiredText(task?.title, 'Every task needs a title.').slice(0, 300);
      taskOrder += 10;
      const id = `ptask-${crypto.randomUUID()}`;
      const minutes = Math.round(Number(task?.estimatedMinutes));
      const estimatedMinutes = Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, 4800) : null;

      await db
        .prepare(
          `INSERT INTO planner_tasks
             (id, project_id, meeting_id, deliverable_id, plan_date, order_index, source, title, description,
              acceptance_criteria_json, category, priority, confidence, source_excerpt, estimate_label,
              estimated_minutes, estimate_source, validation_status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 'ai', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai', 'confirmed', ?)`,
        )
        .bind(
          id,
          projectId,
          meetingId,
          deliverableId,
          planDate,
          taskOrder,
          title,
          task?.description ? String(task.description).trim().slice(0, 6000) : null,
          JSON.stringify(plannerStringList(task?.acceptanceCriteria).slice(0, 12)),
          task?.category ? String(task.category).trim().slice(0, 80) : null,
          plannerPriority(task?.priority),
          plannerConfidence(task?.confidence),
          task?.sourceExcerpt ? String(task.sourceExcerpt).trim().slice(0, 1000) : null,
          task?.estimateLabel ? String(task.estimateLabel).trim().slice(0, 60) : plannerMinutesToLabel(estimatedMinutes),
          estimatedMinutes,
          userId,
        )
        .run();
      createdTaskIds.push(id);
    }
  }

  if (!createdTaskIds.length) {
    throw new HttpError(400, 'No tasks were selected to import.');
  }

  const placeholders = createdTaskIds.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT t.*, p.name AS project_name, m.title AS meeting_title, d.title AS deliverable_title
       FROM planner_tasks t
       LEFT JOIN planner_projects p ON p.id = t.project_id
       LEFT JOIN planner_meetings m ON m.id = t.meeting_id
       LEFT JOIN planner_deliverables d ON d.id = t.deliverable_id
       WHERE t.id IN (${placeholders}) ORDER BY t.order_index`,
    )
    .bind(...createdTaskIds)
    .all();

  const meetingRow = await db.prepare('SELECT * FROM planner_meetings WHERE id = ?').bind(meetingId).first();

  return {
    meeting: mapPlannerMeeting(meetingRow),
    tasks: (rows.results || []).map(mapPlannerTask),
    planDate,
  };
}

async function getPlannerMeeting(db, userId, id) {
  const meetingRow = await db
    .prepare('SELECT * FROM planner_meetings WHERE id = ? AND created_by = ?')
    .bind(id, userId)
    .first();

  if (!meetingRow) {
    throw new HttpError(404, 'Meeting not found.');
  }

  const deliverables = await db
    .prepare(
      `SELECT d.*, (SELECT COUNT(*) FROM planner_tasks t WHERE t.deliverable_id = d.id) AS task_count
       FROM planner_deliverables d WHERE d.meeting_id = ? ORDER BY d.order_index`,
    )
    .bind(id)
    .all();

  const tasks = await db
    .prepare(
      `SELECT t.*, p.name AS project_name, d.title AS deliverable_title
       FROM planner_tasks t
       LEFT JOIN planner_projects p ON p.id = t.project_id
       LEFT JOIN planner_deliverables d ON d.id = t.deliverable_id
       WHERE t.meeting_id = ? ORDER BY t.order_index`,
    )
    .bind(id)
    .all();

  return {
    meeting: mapPlannerMeeting(meetingRow),
    deliverables: (deliverables.results || []).map(mapPlannerDeliverable),
    tasks: (tasks.results || []).map(mapPlannerTask),
  };
}

// --- Planner: tasks ---

async function acceptPlannerTasks(db, userId, payload) {
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];

  if (!tasks.length) {
    throw new HttpError(400, 'No tasks to accept.');
  }

  const planDate = payload.planDate ? normalizeDate(payload.planDate) : today();
  const projectId = payload.projectId ? String(payload.projectId) : null;
  const createdIds = [];

  const base = await db
    .prepare('SELECT COALESCE(MAX(order_index), 0) AS max_order FROM planner_tasks WHERE created_by = ? AND plan_date = ?')
    .bind(userId, planDate)
    .first();
  let order = Number(base?.max_order || 0);

  for (const task of tasks.slice(0, 100)) {
    const title = requiredText(task?.title, 'Every task needs a title.').slice(0, 300);
    order += 10;
    const id = `ptask-${crypto.randomUUID()}`;
    const minutes = Math.round(Number(task?.estimatedMinutes));
    const estimatedMinutes = Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, 4800) : null;

    await db
      .prepare(
        `INSERT INTO planner_tasks
           (id, project_id, project_tag, plan_date, order_index, source, title, description,
            acceptance_criteria_json, estimate_label, estimated_minutes, estimate_source, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai', ?)`,
      )
      .bind(
        id,
        projectId,
        task?.projectTag ? String(task.projectTag).trim().slice(0, 120) : null,
        planDate,
        order,
        task?.source === 'manual' ? 'manual' : 'ai',
        title,
        task?.description ? String(task.description).trim().slice(0, 6000) : null,
        JSON.stringify(plannerStringList(task?.acceptanceCriteria).slice(0, 12)),
        task?.estimateLabel ? String(task.estimateLabel).trim().slice(0, 60) : plannerMinutesToLabel(estimatedMinutes),
        estimatedMinutes,
        userId,
      )
      .run();

    createdIds.push(id);
  }

  const placeholders = createdIds.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT t.*, p.name AS project_name FROM planner_tasks t
       LEFT JOIN planner_projects p ON p.id = t.project_id
       WHERE t.id IN (${placeholders}) ORDER BY t.order_index`,
    )
    .bind(...createdIds)
    .all();

  return { tasks: (rows.results || []).map(mapPlannerTask), planDate };
}

async function listPlannerTasks(db, userId, url) {
  const params = url ? url.searchParams : new URLSearchParams();
  const conditions = ['t.created_by = ?'];
  const binds = [userId];

  if (params.get('date')) {
    conditions.push('t.plan_date = ?');
    binds.push(normalizeDate(params.get('date')));
  }

  if (params.get('week')) {
    const start = normalizeDate(params.get('week'));
    conditions.push('t.plan_date >= ? AND t.plan_date <= ?');
    binds.push(start, addDays(start, 6));
  }

  if (params.get('projectId')) {
    conditions.push('t.project_id = ?');
    binds.push(params.get('projectId'));
  }

  if (params.get('status')) {
    conditions.push('t.status = ?');
    binds.push(normalizeEnum(params.get('status'), PLANNER_STATUSES, 'Invalid task status.'));
  }

  const where = conditions.join(' AND ');
  const rows = await db
    .prepare(
      `SELECT t.*, p.name AS project_name FROM planner_tasks t
       LEFT JOIN planner_projects p ON p.id = t.project_id
       WHERE ${where}
       ORDER BY t.plan_date, t.order_index, t.created_at
       LIMIT 500`,
    )
    .bind(...binds)
    .all();

  const tasks = (rows.results || []).map(mapPlannerTask);
  const totalEstimatedMinutes = tasks.reduce((sum, task) => sum + (task.estimatedMinutes || 0), 0);

  return { tasks, total: tasks.length, totalEstimatedMinutes };
}

async function getPlannerTask(db, userId, id) {
  const row = await db
    .prepare(
      `SELECT t.*, p.name AS project_name, m.title AS meeting_title, m.meeting_date AS meeting_date,
              d.title AS deliverable_title
       FROM planner_tasks t
       LEFT JOIN planner_projects p ON p.id = t.project_id
       LEFT JOIN planner_meetings m ON m.id = t.meeting_id
       LEFT JOIN planner_deliverables d ON d.id = t.deliverable_id
       WHERE t.id = ? AND t.created_by = ?`,
    )
    .bind(id, userId)
    .first();

  if (!row) {
    throw new HttpError(404, 'Task not found.');
  }

  return mapPlannerTask(row);
}

// Full task detail with provenance (source meeting/deliverable) and dependency graph.
async function getPlannerTaskDetail(db, userId, id) {
  const task = await getPlannerTask(db, userId, id);

  const meeting = task.meetingId
    ? mapPlannerMeeting(await db.prepare('SELECT * FROM planner_meetings WHERE id = ?').bind(task.meetingId).first())
    : null;
  const deliverable = task.deliverableId
    ? mapPlannerDeliverable(await db.prepare('SELECT * FROM planner_deliverables WHERE id = ?').bind(task.deliverableId).first())
    : null;

  const dependencies = await db
    .prepare(
      `SELECT dep.*, t.title, t.status, t.priority
       FROM planner_task_dependencies dep
       JOIN planner_tasks t ON t.id = dep.depends_on_task_id
       WHERE dep.task_id = ?`,
    )
    .bind(id)
    .all();

  const dependents = await db
    .prepare(
      `SELECT dep.*, t.title, t.status, t.priority
       FROM planner_task_dependencies dep
       JOIN planner_tasks t ON t.id = dep.task_id
       WHERE dep.depends_on_task_id = ?`,
    )
    .bind(id)
    .all();

  return {
    task,
    meeting,
    deliverable,
    dependencies: (dependencies.results || []).map(mapPlannerDependency),
    dependents: (dependents.results || []).map(mapPlannerDependency),
  };
}

// --- Planner: task dependencies (with cycle guard) ---

async function setPlannerTaskDependencies(db, userId, taskId, dependsOn) {
  const task = await db.prepare('SELECT id FROM planner_tasks WHERE id = ? AND created_by = ?').bind(taskId, userId).first();

  if (!task) {
    throw new HttpError(404, 'Task not found.');
  }

  const requested = Array.from(new Set(
    (Array.isArray(dependsOn) ? dependsOn : []).map((value) => String(value)).filter((value) => value && value !== taskId),
  )).slice(0, 30);

  // Only allow dependencies on the user's own tasks.
  if (requested.length) {
    const owned = await db
      .prepare(`SELECT id FROM planner_tasks WHERE created_by = ? AND id IN (${requested.map(() => '?').join(', ')})`)
      .bind(userId, ...requested)
      .all();
    const ownedIds = new Set((owned.results || []).map((row) => row.id));
    for (const id of requested) {
      if (!ownedIds.has(id)) {
        throw new HttpError(400, 'One of those tasks does not exist.');
      }
    }
  }

  // Build the existing edge map (excluding this task's edges) and reject cycles.
  const edges = await db
    .prepare('SELECT task_id, depends_on_task_id FROM planner_task_dependencies WHERE task_id != ?')
    .bind(taskId)
    .all();
  const graph = new Map();
  (edges.results || []).forEach((row) => {
    const list = graph.get(row.task_id) || [];
    list.push(row.depends_on_task_id);
    graph.set(row.task_id, list);
  });

  for (const candidate of requested) {
    const queue = [candidate];
    const seen = new Set();
    while (queue.length) {
      const current = queue.shift();
      if (current === taskId) {
        throw new HttpError(400, 'That dependency would create a circular chain.');
      }
      if (seen.has(current)) {
        continue;
      }
      seen.add(current);
      (graph.get(current) || []).forEach((next) => queue.push(next));
    }
  }

  await db.prepare('DELETE FROM planner_task_dependencies WHERE task_id = ?').bind(taskId).run();
  for (const dependsOnId of requested) {
    await db
      .prepare('INSERT OR IGNORE INTO planner_task_dependencies (id, task_id, depends_on_task_id) VALUES (?, ?, ?)')
      .bind(`pdep-${crypto.randomUUID()}`, taskId, dependsOnId)
      .run();
  }

  const rows = await db
    .prepare(
      `SELECT dep.*, t.title, t.status, t.priority
       FROM planner_task_dependencies dep
       JOIN planner_tasks t ON t.id = dep.depends_on_task_id
       WHERE dep.task_id = ?`,
    )
    .bind(taskId)
    .all();

  return (rows.results || []).map(mapPlannerDependency);
}

// --- Planner: validation engine (confirm / reject / merge / split) ---

async function validatePlannerTask(db, user, taskId, payload) {
  const action = normalizeEnum(payload.action, ['confirm', 'reject', 'merge', 'split'], 'Invalid validation action.');
  const before = await db.prepare('SELECT * FROM planner_tasks WHERE id = ? AND created_by = ?').bind(taskId, user.userId).first();

  if (!before) {
    throw new HttpError(404, 'Task not found.');
  }

  if (action === 'confirm' || action === 'reject') {
    await db
      .prepare('UPDATE planner_tasks SET validation_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND created_by = ?')
      .bind(action === 'confirm' ? 'confirmed' : 'rejected', taskId, user.userId)
      .run();
    const task = await getPlannerTask(db, user.userId, taskId);
    return { action, task, tasks: [task] };
  }

  if (action === 'merge') {
    const targetId = requiredText(payload.mergeWithTaskId, 'Choose a task to merge into.');
    if (targetId === taskId) {
      throw new HttpError(400, 'A task cannot be merged into itself.');
    }
    const target = await db.prepare('SELECT * FROM planner_tasks WHERE id = ? AND created_by = ?').bind(targetId, user.userId).first();
    if (!target) {
      throw new HttpError(404, 'The task to merge into no longer exists.');
    }

    const mergedCriteria = Array.from(new Set([
      ...parseJson(target.acceptance_criteria_json, []),
      ...parseJson(before.acceptance_criteria_json, []),
    ])).slice(0, 20);
    const description = [target.description, before.description].filter(Boolean).join('\n\n').slice(0, 6000);
    const minutes = (Number(target.estimated_minutes) || 0) + (Number(before.estimated_minutes) || 0);

    await db
      .prepare(
        `UPDATE planner_tasks
         SET description = ?, acceptance_criteria_json = ?, estimated_minutes = ?,
             validation_status = 'confirmed', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND created_by = ?`,
      )
      .bind(description, JSON.stringify(mergedCriteria), minutes || null, targetId, user.userId)
      .run();

    await db
      .prepare("UPDATE planner_tasks SET validation_status = 'merged', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND created_by = ?")
      .bind(taskId, user.userId)
      .run();

    const task = await getPlannerTask(db, user.userId, targetId);
    return { action, task, tasks: [task] };
  }

  // split
  const splits = Array.isArray(payload.splits) ? payload.splits : [];
  if (splits.length < 2) {
    throw new HttpError(400, 'Splitting needs at least two tasks.');
  }

  const createdIds = [];
  const base = await db
    .prepare('SELECT COALESCE(MAX(order_index), 0) AS max_order FROM planner_tasks WHERE created_by = ? AND plan_date = ?')
    .bind(user.userId, before.plan_date)
    .first();
  let order = Number(base?.max_order || 0);

  for (const split of splits.slice(0, 10)) {
    const title = requiredText(split?.title, 'Every split task needs a title.').slice(0, 300);
    order += 10;
    const id = `ptask-${crypto.randomUUID()}`;
    const minutes = Math.round(Number(split?.estimatedMinutes));
    const estimatedMinutes = Number.isFinite(minutes) && minutes > 0
      ? Math.min(minutes, 4800)
      : Math.max(15, Math.round((Number(before.estimated_minutes) || 60) / splits.length));

    await db
      .prepare(
        `INSERT INTO planner_tasks
           (id, project_id, meeting_id, deliverable_id, plan_date, order_index, source, title, description,
            acceptance_criteria_json, category, priority, estimate_label, estimated_minutes, estimate_source,
            validation_status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'ai', ?, ?, ?, ?, ?, ?, ?, 'ai', 'confirmed', ?)`,
      )
      .bind(
        id,
        before.project_id,
        before.meeting_id,
        before.deliverable_id,
        before.plan_date,
        order,
        title,
        split?.description ? String(split.description).trim().slice(0, 6000) : before.description,
        before.acceptance_criteria_json,
        before.category,
        before.priority,
        plannerMinutesToLabel(estimatedMinutes),
        estimatedMinutes,
        user.userId,
      )
      .run();
    createdIds.push(id);
  }

  await db
    .prepare("UPDATE planner_tasks SET validation_status = 'split', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND created_by = ?")
    .bind(taskId, user.userId)
    .run();

  const placeholders = createdIds.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT t.*, p.name AS project_name FROM planner_tasks t
       LEFT JOIN planner_projects p ON p.id = t.project_id
       WHERE t.id IN (${placeholders}) ORDER BY t.order_index`,
    )
    .bind(...createdIds)
    .all();

  return { action, task: null, tasks: (rows.results || []).map(mapPlannerTask) };
}

function plannerTaskFields(payload) {
  const fields = {};

  if (payload.title !== undefined) {
    fields.title = requiredText(payload.title, 'A task title is required.').slice(0, 300);
  }

  if (payload.description !== undefined) {
    fields.description = payload.description === null ? null : String(payload.description).trim().slice(0, 6000) || null;
  }

  if (payload.acceptanceCriteria !== undefined) {
    fields.acceptance_criteria_json = JSON.stringify(plannerStringList(payload.acceptanceCriteria).slice(0, 20));
  }

  if (payload.status !== undefined) {
    fields.status = normalizeEnum(payload.status, PLANNER_STATUSES, 'Invalid task status.');
    fields.completed_at = fields.status === 'done' ? new Date().toISOString() : null;
  }

  if (payload.projectId !== undefined) {
    fields.project_id = payload.projectId ? String(payload.projectId) : null;
  }

  if (payload.projectTag !== undefined) {
    fields.project_tag = payload.projectTag ? String(payload.projectTag).trim().slice(0, 120) : null;
  }

  if (payload.planDate !== undefined) {
    fields.plan_date = payload.planDate ? normalizeDate(payload.planDate) : null;
  }

  if (payload.orderIndex !== undefined) {
    fields.order_index = clampInteger(payload.orderIndex, 0, 1000000);
  }

  if (payload.estimatedMinutes !== undefined) {
    const minutes = payload.estimatedMinutes === null ? null : clampInteger(payload.estimatedMinutes, 0, 4800);
    fields.estimated_minutes = minutes;
    fields.estimate_source = 'manual';
    if (payload.estimateLabel === undefined) {
      fields.estimate_label = plannerMinutesToLabel(minutes);
    }
  }

  if (payload.estimateLabel !== undefined) {
    fields.estimate_label = payload.estimateLabel ? String(payload.estimateLabel).trim().slice(0, 60) : null;
  }

  if (payload.actualMinutes !== undefined) {
    fields.actual_minutes = payload.actualMinutes === null ? null : clampInteger(payload.actualMinutes, 0, 100000);
  }

  if (payload.priority !== undefined) {
    fields.priority = normalizeEnum(payload.priority, PLANNER_PRIORITIES, 'Invalid priority.');
  }

  if (payload.category !== undefined) {
    fields.category = payload.category ? String(payload.category).trim().slice(0, 80) : null;
  }

  if (payload.confidence !== undefined) {
    fields.confidence = plannerConfidence(payload.confidence);
  }

  if (payload.sourceExcerpt !== undefined) {
    fields.source_excerpt = payload.sourceExcerpt ? String(payload.sourceExcerpt).trim().slice(0, 4000) : null;
  }

  if (payload.meetingId !== undefined) {
    fields.meeting_id = payload.meetingId ? String(payload.meetingId) : null;
  }

  if (payload.deliverableId !== undefined) {
    fields.deliverable_id = payload.deliverableId ? String(payload.deliverableId) : null;
  }

  // Start-of-day minute for weekly time-blocking (0-1439); null clears the block time.
  if (payload.scheduledMinute !== undefined) {
    fields.scheduled_minute = payload.scheduledMinute === null ? null : clampInteger(payload.scheduledMinute, 0, 1439);
  }

  return fields;
}

async function createPlannerTask(db, userId, payload) {
  const fields = plannerTaskFields(payload);

  if (!fields.title) {
    throw new HttpError(400, 'A task title is required.');
  }

  const id = `ptask-${crypto.randomUUID()}`;
  const row = {
    id,
    source: 'manual',
    plan_date: payload.planDate ? normalizeDate(payload.planDate) : today(),
    created_by: userId,
    ...fields,
  };
  const columns = Object.keys(row);

  await db
    .prepare(`INSERT INTO planner_tasks (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .bind(...Object.values(row))
    .run();

  return getPlannerTask(db, userId, id);
}

async function updatePlannerTask(db, userId, id, payload) {
  const fields = plannerTaskFields(payload);

  if (!Object.keys(fields).length) {
    throw new HttpError(400, 'Nothing to update.');
  }

  const assignments = Object.keys(fields).map((column) => `${column} = ?`);
  const result = await db
    .prepare(`UPDATE planner_tasks SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND created_by = ?`)
    .bind(...Object.values(fields), id, userId)
    .run();

  if (!result.meta || result.meta.changes === 0) {
    throw new HttpError(404, 'Task not found.');
  }

  return getPlannerTask(db, userId, id);
}

// --- Planner: Module B (prompt generation) ---

async function generatePlannerPrompt(db, env, userId, id) {
  const task = await getPlannerTask(db, userId, id);

  const prompt = [
    'You write clear, ready-to-paste prompts that a developer will hand to an AI coding assistant.',
    'Given the task below, produce ONE well-structured prompt the developer can paste directly.',
    'The prompt must include: the objective, relevant constraints and edge cases (infer sensible ones), and the expected output format.',
    'Do not solve the task or write code yourself. Only write the prompt text.',
    '',
    `Task: ${task.title}`,
    task.description ? `Description: ${task.description}` : '',
    task.projectTag ? `Project/area: ${task.projectTag}` : '',
    task.acceptanceCriteria.length ? `Acceptance criteria:\n${task.acceptanceCriteria.map((item) => `- ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');

  const result = await geminiGenerateJson(env, prompt, {
    type: 'OBJECT',
    properties: { prompt: { type: 'STRING' } },
    required: ['prompt'],
  });

  const generated = String(result.prompt || '').trim();

  if (!generated) {
    throw new HttpError(502, 'The AI did not return a prompt. Please try again.');
  }

  await db
    .prepare('UPDATE planner_tasks SET generated_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND created_by = ?')
    .bind(generated.slice(0, 12000), id, userId)
    .run();

  return getPlannerTask(db, userId, id);
}

async function setPlannerPromptUsed(db, userId, id, payload) {
  const promptUsed = String(payload.promptUsed || '').trim();

  if (!promptUsed) {
    throw new HttpError(400, 'No prompt text to store.');
  }

  const result = await db
    .prepare('UPDATE planner_tasks SET prompt_used = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND created_by = ?')
    .bind(promptUsed.slice(0, 12000), id, userId)
    .run();

  if (!result.meta || result.meta.changes === 0) {
    throw new HttpError(404, 'Task not found.');
  }

  return getPlannerTask(db, userId, id);
}

// --- Planner: Module C (time estimation) ---

async function generatePlannerEstimate(db, env, userId, id) {
  const task = await getPlannerTask(db, userId, id);

  const prompt = [
    'You estimate how long an AI-assisted software task will take. Be realistic and directional.',
    `Task: ${task.title}`,
    task.description ? `Description: ${task.description}` : '',
    task.acceptanceCriteria.length ? `Acceptance criteria:\n${task.acceptanceCriteria.map((item) => `- ${item}`).join('\n')}` : '',
    'Return estimatedMinutes (whole number of focused minutes) and estimateLabel (a human range like "15-30 min" or "1-2 hrs").',
  ].filter(Boolean).join('\n');

  const result = await geminiGenerateJson(env, prompt, {
    type: 'OBJECT',
    properties: {
      estimatedMinutes: { type: 'NUMBER' },
      estimateLabel: { type: 'STRING' },
    },
    required: ['estimatedMinutes', 'estimateLabel'],
  });

  const minutes = Math.round(Number(result.estimatedMinutes));
  const estimatedMinutes = Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, 4800) : 60;

  await db
    .prepare(
      `UPDATE planner_tasks SET estimated_minutes = ?, estimate_label = ?, estimate_source = 'ai', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND created_by = ?`,
    )
    .bind(estimatedMinutes, String(result.estimateLabel || '').trim().slice(0, 60) || plannerMinutesToLabel(estimatedMinutes), id, userId)
    .run();

  return getPlannerTask(db, userId, id);
}

// --- Planner: Module E (comprehension summary) ---

async function generatePlannerComprehension(db, env, userId, id, payload) {
  const task = await getPlannerTask(db, userId, id);
  const codeOrDiff = String(payload.codeOrDiff || '').trim();

  if (!codeOrDiff) {
    throw new HttpError(400, 'Paste the code/diff or a description of what changed.');
  }

  const prompt = [
    'You help a developer understand what their AI assistant just implemented, so they are not dependent on re-querying an LLM.',
    'Given the task context and the code/diff (or change description) below, write a plain-English summary covering:',
    '1. what changed, 2. why it was done (based on the task), and 3. any notable approach or trade-off.',
    'Keep it concise and skimmable (a few short paragraphs or bullets). Do not restate the raw code.',
    'Also write ONE light comprehension question that helps the developer reflect (e.g. "Why was X chosen over Y?"). It is optional and never scored.',
    '',
    `Task: ${task.title}`,
    task.description ? `Task description: ${task.description}` : '',
    task.acceptanceCriteria.length ? `Acceptance criteria:\n${task.acceptanceCriteria.map((item) => `- ${item}`).join('\n')}` : '',
    '',
    'CODE / DIFF / CHANGE DESCRIPTION:',
    codeOrDiff.slice(0, PLANNER_MAX_NOTES),
  ].filter(Boolean).join('\n');

  const result = await geminiGenerateJson(env, prompt, {
    type: 'OBJECT',
    properties: {
      summary: { type: 'STRING' },
      question: { type: 'STRING' },
    },
    required: ['summary'],
  });

  const summary = String(result.summary || '').trim();

  if (!summary) {
    throw new HttpError(502, 'The AI did not return a summary. Please try again.');
  }

  await db
    .prepare(
      `UPDATE planner_tasks
       SET comprehension_input = ?, comprehension_summary = ?, comprehension_question = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND created_by = ?`,
    )
    .bind(
      codeOrDiff.slice(0, PLANNER_MAX_NOTES),
      summary.slice(0, 8000),
      result.question ? String(result.question).trim().slice(0, 1000) : null,
      id,
      userId,
    )
    .run();

  return getPlannerTask(db, userId, id);
}

async function updatePlannerComprehension(db, userId, id, payload) {
  const fields = {};

  if (payload.userAnnotation !== undefined) {
    fields.user_annotation = payload.userAnnotation ? String(payload.userAnnotation).trim().slice(0, 8000) : null;
  }

  if (payload.userAnswer !== undefined) {
    fields.user_answer = payload.userAnswer ? String(payload.userAnswer).trim().slice(0, 4000) : null;
  }

  if (payload.summaryFeedback !== undefined) {
    fields.summary_feedback = payload.summaryFeedback === null
      ? null
      : normalizeEnum(payload.summaryFeedback, ['up', 'down'], 'Invalid feedback.');
  }

  if (!Object.keys(fields).length) {
    throw new HttpError(400, 'Nothing to update.');
  }

  const assignments = Object.keys(fields).map((column) => `${column} = ?`);
  const result = await db
    .prepare(`UPDATE planner_tasks SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND created_by = ?`)
    .bind(...Object.values(fields), id, userId)
    .run();

  if (!result.meta || result.meta.changes === 0) {
    throw new HttpError(404, 'Task not found.');
  }

  return getPlannerTask(db, userId, id);
}

// --- Planner: Module F (standup digest) ---

async function getPlannerStandup(db, userId, url) {
  const params = url ? url.searchParams : new URLSearchParams();
  const date = normalizeDate(params.get('date') || today());
  const previous = addDays(date, -1);

  // "Completed" spans yesterday + today so a standup covers work since the last one.
  const completed = await db
    .prepare(
      `SELECT t.*, p.name AS project_name FROM planner_tasks t
       LEFT JOIN planner_projects p ON p.id = t.project_id
       WHERE t.created_by = ? AND t.status = 'done'
         AND (t.plan_date = ? OR t.plan_date = ? OR date(t.completed_at) IN (?, ?))
       ORDER BY t.completed_at DESC`,
    )
    .bind(userId, date, previous, date, previous)
    .all();

  const doing = await db
    .prepare(
      `SELECT t.*, p.name AS project_name FROM planner_tasks t
       LEFT JOIN planner_projects p ON p.id = t.project_id
       WHERE t.created_by = ? AND t.plan_date = ? AND t.status IN ('planned', 'in_progress')
       ORDER BY t.order_index`,
    )
    .bind(userId, date)
    .all();

  const blockers = await db
    .prepare(
      `SELECT t.*, p.name AS project_name FROM planner_tasks t
       LEFT JOIN planner_projects p ON p.id = t.project_id
       WHERE t.created_by = ? AND t.status = 'blocked'
       ORDER BY t.updated_at DESC`,
    )
    .bind(userId)
    .all();

  const dedupe = (rows) => {
    const seen = new Set();
    return (rows.results || []).filter((row) => (seen.has(row.id) ? false : seen.add(row.id))).map(mapPlannerTask);
  };

  return {
    date,
    completed: dedupe(completed),
    doing: dedupe(doing),
    blockers: dedupe(blockers),
  };
}

// --- Planner: export (NFR) ---

async function exportPlannerTasks(db, userId, url) {
  const params = url ? url.searchParams : new URLSearchParams();
  const format = (params.get('format') || 'json').toLowerCase();

  const rows = await db
    .prepare(
      `SELECT t.*, p.name AS project_name FROM planner_tasks t
       LEFT JOIN planner_projects p ON p.id = t.project_id
       WHERE t.created_by = ?
       ORDER BY t.plan_date, t.order_index`,
    )
    .bind(userId)
    .all();

  const tasks = (rows.results || []).map(mapPlannerTask);

  if (format === 'csv') {
    const columns = ['id', 'title', 'projectName', 'projectTag', 'planDate', 'status', 'estimateLabel', 'estimatedMinutes', 'actualMinutes', 'createdAt', 'completedAt'];
    const lines = [columns.join(',')];
    for (const task of tasks) {
      lines.push(columns.map((column) => csvCell(task[column])).join(','));
    }
    return new Response(lines.join('\n'), {
      status: 200,
      headers: {
        ...jsonHeaders,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="dev-planner-tasks.csv"',
      },
    });
  }

  return new Response(JSON.stringify({ tasks }, null, 2), {
    status: 200,
    headers: {
      ...jsonHeaders,
      'content-disposition': 'attachment; filename="dev-planner-tasks.json"',
    },
  });
}

// --- Planner: helpers and mappers ---

function plannerStringList(value) {
  const list = Array.isArray(value) ? value : String(value || '').split('\n');
  return list.map((item) => String(item).trim()).filter(Boolean);
}

function plannerMinutesToLabel(minutes) {
  const value = Number(minutes);

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  if (value <= 15) return '5-15 min';
  if (value <= 30) return '15-30 min';
  if (value <= 60) return '30-60 min';
  if (value <= 120) return '1-2 hrs';
  if (value <= 240) return '2-4 hrs';
  return '4+ hrs';
}

function mapPlannerProject(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    code: row.code || null,
    status: row.status || 'active',
    repoUrl: row.repo_url || null,
    techStack: parseJson(row.tech_stack_json, []),
    architecture: row.architecture || null,
    codingStandards: row.coding_standards || null,
    folderStructure: row.folder_structure || null,
    taskCount: Number(row.task_count || 0),
    openTaskCount: Number(row.open_task_count || 0),
    pendingValidation: Number(row.pending_validation || 0),
    meetingCount: Number(row.meeting_count || 0),
    deliverableCount: Number(row.deliverable_count || 0),
    lastMeetingDate: row.last_meeting_date || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Planner: AI Workspace (execution brief, prompt-only) ---

async function getPlannerTaskWorkspace(db, userId, id) {
  const detail = await getPlannerTaskDetail(db, userId, id);
  const { task, meeting, deliverable, dependencies } = detail;
  const project = task.projectId ? await getPlannerProject(db, userId, task.projectId).catch(() => null) : null;

  const section = (heading, lines) => {
    const body = lines.filter(Boolean).join('\n');
    return body ? `## ${heading}\n${body}` : '';
  };

  const projectContext = section('Project', [
    project ? `Name: ${project.name}${project.code ? ` (${project.code})` : ''}` : 'No linked project.',
    project && project.description ? `Summary: ${project.description}` : '',
    project && project.techStack.length ? `Tech stack: ${project.techStack.join(', ')}` : '',
    project && project.repoUrl ? `Repository: ${project.repoUrl}` : '',
    project && project.architecture ? `\n### Architecture\n${project.architecture}` : '',
    project && project.codingStandards ? `\n### Coding standards\n${project.codingStandards}` : '',
    project && project.folderStructure ? `\n### Folder structure\n${project.folderStructure}` : '',
  ]);

  const meetingContext = section('Source meeting', [
    meeting ? `Title: ${meeting.title}` : 'No source meeting.',
    meeting && meeting.meetingDate ? `Date: ${meeting.meetingDate}` : '',
    meeting && meeting.summary ? `\n${meeting.summary}` : '',
    meeting && meeting.objectives && meeting.objectives.length
      ? `\n### Objectives\n${meeting.objectives.map((item) => `- ${item}`).join('\n')}`
      : '',
  ]);

  const deliverableContext = section('Deliverable', [
    deliverable ? `Title: ${deliverable.title}` : 'No parent deliverable.',
    deliverable && deliverable.note ? `Note: ${deliverable.note}` : '',
  ]);

  const requirements = section('Task', [
    `Title: ${task.title}`,
    task.description ? `\n${task.description}` : '',
    `\nPriority: ${task.priority} · Estimate: ${task.estimateLabel || `${task.estimatedMinutes || 0}m`}`,
    dependencies.length ? `\n### Depends on\n${dependencies.map((dep) => `- ${dep.title} (${dep.status})`).join('\n')}` : '',
    task.acceptanceCriteria.length
      ? `\n### Acceptance criteria\n${task.acceptanceCriteria.map((item) => `- ${item}`).join('\n')}`
      : '',
  ]);

  const expectedOutput = section('Expected output', [
    task.acceptanceCriteria.length
      ? 'Every acceptance criterion above is satisfied.'
      : 'Working, reviewed changes that fulfil the task.',
    'Changes are tested and reviewed before merge.',
    '',
    'Produce the implementation in your own coding environment — this workspace assembles context and does not generate code.',
  ]);

  const executionPrompt = task.generatedPrompt || [
    `You are working on the task "${task.title}".`,
    'Use the context below; do not ask for information already provided here.',
    '',
    projectContext,
    meetingContext,
    deliverableContext,
    requirements,
    expectedOutput,
  ].filter(Boolean).join('\n\n');

  const references = [
    project && project.repoUrl ? { label: 'Repository', value: project.repoUrl } : null,
    meeting ? { label: 'Source meeting', value: meeting.title } : null,
    deliverable ? { label: 'Deliverable', value: deliverable.title } : null,
  ].filter(Boolean);

  return {
    task,
    project,
    meeting,
    deliverable,
    dependencies,
    brief: { projectContext, meetingContext, deliverableContext, requirements, expectedOutput, references },
    executionPrompt,
    promptUsed: task.promptUsed || null,
    tokenEstimate: Math.ceil(executionPrompt.length / 4),
  };
}

// --- Planner: knowledge base (cross-entity search) ---

async function searchPlannerKnowledge(db, userId, url) {
  const params = url ? url.searchParams : new URLSearchParams();
  const term = String(params.get('q') || '').trim();
  const type = String(params.get('type') || '').trim().toLowerCase();
  const like = `%${term.replace(/[%_]/g, (ch) => `\\${ch}`)}%`;
  const useTerm = term.length > 0;

  const results = [];

  const wantType = (name) => !type || type === name;

  if (wantType('meetings')) {
    const rows = useTerm
      ? await db.prepare(
        `SELECT id, title, summary, meeting_date, project_id FROM planner_meetings
         WHERE created_by = ? AND (title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR raw_text LIKE ? ESCAPE '\\')
         ORDER BY created_at DESC LIMIT 25`,
      ).bind(userId, like, like, like).all()
      : await db.prepare('SELECT id, title, summary, meeting_date, project_id FROM planner_meetings WHERE created_by = ? ORDER BY created_at DESC LIMIT 25').bind(userId).all();
    for (const row of rows.results || []) {
      results.push({ type: 'meeting', id: row.id, title: row.title, snippet: plannerSnippet(row.summary, term), projectId: row.project_id, meetingDate: row.meeting_date });
    }
  }

  if (wantType('deliverables')) {
    const rows = useTerm
      ? await db.prepare(
        `SELECT id, title, note, project_id FROM planner_deliverables
         WHERE created_by = ? AND (title LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\')
         ORDER BY created_at DESC LIMIT 25`,
      ).bind(userId, like, like).all()
      : await db.prepare('SELECT id, title, note, project_id FROM planner_deliverables WHERE created_by = ? ORDER BY created_at DESC LIMIT 25').bind(userId).all();
    for (const row of rows.results || []) {
      results.push({ type: 'deliverable', id: row.id, title: row.title, snippet: plannerSnippet(row.note, term), projectId: row.project_id });
    }
  }

  if (wantType('tasks')) {
    const rows = useTerm
      ? await db.prepare(
        `SELECT id, title, description, comprehension_summary, project_id, status FROM planner_tasks
         WHERE created_by = ? AND (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR acceptance_criteria_json LIKE ? ESCAPE '\\' OR comprehension_summary LIKE ? ESCAPE '\\')
         ORDER BY created_at DESC LIMIT 25`,
      ).bind(userId, like, like, like, like).all()
      : await db.prepare('SELECT id, title, description, comprehension_summary, project_id, status FROM planner_tasks WHERE created_by = ? ORDER BY created_at DESC LIMIT 25').bind(userId).all();
    for (const row of rows.results || []) {
      results.push({ type: 'task', id: row.id, title: row.title, snippet: plannerSnippet(row.comprehension_summary || row.description, term), projectId: row.project_id, status: row.status });
    }
  }

  if (wantType('prompts')) {
    const rows = useTerm
      ? await db.prepare(
        `SELECT id, name, body, category, project_id FROM planner_prompt_templates
         WHERE created_by = ? AND (name LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\')
         ORDER BY updated_at DESC LIMIT 25`,
      ).bind(userId, like, like, like).all()
      : await db.prepare('SELECT id, name, body, category, project_id FROM planner_prompt_templates WHERE created_by = ? ORDER BY updated_at DESC LIMIT 25').bind(userId).all();
    for (const row of rows.results || []) {
      results.push({ type: 'prompt', id: row.id, title: row.name, snippet: plannerSnippet(row.body, term), projectId: row.project_id, category: row.category });
    }
  }

  const facets = { meetings: 0, deliverables: 0, tasks: 0, prompts: 0 };
  const typeToFacet = { meeting: 'meetings', deliverable: 'deliverables', task: 'tasks', prompt: 'prompts' };
  results.forEach((row) => { facets[typeToFacet[row.type]] += 1; });

  return { query: term, type: type || null, total: results.length, facets, results };
}

function plannerSnippet(text, term) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) {
    return '';
  }
  if (term) {
    const idx = value.toLowerCase().indexOf(term.toLowerCase());
    if (idx > 60) {
      return `…${value.slice(idx - 40, idx + 120)}…`;
    }
  }
  return value.length > 200 ? `${value.slice(0, 200)}…` : value;
}

// --- Planner: analytics (delivery efficiency) ---

async function getPlannerAnalytics(db, userId, url) {
  const params = url ? url.searchParams : new URLSearchParams();
  const range = String(params.get('range') || '7d').toLowerCase();
  const days = range === '30d' ? 30 : range === 'all' ? null : 7;
  const since = days === null ? '0000-01-01' : addDays(today(), -(days - 1));

  const totals = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM planner_meetings WHERE created_by = ?1 AND date(created_at) >= ?2) AS meetings,
         (SELECT COUNT(*) FROM planner_deliverables WHERE created_by = ?1 AND date(created_at) >= ?2) AS deliverables,
         (SELECT COUNT(*) FROM planner_tasks WHERE created_by = ?1 AND date(created_at) >= ?2) AS tasks,
         (SELECT COUNT(*) FROM planner_tasks WHERE created_by = ?1 AND source = 'ai' AND date(created_at) >= ?2) AS ai_tasks,
         (SELECT COUNT(*) FROM planner_tasks WHERE created_by = ?1 AND validation_status = 'confirmed' AND date(created_at) >= ?2) AS confirmed_tasks,
         (SELECT COUNT(*) FROM planner_tasks WHERE created_by = ?1 AND validation_status = 'pending' AND date(created_at) >= ?2) AS pending_tasks,
         (SELECT COUNT(*) FROM planner_tasks WHERE created_by = ?1 AND status = 'done' AND date(created_at) >= ?2) AS done_tasks,
         (SELECT COALESCE(SUM(estimated_minutes), 0) FROM planner_tasks WHERE created_by = ?1 AND date(created_at) >= ?2) AS est_minutes,
         (SELECT COUNT(*) FROM planner_prompt_templates WHERE created_by = ?1) AS templates,
         (SELECT COALESCE(SUM(usage_count), 0) FROM planner_prompt_templates WHERE created_by = ?1) AS template_uses`,
    )
    .bind(userId, since)
    .first();

  const statusRows = await db
    .prepare(
      `SELECT status, COUNT(*) AS cnt FROM planner_tasks
       WHERE created_by = ? AND date(created_at) >= ? GROUP BY status`,
    )
    .bind(userId, since)
    .all();
  const tasksByStatus = { planned: 0, in_progress: 0, done: 0, blocked: 0 };
  (statusRows.results || []).forEach((row) => { tasksByStatus[row.status] = Number(row.cnt); });

  const priorityRows = await db
    .prepare(
      `SELECT priority, COUNT(*) AS cnt FROM planner_tasks
       WHERE created_by = ? AND date(created_at) >= ? GROUP BY priority`,
    )
    .bind(userId, since)
    .all();
  const tasksByPriority = { critical: 0, high: 0, medium: 0, low: 0 };
  (priorityRows.results || []).forEach((row) => {
    if (tasksByPriority[row.priority] !== undefined) tasksByPriority[row.priority] = Number(row.cnt);
  });

  const seriesRows = await db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS cnt FROM planner_tasks
       WHERE created_by = ? AND date(created_at) >= ? GROUP BY date(created_at) ORDER BY day`,
    )
    .bind(userId, since)
    .all();
  const seriesMap = new Map((seriesRows.results || []).map((row) => [row.day, Number(row.cnt)]));

  // Build a continuous daily series for the last N days (bounded for the 'all' case).
  const bucketDays = days === null ? 30 : days;
  const timeseries = [];
  for (let i = bucketDays - 1; i >= 0; i -= 1) {
    const day = addDays(today(), -i);
    timeseries.push({ date: day, tasks: seriesMap.get(day) || 0 });
  }

  const tasks = Number(totals?.tasks || 0);
  const aiTasks = Number(totals?.ai_tasks || 0);
  const confirmed = Number(totals?.confirmed_tasks || 0);
  const estMinutes = Number(totals?.est_minutes || 0);

  return {
    range: days === null ? 'all' : `${days}d`,
    kpis: {
      meetingsImported: Number(totals?.meetings || 0),
      deliverablesExtracted: Number(totals?.deliverables || 0),
      tasksGenerated: aiTasks,
      tasksTotal: tasks,
      promptTemplates: Number(totals?.templates || 0),
      promptReuse: Number(totals?.template_uses || 0),
    },
    quality: {
      aiTaskShare: tasks ? Math.round((aiTasks / tasks) * 100) : 0,
      validationConfirmedPct: tasks ? Math.round((confirmed / tasks) * 100) : 0,
      pendingValidation: Number(totals?.pending_tasks || 0),
      donePct: tasks ? Math.round((Number(totals?.done_tasks || 0) / tasks) * 100) : 0,
    },
    timeImpact: {
      estimatedMinutes: estMinutes,
      estimatedHours: Math.round((estMinutes / 60) * 10) / 10,
      avgTaskMinutes: tasks ? Math.round(estMinutes / tasks) : 0,
    },
    tasksByStatus,
    tasksByPriority,
    timeseries,
  };
}

function mapPlannerTask(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name || null,
    projectTag: row.project_tag,
    planDate: row.plan_date,
    orderIndex: Number(row.order_index || 0),
    source: row.source,
    title: row.title,
    description: row.description,
    acceptanceCriteria: parseJson(row.acceptance_criteria_json, []),
    status: row.status,
    estimateLabel: row.estimate_label,
    estimatedMinutes: row.estimated_minutes === null || row.estimated_minutes === undefined ? null : Number(row.estimated_minutes),
    estimateSource: row.estimate_source,
    actualMinutes: row.actual_minutes === null || row.actual_minutes === undefined ? null : Number(row.actual_minutes),
    generatedPrompt: row.generated_prompt,
    promptUsed: row.prompt_used,
    comprehensionInput: row.comprehension_input,
    comprehensionSummary: row.comprehension_summary,
    userAnnotation: row.user_annotation,
    comprehensionQuestion: row.comprehension_question,
    userAnswer: row.user_answer,
    summaryFeedback: row.summary_feedback,
    meetingId: row.meeting_id || null,
    meetingTitle: row.meeting_title || null,
    deliverableId: row.deliverable_id || null,
    deliverableTitle: row.deliverable_title || null,
    priority: row.priority || 'medium',
    category: row.category || null,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    sourceExcerpt: row.source_excerpt || null,
    validationStatus: row.validation_status || 'pending',
    scheduledMinute: row.scheduled_minute === null || row.scheduled_minute === undefined ? null : Number(row.scheduled_minute),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function plannerConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.min(1, Math.max(0, numeric > 1 ? numeric / 100 : numeric));
}

function plannerPriority(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return PLANNER_PRIORITIES.includes(normalized) ? normalized : 'medium';
}

function mapPlannerMeeting(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    meetingDate: row.meeting_date,
    sourceType: row.source_type,
    rawText: row.raw_text,
    summary: row.summary,
    objectives: parseJson(row.objectives_json, []),
    participants: parseJson(row.participants_json, []),
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlannerDeliverable(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    meetingId: row.meeting_id,
    projectId: row.project_id,
    title: row.title,
    note: row.note,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    status: row.status,
    orderIndex: Number(row.order_index || 0),
    taskCount: Number(row.task_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlannerDependency(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    dependsOnTaskId: row.depends_on_task_id,
    dependencyType: row.dependency_type,
    title: row.title,
    status: row.status,
    priority: row.priority || 'medium',
  };
}

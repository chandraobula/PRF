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
];

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
  }

  if (resource === 'goals') {
    if (request.method === 'GET') {
      return sendJson({ goals: await listGoals(db, user.userId, url.searchParams.get('currency')) });
    }

    if (request.method === 'POST') {
      const payload = await readJson(request);
      return sendJson({ goal: await createGoal(db, user.userId, payload) }, 201);
    }

    if (id && request.method === 'PATCH') {
      const payload = await readJson(request);
      return sendJson({ goal: await updateGoal(db, user.userId, id, payload) });
    }
  }

  if (resource === 'insights') {
    assertMethod(request, 'GET');
    return sendJson({ insights: await listInsights(db, user.userId) });
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

    await db
      .prepare('INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)')
      .bind(userId, email, displayName)
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

    return createLoginResponse(db, request, { userId, email, displayName }, env);
  }

  if (resource === 'login' && request.method === 'POST') {
    const payload = await readJson(request);
    const email = normalizeEmail(payload.email);
    const password = String(payload.password || '');
    const row = await db
      .prepare(
        `
        SELECT u.id, u.email, u.display_name, c.password_hash, c.password_salt
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

    return createLoginResponse(db, request, {
      userId: row.id,
      email: row.email,
      displayName: row.display_name || row.email.split('@')[0],
    }, env);
  }

  if (resource === 'me' && request.method === 'GET') {
    const auth = await authenticateRequest(request, db, env, { allowDemo: false });

    if (auth.error) {
      return sendJson({ authenticated: false });
    }

    return sendJson({
      authenticated: true,
      user: {
        id: auth.userId,
        email: auth.email,
        displayName: auth.displayName,
        mode: auth.mode,
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

  return (result.results || []).map(mapBudget);
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

  return getBudget(db, userId, id, normalizeCurrency(payload.currency || 'USD'));
}

async function getBudget(db, userId, id, currency = 'USD') {
  const url = new URL('https://lifeos.local/api/finance/budgets');
  const budgets = await listBudgets(db, userId, url, currency);
  return budgets.find((item) => item.id === id) || null;
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

  return (result.results || []).map(mapGoal);
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

  return (await listGoals(db, userId)).find((item) => item.id === id);
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

  return (await listGoals(db, userId)).find((item) => item.id === id);
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

  return { items, receipt };
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

function mapBudget(row) {
  const spentMinor = Number(row.spent_minor || 0);
  const limitMinor = Number(row.limit_minor || 0);
  const usagePercent = limitMinor > 0 ? Math.round((spentMinor / limitMinor) * 1000) / 10 : 0;

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
    carryForwardMinor: Number(row.carry_forward_minor || 0),
    alertThresholdPercent: Number(row.alert_threshold_percent || 80),
    isFlexible: Boolean(row.is_flexible),
    usagePercent,
    remainingMinor: Math.max(0, limitMinor + Number(row.carry_forward_minor || 0) - spentMinor),
  };
}

function mapGoal(row) {
  const targetAmountMinor = Number(row.target_amount_minor || 0);
  const savedAmountMinor = Number(row.saved_amount_minor || 0);
  const progressPercent = targetAmountMinor > 0
    ? Math.min(100, Math.round((savedAmountMinor / targetAmountMinor) * 1000) / 10)
    : 0;

  return {
    id: row.id,
    name: row.name,
    goalType: row.goal_type,
    targetAmountMinor,
    savedAmountMinor,
    currency: row.currency || 'USD',
    targetDate: row.target_date,
    priority: Number(row.priority || 3),
    status: row.status,
    recommendation: row.recommendation,
    progressPercent,
  };
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
        SELECT u.id, u.email, u.display_name
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
      iterations: 120000,
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

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrapper = path.join(rootDir, 'scripts', 'wrangler-local.mjs');
const schemaFile = path.join(rootDir, 'db', 'schema.sql');
const persistDir = path.join(rootDir, '.wrangler', 'state');
const port = Number(process.env.LIFEOS_SMOKE_PORT || 8791);
const baseUrl = `http://127.0.0.1:${port}`;
const logs = [];

if (!existsSync(path.join(rootDir, '.wrangler'))) {
  mkdirSync(path.join(rootDir, '.wrangler'), { recursive: true });
}

await run(process.execPath, [
  wrapper,
  'd1',
  'execute',
  'DB',
  '--local',
  '--persist-to',
  persistDir,
  '--file',
  schemaFile,
  '--yes',
]);

const server = spawn(process.execPath, [
  wrapper,
  'pages',
  'dev',
  'dist',
  '--binding',
  'AUTH_MODE=public',
  '--binding',
  'SESSION_DAYS=30',
  '--persist-to',
  persistDir,
  '--ip',
  '127.0.0.1',
  '--port',
  String(port),
  '--live-reload=false',
  '--show-interactive-dev-session=false',
], {
  cwd: rootDir,
  env: cleanEnv(),
  stdio: ['ignore', 'pipe', 'pipe'],
});

server.stdout.on('data', (chunk) => captureLog(chunk));
server.stderr.on('data', (chunk) => captureLog(chunk));

try {
  await waitForApi(server);

  let cookie = '';
  const request = async (route, options = {}) => {
    const headers = {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    };

    const response = await fetch(`${baseUrl}${route}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      cookie = setCookie.split(';')[0];
    }

    const text = await response.text();
    const expectedStatus = options.status || (options.method === 'POST' ? 201 : 200);

    if (response.status !== expectedStatus) {
      throw new Error(`${options.method || 'GET'} ${route} returned ${response.status}: ${text}`);
    }

    const body = text ? JSON.parse(text) : null;

    return body;
  };

  const email = `smoke+${crypto.randomUUID()}@lifeos.local`;
  const registered = await request('/api/auth/register', {
    method: 'POST',
    status: 200,
    body: {
      email,
      password: 'Password123!',
      displayName: 'Smoke User',
    },
  });

  // Currency preference. A brand-new account has never had one chosen, so the
  // browser's timezone decides it once; after that a deliberate choice sticks
  // and detection must be a no-op on every later login.
  const seededPrefs = await request('/api/preferences');
  const detectedPrefs = await request('/api/preferences/detect', {
    method: 'POST',
    status: 200,
    body: { timezone: 'America/New_York', locale: 'en-US' },
  });
  const detectedFinance = await request('/api/finance/summary?currency=USD');
  const chosenPrefs = await request('/api/preferences', {
    method: 'PATCH',
    status: 200,
    body: { currency: 'INR' },
  });
  const reDetectedPrefs = await request('/api/preferences/detect', {
    method: 'POST',
    status: 200,
    body: { timezone: 'America/New_York', locale: 'en-US' },
  });

  const compassBeforeSetup = await request('/api/compass/today?date=2026-09-16&now=2026-09-16T14:00:00.000Z');
  const compassSetup = await request('/api/compass/plan', {
    method: 'PUT',
    body: {
      date: '2026-09-16',
      now: '2026-09-16T14:00:00.000Z',
      name: 'Smoke rhythm',
      focusTheme: { title: 'Reliable systems', description: 'Build and verify one resilient system.' },
      blocks: [
        { kind: 'deep_work', title: 'Smoke deep work', instruction: 'Stay with one task.', startMinute: 540, durationMinutes: 60, daysMask: 127 },
        { kind: 'reset', title: 'Smoke midday reset', instruction: 'Release the morning.', startMinute: 660, durationMinutes: 30, daysMask: 127 },
        { kind: 'learning', title: 'Smoke learning', instruction: 'Build the theme.', startMinute: 1080, durationMinutes: 60, daysMask: 127 },
        { kind: 'reflection', title: 'Smoke reflection', instruction: 'Close the day.', startMinute: 1260, durationMinutes: 30, daysMask: 127 },
      ],
    },
  });
  const compassDate = compassSetup.date;
  const deepWorkBlock = compassSetup.blocks.find((block) => block.kind === 'deep_work');
  await request(`/api/compass/days/${compassDate}`, {
    method: 'PATCH',
    status: 200,
    body: { importantThing: 'Verify Daily Compass' },
  });
  await request(`/api/compass/days/${compassDate}/checks/sleep`, {
    method: 'PUT',
    status: 200,
    body: { completed: true },
  });
  await request(`/api/compass/days/${compassDate}/blocks/${deepWorkBlock.id}`, {
    method: 'PUT',
    status: 200,
    body: { status: 'started' },
  });
  await request(`/api/compass/days/${compassDate}/blocks/${deepWorkBlock.id}`, {
    method: 'PUT',
    status: 200,
    body: { status: 'completed', actualMinutes: 55 },
  });
  const compassReset = await request(`/api/compass/days/${compassDate}/reset`, {
    method: 'POST',
    status: 200,
    body: { now: '2026-09-16T21:00:00.000Z' },
  });
  const compassClosed = await request(`/api/compass/days/${compassDate}/close`, {
    method: 'POST',
    status: 200,
    body: {
      now: '2026-09-17T02:00:00.000Z',
      captureText: 'Smoke capture',
      learnText: 'The reset is atomic.',
      tomorrowText: 'Keep the system simple.',
    },
  });
  const compassTomorrow = await request('/api/compass/today?date=2026-09-17&now=2026-09-17T14:00:00.000Z');
  const compassWeek = await request('/api/compass/week?start=2026-09-14');

  assert(compassBeforeSetup.configured === false, 'Compass should start unconfigured.');
  assert(compassSetup.configured === true && compassSetup.blocks.length === 4, 'Compass setup failed.');
  assert(compassReset.day.resetCount === 1, 'Compass reset was not recorded.');
  assert(compassReset.blocks.some((block) => block.kind === 'reset' && block.state === 'released'), 'Compass reset did not release missed blocks.');
  assert(compassClosed.day.closedAt && compassClosed.checks.reflection, 'Compass reflection did not close the day.');
  assert(compassTomorrow.day.importantThing === 'Keep the system simple.', 'Compass did not carry tomorrow’s priority forward.');
  assert(compassWeek.days.length === 7, 'Compass week did not return seven days.');

  const categories = await request('/api/finance/categories');
  const groceries = categories.categories.find((category) => category.type === 'expense' && category.name === 'Groceries')
    || categories.categories.find((category) => category.type === 'expense');

  // Exercise the Finance Hub's hottest CRUD paths and verify that batched
  // transaction writes keep the account balance exact across edits/deletes.
  const account = await request('/api/finance/accounts', {
    method: 'POST',
    body: { name: 'Smoke Checking', type: 'bank', currency: 'USD', openingBalance: 1000 },
  });
  const income = await request('/api/finance/transactions', {
    method: 'POST',
    body: {
      accountId: account.account.id,
      type: 'income',
      amount: 100,
      currency: 'USD',
      occurredOn: '2026-07-18',
      merchant: 'Smoke Payroll',
    },
  });
  const editedIncome = await request(`/api/finance/transactions/${income.transaction.id}`, {
    method: 'PATCH',
    status: 200,
    body: { amount: 125, merchant: 'Smoke Payroll Updated' },
  });
  const expense = await request('/api/finance/transactions', {
    method: 'POST',
    body: {
      accountId: account.account.id,
      categoryId: groceries?.id,
      type: 'expense',
      amount: 25,
      currency: 'USD',
      occurredOn: '2026-07-19',
      merchant: 'Smoke Grocery',
    },
  });
  await request(`/api/finance/transactions/${expense.transaction.id}`, {
    method: 'DELETE',
    status: 200,
  });

  const budget = await request('/api/finance/budgets', {
    method: 'POST',
    body: {
      name: 'Smoke Groceries',
      categoryId: groceries?.id,
      currency: 'USD',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      limit: 500,
    },
  });
  const editedBudget = await request(`/api/finance/budgets/${budget.budget.id}`, {
    method: 'PATCH',
    status: 200,
    body: { limit: 550 },
  });

  const goal = await request('/api/finance/goals', {
    method: 'POST',
    body: { name: 'Smoke Reserve', targetAmount: 1000, currency: 'USD', priority: 1 },
  });
  const contributedGoal = await request(`/api/finance/goals/${goal.goal.id}/contribute`, {
    method: 'POST',
    status: 200,
    body: { amount: 100 },
  });
  const editedGoal = await request(`/api/finance/goals/${goal.goal.id}`, {
    method: 'PATCH',
    status: 200,
    body: { name: 'Smoke Emergency Reserve' },
  });

  const imported = await request('/api/finance/import', {
    method: 'POST',
    status: 200,
    body: {
      currency: 'USD',
      transactions: [
        { type: 'expense', amount: 10, date: '2026-07-20', merchant: 'Smoke Import A', category: 'Groceries' },
        { type: 'income', amount: 20, date: '2026-07-21', merchant: 'Smoke Import B' },
        { type: 'expense', amount: 10, date: '2026-07-20', merchant: 'Smoke Import A', category: 'Groceries' },
      ],
    },
  });
  const financeAccounts = await request('/api/finance/accounts');
  const checkedAccount = financeAccounts.accounts.find((item) => item.id === account.account.id);
  const importAccount = financeAccounts.accounts.find((item) => item.name === 'USD Wallet');

  assert(editedIncome.transaction.amountMinor === 12500, 'Transaction update returned the wrong amount.');
  assert(editedBudget.budget.limitMinor === 55000, 'Budget update returned the wrong limit.');
  assert(contributedGoal.goal.savedAmountMinor === 10000, 'Goal contribution returned the wrong balance.');
  assert(editedGoal.goal.name === 'Smoke Emergency Reserve', 'Goal update was not persisted.');
  assert(imported.imported === 2 && imported.skipped === 1, 'Bulk import duplicate handling is incorrect.');
  assert(checkedAccount?.currentBalanceMinor === 112500, 'Batched transaction balance updates are incorrect.');
  assert(importAccount?.currentBalanceMinor === 1000, 'Bulk-import account balance update is incorrect.');

  const receipt = await request('/api/finance/receipts', {
    method: 'POST',
    body: {
      merchant: 'Local Grocery',
      amount: 42.5,
      currency: 'USD',
      categoryId: groceries?.id,
      transactionDate: '2026-07-18',
      fileName: 'receipt.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 12345,
      notes: 'Smoke bill metadata',
    },
  });
  const receiptEdit = await request(`/api/finance/receipts/${receipt.receipt.id}`, {
    method: 'PATCH',
    status: 200,
    body: { notes: 'Smoke bill metadata updated' },
  });
  const receipts = await request('/api/finance/receipts?currency=USD');

  const liability = await request('/api/finance/liabilities', {
    method: 'POST',
    body: {
      name: 'Car Loan',
      type: 'loan',
      currency: 'USD',
      principalAmount: 10000,
      currentBalance: 9000,
      interestRate: 6.5,
      monthlyPayment: 350,
      lender: 'Local Bank',
      dueDay: 5,
      notes: 'Smoke loan',
    },
  });
  const liabilityPayment = await request(`/api/finance/liabilities/${liability.liability.id}/payment`, {
    method: 'POST',
    status: 200,
    body: { amount: 300 },
  });
  const liabilities = await request('/api/finance/liabilities?currency=USD');

  const pantryItem = await request('/api/pantry/items', {
    method: 'POST',
    body: {
      name: 'Rice',
      category: 'Grains',
      quantity: 2,
      unit: 'kg',
      lowStockAt: 1,
      expiryDate: '2026-08-15',
      location: 'Pantry',
      notes: 'Smoke pantry',
    },
  });
  const consumedItem = await request(`/api/pantry/items/${pantryItem.item.id}/consume`, {
    method: 'POST',
    status: 200,
    body: { amount: 1 },
  });
  const shoppingItem = await request('/api/pantry/shopping', {
    method: 'POST',
    body: {
      name: 'Oats',
      category: 'Breakfast',
      quantity: 1,
      unit: 'box',
      source: 'manual',
    },
  });
  const purchasedShopping = await request(`/api/pantry/shopping/${shoppingItem.shoppingItem.id}`, {
    method: 'PATCH',
    status: 200,
    body: { status: 'purchased' },
  });
  const recipes = await request('/api/pantry/recipes', {
    method: 'POST',
  });
  const pantrySummary = await request('/api/pantry/summary');

  const vehicle = await request('/api/car/vehicles', {
    method: 'POST',
    body: {
      name: 'Family EV',
      make: 'Tesla',
      model: 'Model 3',
      year: 2025,
      odometerMiles: 1200,
      batteryPercent: 74,
      rangeMiles: 210,
      interiorTempF: 72,
      location: 'Home',
      status: 'parked',
    },
  });
  const vehicleEdit = await request(`/api/car/vehicles/${vehicle.vehicle.id}`, {
    method: 'PATCH',
    status: 200,
    body: { status: 'charging' },
  });
  const maintenance = await request(`/api/car/vehicles/${vehicle.vehicle.id}/maintenance`, {
    method: 'POST',
    body: {
      title: 'Tire rotation',
      dueMileage: 5000,
      dueDate: '2026-09-01',
      priority: 'normal',
      notes: 'Smoke service',
    },
  });
  const completedMaintenance = await request(`/api/car/maintenance/${maintenance.maintenanceItem.id}`, {
    method: 'PATCH',
    status: 200,
    body: { status: 'done' },
  });
  const carSummary = await request('/api/car/summary');
  const dashboard = await request('/api/dashboard?currency=USD&date=2026-07-18');

  console.log(JSON.stringify({
    ok: true,
    userCreated: Boolean(registered.user?.id),
    currencySeedSource: seededPrefs.preferences.currencySource,
    currencyDetected: `${detectedPrefs.preferences.currency}/${detectedPrefs.preferences.currencySource}`,
    currencyDetectedRegion: detectedPrefs.preferences.region,
    financeProfileSynced: detectedFinance.profile.currency === 'USD',
    currencyChosen: `${chosenPrefs.preferences.currency}/${chosenPrefs.preferences.currencySource}`,
    currencyKeptAfterRedetect: reDetectedPrefs.preferences.currency === 'INR'
      && reDetectedPrefs.preferences.currencySource === 'manual',
    compassConfigured: compassSetup.configured,
    compassResetCount: compassReset.day.resetCount,
    compassClosed: Boolean(compassClosed.day.closedAt),
    financeCrudBalance: checkedAccount.currentBalanceMinor,
    financeImportBalance: importAccount.currentBalanceMinor,
    financeImport: `${imported.imported} imported/${imported.skipped} skipped`,
    budgetLimit: editedBudget.budget.limitMinor,
    goalSaved: contributedGoal.goal.savedAmountMinor,
    receiptUpdated: receiptEdit.receipt?.notes === 'Smoke bill metadata updated',
    receipts: receipts.receipts.length,
    liabilityBalanceAfterPayment: liabilityPayment.liability.currentBalance,
    liabilities: liabilities.liabilities.length,
    pantryQuantityAfterConsume: consumedItem.item.quantity,
    shoppingStatus: purchasedShopping.shoppingItem.status,
    recipes: recipes.recipes.length,
    pantryItems: pantrySummary.items.length,
    vehicleStatus: vehicleEdit.vehicle.status,
    carVehicles: carSummary.vehicles.length,
    maintenanceStatus: completedMaintenance.maintenanceItem.status,
    dashboardLoaded: Boolean(dashboard.user?.id)
      && dashboard.finance?.summary?.currency === 'USD'
      && Array.isArray(dashboard.car?.vehicles)
      && Array.isArray(dashboard.pantry?.items)
      && Array.isArray(dashboard.meals?.entries)
      && dashboard.compass?.configured === true,
  }, null, 2));
} catch (error) {
  console.error(error.message);
  if (logs.length) {
    console.error(logs.slice(-80).join('\n'));
  }
  process.exitCode = 1;
} finally {
  await stopProcessTree(server);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: cleanEnv(),
      stdio: 'inherit',
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${path.basename(command)} exited with ${code}`));
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForApi(serverProcess) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Local API server exited with ${serverProcess.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      await delay(1000);
    }
  }

  throw new Error('Local API server did not become ready in time.');
}

async function stopProcessTree(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  const exited = new Promise((resolve) => {
    child.once('exit', resolve);
  });

  child.stdout?.destroy();
  child.stderr?.destroy();

  if (process.platform === 'win32') {
    await Promise.race([
      new Promise((resolve) => {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        killer.on('exit', resolve);
        killer.on('error', resolve);
      }),
      delay(5000),
    ]);
  } else {
    child.kill('SIGTERM');
  }

  await Promise.race([exited, delay(5000)]);

  if (child.exitCode === null) {
    try {
      child.kill('SIGKILL');
    } catch {
      // The process may already be gone.
    }

    await Promise.race([
      exited,
      delay(1000),
    ]);
  }
}

function cleanEnv() {
  const nextEnv = {};
  const pathValue = process.env.Path || process.env.PATH || process.env.path;

  for (const [key, value] of Object.entries(process.env)) {
    if (key.toLowerCase() !== 'path') {
      nextEnv[key] = value;
    }
  }

  if (pathValue) {
    nextEnv.Path = pathValue;
  }

  nextEnv.WRANGLER_SEND_METRICS = 'false';
  nextEnv.XDG_CONFIG_HOME = path.join(rootDir, '.wrangler-config');

  return nextEnv;
}

function captureLog(chunk) {
  const text = chunk.toString().trim();
  if (!text) {
    return;
  }

  logs.push(...text.split(/\r?\n/));
  if (logs.length > 120) {
    logs.splice(0, logs.length - 120);
  }
}

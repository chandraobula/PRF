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

  const categories = await request('/api/finance/categories');
  const groceries = categories.categories.find((category) => category.type === 'expense' && category.name === 'Groceries')
    || categories.categories.find((category) => category.type === 'expense');

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

  console.log(JSON.stringify({
    ok: true,
    userCreated: Boolean(registered.user?.id),
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

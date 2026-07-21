import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configDir = path.join(rootDir, '.wrangler-config');
const wranglerBin = path.join(
  rootDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
);

if (!existsSync(configDir)) {
  mkdirSync(configDir, { recursive: true });
}

const child = spawn(wranglerBin, process.argv.slice(2), {
  cwd: rootDir,
  env: {
    ...process.env,
    XDG_CONFIG_HOME: configDir,
    WRANGLER_SEND_METRICS: 'false',
  },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

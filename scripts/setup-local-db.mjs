import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrapper = path.join(rootDir, 'scripts', 'wrangler-local.mjs');
const persistDir = path.join(rootDir, '.wrangler', 'state');

const commands = [
  ['d1', 'execute', 'DB', '--local', '--persist-to', persistDir, '--file', path.join(rootDir, 'db', 'schema.sql'), '--yes'],
];

for (const args of commands) {
  await run(process.execPath, [wrapper, ...args]);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with ${code}`));
    });
  });
}

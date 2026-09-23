import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { home, stateDir } from '../src/common.js';

async function connection() {
  try { return JSON.parse(await fs.promises.readFile(path.join(stateDir, 'connection.json'), 'utf8')); }
  catch { return null; }
}

async function status() {
  const current = await connection();
  if (!current) return 'offline';
  try {
    const response = await fetch(`http://127.0.0.1:${current.port}/health`, {
      headers: { Authorization: `Bearer ${current.clientToken}` },
      signal: AbortSignal.timeout(1000)
    });
    if (!response.ok) return 'offline';
    const extension = await fetch(`http://127.0.0.1:${current.port}/extension-status`, { signal: AbortSignal.timeout(1000) });
    return extension.ok ? 'compatible' : 'legacy';
  } catch { return 'offline'; }
}

const initial = await status();
if (initial === 'compatible') {
  console.log('School Image MCP bridge is already running.');
  process.exit(0);
}
if (initial === 'legacy') {
  console.error('An older bridge is still running. Close its terminal or press Ctrl+C, then run start-school-image.bat again.');
  process.exit(2);
}

await fs.promises.mkdir(stateDir, { recursive: true });
const logPath = path.join(stateDir, 'broker.log');
const log = fs.openSync(logPath, 'a');
const child = spawn(process.execPath, [path.join(home, 'src', 'broker.js')], {
  cwd: home,
  detached: true,
  env: process.env,
  stdio: ['ignore', log, log],
  windowsHide: true
});
child.unref();

let started = false;
for (let attempt = 0; attempt < 30; attempt++) {
  if (await status() === 'compatible') {
    console.log('School Image MCP bridge started in the background.');
    started = true;
    break;
  }
  await delay(200);
}

if (!started) {
  console.error(`Bridge did not start. Check ${logPath}`);
  process.exitCode = 1;
}

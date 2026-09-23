import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { home } from '../src/common.js';

const state = await fs.mkdtemp(path.join(os.tmpdir(), 'school-launcher-test-'));
const port = 30000 + Math.floor(Math.random() * 10000);
const env = { ...process.env, SCHOOL_AI_STATE_DIR: state, SCHOOL_AI_BRIDGE_PORT: String(port) };

function run(script) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(home, 'scripts', script)], { env, windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

try {
  const launched = await run('launch-bridge.js');
  assert.equal(launched.code, 0, launched.stderr);
  const status = await fetch(`http://127.0.0.1:${port}/extension-status`, { signal: AbortSignal.timeout(2000) });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).broker, true);

  const stopped = await run('stop-bridge.js');
  assert.equal(stopped.code, 0, stopped.stderr);
  await delay(300);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/extension-status`, { signal: AbortSignal.timeout(500) }));
  console.log('PASS: background bridge launcher and authenticated shutdown');
} finally {
  await fs.rm(state, { recursive: true, force: true });
}

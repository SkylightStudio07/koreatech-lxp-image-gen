import fs from 'node:fs/promises';
import path from 'node:path';
import { stateDir } from '../src/common.js';

try {
  const current = JSON.parse(await fs.readFile(path.join(stateDir, 'connection.json'), 'utf8'));
  const response = await fetch(`http://127.0.0.1:${current.port}/shutdown`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${current.clientToken}` },
    signal: AbortSignal.timeout(2000)
  });
  if (!response.ok) throw new Error('SHUTDOWN_FAILED');
  console.log('School Image MCP bridge stopped.');
} catch {
  console.log('School Image MCP bridge is not running.');
}

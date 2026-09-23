import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const home = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const stateDir = process.env.SCHOOL_AI_STATE_DIR || path.join(home, '.local');
export const origin = 'https://ai.koreatech.ac.kr';
export const apiPrefix = '/api/AiCA/api/v1';
export class BridgeError extends Error {
  constructor(code, message = code) { super(message); this.code = code; }
}
export function safeError(e) {
  return { success: false, error: e instanceof BridgeError ? e.code : 'INTERNAL_ERROR', message: e instanceof BridgeError ? e.message : 'Operation failed; no remote details logged.' };
}
export function checkStatus(status, context) {
  if (status >= 200 && status < 300) return;
  const code = status === 401 ? 'AUTH_EXPIRED' : status === 403 ? 'CSRF_INVALID' : status === 429 || status === 402 ? 'QUOTA_EXHAUSTED' : context || 'GENERATION_FAILED';
  throw new BridgeError(code, `${code} (HTTP ${status})`);
}
export function validRoute(p, method) {
  return method === 'GET' && (/^\/(models|usage\/remaining)$/.test(p) || /^\/conversations\/[a-zA-Z0-9-]+(?:\/messages)?$/.test(p) || /^\/chat\/uploads\/[a-zA-Z0-9-]+$/.test(p)) || method === 'POST' && ['/chat/upload','/chat/completions'].includes(p);
}
export async function loadConnection() {
  try { return JSON.parse(await fs.readFile(path.join(stateDir, 'connection.json'), 'utf8')); }
  catch { throw new BridgeError('BROWSER_OFFLINE', 'Run npm run bridge and connect the logged-in school tab.'); }
}
export function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}
export async function safePath(input, root, { read = false } = {}) {
  if (!root || !input || /[\0]/.test(input) || input.split(/[\\/]/).includes('..')) throw new BridgeError('INVALID_OUTPUT_PATH');
  const realRoot = await fs.realpath(root);
  const resolved = path.resolve(root, input);
  if (!isInside(realRoot, resolved) || /:/.test(resolved.slice(path.parse(resolved).root.length))) throw new BridgeError('INVALID_OUTPUT_PATH');
  let cursor = realRoot;
  const parts = path.relative(realRoot, resolved).split(path.sep);
  for (const part of parts.slice(0, -1)) {
    cursor = path.join(cursor, part);
    let info;
    try { info = await fs.lstat(cursor); } catch (e) {
      if (e.code !== 'ENOENT' || read) throw new BridgeError('INVALID_OUTPUT_PATH');
      await fs.mkdir(cursor); info = await fs.lstat(cursor);
    }
    if (info.isSymbolicLink() || !info.isDirectory() || !isInside(realRoot, await fs.realpath(cursor))) throw new BridgeError('INVALID_OUTPUT_PATH');
  }
  try {
    const info = await fs.lstat(resolved);
    if (info.isSymbolicLink() || !info.isFile() || info.nlink > 1) throw new BridgeError('INVALID_OUTPUT_PATH');
  } catch (e) { if (e.code !== 'ENOENT' || read) throw e; }
  return resolved;
}

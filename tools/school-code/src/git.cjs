const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const MAX_OUTPUT_CHARS = 2 * 1024 * 1024;
const MAX_PATHS = 100;
const DEFAULT_TIMEOUT_MS = 90_000;
const SENSITIVE_PART = /^(?:\.env(?:\..*)?|\.git(?:-credentials)?|id_rsa(?:\.pub)?|id_ed25519(?:\.pub)?|credentials(?:\..*)?|secrets?(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/i;

function gitError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function redact(text) {
  return String(text || '')
    .replace(/(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, '$1<credentials>@')
    .replace(/(authorization|token|password|secret)=([^\s&]+)/gi, '$1=<redacted>');
}

function append(current, chunk) {
  const next = current + String(chunk || '');
  return next.length <= MAX_OUTPUT_CHARS ? next : `${next.slice(0, MAX_OUTPUT_CHARS)}\n[출력 제한으로 잘림]`;
}

function validateArg(value, label = 'Git 인자') {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw gitError('INVALID_ARGUMENT', `${label}이 올바르지 않습니다.`);
  return value;
}

function normalizeRelativePath(value, label = '경로') {
  const input = validateArg(value, label);
  if (path.isAbsolute(input) || input.startsWith('\\') || input.includes(':')) throw gitError('INVALID_PATH', `${label}은 프로젝트 내부 상대 경로여야 합니다.`);
  const parts = input.split(/[\\/]/).filter(Boolean);
  if (!parts.length || parts.some(part => part === '.' || part === '..' || SENSITIVE_PART.test(part) || /[. ]$/.test(part))) {
    throw gitError('SENSITIVE_PATH', `${label}에 숨김·비밀·위험 경로를 사용할 수 없습니다.`);
  }
  return parts.join('/');
}

function normalizePaths(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > MAX_PATHS) throw gitError('INVALID_ARGUMENT', `Git 경로는 1~${MAX_PATHS}개까지 지정할 수 있습니다.`);
  return [...new Set(paths.map(value => normalizeRelativePath(value, 'Git 경로')))];
}

function normalizeRef(value, label = '브랜치') {
  const ref = validateArg(value, label).trim();
  if (ref.length > 200 || ref.startsWith('-') || ref.includes('..') || ref.includes('@{') || ref.includes('\\') || ref.endsWith('/') || ref.endsWith('.') || ref.includes('//') || /[~^:?*\[\]\s]/.test(ref)) {
    throw gitError('INVALID_REF', `${label} 이름이 올바르지 않습니다.`);
  }
  return ref;
}

function normalizeRemote(value = 'origin') {
  const remote = validateArg(String(value || 'origin'), '원격 이름');
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(remote)) throw gitError('INVALID_REMOTE', '원격 이름이 올바르지 않습니다.');
  return remote;
}

function parseStatus(text) {
  const entries = [];
  let sensitive_count = 0;
  let branch = null, upstream = null, ahead = 0, behind = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw) continue;
    if (raw.startsWith('# branch.head ')) branch = raw.slice(14).trim();
    else if (raw.startsWith('# branch.upstream ')) upstream = raw.slice(18).trim();
    else if (raw.startsWith('# branch.ab ')) {
      const match = raw.match(/^# branch\.ab ([+-]\d+) ([+-]\d+)$/);
      if (match) { ahead = Number(match[1]) || 0; behind = Number(match[2]) || 0; }
    } else if (raw.startsWith('? ')) {
      const file = raw.slice(2).trim();
      if (isSensitivePath(file)) sensitive_count++; else entries.push({ kind: 'untracked', index: '?', worktree: '?', path: file });
    } else if (raw.startsWith('! ')) {
      const file = raw.slice(2).trim();
      if (isSensitivePath(file)) sensitive_count++; else entries.push({ kind: 'ignored', index: '!', worktree: '!', path: file });
    } else if (raw.startsWith('1 ') || raw.startsWith('2 ') || raw.startsWith('u ')) {
      const tab = raw.indexOf('\t');
      const before = (tab >= 0 ? raw.slice(0, tab) : raw).split(' ');
      const kind = raw[0] === 'u' ? 'unmerged' : raw[0] === '2' ? 'renamed' : 'changed';
      const xy = before[1] || '  ';
      const file = tab >= 0 ? raw.slice(tab + 1).split('\t')[0] : before.at(-1);
      const orig = raw[0] === '2' && tab >= 0 ? raw.slice(tab + 1).split('\t')[1] : undefined;
      if (file && isSensitivePath(file)) sensitive_count++;
      else if (file) entries.push({ kind, index: xy[0] || ' ', worktree: xy[1] || ' ', path: file, ...(orig ? { original_path: orig } : {}) });
    }
  }
  return { branch, upstream, ahead, behind, entries, sensitive_count };
}

function isSensitivePath(value) {
  const parts = String(value || '').replaceAll('\\', '/').split('/').filter(Boolean);
  return parts.some(part => SENSITIVE_PART.test(part));
}

async function runGit(root, args, { executable = 'git', timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw gitError('INVALID_ARGUMENT', 'Git 인자가 올바르지 않습니다.');
  const started = Date.now();
  return await new Promise((resolve, reject) => {
    let child;
    try { child = spawn(executable || 'git', args, { cwd: root, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { reject(gitError('GIT_NOT_FOUND', `Git을 실행할 수 없습니다: ${error.message}`)); return; }
    let stdout = '', stderr = '', settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch { /* best effort */ }
      reject(gitError('GIT_TIMEOUT', `Git 명령이 ${Math.round(timeoutMs / 1000)}초 안에 끝나지 않았습니다.`));
    }, timeoutMs);
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
    child.once('error', error => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      reject(error.code === 'ENOENT' ? gitError('GIT_NOT_FOUND', 'Git 실행 파일을 찾지 못했습니다. Git을 설치하거나 실행 파일 경로를 설정하세요.') : gitError('GIT_ERROR', error.message));
    });
    child.once('close', code => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      resolve({ exit_code: typeof code === 'number' ? code : null, stdout: redact(stdout), stderr: redact(stderr), duration_ms: Date.now() - started });
    });
  });
}

function notRepository(result) {
  return result.exit_code !== 0 && /not a git repository|outside repository|does not have a commit/i.test(result.stderr || '');
}

function failure(result, fallback = 'Git 명령이 실패했습니다.') {
  if (result.exit_code === 0) return result;
  if (notRepository(result)) return { repository: false, code: 'NOT_A_REPOSITORY', message: '연결된 프로젝트가 Git 저장소가 아닙니다.' };
  throw gitError('GIT_COMMAND_FAILED', redact((result.stderr || result.stdout || fallback).trim()).slice(0, 1200));
}

async function repositoryInfo(root, options = {}) {
  const top = await runGit(root, ['rev-parse', '--show-toplevel'], options);
  if (notRepository(top)) return { repository: false, code: 'NOT_A_REPOSITORY', message: '연결된 프로젝트가 Git 저장소가 아닙니다.' };
  failure(top);
  const branch = await runGit(root, ['branch', '--show-current'], options);
  const head = await runGit(root, ['rev-parse', '--short', 'HEAD'], options);
  const remote = await runGit(root, ['remote', 'get-url', 'origin'], options);
  const state = await status(root, options);
  return { repository: true, repository_name: path.basename(top.stdout.trim()), branch: branch.stdout.trim() || null, head: head.exit_code === 0 ? head.stdout.trim() : null, remote: remote.exit_code === 0 ? redact(remote.stdout.trim()) : null, ...state };
}

async function status(root, options = {}) {
  const result = await runGit(root, ['status', '--porcelain=v2', '--branch', '--untracked-files=all'], options);
  if (notRepository(result)) return { repository: false, code: 'NOT_A_REPOSITORY', message: '연결된 프로젝트가 Git 저장소가 아닙니다.' };
  failure(result);
  const parsed = parseStatus(result.stdout);
  return { repository: true, ...parsed, clean: parsed.entries.length === 0, output_truncated: result.stdout.includes('[출력 제한으로 잘림]') };
}

async function diff(root, { staged = false, paths = [] } = {}, options = {}) {
  const args = ['diff', '--no-ext-diff', '--unified=3'];
  if (staged) args.push('--cached');
  if (paths.length) args.push('--', ...normalizePaths(paths));
  const result = await runGit(root, args, options);
  if (notRepository(result)) return { repository: false, code: 'NOT_A_REPOSITORY', message: '연결된 프로젝트가 Git 저장소가 아닙니다.' };
  failure(result);
  return { repository: true, staged, diff: result.stdout, truncated: result.stdout.includes('[출력 제한으로 잘림]'), duration_ms: result.duration_ms };
}

async function log(root, { limit = 20 } = {}, options = {}) {
  const count = Math.max(1, Math.min(100, Number(limit) || 20));
  const result = await runGit(root, ['log', `-${count}`, '--date=iso-strict', '--pretty=format:%H%x09%h%x09%ad%x09%an%x09%s'], options);
  if (notRepository(result)) return { repository: false, code: 'NOT_A_REPOSITORY', message: '연결된 프로젝트가 Git 저장소가 아닙니다.' };
  failure(result);
  const commits = result.stdout.split(/\r?\n/).filter(Boolean).map(line => { const [hash, short, date, author, ...subject] = line.split('\t'); return { hash, short, date, author, subject: subject.join('\t') }; });
  return { repository: true, commits };
}

async function branches(root, options = {}) {
  const result = await runGit(root, ['for-each-ref', '--format=%(HEAD)\t%(refname:short)\t%(upstream:short)\t%(objectname:short)', 'refs/heads', 'refs/remotes'], options);
  if (notRepository(result)) return { repository: false, code: 'NOT_A_REPOSITORY', message: '연결된 프로젝트가 Git 저장소가 아닙니다.' };
  failure(result);
  const items = result.stdout.split(/\r?\n/).filter(Boolean).map(line => { const [head, name, upstream, sha] = line.split('\t'); return { current: head === '*', name, upstream: upstream || null, sha }; });
  return { repository: true, branches: items };
}

async function mutate(root, args, options = {}) {
  const result = await runGit(root, args, options);
  if (notRepository(result)) return { repository: false, code: 'NOT_A_REPOSITORY', message: '연결된 프로젝트가 Git 저장소가 아닙니다.' };
  failure(result);
  return { repository: true, output: result.stdout.trim(), warning: result.stderr.trim() || undefined, duration_ms: result.duration_ms };
}

async function createBranch(root, { name, start_point } = {}, options = {}) {
  const branch = normalizeRef(name, '브랜치');
  const args = ['switch', '-c', branch];
  if (start_point) args.push(normalizeRef(start_point, '기준 브랜치'));
  return mutate(root, args, options);
}

async function stage(root, { paths } = {}, options = {}) { return mutate(root, ['add', '--', ...normalizePaths(paths)], options); }

async function commit(root, { message } = {}, options = {}) {
  const text = validateArg(message, '커밋 메시지').trim();
  if (text.length > 2000) throw gitError('INVALID_ARGUMENT', '커밋 메시지는 2,000자 이하로 입력하세요.');
  const state = await status(root, options);
  if (!state.repository) return state;
  if (state.sensitive_count) throw gitError('SENSITIVE_PATH', '민감한 파일이 변경 목록에 있어 커밋을 중단했습니다.');
  return mutate(root, ['commit', '-m', text], options);
}

async function fetch(root, { remote = 'origin' } = {}, options = {}) { return mutate(root, ['fetch', '--prune', normalizeRemote(remote)], options); }

async function pull(root, { remote = 'origin', branch } = {}, options = {}) {
  const args = ['pull', '--ff-only', normalizeRemote(remote)];
  if (branch) args.push(normalizeRef(branch, '브랜치'));
  return mutate(root, args, options);
}

async function push(root, { remote = 'origin', branch, set_upstream = false } = {}, options = {}) {
  const args = ['push'];
  if (set_upstream) args.push('--set-upstream');
  args.push(normalizeRemote(remote));
  if (branch) args.push(normalizeRef(branch, '브랜치'));
  return mutate(root, args, options);
}

module.exports = { MAX_OUTPUT_CHARS, isSensitivePath, runGit, repositoryInfo, status, diff, log, branches, createBranch, stage, commit, fetch, pull, push };

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} = require('node:crypto');

const SESSION_COOKIE = 'bcsd_session';
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 32).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function passwordMatches(password, encoded) {
  const [algorithm, salt, expected] = String(encoded || '').split(':');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  try {
    const actual = scryptSync(String(password), salt, 32).toString('hex');
    return safeEqual(actual, expected);
  } catch { return false; }
}

function cleanUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9가-힣._-]{2,40}$/i.test(username)) throw Error('아이디는 2~40자의 한글·영문·숫자와 . _ -만 사용할 수 있습니다.');
  return username;
}

function cleanPassword(value) {
  const password = String(value || '');
  if (password.length < 8 || password.length > 200) throw Error('비밀번호는 8~200자로 입력하세요.');
  return password;
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function encodeCookie(value, maxAge = 7 * 24 * 60 * 60, secure = false) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function htmlEscape(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

class RelayAuthStore {
  constructor({ filePath = '', pairingTtlMs = 10 * 60 * 1000, sessionTtlMs = 7 * 24 * 60 * 60 * 1000, registrationCode = '', allowRegistration = true } = {}) {
    this.filePath = filePath;
    this.pairingTtlMs = pairingTtlMs;
    this.sessionTtlMs = sessionTtlMs;
    this.registrationCode = String(registrationCode || '');
    this.allowRegistration = allowRegistration !== false;
    this.data = { users: [], tokens: [] };
    this.sessions = new Map();
    this.pairs = new Map();
    this.writeQueue = Promise.resolve();
  }

  async load() {
    if (!this.filePath) return this;
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.tokens)) this.data = parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return this;
  }

  async save() {
    if (!this.filePath) return;
    const payload = JSON.stringify(this.data, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temp = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(temp, payload, { mode: 0o600 });
      await fs.rename(temp, this.filePath);
    });
    return this.writeQueue;
  }

  userById(id) { return this.data.users.find(user => user.id === id) || null; }
  userByUsername(username) { return this.data.users.find(user => user.username === username) || null; }

  async register(username, password, registrationCode = '') {
    if (!this.allowRegistration && (!this.registrationCode || !safeEqual(registrationCode, this.registrationCode))) throw Error('현재 서버는 신규 가입을 닫아 두었습니다. 관리자에게 초대 코드를 요청하세요.');
    if (this.registrationCode && !safeEqual(registrationCode, this.registrationCode)) throw Error('가입 코드가 올바르지 않습니다.');
    username = cleanUsername(username); password = cleanPassword(password);
    if (this.userByUsername(username)) throw Error('이미 사용 중인 아이디입니다.');
    const user = { id: randomUUID(), username, passwordHash: passwordHash(password), createdAt: Date.now() };
    this.data.users.push(user); await this.save();
    return { id: user.id, username: user.username };
  }

  authenticate(username, password) {
    const user = this.userByUsername(String(username || '').trim().toLowerCase());
    if (!user || !passwordMatches(String(password || ''), user.passwordHash)) throw Error('아이디 또는 비밀번호가 올바르지 않습니다.');
    return { id: user.id, username: user.username };
  }

  createSession(userId) {
    const token = randomBytes(32).toString('hex');
    this.sessions.set(digest(token), { userId, expiresAt: Date.now() + this.sessionTtlMs });
    return token;
  }

  userFromRequest(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const session = this.sessions.get(digest(token));
    if (!session || session.expiresAt <= Date.now()) { if (session) this.sessions.delete(digest(token)); return null; }
    return this.userById(session.userId);
  }

  logout(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) this.sessions.delete(digest(token));
  }

  createPair({ workspaceId = '', workspaceName = '', deviceId = '' } = {}) {
    const pairId = randomUUID();
    const pairSecret = randomBytes(32).toString('hex');
    const code = randomBytes(4).toString('hex').toUpperCase();
    const pair = {
      id: pairId,
      secretHash: digest(pairSecret),
      code,
      workspaceId: String(workspaceId || '').slice(0, 200),
      workspaceName: String(workspaceName || '').slice(0, 120),
      deviceId: String(deviceId || '').slice(0, 120),
      createdAt: Date.now(),
      expiresAt: Date.now() + this.pairingTtlMs,
      userId: null,
      delivered: false,
    };
    this.pairs.set(pairId, pair);
    return { pairId, pairSecret, code, expiresAt: pair.expiresAt };
  }

  pairBySecret(pairId, secret) {
    const pair = this.pairs.get(String(pairId || ''));
    if (!pair || pair.expiresAt <= Date.now() || !safeEqual(pair.secretHash, digest(secret))) return null;
    return pair;
  }

  pairByCode(code) {
    const normalized = String(code || '').trim().toUpperCase();
    for (const pair of this.pairs.values()) if (pair.expiresAt > Date.now() && pair.code === normalized) return pair;
    return null;
  }

  approvePair(pair, userId) {
    if (!pair || pair.expiresAt <= Date.now()) throw Error('연결 코드가 만료되었습니다. VS Code에서 새 코드를 발급하세요.');
    if (!this.userById(userId)) throw Error('로그인 세션이 올바르지 않습니다.');
    pair.userId = userId;
    return pair;
  }

  issuePairTokens(pair) {
    if (!pair?.userId) return null;
    const existing = this.data.tokens.filter(token => token.pairId === pair.id && !token.revokedAt);
    if (existing.length) return null;
    const workerToken = randomBytes(32).toString('hex');
    const mcpToken = randomBytes(32).toString('hex');
    const common = { userId: pair.userId, pairId: pair.id, workspaceId: pair.workspaceId, deviceId: pair.deviceId, createdAt: Date.now(), revokedAt: null };
    this.data.tokens.push({ ...common, id: randomUUID(), kind: 'worker', hash: digest(workerToken) }, { ...common, id: randomUUID(), kind: 'mcp', hash: digest(mcpToken) });
    pair.issued = true;
    // Raw values are held only until the extension receives this one response.
    pair.raw = { workerToken, mcpToken };
    void this.save();
    return pair.raw;
  }

  pairStatus(pair) {
    if (!pair) return { status: 'invalid' };
    if (pair.expiresAt <= Date.now()) return { status: 'expired' };
    if (!pair.userId) return { status: 'pending', expiresAt: pair.expiresAt };
    if (!pair.raw) this.issuePairTokens(pair);
    if (!pair.raw) return { status: 'approved', expiresAt: pair.expiresAt };
    const raw = pair.raw;
    delete pair.raw;
    return { status: 'approved', expiresAt: pair.expiresAt, ...raw };
  }

  verifyToken(raw, kind) {
    if (!TOKEN_PATTERN.test(String(raw || ''))) return null;
    const token = this.data.tokens.find(item => item.kind === kind && !item.revokedAt && safeEqual(item.hash, digest(raw)));
    return token ? { ...token } : null;
  }

  revokeUserTokens(userId) {
    let changed = false;
    for (const token of this.data.tokens) if (token.userId === userId && !token.revokedAt) { token.revokedAt = Date.now(); changed = true; }
    if (changed) void this.save();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(key);
    for (const [key, pair] of this.pairs) if (pair.expiresAt <= now) this.pairs.delete(key);
  }
}

function pairingPage({ code, user, error = '', expiresAt = 0 }) {
  const message = error ? `<p class="error">${htmlEscape(error)}</p>` : '';
  const login = user
    ? `<p>로그인: <strong>${htmlEscape(user.username)}</strong></p><form method="post" action="/auth/pair/approve"><input type="hidden" name="code" value="${htmlEscape(code)}"><button>이 기기를 연결</button></form><form method="post" action="/auth/logout"><button class="secondary">로그아웃</button></form>`
    : `<h2>BCSD 계정으로 로그인</h2><form method="post" action="/auth/login"><input type="hidden" name="code" value="${htmlEscape(code)}"><label>아이디<input name="username" autocomplete="username" required></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label><button>로그인 후 연결</button></form><hr><h2>처음 사용하나요?</h2><form method="post" action="/auth/register"><input type="hidden" name="code" value="${htmlEscape(code)}"><label>아이디<input name="username" autocomplete="username" required></label><label>비밀번호<input name="password" type="password" autocomplete="new-password" required></label><label>가입 코드(필요한 경우)<input name="registrationCode"></label><button>가입 후 연결</button></form>`;
  return `<!doctype html><meta charset="utf-8"><title>School Code 연결</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5}form{display:grid;gap:.7rem}label{display:grid;gap:.2rem}input{font:inherit;padding:.5rem;border:1px solid #bbb;border-radius:.4rem}button{font:inherit;padding:.6rem;border:0;border-radius:.4rem;background:#2563eb;color:white;cursor:pointer}.secondary{background:#666}.error{color:#b91c1c}.code{font-size:2rem;letter-spacing:.2em}</style><h1>School Code 연결</h1><p>VS Code에서 요청한 연결입니다. 아래 코드를 확인하세요.</p><p class="code"><strong>${htmlEscape(code)}</strong></p><p>유효 시간: ${Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000))}분</p>${message}${login}`;
}

module.exports = { RelayAuthStore, SESSION_COOKIE, encodeCookie, pairingPage, digest };

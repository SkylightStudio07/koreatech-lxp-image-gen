const { createHash } = require('node:crypto');

function tokenFingerprint(token) {
  const value = String(token || '');
  return value.length ? createHash('sha256').update(value).digest('hex').slice(0, 12) : null;
}

function classifyRelayError(value) {
  const message = String(value?.message || value || '').trim();
  if (!message) return { code: 'OK', message: '오류가 없습니다.' };
  if (/HTTP 401|unauthorized|인증/i.test(message)) return { code: 'AUTH', message: '워커 토큰이 없거나 만료되었습니다.' };
  if (/HTTP 403|forbidden|권한/i.test(message)) return { code: 'FORBIDDEN', message: '현재 계정·기기·프로젝트에 권한이 없습니다.' };
  if (/HTTP 409|already connected|충돌/i.test(message)) return { code: 'CONFLICT', message: '같은 프로젝트의 다른 워커가 이미 연결되어 있습니다.' };
  if (/HTTP 410|expired|만료/i.test(message)) return { code: 'EXPIRED', message: '작업 임대 시간이 끝났습니다. 연결을 유지한 뒤 다시 실행하세요.' };
  if (/offline|오프라인|연결.*안 됨|연결.*끊/i.test(message)) return { code: 'OFFLINE', message: 'VS Code 워커가 중계 서버에 연결되지 않았습니다.' };
  if (/fetch failed|ECONN|ETIMEDOUT|network|네트워크/i.test(message)) return { code: 'NETWORK', message: '중계 서버 또는 브라우저 연결을 확인하세요.' };
  return { code: 'UNKNOWN', message: message.slice(0, 300) };
}

function relayDiagnostics({ bridgeConnected = false, relayConnected = false, relayPending = false, relayError = '', project = null, token = '', mcpToken = '', health = null } = {}) {
  const error = classifyRelayError(relayError);
  const checks = [
    { id: 'project', ok: Boolean(project), label: project ? `프로젝트: ${project.name || project.path}` : '프로젝트가 선택되지 않음' },
    { id: 'browser', ok: Boolean(bridgeConnected), label: bridgeConnected ? '학교 브라우저 연결됨' : '학교 브라우저 연결 안 됨' },
    { id: 'worker', ok: Boolean(relayConnected), label: relayPending ? '브라우저 승인 대기 중' : relayConnected ? 'VS Code 워커 연결됨' : 'VS Code 워커 오프라인' },
    { id: 'token', ok: Boolean(token), label: token ? `워커 토큰 준비됨 (${tokenFingerprint(token)})` : '워커 토큰 없음' },
    { id: 'mcp', ok: Boolean(mcpToken), label: mcpToken ? `MCP 토큰 준비됨 (${tokenFingerprint(mcpToken)})` : 'MCP 토큰 없음' },
  ];
  const ok = checks.every(item => !['token', 'mcp'].includes(item.id) ? item.ok : true) && !['AUTH', 'FORBIDDEN', 'NETWORK', 'OFFLINE', 'EXPIRED'].includes(error.code);
  return { ok, code: ok ? 'OK' : error.code, message: ok ? '브라우저·워커·프로젝트 연결이 정상입니다.' : error.message, health: health && typeof health === 'object' ? { ok: health.ok === true, version: health.version || null, tool_count: Number.isFinite(health.tool_count) ? health.tool_count : null } : null, checks };
}

module.exports = { tokenFingerprint, classifyRelayError, relayDiagnostics };

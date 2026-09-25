const { randomUUID } = require('node:crypto');

// This is a catalogue of integrations, not a list of credentials.  Tokens and
// API keys are deliberately kept out of workspaceState and are stored in
// VS Code SecretStorage by the extension coordinator.
const MCP_CATALOG = Object.freeze([
  {
    id: 'school-workspace',
    name: '학교 Workspace',
    description: '현재 프로젝트의 파일·셸·Unity 도구를 학교 AI에 연결합니다.',
    kind: 'relay',
    builtIn: true,
    configurable: true,
    capabilities: ['workspace', 'shell', 'unity'],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Integration Secret 또는 공개 링크로 Notion 페이지를 읽기 전용으로 검색합니다.',
    kind: 'integration',
    builtIn: true,
    configurable: true,
    capabilities: ['search', 'read'],
  },
  {
    id: 'unity-cli',
    name: 'Unity CLI',
    description: '연결된 Unity 프로젝트에서 테스트·빌드를 실행합니다.',
    kind: 'local',
    builtIn: true,
    configurable: true,
    capabilities: ['unity', 'build'],
  },
  {
    id: 'git-cli',
    name: 'Git CLI',
    description: '연결된 프로젝트의 Git 상태·diff·브랜치·커밋·동기화를 관리합니다.',
    kind: 'local',
    builtIn: true,
    configurable: true,
    capabilities: ['git', 'version-control', 'commit'],
  },
  {
    id: 'unity-editor',
    name: 'Unity Editor MCP',
    description: '실행 중인 Unity Editor의 씬과 게임 오브젝트를 제어합니다.',
    kind: 'local-mcp',
    builtIn: true,
    configurable: true,
    capabilities: ['unity', 'scene'],
  },
  {
    id: 'blender',
    name: 'Blender MCP',
    description: 'Blender MCP 서버를 선택해 연결 정보를 관리합니다.',
    kind: 'remote-mcp',
    builtIn: true,
    configurable: true,
    capabilities: ['blender', 'scene'],
  },
  {
    id: 'unreal',
    name: 'Unreal MCP',
    description: 'Unreal MCP 서버를 선택해 연결 정보를 관리합니다.',
    kind: 'remote-mcp',
    builtIn: true,
    configurable: true,
    capabilities: ['unreal', 'editor'],
  },
  {
    id: 'figma',
    name: 'Figma MCP',
    description: 'Figma 파일·프레임·컴포넌트 정보를 MCP로 읽고 디자인 컨텍스트를 제공합니다.',
    kind: 'remote-mcp',
    builtIn: true,
    configurable: true,
    defaultUrl: 'https://mcp.figma.com/mcp',
    auth: 'oauth-or-bearer',
    capabilities: ['figma', 'design', 'read', 'code'],
  },
]);

function cleanText(value, fallback, max = 240) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, max);
}

function normalizeConnection(value) {
  const input = value && typeof value === 'object' ? value : {};
  const catalog = MCP_CATALOG.find(item => item.id === input.catalogId);
  const catalogId = catalog ? catalog.id : cleanText(input.catalogId, 'custom', 64);
  const fallback = catalog || { id: 'custom', name: '사용자 지정 MCP', description: '사용자가 추가한 MCP 서버', kind: 'remote-mcp', capabilities: [] };
  const id = /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(String(input.id || '')) ? String(input.id) : `${catalogId}-${randomUUID().slice(0, 8)}`;
  let url = '';
  try {
    if (input.url) {
      const parsed = new URL(String(input.url));
      url = parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, ''));
    }
  } catch { /* invalid URLs are not persisted */ }
  return {
    id,
    catalogId,
    name: cleanText(input.name, fallback.name, 80),
    description: cleanText(input.description, fallback.description, 240),
    kind: cleanText(input.kind, fallback.kind, 32),
    url,
    enabled: input.enabled !== false,
    configuredAt: Number.isFinite(input.configuredAt) ? input.configuredAt : Date.now(),
    capabilities: Array.isArray(input.capabilities) ? input.capabilities.filter(x => typeof x === 'string').slice(0, 20) : [...(fallback.capabilities || [])],
  };
}

class McpRegistry {
  constructor(storage) {
    this.storage = storage;
    const saved = storage?.get?.('schoolCode.mcp.connections');
    this.connections = Array.isArray(saved) ? saved.map(normalizeConnection) : [];
    this.connections = [...new Map(this.connections.map(connection => [connection.id, connection])).values()];
  }

  get(id) { return this.connections.find(connection => connection.id === id) || null; }

  upsert(value) {
    const connection = normalizeConnection(value);
    const index = this.connections.findIndex(item => item.id === connection.id);
    if (index === -1) this.connections.push(connection);
    else this.connections[index] = { ...this.connections[index], ...connection };
    return this.get(connection.id);
  }

  remove(id) { this.connections = this.connections.filter(connection => connection.id !== id); }

  setEnabled(id, enabled) {
    const connection = this.get(id);
    if (!connection) throw Error('MCP 연결을 찾을 수 없습니다.');
    connection.enabled = enabled === true;
    return connection;
  }

  async save() {
    if (this.storage?.update) await this.storage.update('schoolCode.mcp.connections', this.connections.map(({ token, ...connection }) => connection));
  }

  /**
   * Return catalogue entries suitable for a webview.  The `configured` and
   * `enabled` fields are derived locally and never contain a token.
   */
  list() {
    const configured = new Map(this.connections.map(connection => [connection.catalogId, connection]));
    const known = MCP_CATALOG.map(item => ({ ...item, configured: configured.has(item.id), ...(configured.get(item.id) || {}) }));
    const custom = this.connections.filter(connection => !MCP_CATALOG.some(item => item.id === connection.catalogId));
    return [...known, ...custom.map(connection => ({ ...connection, configured: true, builtIn: false, configurable: true }))];
  }

  static catalogItem(id) { return MCP_CATALOG.find(item => item.id === id) || null; }
  static catalog() { return MCP_CATALOG.map(item => ({ ...item })); }
}

module.exports = { MCP_CATALOG, McpRegistry, normalizeConnection };

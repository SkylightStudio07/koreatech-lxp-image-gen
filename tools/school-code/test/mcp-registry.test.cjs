const test = require('node:test');
const assert = require('node:assert/strict');
const { McpRegistry, normalizeConnection } = require('../src/mcp-registry.cjs');

function storage(initial) {
  const values = new Map(Object.entries(initial || {}));
  return { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, update: async (key, value) => values.set(key, value), values };
}

test('registry exposes built-in catalogue without leaking credentials', async () => {
  const s = storage({ 'schoolCode.mcp.connections': [{ id: 'blender', catalogId: 'blender', url: 'https://blender.example/mcp', token: 'secret' }] });
  const registry = new McpRegistry(s);
  const blender = registry.list().find(item => item.id === 'blender');
  assert.equal(blender.configured, true);
  assert.equal(blender.url, 'https://blender.example/mcp');
  assert.equal('token' in blender, false);
  await registry.save();
  assert.equal('token' in s.values.get('schoolCode.mcp.connections')[0], false);
});

test('registry upserts, toggles, and removes connections', () => {
  const registry = new McpRegistry(storage());
  const entry = registry.upsert({ id: 'unreal', catalogId: 'unreal', url: 'http://localhost:3010', enabled: true });
  assert.equal(entry.url, 'http://localhost:3010');
  registry.setEnabled('unreal', false);
  assert.equal(registry.get('unreal').enabled, false);
  registry.remove('unreal');
  assert.equal(registry.get('unreal'), null);
});

test('invalid remote URL is not persisted as a usable URL', () => {
  const value = normalizeConnection({ catalogId: 'custom', url: 'not a url' });
  assert.equal(value.url, '');
  assert.equal(value.kind, 'remote-mcp');
});

test('Figma catalogue entry provides the official remote MCP endpoint', () => {
  const registry = new McpRegistry(storage());
  const figma = registry.list().find(item => item.id === 'figma');
  assert.equal(figma.defaultUrl, 'https://mcp.figma.com/mcp');
  assert.equal(figma.auth, 'oauth-or-bearer');
  assert.deepEqual(figma.capabilities, ['figma', 'design', 'read', 'code']);
  assert.equal('token' in figma, false);
});

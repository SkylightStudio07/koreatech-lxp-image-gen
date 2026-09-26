const test = require('node:test');
const assert = require('node:assert/strict');
const { RunStore } = require('../src/run-state.cjs');
const { CheckpointStore } = require('../src/checkpoints.cjs');
const { classifyRelayError, relayDiagnostics } = require('../src/diagnostics.cjs');

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { get: (key, fallback) => data.has(key) ? data.get(key) : fallback, update: async (key, value) => data.set(key, value), data };
}

test('run store persists lifecycle and marks interrupted work retryable', async () => {
  const store = storage({ 'schoolCode.runs': [{ id: 'old', status: 'running', request: { message: 'again' } }] });
  const runs = new RunStore(store);
  assert.equal(runs.get('old').status, 'interrupted');
  const current = runs.create({ sessionId: 'session', request: { message: 'build', model: 'gpt-6-sol' } });
  runs.update(current.id, { status: 'running' });
  runs.event(current.id, { type: 'status', status: '테스트 중' });
  runs.finish(current.id, 'completed', { text: '완료' });
  await runs.save();
  assert.equal(store.data.get('schoolCode.runs').find(item => item.id === current.id).status, 'completed');
  assert.equal(runs.list({ sessionId: 'session' })[0].text, '완료');
});

test('checkpoints retain metadata while keeping content out of list responses', async () => {
  const store = storage();
  const checkpoints = new CheckpointStore(store);
  const item = checkpoints.add({ path: 'Assets/Test.cs', before: 'old', after: 'new', sha256: 'a'.repeat(64) });
  await checkpoints.save();
  assert.equal(checkpoints.list()[0].path, 'Assets/Test.cs');
  assert.equal(Object.hasOwn(checkpoints.list()[0], 'before'), true);
  assert.equal(checkpoints.list()[0].before, undefined);
  assert.equal(checkpoints.get(item.id).after, 'new');
});

test('diagnostics distinguishes auth, offline and healthy states', () => {
  assert.equal(classifyRelayError('중계 HTTP 401').code, 'AUTH');
  assert.equal(classifyRelayError('VS Code worker offline').code, 'OFFLINE');
  assert.equal(relayDiagnostics({ bridgeConnected: true, relayConnected: true, project: { name: 'Vertex' } }).ok, true);
});

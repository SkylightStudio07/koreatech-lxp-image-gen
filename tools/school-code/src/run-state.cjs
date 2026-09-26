const { randomUUID } = require('node:crypto');

const MAX_RUNS = 40;
const MAX_EVENTS = 120;
const MAX_TEXT = 24000;

function clip(value, max = MAX_TEXT) {
  return String(value || '').slice(-max);
}

function normalizeRun(input, now = Date.now()) {
  const value = input && typeof input === 'object' ? input : {};
  const status = ['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'].includes(value.status)
    ? value.status : 'queued';
  return {
    id: typeof value.id === 'string' && value.id ? value.id : randomUUID(),
    sessionId: typeof value.sessionId === 'string' ? value.sessionId : '',
    status,
    request: value.request && typeof value.request === 'object' ? {
      message: clip(value.request.message, 12000),
      model: clip(value.request.model, 160),
      agent: clip(value.request.agent, 160),
      mode: clip(value.request.mode, 32),
      uploads: Array.isArray(value.request.uploads) ? value.request.uploads.slice(0, 5) : [],
    } : null,
    text: clip(value.text),
    statusText: clip(value.statusText, 300),
    steps: Array.isArray(value.steps) ? value.steps.slice(-MAX_EVENTS) : [],
    events: Array.isArray(value.events) ? value.events.slice(-MAX_EVENTS) : [],
    error: clip(value.error, 1000),
    model: clip(value.model, 160),
    remoteRunId: clip(value.remoteRunId, 200),
    startedAt: Number.isFinite(value.startedAt) ? value.startedAt : now,
    updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : now,
    finishedAt: Number.isFinite(value.finishedAt) ? value.finishedAt : null,
  };
}

class RunStore {
  constructor(storage) {
    this.storage = storage;
    const saved = storage?.get?.('schoolCode.runs', []);
    this.runs = (Array.isArray(saved) ? saved : []).map(run => normalizeRun(run));
    // A VS Code process can end while the browser request is still open. The
    // old process cannot safely resume that stream, so expose the run as an
    // interrupted, retryable record instead of silently losing it.
    let changed = false;
    for (const run of this.runs) {
      if (run.status === 'queued' || run.status === 'running') {
        run.status = 'interrupted';
        run.statusText = '확장 재시작으로 중단됨 · 다시 실행할 수 있습니다.';
        run.updatedAt = Date.now();
        changed = true;
      }
    }
    if (changed) void this.save();
  }

  create({ sessionId = '', request = null } = {}) {
    const now = Date.now();
    const run = normalizeRun({ sessionId, request, status: 'queued', startedAt: now, updatedAt: now }, now);
    this.runs.unshift(run);
    this.trim();
    return run;
  }

  get(id) { return this.runs.find(run => run.id === String(id || '')) || null; }

  update(id, patch = {}) {
    const run = this.get(id);
    if (!run) return null;
    Object.assign(run, patch, { updatedAt: Date.now() });
    if (patch.text !== undefined) run.text = clip(patch.text);
    if (patch.statusText !== undefined) run.statusText = clip(patch.statusText, 300);
    if (patch.error !== undefined) run.error = clip(patch.error, 1000);
    if (patch.finishedAt === undefined && ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) run.finishedAt = Date.now();
    return run;
  }

  event(id, event = {}) {
    const run = this.get(id);
    if (!run) return null;
    const item = { ...event, at: Date.now() };
    run.events.push(item);
    if (run.events.length > MAX_EVENTS) run.events = run.events.slice(-MAX_EVENTS);
    if (item.text !== undefined) run.text = clip(item.text);
    if (item.status !== undefined) run.statusText = clip(item.status, 300);
    if (item.steps) run.steps = Array.isArray(item.steps) ? item.steps.slice(-MAX_EVENTS) : run.steps;
    run.updatedAt = Date.now();
    return run;
  }

  finish(id, status, patch = {}) {
    const allowed = ['completed', 'failed', 'cancelled', 'interrupted'];
    const run = this.update(id, { ...patch, status: allowed.includes(status) ? status : 'failed', finishedAt: Date.now() });
    return run;
  }

  list({ sessionId, limit = 20 } = {}) {
    const max = Math.max(1, Math.min(MAX_RUNS, Number(limit) || 20));
    return this.runs.filter(run => !sessionId || run.sessionId === sessionId).slice(0, max).map(run => ({
      id: run.id, sessionId: run.sessionId, status: run.status, statusText: run.statusText,
      text: clip(run.text, 500), error: run.error, model: run.model, remoteRunId: run.remoteRunId,
      startedAt: run.startedAt, updatedAt: run.updatedAt, finishedAt: run.finishedAt,
      retryable: Boolean(run.request && ['failed', 'cancelled', 'interrupted'].includes(run.status)),
    }));
  }

  trim() {
    this.runs = this.runs.slice(0, MAX_RUNS);
  }

  async save() {
    if (this.storage?.update) await this.storage.update('schoolCode.runs', this.runs.map(run => normalizeRun(run)));
  }
}

module.exports = { MAX_RUNS, MAX_EVENTS, MAX_TEXT, normalizeRun, RunStore };

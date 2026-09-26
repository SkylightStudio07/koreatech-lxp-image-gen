const { randomUUID } = require('node:crypto');

const MAX_CHECKPOINTS = 30;
const MAX_CONTENT = 200000;

function normalize(item) {
  const value = item && typeof item === 'object' ? item : {};
  return {
    id: typeof value.id === 'string' && value.id ? value.id : randomUUID(),
    path: String(value.path || '').slice(0, 1024),
    existed: value.existed === true,
    before: typeof value.before === 'string' ? value.before.slice(0, MAX_CONTENT) : null,
    after: typeof value.after === 'string' ? value.after.slice(0, MAX_CONTENT) : '',
    sha256: typeof value.sha256 === 'string' ? value.sha256 : null,
    createdAt: Number.isFinite(value.createdAt) ? value.createdAt : Date.now(),
    undone: value.undone === true,
  };
}

class CheckpointStore {
  constructor(storage) {
    this.storage = storage;
    const saved = storage?.get?.('schoolCode.checkpoints', []);
    this.items = (Array.isArray(saved) ? saved : []).map(normalize).slice(0, MAX_CHECKPOINTS);
  }
  add(value) { const item = normalize(value); this.items.unshift(item); this.items = this.items.slice(0, MAX_CHECKPOINTS); return item; }
  get(id) { return this.items.find(item => item.id === String(id || '')) || null; }
  latest() { return this.items.find(item => !item.undone) || this.items[0] || null; }
  markUndone(id) { const item = this.get(id); if (item) item.undone = true; return item; }
  list(limit = 20) { return this.items.slice(0, Math.max(1, Math.min(MAX_CHECKPOINTS, Number(limit) || 20))).map(item => ({ ...item, before: undefined, after: undefined })); }
  async save() { if (this.storage?.update) await this.storage.update('schoolCode.checkpoints', this.items); }
}

module.exports = { MAX_CHECKPOINTS, CheckpointStore, normalize };

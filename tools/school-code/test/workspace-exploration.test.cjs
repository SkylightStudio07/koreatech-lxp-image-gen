const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const workspace = require('../src/workspace.cjs');

test('project tree and symbol search stay inside the workspace', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'school-explore-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'Assets')); await fs.writeFile(path.join(root, 'Assets', 'Player.cs'), 'public class Player {\n  void Move() {}\n}\n');
  const tree = await workspace.projectTree(root, '', { depth: 2 });
  assert(tree.nodes.some(item => item.path === 'Assets/Player.cs'));
  const symbols = await workspace.findSymbols(root, { query: 'Player' });
  assert.deepEqual(symbols.symbols[0].name, 'Player');
  await assert.rejects(workspace.projectTree(root, '../outside'), /경로/);
});

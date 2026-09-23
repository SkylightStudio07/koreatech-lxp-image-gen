import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { home } from '../src/common.js';

test('installer registers skill, preserves other servers, and refuses conflicting skill edits', async t => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'school-install-'));
  t.after(() => fs.rm(project, { recursive: true, force: true }));
  const configPath = path.join(project, '.mcp.json');
  const other = { type: 'stdio', command: 'example-server' };
  await fs.writeFile(configPath, JSON.stringify({ mcpServers: { other } }));
  const run = () => spawnSync(process.execPath, [path.join(home, 'scripts/install-project.js'), project], { encoding: 'utf8', windowsHide: true });
  assert.equal(run().status, 0);
  const configText = await fs.readFile(configPath, 'utf8');
  const config = JSON.parse(configText);
  assert.deepEqual(config.mcpServers.other, other);
  assert.equal(config.mcpServers['school-image'].env.ALLOWED_OUTPUT_ROOT, path.join(project, 'GeneratedAssets', 'SchoolAI'));
  const skillPath = path.join(project, '.claude/skills/school-image/SKILL.md');
  assert.equal(await fs.readFile(skillPath, 'utf8'), await fs.readFile(path.join(home, 'skills/school-image/SKILL.md'), 'utf8'));
  assert.equal(run().status, 0);
  await fs.appendFile(skillPath, '\nUser project customization.\n');
  assert.notEqual(run().status, 0);
  assert.equal(await fs.readFile(configPath, 'utf8'), configText);
  assert.match(await fs.readFile(skillPath, 'utf8'), /User project customization/);
});

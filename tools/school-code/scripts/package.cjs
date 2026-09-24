const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  'vsce', 'package', '--no-dependencies', '--allow-missing-repository',
  '-o', `school-code-${version}.vsix`,
]);

console.log(`Created school-code-${version}.vsix`);

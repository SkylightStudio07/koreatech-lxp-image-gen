import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserWorker } from '../src/browser-worker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'extension', 'worker-main.js');
await fs.writeFile(output, `void (${browserWorker.toString()})(window.__schoolImageConnectorPort || 18765);\n`, 'utf8');
console.log(`Built ${path.relative(root, output)}`);

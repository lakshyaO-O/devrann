import { cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'monaco-editor', 'min', 'vs');
const destination = join(root, 'public', 'monaco', 'vs');

if (!existsSync(source)) {
  console.warn('[monaco] node_modules/monaco-editor/min/vs not found; skipping local asset copy.');
  process.exit(0);
}

await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
console.log('[monaco] copied min/vs to public/monaco/vs');

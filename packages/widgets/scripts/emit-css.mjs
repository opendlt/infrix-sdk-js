// Emit styles.css from the compiled WIDGET_STYLES constant, so the linked
// stylesheet and the injected styles are byte-identical (single source of truth
// is src/styles.ts). Runs after `tsc` in the build.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const distStyles = path.join(pkgRoot, 'dist', 'styles.js');

if (!fs.existsSync(distStyles)) {
  console.error('emit-css: dist/styles.js not found — run tsc first');
  process.exit(1);
}

const { WIDGET_STYLES } = await import(pathToFileURL(distStyles).href);
const header = '/* @infrix/widgets styles — generated from src/styles.ts. Do not edit. */\n';
fs.writeFileSync(path.join(pkgRoot, 'styles.css'), header + WIDGET_STYLES);
console.log('@infrix/widgets: wrote styles.css');

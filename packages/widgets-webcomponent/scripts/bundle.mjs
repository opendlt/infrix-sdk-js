// Build the CDN bundle: a single self-contained ESM file
// (dist/infrix-widgets.js) that registers the custom elements. esbuild inlines
// the verifier core + vendored modules from @infrix/widgets; no React, no other
// runtime dependency. After building, print the SHA-384 Subresource Integrity
// hash for the CDN <script> tag.

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const out = path.join(pkgRoot, 'dist', 'infrix-widgets.js');

await build({
  entryPoints: [path.join(pkgRoot, 'src', 'index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  outfile: out,
  legalComments: 'none',
});

const bytes = fs.readFileSync(out);
const sri = 'sha384-' + crypto.createHash('sha384').update(bytes).digest('base64');
fs.writeFileSync(out + '.sri', sri + '\n');

console.log(`@infrix/widgets-webcomponent: bundled CDN file ${(bytes.length / 1024).toFixed(1)} KiB`);
console.log(`  Subresource Integrity: integrity="${sri}"`);

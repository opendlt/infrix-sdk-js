// Drift fence for @infrix/verify (Tier-1 SDK extraction). The committed verifier
// closure under src/ is vendored from pkg/nexus/web (the single source of truth,
// the same code Nexus runs). This test asserts the committed copies are
// byte-identical to the (import-rewritten) Nexus source so the published package
// can never silently drift from what Nexus verifies.
//
// In the extracted SDK repo the monorepo source is absent, so this test SKIPS
// (parity with the monorepo source is a monorepo concern). Re-sync after the
// Nexus verifier changes with `npm run vendor`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..', 'src');
const webRoot = path.join(here, '..', '..', '..', '..', 'pkg', 'nexus', 'web');

// Must match sdk/packages/verify/scripts/vendor.mjs.
const FILES = [
  'lib/canonicalJson.js',
  'lib/portableVerifier.js',
  'lib/proofReceipt.js',
  'lib/proofStory.js',
  'lib/uxLabels.js',
  'components/proofReceiptView.js',
];
const HEADER = '// VENDORED from pkg/nexus/web by @infrix/verify scripts/vendor.mjs. Do not edit.\n';
const rewrite = (src) => src.replace(/from\s+'\/(?:lib|components)\/([^']+)'/g, "from './$1'");

const monorepo = existsSync(webRoot);

test('vendored verifier closure matches the Nexus source of truth', { skip: monorepo ? false : 'monorepo source absent (extracted-repo mode)' }, () => {
  for (const rel of FILES) {
    const base = path.basename(rel);
    const committed = readFileSync(path.join(srcDir, base), 'utf8');
    const expected = HEADER + rewrite(readFileSync(path.join(webRoot, rel), 'utf8'));
    assert.equal(committed, expected, `src/${base} drifted from pkg/nexus/web/${rel} — run \`npm run vendor\``);
  }
});

// Drift fence for @infrix/verify (Tier-1 SDK extraction). The committed verifier
// closure under src/ is vendored from pkg/nexus/web (the single source of truth,
// the same code Nexus runs). This test asserts the committed copies are
// byte-identical to the (import-rewritten) Nexus source so the published package
// can never silently drift from what Nexus verifies.
//
// The source is the infrix-nexus-web checkout beside this repo (its web/
// directory) or, in the monorepo layout, pkg/nexus/web. Only when neither is
// checked out does this test skip, and a skip here is not a pass: the parity is
// unchecked. Re-sync after the Nexus verifier changes with `npm run vendor`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..', 'src');
// Must match scripts/vendor.mjs's candidates.
const repoRoot = path.join(here, '..', '..', '..', '..');
const webCandidates = [
  path.join(repoRoot, 'pkg', 'nexus', 'web'),
  path.join(repoRoot, 'infrix-nexus-web', 'web'),
];
const webRoot = webCandidates.find((d) => existsSync(d));

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

test('vendored verifier closure matches the Nexus source of truth', { skip: webRoot ? false : `Nexus source absent (looked in ${webCandidates.join(' and ')}): a skip here is not a pass, the parity is unchecked` }, () => {
  for (const rel of FILES) {
    const base = path.basename(rel);
    const committed = readFileSync(path.join(srcDir, base), 'utf8');
    const expected = HEADER + rewrite(readFileSync(path.join(webRoot, rel), 'utf8'));
    assert.equal(committed, expected, `src/${base} drifted from ${webRoot}/${rel} — run \`npm run vendor\``);
  }
  // Fixtures are copied verbatim (JSON, no header/rewrite).
  const FIXTURES = ['uxcopy.fixture.json', 'portable-fixture.valid.json', 'sample.infrixstory.bundle.json'];
  for (const name of FIXTURES) {
    const committed = readFileSync(path.join(srcDir, name), 'utf8');
    const source = readFileSync(path.join(webRoot, 'testdata', name), 'utf8');
    assert.equal(committed, source, `src/${name} drifted from ${webRoot}/testdata/${name} — run \`npm run vendor\``);
  }
});

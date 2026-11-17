// @infrix/verify is the canonical, npm-publishable home for the browser-side
// Infrix verifier closure (Tier-1 SDK extraction). The single source of truth
// stays in pkg/nexus/web (the same code Nexus runs); this script copies the
// verification closure into ./src, rewriting the SPA's absolute `/lib` and
// `/components` imports to package-relative paths so the package is
// self-contained and publishable. Other SDK packages (proof-receipt, widgets)
// vendor FROM here instead of reaching into pkg/nexus/web, so there is exactly
// one verifier the SDKs share. Re-sync with `npm run vendor`; the drift fence
// (src/verify.parity.test.mjs) keeps the committed copy honest. When the
// monorepo source is absent (extracted SDK repo) this is a no-op.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const repoRoot = path.resolve(pkgRoot, '..', '..', '..'); // sdk/packages/verify -> repo root
// The Nexus SPA source lives in the infrix-nexus-web repo since the split
// (its web/ directory); the monorepo layout (pkg/nexus/web) is still honoured.
// The sibling checkout is the one beside this repo: ../infrix-nexus-web/web.
// repoRoot is the monorepo root (sdk/packages/verify -> root); in the
// extracted layout it is the directory that holds the sibling checkouts.
const webCandidates = [
  path.join(repoRoot, 'pkg', 'nexus', 'web'),
  path.join(repoRoot, 'infrix-nexus-web', 'web'),
];
const webRoot = webCandidates.find((d) => fs.existsSync(d)) ?? webCandidates[1];

// The shared verification closure consumed by proof-receipt (3 lib + the view)
// and widgets (5 lib). The union is self-contained (each existing consumer
// closure is self-contained).
export const FILES = [
  'lib/canonicalJson.js',
  'lib/portableVerifier.js',
  'lib/proofReceipt.js',
  'lib/proofStory.js',
  'lib/uxLabels.js',
  'components/proofReceiptView.js',
];

const HEADER = '// VENDORED from pkg/nexus/web by @infrix/verify scripts/vendor.mjs. Do not edit.\n';
const rewrite = (src) => src.replace(/from\s+'\/(?:lib|components)\/([^']+)'/g, "from './$1'");

const outDir = path.join(pkgRoot, 'src');

if (!fs.existsSync(webRoot)) {
  console.log(`@infrix/verify: Nexus source absent (looked in ${webCandidates.join(' and ')}) — using committed src/ copies; check out infrix-nexus-web beside this repo to re-vendor.`);
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
for (const rel of FILES) {
  const abs = path.join(webRoot, rel);
  if (!fs.existsSync(abs)) {
    console.error(`vendor: missing source ${rel} (looked in ${webRoot})`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(outDir, path.basename(rel)), HEADER + rewrite(fs.readFileSync(abs, 'utf8')));
}

// Canonical fixtures the SDKs + their tests consume: the UX label fixture
// (uxLabels.js data), a known-good portable proof, and a sample story bundle.
// Copied VERBATIM (JSON: no JS header/import-rewrite).
export const FIXTURES = [
  'uxcopy.fixture.json',
  'portable-fixture.valid.json',
  'sample.infrixstory.bundle.json',
];
for (const name of FIXTURES) {
  const abs = path.join(webRoot, 'testdata', name);
  if (!fs.existsSync(abs)) {
    console.error(`vendor: missing fixture testdata/${name} (looked in ${webRoot})`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(outDir, name), fs.readFileSync(abs, 'utf8'));
}

console.log(`@infrix/verify: vendored ${FILES.length} module(s) + ${FIXTURES.length} fixture(s) into src/`);

// Vendor the Go-generated parity fixtures consumed by @infrix/client's tests
// (companion/compare/quests/rooms/studio/tutor) from pkg/nexus/web/testdata into
// ./testdata, so the package's test suite is self-contained and the package can
// be built/tested outside the monorepo (Tier-1 SDK extraction). The single
// source of truth stays in pkg/nexus/web/testdata (Go-generated); this copy is
// re-synced by running `node scripts/vendor-fixtures.mjs` and kept honest by
// fixtures.parity.test.ts. When the monorepo source is absent (i.e. running in
// the extracted SDK repo) this is a no-op — the committed copies are used.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const repoRoot = path.resolve(pkgRoot, '..', '..'); // sdk/typescript -> repo root
const srcDir = path.join(repoRoot, 'pkg', 'nexus', 'web', 'testdata');
const outDir = path.join(pkgRoot, 'testdata');

const FIXTURES = [
  'companion.fixture.json',
  'compare.fixture.json',
  'quests.fixture.json',
  'room.fixture.json',
  'studio.fixture.json',
  'tutor.fixture.json',
];

if (!fs.existsSync(srcDir)) {
  console.log('@infrix/client: monorepo fixture source absent — using committed testdata/ copies (extracted-repo mode).');
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
let n = 0;
for (const f of FIXTURES) {
  const abs = path.join(srcDir, f);
  if (!fs.existsSync(abs)) {
    console.error(`vendor-fixtures: missing source ${f} (looked in ${srcDir})`);
    process.exit(1);
  }
  fs.copyFileSync(abs, path.join(outDir, f));
  n++;
}
console.log(`@infrix/client: vendored ${n} parity fixture(s) into testdata/`);

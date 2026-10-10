// Vendor the Go-generated parity fixtures consumed by @infrix/client's tests
// (companion/compare/quests/rooms/studio/tutor) into ./testdata, so the package's
// test suite is self-contained and the package can be built and tested outside
// the monorepo (Tier-1 SDK extraction).
//
// The single source of truth is the infrix-nexus-web module's web/testdata
// (Go-generated). It is located by scripts/nexus-fixture-source.cjs — the SAME
// resolver src/fixtures.parity.test.ts uses, so the vendoring step and the drift
// fence cannot disagree about where the source is. They previously each carried
// their own copy of a path that stopped existing when the SDK was extracted, and
// the fence spent that whole time skipping instead of failing.
//
// When no source resolves the package is running in extracted-repo mode and this
// is a no-op — the committed copies are used.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import source from './nexus-fixture-source.cjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = source.packageRoot(here);
const outDir = path.join(pkgRoot, 'testdata');

const resolved = source.resolveFixtureSource(here);
if (!resolved) {
  const searched = source.searchPaths(here).map((p) => `${p.dir} (${p.how})`).join('\n  ');
  console.log(
    '@infrix/client: infrix-nexus-web fixture source absent — using committed testdata/ copies ' +
      `(extracted-repo mode). Searched:\n  ${searched}`,
  );
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
let n = 0;
for (const f of source.FIXTURES) {
  fs.copyFileSync(path.join(resolved.dir, f), path.join(outDir, f));
  n++;
}
console.log(`@infrix/client: vendored ${n} parity fixture(s) from ${resolved.dir} (${resolved.how}) into testdata/`);

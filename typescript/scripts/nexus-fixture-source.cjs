// Locate the single source of truth for the vendored parity fixtures.
//
// The fixtures companion/compare/quests/room/studio/tutor are generated into the
// infrix-nexus-web module's web/testdata and vendored into ./testdata so this
// package builds and tests outside the monorepo. Exactly one resolver exists so
// the vendoring script (scripts/vendor-fixtures.mjs) and the drift fence
// (src/fixtures.parity.test.ts) can never disagree about where the source is.
//
// WHY THIS FILE EXISTS AT ALL: both consumers previously hard-coded
// `<pkgRoot>/../../pkg/nexus/web/testdata`, whose comment read "sdk/typescript ->
// repo root". That was correct while the SDK lived inside infrix-core at
// sdk/typescript. After the SDK was extracted to its own repository the same
// relative path resolves to <workspace>/pkg/nexus/web/testdata, which exists
// nowhere, and the SPA assets moved out of infrix-core into infrix-nexus-web as
// well. The fence read that permanent absence as "extracted-repo mode" and
// SKIPPED on every machine, including the ones with the source checked out
// beside it. A drift fence that can never fail is worse than no fence: it reads
// as coverage. Pinning the search paths here, and asserting their shape in a
// test that never skips, is what stops that recurring.
//
// Resolution order (first hit wins):
//   1. INFRIX_NEXUS_WEB_DIR   explicit module root, mirroring the INFRIX_CORE_DIR
//                             convention ci.yml already uses for the prover.
//   2. sibling checkout       <pkgRoot>/../../infrix-nexus-web  (the standard
//                             side-by-side developer layout).
//
// If neither resolves, the source is genuinely absent (extracted-repo mode) and
// the caller may fall back to the committed copies. If a source IS resolved but
// is incomplete, that is a defect and callers must fail rather than skip.

const fs = require('node:fs');
const path = require('node:path');

/** The vendored fixture set, in one place. */
const FIXTURES = [
  'companion.fixture.json',
  'compare.fixture.json',
  'quests.fixture.json',
  'room.fixture.json',
  'studio.fixture.json',
  'tutor.fixture.json',
];

/** Package root (the directory holding package.json), from any caller depth. */
function packageRoot(fromDir) {
  let dir = path.resolve(fromDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error(`nexus-fixture-source: no package.json above ${fromDir}`);
    dir = up;
  }
}

/**
 * Every location that is searched, in order, as absolute paths. Exported so a
 * test can pin their SHAPE without needing the source to be present — the check
 * that would have caught the extraction breakage on a machine with no checkout.
 */
function searchPaths(fromDir) {
  const pkgRoot = packageRoot(fromDir);
  const env = process.env.INFRIX_NEXUS_WEB_DIR;
  const candidates = [];
  if (env && env.trim() !== '') {
    candidates.push({ how: 'INFRIX_NEXUS_WEB_DIR', dir: path.resolve(env.trim(), 'web', 'testdata') });
  }
  candidates.push({
    how: 'sibling checkout',
    dir: path.resolve(pkgRoot, '..', '..', 'infrix-nexus-web', 'web', 'testdata'),
  });
  return candidates;
}

/**
 * Resolve the fixture source directory, or null when it is genuinely absent.
 * Throws when a resolved directory is missing fixtures — an incomplete source is
 * a defect, never a reason to skip.
 */
function resolveFixtureSource(fromDir) {
  for (const c of searchPaths(fromDir)) {
    if (!fs.existsSync(c.dir)) continue;
    const missing = FIXTURES.filter((f) => !fs.existsSync(path.join(c.dir, f)));
    if (missing.length > 0) {
      throw new Error(
        `nexus-fixture-source: resolved ${c.dir} via ${c.how} but it is missing ${missing.join(', ')} — ` +
          `the fixture source moved or was renamed; fix the resolver, do not skip the fence`,
      );
    }
    return c;
  }
  return null;
}

module.exports = { FIXTURES, packageRoot, searchPaths, resolveFixtureSource };

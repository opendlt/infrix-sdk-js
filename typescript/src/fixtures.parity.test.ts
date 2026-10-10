/**
 * Drift fence for the vendored parity fixtures (Tier-1 SDK extraction).
 *
 * @infrix/client's companion/compare/quests/rooms/studio/tutor tests read
 * committed copies under testdata/ so the package builds and tests outside the
 * monorepo. The single source of truth is the infrix-nexus-web module's
 * web/testdata (Go-generated). This file asserts the committed copies are
 * byte-identical to that source so they can never silently drift, and — the part
 * that matters — asserts the resolver still points somewhere real even on a
 * machine where the source is absent.
 *
 * HISTORY, because this fence has already failed once in the way it exists to
 * prevent. Its first version hard-coded `<pkgRoot>/../../pkg/nexus/web/testdata`
 * with the comment "sdk/typescript -> repo root". That was true while the SDK
 * lived inside infrix-core; after extraction the path resolves to a directory
 * that exists nowhere, and the SPA assets themselves moved to infrix-nexus-web.
 * The fence read that permanent absence as "extracted-repo mode" and SKIPPED
 * everywhere, including beside a full checkout of the source. It reported as
 * coverage while being incapable of failing.
 *
 * So there are two tests here and only one of them may skip:
 *
 *   1. `the fixture source resolver points at a real, current location` NEVER
 *      skips. It pins the shape of every search path, so a repository move,
 *      rename or re-extraction breaks this test instead of silently disabling
 *      the fence. This is the test that would have caught the original defect on
 *      a machine with no source checked out at all.
 *   2. `vendored parity fixtures match the source of truth` compares bytes, and
 *      skips ONLY when no source resolves. Re-sync after the source changes with
 *      `node scripts/vendor-fixtures.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, isAbsolute, sep } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const source = require('../scripts/nexus-fixture-source.cjs') as {
  FIXTURES: string[];
  packageRoot(fromDir: string): string;
  searchPaths(fromDir: string): { how: string; dir: string }[];
  resolveFixtureSource(fromDir: string): { how: string; dir: string } | null;
};

const vendored = join(__dirname, '..', 'testdata');

test('the fixture source resolver points at a real, current location', () => {
  const paths = source.searchPaths(__dirname);
  assert.ok(paths.length >= 1, 'the resolver searches nowhere');

  for (const p of paths) {
    assert.ok(isAbsolute(p.dir), `search path is not absolute: ${p.dir}`);
    assert.ok(
      p.dir.endsWith(join('web', 'testdata')),
      `search path does not end in web/testdata: ${p.dir}`,
    );
  }

  // The sibling candidate is always present and must name the CURRENT home of
  // the fixtures. Pinning the repository name here is the whole point: when the
  // assets move again, this line fails loudly instead of the fence going quiet.
  const sibling = paths.find((p) => p.how === 'sibling checkout');
  assert.ok(sibling, 'the sibling-checkout search path is missing');
  assert.ok(
    sibling.dir.endsWith(join('infrix-nexus-web', 'web', 'testdata')),
    `sibling search path no longer names infrix-nexus-web: ${sibling.dir}`,
  );
  assert.equal(
    sibling.dir,
    join(source.packageRoot(__dirname), '..', '..', 'infrix-nexus-web', 'web', 'testdata'),
    'the sibling search path is not the standard side-by-side layout',
  );

  // The pre-extraction location is dead. If it ever comes back as a search path
  // the fence is silently unfalsifiable again.
  for (const p of paths) {
    assert.ok(
      !p.dir.includes(`${sep}pkg${sep}nexus${sep}`),
      `the retired monorepo fixture path is back in the search list: ${p.dir}`,
    );
  }

  assert.deepEqual(
    source.FIXTURES,
    [
      'companion.fixture.json',
      'compare.fixture.json',
      'quests.fixture.json',
      'room.fixture.json',
      'studio.fixture.json',
      'tutor.fixture.json',
    ],
    'the vendored fixture set changed without this fence being updated',
  );
});

const resolved = source.resolveFixtureSource(__dirname);

test(
  'vendored parity fixtures match the source of truth',
  {
    skip: resolved
      ? false
      : `infrix-nexus-web fixture source absent (extracted-repo mode) — searched ${source
          .searchPaths(__dirname)
          .map((p) => p.dir)
          .join(', ')}; set INFRIX_NEXUS_WEB_DIR to run this fence`,
  },
  () => {
    assert.ok(resolved);
    for (const f of source.FIXTURES) {
      const a = readFileSync(join(vendored, f));
      const b = readFileSync(join(resolved.dir, f));
      assert.ok(
        a.equals(b),
        `testdata/${f} drifted from ${join(resolved.dir, f)} (resolved via ${resolved.how}) — ` +
          `run \`node scripts/vendor-fixtures.mjs\``,
      );
    }
  },
);

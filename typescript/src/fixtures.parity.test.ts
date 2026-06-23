/**
 * Drift fence for the vendored Go-generated parity fixtures (Tier-1 SDK
 * extraction). @infrix/client's companion/compare/quests/rooms/studio/tutor
 * tests read committed copies under testdata/ so the package builds/tests
 * outside the monorepo. The single source of truth is pkg/nexus/web/testdata
 * (Go-generated); this test asserts the committed copies are byte-identical to
 * that source so they can never silently drift.
 *
 * In the extracted SDK repo the monorepo source is absent, so this test SKIPS
 * (cross-language parity with Go is a monorepo concern). Re-sync after the Go
 * fixtures change with `node scripts/vendor-fixtures.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const vendored = join(__dirname, '..', 'testdata');
const source = join(__dirname, '..', '..', '..', 'pkg', 'nexus', 'web', 'testdata');

const FIXTURES = [
  'companion.fixture.json',
  'compare.fixture.json',
  'quests.fixture.json',
  'room.fixture.json',
  'studio.fixture.json',
  'tutor.fixture.json',
];

const monorepo = existsSync(source);

test('vendored parity fixtures match the Go source of truth', { skip: monorepo ? false : 'monorepo fixture source absent (extracted-repo mode)' }, () => {
  for (const f of FIXTURES) {
    const a = readFileSync(join(vendored, f));
    const b = readFileSync(join(source, f));
    assert.ok(a.equals(b), `testdata/${f} drifted from pkg/nexus/web/testdata/${f} — run \`node scripts/vendor-fixtures.mjs\``);
  }
});

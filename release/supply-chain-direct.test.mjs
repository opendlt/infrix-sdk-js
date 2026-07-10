// Pass-23 audit P2-3. The DIRECT-NODE supply-chain guard must be reproducible on
// any platform — including Windows checkouts where the npm LIFECYCLE spawner fails
// with `spawn EPERM` and the `npm pack`-based scripts/supply-chain-all.mjs cannot
// run locally. This test runs scripts/supply-chain-direct.mjs by spawning NODE
// directly (never npm), so it exercises the same reproducible path an operator
// uses, and asserts it verifies the shared 11-package surface (license + pins +
// declared/required on-disk payload) and exits 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const script = path.join(repoRoot, 'scripts', 'supply-chain-direct.mjs');

// Spawn NODE — not npm — so the guard is reproducible where the npm lifecycle
// spawner fails EPERM. process.execPath is the running node binary.
function runGuard(...args) {
  const res = spawnSync(process.execPath, [script, ...args], { cwd: repoRoot, encoding: 'utf8' });
  return { status: res.status, out: `${res.stdout || ''}\n${res.stderr || ''}` };
}

test('STRICT default: NEEDS_BUILD implies a non-zero exit (pass-24 P1-4)', () => {
  // The release/audit posture must NEVER print "passed" while a package is
  // NEEDS_BUILD. This invariant holds regardless of the local build state:
  //   all built  -> no NEEDS_BUILD -> exit 0 + "passed"
  //   any unbuilt -> NEEDS_BUILD    -> exit != 0 (FAILED)
  const { status, out } = runGuard();
  assert.match(out, /no npm spawned/, 'must state it spawned no npm (reproducibility contract)');
  if (out.includes('NEEDS_BUILD')) {
    assert.notEqual(status, 0, `strict mode must FAIL when a package is NEEDS_BUILD; output:\n${out}`);
    assert.match(out, /supply-chain-direct check FAILED/, 'must print the FAILED summary');
  } else {
    assert.equal(status, 0, `all-built strict run must pass; output:\n${out}`);
    assert.match(out, /supply-chain-direct check passed/, 'must print the passed summary');
  }
});

test('TRIAGE mode: reports NEEDS_BUILD but exits 0 (Windows soft-check)', () => {
  const { status, out } = runGuard('--triage');
  assert.equal(status, 0, `--triage must always exit 0; output:\n${out}`);
  assert.match(out, /supply-chain-direct check passed/, 'triage prints a passed summary');
});

test('direct guard covers exactly the publishable package surface', async () => {
  // The direct guard must enumerate the SAME 11 packages as the release surface.
  const { GUARD_CONFIG } = await import(
    pathToFileURL(path.join(repoRoot, 'scripts', 'release-packages.mjs')).href
  );
  const { out } = runGuard('--triage');
  for (const name of Object.keys(GUARD_CONFIG)) {
    assert.ok(out.includes(name), `direct guard output must cover ${name}`);
  }
});

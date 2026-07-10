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

test('direct-node supply-chain guard runs (no npm spawned) and passes', () => {
  // Spawn NODE — not npm — so the guard is reproducible where the npm lifecycle
  // spawner fails EPERM. process.execPath is the running node binary.
  const res = spawnSync(process.execPath, [script], { cwd: repoRoot, encoding: 'utf8' });
  const out = `${res.stdout || ''}\n${res.stderr || ''}`;
  assert.equal(res.status, 0, `supply-chain-direct must exit 0; output:\n${out}`);
  assert.match(out, /supply-chain-direct check passed/, 'must print the passed summary');
  assert.match(out, /no npm spawned/, 'must state it spawned no npm (the reproducibility contract)');
});

test('direct guard covers exactly the publishable package surface', async () => {
  // The direct guard must enumerate the SAME 11 packages as the release surface.
  const { GUARD_CONFIG } = await import(
    pathToFileURL(path.join(repoRoot, 'scripts', 'release-packages.mjs')).href
  );
  const res = spawnSync(process.execPath, [script], { cwd: repoRoot, encoding: 'utf8' });
  const out = `${res.stdout || ''}\n${res.stderr || ''}`;
  for (const name of Object.keys(GUARD_CONFIG)) {
    assert.ok(out.includes(name), `direct guard output must cover ${name}`);
  }
});

// Pass-29 audit P2-1. scripts/build-all-direct.mjs must FAIL by default when a
// publishable package cannot be freshly rebuilt (e.g. @infrix/prover without
// INFRIX_CORE_DIR), so a green run always means every publishable payload was freshly
// produced — the local no-npm evidence is never silently incomplete. A `--triage`
// mode soft-skips such packages and exits 0 for local diagnostics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const script = path.join(repoRoot, 'scripts', 'build-all-direct.mjs');

// Run with INFRIX_CORE_DIR explicitly UNSET so @infrix/prover cannot fresh-build.
function run(args) {
  const env = { ...process.env };
  delete env.INFRIX_CORE_DIR;
  const res = spawnSync(process.execPath, [script, ...args], { cwd: repoRoot, encoding: 'utf8', env });
  return { status: res.status, out: `${res.stdout || ''}\n${res.stderr || ''}` };
}

test('STRICT default: fails when @infrix/prover cannot fresh-build (no INFRIX_CORE_DIR)', () => {
  const { status, out } = run([]);
  assert.notEqual(status, 0, `strict build-all-direct must FAIL when a publishable package cannot fresh-build; output:\n${out}`);
  assert.match(out, /@infrix\/prover/, 'must name the package that could not be built');
  assert.match(out, /INFRIX_CORE_DIR/, 'must explain the missing INFRIX_CORE_DIR requirement');
  assert.match(out, /no npm spawned/, 'must state it spawned no npm');
});

test('--triage: soft-skips the unbuildable package and exits 0', () => {
  const { status, out } = run(['--triage']);
  assert.equal(status, 0, `--triage must exit 0; output:\n${out}`);
  assert.match(out, /@infrix\/prover: SKIP/, 'triage must SKIP the unbuildable package');
  assert.match(out, /TRIAGE/, 'triage must mark the run as a soft check');
});

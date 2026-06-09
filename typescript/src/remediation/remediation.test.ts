/**
 * Autopilot remediation SDK tests (nextux-05).
 *
 * Run via the package test script (tsc → node --test). They consume the
 * Go-generated sample fixture (a real diagnosed plan + dry-run receipt) and
 * assert the SDK reads it honestly: auto-safe vs manual fixes are separated,
 * the plan is hash-bound, the receipt carries before/after state hashes, and no
 * applied fix demotes the profile or weakens a security requirement.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createRemediationClient,
  isApplicable,
  autoSafeFix,
  findDemotions,
  type SampleFixture,
} from './index';

function loadFixture(): SampleFixture {
  const p = join(__dirname, '..', '..', 'src', 'remediation', 'sample.fixture.json');
  return JSON.parse(readFileSync(p, 'utf8')) as SampleFixture;
}

const fx = loadFixture();
const client = createRemediationClient(fx.plan);

test('the plan is sealed and has blocking findings', () => {
  assert.ok(fx.plan.planHash.startsWith('sha256:'), 'plan must be hash-bound');
  assert.ok(fx.plan.findings.length > 0, 'expected findings');
  assert.ok(client.blockingCount() > 0, 'expected blocking findings');
});

test('auto-safe and manual fixes are separated honestly', () => {
  const auto = client.autoSafe();
  assert.ok(auto.length > 0, 'expected auto-safe fixes');
  for (const f of auto) {
    const fix = autoSafeFix(f)!;
    assert.ok(isApplicable(fix.kind));
    assert.ok(fix.edit && Array.isArray(fix.edit.path), `${f.id} auto-safe fix needs a config edit`);
  }
  // The signer-custody finding is external_required, never auto-safe.
  const manual = client.manualActions();
  assert.ok(manual.some((m) => m.fix.kind === 'external_required'), 'expected an external_required manual action');
  assert.ok(manual.every((m) => !isApplicable(m.fix.kind)), 'manual actions are never auto-applicable');
});

test('the dry-run receipt carries before + after state hashes and is sealed', () => {
  const r = fx.receipt;
  assert.equal(r.dryRun, true);
  assert.ok(r.beforeStateHash && r.afterStateHash, 'before + after hashes required');
  assert.notEqual(r.beforeStateHash, r.afterStateHash, 'a changing apply changes the state hash');
  assert.ok(r.hash.startsWith('sha256:'), 'receipt must be sealed');
  assert.ok(r.appliedFixes.length > 0 && r.remainingManual.length > 0);
});

test('no applied fix demotes the profile or weakens a security requirement', () => {
  const demotions = findDemotions(fx.receipt, fx.plan.profile);
  assert.deepEqual(demotions, [], `applied fixes must never demote: ${JSON.stringify(demotions)}`);
  // Every applied fix that sets a known security bool sets it TRUE.
  for (const a of fx.receipt.appliedFixes) {
    const leaf = a.path[a.path.length - 1];
    if (['evidenceStrictMode', 'stateMirrorEnabled'].includes(leaf)) {
      assert.equal(a.newValue.toLowerCase(), 'true', `${leaf} must be strengthened to true`);
    }
  }
});

test('the placeholder endpoint fix sets the Kermit endpoint', () => {
  const ep = fx.receipt.appliedFixes.find((a) => a.path[a.path.length - 1] === 'endpoint');
  assert.ok(ep, 'expected an endpoint fix');
  assert.match(ep!.newValue, /kermit\.accumulatenetwork\.io/);
});

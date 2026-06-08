/**
 * High-level flow tests (platform-review-3 Epic 7).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { withProofs, withReadiness, withWitnesses, withHostedDevnet } from './flows';
import type { InfrixClient } from './index';

function fakeClient(pkg: Record<string, unknown>): InfrixClient {
  return {
    evidence: {
      get: async (_intentId: string) => ({ id: 'ev-1' }),
      exportPortable: async (_id: string) => pkg,
    },
  } as unknown as InfrixClient;
}

const replayablePkg = {
  version: '4',
  bundleData: JSON.stringify({
    anchor: 'anchored',
    policyDecisions: [{ decision: 'allow' }],
    approvalEvidence: [{ identity: 'acc://o.acme', planHash: 'ab' }],
    externalProofs: [{ verified: true }],
  }),
  replayCapsule: { capsuleVersion: '1' },
};

test('withProofs.export emits a proof and exposes verifyLocal', async () => {
  const c = withProofs(fakeClient(replayablePkg));
  const proof = await c.proofs.export({ intentId: 'intent-1', profile: 'public_production' });
  assert.ok(proof.replayCapsule, 'exported proof should carry a replay capsule');
  const verdict = c.proofs.verifyLocal(proof, { require: 'L3/G2', replay: true });
  assert.ok(verdict.verified, `verifyLocal should pass: ${verdict.reasons.join(', ')}`);
});

test('withProofs.export refuses public_production export without a replay capsule', async () => {
  const noCapsule = { version: '4', bundleData: JSON.stringify({ anchor: 'anchored' }) };
  const c = withProofs(fakeClient(noCapsule));
  await assert.rejects(
    () => c.proofs.export({ intentId: 'intent-1', profile: 'public_production' }),
    /replay capsule/
  );
});

test('withReadiness queries the readiness dashboard and evaluates a profile', async () => {
  const fetchImpl = async (url: string) => ({
    ok: true,
    json: async () => ({ data: { substrates: [{ category: 'l0_anchoring', name: 'L0', status: 'live' }], profile: url.includes('public_production') ? 'public_production' : undefined, profileMet: true } }),
  });
  const r = withReadiness('http://localhost:8080', fetchImpl);
  const report = await r.readiness.fetch('public_production');
  assert.equal(report.substrates.length, 1);
  assert.equal(await r.readiness.meets('public_production'), true);
});

test('withWitnesses counts distinct witnesses that reproduced', () => {
  const c = withWitnesses(fakeClient(replayablePkg));
  const pkg = {
    witnessReceipts: [
      { witnessIdentity: 'acc://w1.acme', replayResult: 'reproduced' },
      { witnessIdentity: 'acc://w1.acme', replayResult: 'reproduced' }, // duplicate
      { witnessIdentity: 'acc://w2.acme', replayResult: 'reproduced' },
      { witnessIdentity: 'acc://w3.acme', replayResult: 'diverged' }, // not counted
    ],
  };
  const ev = c.witnesses.evaluate(pkg);
  assert.equal(ev.count, 2);
  assert.deepEqual(ev.identities, ['acc://w1.acme', 'acc://w2.acme']);
  assert.equal(ev.thresholdMet(2), true);
  assert.equal(ev.thresholdMet(3), false);
});

test('withWitnesses.verifyQuorum reports operator diversity, stale + unauthorized, mode', () => {
  const c = withWitnesses(fakeClient(replayablePkg));
  const now = 1_000_000;
  const pkg = {
    witnessReceipts: [
      { witnessIdentity: 'acc://w1.acme', replayResult: 'reproduced', timestamp: now - 10 },
      { witnessIdentity: 'acc://w2.acme', replayResult: 'reproduced', timestamp: now - 10 },
      { witnessIdentity: 'acc://w3.acme', replayResult: 'reproduced', timestamp: now - 100000 }, // stale
      { witnessIdentity: 'acc://evil.acme', replayResult: 'reproduced', timestamp: now - 10 },    // unregistered
      { witnessIdentity: 'acc://w4.acme', replayResult: 'diverged', timestamp: now - 10 },        // not reproduced
    ],
  };
  const registry = {
    'acc://w1.acme': 'operator-A',
    'acc://w2.acme': 'operator-B',
    'acc://w3.acme': 'operator-A',
  };
  const q = c.witnesses.verifyQuorum(pkg, registry, {
    threshold: 2,
    operatorThreshold: 2,
    maxAgeSeconds: 3600,
    nowUnix: now,
  });
  assert.equal(q.mode, 'structural');
  assert.equal(q.count, 2); // w1, w2 (w3 stale, evil unregistered, w4 diverged)
  assert.equal(q.distinctIdentities, 2);
  assert.equal(q.distinctOperators, 2); // operator-A, operator-B
  assert.equal(q.thresholdMet, true);
  assert.equal(q.operatorDiversityMet, true);
  assert.equal(q.staleReceipts, 1);
  assert.equal(q.unauthorizedReceipts, 1);
});

test('withProofs exposes verifyOffline (unambiguous) alongside verifyLocal', async () => {
  const c = withProofs(fakeClient(replayablePkg));
  const proof = await c.proofs.export({ intentId: 'int-1' });
  const off = c.proofs.verifyOffline(proof);
  assert.equal(typeof off.verified, 'boolean');
  assert.equal(typeof c.proofs.verifyWithCLI, 'function');
  assert.equal(typeof c.proofs.verifyLiveL0, 'function');
});

test('withHostedDevnet exposes endpoint + L0 metadata', () => {
  const c = withHostedDevnet(fakeClient(replayablePkg), { l0: 'kermit' });
  assert.equal(c.hostedDevnet.l0, 'kermit');
  assert.ok(c.hostedDevnet.faucetHint.includes('kermit'));
});

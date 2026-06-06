/**
 * Local proof verification tests (platform-review-3 Epic 7).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyLocalProof, hasReplayCapsule } from './verifyLocal';

/** A G2-capable anchored bundle embedded in a v4 package. */
function pkg(opts: { anchored?: boolean; replay?: boolean } = {}): Record<string, unknown> {
  const bundle = {
    anchor: opts.anchored === false ? 'pending' : 'anchored',
    policyDecisions: [{ decision: 'allow' }],
    approvalEvidence: [{ identity: 'acc://officer.acme', planHash: 'abcd' }],
    externalProofs: [{ verified: true }],
  };
  const p: Record<string, unknown> = {
    version: '4',
    bundleData: JSON.stringify(bundle),
  };
  if (opts.replay !== false) p.replayCapsule = { capsuleVersion: '1', profile: 'public_production' };
  return p;
}

test('verifyLocalProof: anchored G2 caps at L3 offline, meets L3/G2', () => {
  const r = verifyLocalProof(pkg(), { require: 'L3/G2', replay: true });
  assert.equal(r.proofLevel, 'L3');
  assert.equal(r.governanceLevel, 'G2');
  assert.equal(r.tier, 'L3/G2');
  assert.ok(r.verified, `should meet L3/G2: ${r.reasons.join(', ')}`);
});

test('verifyLocalProof: require L4 fails offline (no l0 confirmation)', () => {
  const r = verifyLocalProof(pkg(), { require: 'L4/G2', replay: true });
  assert.equal(r.verified, false);
  assert.ok(r.reasons.some((x) => x.includes('proof level')));
});

test('verifyLocalProof: l0Confirmed lifts an anchored bundle to L4', () => {
  const r = verifyLocalProof(pkg(), { require: 'L4/G2', replay: true, l0Confirmed: true });
  assert.equal(r.proofLevel, 'L4');
  assert.ok(r.verified, `should meet L4/G2 with l0Confirmed: ${r.reasons.join(', ')}`);
});

test('verifyLocalProof: replay required but capsule absent fails', () => {
  const r = verifyLocalProof(pkg({ replay: false }), { replay: true });
  assert.equal(r.verified, false);
  assert.ok(r.reasons.some((x) => x.includes('replay')));
});

test('hasReplayCapsule reflects capsule presence', () => {
  assert.equal(hasReplayCapsule(pkg()), true);
  assert.equal(hasReplayCapsule(pkg({ replay: false })), false);
});

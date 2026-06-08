/**
 * Proof receipt tests (adoption-06): build from a verify result, render, the
 * fail-closed validator, and the UI badge mapping.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  receiptFromVerifyResult,
  parseReceipt,
  validateReceipt,
  assertValidReceipt,
  receiptBadges,
  renderReceiptText,
  RECEIPT_VERSION,
  type ProofReceipt,
} from './proofReceipt';
import type { ProofVerifyResult } from './proofs/verifyLocal';

const L3: ProofVerifyResult = {
  verified: true, proofLevel: 'L3', governanceLevel: 'G2', tier: 'L3/G2', replayAvailable: true, reasons: [],
};
const L4: ProofVerifyResult = {
  verified: true, proofLevel: 'L4', governanceLevel: 'G2', tier: 'L4/G2', replayAvailable: true, reasons: [],
};

test('builds a valid offline L3 receipt that never claims L0', () => {
  const r = receiptFromVerifyResult(L3, { intentId: 'intent-1', evidenceId: 'ev-1' });
  assert.equal(r.version, RECEIPT_VERSION);
  assert.equal(r.status, 'verified');
  assert.equal(r.assurance.l0Verified, false);
  assert.equal(r.assurance.nodeTrusted, false);
  assert.deepEqual(validateReceipt(r), []);
});

test('builds a valid live L4 receipt with network + command', () => {
  const r = receiptFromVerifyResult(L4, {
    intentId: 'intent-1', l0Verified: true, replayVerified: true,
    network: 'kermit', command: 'infrix verify b.json --l0 kermit', anchorTx: 'tx-1',
  });
  assert.equal(r.assurance.l0Verified, true);
  assert.equal(r.assurance.proofLevel, 'L4');
  assert.deepEqual(validateReceipt(r), []);
});

test('rejects L4 without L0', () => {
  const r = receiptFromVerifyResult(L4, { intentId: 'intent-1', l0Verified: false });
  const errs = validateReceipt(r);
  assert.ok(errs.some((e) => /L4 without l0Verified/.test(e)), errs.join('; '));
  assert.throws(() => assertValidReceipt(r));
});

test('rejects verified with no passing check', () => {
  const r = receiptFromVerifyResult(
    { verified: true, proofLevel: 'L0', governanceLevel: 'ungoverned', tier: 'L0/ungoverned', replayAvailable: false, reasons: [] },
    {},
  );
  const errs = validateReceipt(r);
  assert.ok(errs.some((e) => /no verification check passed/.test(e)), errs.join('; '));
});

test('rejects a missing nodeTrusted', () => {
  const r = receiptFromVerifyResult(L3, { intentId: 'intent-1' });
  // Simulate a malformed external receipt that dropped nodeTrusted.
  delete (r.assurance as unknown as Record<string, unknown>).nodeTrusted;
  assert.ok(validateReceipt(r).some((e) => /nodeTrusted is required/.test(e)));
});

test('rejects conflicting subject/artifact ids', () => {
  const r = receiptFromVerifyResult(L3, { subjectType: 'intent', subjectId: 'A', intentId: 'B' });
  assert.ok(validateReceipt(r).some((e) => /conflicts with artifacts.intentId/.test(e)));
});

test('parse round-trips and renders', () => {
  const r = receiptFromVerifyResult(L3, { intentId: 'intent-1' });
  const back = parseReceipt(JSON.stringify(r));
  assert.equal(back.subject.id, 'intent-1');
  const text = renderReceiptText(back);
  assert.match(text, /VERIFIED/);
  assert.match(text, /Trusts Infrix node: no/);
  assert.match(text, /L0 anchor: not checked/);
});

test('badge mapping reflects the assurance', () => {
  const r: ProofReceipt = receiptFromVerifyResult(L4, {
    intentId: 'intent-1', l0Verified: true, replayVerified: true, witnessQuorumVerified: true,
    network: 'kermit', command: 'infrix verify b --l0 kermit',
  });
  const b = receiptBadges(r);
  const byName = Object.fromEntries(b.badges.map((x) => [x.name, x]));
  assert.equal(byName['node trust'].on, true);
  assert.equal(byName['L0'].on, true);
  assert.equal(byName['replay'].on, true);
  assert.equal(byName['witness'].on, true);
  assert.equal(b.assurance, 'L4/G2');
});

// @infrix/widgets — verification core tests (nextux-09).
//
// These cover the required honesty cases on the framework-neutral verifier:
// offline never claims L4, a tampered story fails, and a failed result carries
// no positive (green) badge.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyBundle, verifyStory, verifyReceiptResult } from '../verifier.js';
import { canonicalBadges } from '../shared.js';
import { loadSampleBundle, decodeBundleFile, tamperedBundle } from './fixtures.js';

test('an offline story verifies locally and is NEVER inflated to L4', async () => {
  const r = await verifyStory(loadSampleBundle());
  assert.equal(r.ran, true);
  assert.equal(r.localVerified, true);
  assert.notEqual(r.proofLevel, 'L4', 'offline must never claim L4');
  assert.equal(r.l0Verified, false);
  assert.equal(r.l0Checked, false);
  assert.match(r.honestLabel, /Locally verified\. Live L0 not checked\./);
  assert.equal(r.cinemaBound, true, 'cinema must bind to the proof');
  assert.equal(r.replayPresent, true);
});

test('an offline proof bundle verifies and caps below L4', async () => {
  const bundle = decodeBundleFile(loadSampleBundle(), 'proof.infrix.json');
  const r = await verifyBundle(bundle);
  assert.equal(r.ran, true);
  assert.notEqual(r.proofLevel, 'L4');
  assert.equal(r.l0Verified, false);
  assert.equal(r.nodeTrusted, false);
});

test('a tampered story fails verification and shows no green badge', async () => {
  const r = await verifyStory(tamperedBundle());
  assert.equal(r.ran, true);
  assert.equal(r.localVerified, false);
  assert.notEqual(r.status, 'verified');
  const greens = canonicalBadges(r).filter((b) => b.colorRole === 'positive');
  assert.equal(greens.length, 0, 'a failed verification must carry no positive badge');
});

test('verifyReceiptResult is fail-closed: L4 without L0 is rejected', () => {
  const good = verifyReceiptResult({
    version: '1',
    subject: { type: 'evidence', id: 'ev1' },
    summary: 'ok', status: 'verified',
    assurance: { proofLevel: 'L3', governanceLevel: 'G2', label: 'L3/G2', nodeTrusted: false, l0Verified: false },
    artifacts: {}, verification: {}, warnings: [],
  });
  assert.equal(good.localVerified, true);
  assert.equal(good.honestLabel.includes('Fully verified'), false, 'no L0 means not fully verified');

  const overclaim = verifyReceiptResult({
    version: '1',
    subject: { type: 'evidence', id: 'ev1' },
    summary: 'ok', status: 'verified',
    assurance: { proofLevel: 'L4', label: 'L4', nodeTrusted: false, l0Verified: false },
    artifacts: {}, verification: {}, warnings: [],
  });
  assert.equal(overclaim.status, 'failed', 'L4 without l0Verified must fail closed');
});

test('a fully-verified result (L0 confirmed) is labeled accordingly', async () => {
  // Supply an opt-in l0 backend that confirms the anchor.
  const bundle = decodeBundleFile(loadSampleBundle(), 'proof.infrix.json');
  const fetchImpl = (async () => ({
    ok: true,
    json: async () => ({ l0Verified: true, network: 'Kermit' }),
  })) as unknown as typeof fetch;
  const r = await verifyBundle(bundle, { l0: 'https://verify.example/l0', fetchImpl });
  if (r.localVerified) {
    assert.equal(r.l0Checked, true);
    assert.equal(r.l0Verified, true);
    assert.match(r.honestLabel, /Fully verified/);
    assert.equal(r.proofLevel, 'L4');
  }
});

test('nothing is fetched when no l0 endpoint is supplied (no payload leak)', async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return { ok: true, json: async () => ({}) };
  }) as unknown as typeof fetch;
  await verifyBundle(decodeBundleFile(loadSampleBundle(), 'proof.infrix.json'), { fetchImpl });
  assert.equal(called, false, 'the verifier must not contact any network without an explicit l0 endpoint');
});

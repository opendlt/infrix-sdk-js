/**
 * Proof Inbox SDK tests (nextux-07).
 *
 * They verify the cross-language decision verifier against a Go-signed fixture
 * (so the same Ed25519 signature verifies in both languages), the redaction-safe
 * summary, and the receipt-binding invariants.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  verifyDecision,
  verifyDecisionReceipt,
  canonicalDecisionBody,
  summarize,
  statusLane,
  isVerified,
} from './index';
import type { Decision, DecisionReceipt, InboxItem, SharedSummary } from './index';

interface Fixture {
  item: InboxItem;
  summary: SharedSummary;
  decision: Decision;
  receipt: DecisionReceipt;
}

function loadFixture(): Fixture {
  const p = join(__dirname, '..', '..', 'src', 'inbox', 'inbox.fixture.json');
  return JSON.parse(readFileSync(p, 'utf8')) as Fixture;
}

test('a Go-signed decision verifies in the SDK (cross-language)', () => {
  const { decision } = loadFixture();
  const res = verifyDecision(decision);
  assert.equal(res.ok, true, JSON.stringify(res.checks, null, 2));
  for (const c of res.checks) assert.ok(c.ok, `${c.name}: ${c.detail}`);
});

test('the canonical body reproduces the Go bodyHash', async () => {
  const { decision } = loadFixture();
  const { sha256 } = await import('@noble/hashes/sha256');
  const { bytesToHex } = await import('@noble/hashes/utils');
  const canon = canonicalDecisionBody(decision);
  assert.equal('sha256:' + bytesToHex(sha256(canon)), decision.bodyHash);
});

test('a tampered decision body fails verification', () => {
  const { decision } = loadFixture();
  const tampered: Decision = { ...decision, reason: 'changed after signing' };
  assert.equal(verifyDecision(tampered).ok, false);
});

test('a tampered signature fails verification', () => {
  const { decision } = loadFixture();
  // Flip the first signature character to a different base64 symbol.
  const sig = decision.signature;
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
  assert.equal(verifyDecision({ ...decision, signature: flipped }).ok, false);
});

test('the decision receipt verifies and binds the exact artifact hash', () => {
  const { receipt } = loadFixture();
  const res = verifyDecisionReceipt(receipt);
  assert.equal(res.ok, true, JSON.stringify(res.checks, null, 2));
});

test('an approve receipt against an unverified verification is rejected', () => {
  const { receipt } = loadFixture();
  const bad: DecisionReceipt = {
    ...receipt,
    verification: { ...receipt.verification, status: 'unverified' },
  };
  assert.equal(verifyDecisionReceipt(bad).ok, false);
});

test('a receipt whose decision binds a different artifact is rejected', () => {
  const { receipt } = loadFixture();
  const bad: DecisionReceipt = { ...receipt, artifactHash: 'sha256:deadbeef' };
  assert.equal(verifyDecisionReceipt(bad).ok, false);
});

test('the shared summary leaks no private payload', () => {
  const { item } = loadFixture();
  const withSecret: InboxItem = {
    ...item,
    comments: [{ id: 'c1', author: 'a', body: 'PRIVATE_SECRET_XYZ', bodyHash: 'sha256:x', createdAt: 'now' }],
  };
  const s = summarize(withSecret);
  assert.ok(!JSON.stringify(s).includes('PRIVATE_SECRET_XYZ'), 'summary must not leak a comment body');
  assert.equal(s.commentCount, 1);
  assert.equal(s.artifactHash, item.artifactHash);
});

test('helpers report honest status', () => {
  const { item } = loadFixture();
  assert.equal(isVerified(item), true);
  assert.equal(statusLane(item), 'approved');
});

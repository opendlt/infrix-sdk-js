/**
 * Proof Quest Mode SDK tests (nextux-11).
 *
 * They verify the catalog/progress/receipt helpers against the Go-generated
 * quest fixture and assert the honesty invariants: a local proof is L3 (never
 * L4), the node is never trusted, and a learning step is never a proof.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  questById,
  missionActions,
  counts,
  nextQuestId,
  questStatusById,
  missionStateWord,
  proofBadge,
  isLearning,
  claimsL4,
  isHonest,
} from './index';
import type { Quest, Status, ProgressReceipt } from './index';

interface QuestFixture {
  version: number;
  status: Status;
  catalog: Quest[];
  receipt: ProgressReceipt;
}

function loadFixture(): QuestFixture {
  // The canonical quest fixture shared with Nexus.
  const p = join(__dirname, '..', '..', '..', '..', 'pkg', 'nexus', 'web', 'testdata', 'quests.fixture.json');
  return JSON.parse(readFileSync(p, 'utf8')) as QuestFixture;
}

test('the catalog has the ten initial quests, each grounded in real actions', () => {
  const fx = loadFixture();
  assert.equal(fx.catalog.length, 10);
  for (const id of ['first-proof', 'verify-without-node', 'kermit-l0-upgrade']) {
    const q = questById(fx.catalog, id);
    assert.ok(q, `catalog has ${id}`);
    assert.ok(missionActions(q!).length > 0, `${id} orchestrates real actions`);
  }
});

test('the progress trail counts are honest', () => {
  const fx = loadFixture();
  const c = counts(fx.status);
  assert.equal(c.total, 10);
  assert.ok(c.completed >= 1 && c.completed <= 10);
});

test('the next quest is the first incomplete, unlocked quest (or none)', () => {
  const fx = loadFixture();
  const next = nextQuestId(fx.status);
  if (next) {
    const entry = questStatusById(fx.status, next);
    assert.ok(entry);
    assert.equal(entry!.completed, false);
    assert.equal(entry!.locked, false);
  }
});

test('a learning mission is never reported as a verified proof', () => {
  const fx = loadFixture();
  const learn = fx.status.quests.flatMap((q) => q.missions).find((m) => m.learning);
  if (learn) {
    assert.match(missionStateWord(learn), /learned/i);
    assert.doesNotMatch(missionStateWord(learn), /verified L[0-9]/i);
  }
});

test('the receipt is an honest local L3 — verified, no node trust, never L4', () => {
  const fx = loadFixture();
  const rc = fx.receipt;
  assert.ok(rc.proof, 'a proof receipt is present');
  assert.equal(rc.proof!.verified, true);
  assert.equal(rc.proof!.trustsNode, false);
  assert.equal(rc.proof!.l0Verified, false);
  assert.equal(claimsL4(rc), false, 'a local proof never claims L4');
  assert.equal(isLearning(rc), false, 'first-proof is a real proof, not a learning step');
  assert.equal(isHonest(rc), true);
});

test('proofBadge never overclaims for a local proof', () => {
  const fx = loadFixture();
  const badge = proofBadge(fx.receipt);
  assert.doesNotMatch(badge.label, /L4|fully verified/i);
  assert.match(badge.label, /locally verified|live L0/i);
  assert.equal(badge.proof, true);
});

test('isHonest rejects an L4 claim without a live L0 confirmation', () => {
  const forged: ProgressReceipt = {
    version: 1,
    questId: 'kermit-l0-upgrade',
    missionId: 'kermit-upgrade',
    title: 'forged',
    completedAt: '2026-06-10T12:00:00Z',
    mode: 'local',
    learning: false,
    proof: { verified: true, proofLevel: 'L4', trustsNode: false, l0Verified: false, replayVerified: false },
    artifacts: [],
    receiptHash: 'sha256:0',
  };
  assert.equal(isHonest(forged), false, 'an L4 claim without live L0 must be rejected');
  assert.doesNotMatch(proofBadge(forged).label, /L4/i, 'the badge must downgrade an unbacked L4 claim');
});

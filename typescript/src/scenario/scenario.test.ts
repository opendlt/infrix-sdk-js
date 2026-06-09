/**
 * Scenario SDK tests (nextux-02). Run via the package test script.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

import {
  TEMPLATE_SUMMARIES,
  ENTRY_CHOICES,
  validateScenarioShape,
  verifyStoryStructure,
  type ScenarioDraft,
  type Story,
} from './index';

function hash(s: string): { sha256: string; bytes: number } {
  const b = new TextEncoder().encode(s);
  return { sha256: bytesToHex(sha256(b)), bytes: b.length };
}

// Build a self-consistent story + files for the verifier tests.
function sampleStory(): { story: Story; files: Record<string, string> } {
  const scenario = 'version: 1\nid: x\n';
  const proof = '{"version":"v4"}';
  const receipt = '{"version":"1"}';
  const cinema = JSON.stringify({ version: 1, boundOutcomeDigest: 'abc123' });
  const verify = 'verified: true\n';
  const files: Record<string, string> = {
    'scenario.yaml': scenario,
    'proof.infrix.json': proof,
    'receipt.infrix.json': receipt,
    'cinema.infrix.json': cinema,
    'verify.txt': verify,
  };
  const manifest = Object.entries(files).map(([file, content]) => ({ file, ...hash(content) }));
  const story: Story = {
    version: 1,
    storyId: 'story_test',
    scenarioId: 'x',
    title: 'Test',
    network: 'local',
    assurance: { proofLevel: 'L3', governanceLevel: 'G2', trustsInfrixNode: false, l0Verified: false, replayVerified: true, minimumLevelMet: true, verified: true },
    artifacts: { scenario: 'scenario.yaml', proofBundle: 'proof.infrix.json', receipt: 'receipt.infrix.json', cinemaReplay: 'cinema.infrix.json', verifierTranscript: 'verify.txt' },
    manifest,
    redactions: [],
    narrative: {},
    cinemaBinding: 'abc123',
    integrity: { sha256: 'not-checked-in-js' },
  };
  return { story, files };
}

test('there are eight built-in templates and entry choices', () => {
  assert.equal(TEMPLATE_SUMMARIES.length, 8);
  assert.ok(TEMPLATE_SUMMARIES.find((t) => t.id === 'regulated-escrow'));
  assert.ok(ENTRY_CHOICES.length >= 5);
});

test('validateScenarioShape accepts a good scenario and rejects bad ones', () => {
  const good: ScenarioDraft = {
    version: 1, id: 'x', title: 'x', network: 'local',
    actors: { buyer: { kind: 'user' } },
    policy: {}, steps: [{ id: 's', action: 'a', actor: 'buyer' }], proof: {},
  };
  assert.deepEqual(validateScenarioShape(good), []);

  const badActor = { ...good, steps: [{ id: 's', action: 'a', actor: 'ghost' }] };
  assert.ok(validateScenarioShape(badActor).some((e) => /unknown actor/.test(e)));

  const mainnet = { ...good, network: 'mainnet' as unknown as 'local' };
  assert.ok(validateScenarioShape(mainnet).some((e) => /mainnet/.test(e)));
});

test('verifyStoryStructure passes a self-consistent story', () => {
  const { story, files } = sampleStory();
  const res = verifyStoryStructure(story, files);
  assert.ok(res.ok, JSON.stringify(res.checks));
});

test('a tampered artifact fails the manifest check', () => {
  const { story, files } = sampleStory();
  files['receipt.infrix.json'] = '{"tampered":true}';
  const res = verifyStoryStructure(story, files);
  assert.equal(res.ok, false);
  assert.ok(res.checks.some((c) => c.name === 'manifest' && !c.ok));
});

test('an unmanifested artifact is rejected', () => {
  const { story, files } = sampleStory();
  files['extra.infrix.json'] = '{}';
  const res = verifyStoryStructure(story, files);
  assert.equal(res.ok, false);
  assert.ok(res.checks.some((c) => c.name.startsWith('unmanifested:')));
});

test('an L4 claim without l0Verified is rejected as overclaiming', () => {
  const { story, files } = sampleStory();
  story.assurance.proofLevel = 'L4';
  const res = verifyStoryStructure(story, files);
  assert.equal(res.ok, false);
  assert.ok(res.checks.some((c) => c.name === 'honesty:l4' && !c.ok));
});

test('a Cinema binding mismatch is rejected', () => {
  const { story, files } = sampleStory();
  story.cinemaBinding = 'different';
  const res = verifyStoryStructure(story, files);
  assert.equal(res.ok, false);
  assert.ok(res.checks.some((c) => c.name === 'cinema-binding' && !c.ok));
});

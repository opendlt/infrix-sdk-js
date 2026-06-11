import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assuranceIsFromVerifier,
  localRunIsHonest,
  resumeIsHonest,
  type Assurance,
  type RunRecord,
  type ResumeContext,
} from './app.js';

test('assuranceIsFromVerifier requires verifier provenance and an untrusted node', () => {
  const honest: Assurance = {
    proofLevel: 'L3', governanceLevel: 'G2', verified: true, l0Verified: false,
    replayVerified: true, fullyVerified: false, nodeTrusted: false, source: 'verifykit',
  };
  assert.ok(assuranceIsFromVerifier(honest));
  assert.ok(!assuranceIsFromVerifier({ ...honest, source: 'app' }), 'a non-verifier source is rejected');
  assert.ok(!assuranceIsFromVerifier({ ...honest, nodeTrusted: true }), 'a trusted node is rejected');
  assert.ok(!assuranceIsFromVerifier(undefined));
});

test('localRunIsHonest forbids a local run from claiming L0 or L4', () => {
  const local: RunRecord = {
    id: 'run-1', network: 'local', storyPath: 'runs/run-1/story.infrixstory.json',
    proofLevel: 'L3', governanceLevel: 'G2', verified: true, l0Verified: false, ranAtUnix: 0,
  };
  assert.ok(localRunIsHonest(local));
  assert.ok(!localRunIsHonest({ ...local, l0Verified: true }), 'a local run claiming L0 is dishonest');
  assert.ok(!localRunIsHonest({ ...local, proofLevel: 'L4' }), 'a local run claiming L4 is dishonest');
  // A kermit run is not constrained by this local rule.
  assert.ok(localRunIsHonest({ ...local, network: 'kermit', proofLevel: 'L4', l0Verified: true }));
});

test('resumeIsHonest keeps the never-trust-node / never-mainnet invariants', () => {
  const rc: ResumeContext = {
    version: 1, name: 'demo', prompt: 'a regulated escrow', network: 'local', planHash: 'sha256:x',
    flowTitle: 'Regulated escrow', artifacts: {}, runs: [], nextActions: [],
    nodeTrusted: false, mainnetAllow: false,
  };
  assert.ok(resumeIsHonest(rc));
  assert.ok(!resumeIsHonest({ ...rc, nodeTrusted: true }));
  assert.ok(!resumeIsHonest({ ...rc, mainnetAllow: true }));
});

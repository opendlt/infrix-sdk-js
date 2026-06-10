/**
 * Agent Action Protocol SDK tests (nextux-01).
 *
 * Run via the package test script (tsc → node --test). These cover the required
 * nextux-01 SDK cases: schemas generate valid types, the action list matches the
 * registry, dry-run/run responses parse, error explanation is stable, and a
 * mutating tool requires approval.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  InfrixAgentClient,
  ACTION_IDS,
  needsApproval,
  explainError,
  trustsNode,
  type AgentResponse,
  type Manifest,
  type FetchLike,
} from './index';

// loadFixture reads the manifest dump generated from the Go registry.
function loadFixture(): { actions: Manifest[] } {
  const p = join(__dirname, '..', '..', 'src', 'agent', 'actions.fixture.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}

// mockClient returns a client whose fetch is backed by the given route map.
function mockClient(routes: Record<string, (body: unknown) => unknown>): InfrixAgentClient {
  const fetchImpl: FetchLike = async (url, init) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const key = `${init?.method ?? 'GET'} ${path}`;
    const handler = routes[key];
    const parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    const out = handler ? handler(parsedBody) : {};
    const text = JSON.stringify(out);
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  };
  return new InfrixAgentClient({ endpoint: 'http://agent.test', fetchImpl });
}

test('ACTION_IDS matches the Go registry fixture (no drift)', () => {
  const fixture = loadFixture();
  const fixtureIds = fixture.actions.map((a) => a.id).sort();
  const sdkIds = [...ACTION_IDS].sort();
  assert.deepEqual(sdkIds, fixtureIds, 'SDK ACTION_IDS must match the registry');
  assert.equal(ACTION_IDS.length, 63, 'nextux-01 + nextux-02 + nextux-05 + nextux-06 + nextux-07 + nextux-08 + nextux-09 + nextux-10 + nextux-11 + nextux-12 actions');
});

test('every manifest has a schema and required fields (types generate cleanly)', () => {
  const { actions } = loadFixture();
  for (const m of actions) {
    assert.ok(m.id && m.title && m.description, `${m.id} missing core fields`);
    assert.ok(m.inputSchema && m.outputSchema, `${m.id} missing schemas`);
    assert.ok(Array.isArray(m.errors) && m.errors.length > 0, `${m.id} missing error codes`);
    assert.ok(m.dryRunSupported, `${m.id} must support dry-run`);
  }
});

test('every mutating tool requires approval and a dry-run', () => {
  const { actions } = loadFixture();
  for (const m of actions) {
    if (m.mutatesState) {
      assert.ok(m.requiresApproval, `${m.id} mutates state but does not require approval`);
      assert.ok(m.dryRunSupported, `${m.id} mutates state but has no dry-run`);
      assert.ok(m.authoritySummary, `${m.id} mutates state but documents no authority`);
    }
  }
});

test('listActions parses the registry over the wire', async () => {
  const fixture = loadFixture();
  const client = mockClient({ 'GET /agent/actions': () => fixture });
  const actions = await client.listActions();
  assert.equal(actions.length, 63);
  assert.ok(actions.find((a) => a.id === 'proof.verify'));
});

test('dry-run and run responses are parseable', async () => {
  const dryEnvelope: AgentResponse = {
    ok: true,
    action: 'proof.verify',
    summary: 'preview',
    artifacts: [],
    nextActions: [],
    warnings: [],
    errors: [],
    dryRun: {
      summary: 'verify offline',
      networkTarget: 'offline',
      identitiesTouched: [],
      keyPagesNeeded: [],
      estimatedCost: '',
      expectedProofLevel: 'L3',
      expectedFinality: 'immediate',
      expectedArtifacts: ['receipt'],
      irreversibleEffects: [],
      walletPromptExpected: false,
      disabledUnderProfile: false,
      deterministic: true,
    },
  };
  const runEnvelope: AgentResponse = {
    ok: true,
    action: 'proof.verify',
    summary: 'Proof verified at L3/G2.',
    assurance: { proofLevel: 'L3', governanceLevel: 'G2', trustsInfrixNode: false },
    artifacts: [{ type: 'receipt', command: 'infrix verify b.json' }],
    nextActions: [],
    warnings: [],
    errors: [],
  };
  const client = mockClient({
    'POST /agent/dry-run': () => dryEnvelope,
    'POST /agent/run': () => runEnvelope,
  });

  const dry = await client.dryRun('proof.verify', { bundle: {} });
  assert.equal(dry.ok, true);
  assert.equal(dry.dryRun?.deterministic, true);

  const run = await client.run('proof.verify', { bundle: {} });
  assert.equal(run.ok, true);
  assert.equal(trustsNode(run), false, 'verification must not trust the node');
});

test('a mutating tool requires approval (server returns approvalRequest)', async () => {
  const blocked: AgentResponse = {
    ok: false,
    action: 'workflow.execute',
    artifacts: [],
    nextActions: [],
    warnings: [],
    errors: [{ code: 'AGENT_APPROVAL_REQUIRED', title: 'needs approval', message: 'approve first', retryable: false }],
    approvalRequest: {
      action: 'workflow.execute',
      inputHash: 'sha256:abc',
      sessionId: 'default-local',
      approvalMode: 'ask_before_write',
      riskLevel: 'local_write',
    },
  };
  const client = mockClient({ 'POST /agent/run': () => blocked });
  const resp = await client.run('workflow.execute', { mode: 'local' });
  assert.equal(resp.ok, false);
  assert.ok(needsApproval(resp), 'response must indicate approval is required');
  assert.equal(resp.approvalRequest?.inputHash, 'sha256:abc');
});

test('error explanation is stable and agent-safe', () => {
  const resp: AgentResponse = {
    ok: false,
    action: 'release.evidence.publish',
    artifacts: [],
    nextActions: [],
    warnings: [],
    errors: [{
      code: 'AGENT_PUBLISH_UNVERIFIED',
      title: 'Release evidence must verify before publish',
      message: 'The release evidence did not verify, so it cannot be published.',
      retryable: false,
      fixes: [{ label: 'Verify the evidence first', command: 'infrix agent run release.evidence.verify --input file.json --json', safeToRun: true }],
    }],
  };
  const explanation = explainError(resp);
  assert.match(explanation, /did not verify/);
  assert.match(explanation, /Fix: infrix agent run release\.evidence\.verify/);
  // Stable: repeated calls produce the identical string.
  assert.equal(explainError(resp), explanation);
});

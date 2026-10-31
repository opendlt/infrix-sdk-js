import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fromPrompt } from './fromPrompt.js';
import { InfrixAgentClient } from '../agent/client.js';

// honestAssurance is the verifier verdict a healthy local run produces
// (agent Assurance shape: never trusts the node).
const honestAssurance = {
  proofLevel: 'L3', governanceLevel: 'G2', trustsInfrixNode: false,
  l0Verified: false, replayVerified: true,
};

// makeClient builds an InfrixAgentClient backed by a scripted fetch that maps
// each governed app.* action to a canned response.
function makeClient(responses: Record<string, unknown>): InfrixAgentClient {
  const fetchImpl = async (_url: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    const action = body.action as string;
    // dry-run + approve succeed silently for autoApprove flows.
    if (_url.endsWith('/agent/dry-run')) {
      return { ok: true, text: async () => JSON.stringify({ ok: true, action, artifacts: [], nextActions: [], warnings: [], errors: [] }) } as unknown as Response;
    }
    if (_url.endsWith('/agent/approve')) {
      return { ok: true, text: async () => JSON.stringify({ ok: true, approval: { token: 't', action } }) } as unknown as Response;
    }
    const resp = responses[action] ?? { ok: true, action, artifacts: [], nextActions: [], warnings: [], errors: [] };
    return { ok: true, text: async () => JSON.stringify(resp) } as unknown as Response;
  };
  return new InfrixAgentClient({ endpoint: 'http://localhost', fetchImpl: fetchImpl as never });
}

test('fromPrompt one-liner: build → run → verify → share', async () => {
  const client = makeClient({
    'app.ask': { ok: true, action: 'app.ask', artifacts: [], nextActions: [], warnings: [], errors: [] },
    'app.run': { ok: true, action: 'app.run', assurance: honestAssurance, artifacts: [], nextActions: [], warnings: [], errors: [] },
    'app.verify': { ok: true, action: 'app.verify', assurance: honestAssurance, artifacts: [], nextActions: [], warnings: [], errors: [] },
    'app.share': { ok: true, action: 'app.share', data: { bundle: 'inline' }, artifacts: [], nextActions: [], warnings: [], errors: [] },
  });
  const app = await fromPrompt('regulated escrow with proof of release', { client });
  const run = await app.run();
  const receipt = await run.verify();
  assert.equal(receipt.assurance.proofLevel, 'L3');
  assert.equal(receipt.assurance.trustsInfrixNode, false);
  const bundle = await receipt.share();
  assert.ok(bundle, 'a verified receipt yields a share bundle');
});

test('fromPrompt cannot hide a failed proof: verify throws', async () => {
  const client = makeClient({
    'app.ask': { ok: true, action: 'app.ask', artifacts: [], nextActions: [], warnings: [], errors: [] },
    'app.run': { ok: true, action: 'app.run', assurance: honestAssurance, artifacts: [], nextActions: [], warnings: [], errors: [] },
    // app.verify reports failure (ok:false) — the one-liner must surface it.
    'app.verify': { ok: false, action: 'app.verify', artifacts: [], nextActions: [], warnings: [], errors: [{ code: 'PROOF_NOT_VERIFIED', message: 'no' }] },
  });
  const app = await fromPrompt('escrow', { client });
  const run = await app.run();
  await assert.rejects(run.verify(), /did not verify/);
});

test('fromPrompt rejects mainnet', async () => {
  const client = makeClient({});
  await assert.rejects(fromPrompt('escrow', { client, network: 'mainnet' }), /mainnet/);
});

// makeRecordingClient is makeClient that also records every governed request body, so a test can read what the SDK asked of the agent surface.
function makeRecordingClient(responses: Record<string, unknown>, seen: Array<{ url: string; body: any }>): InfrixAgentClient {
  const fetchImpl = async (url: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    seen.push({ url, body });
    if (url.endsWith('/agent/dry-run')) {
      return { ok: true, text: async () => JSON.stringify({ ok: true, action: body.action, artifacts: [], nextActions: [], warnings: [], errors: [] }) } as unknown as Response;
    }
    if (url.endsWith('/agent/approve')) {
      return { ok: true, text: async () => JSON.stringify({ ok: true, approval: { token: 't', action: body.action } }) } as unknown as Response;
    }
    const resp = responses[body.action as string] ?? { ok: true, action: body.action, artifacts: [], nextActions: [], warnings: [], errors: [] };
    return { ok: true, text: async () => JSON.stringify(resp) } as unknown as Response;
  };
  return new InfrixAgentClient({ endpoint: 'http://localhost', fetchImpl: fetchImpl as never });
}

const nodeRun = { rpc: 'https://node.example', actor: 'acc://operator.acme', workflowDefinition: 'p3-workflow', l0: 'kermit' };

test('fromPrompt node run: app.run is asked for mode node with the node, actor, definition and L0, and is not auto-approved', async () => {
  const seen: Array<{ url: string; body: any }> = [];
  const l4 = { proofLevel: 'L4', governanceLevel: 'G1', trustsInfrixNode: false, l0Verified: true, replayVerified: false };
  const client = makeRecordingClient({
    'app.run': { ok: true, action: 'app.run', assurance: l4, artifacts: [], nextActions: [], warnings: [], errors: [] },
  }, seen);
  const app = await fromPrompt('escrow that releases when two approvers sign', { client, node: nodeRun });
  await app.run();
  const runs = seen.filter((c) => c.body.action === 'app.run');
  assert.ok(runs.length > 0, 'app.run was asked');
  const input = runs[runs.length - 1].body.input;
  assert.equal(input.mode, 'node');
  assert.equal(input.rpc, nodeRun.rpc);
  assert.equal(input.actor, nodeRun.actor);
  assert.equal(input.workflowDefinition, nodeRun.workflowDefinition);
  assert.equal(input.l0, 'kermit');
  assert.equal(seen.some((c) => c.url.endsWith('/agent/approve')), false, 'a node run is an external write and is not auto-approved');
});

test('fromPrompt node run the caller approved is approved through the agent surface', async () => {
  const seen: Array<{ url: string; body: any }> = [];
  const client = makeRecordingClient({}, seen);
  const app = await fromPrompt('escrow', { client, node: { ...nodeRun, approve: true } });
  await app.run();
  assert.equal(seen.some((c) => c.url.endsWith('/agent/approve')), true);
});

test('fromPrompt without a node asks for the local run, auto-approved, with no node member', async () => {
  const seen: Array<{ url: string; body: any }> = [];
  const client = makeRecordingClient({}, seen);
  const app = await fromPrompt('escrow', { client });
  await app.run();
  const input = seen.filter((c) => c.body.action === 'app.run').pop()!.body.input;
  assert.equal(input.mode, undefined);
  assert.equal(input.rpc, undefined);
  assert.equal(seen.some((c) => c.url.endsWith('/agent/approve')), true);
});

test('fromPrompt refuses a node run missing what it needs before it asks the agent anything', async () => {
  for (const k of ['rpc', 'actor', 'workflowDefinition'] as const) {
    const seen: Array<{ url: string; body: any }> = [];
    const client = makeRecordingClient({}, seen);
    const node = { ...nodeRun, [k]: '' };
    await assert.rejects(fromPrompt('escrow', { client, node }), new RegExp('node\\.' + k));
    assert.equal(seen.length, 0, 'nothing may be asked of the agent surface for a refused node run');
  }
});

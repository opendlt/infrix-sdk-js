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

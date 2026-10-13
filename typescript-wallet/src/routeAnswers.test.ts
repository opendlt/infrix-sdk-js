// The wallet reads `intent.evidence` (GET /v4/intents/{id}/evidence). The route answers
// {bundles, count, intent, intentId}: the evidence bundles are INSIDE `bundles`, and the answer is not a bundle.
// getEvidence used to cast the answer to an {id, intentId, anchorStatus} bundle that no node ever sent, so
// `evidence.id` was undefined and the id every consumer then passed to the evidence routes was wrong.
// Over a mocked fetch that answers the REAL declared shape.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixWallet } from './wallet';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;

/** Answer every JSON-RPC call with `result`, and report the calls made. */
async function against<T>(result: unknown, fn: (w: InfrixWallet) => Promise<T>): Promise<{ calls: Array<{ method: string; params: Record<string, unknown> }>; value: T }> {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  (globalThis as { fetch?: FetchLike }).fetch = async (_url: unknown, init: unknown) => {
    const body = JSON.parse(String((init as { body?: string }).body)) as { method: string; params: Record<string, unknown> };
    calls.push({ method: body.method, params: body.params });
    return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) };
  };
  try {
    const value = await fn(new InfrixWallet('acc://myco.acme', { rpcUrl: 'http://node.test/rpc' }));
    return { calls, value };
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
}

const INTENT = 'intent-acc://myco.acme-1';
const ANSWER = {
  bundles: [{ id: `ev-${INTENT}`, state: 'anchored', fields: { AnchorStatus: 'anchored', IntentID: INTENT } }],
  count: 1,
  intent: { id: INTENT },
  intentId: INTENT,
};

test('getEvidence returns the declared answer: the evidence id is bundles[0].id, not a member of the answer', async () => {
  const { calls, value } = await against(ANSWER, (w) => w.getEvidence(INTENT));
  assert.deepEqual(calls, [{ method: 'intent.evidence', params: { intentId: INTENT } }]);
  assert.equal(value.count, 1);
  assert.equal(value.intentId, INTENT);
  assert.equal((value.bundles[0] as { id: string }).id, `ev-${INTENT}`);
  assert.equal((value as unknown as { id?: string }).id, undefined, 'the answer is not a bundle: it has no id of its own');
});

test('getEvidence refuses an answer that lacks a member the route declares', async () => {
  for (const missing of ['bundles', 'count', 'intent', 'intentId'] as const) {
    const answer: Record<string, unknown> = { ...ANSWER };
    delete answer[missing];
    await assert.rejects(against(answer, (w) => w.getEvidence(INTENT)), new RegExp(`carries no ${missing}`), missing);
  }
  await assert.rejects(against({ ...ANSWER, bundles: 'ev-1' }, (w) => w.getEvidence(INTENT)), /bundles that are not a list/);
});

test('hasRole and hasCapability refuse the scope argument by name and send no request', async () => {
  const w = new InfrixWallet('acc://myco.acme', { rpcUrl: 'http://node.test/rpc' });
  const loose = w as unknown as { hasRole: (...a: unknown[]) => Promise<boolean>; hasCapability: (...a: unknown[]) => Promise<boolean> };
  let requests = 0;
  (globalThis as { fetch?: FetchLike }).fetch = async () => {
    requests++;
    return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result: { granted: true, hasRole: true } }) };
  };
  try {
    await assert.rejects(loose.hasRole('admin', 'acc://scope.acme'), /^Error: wallet\.hasRole no longer accepts scope: the route does not take it$/);
    await assert.rejects(loose.hasCapability('token:transfer', 'acc://scope.acme'), /^Error: wallet\.hasCapability no longer accepts scope: the route does not take it$/);
    assert.equal(requests, 0);
    assert.equal(await loose.hasRole('admin'), true, 'without a scope the check runs');
    assert.equal(await loose.hasCapability('token:transfer', undefined), true, 'an undefined scope is no scope');
    assert.equal(requests, 2);
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
});

test('the checks send the identity and the name and no scope key', async () => {
  const role = await against({ hasRole: true }, (w) => w.hasRole('admin'));
  assert.deepEqual(role.calls[0].params, { identity: 'acc://myco.acme', role: 'admin' });
  assert.ok(!('scope' in role.calls[0].params));
  const cap = await against({ granted: false }, (w) => w.hasCapability('token:transfer'));
  assert.deepEqual(cap.calls[0].params, { identity: 'acc://myco.acme', capability: 'token:transfer' });
  assert.equal(cap.value, false);
});

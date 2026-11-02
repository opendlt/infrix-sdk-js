// intents.approve carries an approval signed with any of the network's user-signature types: signatureAlgorithm accumulate:<type> with the key page
// version and timestamp the signature names, and the original ed25519 form is unchanged. The SDK never signs; it transports what the approver signed
// (the CLI's `infrix approval submit --signature-type`, the conformance approver), and refuses what the node would refuse before it sends it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient, APPROVAL_SIGNATURE_TYPES } from './index';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;

async function sent(fn: (c: InfrixClient) => Promise<unknown>): Promise<{ method: string; params: Record<string, unknown> } | undefined> {
  let seen: { method: string; params: Record<string, unknown> } | undefined;
  (globalThis as { fetch?: FetchLike }).fetch = async (_url: unknown, init: unknown) => {
    const body = JSON.parse(((init ?? {}) as { body?: string }).body ?? '{}');
    seen = { method: body.method, params: body.params };
    const payload = { jsonrpc: '2.0', id: body.id, result: { intentId: 'intent-1', stageId: 's', approvalId: 'a', status: 'resumed' } };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
  };
  try {
    await fn(new InfrixClient('http://node.test', { actor: 'acc://approver.acme', purpose: 'audit' }));
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
  return seen;
}

const base = { approver: 'acc://approver.acme', keyPageRef: 'acc://approver.acme/book/1', signature: 'ab'.repeat(65), signerPublicKey: 'cd'.repeat(65) };

test('the original ed25519 form is sent exactly as it always was', async () => {
  const r = await sent((c) => c.intents.approve('intent-1', 'ef'.repeat(32), base));
  assert.equal(r?.method, 'intent.approve');
  assert.equal(r?.params.signatureAlgorithm, 'ed25519');
  assert.equal('signerVersion' in (r?.params ?? {}), false);
  assert.equal('signatureTimestamp' in (r?.params ?? {}), false);
});

test('every network signature type is sent as accumulate:<type> with the page version and timestamp it names', async () => {
  for (const signatureType of APPROVAL_SIGNATURE_TYPES) {
    const r = await sent((c) => c.intents.approve('intent-1', 'ef'.repeat(32), { ...base, signatureType, signerVersion: 3, signatureTimestamp: 1700000000000042 }));
    assert.equal(r?.params.signatureAlgorithm, `accumulate:${signatureType}`, signatureType);
    assert.equal(r?.params.signerVersion, 3);
    assert.equal(r?.params.signatureTimestamp, 1700000000000042);
    assert.equal('signatureType' in (r?.params ?? {}), false, 'the type travels as the algorithm, not as a member the node does not declare');
  }
});

test('the SDK refuses before sending what the node would refuse', async () => {
  const none = async (fn: (c: InfrixClient) => Promise<unknown>) => assert.equal(await sent(fn).catch((e: Error) => e.message), undefined);
  void none;
  await assert.rejects(sent((c) => c.intents.approve('i', 'ef'.repeat(32), { ...base, signatureType: 'eth' })), /signerVersion is required/);
  await assert.rejects(sent((c) => c.intents.approve('i', 'ef'.repeat(32), { ...base, signatureType: 'eth', signerVersion: 0 })), /signerVersion is required/);
  await assert.rejects(sent((c) => c.intents.approve('i', 'ef'.repeat(32), { ...base, signerVersion: 2 })), /belong to a network signature/);
  await assert.rejects(sent((c) => c.intents.approve('i', 'ef'.repeat(32), { ...base, signatureTimestamp: 2 })), /belong to a network signature/);
  await assert.rejects(
    sent((c) => c.intents.approve('i', 'ef'.repeat(32), { ...base, signatureType: 'typedData' as never, signerVersion: 1 })),
    /is not one of/,
  );
});

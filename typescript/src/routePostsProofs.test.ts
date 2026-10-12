// The SDK's calls of two read-only POST routes that answer a computation: the EIP-712 typed data a wallet
// signs for an intent, and the verdict on a predicate proof. Each test holds the REQUEST to what the route
// accepts (verb, path, only the body fields it declares: docs/release/census/rest-body-fields.txt in the node
// repository) and the RESULT to what the route answers (rest-response-shapes.txt), against a mocked fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient } from './index';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;

interface Seen {
  method?: string;
  path: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

async function against<T>(data: unknown, fn: (c: InfrixClient) => Promise<T>): Promise<{ seen: Seen; result: T }> {
  const seen: Seen = { path: '', headers: {} };
  (globalThis as { fetch?: FetchLike }).fetch = async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as { method?: string; headers?: Record<string, string>; body?: string };
    seen.method = i.method;
    seen.path = new URL(String(url)).pathname;
    seen.headers = i.headers ?? {};
    seen.body = i.body ? JSON.parse(i.body) : undefined;
    const payload = { data };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
  };
  try {
    const result = await fn(new InfrixClient('http://node.test', { actor: 'acc://reader.acme', purpose: 'audit' }));
    return { seen, result };
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
}

const prepared = {
  chainId: '1337',
  transactionHash: 'e84b9864a551f2afa37d33f3830a402f2246fe67460400ca99778aaa5abedc17',
  typedData: { primaryType: 'Transaction', domain: { chainId: '1337' } },
};

test('eip712.prepare POSTs the intent and signer fields the route reads and returns the typed data it answers', async () => {
  const req = {
    goalType: 'TRANSFER',
    customType: 'p11-probe',
    customParams: { note: 'p11' },
    sourceAssets: [{ asset: 'acc://alice.acme/tokens', amount: 100 }],
    targetAssets: [{ asset: 'acc://bob.acme/tokens', amountDecimal: '100.5' }],
    signer: 'acc://p11-eip712-signer.acme/book/1',
    signerVersion: 1,
    publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
    timestamp: 1700000000000,
    memo: 'p11 prepare probe',
    networkName: 'Kermit',
    chainId: '1337',
  };
  const r = await against(prepared, (c) => c.eip712.prepare(req));
  assert.equal(r.seen.method, 'POST');
  assert.equal(r.seen.path, '/v4/intents/eip712/prepare');
  assert.deepEqual(r.seen.body, req, 'the body is the request, field for field');
  assert.ok(!('signature' in (r.seen.body ?? {})), 'prepare takes no signature: only the submit route reads one');
  assert.equal(r.seen.headers['X-Actor'], 'acc://reader.acme');
  assert.equal(r.result.chainId, '1337');
  assert.equal(r.result.transactionHash, prepared.transactionHash);
  assert.deepEqual(r.result.typedData, prepared.typedData);
});

test('eip712.prepare sends an asset amount as the number the route decodes', async () => {
  const r = await against(prepared, (c) =>
    c.eip712.prepare({
      goalType: 'TRANSFER',
      sourceAssets: [{ asset: 'acc://alice.acme/tokens', amount: 5 }],
      signer: 'acc://alice.acme/book/1',
      signerVersion: 1,
      publicKey: '02' + '00'.repeat(32),
      timestamp: 7,
    })
  );
  const sent = (r.seen.body?.sourceAssets as Array<{ amount: unknown }>)[0];
  assert.equal(typeof sent.amount, 'number', 'the route decodes amount as an unsigned integer; a string is refused');
});

const proof = {
  version: 1,
  predicate: 'threshold_gte',
  circuitName: 'threshold_gte',
  curve: 'bn254',
  publicInputs: ['18'],
  proof: 'AQID',
  vkHash: 'BAU=',
  holderDid: 'did:infrix:holder',
  holderPubKey: 'Bg==',
  grantId: 'grant-7',
  purpose: 'compliance',
  domain: 'verifier.example',
  challenge: 'Cg==',
  issuedAtBlock: 42,
  nullifier: 'Bwg=',
  binding: 'CQ==',
};

test('predicates.verify POSTs the envelope as given and returns the verdict and the identity it answers', async () => {
  const answer = {
    valid: true,
    predicate: 'threshold_gte',
    circuitName: 'threshold_gte',
    holderDid: 'did:infrix:holder',
    purpose: 'compliance',
    nullifier: '0708',
  };
  const r = await against(answer, (c) => c.predicates.verify(proof));
  assert.equal(r.seen.method, 'POST');
  assert.equal(r.seen.path, '/v4/predicates/verify');
  assert.deepEqual(r.seen.body, proof, 'the envelope is sent whole and unaltered: the node decodes it as the holder produced it');
  assert.equal(r.seen.headers['X-Actor'], 'acc://reader.acme');
  assert.equal(r.result.valid, true);
  assert.equal(r.result.nullifier, '0708');
  assert.equal(r.result.holderDid, 'did:infrix:holder');
});

test('predicates.verify returns a rejected proof as valid=false with the node reason, not as an error', async () => {
  const r = await against({ valid: false, reason: 'vkHash does not match the trusted key' }, (c) => c.predicates.verify(proof));
  assert.equal(r.result.valid, false);
  assert.equal(r.result.reason, 'vkHash does not match the trusted key');
});

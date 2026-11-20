// THE WALLET SENDS THE GOVERNED-SUBMIT CONTRACT AND SIGNS THE NODE'S CANONICAL SUBMISSION PREIMAGE (core item 2c part 28aa rows 6a-6c).
//
// The canonical request and the preimage are pinned to the node's by one shared vector: s28aa_submission_signing_vector_test.go in infrix-core
// holds the same request, network, canonical form and digest. Over a mocked fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixWallet } from './wallet';
import { canonicalRequest, submissionPreimage, SUBMISSION_SIGNING_DOMAIN } from './submission-signing';
import { fromHex, sha256, toHex, verifyEd25519 } from './crypto';
import type { IntentGoal } from './index';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;

const VECTOR_NETWORK = 'infrix-devnet';
const VECTOR_REQUEST = String.raw`{"goalType":"OBJECT_CREATE","actor":"acc://alice.acme","purpose":"operational","workflowInstance":"wf-1","customParams":{"objectType":"vault","n":1e21,"small":1.5e-7,"tiny":0.000001,"neg":-0,"f":0.1,"big":12345678901234567890,"s":"a\"b\\c\n\u0001é😀 "},"priority":"urgent","keyPageRef":"acc://alice.acme/book/1","signerPublicKey":"d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a","signature":"00"}`;
const VECTOR_DIGEST = '6aa789de74e36b654266f0e222e5f04d5eb253c3d8d8c4950fcd66a967368da3';

test('the canonical submission preimage matches the node vector', async () => {
  const canonical = canonicalRequest(JSON.parse(VECTOR_REQUEST));
  assert.ok(!canonical.includes('"signature"'), 'the signature signs itself');
  assert.ok(canonical.startsWith('{"actor":"acc://alice.acme","customParams":{"big":12345678901234567000,"f":0.1,"n":1e+21,"neg":0,'));
  assert.ok(canonical.includes('"small":1.5e-7,"tiny":0.000001}'));
  const digest = toHex(await sha256(submissionPreimage(VECTOR_NETWORK, canonical)));
  assert.equal(digest, VECTOR_DIGEST);
});

interface Sent {
  method: string;
  params: Record<string, unknown>;
}

// node answers intent.submissionSigning with the material an honest (or, with lie, a dishonest) node publishes, and anything else with an intent.
function node(sent: Sent[], lie = false): void {
  (globalThis as { fetch?: FetchLike }).fetch = async (_url: unknown, init: unknown) => {
    const body = JSON.parse((init as { body: string }).body);
    sent.push({ method: body.method, params: body.params });
    let result: unknown = { intentId: 'int-1', status: 'pending' };
    if (body.method === 'intent.submissionSigning') {
      const canonical = canonicalRequest(lie ? { ...body.params, priority: 'urgent' } : body.params);
      const pre = submissionPreimage(VECTOR_NETWORK, canonical);
      result = { domain: SUBMISSION_SIGNING_DOMAIN, networkId: VECTOR_NETWORK, canonical, preimage: toHex(pre), digest: toHex(await sha256(pre)) };
    }
    return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) };
  };
}

async function within<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
}

const FULL: IntentGoal = {
  type: 'SWAP',
  sourceAssets: [{ asset: 'acc://acme/ACME', amount: 1000, amountDecimal: '10.00', isMinimum: true, tokenStandard: 'acme', contractUrl: 'acc://acme/ACME' }],
  targetAssets: [{ asset: 'acc://usd.acme/USD', amount: 950, amountDecimal: '9.50', isMaximum: true }],
  targetState: { stateType: 'token_account', parameters: { owner: 'acc://alice.acme' }, contract: 'acc://c.acme' },
  via: 'acc://dex.acme',
  customType: 'label',
  customParams: { slippage: 0.01 },
  priority: 'high',
};
const OPTS = {
  purpose: 'operational',
  workflowInstance: 'wf-28aa',
  constraints: { maxGas: 50000, deadline: 4102444800 },
  preferences: { optimize: 'minimize_cost', maxAlternatives: 3 },
  rawInput: 'swap 10 ACME for at least 9 USD',
  expiresAt: 5000,
  // the requester's own annotation (core item 2c part 28ac row 3): sent as metadata, signed content on a signed submission
  metadata: { ref: 'order-7', nested: { n: 2 }, tags: ['a'] },
};

test('a fully populated goal, constraints, preferences, rawInput, expiresAt and metadata are sent as exactly the contract, unsigned without a key page', async () => {
  const sent: Sent[] = [];
  node(sent);
  const wallet = new InfrixWallet('acc://alice.acme', { rpcUrl: 'http://node.test/rpc' });
  await wallet.generateKey();
  await within(() => wallet.submitIntent(FULL, OPTS));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'intent.submit');
  const { type: _t, ...goalRest } = FULL;
  const { purpose: _p, workflowInstance: _w, ...optRest } = OPTS;
  assert.deepEqual(sent[0].params, { actor: 'acc://alice.acme', purpose: 'operational', workflowInstance: 'wf-28aa', goalType: 'SWAP', ...goalRest, ...optRest });
  for (const gone of ['signature', 'publicKey', 'rawInput_', 'goal', 'userAddress']) {
    assert.equal(Object.prototype.hasOwnProperty.call(sent[0].params, gone), false, `${gone} sent`);
  }
});

test('with a key page the wallet signs the canonical submission preimage the node publishes, and the signature verifies under its key', async () => {
  const sent: Sent[] = [];
  node(sent);
  const wallet = new InfrixWallet('acc://alice.acme', { rpcUrl: 'http://node.test/rpc' });
  await wallet.generateKey();
  await within(() => wallet.submitIntent(FULL, { ...OPTS, keyPageRef: 'acc://alice.acme/book/1' }));
  assert.deepEqual(sent.map((s) => s.method), ['intent.submissionSigning', 'intent.submit']);
  const submitted = sent[1].params;
  assert.equal(submitted.keyPageRef, 'acc://alice.acme/book/1');
  const pre = submissionPreimage(VECTOR_NETWORK, canonicalRequest(submitted));
  const ok = await verifyEd25519(fromHex(String(submitted.signerPublicKey)), pre, fromHex(String(submitted.signature)));
  assert.equal(ok, true, 'the signature does not verify over the canonical preimage of what was submitted');
});

test('the wallet refuses to sign material that is not its own derivation, and refuses what the node refuses, by name', async () => {
  const sent: Sent[] = [];
  node(sent, true);
  const wallet = new InfrixWallet('acc://alice.acme', { rpcUrl: 'http://node.test/rpc' });
  await wallet.generateKey();
  await within(async () => {
    await assert.rejects(() => wallet.submitIntent(FULL, { ...OPTS, keyPageRef: 'acc://alice.acme/book/1' }), /refusing to sign/);
    const submit = wallet.submitIntent.bind(wallet) as unknown as (g: unknown, o: unknown) => Promise<unknown>;
    await assert.rejects(() => submit('swap 10 ACME', OPTS), /intent\.resolve/);
    await assert.rejects(() => submit({ type: 'SWAP', goal: {} }, OPTS), /goal member goal is not part of the governed-submit contract/);
    await assert.rejects(() => submit({ type: 'SWAP' }, { ...OPTS, metadata: 'a=b' }), /metadata must be a JSON object of string keys and JSON values, not a string/);
    await assert.rejects(() => submit({ type: 'SWAP' }, { ...OPTS, metadata: [1] }), /not an array/);
    await assert.rejects(() => submit({ type: 'SWAP' }, { ...OPTS, metadata: { v: '<&> ' + 'x'.repeat(4096 - 11 - 3) } }), /metadata encodes to 4099 bytes, over the 4096-byte bound/);
  });
  assert.deepEqual(sent.map((s) => s.method), ['intent.submissionSigning'], 'a refused submission reached the node');
  const keyless = new InfrixWallet('acc://alice.acme', { rpcUrl: 'http://node.test/rpc' });
  await assert.rejects(() => keyless.submitIntent(FULL, { ...OPTS, keyPageRef: 'acc://alice.acme/book/1' }), /no active key/);
});

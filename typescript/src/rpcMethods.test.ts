// client.jsonrpc: one typed method per JSON-RPC method no other sub-client names. Each must post
// the method it is named for, send the caller's parameters (and the disclosure context the client
// merges into every call), and hand back the node's answer untouched, including a bare string.
// Held over a mocked fetch, the transport boundary.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient, RpcSubClient } from './index';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;

interface Posted {
  method: string;
  params: Record<string, unknown>;
}

function node(posted: Posted[], result: unknown, error?: { code: number; message: string }): void {
  (globalThis as { fetch?: FetchLike }).fetch = async (_url: unknown, init: unknown) => {
    const body = JSON.parse(String((init as { body?: string }).body)) as { id: number; method: string; params: Record<string, unknown> };
    posted.push({ method: body.method, params: body.params });
    const answer = error ? { jsonrpc: '2.0', id: body.id, error } : { jsonrpc: '2.0', id: body.id, result };
    return { ok: true, status: 200, json: async () => answer, text: async () => JSON.stringify(answer) };
  };
}

async function withNode<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
}

const identity = { actor: 'acc://myco.acme', purpose: 'audit' };
const client = () => new InfrixClient('http://node.test', identity);

test('committeeGet posts committee.get with its identifier and the disclosure context', async () => {
  const posted: Posted[] = [];
  node(posted, { committeeId: 'committee-1', motions: [], total: 0 });
  const got = await withNode(() => client().jsonrpc.committeeGet<{ committeeId: string }>({ id: 'committee-1' }));
  assert.equal(posted[0].method, 'committee.get');
  assert.equal(posted[0].params.id, 'committee-1');
  assert.equal(posted[0].params.actor, 'acc://myco.acme');
  assert.deepEqual(got, { committeeId: 'committee-1', motions: [], total: 0 });
});

test('networkChainId returns the bare string the node answers', async () => {
  const posted: Posted[] = [];
  node(posted, 'infrix-testnet-7');
  const got = await withNode(() => client().jsonrpc.networkChainId());
  assert.equal(posted[0].method, 'network.chainId');
  assert.equal(got, 'infrix-testnet-7');
});

test('extra fields travel beside the identifier', async () => {
  const posted: Posted[] = [];
  node(posted, {});
  await withNode(() => client().jsonrpc.contractSimulate({ contract: 'acc://c.acme/x', function: 'f', caller: 'acc://a.acme', gasLimit: 1000 }));
  assert.equal(posted[0].method, 'contract.simulate');
  assert.equal(posted[0].params.gasLimit, 1000);
  assert.equal(posted[0].params.caller, 'acc://a.acme');
});

test('a JSON-RPC error object rejects the call', async () => {
  const posted: Posted[] = [];
  node(posted, undefined, { code: -32000, message: 'actor is required' });
  await withNode(async () => {
    await assert.rejects(() => client().jsonrpc.policyList(), /actor is required/);
  });
});

test('every method posts the JSON-RPC method it is named for', async () => {
  const proto = RpcSubClient.prototype as unknown as Record<string, unknown>;
  const names = Object.getOwnPropertyNames(RpcSubClient.prototype).filter((n) => n !== 'constructor');
  assert.ok(names.length >= 60, `expected the full method set, found ${names.length}`);
  const rpc = client().jsonrpc as unknown as Record<string, (p: Record<string, unknown>) => Promise<unknown>>;
  const everything = {
    id: 'i', motionId: 'm', startId: 's', contract: 'c', function: 'f', caller: 'a', addr: 'x', intentId: 'n',
    planHash: 'h', goalType: 'g', actor: 'acc://myco.acme', tx_hash: 't', txHash: 't', type: 'ty', ruleId: 'r', identity: 'u',
  };
  const seen = new Set<string>();
  for (const name of names) {
    assert.equal(typeof proto[name], 'function');
    const posted: Posted[] = [];
    node(posted, {});
    await withNode(() => rpc[name](everything));
    assert.equal(posted.length, 1, `${name} must post exactly one request`);
    const method = posted[0].method;
    const camel = method.split('.').map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join('');
    assert.equal(camel, name, `${name} posted ${method}`);
    assert.ok(!seen.has(method), `${method} is posted by two methods`);
    seen.add(method);
  }
});

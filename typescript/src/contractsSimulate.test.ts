// POST /v4/contracts/{addr}/simulate through client.contracts.simulate.
//
// The node refuses a simulation that names no caller (it used to run as the
// contract calling itself) and decodes the body's `arguments` as a HEX STRING.
// The old client sent neither a caller nor a string: it posted an array into the
// hex field, so every simulation was a 400. Verified against a mocked fetch, the
// transport boundary.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient } from './index';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;
function setFetch(fn: FetchLike) {
  (globalThis as { fetch?: FetchLike }).fetch = fn;
}
function restoreFetch() {
  (globalThis as { fetch?: FetchLike }).fetch = realFetch;
}
function client() {
  return new InfrixClient('http://node.test', { actor: 'acc://myco.acme', purpose: 'preview' });
}

async function simulate(opts: { caller: string; args?: Uint8Array | string; gasLimit?: number }) {
  const c = client();
  let captured: { url?: string; method?: string; body?: Record<string, unknown> } = {};
  setFetch(async (url: unknown, init: unknown) => {
    const i = init as { method?: string; body?: string };
    captured = { url: String(url), method: i.method, body: i.body ? JSON.parse(i.body) : undefined };
    return { ok: true, status: 200, json: async () => ({ data: { success: true } }), text: async () => '{"data":{"success":true}}' };
  });
  try {
    await c.contracts.simulate('acc://sim.acme/contract', 'balanceOf', opts);
  } finally {
    restoreFetch();
  }
  return captured;
}

test('simulate posts the caller and the arguments as a hex string', async () => {
  const sent = await simulate({ caller: 'acc://alice.acme', args: new Uint8Array([0x0a, 0xff]) });
  assert.equal(sent.method, 'POST');
  assert.ok(sent.url?.includes('/v4/contracts/'), `unexpected url ${sent.url}`);
  const body = sent.body!;
  assert.equal(body.caller, 'acc://alice.acme');
  assert.equal(typeof body.arguments, 'string', 'arguments must be a hex STRING, the node cannot decode an array there');
  assert.equal(body.arguments, '0aff');
  assert.equal(body.function, 'balanceOf');
});

test('simulate normalizes a 0x-prefixed hex string and defaults to no arguments', async () => {
  assert.equal((await simulate({ caller: 'acc://a.acme', args: '0xABCD' })).body!.arguments, 'abcd');
  assert.equal((await simulate({ caller: 'acc://a.acme' })).body!.arguments, '');
});

test('simulate refuses a missing caller before any request is made', async () => {
  const c = client();
  let called = false;
  setFetch(async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
  });
  try {
    await assert.rejects(
      () => c.contracts.simulate('acc://sim.acme/contract', 'f', {} as { caller: string }),
      /caller is required/
    );
    await assert.rejects(
      () => c.contracts.simulate('acc://sim.acme/contract', 'f', { caller: '' }),
      /caller is required/
    );
  } finally {
    restoreFetch();
  }
  assert.equal(called, false, 'a simulation with no caller reached the network');
});

test('simulate refuses an array of values and non-hex strings instead of sending an undecodable body', async () => {
  const c = client();
  let called = false;
  setFetch(async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
  });
  try {
    await assert.rejects(
      () => c.contracts.simulate('acc://sim.acme/contract', 'f', { caller: 'acc://a.acme', args: [1, 2] as unknown as string }),
      /pre-encoded bytes/
    );
    await assert.rejects(
      () => c.contracts.simulate('acc://sim.acme/contract', 'f', { caller: 'acc://a.acme', args: 'zz' }),
      /valid hex/
    );
  } finally {
    restoreFetch();
  }
  assert.equal(called, false);
});

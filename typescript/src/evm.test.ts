// DX P6-5 — the governed Solidity/EVM deploy door (client.evm).
//
// deploy/call are verified against a mocked fetch: they must submit the
// governed EVM_DEPLOY / EVM_CALL intents (never a raw-tx path) with the
// bytecode/calldata normalized to bare hex, plus the auto-injected disclosure
// context from the constructor.

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
  return new InfrixClient('http://node.test', { actor: 'acc://myco.acme', purpose: 'deploy' });
}

test('evm.deploy submits a governed EVM_DEPLOY intent with normalized bytecode', async () => {
  const c = client();
  let captured: { method?: string; params?: Record<string, unknown> } = {};
  setFetch(async (_url: unknown, init: unknown) => {
    captured = JSON.parse((init as { body: string }).body);
    return { json: async () => ({ result: { intentId: 'intent-1', status: 'pending_approval' } }) };
  });
  try {
    const res = await c.evm.deploy('0x60806040', { authority: 'acc://myco.acme' });
    assert.equal(res.intentId, 'intent-1');
  } finally {
    restoreFetch();
  }
  assert.equal(captured.method, 'intent.submit');
  const p = captured.params!;
  assert.equal(p.goalType, 'EVM_DEPLOY');
  const cp = p.customParams as Record<string, unknown>;
  assert.equal(cp.authority, 'acc://myco.acme');
  assert.equal(cp.bytecode, '60806040'); // 0x stripped, lowercased
  // disclosure context auto-injected from the constructor
  assert.equal(p.actor, 'acc://myco.acme');
  assert.equal(p.purpose, 'deploy');
});

test('evm.deploy accepts a Uint8Array and hex-encodes it', async () => {
  const c = client();
  let cp: Record<string, unknown> = {};
  setFetch(async (_url: unknown, init: unknown) => {
    cp = (JSON.parse((init as { body: string }).body).params.customParams) as Record<string, unknown>;
    return { json: async () => ({ result: { intentId: 'i', status: 'ok' } }) };
  });
  try {
    await c.evm.deploy(new Uint8Array([0x60, 0x0a, 0xff]), { authority: 'acc://myco.acme' });
  } finally {
    restoreFetch();
  }
  assert.equal(cp.bytecode, '600aff');
});

test('evm.deploy requires an authority', async () => {
  const c = client();
  await assert.rejects(() => c.evm.deploy('60806040', { authority: '' }), /authority/);
});

test('evm.call submits a governed EVM_CALL intent with contract + calldata', async () => {
  const c = client();
  let captured: { method?: string; params?: Record<string, unknown> } = {};
  setFetch(async (_url: unknown, init: unknown) => {
    captured = JSON.parse((init as { body: string }).body);
    return { json: async () => ({ result: { intentId: 'intent-2', status: 'completed' } }) };
  });
  try {
    const res = await c.evm.call('acc://myco.acme/evm-abc', '0x70A08231');
    assert.equal(res.intentId, 'intent-2');
  } finally {
    restoreFetch();
  }
  assert.equal(captured.method, 'intent.submit');
  const p = captured.params!;
  assert.equal(p.goalType, 'EVM_CALL');
  const cp = p.customParams as Record<string, unknown>;
  assert.equal(cp.contract, 'acc://myco.acme/evm-abc');
  assert.equal(cp.calldata, '70a08231'); // 0x stripped, lowercased
});

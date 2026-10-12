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

async function deployBody(
  bytecode: string,
  opts: { authority: string; creation?: boolean; constructorArgs?: string | Uint8Array },
): Promise<{ calls: number; cp: Record<string, unknown> }> {
  const c = client();
  let calls = 0;
  let cp: Record<string, unknown> = {};
  setFetch(async (_url: unknown, init: unknown) => {
    calls++;
    cp = (JSON.parse((init as { body: string }).body).params.customParams) as Record<string, unknown>;
    return { json: async () => ({ result: { intentId: 'i', status: 'ok' } }) };
  });
  try {
    await c.evm.deploy(bytecode, opts);
  } finally {
    restoreFetch();
  }
  return { calls, cp };
}

test('evm.deploy states creation mode and the constructor-args tail on the wire', async () => {
  // Default: the verbatim-runtime door, stated by omission.
  const plain = await deployBody('0x60806040', { authority: 'acc://myco.acme' });
  assert.deepEqual(plain.cp, { authority: 'acc://myco.acme', bytecode: '60806040' });

  // creation: true is a JSON boolean, never a string.
  const created = await deployBody('0x60806040', { authority: 'acc://myco.acme', creation: true });
  assert.deepEqual(created.cp, { authority: 'acc://myco.acme', bytecode: '60806040', creation: true });
  assert.strictEqual(created.cp.creation, true);

  // constructorArgs ride only with creation, normalized to bare lowercase hex.
  const withArgs = await deployBody('0x60806040', {
    authority: 'acc://myco.acme',
    creation: true,
    constructorArgs: '0x00AB',
  });
  assert.deepEqual(withArgs.cp, {
    authority: 'acc://myco.acme',
    bytecode: '60806040',
    creation: true,
    constructorArgs: '00ab',
  });
  const fromBytes = await deployBody('60806040', {
    authority: 'acc://myco.acme',
    creation: true,
    constructorArgs: new Uint8Array([0x00, 0x64]),
  });
  assert.equal(fromBytes.cp.constructorArgs, '0064');

  // A stated false is sent as false.
  const stated = await deployBody('60806040', { authority: 'acc://myco.acme', creation: false });
  assert.strictEqual(stated.cp.creation, false);
});

test('evm.deploy refuses constructorArgs without creation, and a non-boolean creation, before any request', async () => {
  for (const opts of [
    { authority: 'acc://myco.acme', constructorArgs: '0x64' },
    { authority: 'acc://myco.acme', creation: false, constructorArgs: '0x64' },
  ]) {
    let calls = 0;
    setFetch(async () => {
      calls++;
      return { json: async () => ({ result: {} }) };
    });
    try {
      await assert.rejects(() => client().evm.deploy('60806040', opts), /constructorArgs.*creation/);
    } finally {
      restoreFetch();
    }
    assert.equal(calls, 0, 'a refused deploy must not reach the node');
  }
  let calls = 0;
  setFetch(async () => {
    calls++;
    return { json: async () => ({ result: {} }) };
  });
  try {
    for (const bad of ['true', 1, 'yes', null]) {
      await assert.rejects(
        () => client().evm.deploy('60806040', { authority: 'acc://myco.acme', creation: bad as unknown as boolean }),
        /creation must be a boolean/,
      );
    }
  } finally {
    restoreFetch();
  }
  assert.equal(calls, 0, 'a refused deploy must not reach the node');
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

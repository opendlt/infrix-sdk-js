// The SDK's fee escrow surface (core part 28bm row 2): each method POSTs exactly the body its route declares to
// /v4/fee-escrow/<action> (the governed fee_escrow.<action> door) and returns the door's answer, refusing a malformed
// request before it is sent and an answer that is missing a declared member.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient } from './index';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;

interface Seen {
  method?: string;
  path: string;
  body?: Record<string, unknown>;
}

async function against<T>(data: unknown, fn: (c: InfrixClient) => Promise<T>): Promise<{ seen: Seen; result: T }> {
  const seen: Seen = { path: '' };
  (globalThis as { fetch?: FetchLike }).fetch = async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as { method?: string; body?: string };
    seen.method = i.method;
    seen.path = new URL(String(url)).pathname;
    seen.body = i.body ? JSON.parse(i.body) : undefined;
    const payload = { data };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
  };
  try {
    const result = await fn(new InfrixClient('http://node.test', { actor: 'acc://payer.acme', purpose: 'operational' }));
    return { seen, result };
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
}

const balance = { payer: 'acc://payer.acme', fundingAccount: 'acc://payer.acme/tokens', deposited: 100, reserved: 0, debited: 0, withdrawn: 0, available: 100 };
const answer = (action: string, extra: Record<string, unknown> = {}) => ({
  action, payer: 'acc://payer.acme', balance, entry: null, reconciliation: null, intentId: 'intent-1', governed: true, ...extra,
});

test('feeEscrow.fund POSTs the actor, the L0 transfer and its source account, and returns the deposit', async () => {
  const entry = { id: 'd1', kind: 'deposit', payer: 'acc://payer.acme', amount: 100, account: 'acc://payer.acme/tokens', l0TxId: 'tx', intentId: 'intent-1' };
  const r = await against(answer('fund', { entry }), (c) =>
    c.feeEscrow.fund({ actor: 'acc://payer.acme', l0TxHash: 'ab'.repeat(32), from: 'acc://payer.acme/tokens' })
  );
  assert.equal(r.seen.method, 'POST');
  assert.equal(r.seen.path, '/v4/fee-escrow/fund');
  assert.deepEqual(r.seen.body, { actor: 'acc://payer.acme', l0TxHash: 'ab'.repeat(32), from: 'acc://payer.acme/tokens' });
  assert.equal(r.result.entry?.amount, 100);
  assert.equal(r.result.balance.available, 100);
  assert.equal(r.result.intentId, 'intent-1');
});

test('feeEscrow.withdraw sends an amount only when one is asked', async () => {
  const all = await against(answer('withdraw'), (c) => c.feeEscrow.withdraw({ actor: 'acc://payer.acme' }));
  assert.equal(all.seen.path, '/v4/fee-escrow/withdraw');
  assert.deepEqual(all.seen.body, { actor: 'acc://payer.acme' });
  const part = await against(answer('withdraw'), (c) => c.feeEscrow.withdraw({ actor: 'acc://payer.acme', amount: 40 }));
  assert.deepEqual(part.seen.body, { actor: 'acc://payer.acme', amount: 40 });
});

test('feeEscrow.balance and reconcile POST the actor alone to their own routes', async () => {
  const b = await against(answer('balance'), (c) => c.feeEscrow.balance({ actor: 'acc://payer.acme' }));
  assert.equal(b.seen.path, '/v4/fee-escrow/balance');
  assert.deepEqual(b.seen.body, { actor: 'acc://payer.acme' });
  const rec = { escrowAccount: 'acc://node.acme/escrow', reconciled: true, l0Balance: 100, expected: 100, purchasesChecked: 0 };
  const r = await against(answer('reconcile', { reconciliation: rec }), (c) => c.feeEscrow.reconcile({ actor: 'acc://payer.acme' }));
  assert.equal(r.seen.path, '/v4/fee-escrow/reconcile');
  assert.equal(r.result.reconciliation?.reconciled, true);
});

test('feeEscrow refuses a malformed request before sending it, and an answer missing a declared member', async () => {
  await assert.rejects(() => against(answer('fund'), (c) => c.feeEscrow.fund({ actor: '', l0TxHash: 'ab', from: 'x' })), /actor is required/);
  await assert.rejects(() => against(answer('fund'), (c) => c.feeEscrow.fund({ actor: 'acc://payer.acme', l0TxHash: '', from: 'x' })), /l0TxHash and from/);
  await assert.rejects(() => against(answer('withdraw'), (c) => c.feeEscrow.withdraw({ actor: 'acc://payer.acme', amount: -1 })), /amount/);
  await assert.rejects(() => against(answer('withdraw'), (c) => c.feeEscrow.withdraw({ actor: 'acc://payer.acme', amount: 1.5 })), /amount/);
  const { intentId: _omit, ...missing } = answer('balance');
  await assert.rejects(() => against(missing, (c) => c.feeEscrow.balance({ actor: 'acc://payer.acme' })), /carries no intentId/);
});

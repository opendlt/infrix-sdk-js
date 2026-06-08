/**
 * Wallet balance/credits honesty tests (Priority 02).
 *
 * Balance and credits must NEVER silently report zero on a failed query and
 * credits must never return a hard-coded zero: balance()/credits() throw when
 * unavailable, *Status() reports verified=false + a reason, try*() returns null.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InfrixWallet } from './wallet';

type FetchResponse = { json: () => Promise<unknown> };
function stubFetch(handler: (body: { method: string; params: unknown }) => unknown): () => void {
  const g = globalThis as { fetch?: unknown };
  const prev = g.fetch;
  g.fetch = async (_url: string, init: { body: string }): Promise<FetchResponse> => {
    const req = JSON.parse(init.body) as { method: string; params: unknown };
    const out = handler(req);
    if (out instanceof Error) throw out;
    return { json: async () => ({ jsonrpc: '2.0', id: 1, result: out }) };
  };
  return () => {
    g.fetch = prev;
  };
}

function wallet(): InfrixWallet {
  return new InfrixWallet('acc://alice.acme', { rpcUrl: 'http://node.test/rpc' });
}

test('balance() returns the amount when the node responds', async () => {
  const restore = stubFetch((req) => (req.method === 'account.balance' ? { balance: '1000' } : {}));
  try {
    assert.equal(await wallet().balance(), 1000n);
  } finally {
    restore();
  }
});

test('balance() THROWS on a failed query (never silent zero)', async () => {
  const restore = stubFetch(() => new Error('node unreachable'));
  try {
    await assert.rejects(() => wallet().balance(), /balance unavailable.*node unreachable/);
  } finally {
    restore();
  }
});

test('balanceStatus() reports verified=false + reason on failure', async () => {
  const restore = stubFetch(() => new Error('boom'));
  try {
    const s = await wallet().balanceStatus();
    assert.equal(s.verified, false);
    assert.equal(s.amount, 0n);
    assert.match(s.unavailableReason ?? '', /boom/);
  } finally {
    restore();
  }
});

test('tryBalance() returns null on failure, amount on success', async () => {
  let fail = true;
  const restore = stubFetch(() => (fail ? new Error('x') : { balance: 5 }));
  try {
    assert.equal(await wallet().tryBalance(), null);
    fail = false;
    assert.equal(await wallet().tryBalance(), 5n);
  } finally {
    restore();
  }
});

test('credits() is never a hard-coded zero — it queries a real source', async () => {
  const restore = stubFetch((req) => (req.method === 'account.credits' ? { credits: '42' } : {}));
  try {
    assert.equal(await wallet().credits(), 42n);
  } finally {
    restore();
  }
});

test('credits() accepts a creditBalance field too', async () => {
  const restore = stubFetch((req) => (req.method === 'account.credits' ? { creditBalance: 7 } : {}));
  try {
    assert.equal(await wallet().credits(), 7n);
  } finally {
    restore();
  }
});

test('credits() THROWS when unavailable (no silent/hard-coded zero)', async () => {
  const restore = stubFetch(() => new Error('credits method not supported'));
  try {
    await assert.rejects(() => wallet().credits(), /credits unavailable/);
  } finally {
    restore();
  }
});

test('a response missing the amount field is unavailable, not zero', async () => {
  const restore = stubFetch(() => ({ somethingElse: 1 }));
  try {
    const s = await wallet().balanceStatus();
    assert.equal(s.verified, false);
    assert.match(s.unavailableReason ?? '', /no balance/);
  } finally {
    restore();
  }
});

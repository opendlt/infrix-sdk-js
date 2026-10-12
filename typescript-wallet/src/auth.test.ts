// A node that enforces api.auth answers 401 to every wallet call without a bearer token. The wallet's
// rpc() sent no Authorization header and WalletOptions had no token. Over a mocked fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixWallet } from './wallet';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;
const TOKEN = 'tok-FIXTURE-9f3a1c';

function node(seen: Array<string | undefined>): void {
  (globalThis as { fetch?: FetchLike }).fetch = async (_url: unknown, init: unknown) => {
    const headers = ((init as { headers?: Record<string, string> }).headers ?? {}) as Record<string, string>;
    seen.push(headers['Authorization']);
    if (headers['Authorization'] !== `Bearer ${TOKEN}`) return { ok: false, status: 401, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result: { granted: true, hasRole: true } }) };
  };
}

async function within<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
}

test('the wallet presents its bearer token', async () => {
  const seen: Array<string | undefined> = [];
  node(seen);
  const wallet = new InfrixWallet('acc://myco.acme', { rpcUrl: 'http://node.test/rpc', token: TOKEN });
  assert.equal(await within(() => wallet.hasRole('admin')), true);
  assert.equal(seen[0], `Bearer ${TOKEN}`);
});

test('a wallet with no token sends none and gets a 401 it can read', async () => {
  const seen: Array<string | undefined> = [];
  node(seen);
  const wallet = new InfrixWallet('acc://myco.acme', { rpcUrl: 'http://node.test/rpc' });
  await within(() => assert.rejects(wallet.hasRole('admin'), /NODE_AUTH_REQUIRED.*sent no token/));
  assert.equal(seen[0], undefined);
});

test('a wrong token is called not accepted, and the token is not on the wallet to be shown', async () => {
  const seen: Array<string | undefined> = [];
  node(seen);
  const wallet = new InfrixWallet('acc://myco.acme', { rpcUrl: 'http://node.test/rpc', token: 'tok-WRONG-0000' });
  await within(() => assert.rejects(wallet.hasRole('admin'), (e: unknown) => /not accepted/.test((e as Error).message) && !(e as Error).message.includes('tok-WRONG-0000')));
  assert.ok(!JSON.stringify(wallet).includes('tok-WRONG-0000'), 'JSON.stringify(wallet) exposes the token');
  assert.ok(!Object.getOwnPropertyNames(wallet).some((k) => /token/i.test(k)), 'a token property exists');
});

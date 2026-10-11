// A node that enforces api.auth answers 401 to every governed request without a bearer token. The
// SDK's rpc() and rest() sent no Authorization header and InfrixClientOptions had no token, so
// neither could reach such a node: policies.conflicts() and objects.types() threw an
// InfrixRPCError with an empty message. These hold both transports to a node that behaves like that
// one, over a mocked fetch (the transport boundary).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient, InfrixUserError } from './index';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;
const TOKEN = 'tok-FIXTURE-9f3a1c';

interface Seen {
  url: string;
  auth: string | undefined;
}

/** A node that serves only a request carrying `Authorization: Bearer <TOKEN>`. */
function bearerNode(seen: Seen[]): void {
  (globalThis as { fetch?: FetchLike }).fetch = async (url: unknown, init: unknown) => {
    const headers = ((init as { headers?: Record<string, string> } | undefined)?.headers ?? {}) as Record<string, string>;
    seen.push({ url: String(url), auth: headers['Authorization'] });
    if (headers['Authorization'] !== `Bearer ${TOKEN}`) {
      return { ok: false, status: 401, json: async () => ({}), text: async () => '' };
    }
    const body = { jsonrpc: '2.0', id: 1, result: { types: ['intent'], total: 1, detail: 'd' } };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
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

test('rpc() presents the configured bearer token', async () => {
  const seen: Seen[] = [];
  bearerNode(seen);
  const got = await withNode(() => new InfrixClient('http://node.test', { ...identity, token: TOKEN }).objects.types());
  assert.deepEqual(got.types, ['intent']);
  assert.equal(seen[0].auth, `Bearer ${TOKEN}`);
});

test('rest() presents the configured bearer token', async () => {
  const seen: Seen[] = [];
  bearerNode(seen);
  const client = new InfrixClient('http://node.test', { ...identity, token: TOKEN });
  // rest() is the transport behind the /v4/* sub-clients
  const got = await withNode(() => (client as unknown as { rest: (m: string, p: string) => Promise<unknown> }).rest('GET', '/v4/object-types'));
  assert.ok(got);
  assert.equal(seen[0].auth, `Bearer ${TOKEN}`);
  assert.ok(seen[0].url.endsWith('/v4/object-types'));
});

test('a client given no token sends no Authorization header and gets a typed NODE_AUTH_REQUIRED, not an empty error', async () => {
  const seen: Seen[] = [];
  bearerNode(seen);
  const client = new InfrixClient('http://node.test', identity);
  await withNode(async () => {
    await assert.rejects(client.objects.types(), (e: unknown) => {
      assert.ok(e instanceof InfrixUserError, `want InfrixUserError, got ${(e as Error)?.constructor?.name}`);
      assert.equal(e.code, 'NODE_AUTH_REQUIRED');
      assert.match(e.message, /sent no token/);
      assert.ok(e.fixes.length > 0 && e.docs, 'the error carries its fix and docs link, like the CLI card');
      return true;
    });
    await assert.rejects(
      (client as unknown as { rest: (m: string, p: string) => Promise<unknown> }).rest('GET', '/v4/object-types'),
      (e: unknown) => e instanceof InfrixUserError && e.code === 'NODE_AUTH_REQUIRED',
    );
  });
  assert.equal(seen[0].auth, undefined, 'no Authorization header may be invented');
});

test('a wrong token says it was not accepted and the token is nowhere in the error or in telemetry', async () => {
  const seen: Seen[] = [];
  bearerNode(seen);
  const wrong = 'tok-WRONG-0000';
  const events: unknown[] = [];
  const client = new InfrixClient('http://node.test', {
    ...identity,
    token: wrong,
    telemetry: { onEvent: (e: unknown) => events.push(e) } as never,
  });
  await withNode(async () => {
    await assert.rejects(client.objects.types(), (e: unknown) => {
      const err = e as InfrixUserError;
      assert.equal(err.code, 'NODE_AUTH_REQUIRED');
      assert.match(err.message, /not accepted/);
      assert.ok(!JSON.stringify(err).includes(wrong) && !String(err.stack).includes(wrong), 'the token is in the error');
      return true;
    });
  });
  assert.ok(!JSON.stringify(events).includes(wrong), 'the token is in a telemetry event');
  assert.ok(events.length > 0, 'the failure was reported to telemetry');
  assert.equal(seen[0].auth, `Bearer ${wrong}`);
});

test('a blank token is no token', async () => {
  const seen: Seen[] = [];
  bearerNode(seen);
  const client = new InfrixClient('http://node.test', { ...identity, token: '   ' });
  await withNode(() =>
    assert.rejects(client.objects.types(), (e: unknown) => e instanceof InfrixUserError && /sent no token/.test(e.message)),
  );
  assert.equal(seen[0].auth, undefined);
});

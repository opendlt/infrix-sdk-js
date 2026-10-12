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

// ---- the sites that were still tokenless, the typed refusal, and keeping the token out of sight ----

import { withReadiness } from './flows';
import { webSocketAuthPlan, nodeRequestRefused } from './index';

test('withReadiness presents the token and the disclosure context, and types a 401', async () => {
  const seen: Array<Record<string, string> | undefined> = [];
  const node = async (_url: string, init?: { headers?: Record<string, string> }) => {
    seen.push(init?.headers);
    if (init?.headers?.['Authorization'] !== `Bearer ${TOKEN}`) return { ok: false, status: 401, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ data: { substrates: [], profileMet: true } }) };
  };
  const ok = withReadiness('http://node.test', node, { token: TOKEN, actor: 'acc://myco.acme', purpose: 'audit' });
  assert.equal(await ok.readiness.meets('public'), true);
  assert.equal(seen[0]?.['Authorization'], `Bearer ${TOKEN}`);
  assert.equal(seen[0]?.['X-Actor'], 'acc://myco.acme');
  assert.equal(seen[0]?.['X-Purpose'], 'audit');

  const none = withReadiness('http://node.test', node);
  await assert.rejects(none.readiness.fetch(), (e: unknown) => e instanceof InfrixUserError && e.code === 'NODE_AUTH_REQUIRED');
  assert.equal(seen[1]?.['Authorization'], undefined);
});

test('a WebSocket authenticates with a header from Node and says it cannot from a browser', () => {
  assert.deepEqual(webSocketAuthPlan(TOKEN, true), { headers: { Authorization: `Bearer ${TOKEN}` } });
  assert.deepEqual(webSocketAuthPlan(undefined, true), {});
  assert.deepEqual(webSocketAuthPlan(undefined, false), {});
  assert.throws(
    () => webSocketAuthPlan(TOKEN, false),
    (e: unknown) => e instanceof InfrixUserError && e.code === 'NODE_AUTH_REQUIRED' && /browser WebSocket/.test(e.message) && !e.message.includes(TOKEN),
  );
});

test('the token is not a property: stringify, inspect and Object.keys cannot show it', async () => {
  const { inspect } = await import('node:util');
  const client = new InfrixClient('http://node.test', { ...identity, token: TOKEN });
  assert.ok(!JSON.stringify(client).includes(TOKEN), 'JSON.stringify exposes the token');
  assert.ok(!inspect(client, { depth: 6, showHidden: true }).includes(TOKEN), 'util.inspect exposes the token');
  assert.ok(!Object.keys(client).some((k) => /token/i.test(k)), 'an enumerable token property exists');
  assert.ok(!Object.getOwnPropertyNames(client).some((k) => /token/i.test(k)), 'a token property exists');
  // ...and it still works
  const seen: Seen[] = [];
  bearerNode(seen);
  await withNode(() => client.objects.types());
  assert.equal(seen[0].auth, `Bearer ${TOKEN}`);
});

test('a 4xx refusal is a typed NODE_REQUEST_REFUSED carrying the node\'s own code, on both transports', async () => {
  // JSON-RPC: the bridge answers HTTP 200 with {"error":{"code":400,...}}
  (globalThis as { fetch?: FetchLike }).fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: 400, message: 'scope "parent:" names nothing after its prefix' } }),
    text: async () => '',
  });
  const client = new InfrixClient('http://node.test', identity);
  await withNode(async () => {
    await assert.rejects(client.objects.types(), (e: unknown) => {
      assert.ok(e instanceof InfrixUserError);
      assert.equal(e.code, 'NODE_REQUEST_REFUSED');
      assert.match(e.message, /names nothing after its prefix/);
      assert.equal(e.supportData.httpStatus, '400');
      return true;
    });
  });
  // every JSON-RPC 4xx code is a refusal; 401 is the authentication gate
  for (const code of [403, 404, 422, 499]) {
    (globalThis as { fetch?: FetchLike }).fetch = async () => ({
      ok: true, status: 200, text: async () => '',
      json: async () => ({ jsonrpc: '2.0', id: 1, error: { code, message: 'm' } }),
    });
    await withNode(() =>
      assert.rejects(client.objects.types(), (e: unknown) => e instanceof InfrixUserError && e.code === 'NODE_REQUEST_REFUSED' && e.supportData.httpStatus === String(code)),
    );
  }
  (globalThis as { fetch?: FetchLike }).fetch = async () => ({
    ok: true, status: 200, text: async () => '',
    json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: 401, message: 'unauthorized' } }),
  });
  await withNode(() => assert.rejects(client.objects.types(), (e: unknown) => e instanceof InfrixUserError && e.code === 'NODE_AUTH_REQUIRED'));
  (globalThis as { fetch?: FetchLike }).fetch = async () => ({
    ok: true, status: 200, text: async () => '',
    json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'invalid params' } }),
  });
  await withNode(() => assert.rejects(client.objects.types(), (e: unknown) => !(e instanceof InfrixUserError) && /invalid params/.test((e as Error).message)));
  // REST with the node's own STRING code: already typed, keeping the node's code (existing behaviour)
  (globalThis as { fetch?: FetchLike }).fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: { code: 'BAD_REQUEST', message: 'unrecognised scope "x"' }, meta: {} }),
    text: async () => '',
  });
  await withNode(async () => {
    await assert.rejects(
      (client as unknown as { rest: (m: string, p: string) => Promise<unknown> }).rest('GET', '/v4/policies/conflicts?scope=x'),
      (e: unknown) => e instanceof InfrixUserError && e.code === 'BAD_REQUEST' && /unrecognised scope/.test(e.message),
    );
  });
  // REST with a NUMERIC code and an HTTP 4xx: the node's refusal, typed
  (globalThis as { fetch?: FetchLike }).fetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({ error: { code: 404, message: 'no such thing' }, meta: {} }),
    text: async () => '',
  });
  await withNode(async () => {
    await assert.rejects(
      (client as unknown as { rest: (m: string, p: string) => Promise<unknown> }).rest('GET', '/v4/x'),
      (e: unknown) => {
        assert.ok(e instanceof InfrixUserError);
        assert.equal(e.code, 'NODE_REQUEST_REFUSED');
        assert.equal(e.supportData.httpStatus, '404');
        assert.match(e.message, /no such thing/);
        return true;
      },
    );
  });
  // a 5xx is not a refusal: it keeps the legacy error
  (globalThis as { fetch?: FetchLike }).fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: { code: -32603, message: 'boom' } }),
    text: async () => '',
  });
  await withNode(async () => {
    await assert.rejects(
      (client as unknown as { rest: (m: string, p: string) => Promise<unknown> }).rest('GET', '/v4/x'),
      (e: unknown) => !(e instanceof InfrixUserError) && /boom/.test((e as Error).message),
    );
  });
  assert.equal(nodeRequestRefused(404, undefined, '').message, 'The node answered 404.');
});

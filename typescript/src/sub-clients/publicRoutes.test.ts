// The three routes a node answers without a credential are read WITHOUT one. The mock node records the
// headers each request carried, and the tests hold both halves of a client: the request is the route's
// (path, GET, no Authorization, no disclosure context) and the result is a function of the answer,
// refusing an answer that lacks what the route returns.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PublicRoutesClient, PublicRouteError } from './publicRoutes';

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function node(status: number, body: unknown, seen: Seen[] = []) {
  const fetchImpl = async (url: string, init: { method: string; headers: Record<string, string> }) => {
    seen.push({ url, method: init.method, headers: init.headers });
    return { status, json: async () => body };
  };
  return { seen, client: new PublicRoutesClient('http://node.test:8443/v4/jsonrpc', fetchImpl) };
}

function assertAnonymous(s: Seen, path: string) {
  assert.equal(s.method, 'GET');
  assert.equal(s.url, `http://node.test:8443${path}`);
  for (const h of Object.keys(s.headers)) {
    assert.ok(!/^(authorization|x-actor|x-purpose|x-workflow-instance)$/i.test(h), `a public route was read with ${h}`);
  }
}

test('health, ready and openapi GET their routes with no credential and no disclosure context', async () => {
  const h = node(200, { data: { apiVersion: 'v4', status: 'ok' } });
  assert.deepEqual(await h.client.health(), { apiVersion: 'v4', status: 'ok' });
  assertAnonymous(h.seen[0], '/v4/health');

  const r = node(200, { data: { apiVersion: 'v4', ready: true } });
  assert.equal((await r.client.ready()).ready, true);
  assertAnonymous(r.seen[0], '/v4/ready');

  const o = node(200, { openapi: '3.1.0', info: { title: 'Infrix', version: '4' }, paths: { '/v4/a': {} }, components: {} });
  const doc = await o.client.openapi();
  assert.equal(doc.openapi, '3.1.0');
  assertAnonymous(o.seen[0], '/v4/openapi.json');
});

test('a node that is not ready is RETURNED with what it lacks, not thrown', async () => {
  const r = node(503, { data: { apiVersion: 'v4', ready: false, missing: ['anchorL0Client'] } });
  const got = await r.client.ready();
  assert.equal(got.ready, false);
  assert.deepEqual(got.missing, ['anchorL0Client']);
});

test('an answer that lacks what the route returns is refused, naming the key', async () => {
  await assert.rejects(node(200, { data: { apiVersion: 'v4' } }).client.health(), /no `status`/);
  await assert.rejects(node(200, { data: { status: 'ok' } }).client.health(), /no `apiVersion`/);
  await assert.rejects(node(200, { data: { apiVersion: 'v4' } }).client.ready(), /no `ready`/);
  await assert.rejects(node(200, { data: { apiVersion: 'v4', ready: 'yes' } }).client.ready(), /not a boolean/);
  await assert.rejects(node(503, { data: { apiVersion: 'v4', ready: true } }).client.ready(), /503 yet says it is ready/);
  await assert.rejects(node(200, { openapi: '3.1.0', info: {}, components: {} }).client.openapi(), /no `paths`/);
  await assert.rejects(node(200, {}).client.health(), PublicRouteError);
});

test('a 401 from a public route is an error: the node has started to require a credential', async () => {
  await assert.rejects(node(401, { error: { code: 'UNAUTHORIZED' } }).client.health(), (e: unknown) => {
    assert.ok(e instanceof PublicRouteError);
    assert.equal((e as PublicRouteError).status, 401);
    return true;
  });
  await assert.rejects(node(401, {}).client.openapi(), /answered 401/);
});

test('the document is served as itself: an enveloped one is refused', async () => {
  await assert.rejects(node(200, { data: { openapi: '3.1.0' } }).client.openapi(), /wrapped in an envelope/);
});

test('a node URL that is not http(s) is refused', () => {
  assert.throws(() => new PublicRoutesClient('ftp://node.test'), /must use http or https/);
});

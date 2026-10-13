// The generated route reads (sub-clients/gen, from infrix-core scripts/gen-route-clients.py) held to the
// table they were generated from: each method GETs its route (path values escaped, only the query
// parameters the route declares, the disclosure context as headers), returns every member the route
// declares, refuses an answer that lacks one by name, and refuses a value its declared kind cannot take
// before any request is made.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient } from './index';
import { GENERATED_ROUTES, genCheckValue, genDeclared, genPathValue, genQuery } from './sub-clients';
import type { GeneratedRouteInfo } from './sub-clients';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;

interface Seen {
  count: number;
  method?: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

type Reader = (...args: unknown[]) => Promise<Record<string, unknown>>;

function client() {
  return new InfrixClient('http://node.test', { actor: 'acc://reader.acme', purpose: 'audit' });
}

/** Run `fn` against a node that answers every request with `data` and report what it was sent. */
async function against<T>(data: unknown, fn: (c: InfrixClient) => Promise<T>): Promise<{ seen: Seen; result: T }> {
  const seen: Seen = { count: 0, path: '', query: {}, headers: {} };
  (globalThis as { fetch?: FetchLike }).fetch = async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as { method?: string; headers?: Record<string, string>; body?: string };
    const u = new URL(String(url));
    seen.count += 1;
    seen.method = i.method;
    seen.path = u.pathname;
    seen.query = Object.fromEntries(u.searchParams.entries());
    seen.headers = i.headers ?? {};
    seen.body = i.body ? (JSON.parse(i.body) as Record<string, unknown>) : undefined;
    const payload = { data };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
  };
  try {
    const result = await fn(client());
    return { seen, result };
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
}

function familyKey(family: string): string {
  return family.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

function sample(kind: string, allowed: readonly string[], name: string): string | number {
  switch (kind) {
    case 'int':
      return 7;
    case 'enum':
      return allowed[0];
    case 'timestamp':
      return '2026-01-02T03:04:05Z';
    case 'json':
      return '{}';
    default:
      return `sample-${name}`;
  }
}

function reader(c: InfrixClient, info: GeneratedRouteInfo): Reader {
  const family = (c.routes as unknown as Record<string, Record<string, Reader>>)[familyKey(info.family)];
  assert.ok(family, `client.routes has no ${info.family}`);
  const fn = family[info.method];
  assert.equal(typeof fn, 'function', `${info.route}: no method ${info.method}`);
  return fn.bind(family);
}

function pathArgs(info: GeneratedRouteInfo): Array<string | number> {
  return info.pathValues.map((p) => sample(p.kind, p.allowed, p.name));
}

function bodyOf(info: GeneratedRouteInfo): Record<string, string> {
  return Object.fromEntries(info.bodyFields.map((f) => [f.name, `body-${f.name}`]));
}

function callArgs(info: GeneratedRouteInfo, extraBody: Record<string, unknown> = {}): unknown[] {
  const args: unknown[] = [...pathArgs(info)];
  if (info.route.startsWith('POST ')) {
    args.push({ ...bodyOf(info), ...extraBody });
  }
  if (info.query.length > 0) {
    args.push(queryOpts(info));
  }
  return args;
}

function queryOpts(info: GeneratedRouteInfo): Record<string, string | number> {
  return Object.fromEntries(info.query.map((q) => [q.name, sample(q.kind, q.allowed, q.name)]));
}

function expectedPath(info: GeneratedRouteInfo): string {
  return info.path.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const p = info.pathValues.find((v) => v.name === name)!;
    return encodeURIComponent(String(sample(p.kind, p.allowed, p.name)));
  });
}

function fullAnswer(info: GeneratedRouteInfo): Record<string, unknown> {
  return Object.fromEntries(info.members.map((m) => [m, `value-of-${m}`]));
}

test('the generated table is non-trivial and names every route and method once', () => {
  assert.ok(GENERATED_ROUTES.length > 0);
  assert.equal(new Set(GENERATED_ROUTES.map((r) => r.route)).size, GENERATED_ROUTES.length);
  assert.equal(new Set(GENERATED_ROUTES.map((r) => `${r.family}.${r.method}`)).size, GENERATED_ROUTES.length);
  for (const r of GENERATED_ROUTES) {
    assert.ok(r.route.startsWith('GET /v4/') || r.route.startsWith('POST /v4/'), r.route);
    assert.equal(r.route.startsWith('POST '), r.bodyFields.length > 0, `${r.route} body members`);
    assert.ok(r.members.length > 0, `${r.route} declares no member`);
  }
});

test('every generated read GETs its route with only the declared parameters and returns every declared member', async () => {
  for (const info of GENERATED_ROUTES) {
    const { seen, result } = await against(fullAnswer(info), (c) => reader(c, info)(...callArgs(info)));
    assert.equal(seen.method, info.route.split(' ')[0], info.route);
    if (info.route.startsWith('POST ')) {
      assert.deepEqual(seen.body, bodyOf(info), `${info.route} body`);
    }
    assert.equal(seen.path, expectedPath(info), info.route);
    const want = Object.fromEntries(info.query.map((q) => [q.name, String(sample(q.kind, q.allowed, q.name))]));
    assert.deepEqual(seen.query, want, `${info.route} query`);
    assert.equal(seen.headers['X-Actor'], 'acc://reader.acme', `${info.route} actor`);
    for (const m of info.members) {
      assert.equal(result[m], `value-of-${m}`, `${info.route} ${m}`);
    }
    assert.deepEqual(Object.keys(result).sort(), [...info.members].sort(), `${info.route} returns only the declared members`);
  }
});

test('a read sends no query parameter the caller did not give', async () => {
  const info = GENERATED_ROUTES.find((r) => r.query.length > 0)!;
  const { seen } = await against(fullAnswer(info), (c) => reader(c, info)(...pathArgs(info)));
  assert.deepEqual(seen.query, {}, info.route);
});

test('an answer that lacks a declared member is refused, naming it', async () => {
  for (const info of GENERATED_ROUTES) {
    for (const member of info.members) {
      const answer = fullAnswer(info);
      delete answer[member];
      await assert.rejects(
        () => against(answer, (c) => reader(c, info)(...callArgs(info).slice(0, pathArgs(info).length + (info.route.startsWith('POST ') ? 1 : 0)))),
        (err: Error) => err.message.includes(info.route) && err.message.includes(member),
        `${info.route} accepted an answer without ${member}`
      );
    }
  }
});

test('an explicit null is an answer, not a missing member', async () => {
  const info = GENERATED_ROUTES[0];
  const answer = fullAnswer(info);
  answer[info.members[0]] = null;
  const { result } = await against(answer, (c) => reader(c, info)(...pathArgs(info)));
  assert.equal(result[info.members[0]], null);
});

test('a value the declared kind cannot take is refused before any request', async () => {
  const withInt = GENERATED_ROUTES.find((r) => r.query.some((q) => q.kind === 'int'))!;
  const intName = withInt.query.find((q) => q.kind === 'int')!.name;
  await assert.rejects(
    () => against(fullAnswer(withInt), (c) => reader(c, withInt)(...pathArgs(withInt), { [intName]: 1.5 })),
    /must be an integer/
  );
  const withEnum = GENERATED_ROUTES.find((r) => r.query.some((q) => q.kind === 'enum'))!;
  const enumName = withEnum.query.find((q) => q.kind === 'enum')!.name;
  await assert.rejects(
    () => against(fullAnswer(withEnum), (c) => reader(c, withEnum)(...pathArgs(withEnum), { [enumName]: 'not-an-accepted-value' })),
    /is not one of/
  );
  const withPath = GENERATED_ROUTES.find((r) => r.pathValues.length > 0)!;
  const args = pathArgs(withPath);
  args[0] = '  ';
  const seen: Seen[] = [];
  await assert.rejects(async () => {
    const r = await against(fullAnswer(withPath), (c) => reader(c, withPath)(...args));
    seen.push(r.seen);
  }, /non-empty string/);
  assert.equal(seen.length, 0);
});

test('the runtime refuses what each declared kind cannot take and sends what it can', () => {
  assert.throws(() => genCheckValue('x', 'yesterday', 'timestamp'), /RFC 3339/);
  assert.equal(genCheckValue('x', '2026-01-02T03:04:05+00:00', 'timestamp'), '2026-01-02T03:04:05+00:00');
  assert.throws(() => genCheckValue('x', '{not json', 'json'), /not valid JSON/);
  assert.equal(genCheckValue('x', '{"a":1}', 'json'), '{"a":1}');
  assert.throws(() => genCheckValue('x', '7', 'int'), /must be an integer/);
  assert.throws(() => genCheckValue('x', 2.5, 'int'), /must be an integer/);
  assert.equal(genCheckValue('x', -3, 'int'), '-3');
  assert.throws(() => genCheckValue('x', 'c', 'enum', ['a', 'b']), /is not one of a, b/);
  assert.throws(() => genCheckValue('x', '', 'string'), /non-empty string/);
  assert.equal(genQuery('GET /v4/x', [['a', undefined, 'string'], ['b', 4, 'int']]), '?b=4');
  assert.equal(genQuery('GET /v4/x', [['a', undefined, 'string']]), '');
  assert.throws(() => genDeclared('GET /v4/x', 'm', undefined), /GET \/v4\/x carries no m/);
  assert.equal(genDeclared('GET /v4/x', 'm', null), null);
});

test('an enum path value outside its declared set is refused', () => {
  assert.throws(() => genPathValue('GET /v4/x/{t}', 't', 'not-a-type', 'enum', ['vault', 'swarm']), /is not one of vault, swarm/);
  assert.doesNotThrow(() => genPathValue('GET /v4/x/{t}', 't', 'vault', 'enum', ['vault', 'swarm']));
});

test('a path value is escaped into the route, not interpreted', async () => {
  const info = GENERATED_ROUTES.find((r) => r.pathValues.length === 1 && r.pathValues[0].kind === 'string')!;
  const { seen } = await against(fullAnswer(info), (c) => reader(c, info)('acc://a.acme/x y'));
  assert.equal(seen.path, info.path.replace(/\{\w+\}/, encodeURIComponent('acc://a.acme/x y')));
});

test('a read-only POST sends exactly the body members the route declares, whatever else the caller holds', async () => {
  const info = GENERATED_ROUTES.find((r) => r.route.startsWith('POST '))!;
  const { seen } = await against(fullAnswer(info), (c) => reader(c, info)(...callArgs(info, { bogus: 'dropped' })));
  assert.deepEqual(Object.keys(seen.body ?? {}).sort(), info.bodyFields.map((f) => f.name).sort(), info.route);
});

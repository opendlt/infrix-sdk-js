// What the SDK promises its caller is what the routes answer.
//
// client.policies.conflicts() read `result.conflicts` from GET /v4/policies/conflicts, which
// returns `{scope, results}` — so it returned undefined for every node and every scope. And
// client.objects.types() declared a `schemas` map that GET /v4/object-types never returns. Each
// is held here against the exact shape the route answers (captured from a node built from this
// tree), over a mocked fetch, the transport boundary.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient } from './index';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;

async function answering(result: unknown, call: (c: InfrixClient) => Promise<unknown>) {
  (globalThis as { fetch?: FetchLike }).fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id: 1, result }),
    text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result }),
  });
  try {
    return await call(new InfrixClient('http://node.test', { actor: 'acc://myco.acme', purpose: 'audit' }));
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
}

test('policies.conflicts hands back the per-policy-set analysis the route answers', async () => {
  const route = {
    scope: 'global',
    results: [
      { policySetId: 'p1', analysis: { policySetId: 'p1', unreachableRules: ['r-late'], coverageScore: 0.5 } },
      { policySetId: 'p2', analysis: { policySetId: 'p2' } },
    ],
  };
  const got = (await answering(route, (c) => c.policies.conflicts('global'))) as typeof route;
  assert.equal(got.scope, 'global');
  assert.equal(got.results.length, 2);
  assert.deepEqual(got.results[0].analysis.unreachableRules, ['r-late']);
  assert.notEqual(got, undefined, 'the answer used to be dropped: the client read a key the route never returns');
});

test('objects.types hands back the type names, the total and the detail the route answers', async () => {
  const route = { types: ['credential', 'intent', 'vault'], total: 3, detail: 'governance-authoritative object types' };
  const got = (await answering(route, (c) => c.objects.types())) as typeof route;
  assert.deepEqual(got.types, ['credential', 'intent', 'vault']);
  assert.equal(got.total, 3);
  assert.equal(got.detail, 'governance-authoritative object types');
  assert.equal((got as { schemas?: unknown }).schemas, undefined, 'the route returns no `schemas`');
});

test('mission.global is reachable from the client and hands back the nested system metrics', async () => {
  const route = {
    scope: 'system-wide (privileged)',
    contractCount: 7,
    system: {
      block_height: 1234567, contracts_total: 7, contracts_healthy: 5, contracts_quarantined: 1,
      contracts_throttled: 0, contracts_paused: 1, contracts_frozen: 0, swarms_total: 0,
      shape_shifting_contracts: 0, total_calls_this_block: 3, total_gas_this_block: 900,
    },
  };
  const got = await answering(route, (c) => c.mission.global());
  assert.deepEqual(got, route);
  assert.equal((got as typeof route).system.block_height, 1234567);
});

async function recordingRequests(result: unknown, call: (c: InfrixClient) => Promise<unknown>) {
  const sent: string[] = [];
  (globalThis as { fetch?: FetchLike }).fetch = async (...args: unknown[]) => {
    const init = (args[1] ?? {}) as { body?: unknown };
    sent.push(String(init.body ?? ''));
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', id: 1, result }),
      text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result }),
    };
  };
  try {
    const got = await call(new InfrixClient('http://node.test', { actor: 'acc://myco.acme', purpose: 'audit' }));
    return { got, sent };
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
}

test('client.mission is a constructed MissionClient, and global() and systemAlerts() reach the routes they name', async () => {
  const probe = new InfrixClient('http://node.test', { actor: 'acc://myco.acme', purpose: 'audit' });
  assert.equal(typeof probe.mission, 'object', 'InfrixClient has no `mission` member: client.mission.global() would throw');
  assert.equal(typeof probe.mission.global, 'function');
  assert.equal(typeof probe.mission.systemAlerts, 'function');

  const system = { scope: 'system-wide (privileged)', contractCount: 1, system: { block_height: 10, contracts_total: 1 } };
  const g = await recordingRequests(system, (c) => c.mission.global());
  assert.deepEqual(g.got, system);
  assert.equal(g.sent.length, 1);
  assert.match(g.sent[0], /mission\.global/, 'global() must ask for the system route, not another');

  const alertsRoute = {
    scope: 'system-wide (privileged)',
    active: [{ id: 'alert-1', rule_id: 'prod-error-rate-high', contract_url: 'acc://ms-target.acme', status: 'firing' }],
    rules: [{ id: 'prod-error-rate-high', contract_url: '*' }],
    history: [{ id: 'alert-1', status: 'firing' }],
  };
  const a = await recordingRequests(alertsRoute, (c) => c.mission.systemAlerts());
  assert.deepEqual(a.got, alertsRoute.active, 'systemAlerts() hands back the firing alerts the route lists under `active`');
  assert.match(a.sent[0], /mission\.alert\.system/, 'systemAlerts() must ask for the system alerts route');
});


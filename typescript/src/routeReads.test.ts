// The SDK's reads of the node routes that carry no JSON-RPC alias, and the bridged reads whose
// calls were corrected: node, billing, contracts, disclosures, policies, trust, committees,
// emergency. Each test holds the REQUEST to what the route accepts (path, escaping, only the query
// parameters it declares) and the RESULT to what the route answers, against a mocked fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient } from './index';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;

interface Seen {
  method?: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

function client() {
  return new InfrixClient('http://node.test', { actor: 'acc://reader.acme', purpose: 'audit' });
}

/** Run `fn` against a node that answers every request with `data` and report what it was sent. */
async function against<T>(data: unknown, fn: (c: InfrixClient) => Promise<T>): Promise<{ seen: Seen; result: T }> {
  const seen: Seen = { path: '', query: {}, headers: {} };
  (globalThis as { fetch?: FetchLike }).fetch = async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as { method?: string; headers?: Record<string, string>; body?: string };
    const u = new URL(String(url));
    seen.method = i.method;
    seen.path = u.pathname;
    seen.query = Object.fromEntries(u.searchParams.entries());
    seen.headers = i.headers ?? {};
    seen.body = i.body ? JSON.parse(i.body) : undefined;
    const rpc = i.body && seen.body && seen.body.jsonrpc === '2.0';
    const payload = rpc ? { jsonrpc: '2.0', id: seen.body!.id, result: data } : { data };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
  };
  try {
    const result = await fn(client());
    return { seen, result };
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
}

test('node.root, assurance and subsystems GET their routes and return the answer', async () => {
  let r = await against({ system: 'infrix', identity: 'i', apiVersion: 'v4', spine: ['intent'], subsystems: {} }, (c) => c.node.root());
  assert.equal(r.seen.method, 'GET');
  assert.equal(r.seen.path, '/v4/');
  assert.equal(r.result.apiVersion, 'v4');
  assert.equal(r.seen.headers['X-Actor'], 'acc://reader.acme');

  const a = await against(
    { summary: 's', proofLevels: [], governanceLevels: [], iuClasses: [{ class: 'standard', multiplier: 1.5, description: 'd' }] },
    (c) => c.node.assurance()
  );
  assert.equal(a.seen.path, '/v4/assurance');
  assert.equal(a.result.iuClasses[0].multiplier, 1.5);

  const s = await against({ subsystems: [], spine: [], graduations: [{ package: 'p', currentTier: 'a', targetTier: 'b', blockedBy: null }] }, (c) => c.node.subsystems());
  assert.equal(s.seen.path, '/v4/network/subsystems');
  assert.equal(s.result.graduations[0].package, 'p');
});

test('billing.consumption sends periodStart only when given, and refuses one the node would refuse', async () => {
  const now = await against({ payer: 'p', periodStartUnix: 1, consumedIU: 2 }, (c) => c.billing.consumption());
  assert.equal(now.seen.path, '/v4/billing/consumption');
  assert.deepEqual(now.seen.query, {});
  const past = await against({ payer: 'p', periodStartUnix: 5, consumedIU: 2 }, (c) => c.billing.consumption({ periodStart: 5 }));
  assert.deepEqual(past.seen.query, { periodStart: '5' });
  assert.equal(past.result.consumedIU, 2);
  for (const bad of [-1, 1.5, Number.NaN]) {
    await assert.rejects(() => against({}, (c) => c.billing.consumption({ periodStart: bad })), /periodStart/);
  }
});

test('billing.forIntent escapes the intent id into the route', async () => {
  const r = await against({ intentId: 'intent-acc://a.acme-1', meteredIU: 3 }, (c) => c.billing.forIntent('intent-acc://a.acme-1'));
  assert.equal(r.seen.method, 'GET');
  assert.equal(r.seen.path, '/v4/intents/intent-acc%3A%2F%2Fa.acme-1/billing');
  assert.equal(r.result.meteredIU, 3);
});

test('contracts.info, abi and code GET their routes with the address escaped', async () => {
  const i = await against({ name: 'n', version: '1', deployedAt: '2026-09-10T11:39:29-04:00', codeHash: [1, 2], abiHash: [0, 0] }, (c) => c.contracts.info('acc://x.acme/c'));
  assert.equal(i.seen.path, '/v4/contracts/acc%3A%2F%2Fx.acme%2Fc');
  assert.deepEqual(i.result.codeHash, [1, 2]);
  assert.equal(i.result.deployedBy, undefined, 'the deployer is withheld from a reader without an audit purpose');
  const a = await against({ version: '1.0', functions: [{ name: 'inc' }], events: [] }, (c) => c.contracts.abi('acc://x.acme/c'));
  assert.equal(a.seen.path, '/v4/contracts/acc%3A%2F%2Fx.acme%2Fc/abi');
  assert.equal(a.result.functions.length, 1);
  const code = await against({ address: 'acc://x.acme/c', size: 2, code: '0xbeef' }, (c) => c.contracts.code('acc://x.acme/c'));
  assert.equal(code.seen.path, '/v4/contracts/acc%3A%2F%2Fx.acme%2Fc/code');
  assert.equal(code.result.code, '0xbeef');
});

test('disclosures.check sends the route\'s own parameters, not grantee and target', async () => {
  const r = await against(
    { viewer: 'acc://a.acme', targetType: 'intent', targetId: 'intent-9', authorized: true, grantId: 'dg-1' },
    (c) => c.disclosures.check('acc://a.acme', 'intent:intent-9', 'Amount', { purpose: 'audit' })
  );
  assert.equal(r.seen.method, 'GET');
  assert.equal(r.seen.path, '/v4/disclosures/check');
  assert.deepEqual(r.seen.query, {
    viewer: 'acc://a.acme',
    targetType: 'intent',
    targetId: 'intent-9',
    field: 'Amount',
    purpose: 'audit',
  });
  assert.equal(r.result.authorized, true);
  assert.equal(r.result.grantId, 'dg-1');
});

test('disclosures.check splits the target at the first colon and refuses what the route would', async () => {
  const r = await against({ viewer: 'v', targetType: 'object', targetId: 'acc://x.acme/y', authorized: false }, (c) =>
    c.disclosures.check('v', 'object:acc://x.acme/y')
  );
  assert.equal(r.seen.query.targetType, 'object');
  assert.equal(r.seen.query.targetId, 'acc://x.acme/y');
  assert.equal(r.seen.query.field, undefined);
  for (const bad of ['', 'intent', ':id', 'intent:']) {
    await assert.rejects(() => against({}, (c) => c.disclosures.check('v', bad)), /<targetType>:<targetId>/);
  }
  await assert.rejects(
    () => against({}, (c) => c.disclosures.check('v', 'intent:1', undefined, { grantId: 'g' })),
    /together/
  );
  const cited = await against({ viewer: 'v', targetType: 'intent', targetId: '1', authorized: true }, (c) =>
    c.disclosures.check('v', 'intent:1', undefined, { grantId: 'g', approvalId: 'a' })
  );
  assert.equal(cited.seen.query.grantId, 'g');
  assert.equal(cited.seen.query.approvalId, 'a');
});

test('policies.list sends scope, type and stratum through the bridged method and reads policies and total', async () => {
  const r = await against(
    { policies: [{ id: 'set-1', name: 'n', type: 'anchoring', rules: [], defaultEffect: 'deny', version: 1 }], total: 1 },
    (c) => c.policies.list('contract:acc://x.acme/c', 'anchoring', 'foundational')
  );
  assert.equal(r.seen.method, 'POST');
  assert.equal(r.seen.body!.method, 'policy.list');
  const params = r.seen.body!.params as Record<string, unknown>;
  assert.equal(params.scope, 'contract:acc://x.acme/c');
  assert.equal(params.type, 'anchoring');
  assert.equal(params.stratum, 'foundational');
  assert.equal(r.result.total, 1);
  assert.equal(r.result.policies[0].id, 'set-1');

  const all = await against({ policies: [], total: 0 }, (c) => c.policies.list());
  const none = all.seen.body!.params as Record<string, unknown>;
  assert.equal(none.scope, undefined, 'an omitted scope must not be sent (the route refuses an empty one)');
});

test('policies.scope and policies.get GET their routes; get returns the lookup the route answers', async () => {
  const s = await against({ scope: 'global', policies: [], count: 0 }, (c) => c.policies.scope('contract:acc://x.acme/c'));
  assert.equal(s.seen.path, '/v4/policies/contract%3Aacc%3A%2F%2Fx.acme%2Fc');
  assert.equal(s.result.count, 0);

  const g = await against(
    { scope: 'global', kind: 'policyRule', id: 'r-1', rule: { id: 'r-1', effect: 'deny' }, policySetId: 'set-1', policyType: 'anchoring' },
    (c) => c.policies.get('r-1')
  );
  assert.equal(g.seen.path, '/v4/policies/rules/r-1');
  assert.deepEqual(g.seen.query, {});
  assert.equal(g.result.kind, 'policyRule');
  if (g.result.kind === 'policyRule') assert.equal(g.result.policySetId, 'set-1');

  const scoped = await against({ scope: 'obj:acc://o.acme/x', kind: 'policySet', id: 'set-2', policySet: { id: 'set-2' } }, (c) =>
    c.policies.get('set-2', 'obj:acc://o.acme/x')
  );
  assert.deepEqual(scoped.seen.query, { scope: 'obj:acc://o.acme/x' });
});

test('trust.dashboard sends no parameters; trust.requirements GETs the scope', async () => {
  const d = await against({ profiles: [{ profileId: 'p', domain: 'bridge', label: 'l', state: 'active', proofType: 'm', score: '0.90' }], count: 1 }, (c) =>
    c.trust.dashboard()
  );
  assert.equal(d.seen.body!.method, 'trust.dashboard');
  const params = d.seen.body!.params as Record<string, unknown>;
  assert.deepEqual(Object.keys(params).filter((k) => !['actor', 'purpose', 'workflowInstance', 'identity'].includes(k)), []);
  assert.equal(d.result.count, 1);

  const r = await against({ scope: 'global', policies: [], count: 0 }, (c) => c.trust.requirements('global'));
  assert.equal(r.seen.path, '/v4/trust/requirements/global');
  assert.equal(r.seen.method, 'GET');
});

test('committees.list, committees.motions and emergency.cases GET their routes', async () => {
  const l = await against({ committees: [{ committeeId: 'treasury', memberCount: 3 }], total: 1 }, (c) => c.committees.list());
  assert.equal(l.seen.path, '/v4/committees');
  assert.equal(l.result.committees[0].committeeId, 'treasury');
  const m = await against({ committeeId: 'a/b', motions: [], total: 0 }, (c) => c.committees.motions('a/b'));
  assert.equal(m.seen.path, '/v4/committees/a%2Fb/motions');
  const e = await against({ cases: [{ id: 'c1' }], total: 1 }, (c) => c.emergency.cases());
  assert.equal(e.seen.path, '/v4/emergency/cases');
  assert.equal(e.result.total, 1);
});

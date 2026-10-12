// The SDK's hand-written reads of the node's REST routes answer exactly the members each route
// declares (the node's route census, docs/release/census/rest-response-shapes.txt of infrix-core)
// and send only the query parameters each route accepts (rest-query-params.txt). Each case feeds the
// REAL declared shape against a mocked fetch and holds the request (method, escaped path, query)
// and the result (the declared members, no more) to the route; an answer that lacks a declared
// member is refused, never read as an empty list or an all-clear.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient, SwarmClient } from './index';
import { evidenceIdForIntent } from './evidenceId';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;

interface Seen {
  method?: string;
  path: string;
  query: Record<string, string>;
  rpc: boolean;
}

function client() {
  return new InfrixClient('http://node.test', { actor: 'acc://reader.acme', purpose: 'audit' });
}

/** Run `fn` against a node that answers every request with `data` and report what it was sent. */
async function against<T>(data: unknown, fn: (c: InfrixClient) => Promise<T>): Promise<{ seen: Seen; result: T }> {
  const seen: Seen = { path: '', query: {}, rpc: false };
  (globalThis as { fetch?: FetchLike }).fetch = async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as { method?: string; body?: string };
    const u = new URL(String(url));
    seen.method = i.method;
    seen.path = u.pathname;
    seen.query = Object.fromEntries(u.searchParams.entries());
    seen.rpc = u.pathname === '/rpc';
    return { ok: true, status: 200, json: async () => ({ data }), text: async () => JSON.stringify({ data }) };
  };
  try {
    const result = await fn(client());
    return { seen, result };
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
}

/** The answer a route declares: one distinct value per member, plus a key the route does not declare. */
function shapeOf(members: readonly string[]): Record<string, unknown> {
  const answer: Record<string, unknown> = { notDeclaredByAnyRoute: 'must-not-be-returned' };
  for (const m of members) answer[m] = `value-of-${m}`;
  return answer;
}

interface Case {
  name: string;
  /** The members the route's `data` payload declares. */
  members: string[];
  /** The request the call must make. */
  path: string;
  query?: Record<string, string>;
  call: (c: InfrixClient) => Promise<unknown>;
}

const LIST = ['items', 'pagination'];
const OBJECT = ['audit', 'created', 'fields', 'id', 'state', 'type', 'updated', 'url', 'version'];
const ACC = 'acc://x.acme/thing';
const ACC_ESCAPED = 'acc%3A%2F%2Fx.acme%2Fthing';

const CASES: Case[] = [
  // ---- anchors ----
  { name: 'anchors.list', members: LIST, path: '/v4/anchors', call: (c) => c.anchors.list() },
  {
    name: 'anchors.list with filters',
    members: LIST,
    path: '/v4/anchors',
    query: { intentId: 'intent-1', state: 'verified' },
    call: (c) => c.anchors.list({ intentId: 'intent-1', state: 'verified' }),
  },
  {
    name: 'anchors.verify',
    members: ['anchor', 'dataUrl', 'digest', 'id', 'state', 'txHash', 'verified'],
    path: `/v4/anchors/${ACC_ESCAPED}/verify`,
    call: (c) => c.anchors.verify(ACC),
  },
  {
    name: 'anchors.stats',
    members: ['byState', 'byType', 'scope', 'totalAnchors'],
    path: '/v4/anchors/stats',
    call: (c) => c.anchors.stats(),
  },
  {
    name: 'anchors.get',
    members: ['anchor', 'id', 'state', 'txHash'],
    path: `/v4/anchors/${ACC_ESCAPED}`,
    call: (c) => c.anchors.get(ACC),
  },
  // ---- approvals ----
  {
    name: 'approvals.signing',
    members: ['conditions', 'digest', 'keyPageRef', 'planHash', 'scope', 'signerIdentity', 'simulationHash', 'stageId', 'workflowId'],
    path: '/v4/intents/approval-signing',
    query: { intentId: 'intent-1', keyPageRef: 'acc://a.acme/book/1', role: 'finance', stageId: 'stage-2' },
    call: (c) => c.approvals.signing('intent-1', 'acc://a.acme/book/1', { stageId: 'stage-2', role: 'finance' }),
  },
  {
    name: 'approvals.signing without options',
    members: ['conditions', 'digest', 'keyPageRef', 'planHash', 'scope', 'signerIdentity', 'simulationHash', 'stageId', 'workflowId'],
    path: '/v4/intents/approval-signing',
    query: { intentId: 'intent-1', keyPageRef: 'acc://a.acme/book/1' },
    call: (c) => c.approvals.signing('intent-1', 'acc://a.acme/book/1'),
  },
  { name: 'approvals.list', members: LIST, path: '/v4/approvals', query: { status: 'pending' }, call: (c) => c.approvals.list({ status: 'pending' }) },
  { name: 'approvals.pending sends no parameters', members: LIST, path: '/v4/approvals/pending', call: (c) => c.approvals.pending() },
  { name: 'approvals.get', members: OBJECT, path: `/v4/approvals/${ACC_ESCAPED}`, call: (c) => c.approvals.get(ACC) },
  // ---- capabilities ----
  { name: 'capabilities.grants', members: LIST, path: '/v4/capabilities/grants', query: { state: 'active' }, call: (c) => c.capabilities.grants({ state: 'active' }) },
  {
    name: 'capabilities.check sends identity and capability only',
    members: ['capability', 'granted', 'grants', 'identity'],
    path: '/v4/capabilities/check',
    query: { capability: 'token:transfer', identity: 'acc://a.acme' },
    call: (c) => c.capabilities.check('acc://a.acme', 'token:transfer'),
  },
  // ---- disclosures ----
  { name: 'disclosures.list', members: LIST, path: '/v4/disclosures', query: { state: 'active' }, call: (c) => c.disclosures.list({ state: 'active' }) },
  // ---- escrows ----
  {
    name: 'escrows.list',
    members: ['escrows', 'total'],
    path: '/v4/escrows',
    query: { limit: '5', status: 'funded' },
    call: (c) => c.escrows.list({ status: 'funded', limit: 5 }),
  },
  {
    name: 'escrows.get',
    members: [
      'amount', 'arbiter', 'asset', 'beneficiary', 'createdAt', 'depositedAt', 'depositor', 'disputes', 'holdingAccount', 'id',
      'instructionId', 'instructionState', 'legId', 'refunded', 'refundedAt', 'released', 'releasedAt', 'status',
    ],
    path: '/v4/escrows/escrow-1',
    call: (c) => c.escrows.get('escrow-1'),
  },
  // ---- evidence (by evidence bundle id) ----
  { name: 'evidence.get', members: OBJECT, path: '/v4/evidence/ev-1', call: (c) => c.evidence.get('ev-1') },
  { name: 'evidence.verify', members: ['bundleId', 'chainVerified'], path: '/v4/evidence/ev-1/verify', call: (c) => c.evidence.verify('ev-1') },
  {
    name: 'evidence.export',
    members: ['bundle', 'bundleId', 'bytes', 'exportHash', 'format'],
    path: '/v4/evidence/ev-1/export',
    query: { format: 'portable' },
    call: (c) => c.evidence.export('ev-1', 'portable'),
  },
  {
    name: 'evidence.anchor',
    members: ['anchorBlock', 'anchorDataIdx', 'anchorStatus', 'anchorTxHash', 'bundleId', 'stateRoot'],
    path: '/v4/evidence/ev-1/anchor',
    call: (c) => c.evidence.anchor('ev-1'),
  },
  // ---- intents ----
  {
    name: 'intents.evidence',
    members: ['bundles', 'count', 'intent', 'intentId'],
    path: '/v4/intents/intent-1/evidence',
    call: (c) => c.intents.evidence('intent-1'),
  },
  { name: 'intents.get', members: ['intent', 'status'], path: '/v4/intents/intent-1', call: (c) => c.intents.get('intent-1') },
  {
    name: 'intents.list',
    members: LIST,
    path: '/v4/intents',
    query: { goalType: 'OBJECT_CREATE', status: 'completed' },
    call: (c) => c.intents.list({ goalType: 'OBJECT_CREATE', status: 'completed' }),
  },
  { name: 'intents.pending sends no parameters', members: LIST, path: '/v4/intents/pending', call: (c) => c.intents.pending() },
  // ---- objects ----
  {
    name: 'objects.list',
    members: LIST,
    path: '/v4/objects/vault',
    query: { field: 'Owner', filterLimit: '3', id: 'vault-1', state: 'active', value: 'acc://o.acme' },
    call: (c) => c.objects.list('vault', { field: 'Owner', filterLimit: 3, id: 'vault-1', state: 'active', value: 'acc://o.acme' }),
  },
  { name: 'objects.get', members: OBJECT, path: `/v4/objects/vault/${ACC_ESCAPED}`, call: (c) => c.objects.get('vault', ACC) },
  {
    name: 'objects.audit',
    members: ['audit', 'objectId', 'objectType'],
    path: `/v4/objects/vault/${ACC_ESCAPED}/audit`,
    call: (c) => c.objects.audit('vault', ACC),
  },
  // ---- roles ----
  { name: 'roles.list', members: ['count', 'roles'], path: '/v4/roles', call: (c) => c.roles.list() },
  { name: 'roles.list for an identity', members: ['count', 'roles'], path: `/v4/roles/${ACC_ESCAPED}`, call: (c) => c.roles.list(ACC) },
  {
    name: 'roles.check sends identity and role only',
    members: ['hasRole', 'identity', 'role'],
    path: '/v4/roles/check',
    query: { identity: 'acc://a.acme', role: 'auditor' },
    call: (c) => c.roles.check('acc://a.acme', 'auditor'),
  },
  // ---- settlements ----
  {
    name: 'settlements.list',
    members: LIST,
    path: '/v4/settlements',
    query: { id: 'settle-1', state: 'pending' },
    call: (c) => c.settlements.list({ id: 'settle-1', state: 'pending' }),
  },
  { name: 'settlements.get', members: OBJECT, path: '/v4/settlements/settle-1', call: (c) => c.settlements.get('settle-1') },
  // ---- trust ----
  { name: 'trust.list sends no parameters', members: LIST, path: '/v4/trust', call: (c) => c.trust.list() },
  { name: 'trust.get', members: OBJECT, path: '/v4/trust/profile-1', call: (c) => c.trust.get('profile-1') },
  // ---- shapes ----
  { name: 'shapes.current', members: ['contract', 'shape'], path: `/v4/shapes/contracts/${ACC_ESCAPED}`, call: (c) => c.shapes.current(ACC) },
  { name: 'shapes.rules', members: ['contract', 'detail', 'rules'], path: `/v4/shapes/contracts/${ACC_ESCAPED}/rules`, call: (c) => c.shapes.rules(ACC) },
  {
    name: 'shapes.history sends no parameters',
    members: ['contract', 'total', 'transitions'],
    path: `/v4/shapes/contracts/${ACC_ESCAPED}/history`,
    call: (c) => c.shapes.history(ACC),
  },
  {
    name: 'shapes.params',
    members: ['activeShape', 'contract', 'defaultShape', 'parameterSchema', 'parameters'],
    path: `/v4/shapes/contracts/${ACC_ESCAPED}/params`,
    call: (c) => c.shapes.params(ACC),
  },
  // ---- swarm ----
  {
    name: 'swarm.status',
    members: ['createdAt', 'gasBudget', 'id', 'lifecycle', 'maxMembers', 'members', 'name', 'state', 'updatedAt', 'version'],
    path: '/v4/swarms/swarm-1',
    call: (c) => swarm(c).status('swarm-1'),
  },
  {
    name: 'swarm.channel.get',
    members: ['gas', 'key', 'swarmId', 'value'],
    path: '/v4/swarms/swarm-1/channel/limit',
    call: (c) => swarm(c).channelGet('swarm-1', 'limit'),
  },
  // ---- mission ----
  { name: 'mission.status', members: ['contract', 'metrics'], path: `/v4/mission/contracts/${ACC_ESCAPED}`, call: (c) => c.mission.status(ACC) },
  {
    name: 'mission.slo.list',
    members: ['contract', 'definitions', 'status'],
    path: `/v4/mission/contracts/${ACC_ESCAPED}/slos`,
    call: (c) => c.mission.sloList(ACC),
  },
  { name: 'mission.cost sends no parameters', members: ['contract'], path: `/v4/mission/contracts/${ACC_ESCAPED}/cost`, call: (c) => c.mission.cost(ACC) },
  {
    name: 'mission.logs',
    members: ['contract', 'entries', 'level'],
    path: `/v4/mission/contracts/${ACC_ESCAPED}/logs`,
    query: { level: 'error', limit: '5' },
    call: (c) => c.mission.logs(ACC, { level: 'error', limit: 5 }),
  },
  {
    name: 'mission.logs without options',
    members: ['contract', 'entries', 'level'],
    path: `/v4/mission/contracts/${ACC_ESCAPED}/logs`,
    call: (c) => c.mission.logs(ACC),
  },
];

/** SwarmClient is built from the client's own request functions, as a caller wires it. */
function swarm(c: InfrixClient): SwarmClient {
  const internals = c as unknown as {
    rpc: (m: string, p: Record<string, unknown>) => Promise<never>;
    rest: (m: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', p: string, b?: unknown) => Promise<never>;
  };
  return new SwarmClient(internals.rpc.bind(c), internals.rest.bind(c));
}

for (const k of CASES) {
  test(`${k.name} GETs ${k.path} and returns exactly the members the route declares`, async () => {
    const { seen, result } = await against(shapeOf(k.members), k.call);
    assert.equal(seen.rpc, false, 'a REST read must not go through JSON-RPC');
    assert.equal(seen.method, 'GET');
    assert.equal(seen.path, k.path);
    assert.deepEqual(seen.query, k.query ?? {}, 'only the parameters the route declares are sent');
    assert.deepEqual(Object.keys(result as object).sort(), [...k.members].sort(), 'exactly the declared members');
    for (const m of k.members) {
      assert.equal((result as Record<string, unknown>)[m], `value-of-${m}`, `member ${m} read from the answer`);
    }
    assert.equal((result as Record<string, unknown>).notDeclaredByAnyRoute, undefined, 'a key the route does not declare is not returned');
  });

  test(`${k.name} refuses an answer that lacks a declared member`, async () => {
    for (const missing of k.members) {
      const answer = shapeOf(k.members.filter((m) => m !== missing));
      await assert.rejects(
        () => against(answer, k.call),
        (err: Error) => err.message.includes(`carries no ${missing}`),
        `an answer without ${missing} must be refused`
      );
    }
  });
}

test('a list answer without items is refused, never returned as an empty list', async () => {
  await assert.rejects(() => against({}, (c) => c.anchors.list()), /carries no items/);
  await assert.rejects(() => against({ pagination: {} }, (c) => c.intents.list()), /carries no items/);
  await assert.rejects(() => against({ items: [] }, (c) => c.approvals.pending()), /carries no pagination/);
  const empty = await against({ items: [], pagination: { total: 0 } }, (c) => c.approvals.pending());
  assert.deepEqual(empty.result.items, [], 'a real empty page is an answer');
  const nullItems = await against({ items: null, pagination: null }, (c) => c.trust.list());
  assert.equal(nullItems.result.items, null, 'an explicit null is an answer');
});

test('an answer that is not an object is refused', async () => {
  await assert.rejects(() => against(['not', 'an', 'object'], (c) => c.roles.list()), /GET \/v4\/roles is not an object/);
  await assert.rejects(() => against(null, (c) => c.anchors.stats()), /is not an object/);
});

test('the old fictional answers are refused, not read through', async () => {
  // The old clients read {anchors, total}, {approvals, total}, {bindings, total}, {profiles, total}...
  // none of which the node ever answered.
  await assert.rejects(() => against({ anchors: [], total: 0 }, (c) => c.anchors.list()), /carries no items/);
  await assert.rejects(() => against({ approvals: [], total: 0 }, (c) => c.approvals.list()), /carries no items/);
  await assert.rejects(() => against({ bindings: [], total: 0 }, (c) => c.roles.list()), /carries no count/);
  await assert.rejects(() => against({ profiles: [], total: 0 }, (c) => c.trust.list()), /carries no items/);
  await assert.rejects(() => against({ valid: true, errors: [] }, (c) => c.anchors.verify('a-1')), /carries no anchor/);
});

test('parameters a route does not accept are not sent, and a value the route would refuse is refused first', async () => {
  // approvals.pending / intents.pending / trust.list / roles.list take no parameters.
  const p = await against({ items: [], pagination: {} }, (c) => c.approvals.pending());
  assert.deepEqual(p.seen.query, {});
  assert.equal(client().approvals.pending.length, 0, 'approvals.pending takes no identity');
  assert.equal(client().intents.pending.length, 0, 'intents.pending takes no identity');
  assert.equal(client().trust.list.length, 0, 'trust.list takes no domain');
  assert.equal(client().capabilities.check.length, 2, 'capabilities.check takes identity and capability, no scope');
  assert.equal(client().roles.check.length, 2, 'roles.check takes identity and role, no scope');
  assert.equal(client().mission.cost.length, 1, 'mission.cost takes the contract, no period');
  assert.equal(client().shapes.history.length, 1, 'shapes.history takes the contract, no limit');

  // A value the declared kind cannot take is named by the client before any request.
  await assert.rejects(() => against({}, (c) => c.anchors.list({ state: '' })), /must be a non-empty string/);
  await assert.rejects(() => against({}, (c) => c.mission.logs(ACC, { limit: 1.5 })), /limit must be an integer/);
  await assert.rejects(
    () => against({}, (c) => c.evidence.export('ev-1', 'cbor' as unknown as 'json')),
    /is not one of json, portable/
  );
  await assert.rejects(() => against({}, (c) => c.evidence.get('')), /<id> must be a non-empty string/);
  await assert.rejects(() => against({}, (c) => c.objects.get('', 'x')), /<type> must be a non-empty string/);
});

test('evidenceIdForIntent resolves the one bundle an intent produced, from the declared bundles member', async () => {
  const one = await against(
    { bundles: [{ id: 'ev-9' }], count: 1, intent: {}, intentId: 'intent-9' },
    (c) => evidenceIdForIntent(c, 'intent-9')
  );
  assert.equal(one.result, 'ev-9');
  assert.equal(one.seen.path, '/v4/intents/intent-9/evidence');

  const none = await against({ bundles: [], count: 0, intent: {}, intentId: 'i' }, (c) => evidenceIdForIntent(c, 'i'));
  assert.equal(none.result, undefined, 'no bundle yet is not an id');

  await assert.rejects(
    () => against({ bundles: [{ id: 'a' }, { id: 'b' }], count: 2, intent: {}, intentId: 'i' }, (c) => evidenceIdForIntent(c, 'i')),
    /has 2 evidence bundles/
  );
  await assert.rejects(
    () => against({ bundles: 'ev-1', count: 1, intent: {}, intentId: 'i' }, (c) => evidenceIdForIntent(c, 'i')),
    /not a list/
  );
  await assert.rejects(() => against({ count: 0, intent: {}, intentId: 'i' }, (c) => evidenceIdForIntent(c, 'i')), /carries no bundles/);
});

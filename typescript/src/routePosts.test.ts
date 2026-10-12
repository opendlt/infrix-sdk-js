// The SDK's calls of the node's read-only POST routes: a quote, a policy decision, a simulation. Each
// test holds the REQUEST to what the route accepts (verb, path, only the body fields it declares) and
// the RESULT to what the route answers, against a mocked fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient } from './index';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;

interface Seen {
  method?: string;
  path: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

function client() {
  return new InfrixClient('http://node.test', { actor: 'acc://reader.acme', purpose: 'preview' });
}

async function against<T>(data: unknown, fn: (c: InfrixClient) => Promise<T>): Promise<{ seen: Seen; result: T }> {
  const seen: Seen = { path: '', headers: {} };
  (globalThis as { fetch?: FetchLike }).fetch = async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as { method?: string; headers?: Record<string, string>; body?: string };
    seen.method = i.method;
    seen.path = new URL(String(url)).pathname;
    seen.headers = i.headers ?? {};
    seen.body = i.body ? JSON.parse(i.body) : undefined;
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

const quote = {
  assuranceClass: 'standard',
  assuranceMultiplier: 1.5,
  baseIU: 10,
  congestionMultiplier: 1.2,
  includedDrawn: 9,
  meteredIU: 18,
  overageIU: 9,
  payer: 'acc://reader.acme',
  planName: 'Pro',
  stakingDiscount: 0.1,
  stakingTier: 2,
  usdCharged: 0.45,
  utilization: 0.8,
};

test('billing.preview POSTs only the fields the route declares and returns the quote', async () => {
  const r = await against(quote, (c) =>
    c.billing.preview({
      facts: { planSteps: 3, anchorSubmitted: true },
      verdictInputs: { evidenceLevel: 'L3', anchored: true },
      utilization: 0.8,
      periodStartUnix: 1767225600,
    })
  );
  assert.equal(r.seen.method, 'POST');
  assert.equal(r.seen.path, '/v4/billing/preview');
  assert.deepEqual(r.seen.body, {
    facts: { planSteps: 3, anchorSubmitted: true },
    verdictInputs: { evidenceLevel: 'L3', anchored: true },
    utilization: 0.8,
    periodStartUnix: 1767225600,
  });
  assert.equal(r.seen.headers['X-Actor'], 'acc://reader.acme');
  assert.equal(r.result.usdCharged, 0.45);
  assert.equal(r.result.assuranceClass, 'standard');

  const bare = await against(quote, (c) => c.billing.preview());
  assert.deepEqual(bare.seen.body ?? {}, {}, 'an unasked field is left to the node, not sent');
});

test('billing.preview refuses an impossible quote before sending it', async () => {
  await assert.rejects(() => against(quote, (c) => c.billing.preview({ utilization: -1 })), /utilization/);
  await assert.rejects(() => against(quote, (c) => c.billing.preview({ utilization: Number.NaN })), /utilization/);
  await assert.rejects(() => against(quote, (c) => c.billing.preview({ periodStartUnix: -5 })), /periodStartUnix/);
  await assert.rejects(() => against(quote, (c) => c.billing.preview({ periodStartUnix: 1.5 })), /periodStartUnix/);
});

const decision = (simulate: boolean) => ({
  allowed: false,
  auditMsg: 'no rule matched',
  effect: 'deny',
  matchedRule: '',
  policyType: 'contract:call',
  scope: 'global',
  simulate,
  stratum: 'operational',
  trace: { steps: [] },
});

test('policies.evaluate and simulate POST scopeKey, policyType and operands to their own routes', async () => {
  const e = await against(decision(false), (c) =>
    c.policies.evaluate('contract:call', { scope: ' contract:acc://org.acme/treasury ', operands: { amount: '5000' } })
  );
  assert.equal(e.seen.method, 'POST');
  assert.equal(e.seen.path, '/v4/policies/evaluate');
  assert.deepEqual(e.seen.body, {
    policyType: 'contract:call',
    scopeKey: 'contract:acc://org.acme/treasury',
    operands: { amount: '5000' },
  });
  assert.equal(e.result.simulate, false);
  assert.equal(e.result.allowed, false);
  assert.equal(e.result.stratum, 'operational');

  const s = await against(decision(true), (c) => c.policies.simulate('contract:call'));
  assert.equal(s.seen.method, 'POST');
  assert.equal(s.seen.path, '/v4/policies/simulate');
  assert.deepEqual(s.seen.body, { policyType: 'contract:call' }, 'an unnamed scope and no operands are not sent');
  assert.equal(s.result.simulate, true);
});

test('policies.evaluate and simulate refuse a missing policy type and a blank scope before sending', async () => {
  for (const bad of ['', '   ']) {
    await assert.rejects(() => against(decision(false), (c) => c.policies.evaluate(bad)), /policyType is required/);
    await assert.rejects(() => against(decision(true), (c) => c.policies.simulate(bad)), /policyType is required/);
  }
  await assert.rejects(() => against(decision(false), (c) => c.policies.evaluate('contract:call', { scope: '  ' })), /scope is empty/);
  await assert.rejects(() => against(decision(true), (c) => c.policies.simulate('contract:call', { scope: '' })), /scope is empty/);
});

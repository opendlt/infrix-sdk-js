// THE GOVERNED-SUBMIT WIRE CONTRACT (core item 2c part 28aa): intents.submit sends exactly core.SubmitGovernedRequest.
// The fully populated request below is pinned on both sides: core's TestS28aaTheSDKWireDecodesIntoTheContract decodes
// this exact JSON strictly and requires every member to reach the intent, so a member the client adds, renames or drops
// turns one of the two red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient } from './index';
import type { IntentGoal, IntentSubmitOptions } from './types/governance';

type FetchLike = (url: unknown, init: unknown) => Promise<unknown>;

export const FULL_SDK_SUBMISSION = {
  goalType: 'SWAP',
  actor: 'acc://alice.acme',
  purpose: 'operational',
  workflowInstance: 'wf-28aa',
  sourceAssets: [{ asset: 'acc://acme/ACME', amount: 1000, amountDecimal: '10.00', isMinimum: true, tokenStandard: 'acme', contractUrl: 'acc://acme/ACME' }],
  targetAssets: [{ asset: 'acc://usd.acme/USD', amount: 950, amountDecimal: '9.50', isMaximum: true }],
  targetState: { stateType: 'token_account', parameters: { owner: 'acc://alice.acme' }, contract: 'acc://c.acme' },
  via: 'acc://dex.acme',
  customType: 'label',
  customParams: { slippage: 0.01 },
  priority: 'urgent',
  constraints: { minOutput: 900, minOutputDecimal: '9.00', maxGas: 50000, maxCredits: 7, minConfidence: 0.5, minAvgConfidence: 0.6, maxSteps: 9, maxSlippage: 0.02, requiredContracts: ['acc://dex.acme'], excludedContracts: ['acc://bad.acme'], deadline: 4102444800, allowedImmuneStates: ['quarantined'] },
  preferences: { optimize: 'minimize_cost', customWeights: { cost: 0.7 }, preferContracts: ['acc://dex.acme'], avoidContracts: ['acc://slow.acme'], maxAlternatives: 3 },
  userAddress: 'acc://alice.acme',
  rawInput: 'swap 10 ACME for at least 9 USD',
  expiresAt: 5000,
  preview: true,
};

const FULL_GOAL: IntentGoal = {
  type: 'SWAP',
  sourceAssets: FULL_SDK_SUBMISSION.sourceAssets,
  targetAssets: FULL_SDK_SUBMISSION.targetAssets,
  targetState: FULL_SDK_SUBMISSION.targetState,
  via: 'acc://dex.acme',
  customType: 'label',
  customParams: { slippage: 0.01 },
  priority: 'urgent',
};

const FULL_OPTS: IntentSubmitOptions = {
  constraints: FULL_SDK_SUBMISSION.constraints,
  preferences: { ...FULL_SDK_SUBMISSION.preferences, optimize: 'minimize_cost' },
  userAddress: 'acc://alice.acme',
  rawInput: 'swap 10 ACME for at least 9 USD',
  expiresAt: 5000,
  preview: true,
};

async function sent(fn: (c: InfrixClient) => Promise<unknown>): Promise<{ method: string; params: Record<string, unknown> }> {
  const realFetch = (globalThis as { fetch?: FetchLike }).fetch;
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  (globalThis as { fetch?: FetchLike }).fetch = async (_url: unknown, init: unknown) => {
    const body = JSON.parse((init as { body: string }).body);
    calls.push({ method: body.method, params: body.params });
    return { json: async () => ({ result: { intentId: 'i-1', status: 'previewed' } }) };
  };
  try {
    const c = new InfrixClient('http://node.test', { actor: 'acc://alice.acme', purpose: 'operational', workflowInstance: 'wf-28aa', identity: 'acc://alice.acme' });
    await fn(c);
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
  assert.equal(calls.length, 1);
  return calls[0];
}

test('a fully populated goal and options are sent as exactly the governed-submit contract', async () => {
  const call = await sent((c) => c.intents.submit(FULL_GOAL, FULL_OPTS));
  assert.equal(call.method, 'intent.submit');
  assert.deepEqual(call.params, FULL_SDK_SUBMISSION);
});

test('the default identity is not injected into the strict submit contract', async () => {
  const call = await sent((c) => c.intents.submit({ type: 'SWAP', sourceAssets: FULL_GOAL.sourceAssets }));
  assert.equal(Object.prototype.hasOwnProperty.call(call.params, 'identity'), false, 'intent.submit names no identity: the node would refuse it');
});

test('what the node refuses is refused by name before anything is sent', async () => {
  const c = new InfrixClient('http://node.test', { actor: 'acc://alice.acme', purpose: 'operational', workflowInstance: 'wf-28aa' });
  const submit = c.intents.submit.bind(c.intents) as unknown as (g: unknown, o?: unknown) => Promise<unknown>;
  await assert.rejects(submit('swap 10 ACME for 9 USD'), /intent\.resolve/);
  await assert.rejects(submit({ type: 'SWAP', goal: {} }), /goal member goal is not part of the governed-submit contract/);
  await assert.rejects(submit({ type: 'SWAP' }, { metadata: { a: 'b' } }), /metadata cannot be carried/);
  await assert.rejects(submit({ type: 'SWAP' }, { signature: 'aa' }), /option signature is not part of the governed-submit contract/);
  await assert.rejects(submit({ customParams: {} }), /the goal has no type/);
});

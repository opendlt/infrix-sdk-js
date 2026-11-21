// The wallet's intent.submit request is the shape the node's doors read, and the intent priority travels on it.
//
// submitIntent nested the goal under `goal` and named the ADI `userAddress`; the intent.submit doors on both roots read
// neither (they read goalType, customParams, actor, purpose, workflowInstance, and the goal's other keys beside them),
// so every structured submission was refused. The priority vocabulary is generated from the node's (goal-vocabulary.json,
// written by infrix-core) and must be exactly that set. Over a mocked fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InfrixWallet } from './wallet';
import { INTENT_PRIORITIES } from './index';
import type { IntentGoal, IntentPriority } from './index';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;

interface Sent {
  method: string;
  params: Record<string, unknown>;
}

function node(sent: Sent[]): void {
  (globalThis as { fetch?: FetchLike }).fetch = async (_url: unknown, init: unknown) => {
    const body = JSON.parse((init as { body: string }).body);
    sent.push({ method: body.method, params: body.params });
    return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result: { intentId: 'int-1', status: 'pending' } }) };
  };
}

async function within<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
}

const CALL: IntentGoal = { type: 'CONTRACT_CALL', customParams: { contract: 'acc://game.acme/counter', function: 'increment', args: '[]' } };
const CONTEXT = { purpose: 'operational', workflowInstance: 'counter-1' };

test('a goal with priority "urgent" is sent as the top-level priority beside goalType, in the shape the doors read', async () => {
  const sent: Sent[] = [];
  node(sent);
  const wallet = new InfrixWallet('acc://alice.acme', { rpcUrl: 'http://node.test/rpc' });
  const urgent: IntentPriority = 'urgent';
  await within(() => wallet.submitIntent({ ...CALL, priority: urgent }, CONTEXT));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'intent.submit');
  assert.deepEqual(sent[0].params, {
    actor: 'acc://alice.acme',
    purpose: 'operational',
    workflowInstance: 'counter-1',
    goalType: 'CONTRACT_CALL',
    customParams: { contract: 'acc://game.acme/counter', function: 'increment', args: '[]' },
    priority: 'urgent',
  });
});

test('an omitted priority is absent from the request', async () => {
  const sent: Sent[] = [];
  node(sent);
  const wallet = new InfrixWallet('acc://alice.acme', { rpcUrl: 'http://node.test/rpc' });
  await within(() => wallet.submitIntent(CALL, CONTEXT));
  assert.equal(Object.prototype.hasOwnProperty.call(sent[0].params, 'priority'), false, 'an undeclared priority must not be sent');
  assert.equal(sent[0].params.goalType, 'CONTRACT_CALL');
  // Nothing a door does not read: the goal is not nested and the ADI is the actor.
  for (const unread of ['goal', 'userAddress']) {
    assert.equal(Object.prototype.hasOwnProperty.call(sent[0].params, unread), false, `${unread} is sent, and no door reads it`);
  }
});

test('the goal round-trips through JSON with its priority as goal.priority, and without one when omitted', () => {
  const goal: IntentGoal = { ...CALL, priority: 'urgent' };
  const wire = JSON.parse(JSON.stringify({ goal }));
  assert.equal(wire.goal.priority, 'urgent');
  assert.deepEqual(wire.goal, goal);
  const plain = JSON.parse(JSON.stringify({ goal: CALL }));
  assert.equal('priority' in plain.goal, false);
});

test('a submission without its disclosure context is refused before it reaches the node', async () => {
  const sent: Sent[] = [];
  node(sent);
  const wallet = new InfrixWallet('acc://alice.acme', { rpcUrl: 'http://node.test/rpc' });
  const submit = wallet.submitIntent as unknown as (...a: unknown[]) => Promise<unknown>;
  await within(async () => {
    await assert.rejects(() => submit.call(wallet, CALL), /purpose and workflowInstance are required/);
    await assert.rejects(() => submit.call(wallet, CALL, { purpose: 'operational' }), /purpose and workflowInstance are required/);
    await assert.rejects(() => submit.call(wallet, CALL, { workflowInstance: 'w' }), /purpose and workflowInstance are required/);
  });
  assert.equal(sent.length, 0, 'a submission the node would refuse was sent');
});

test('INTENT_PRIORITIES is exactly the node priority vocabulary', () => {
  // dist/intentSubmit.test.js -> typescript-wallet/ -> repo root.
  const vocabulary = JSON.parse(readFileSync(join(__dirname, '..', '..', 'goal-vocabulary.json'), 'utf8')) as { priorities?: string[] };
  assert.ok(Array.isArray(vocabulary.priorities) && vocabulary.priorities.length > 0, 'goal-vocabulary.json carries no priorities');
  assert.deepEqual([...INTENT_PRIORITIES], vocabulary.priorities);
});

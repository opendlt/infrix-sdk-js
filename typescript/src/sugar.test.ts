/**
 * Governance-sugar ergonomics tests (Plan E DX).
 *
 * Offline unit tests for the high-level verbs that hide the spine:
 * contract deploy/call/upgrade build the canonical wire shapes, and the
 * waiter resolves outcome/evidence/anchor/finality and fails loud on a
 * non-success terminal state. Run via `node --test` against compiled JS;
 * a fake client records submissions and simulates the lifecycle, so no
 * server is required.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  withGovernanceSugar,
  waitForCompletion,
  InfrixGovernanceError,
} from './index';
import type { InfrixClient } from './index';

interface FakeOpts {
  terminalStatus?: 'completed' | 'failed' | 'cancelled';
  outcome?: unknown;
  getStatuses?: Array<'pending' | 'completed' | 'failed' | 'cancelled'>;
}

interface FakeClient {
  submitted: Array<{ goalType?: unknown; customParams?: Record<string, unknown> }>;
  getCalls: number;
}

function makeFake(opts: FakeOpts = {}): InfrixClient & FakeClient {
  const submitted: FakeClient['submitted'] = [];
  let getCalls = 0;
  const statuses = opts.getStatuses;
  const fake = {
    submitted,
    get getCalls() {
      return getCalls;
    },
    intents: {
      submit: async (goal: { type?: string; customParams?: Record<string, unknown> }) => {
        // Mirror IntentSubClient.submit's type->goalType flattening so
        // the test asserts the exact wire shape the server receives.
        submitted.push({ goalType: goal.type, customParams: goal.customParams });
        return { intentId: 'int-1', status: 'submitted', planId: 'plan-1' };
      },
      get: async () => {
        const status = statuses
          ? statuses[Math.min(getCalls, statuses.length - 1)]
          : opts.terminalStatus ?? 'completed';
        getCalls++;
        return { id: 'int-1', status, planId: 'plan-1', outcomeId: 'out-1' };
      },
      outcome: async () => opts.outcome,
    },
  };
  return fake as unknown as InfrixClient & FakeClient;
}

const successOutcome = {
  id: 'out-1',
  planId: 'plan-1',
  completedAt: '2026-01-01T00:00:00Z',
  blockHeight: 7,
  overallStatus: 'completed',
  stepOutcomes: [{ stageId: 's1', plannedGas: 10, actualGas: 10, gasDrift: 0, status: 'completed' }],
  totalGasUsed: 42,
  totalGasPlanned: 42,
  gasDrift: 0,
  approvalEvidence: [],
  outcomeHash: 'deadbeef',
  planHashVerified: true,
  evidenceBundleId: 'ev-1',
  anchorId: 'anc-1',
  finality: 'l0_anchored_final',
};

test('deployContract builds the canonical CONTRACT_DEPLOY wire shape and wires outcome artifacts', async () => {
  const fake = makeFake({ outcome: successOutcome });
  const governed = withGovernanceSugar(fake);

  const r = await governed.deployContract('acc://alice.acme/counter', new Uint8Array([0x00, 0x61, 0x73, 0x6d]));

  assert.equal(fake.submitted.length, 1);
  assert.equal(fake.submitted[0].goalType, 'CONTRACT_DEPLOY');
  assert.equal(fake.submitted[0].customParams?.authority, 'acc://alice.acme/counter');
  assert.equal(fake.submitted[0].customParams?.bytecode, '0061736d'); // hex of the bytes

  assert.equal(r.status, 'completed');
  assert.equal(r.gasUsed, 42);
  assert.equal(r.evidenceId, 'ev-1');
  assert.equal(r.anchorId, 'anc-1');
  assert.equal(r.finality, 'l0_anchored_final');
  assert.ok(r.outcome);
});

test('callContract JSON-encodes args into the canonical CONTRACT_CALL wire shape', async () => {
  const fake = makeFake({ outcome: successOutcome });
  const governed = withGovernanceSugar(fake);

  await governed.callContract('acc://alice.acme/counter', 'transfer', ['acc://bob.acme/tokens', 100]);

  assert.equal(fake.submitted[0].goalType, 'CONTRACT_CALL');
  assert.equal(fake.submitted[0].customParams?.contract, 'acc://alice.acme/counter');
  assert.equal(fake.submitted[0].customParams?.function, 'transfer');
  assert.equal(fake.submitted[0].customParams?.args, '["acc://bob.acme/tokens",100]');
});

test('upgradeContract builds the canonical CONTRACT_UPGRADE wire shape with newCode', async () => {
  const fake = makeFake({ outcome: successOutcome });
  const governed = withGovernanceSugar(fake);

  await governed.upgradeContract('acc://alice.acme/counter', '0xAABB');

  assert.equal(fake.submitted[0].goalType, 'CONTRACT_UPGRADE');
  assert.equal(fake.submitted[0].customParams?.contract, 'acc://alice.acme/counter');
  assert.equal(fake.submitted[0].customParams?.newCode, 'aabb'); // 0x stripped + lowercased
});

test('submitAndWait with wait:false returns the submit status without polling', async () => {
  const fake = makeFake();
  const governed = withGovernanceSugar(fake);

  const r = await governed.submitAndWait(
    { type: 'CONTRACT_CALL', customParams: { contract: 'acc://x.acme', function: 'noop', args: '[]' } },
    { wait: false }
  );

  assert.equal(r.status, 'submitted');
  assert.equal(fake.getCalls, 0); // never polled
});

test('throwOnFailure raises InfrixGovernanceError with the failing step reason', async () => {
  const failOutcome = {
    ...successOutcome,
    overallStatus: 'failed',
    stepOutcomes: [
      { stageId: 's1', plannedGas: 10, actualGas: 3, gasDrift: 0, status: 'failed', error: 'revert: insufficient balance' },
    ],
    evidenceBundleId: 'ev-2',
  };
  const fake = makeFake({ terminalStatus: 'failed', outcome: failOutcome });
  const governed = withGovernanceSugar(fake);

  await assert.rejects(
    () => governed.callContract('acc://x.acme', 'transfer', [], { throwOnFailure: true }),
    (err: unknown) => {
      if (!(err instanceof InfrixGovernanceError)) {
        throw new Error(`expected InfrixGovernanceError, got ${String(err)}`);
      }
      assert.equal(err.status, 'failed');
      assert.match(err.message, /insufficient balance/);
      assert.equal(err.result.evidenceId, 'ev-2');
      assert.equal(err.result.failureReason, 'revert: insufficient balance');
      return true;
    }
  );
});

test('waitForCompletion polls until terminal then resolves artifacts', async () => {
  const fake = makeFake({
    getStatuses: ['pending', 'pending', 'completed'],
    outcome: successOutcome,
  });

  const r = await waitForCompletion(fake, 'int-1', { pollIntervalMs: 1 });

  assert.equal(r.status, 'completed');
  assert.equal(r.finality, 'l0_anchored_final');
  assert.ok(fake.getCalls >= 3);
});

test('deployContract rejects a non-hex bytecode string', async () => {
  const fake = makeFake({ outcome: successOutcome });
  const governed = withGovernanceSugar(fake);
  await assert.rejects(() => governed.deployContract('acc://a.acme/c', 'not-hex-zz'));
});

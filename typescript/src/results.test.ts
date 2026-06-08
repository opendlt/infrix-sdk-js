/**
 * Shared result-normalizer tests (Priority 02).
 *
 * Cover success, failed intent, timeout, missing outcome, missing evidence,
 * proof export (available + unavailable), gasAvailable semantics, planSkipped,
 * and the require-X + throwOnIncomplete completeness assertions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeSubmittedIntent,
  waitForGovernedResult,
  InfrixGovernanceError,
  IncompleteGovernedResultError,
} from './results';
import type { InfrixClient } from './index';

interface FakeOpts {
  getStatuses?: Array<'pending' | 'completed' | 'failed' | 'cancelled'>;
  terminalStatus?: 'completed' | 'failed' | 'cancelled';
  outcome?: unknown;
  outcomeThrows?: boolean;
  planId?: string | null;
  outcomeId?: string | null;
  evidence?: unknown;
  exportThrows?: boolean;
}

function makeFake(opts: FakeOpts = {}): InfrixClient {
  let getCalls = 0;
  const planId = opts.planId === null ? undefined : (opts.planId ?? 'plan-1');
  const outcomeId = opts.outcomeId === null ? undefined : (opts.outcomeId ?? 'out-1');
  return {
    intents: {
      get: async () => {
        const status = opts.getStatuses
          ? opts.getStatuses[Math.min(getCalls, opts.getStatuses.length - 1)]
          : opts.terminalStatus ?? 'completed';
        getCalls++;
        return { id: 'int-1', status, planId, outcomeId };
      },
      outcome: async () => {
        if (opts.outcomeThrows) throw new Error('outcome not queryable yet');
        return opts.outcome;
      },
    },
    evidence: {
      get: async () => {
        if (opts.exportThrows) throw new Error('evidence unavailable');
        return opts.evidence ?? { id: 'ev-1' };
      },
      exportPortable: async () => ({ version: '4', bundleData: '{}' }),
    },
  } as unknown as InfrixClient;
}

const goodOutcome = {
  id: 'out-1',
  planId: 'plan-1',
  overallStatus: 'completed',
  stepOutcomes: [],
  totalGasUsed: 99,
  totalGasPlanned: 99,
  gasDrift: 0,
  approvalEvidence: [],
  outcomeHash: 'deadbeef',
  planHashVerified: true,
  evidenceBundleId: 'ev-1',
  anchorId: 'anc-1',
  finality: 'l0_anchored_final',
};

test('success: hydrates gas/evidence/anchor/finality with gasAvailable=true', async () => {
  const r = await normalizeSubmittedIntent(makeFake({ outcome: goodOutcome }), { intentId: 'int-1', status: 'submitted' });
  assert.equal(r.status, 'completed');
  assert.equal(r.gasAvailable, true);
  assert.equal(r.gasUsed, 99);
  assert.equal(r.evidenceId, 'ev-1');
  assert.equal(r.anchorId, 'anc-1');
  assert.equal(r.finality, 'l0_anchored_final');
});

test('wait:false: gasAvailable=false (never a fake 0) and no polling', async () => {
  const r = await normalizeSubmittedIntent(makeFake(), { intentId: 'int-1', status: 'submitted', planId: 'plan-1' }, { wait: false });
  assert.equal(r.status, 'submitted');
  assert.equal(r.gasAvailable, false);
  assert.equal(r.gasUsed, 0); // accompanied by gasAvailable:false — explicitly unknown
});

test('failed intent: failureReason populated; throwOnFailure raises', async () => {
  const failOutcome = {
    ...goodOutcome,
    overallStatus: 'failed',
    stepOutcomes: [{ stageId: 's1', plannedGas: 1, actualGas: 0, gasDrift: 0, status: 'failed', error: 'revert: nope' }],
  };
  const fake = makeFake({ terminalStatus: 'failed', outcome: failOutcome });
  const r = await waitForGovernedResult(fake, 'int-1');
  assert.equal(r.status, 'failed');
  assert.equal(r.failureReason, 'revert: nope');
  await assert.rejects(() => waitForGovernedResult(makeFake({ terminalStatus: 'failed', outcome: failOutcome }), 'int-1', { throwOnFailure: true }), InfrixGovernanceError);
});

test('timeout: status timeout, gasAvailable=false', async () => {
  const fake = makeFake({ getStatuses: ['pending', 'pending', 'pending'] });
  const r = await waitForGovernedResult(fake, 'int-1', { maxWaitMs: 5, pollIntervalMs: 1 });
  assert.equal(r.status, 'timeout');
  assert.equal(r.gasAvailable, false);
  assert.match(r.failureReason ?? '', /terminal state/);
});

test('missing outcome: gasAvailable=false, no evidence (never fabricated)', async () => {
  const r = await waitForGovernedResult(makeFake({ outcomeThrows: true }), 'int-1');
  assert.equal(r.status, 'completed');
  assert.equal(r.gasAvailable, false);
  assert.equal(r.evidenceId, undefined);
});

test('requireOutcome + throwOnIncomplete: throws when outcome absent', async () => {
  const fake = makeFake({ outcomeId: null, outcomeThrows: true });
  await assert.rejects(
    () => waitForGovernedResult(fake, 'int-1', { requireOutcome: true, throwOnIncomplete: true }),
    IncompleteGovernedResultError,
  );
});

test('planSkipped: terminal completed with no plan id is marked explicitly', async () => {
  const noPlanOutcome = { ...goodOutcome, planId: '' };
  const r = await waitForGovernedResult(makeFake({ planId: null, outcome: noPlanOutcome }), 'int-1');
  assert.equal(r.planSkipped, true);
  assert.match(r.planReason ?? '', /no plan stage/);
});

test('proof export: attaches proof + proofAvailable=true', async () => {
  const r = await waitForGovernedResult(makeFake({ outcome: goodOutcome }), 'int-1', { exportProof: true });
  assert.equal(r.proofAvailable, true);
  assert.ok(r.proof);
});

test('proof export unavailable: proofAvailable=false + reason (no throw unless required)', async () => {
  const r = await waitForGovernedResult(makeFake({ outcome: goodOutcome, exportThrows: true }), 'int-1', { exportProof: true });
  assert.equal(r.proofAvailable, false);
  assert.match(r.proofUnavailableReason ?? '', /unavailable/);
});

test('requireProof when unavailable: throws', async () => {
  await assert.rejects(
    () => waitForGovernedResult(makeFake({ outcome: goodOutcome, exportThrows: true }), 'int-1', { requireProof: true }),
    /evidence unavailable/,
  );
});

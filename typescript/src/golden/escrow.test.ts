/**
 * Golden-escrow SDK surface test (platform-review-2 Epic D).
 *
 * Proves the day-one API hides the spine: the caller opens and releases an
 * escrow and exports a proof using escrow / proof vocabulary only — never
 * constructing an Intent, Plan, Outcome, or Evidence object — while the
 * facade still drives the canonical spine sub-clients underneath (recorded
 * by a fake client).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { withGoldenApp } from '../index';
import type { InfrixClient } from '../index';

interface FakeCalls {
  escrowCreate: unknown[];
  escrowRelease: unknown[];
  evidenceGet: string[];
  exportPortable: string[];
}

function makeFake(): { client: InfrixClient; calls: FakeCalls } {
  const calls: FakeCalls = {
    escrowCreate: [],
    escrowRelease: [],
    evidenceGet: [],
    exportPortable: [],
  };
  const fake = {
    escrows: {
      create: async (params: unknown) => {
        calls.escrowCreate.push(params);
        return { escrowId: 'escrow-1', intentId: 'intent-1', status: 'created' };
      },
      release: async (id: string, opts?: unknown) => {
        calls.escrowRelease.push({ id, opts });
        return { intentId: 'intent-release-1', status: 'released' };
      },
    },
    evidence: {
      get: async (intentId: string) => {
        calls.evidenceGet.push(intentId);
        return { id: 'ev-1', intentId };
      },
      exportPortable: async (evidenceId: string) => {
        calls.exportPortable.push(evidenceId);
        return { version: '3', bundleData: '{}', exportHash: 'deadbeef' };
      },
    },
  };
  return { client: fake as unknown as InfrixClient, calls };
}

test('golden escrow create/release/export speaks escrow, not spine', async () => {
  const { client, calls } = makeFake();
  const app = withGoldenApp(client);

  // The facade exposes exactly the golden surface.
  assert.equal(typeof app.escrow.create, 'function');
  assert.equal(typeof app.escrow.release, 'function');
  assert.equal(typeof app.proofs.export, 'function');

  // Create: the caller speaks buyer/seller/amount — no Intent/Plan/Goal.
  const handle = await app.escrow.create({ buyer: 'acc://buyer.acme', seller: 'acc://seller.acme', amount: 1000 });
  assert.equal(handle.escrowId, 'escrow-1');

  // Under the hood the spine escrow sub-client was driven with the mapped
  // depositor/beneficiary.
  assert.equal(calls.escrowCreate.length, 1);
  const created = calls.escrowCreate[0] as { depositor: string; beneficiary: string; amount: number };
  assert.equal(created.depositor, 'acc://buyer.acme');
  assert.equal(created.beneficiary, 'acc://seller.acme');
  assert.equal(created.amount, 1000);

  // Release: caller only says "release this escrow".
  await app.escrow.release({ escrowId: handle.escrowId });
  assert.equal(calls.escrowRelease.length, 1);
  assert.equal((calls.escrowRelease[0] as { id: string }).id, 'escrow-1');

  // Export a proof by intent id → resolves the bundle and exports the
  // PORTABLE package via the spine evidence sub-client.
  const proof = await app.proofs.export({ intentId: handle.intentId });
  assert.equal(calls.evidenceGet[0], 'intent-1');
  assert.equal(calls.exportPortable[0], 'ev-1');
  assert.equal((proof as { version: string }).version, '3');
});

// Compile-time surface guard: the golden create params expose ONLY
// escrow vocabulary (no goal/plan/intent fields). If a spine field leaks
// into the public params, this stops compiling.
test('golden escrow params are spine-free', () => {
  const params: import('../index').EscrowCreateParams = {
    buyer: 'acc://b.acme',
    seller: 'acc://s.acme',
    amount: 1,
  };
  // @ts-expect-error — there is no "goal" on the golden escrow params.
  params.goal = 'CONTRACT_CALL';
  void params;
});

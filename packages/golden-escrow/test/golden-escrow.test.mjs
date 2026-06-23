// @infrix/golden-escrow tests (adoption-10): one-call happy path against a mock
// client, real proof verification, complete result hydration, no fabricated
// ids, and typed/actionable errors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEscrowApp } from '../index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// @infrix/verify (workspace sibling, drift-fenced) holds the sample proof.
const bundle = JSON.parse(
  fs.readFileSync(path.join(here, '..', '..', 'verify', 'src', 'portable-fixture.valid.json'), 'utf8'),
);

// A mock `withGoldenApp`-shaped client: real ids in, real proof bundle out.
function mockClient() {
  const calls = { create: 0, export: 0 };
  return {
    calls,
    escrow: {
      async create(params) {
        calls.create++;
        assert.equal(params.buyer, 'acc://buyer.acme');
        assert.equal(params.seller, 'acc://seller.acme');
        assert.equal(params.amount, 1000);
        return {
          escrowId: 'escrow-golden-001',
          intentId: 'intent-golden-escrow-001',
          planId: 'plan-intent-golden-escrow-001',
          outcomeId: 'outcome-intent-golden-escrow-001',
          status: 'completed',
        };
      },
    },
    proofs: {
      async export(params) {
        calls.export++;
        assert.equal(params.intentId, 'intent-golden-escrow-001');
        return bundle;
      },
    },
  };
}

test('one call creates, governs, and proves the escrow', async () => {
  const client = mockClient();
  const app = createEscrowApp({ client });
  const result = await app.createAndProve({ buyer: 'acc://buyer.acme', seller: 'acc://seller.acme', amount: 1000 });

  // Complete result hydration.
  assert.equal(result.escrowId, 'escrow-golden-001');
  assert.equal(result.governedResult.intentId, 'intent-golden-escrow-001');
  assert.ok(result.proof, 'the portable proof is returned');
  assert.equal(result.proofReceipt.status, 'verified');
  assert.equal(result.proofReceipt.assurance.nodeTrusted, false);
  assert.match(result.verifyCommand, /infrix verify/);

  // The flow actually drove the client (no fabricated ids/gas).
  assert.equal(client.calls.create, 1);
  assert.equal(client.calls.export, 1);
});

test('proof receipt is offline (L3, never inflated) unless l0 confirms', async () => {
  const app = createEscrowApp({ client: mockClient() });
  const result = await app.createAndProve({ buyer: 'acc://buyer.acme', seller: 'acc://seller.acme', amount: 1000 });
  assert.equal(result.proofReceipt.assurance.l0Verified, false);
});

test('errors are typed and actionable', async () => {
  assert.throws(() => createEscrowApp({}), /provide \{ endpoint \}/);

  const app = createEscrowApp({ client: mockClient() });
  await assert.rejects(() => app.createAndProve({ seller: 'x', amount: 1 }), /buyer and seller are required/);
  await assert.rejects(
    () => app.createAndProve({ buyer: 'a', seller: 'b', amount: 0 }),
    /amount must be a number > 0/,
  );
});

test('a create that returns no intentId fails closed (no half-proof)', async () => {
  const broken = mockClient();
  broken.escrow.create = async () => ({ escrowId: 'x' }); // no intentId
  const app = createEscrowApp({ client: broken });
  await assert.rejects(
    () => app.createAndProve({ buyer: 'a', seller: 'b', amount: 1 }),
    /no intentId/,
  );
});

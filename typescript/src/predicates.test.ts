// DX P1-3b-4 — client.predicates.prove integration tests (no WASM required;
// the prover is dependency-injected, so a mock exercises the wiring).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient, InfrixUserError } from './index';
import type { PredicateProver, PredicateProveRequest, PredicateProofEnvelope } from './index';

function client() {
  return new InfrixClient('http://node.test', { actor: 'acc://a.acme', purpose: 'p' });
}

const req: PredicateProveRequest = {
  predicate: 'threshold_gte',
  publicInputs: [18n],
  privateInputs: [21n],
  holderSigner: new Uint8Array(64),
};

test('predicates.prove without a prover throws typed PROVER_NOT_INSTALLED', async () => {
  await assert.rejects(
    () => client().predicates.prove(req),
    (e: unknown) => e instanceof InfrixUserError && e.code === 'PROVER_NOT_INSTALLED'
  );
});

test('predicates.prove delegates to a provided prover', async () => {
  let captured: PredicateProveRequest | undefined;
  const mockProver: PredicateProver = {
    async prove(r) {
      captured = r;
      return { proof: 'deadbeef' } as unknown as PredicateProofEnvelope;
    },
  };
  const envelope = await client().predicates.prove(req, mockProver);
  assert.equal((envelope as unknown as { proof: string }).proof, 'deadbeef');
  assert.equal(captured?.predicate, 'threshold_gte');
});

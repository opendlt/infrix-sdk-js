// DX P1-3 — @infrix/client credentials sub-client tests.
//
// createDID and presentationRequest are offline/deterministic (no node).
// issue is verified against a mocked fetch, which also asserts the disclosure
// context (actor + purpose) is auto-injected from the constructor (DX P0-3).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient, InfrixUserError } from './index';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;
function setFetch(fn: FetchLike) {
  (globalThis as { fetch?: FetchLike }).fetch = fn;
}
function restoreFetch() {
  (globalThis as { fetch?: FetchLike }).fetch = realFetch;
}

function client() {
  return new InfrixClient('http://node.test', { actor: 'acc://issuer.acme', purpose: 'issue' });
}

test('createDID derives the canonical did:infrix (offline)', () => {
  const c = client();
  assert.equal(c.credentials.createDID('acc://alice.acme'), 'did:infrix:acc://alice.acme');
  assert.equal(c.credentials.createDID('alice.acme'), 'did:infrix:acc://alice.acme');
  assert.equal(c.credentials.createDID({ adi: 'acc://bob.acme' }), 'did:infrix:acc://bob.acme');
});

test('createDID rejects an empty ADI', () => {
  assert.throws(() => client().credentials.createDID(''));
});

test('presentationRequest assembles a selective-disclosure request', () => {
  const req = client().credentials.presentationRequest({
    credential: 'cred-1',
    disclose: ['age_over_21'],
    challenge: 'n0nce',
  });
  assert.deepEqual(req, { credential: 'cred-1', disclosedClaims: ['age_over_21'], challenge: 'n0nce' });
});

test('presentationRequest requires at least one disclosed claim', () => {
  assert.throws(() => client().credentials.presentationRequest({ credential: 'c', disclose: [] }));
});

test('present extracts the named claim as the private witness and proves (P1-4)', async () => {
  const c = client();
  const vc = {
    type: ['VerifiableCredential'],
    issuer: 'did:infrix:acc://issuer.acme',
    credentialSubject: { id: 'did:infrix:acc://alice.acme', age: '25' },
  };
  let captured: { predicate?: string; publicInputs?: unknown[]; privateInputs?: unknown[] } = {};
  const prover = {
    async prove(req: { predicate: string; publicInputs: unknown[]; privateInputs: unknown[] }) {
      captured = req;
      return { proof: 'ok' } as unknown as import('./index').PredicateProofEnvelope;
    },
  };
  await c.credentials.present(
    vc,
    { predicate: 'threshold_gte', publicInputs: [21], claimInputs: ['age'], holderSigner: new Uint8Array(64) },
    prover
  );
  assert.equal(captured.predicate, 'threshold_gte');
  assert.deepEqual(captured.publicInputs, [21]);
  // The VC's `age` claim ("25") became the private witness — never sent anywhere else.
  assert.deepEqual(captured.privateInputs, ['25']);
});

test('errors are typed with a branchable code + remedy (P4-3)', () => {
  const c = client();
  const assertTyped = (fn: () => unknown, code: string) => {
    try {
      fn();
      assert.fail(`expected ${code} to throw`);
    } catch (e) {
      assert.ok(e instanceof InfrixUserError, `${code}: expected InfrixUserError`);
      assert.equal((e as InfrixUserError).code, code);
      assert.ok((e as InfrixUserError).fixes.length > 0 && (e as InfrixUserError).fixes[0].label, `${code}: must carry a remedy`);
    }
  };
  assertTyped(() => c.credentials.createDID(''), 'INFRIX_INVALID_ADI');
  assertTyped(() => new InfrixClient('bogus-network'), 'INFRIX_UNKNOWN_NETWORK');
  assertTyped(() => c.credentials.presentationRequest({ credential: 'x', disclose: [] }), 'INFRIX_DISCLOSE_EMPTY');
});

test('present() throws typed, branchable claim errors (P4-3)', async () => {
  const c = client();
  const spec = { predicate: 'threshold_gte', publicInputs: [21], claimInputs: ['age'], holderSigner: new Uint8Array(64) };
  const prover = { async prove() { return {} as unknown as import('./index').PredicateProofEnvelope; } };
  await assert.rejects(
    () => c.credentials.present({ credentialSubject: { age: 'nope' } }, spec, prover),
    (e: unknown) => e instanceof InfrixUserError && e.code === 'INFRIX_CREDENTIAL_CLAIM_NOT_NUMERIC'
  );
  await assert.rejects(
    () => c.credentials.present({ credentialSubject: {} }, spec, prover),
    (e: unknown) => e instanceof InfrixUserError && e.code === 'INFRIX_CREDENTIAL_CLAIM_MISSING'
  );
});

test('present rejects a missing or non-numeric claim', async () => {
  const c = client();
  const prover = { async prove() { return { proof: 'x' } as unknown as import('./index').PredicateProofEnvelope; } };
  const base = { predicate: 'threshold_gte', publicInputs: [21], holderSigner: new Uint8Array(64) };
  await assert.rejects(
    () => c.credentials.present({ credentialSubject: {} }, { ...base, claimInputs: ['age'] }, prover),
    /has no claim/
  );
  await assert.rejects(
    () => c.credentials.present({ credentialSubject: { age: 'not-a-number' } }, { ...base, claimInputs: ['age'] }, prover),
    /not a numeric value/
  );
});

test('issue calls vc.issue with subjectDid + auto-injected disclosure context', async () => {
  const c = client();
  let captured: { method?: string; params?: Record<string, unknown> } = {};
  setFetch(async (_url: unknown, init: unknown) => {
    captured = JSON.parse((init as { body: string }).body);
    return { json: async () => ({ result: { id: 'vc-1', type: ['KYCCredential'] } }) };
  });
  try {
    const vc = await c.credentials.issue({
      subjectDID: 'did:infrix:acc://alice.acme',
      credentialTypes: ['KYCCredential'],
      claims: { tier: '2' },
    });
    assert.equal(vc.id, 'vc-1');
  } finally {
    restoreFetch();
  }
  assert.equal(captured.method, 'vc.issue');
  const p = captured.params ?? {};
  assert.equal(p.subjectDid, 'did:infrix:acc://alice.acme');
  assert.deepEqual(p.credentialTypes, ['KYCCredential']);
  // Disclosure context injected by the client (DX P0-3), so vc.issue is accepted.
  assert.equal(p.actor, 'acc://issuer.acme');
  assert.equal(p.purpose, 'issue');
});

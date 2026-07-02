// DX P1-3 — @infrix/client credentials sub-client tests.
//
// createDID and presentationRequest are offline/deterministic (no node).
// issue is verified against a mocked fetch, which also asserts the disclosure
// context (actor + purpose) is auto-injected from the constructor (DX P0-3).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient } from './index';

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

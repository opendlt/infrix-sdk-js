/**
 * Wallet & Identity Control Center SDK tests (nextux-08).
 *
 * They verify the signature explainer against a Go-generated fixture (so the
 * plain-language explanation matches across languages), the wallet-connect
 * address-mismatch fail-closed, and the scoped-session validation invariants.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  explainSignature,
  SignatureUnexplainableError,
  connectWithChallenge,
  isConnected,
  validateSessionRequest,
  normalizeSessionRequest,
  SessionScopeError,
} from './index';
import type { SignatureRequest, Explanation } from './index';
import { INTENT_GOAL_TYPES } from '../types/governance';

interface Fixture {
  connect: { challenge: string; signature: string; address: string };
  signatureRequest: SignatureRequest;
  explanation: Explanation;
}

function loadFixture(): Fixture {
  const p = join(__dirname, '..', '..', 'src', 'identity', 'identity.fixture.json');
  return JSON.parse(readFileSync(p, 'utf8')) as Fixture;
}

test('the signature explainer matches the Go explanation (cross-language)', () => {
  const { signatureRequest, explanation } = loadFixture();
  const ex = explainSignature(signatureRequest);
  assert.equal(ex.action, explanation.action);
  assert.equal(ex.network, explanation.network);
  assert.equal(ex.identityTouched, explanation.identityTouched);
  assert.equal(ex.requiredKeyPage, explanation.requiredKeyPage);
  assert.equal(ex.fundsOrCreditsMove, explanation.fundsOrCreditsMove);
  assert.equal(ex.dataDisclosed, explanation.dataDisclosed);
  assert.equal(ex.agentInitiated, explanation.agentInitiated);
  assert.equal(ex.expectedProof, explanation.expectedProof);
  assert.deepEqual(ex.irreversibleEffects, explanation.irreversibleEffects);
  assert.deepEqual(ex.warnings, explanation.warnings);
  assert.equal(ex.plain, explanation.plain);
});

test('explain fails closed on an unexplainable request', () => {
  assert.throws(() => explainSignature({ signer: 'acc://a.acme/book/1', network: 'Kermit' } as SignatureRequest), SignatureUnexplainableError);
  assert.throws(() => explainSignature({ goalType: 'SETTLEMENT', network: 'Kermit' } as SignatureRequest), SignatureUnexplainableError);
  assert.throws(() => explainSignature({ goalType: 'SETTLEMENT', signer: 'acc://a.acme/book/1' } as SignatureRequest), SignatureUnexplainableError);
});

test('the explainer refuses a goal the node refuses (SEND_TOKENS, ADD_CREDITS, WRITE_DATA were names it carried)', () => {
  for (const goal of ['SEND_TOKENS', 'ADD_CREDITS', 'WRITE_DATA', 'GOVERNED_TRANSFER', 'settlement']) {
    assert.throws(
      () => explainSignature({ goalType: goal, signer: 'acc://a.acme/book/1', network: 'Kermit' }),
      (e: unknown) => e instanceof SignatureUnexplainableError && String((e as Error).message).includes(goal),
      `${goal} must be refused, naming it`,
    );
  }
});

test('every node goal is explainable (refusing what the node refuses must not refuse what it accepts)', () => {
  for (const goal of INTENT_GOAL_TYPES) {
    const ex = explainSignature({ goalType: goal, signer: 'acc://a.acme/book/1', network: 'local' });
    assert.ok(ex.action.trim() !== '' && ex.plain.trim() !== '', `${goal} produced a blank explanation`);
  }
  assert.ok(INTENT_GOAL_TYPES.length >= 81);
});

test('a settlement is explained by what its legs do, and always moves value', () => {
  const legs = (...kinds: string[]) => ({ legs: kinds.map((kind) => ({ kind })) });
  const cases: Array<[string, Record<string, unknown> | undefined, string]> = [
    ['direct transfer', legs('direct'), 'Send tokens'],
    ['credit purchase', legs('credit_issue'), 'Add credits'],
    ['credit transfer', legs('credit_transfer'), 'Transfer credits'],
    ['credit burn', legs('credit_burn'), 'Burn credits'],
    ['escrow', legs('escrow'), 'Escrow funds'],
    ['bridge', legs('bridge'), 'Bridge tokens'],
    ['two credit purchases', legs('credit_issue', 'credit_issue'), 'Add credits'],
    ['mixed kinds', legs('direct', 'credit_issue'), 'Settle value (2 legs of mixed kinds)'],
    ['no legs named', undefined, 'Settle value'],
    ['a leg of no recognised kind', legs('mystery'), 'Settle value'],
  ];
  for (const [name, customParams, action] of cases) {
    const ex = explainSignature({ goalType: 'SETTLEMENT', customParams, signer: 'acc://a.acme/book/1', network: 'local' });
    assert.equal(ex.action, action, name);
    assert.equal(ex.fundsOrCreditsMove, true, `${name}: a settlement moves value even when no assets are listed`);
  }
});

test('data-recording and disclosing goals are flagged as disclosing data; a swap is not', () => {
  for (const goal of ['DISCLOSURE_GRANT', 'DISCLOSURE_APPROVE', 'DISCLOSURE_REGISTER_KEY', 'OBJECT_CREATE', 'OBJECT_MUTATE']) {
    const ex = explainSignature({ goalType: goal, signer: 'acc://a.acme/book/1', network: 'local' });
    assert.equal(ex.dataDisclosed, true, `${goal} must be flagged as disclosing data`);
  }
  assert.equal(explainSignature({ goalType: 'SWAP', signer: 'acc://a.acme/book/1', network: 'local' }).dataDisclosed, false);
});

test('a mainnet signature is warned', () => {
  const ex = explainSignature({ goalType: 'SETTLEMENT', signer: 'acc://a.acme/book/1', network: 'mainnet' });
  assert.ok(ex.warnings.some((w) => /MAINNET/i.test(w)));
});

test('a Go-signed challenge connects, and a tampered address fails closed', () => {
  const { connect } = loadFixture();
  const wc = connectWithChallenge(connect.challenge, connect.signature, { now: '2026-06-09T00:01:00Z' });
  assert.equal(wc.connected, true);
  assert.equal(wc.address.toLowerCase(), connect.address.toLowerCase());
  assert.equal(wc.publicKeyRecovered, true);
  assert.ok(isConnected(wc));
  // No private key material in the connection.
  assert.ok(!JSON.stringify(wc).toLowerCase().includes('privatekey'));

  // Tamper the challenge's claimed address -> recovered != claimed -> throws.
  const tampered = connect.challenge.replace(connect.address, '0x0000000000000000000000000000000000000000');
  assert.throws(() => connectWithChallenge(tampered, connect.signature, { now: '2026-06-09T00:01:00Z' }));
});

test('a bare address is not "connected" without backing', () => {
  assert.equal(isConnected({ provider: 'metamask', connected: true, address: '0xabc', publicKeyRecovered: false, liveProvider: false }), false);
});

test('a scoped session validates; a scope-less or implicit-mainnet one is refused', () => {
  assert.doesNotThrow(() => validateSessionRequest(normalizeSessionRequest({ capabilities: ['proof.verify'] })));
  assert.throws(() => validateSessionRequest(normalizeSessionRequest({ capabilities: [] })), SessionScopeError);
  assert.throws(() => validateSessionRequest(normalizeSessionRequest({ capabilities: ['proof.verify'], network: 'mainnet' })), SessionScopeError);
  assert.doesNotThrow(() => validateSessionRequest(normalizeSessionRequest({ capabilities: ['proof.verify'], network: 'mainnet', allowMainnet: true })));
});

test('normalize fills safe defaults (local network, finite TTL)', () => {
  const r = normalizeSessionRequest({ capabilities: ['proof.verify'] });
  assert.equal(r.network, 'local');
  assert.equal(r.ttlSeconds, 1800);
});

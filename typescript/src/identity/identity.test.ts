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
  assert.throws(() => explainSignature({ goalType: 'SEND_TOKENS', network: 'Kermit' } as SignatureRequest), SignatureUnexplainableError);
  assert.throws(() => explainSignature({ goalType: 'SEND_TOKENS', signer: 'acc://a.acme/book/1' } as SignatureRequest), SignatureUnexplainableError);
});

test('a mainnet signature is warned', () => {
  const ex = explainSignature({ goalType: 'SEND_TOKENS', signer: 'acc://a.acme/book/1', network: 'mainnet' });
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

// @infrix/metamask tests (adoption-10): one-call flow against a mock provider +
// mock api, typed/actionable errors, provider compatibility status, and
// challenge freshness.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createInfrixMetaMask,
  translateError,
  providerStatus,
  buildChallenge,
  assertChallengeFresh,
  InfrixMetaMaskError,
  MetaMaskErrorCode,
} from '../index.js';

// A mock MetaMaskApi (the shape withMetaMask(client).metamask exposes).
function mockApi() {
  return {
    async connect(provider) {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      return { provider, address: accounts[0] };
    },
    async submitIntent(params) {
      return { intentId: 'intent-mm-1', status: 'completed', l0KeyPageVerified: true, signer: params.signer };
    },
    async recoverPublicKey() {
      return { address: '0xabc', compressed: '0x02', uncompressed: '0x04' };
    },
  };
}

function mockProvider({ reject = false } = {}) {
  return {
    isMetaMask: true,
    async request({ method }) {
      if (reject) {
        const e = new Error('User rejected the request.');
        e.code = 4001;
        throw e;
      }
      if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
      if (method === 'eth_signTypedData_v4') return '0xsignature';
      return null;
    },
  };
}

test('one call connects and submits a governed intent through a mock', async () => {
  const mm = createInfrixMetaMask({ api: mockApi() });
  const conn = await mm.connect(mockProvider());
  assert.equal(conn.address, '0x1111111111111111111111111111111111111111');
  const result = await mm.submitGovernedIntent({ signer: 'acc://alice.acme/book/1', signerVersion: 1, goal: { type: 'TOKEN_TRANSFER' } });
  assert.equal(result.intentId, 'intent-mm-1');
  assert.equal(result.l0KeyPageVerified, true);
});

test('provider compatibility status', () => {
  assert.equal(providerStatus(undefined).present, false);
  const s = providerStatus(mockProvider());
  assert.equal(s.present, true);
  assert.equal(s.isMetaMask, true);
  assert.equal(s.ready, true);
});

test('connect with no provider throws a typed ProviderMissing error', async () => {
  const mm = createInfrixMetaMask({ api: mockApi() });
  await assert.rejects(() => mm.connect(undefined), (e) => {
    assert.ok(e instanceof InfrixMetaMaskError);
    assert.equal(e.code, MetaMaskErrorCode.ProviderMissing);
    return true;
  });
});

test('user rejection is translated to a typed, retryable error', async () => {
  const mm = createInfrixMetaMask({ api: mockApi() });
  await assert.rejects(() => mm.connect(mockProvider({ reject: true })), (e) => {
    assert.ok(e instanceof InfrixMetaMaskError);
    assert.equal(e.code, MetaMaskErrorCode.UserRejected);
    assert.equal(e.retryable, true);
    assert.ok(e.fixes.length > 0);
    return true;
  });
});

test('translateError maps common provider errors', () => {
  assert.equal(translateError({ code: 4001, message: 'denied' }).code, MetaMaskErrorCode.UserRejected);
  assert.equal(translateError(new Error('no metamask provider')).code, MetaMaskErrorCode.ProviderMissing);
  assert.equal(translateError(new Error('address does not match')).code, MetaMaskErrorCode.AddressMismatch);
  assert.equal(translateError(new Error('weird')).code, MetaMaskErrorCode.RecoveryFailed);
});

test('challenge freshness: fresh passes, expired fails closed', () => {
  const now = 1_000_000_000_000;
  const fresh = buildChallenge({ signer: 'acc://a/book/1', address: '0xabc', nowMs: now, ttlMs: 60_000 });
  assert.doesNotThrow(() => assertChallengeFresh(fresh, now + 30_000));
  assert.throws(() => assertChallengeFresh(fresh, now + 120_000), (e) => {
    assert.equal(e.code, MetaMaskErrorCode.ChallengeInvalid);
    return true;
  });
  assert.throws(() => assertChallengeFresh({}, now), /missing/);
});

test('factory requires an endpoint or injected api', () => {
  assert.throws(() => createInfrixMetaMask({}), /provide \{ endpoint \}/);
});

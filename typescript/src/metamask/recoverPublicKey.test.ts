/**
 * Public-key recovery tests (Priority 01 — MetaMask onboarding).
 *
 * The fixture is a deterministic personal_sign over a fixed challenge with a
 * fixed (test-only) private key, captured once; recovery must reproduce the
 * key + EIP-55 address from (message, signature) alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  recoverPublicKey,
  recoverAndVerify,
  buildChallenge,
  parseChallenge,
  assertChallengeFresh,
  ethAddressFromPublicKey,
  CHALLENGE_PURPOSE,
} from './recoverPublicKey';
import { MetaMaskAddressMismatch, MetaMaskPublicKeyRecoveryFailed, MetaMaskChallengeInvalid } from './errors';

// --- deterministic fixture (test-only key; do NOT use in production) ---
const FIXTURE_MESSAGE =
  'Infrix MetaMask public-key binding\n' +
  'domain: kermit.test\n' +
  'signer: acc://alice.acme/book/1\n' +
  'address: PLACEHOLDER\n' +
  'nonce: 0123456789abcdef0123456789abcdef\n' +
  'issuedAt: 2026-06-07T00:00:00Z\n' +
  'expiresAt: 2026-06-07T00:05:00Z\n' +
  'purpose: recover-public-key-for-accumulate-eip712';
const FIXTURE_SIGNATURE =
  '0x349851d092e4b2a3cf94c5d659d428f636b6758b6f662b128ab2273a4c3490f8' +
  '5fc0a27217c2afee38bcc9abcd35cef7d4cca5f22d006b354fb74ee6421546b51b';
const FIXTURE_ADDRESS = '0x27000f84214f79b0600aa86841958b13ac98242a';
const FIXTURE_COMPRESSED = '0x03cacaeb5a989aad96d4f0ee72e612aa371aa9232ab1a74688f6348690a5e689e2';

test('recovers the public key + address from a deterministic personal_sign fixture', () => {
  const r = recoverPublicKey(FIXTURE_MESSAGE, FIXTURE_SIGNATURE);
  assert.equal(r.address.toLowerCase(), FIXTURE_ADDRESS);
  assert.equal(r.compressed.toLowerCase(), FIXTURE_COMPRESSED);
  assert.equal(r.uncompressed.length, 2 + 130); // 0x + 65 bytes
  // address is EIP-55 checksummed (mixed case), not all-lower
  assert.notEqual(r.address, r.address.toLowerCase());
});

test('recoverAndVerify accepts the matching address (case-insensitive)', () => {
  const r = recoverAndVerify(FIXTURE_MESSAGE, FIXTURE_SIGNATURE, FIXTURE_ADDRESS.toUpperCase());
  assert.equal(r.address.toLowerCase(), FIXTURE_ADDRESS);
});

test('rejects an altered challenge (recovers a different key -> address mismatch)', () => {
  const altered = FIXTURE_MESSAGE.replace('domain: kermit.test', 'domain: evil.test');
  assert.throws(
    () => recoverAndVerify(altered, FIXTURE_SIGNATURE, FIXTURE_ADDRESS),
    MetaMaskAddressMismatch,
  );
});

test('rejects an address mismatch', () => {
  assert.throws(
    () => recoverAndVerify(FIXTURE_MESSAGE, FIXTURE_SIGNATURE, '0x0000000000000000000000000000000000000000'),
    MetaMaskAddressMismatch,
  );
});

test('fails closed on a malformed signature', () => {
  assert.throws(() => recoverPublicKey(FIXTURE_MESSAGE, '0xdeadbeef'), MetaMaskPublicKeyRecoveryFailed);
  assert.throws(() => recoverPublicKey(FIXTURE_MESSAGE, 'not-hex'), MetaMaskPublicKeyRecoveryFailed);
});

test('ethAddressFromPublicKey rejects a non-uncompressed key', () => {
  assert.throws(() => ethAddressFromPublicKey(new Uint8Array(33)), MetaMaskPublicKeyRecoveryFailed);
});

test('buildChallenge / parseChallenge round-trip', () => {
  const params = {
    domain: 'kermit.test',
    signer: 'acc://alice.acme/book/1',
    address: FIXTURE_ADDRESS,
    nonce: '0123456789abcdef0123456789abcdef',
    issuedAt: '2026-06-07T00:00:00Z',
    expiresAt: '2026-06-07T00:05:00Z',
  };
  const text = buildChallenge(params);
  assert.ok(text.includes(`purpose: ${CHALLENGE_PURPOSE}`));
  assert.deepEqual(parseChallenge(text), params);
});

test('buildChallenge fails closed on a missing field', () => {
  assert.throws(
    () => buildChallenge({ domain: '', signer: 's', address: 'a', nonce: 'n', issuedAt: 'i', expiresAt: 'e' }),
    MetaMaskChallengeInvalid,
  );
});

test('parseChallenge rejects a tampered header / purpose', () => {
  assert.throws(() => parseChallenge('WRONG HEADER\npurpose: x'), MetaMaskChallengeInvalid);
  const badPurpose = buildChallenge({
    domain: 'd', signer: 's', address: 'a', nonce: 'n', issuedAt: 'i', expiresAt: 'e',
  }).replace(CHALLENGE_PURPOSE, 'something-else');
  assert.throws(() => parseChallenge(badPurpose), MetaMaskChallengeInvalid);
});

test('assertChallengeFresh accepts unexpired and rejects expired', () => {
  const fresh = buildChallenge({
    domain: 'd', signer: 's', address: 'a', nonce: 'n',
    issuedAt: '2026-06-07T00:00:00Z', expiresAt: '2026-06-07T00:05:00Z',
  });
  // 1 minute after issue -> fresh
  assert.doesNotThrow(() => assertChallengeFresh(fresh, Date.parse('2026-06-07T00:01:00Z')));
  // 10 minutes after issue -> expired
  assert.throws(() => assertChallengeFresh(fresh, Date.parse('2026-06-07T00:10:00Z')), MetaMaskChallengeInvalid);
});

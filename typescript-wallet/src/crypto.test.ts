import test from 'node:test';
import assert from 'node:assert/strict';
import { generateEd25519KeyPair, signEd25519, verifyEd25519 } from './crypto';

test('Ed25519 signatures verify against the generated public key', async () => {
  const keyPair = await generateEd25519KeyPair();
  const message = new TextEncoder().encode('infrix-wallet-crypto-test');
  const signature = await signEd25519(keyPair.privateKey, message);

  assert.equal(keyPair.publicKey.length, 32);
  assert.equal(signature.length, 64);
  assert.equal(await verifyEd25519(keyPair.publicKey, message, signature), true);
});

test('Ed25519 verification rejects tampered messages and random signature-shaped bytes', async () => {
  const keyPair = await generateEd25519KeyPair();
  const message = new TextEncoder().encode('infrix-wallet-crypto-test');
  const signature = await signEd25519(keyPair.privateKey, message);
  const tampered = new TextEncoder().encode('infrix-wallet-crypto-test!');

  assert.equal(await verifyEd25519(keyPair.publicKey, tampered, signature), false);
  assert.equal(await verifyEd25519(keyPair.publicKey, message, new Uint8Array(64)), false);
});

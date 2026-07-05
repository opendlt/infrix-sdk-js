/**
 * Encrypted key export tests (audit Z3).
 *
 * New exports use a versioned PBKDF2-HMAC-SHA-256 envelope with a random salt, so:
 *   - two exports of the same key under the same password differ (salt+nonce),
 *   - a leaked export is not cheaply brute-forceable (high iteration count),
 *   - the wrong password fails authentication,
 *   - legacy unsalted-SHA-256 exports still import (backward compatibility).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, createCipheriv } from 'node:crypto';

import { MemoryKeyStore } from './keystore';
import { generateEd25519KeyPair, toHex } from './crypto';

test('export → import round-trips to the same key', async () => {
  const ks = new MemoryKeyStore();
  const info = await ks.generateKey('ed25519');
  const blob = await ks.exportKey(info.publicKey, 'hunter2');
  const imported = await new MemoryKeyStore().importKey(blob, 'hunter2');
  assert.equal(toHex(imported.publicKey), toHex(info.publicKey));
});

test('new export uses the versioned PBKDF2 envelope with a high iteration count', async () => {
  const ks = new MemoryKeyStore();
  const info = await ks.generateKey();
  const blob = await ks.exportKey(info.publicKey, 'pw');
  assert.deepEqual(Array.from(blob.slice(0, 4)), [0x49, 0x57, 0x4b, 0x31], 'magic IWK1');
  assert.equal(blob[4], 0x01, 'kdf id = PBKDF2-HMAC-SHA256');
  const iters = ((blob[5] << 24) | (blob[6] << 16) | (blob[7] << 8) | blob[8]) >>> 0;
  assert.ok(iters >= 100_000, `iteration count ${iters} must be high`);
});

test('two exports of the same key under the same password are distinct ciphertexts', async () => {
  const ks = new MemoryKeyStore();
  const info = await ks.generateKey();
  const a = await ks.exportKey(info.publicKey, 'same');
  const b = await ks.exportKey(info.publicKey, 'same');
  assert.notEqual(toHex(a), toHex(b), 'random salt/nonce must make exports differ');
  // Salt region (bytes 9..25) must differ between the two exports.
  assert.notEqual(toHex(a.slice(9, 25)), toHex(b.slice(9, 25)), 'salts must differ');
  // Both still import to the same key.
  const ka = await new MemoryKeyStore().importKey(a, 'same');
  const kb = await new MemoryKeyStore().importKey(b, 'same');
  assert.equal(toHex(ka.publicKey), toHex(info.publicKey));
  assert.equal(toHex(kb.publicKey), toHex(info.publicKey));
});

test('the wrong password fails to import', async () => {
  const ks = new MemoryKeyStore();
  const info = await ks.generateKey();
  const blob = await ks.exportKey(info.publicKey, 'right');
  await assert.rejects(() => new MemoryKeyStore().importKey(blob, 'wrong'));
});

test('legacy unsalted-SHA-256 exports still import (backward compatibility)', async () => {
  const kp = await generateEd25519KeyPair();
  // Reproduce the pre-Z3 legacy format exactly: sha256 key, nonce(12)‖ct‖tag(16).
  const key = createHash('sha256').update('infrix-wallet:legacypw').digest();
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ct = Buffer.concat([cipher.update(Buffer.from(kp.privateKey)), cipher.final()]);
  const tag = cipher.getAuthTag();
  const legacy = new Uint8Array(Buffer.concat([nonce, ct, tag]));

  const imported = await new MemoryKeyStore().importKey(legacy, 'legacypw');
  assert.equal(toHex(imported.publicKey), toHex(kp.publicKey));
});

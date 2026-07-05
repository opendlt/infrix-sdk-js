/**
 * Key storage backends for the Infrix wallet.
 *
 * Provides an in-memory store for testing and an encrypted store that uses
 * AES-256-GCM via the Web Crypto API for production use.
 */

import { generateEd25519KeyPair, toHex, sha256, Ed25519KeyPair, decodePrivateKeyEnvelope } from './crypto';

/** Metadata about a stored key. */
export interface KeyInfo {
  publicKey: Uint8Array;
  algorithm: string;
  createdAt: Date;
  label: string;
}

/** Key storage interface. */
export interface KeyStore {
  generateKey(algorithm?: string): Promise<KeyInfo>;
  sign(publicKey: Uint8Array, message: Uint8Array): Promise<Uint8Array>;
  listKeys(): Promise<KeyInfo[]>;
  deleteKey(publicKey: Uint8Array): Promise<void>;
  exportKey(publicKey: Uint8Array, password: string): Promise<Uint8Array>;
  importKey(encryptedKey: Uint8Array, password: string): Promise<KeyInfo>;
}

// ---- In-Memory KeyStore ----

interface StoredKey {
  keyPair: Ed25519KeyPair;
  info: KeyInfo;
}

/** In-memory key store for testing and development. */
export class MemoryKeyStore implements KeyStore {
  private keys = new Map<string, StoredKey>();

  async generateKey(algorithm = 'ed25519'): Promise<KeyInfo> {
    if (algorithm !== 'ed25519') {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
    const kp = await generateEd25519KeyPair();
    const info: KeyInfo = {
      publicKey: kp.publicKey,
      algorithm: 'ed25519',
      createdAt: new Date(),
      label: '',
    };
    this.keys.set(toHex(kp.publicKey), { keyPair: kp, info });
    return info;
  }

  async sign(publicKey: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
    const stored = this.keys.get(toHex(publicKey));
    if (!stored) throw new Error('Key not found');
    const { signEd25519 } = await import('./crypto');
    return signEd25519(stored.keyPair.privateKey, message);
  }

  async listKeys(): Promise<KeyInfo[]> {
    return Array.from(this.keys.values()).map(k => k.info);
  }

  async deleteKey(publicKey: Uint8Array): Promise<void> {
    const id = toHex(publicKey);
    if (!this.keys.has(id)) throw new Error('Key not found');
    this.keys.delete(id);
  }

  async exportKey(publicKey: Uint8Array, password: string): Promise<Uint8Array> {
    const stored = this.keys.get(toHex(publicKey));
    if (!stored) throw new Error('Key not found');
    return encryptWithPassword(stored.keyPair.privateKey, password);
  }

  async importKey(encryptedKey: Uint8Array, password: string): Promise<KeyInfo> {
    const privateKey = await decryptWithPassword(encryptedKey, password);
    const { publicKey } = decodePrivateKeyEnvelope(privateKey);
    const kp: Ed25519KeyPair = { publicKey, privateKey };
    const info: KeyInfo = {
      publicKey,
      algorithm: 'ed25519',
      createdAt: new Date(),
      label: '',
    };
    this.keys.set(toHex(publicKey), { keyPair: kp, info });
    return info;
  }
}

// ---- Encrypted Key Store Helpers ----
//
// Versioned password-based key envelope (audit Z3). New exports derive the AES-256
// key with PBKDF2-HMAC-SHA-256 over a random 128-bit salt and a high iteration
// count, so a leaked export cannot be cheaply brute-forced offline and two exports
// of the same key under the same password produce different ciphertexts. The KDF
// id, iteration count, and salt travel inside the envelope, so parameters can be
// migrated in future without breaking older exports.
//
// New wire format (all binary):
//   magic "IWK1" (4) | kdfId (1) | iterations uint32 BE (4) | salt (16) | nonce (12) | ciphertext‖GCM tag
//
// Legacy exports (the pre-Z3 0.1.0 format: unsalted sha256('infrix-wallet:'+pw)
// key, nonce(12)‖ciphertext‖tag(16), no magic) are still ACCEPTED on import for
// backward compatibility; re-exporting an imported key upgrades it to the new
// envelope. New code never PRODUCES the legacy format.

const ENVELOPE_MAGIC = [0x49, 0x57, 0x4b, 0x31]; // "IWK1"
const KDF_PBKDF2_SHA256 = 0x01;
const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 baseline for PBKDF2-HMAC-SHA-256
const SALT_LEN = 16;
const NONCE_LEN = 12;
const HEADER_LEN = ENVELOPE_MAGIC.length + 1 + 4 + SALT_LEN + NONCE_LEN; // 37

function hasWebSubtle(): boolean {
  return typeof globalThis.crypto !== 'undefined' && !!globalThis.crypto.subtle;
}

function hasEnvelopeMagic(buf: Uint8Array): boolean {
  if (buf.length < HEADER_LEN) return false;
  for (let i = 0; i < ENVELOPE_MAGIC.length; i++) if (buf[i] !== ENVELOPE_MAGIC[i]) return false;
  return true;
}

function randomBytes(n: number): Uint8Array {
  if (hasWebSubtle() && typeof globalThis.crypto.getRandomValues === 'function') {
    return globalThis.crypto.getRandomValues(new Uint8Array(n));
  }
  const { randomBytes: rb } = require('crypto');
  return new Uint8Array(rb(n));
}

function u32be(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}
function readU32be(b: Uint8Array, off: number): number {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}

/**
 * Encrypt data with a password using AES-256-GCM keyed by PBKDF2-HMAC-SHA-256
 * with a random salt. Produces the versioned "IWK1" envelope.
 */
async function encryptWithPassword(data: Uint8Array, password: string): Promise<Uint8Array> {
  const salt = randomBytes(SALT_LEN);
  const nonce = randomBytes(NONCE_LEN);
  const iterations = PBKDF2_ITERATIONS;
  const ctTag = await aesGcmEncrypt(data, password, salt, iterations, nonce);

  const out = new Uint8Array(HEADER_LEN + ctTag.length);
  let o = 0;
  out.set(ENVELOPE_MAGIC, o); o += ENVELOPE_MAGIC.length;
  out[o++] = KDF_PBKDF2_SHA256;
  out.set(u32be(iterations), o); o += 4;
  out.set(salt, o); o += SALT_LEN;
  out.set(nonce, o); o += NONCE_LEN;
  out.set(ctTag, o);
  return out;
}

/**
 * Decrypt an "IWK1" envelope, or a legacy unsalted-SHA-256 export (backward compat).
 */
async function decryptWithPassword(blob: Uint8Array, password: string): Promise<Uint8Array> {
  if (hasEnvelopeMagic(blob)) {
    let o = ENVELOPE_MAGIC.length;
    const kdf = blob[o++];
    if (kdf !== KDF_PBKDF2_SHA256) throw new Error(`unsupported key envelope KDF id: ${kdf}`);
    const iterations = readU32be(blob, o); o += 4;
    const salt = blob.slice(o, o + SALT_LEN); o += SALT_LEN;
    const nonce = blob.slice(o, o + NONCE_LEN); o += NONCE_LEN;
    const ctTag = blob.slice(o);
    return aesGcmDecrypt(ctTag, password, salt, iterations, nonce);
  }
  return decryptLegacy(blob, password);
}

// AES-256-GCM with a PBKDF2-derived key. Returns ciphertext‖tag. WebCrypto where
// available, Node crypto otherwise; the wire format is identical so an export made
// in one runtime imports in the other (PBKDF2-HMAC-SHA-256 is deterministic).
async function aesGcmEncrypt(
  data: Uint8Array, password: string, salt: Uint8Array, iterations: number, nonce: Uint8Array
): Promise<Uint8Array> {
  if (hasWebSubtle()) {
    const key = await deriveAesKeyWeb(password, salt, iterations, ['encrypt']);
    const enc = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, data);
    return new Uint8Array(enc);
  }
  const crypto = require('crypto');
  const key = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), Buffer.from(salt), iterations, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, Buffer.from(nonce));
  const ct = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return new Uint8Array(Buffer.concat([ct, tag]));
}

async function aesGcmDecrypt(
  ctTag: Uint8Array, password: string, salt: Uint8Array, iterations: number, nonce: Uint8Array
): Promise<Uint8Array> {
  if (hasWebSubtle()) {
    const key = await deriveAesKeyWeb(password, salt, iterations, ['decrypt']);
    const dec = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ctTag);
    return new Uint8Array(dec);
  }
  const crypto = require('crypto');
  const key = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), Buffer.from(salt), iterations, 32, 'sha256');
  const tagStart = ctTag.length - 16;
  const ciphertext = ctTag.slice(0, tagStart);
  const tag = ctTag.slice(tagStart);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce));
  decipher.setAuthTag(Buffer.from(tag));
  return new Uint8Array(Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]));
}

async function deriveAesKeyWeb(
  password: string, salt: Uint8Array, iterations: number, usages: KeyUsage[]
): Promise<CryptoKey> {
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveKey'],
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

// Legacy pre-Z3 format: unsalted key = sha256('infrix-wallet:'+password), layout
// nonce(12)‖ciphertext‖tag(16). Accepted on import only; never produced.
async function decryptLegacy(encrypted: Uint8Array, password: string): Promise<Uint8Array> {
  const nonce = encrypted.slice(0, 12);
  if (hasWebSubtle()) {
    const keyData = await sha256(new TextEncoder().encode('infrix-wallet:' + password));
    const key = await globalThis.crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce }, key, encrypted.slice(12),
    );
    return new Uint8Array(decrypted);
  }
  const crypto = require('crypto');
  const key = crypto.createHash('sha256').update('infrix-wallet:' + password).digest();
  const tagStart = encrypted.length - 16;
  const ciphertext = encrypted.slice(12, tagStart);
  const tag = encrypted.slice(tagStart);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce));
  decipher.setAuthTag(Buffer.from(tag));
  return new Uint8Array(Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]));
}

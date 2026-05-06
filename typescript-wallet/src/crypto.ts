/**
 * Cryptographic primitives for the Infrix wallet.
 *
 * Uses real Ed25519 via Web Crypto where available, with Node.js crypto
 * as the non-browser fallback. Key pairs are generated locally; private
 * keys never leave the client.
 */

/** A raw Ed25519 key pair. */
export interface Ed25519KeyPair {
  publicKey: Uint8Array;  // 32 bytes
  privateKey: Uint8Array; // encoded private-key envelope
}

/** Generate a new Ed25519 key pair. */
export async function generateEd25519KeyPair(): Promise<Ed25519KeyPair> {
  if (hasWebCrypto()) {
    try {
      const keyPair = await globalThis.crypto.subtle.generateKey(
        { name: 'Ed25519' } as AlgorithmIdentifier,
        true,
        ['sign', 'verify'],
      ) as CryptoKeyPair;
      const publicKey = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', keyPair.publicKey));
      const pkcs8 = new Uint8Array(await globalThis.crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
      return { publicKey, privateKey: encodePrivateKeyEnvelope(pkcs8, publicKey) };
    } catch {
      // Fall through to Node.js crypto if this runtime exposes Web Crypto
      // but not Ed25519.
    }
  }

  const crypto = require('crypto');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
  const publicRaw = rawEd25519PublicKeyFromSPKI(new Uint8Array(publicDer));
  return { publicKey: publicRaw, privateKey: encodePrivateKeyEnvelope(new Uint8Array(pkcs8), publicRaw) };
}

/** Sign a message using an Ed25519 private key. */
export async function signEd25519(privateKey: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const { pkcs8 } = decodePrivateKeyEnvelope(privateKey);

  if (hasWebCrypto()) {
    try {
      const key = await globalThis.crypto.subtle.importKey(
        'pkcs8',
        pkcs8,
        { name: 'Ed25519' } as AlgorithmIdentifier,
        false,
        ['sign'],
      );
      return new Uint8Array(await globalThis.crypto.subtle.sign({ name: 'Ed25519' } as AlgorithmIdentifier, key, message));
    } catch {
      // Fall through to Node.js crypto.
    }
  }

  const crypto = require('crypto');
  const key = crypto.createPrivateKey({ key: Buffer.from(pkcs8), format: 'der', type: 'pkcs8' });
  const signature = crypto.sign(null, Buffer.from(message), key) as Buffer;
  return new Uint8Array(signature);
}

/** Verify an Ed25519 signature. */
export async function verifyEd25519(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  if (publicKey.length !== 32 || signature.length !== 64) {
    return false;
  }

  if (hasWebCrypto()) {
    try {
      const key = await globalThis.crypto.subtle.importKey(
        'raw',
        publicKey,
        { name: 'Ed25519' } as AlgorithmIdentifier,
        false,
        ['verify'],
      );
      return globalThis.crypto.subtle.verify({ name: 'Ed25519' } as AlgorithmIdentifier, key, signature, message);
    } catch {
      // Fall through to Node.js crypto.
    }
  }

  const crypto = require('crypto');
  const key = crypto.createPublicKey({ key: Buffer.from(spkiFromRawEd25519PublicKey(publicKey)), format: 'der', type: 'spki' });
  return crypto.verify(null, Buffer.from(message), key, Buffer.from(signature));
}

/** SHA-256 hash using Web Crypto or Node.js crypto. */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hash);
  }
  const { createHash } = require('crypto');
  const h = createHash('sha256').update(data).digest();
  return new Uint8Array(h.buffer, h.byteOffset, h.byteLength);
}

/** Convert bytes to hex string. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Convert hex string to bytes. */
export function fromHex(hex: string): Uint8Array {
  hex = hex.replace(/^0x/i, '');
  if (hex.length % 2 !== 0) {
    throw new Error('hex string must have even length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error('hex string contains non-hex characters');
    }
    bytes[i / 2] = byte;
  }
  return bytes;
}

const PRIVATE_KEY_ENVELOPE_MAGIC = [0x49, 0x46, 0x52, 0x58, 0x45, 0x44, 0x31]; // IFRXED1
const ED25519_SPKI_PREFIX = fromHex('302a300506032b6570032100');

function hasWebCrypto(): boolean {
  return typeof globalThis.crypto !== 'undefined' && !!globalThis.crypto.subtle;
}

function encodePrivateKeyEnvelope(pkcs8: Uint8Array, publicKey: Uint8Array): Uint8Array {
  if (publicKey.length !== 32) {
    throw new Error('Ed25519 public key must be 32 bytes');
  }
  if (pkcs8.length > 0xffff) {
    throw new Error('Ed25519 private key encoding is too large');
  }
  const out = new Uint8Array(PRIVATE_KEY_ENVELOPE_MAGIC.length + 2 + pkcs8.length + publicKey.length);
  out.set(PRIVATE_KEY_ENVELOPE_MAGIC, 0);
  out[PRIVATE_KEY_ENVELOPE_MAGIC.length] = (pkcs8.length >> 8) & 0xff;
  out[PRIVATE_KEY_ENVELOPE_MAGIC.length + 1] = pkcs8.length & 0xff;
  out.set(pkcs8, PRIVATE_KEY_ENVELOPE_MAGIC.length + 2);
  out.set(publicKey, PRIVATE_KEY_ENVELOPE_MAGIC.length + 2 + pkcs8.length);
  return out;
}

export function decodePrivateKeyEnvelope(privateKey: Uint8Array): { pkcs8: Uint8Array; publicKey: Uint8Array } {
  if (privateKey.length < PRIVATE_KEY_ENVELOPE_MAGIC.length + 2 + 32) {
    throw new Error('invalid Ed25519 private key envelope');
  }
  for (let i = 0; i < PRIVATE_KEY_ENVELOPE_MAGIC.length; i++) {
    if (privateKey[i] !== PRIVATE_KEY_ENVELOPE_MAGIC[i]) {
      throw new Error('unsupported Ed25519 private key encoding');
    }
  }
  const pkcs8Len = (privateKey[PRIVATE_KEY_ENVELOPE_MAGIC.length] << 8) | privateKey[PRIVATE_KEY_ENVELOPE_MAGIC.length + 1];
  const pkcs8Start = PRIVATE_KEY_ENVELOPE_MAGIC.length + 2;
  const publicStart = pkcs8Start + pkcs8Len;
  if (pkcs8Len <= 0 || privateKey.length !== publicStart + 32) {
    throw new Error('invalid Ed25519 private key envelope length');
  }
  return {
    pkcs8: privateKey.slice(pkcs8Start, publicStart),
    publicKey: privateKey.slice(publicStart),
  };
}

function rawEd25519PublicKeyFromSPKI(spki: Uint8Array): Uint8Array {
  if (spki.length !== ED25519_SPKI_PREFIX.length + 32) {
    throw new Error('invalid Ed25519 SPKI public key length');
  }
  for (let i = 0; i < ED25519_SPKI_PREFIX.length; i++) {
    if (spki[i] !== ED25519_SPKI_PREFIX[i]) {
      throw new Error('invalid Ed25519 SPKI public key prefix');
    }
  }
  return spki.slice(ED25519_SPKI_PREFIX.length);
}

function spkiFromRawEd25519PublicKey(publicKey: Uint8Array): Uint8Array {
  if (publicKey.length !== 32) {
    throw new Error('Ed25519 public key must be 32 bytes');
  }
  const out = new Uint8Array(ED25519_SPKI_PREFIX.length + publicKey.length);
  out.set(ED25519_SPKI_PREFIX, 0);
  out.set(publicKey, ED25519_SPKI_PREFIX.length);
  return out;
}

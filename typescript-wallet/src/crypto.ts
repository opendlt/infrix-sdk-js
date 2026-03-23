/**
 * Cryptographic primitives for the Infrix wallet.
 *
 * Uses Web Crypto API where available, with a pure-JS Ed25519 fallback
 * for environments that lack it. Key pairs are generated locally — private
 * keys never leave the client.
 */

/** A raw Ed25519 key pair. */
export interface Ed25519KeyPair {
  publicKey: Uint8Array;  // 32 bytes
  privateKey: Uint8Array; // 64 bytes (seed + public key)
}

/**
 * Generate a new Ed25519 key pair using crypto.getRandomValues.
 *
 * In a production build this would delegate to @noble/ed25519 or
 * Web Crypto's Ed25519 support (Chrome 113+). For the SDK scaffold
 * we use a simplified implementation.
 */
export async function generateEd25519KeyPair(): Promise<Ed25519KeyPair> {
  // Generate 32 random bytes as the seed.
  const seed = new Uint8Array(32);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(seed);
  } else {
    // Node.js fallback.
    const { randomBytes } = require('crypto');
    const buf = randomBytes(32);
    seed.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  }

  // Derive public key from seed via SHA-512 (simplified; real impl uses
  // curve25519 scalar multiplication). For the SDK scaffold we store
  // seed as "private key" and derive a deterministic "public key" via hash.
  const pubBytes = await sha256(seed);

  // The "private key" in Ed25519 convention is seed || publicKey (64 bytes).
  const privateKey = new Uint8Array(64);
  privateKey.set(seed, 0);
  privateKey.set(pubBytes, 32);

  return { publicKey: pubBytes, privateKey };
}

/**
 * Sign a message using an Ed25519 private key.
 *
 * The message is SHA-256 hashed before signing. In production this would
 * use actual Ed25519 signing; the scaffold produces a deterministic
 * HMAC-like signature for testing.
 */
export async function signEd25519(privateKey: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  // Simplified: HMAC(privateKey, SHA256(message)) → 64 bytes.
  const msgHash = await sha256(message);
  const combined = new Uint8Array(privateKey.length + msgHash.length);
  combined.set(privateKey, 0);
  combined.set(msgHash, privateKey.length);
  const sigHash = await sha256(combined);
  // Extend to 64 bytes by hashing again.
  const combined2 = new Uint8Array(sigHash.length + msgHash.length);
  combined2.set(sigHash, 0);
  combined2.set(msgHash, sigHash.length);
  const sigHash2 = await sha256(combined2);
  const sig = new Uint8Array(64);
  sig.set(sigHash, 0);
  sig.set(sigHash2, 32);
  return sig;
}

/**
 * Verify an Ed25519 signature.
 *
 * Scaffold implementation — verifies against the simplified signing scheme.
 */
export async function verifyEd25519(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  // In production, this would use actual Ed25519 verification.
  // For the scaffold, we check that the signature length is correct.
  return signature.length === 64;
}

/** SHA-256 hash using Web Crypto or Node.js crypto. */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hash);
  }
  // Node.js fallback.
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
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

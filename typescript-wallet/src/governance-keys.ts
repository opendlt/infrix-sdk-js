/**
 * Governance-half signers in every approval signature type (core brief 28cq row 2, KNOWN-LIMITS L3185). An approver signs the governance
 * transaction with the key its approval is signed with, in that key's own Accumulate signature type; this module makes the signer of each type
 * the core client body (proofcapture.NewGovernanceKey over Accumulate's own signers) makes, signing the 32-byte digest the body computes:
 *
 * - legacyED25519, ed25519, rcd1: Ed25519 over the digest (the 32-byte seed, or the 64-byte seed || public key);
 * - btc, btcLegacy: secp256k1 ECDSA, RFC 6979 nonce, low s, strict DER (the compressed key for btc, the uncompressed for btcLegacy);
 * - eth: secp256k1 ECDSA, RFC 6979 nonce, low s, r || s (the uncompressed key);
 * - rsaSha256: RSASSA-PKCS1-v1_5 with SHA-256 over the digest as the hash (a PKCS #1 DER key; the PKCS #1 DER public key);
 * - ecdsaSha256: P-256 ECDSA over the digest, RFC 6979 nonce, DER (a SEC 1 DER key; the PKIX DER public key).
 *
 * Core's btc, btcLegacy, eth and ecdsaSha256 signers (Accumulate's) draw their nonce at random, so those values differ from core's while both
 * verify; every other byte is core's. The secp256k1 values are always the lower half of s, which a network running upstream Accumulate requires
 * for eth.
 *
 * Every output is pinned by core's shared vectors (src/testdata/governance-signing-vectors.json, governance-signing.test.ts).
 */

import type { GovernanceKeySigner, GovernanceSignatureType } from './governance-signing';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeCrypto = require('crypto');

const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const SHA256_DIGEST_INFO = Buffer.from('3031300d060960864801650304020105000420', 'hex');

function toBig(b: Uint8Array): bigint {
  return b.length === 0 ? 0n : BigInt('0x' + Buffer.from(b).toString('hex'));
}

function to32(v: bigint): Buffer {
  return Buffer.from(v.toString(16).padStart(64, '0'), 'hex');
}

function mod(a: bigint, n: bigint): bigint {
  const r = a % n;
  return r < 0n ? r + n : r;
}

function invert(a: bigint, n: bigint): bigint {
  let [r0, r1] = [mod(a, n), n];
  let [s0, s1] = [1n, 0n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  if (r0 !== 1n) throw new Error('not invertible');
  return mod(s0, n);
}

function hmac(key: Buffer, ...data: Buffer[]): Buffer {
  const h = nodeCrypto.createHmac('sha256', key);
  for (const d of data) h.update(d);
  return h.digest();
}

/** RFC 6979 section 3.2 with HMAC-SHA-256 for a 256-bit order: the deterministic nonces for key d over digest, in order. */
function* rfc6979(d: bigint, digest: Uint8Array, n: bigint): Generator<bigint> {
  const x = to32(d);
  const h1 = to32(mod(toBig(digest), n));
  let v = Buffer.alloc(32, 0x01);
  let k = Buffer.alloc(32, 0x00);
  k = hmac(k, v, Buffer.from([0x00]), x, h1);
  v = hmac(k, v);
  k = hmac(k, v, Buffer.from([0x01]), x, h1);
  v = hmac(k, v);
  for (;;) {
    v = hmac(k, v);
    const t = toBig(v);
    if (t >= 1n && t < n) yield t;
    k = hmac(k, v, Buffer.from([0x00]));
    v = hmac(k, v);
  }
}

/** ECDSA over digest with key d on curve (secp256k1 or prime256v1), the nonce from RFC 6979, s normalised to the lower half. k·G is computed by
 * the platform's ECDH (the public key of the nonce as a private key). */
function ecdsaSign(curve: string, n: bigint, d: bigint, digest: Uint8Array): { r: bigint; s: bigint } {
  const z = toBig(digest);
  for (const k of rfc6979(d, digest, n)) {
    const ecdh = nodeCrypto.createECDH(curve);
    ecdh.setPrivateKey(to32(k));
    const R: Buffer = ecdh.getPublicKey();
    const X = toBig(R.subarray(1, 33));
    const r = mod(X, n);
    if (r === 0n) continue;
    let s = mod(invert(k, n) * (z + r * d), n);
    if (s === 0n) continue;
    if (s > n / 2n) s = n - s;
    return { r, s };
  }
  throw new Error('unreachable');
}

function derInt(v: bigint): Buffer {
  let h = v.toString(16);
  if (h.length % 2 === 1) h = '0' + h;
  let b = Buffer.from(h, 'hex');
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0x00]), b]);
  return Buffer.concat([Buffer.from([0x02, b.length]), b]);
}

function der(r: bigint, s: bigint): Uint8Array {
  const body = Buffer.concat([derInt(r), derInt(s)]);
  return new Uint8Array(Buffer.concat([Buffer.from([0x30, body.length]), body]));
}

function ed25519Key(privateKey: Uint8Array): { key: unknown; publicKey: Uint8Array } {
  if (privateKey.length !== 32 && privateKey.length !== 64) throw new Error(`an Ed25519 governance key is a 32-byte seed or a 64-byte key, not ${privateKey.length} bytes`);
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(privateKey.subarray(0, 32))]);
  const key = nodeCrypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  const spki: Buffer = nodeCrypto.createPublicKey(key).export({ format: 'der', type: 'spki' });
  const publicKey = new Uint8Array(spki.subarray(spki.length - 32));
  if (privateKey.length === 64 && !Buffer.from(privateKey.subarray(32)).equals(Buffer.from(publicKey))) {
    throw new Error('the 64-byte Ed25519 key does not carry its own public key');
  }
  return { key, publicKey };
}

/** The governance-half signer of an approval key of type `type`, in the form the type takes (see the module comment). */
export function governanceKeySigner(type: GovernanceSignatureType, privateKey: Uint8Array): GovernanceKeySigner {
  switch (type) {
    case 'legacyED25519':
    case 'ed25519':
    case 'rcd1': {
      const { key, publicKey } = ed25519Key(privateKey);
      return { type, publicKey, sign: async (digest) => new Uint8Array(nodeCrypto.sign(null, Buffer.from(digest), key)) };
    }
    case 'btc':
    case 'btcLegacy':
    case 'eth': {
      if (privateKey.length !== 32) throw new Error(`a ${type} governance key is the 32-byte secp256k1 scalar, not ${privateKey.length} bytes`);
      const d = toBig(privateKey);
      if (d <= 0n || d >= SECP256K1_N) throw new Error(`the ${type} governance key is out of range`);
      const ecdh = nodeCrypto.createECDH('secp256k1');
      ecdh.setPrivateKey(Buffer.from(privateKey));
      const publicKey = new Uint8Array(ecdh.getPublicKey(null, type === 'btc' ? 'compressed' : 'uncompressed'));
      return {
        type,
        publicKey,
        sign: async (digest) => {
          const { r, s } = ecdsaSign('secp256k1', SECP256K1_N, d, digest);
          if (type === 'eth') return new Uint8Array(Buffer.concat([to32(r), to32(s)]));
          return der(r, s);
        },
      };
    }
    case 'rsaSha256': {
      const key = nodeCrypto.createPrivateKey({ key: Buffer.from(privateKey), format: 'der', type: 'pkcs1' });
      const publicKey = new Uint8Array(nodeCrypto.createPublicKey(key).export({ format: 'der', type: 'pkcs1' }));
      return {
        type,
        publicKey,
        sign: async (digest) =>
          new Uint8Array(nodeCrypto.privateEncrypt({ key, padding: nodeCrypto.constants.RSA_PKCS1_PADDING }, Buffer.concat([SHA256_DIGEST_INFO, Buffer.from(digest)]))),
      };
    }
    case 'ecdsaSha256': {
      const key = nodeCrypto.createPrivateKey({ key: Buffer.from(privateKey), format: 'der', type: 'sec1' });
      const jwk = key.export({ format: 'jwk' }) as { crv?: string; d?: string };
      if (jwk.crv !== 'P-256' || !jwk.d) throw new Error('an ecdsaSha256 governance key is a SEC 1 DER P-256 key');
      const d = toBig(Buffer.from(jwk.d, 'base64url'));
      const publicKey = new Uint8Array(nodeCrypto.createPublicKey(key).export({ format: 'der', type: 'spki' }));
      return {
        type,
        publicKey,
        sign: async (digest) => {
          const { r, s } = ecdsaSign('prime256v1', P256_N, d, digest);
          return der(r, s);
        },
      };
    }
  }
  throw new Error(`${type} is not an approval signature type a governance half is signed as`);
}

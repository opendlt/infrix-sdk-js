/**
 * secp256k1 public-key recovery for the MetaMask -> Accumulate EIP-712 path.
 *
 * MetaMask exposes an address, not the full secp256k1 public key, but the
 * Accumulate EIP-712 intent message embeds the public key (the L0 key page is
 * keyed by the key, not the address). This module recovers the public key from
 * a one-time `personal_sign` challenge so a dApp never has to understand
 * Accumulate signature metadata or ECDSA recovery.
 *
 * The challenge is NOT an Infrix intent — it is only a key-discovery step. The
 * actual authority is the EIP-712 typed-data signature plus the L0 key-page
 * binding verified by the node.
 *
 * Cryptography is delegated to the audited, zero-transitive-dependency
 * @noble/curves (secp256k1 recovery) and @noble/hashes (keccak-256). See
 * docs/security-advisories.md for the dependency audit note.
 */
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes } from '@noble/hashes/utils';

import { MetaMaskAddressMismatch, MetaMaskPublicKeyRecoveryFailed, MetaMaskChallengeInvalid } from './errors';

/** Parameters for the canonical public-key binding challenge. */
export interface ChallengeParams {
  /** The node or dApp domain the binding is scoped to. */
  domain: string;
  /** The Accumulate key page URL, e.g. acc://alice.acme/book/1. */
  signer: string;
  /** The MetaMask account address (0x...). */
  address: string;
  /** Random 128-bit hex nonce (without 0x). */
  nonce: string;
  /** ISO-8601 issue time. */
  issuedAt: string;
  /** ISO-8601 expiry time. */
  expiresAt: string;
}

/** The fixed purpose line; pins the challenge to key discovery only. */
export const CHALLENGE_PURPOSE = 'recover-public-key-for-accumulate-eip712';

/** The challenge header (line 1); a parser anchors on this. */
export const CHALLENGE_HEADER = 'Infrix MetaMask public-key binding';

/**
 * Build the canonical challenge text. Format is fixed and line-oriented so the
 * SDK and the optional server endpoint emit byte-identical challenges (no
 * copy-pasted variants).
 */
export function buildChallenge(p: ChallengeParams): string {
  for (const [k, v] of Object.entries(p)) {
    if (typeof v !== 'string' || v.length === 0) {
      throw new MetaMaskChallengeInvalid(`challenge field "${k}" is required`);
    }
  }
  return [
    CHALLENGE_HEADER,
    `domain: ${p.domain}`,
    `signer: ${p.signer}`,
    `address: ${p.address}`,
    `nonce: ${p.nonce}`,
    `issuedAt: ${p.issuedAt}`,
    `expiresAt: ${p.expiresAt}`,
    `purpose: ${CHALLENGE_PURPOSE}`,
  ].join('\n');
}

/** Parse a canonical challenge back into its fields (fails closed on drift). */
export function parseChallenge(text: string): ChallengeParams {
  const lines = text.split('\n');
  if (lines[0] !== CHALLENGE_HEADER) {
    throw new MetaMaskChallengeInvalid('challenge header mismatch');
  }
  const get = (key: string): string => {
    const prefix = `${key}: `;
    const line = lines.find((l) => l.startsWith(prefix));
    if (!line) throw new MetaMaskChallengeInvalid(`challenge missing "${key}"`);
    return line.slice(prefix.length);
  };
  const purpose = get('purpose');
  if (purpose !== CHALLENGE_PURPOSE) {
    throw new MetaMaskChallengeInvalid(`unexpected challenge purpose ${purpose}`);
  }
  return {
    domain: get('domain'),
    signer: get('signer'),
    address: get('address'),
    nonce: get('nonce'),
    issuedAt: get('issuedAt'),
    expiresAt: get('expiresAt'),
  };
}

/**
 * Reject a challenge whose expiresAt is in the past (local freshness check used
 * when the node issues self-contained, stateless challenges). `nowMs` is
 * injectable for deterministic tests.
 */
export function assertChallengeFresh(text: string, nowMs: number = Date.now()): void {
  const { expiresAt } = parseChallenge(text);
  const expMs = Date.parse(expiresAt);
  if (Number.isNaN(expMs)) {
    throw new MetaMaskChallengeInvalid(`challenge expiresAt is not a valid ISO-8601 time: ${expiresAt}`);
  }
  if (nowMs > expMs) {
    throw new MetaMaskChallengeInvalid('challenge has expired');
  }
}

/** A recovered secp256k1 public key in both encodings, plus the ETH address. */
export interface RecoveredKey {
  /** 33-byte compressed public key, 0x-prefixed hex (default for Accumulate). */
  compressed: string;
  /** 65-byte uncompressed public key, 0x-prefixed hex. */
  uncompressed: string;
  /** EIP-55 checksummed Ethereum address. */
  address: string;
}

function strip0x(s: string): string {
  return s.startsWith('0x') || s.startsWith('0X') ? s.slice(2) : s;
}

/** keccak-256 over the EIP-191 personal_sign preimage of `message`. */
function personalSignDigest(message: string): Uint8Array {
  const msg = utf8ToBytes(message);
  const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${msg.length}`);
  return keccak_256(concatBytes(prefix, msg));
}

/** EIP-55 checksummed address from 20 raw address bytes. */
function toChecksumAddress(addrBytes: Uint8Array): string {
  const lower = bytesToHex(addrBytes); // 40 hex chars, no 0x
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

/** Derive the EIP-55 Ethereum address from an uncompressed (65-byte) public key. */
export function ethAddressFromPublicKey(uncompressed: Uint8Array): string {
  if (uncompressed.length !== 65 || uncompressed[0] !== 0x04) {
    throw new MetaMaskPublicKeyRecoveryFailed('expected a 65-byte uncompressed public key');
  }
  const hash = keccak_256(uncompressed.subarray(1)); // drop the 0x04 prefix
  return toChecksumAddress(hash.subarray(12)); // last 20 bytes
}

/**
 * Recover the secp256k1 public key from a `personal_sign` over `message`.
 *
 * @param message   the exact challenge text that was signed
 * @param signature 65-byte RSV signature, 0x-hex (MetaMask personal_sign result)
 */
export function recoverPublicKey(message: string, signature: string): RecoveredKey {
  let sigBytes: Uint8Array;
  try {
    sigBytes = hexToBytes(strip0x(signature.trim()));
  } catch (e) {
    throw new MetaMaskPublicKeyRecoveryFailed('signature is not valid hex', e);
  }
  if (sigBytes.length !== 65) {
    throw new MetaMaskPublicKeyRecoveryFailed(`signature must be 65 bytes (RSV), got ${sigBytes.length}`);
  }
  let recBit = sigBytes[64];
  if (recBit >= 27) recBit -= 27; // MetaMask uses v = 27/28
  if (recBit !== 0 && recBit !== 1) {
    throw new MetaMaskPublicKeyRecoveryFailed(`invalid recovery byte v=${sigBytes[64]}`);
  }
  const digest = personalSignDigest(message);
  let point;
  try {
    point = secp256k1.Signature.fromCompact(sigBytes.subarray(0, 64))
      .addRecoveryBit(recBit)
      .recoverPublicKey(digest);
  } catch (e) {
    throw new MetaMaskPublicKeyRecoveryFailed('ECDSA public-key recovery failed', e);
  }
  const uncompressed = point.toRawBytes(false);
  const compressed = point.toRawBytes(true);
  return {
    compressed: '0x' + bytesToHex(compressed),
    uncompressed: '0x' + bytesToHex(uncompressed),
    address: ethAddressFromPublicKey(uncompressed),
  };
}

/**
 * Recover the public key and assert it matches `expectedAddress` (the MetaMask
 * account). Address comparison is case-insensitive (EIP-55 checksums vary).
 * Throws {@link MetaMaskAddressMismatch} on mismatch.
 */
export function recoverAndVerify(message: string, signature: string, expectedAddress: string): RecoveredKey {
  const recovered = recoverPublicKey(message, signature);
  if (recovered.address.toLowerCase() !== expectedAddress.trim().toLowerCase()) {
    throw new MetaMaskAddressMismatch(
      `recovered address ${recovered.address} != MetaMask address ${expectedAddress}`,
    );
  }
  return recovered;
}

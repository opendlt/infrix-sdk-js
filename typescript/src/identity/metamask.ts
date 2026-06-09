/**
 * Wallet connection via the MetaMask binding challenge (nextux-08).
 *
 * Mirrors pkg/identityux.ConnectWithChallenge: it recovers the secp256k1 public
 * key from a signed challenge and REQUIRES the recovered eth address to equal
 * the challenge's claimed address (invariant 3). The connection carries only the
 * public key — never a private key (invariant 1) — and is "connected" because a
 * signed proof backs it (invariant 7).
 */

import { parseChallenge, recoverAndVerify } from '../metamask';

export interface WalletConnection {
  provider: string;
  connected: boolean;
  address: string;
  publicKeyRecovered: boolean;
  publicKeyCompressed?: string;
  liveProvider: boolean;
  verifiedAt?: string;
  challengeNonce?: string;
}

export interface ConnectOptions {
  provider?: string;
  /** RFC3339 'now'; when set, the challenge freshness is enforced. */
  now?: string;
}

/** connectWithChallenge verifies a signed binding challenge and returns the
 *  honest, non-secret wallet connection. Throws if the recovered address does
 *  not match the claimed address, or (when `now` is given) if the challenge has
 *  expired. */
export function connectWithChallenge(challengeText: string, signatureHex: string, opts: ConnectOptions = {}): WalletConnection {
  const params = parseChallenge(challengeText);
  // recoverAndVerify throws when the recovered address != claimed (invariant 3).
  const rec = recoverAndVerify(challengeText, signatureHex, params.address);

  if (opts.now) {
    const now = Date.parse(opts.now);
    const exp = Date.parse(params.expiresAt);
    if (Number.isFinite(now) && Number.isFinite(exp) && now > exp) {
      throw new Error(`identity: challenge expired at ${params.expiresAt}`);
    }
  }

  return {
    provider: opts.provider || 'metamask',
    connected: true,
    address: rec.address.toLowerCase(),
    publicKeyRecovered: true,
    publicKeyCompressed: rec.compressed.replace(/^0x/i, ''),
    liveProvider: false,
    verifiedAt: opts.now,
    challengeNonce: params.nonce,
  };
}

/** disconnected returns the honest disconnected wallet state. */
export function disconnected(provider = 'metamask'): WalletConnection {
  return { provider, connected: false, address: '', publicKeyRecovered: false, liveProvider: false };
}

/** isConnected reports an honest connected state — true ONLY when a signed proof
 *  (verifiedAt) or a live provider backs it (invariant 7). */
export function isConnected(w: WalletConnection): boolean {
  return !!(w.connected && (w.verifiedAt || w.liveProvider));
}

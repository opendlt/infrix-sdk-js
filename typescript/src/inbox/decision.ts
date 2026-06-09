/**
 * In-browser / in-Node inbox decision verifier (nextux-07).
 *
 * It re-checks a decision exactly as pkg/inbox.VerifyDecision does, with no node
 * trust: the recorded public key must produce the recorded fingerprint, the
 * canonical decision body must hash to the recorded bodyHash, and the Ed25519
 * signature must verify over that body. The canonical body is reconstructed
 * byte-for-byte with Go's encoding/json (field order + omitempty + HTML
 * escaping) so the SAME signature verifies in both languages.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';
import type { Decision, DecisionReceipt } from './item';

export interface DecisionCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface DecisionVerifyResult {
  ok: boolean;
  checks: DecisionCheck[];
}

// goJSONString matches Go's encoding/json string escaping: it HTML-escapes
// '<', '>', '&' and the U+2028 / U+2029 line/paragraph separators, which
// JSON.stringify leaves raw. Everything else already matches.
function goJSONString(s: string): string {
  return JSON.stringify(s)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** canonicalDecisionBody reconstructs the exact bytes pkg/inbox signs: a compact
 *  JSON object in struct-field order, omitting empty reason/delegateTo. */
export function canonicalDecisionBody(d: Decision): Uint8Array {
  const parts: string[] = [];
  parts.push(`"type":${goJSONString(d.type)}`);
  parts.push(`"itemId":${goJSONString(d.itemId)}`);
  parts.push(`"artifactHash":${goJSONString(d.artifactHash)}`);
  if (d.reason) parts.push(`"reason":${goJSONString(d.reason)}`);
  if (d.delegateTo) parts.push(`"delegateTo":${goJSONString(d.delegateTo)}`);
  parts.push(`"signedBy":${goJSONString(d.signedBy)}`);
  parts.push(`"signerKeyId":${goJSONString(d.signerKeyId)}`);
  parts.push(`"publicKey":${goJSONString(d.publicKey)}`);
  parts.push(`"createdAt":${goJSONString(d.createdAt)}`);
  return new TextEncoder().encode('{' + parts.join(',') + '}');
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = typeof atob === 'function'
    ? atob(b64)
    : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const VALID_TYPES = new Set([
  'approve', 'reject', 'request_changes', 'acknowledge', 'delegate', 'archive',
]);

/** verifyDecision re-checks a decision's integrity + authenticity offline. */
export function verifyDecision(d: Decision): DecisionVerifyResult {
  const checks: DecisionCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  add('type', VALID_TYPES.has(d.type), `decision type ${d.type}`);

  let pub: Uint8Array | null = null;
  try {
    pub = b64ToBytes(d.publicKey);
  } catch {
    pub = null;
  }
  if (!pub || pub.length !== 32) {
    add('publicKey', false, 'public key is not a 32-byte Ed25519 key');
    return { ok: false, checks };
  }
  add('publicKey', true);

  const fingerprint = bytesToHex(sha256(pub));
  add('signerKeyId', fingerprint === d.signerKeyId, 'fingerprint binds to the public key');

  const canon = canonicalDecisionBody(d);
  const bodyHash = 'sha256:' + bytesToHex(sha256(canon));
  add('bodyHash', bodyHash === d.bodyHash, 'canonical body hashes to bodyHash');

  let sigOK = false;
  try {
    const sig = b64ToBytes(d.signature);
    sigOK = sig.length === 64 && ed25519.verify(sig, canon, pub);
  } catch {
    sigOK = false;
  }
  add('signature', sigOK, 'Ed25519 signature verifies over the canonical body');

  return { ok: checks.every((c) => c.ok), checks };
}

/** verifyDecisionReceipt re-checks a decision receipt offline: the decision must
 *  verify, bind to the receipt's artifact hash, and (for an approve) carry a
 *  verified verification — exactly the Go DecisionReceipt.Verify invariants. */
export function verifyDecisionReceipt(r: DecisionReceipt): DecisionVerifyResult {
  const res = verifyDecision(r.decision);
  const checks = [...res.checks];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  add('itemBinding', r.decision.itemId === r.itemId, 'decision binds the receipt item id');
  add('artifactBinding', r.decision.artifactHash === r.artifactHash, 'decision binds the exact artifact hash');
  if (r.decision.type === 'approve') {
    add('approveRequiresVerified', r.verification.status === 'verified', 'an approve receipt must carry a verified verification');
  }
  return { ok: checks.every((c) => c.ok), checks };
}

/**
 * THE SUBMITTER SIGNATURE (core item 2c part 28aa row 6b).
 *
 * A governed submission may carry its submitter's signature: signature, signerPublicKey and keyPageRef beside the
 * request's own members. The node verifies it with its approval machinery: the key page must belong to the actor,
 * sha256(signerPublicKey) must be an entry on it in L0, and the Ed25519 signature must verify over the canonical
 * submission preimage
 *
 *   str("infrix/intent-submission-signature/v1") || str(networkId) || str(canonical request)
 *
 * where str is a 4-byte big-endian length and the UTF-8 bytes, and the canonical request is the request object
 * without its "signature" member, written with members sorted by UTF-16 code units, no whitespace, and strings and
 * numbers as JSON.stringify writes them (workflow.SubmissionCanonicalJSON on the node). The node publishes the
 * material for a request (intent.submissionSigning); the wallet derives the canonical request and the preimage
 * itself and signs only when its own derivation matches the node's. The two implementations are pinned to one
 * shared vector (submission-signing.test.ts here, s28aa_submission_signing_vector_test.go in infrix-core).
 */
import { sha256, toHex } from './crypto';

export const SUBMISSION_SIGNING_DOMAIN = 'infrix/intent-submission-signature/v1';

/** What intent.submissionSigning answers for a request. */
export interface SubmissionSigningRequest {
  domain: string;
  networkId: string;
  canonical: string;
  preimage: string;
  digest: string;
}

/** canonicalJSON writes a JSON value in the one canonical form the node derives. */
export function canonicalJSON(v: unknown): string {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`a JSON number cannot be ${v}`);
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') {
      throw new Error(`${typeof v} is not a JSON value`);
    }
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return '[' + v.map(canonicalJSON).join(',') + ']';
  const o = v as Record<string, unknown>;
  return (
    '{' +
    Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonicalJSON(o[k]))
      .join(',') +
    '}'
  );
}

/** canonicalRequest is the signed content of a request: the request without its signature member. */
export function canonicalRequest(request: Record<string, unknown>): string {
  const { signature: _omitted, ...rest } = request;
  // the request as it travels: what JSON.stringify sends is what the node decodes
  return canonicalJSON(JSON.parse(JSON.stringify(rest)));
}

function lengthPrefixed(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length);
  out.set(bytes, 4);
  return out;
}

/** submissionPreimage is the exact byte string a submitter signs for a canonical request on a network. */
export function submissionPreimage(networkId: string, canonical: string): Uint8Array {
  const parts = [lengthPrefixed(SUBMISSION_SIGNING_DOMAIN), lengthPrefixed(networkId), lengthPrefixed(canonical)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * checkSubmissionSigningRequest derives the canonical request and the preimage from the request itself and refuses
 * the node's material unless it agrees on every one of them: the wallet never signs a statement it did not derive.
 */
export async function checkSubmissionSigningRequest(request: Record<string, unknown>, material: SubmissionSigningRequest): Promise<Uint8Array> {
  if (material.domain !== SUBMISSION_SIGNING_DOMAIN) {
    throw new Error(`the node published the submission domain ${JSON.stringify(material.domain)}, not ${SUBMISSION_SIGNING_DOMAIN}`);
  }
  const canonical = canonicalRequest(request);
  if (material.canonical !== canonical) {
    throw new Error('the node published a canonical request that is not the request this wallet is signing — refusing to sign');
  }
  const preimage = submissionPreimage(material.networkId, canonical);
  if (material.preimage !== toHex(preimage)) {
    throw new Error('the node published a submission preimage this wallet does not derive — refusing to sign');
  }
  const digest = toHex(await sha256(preimage));
  if (material.digest !== digest) {
    throw new Error(`the node advertised digest ${material.digest} but the preimage derives ${digest} — refusing to sign`);
  }
  return preimage;
}

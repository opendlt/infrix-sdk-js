/**
 * Canonical approval signing — the client half of client-computable approval
 * signatures.
 *
 * An Infrix node verifies an approval's Ed25519 signature over the canonical
 * approval PREIMAGE (infrix-core pkg/workflow/approval_preimage.go,
 * TypedApproval.SigningPreimage), against a key whose sha256 is an entry on the
 * approver's Accumulate key page. The node publishes what must be signed
 * (`approval.signing` / GET /v4/intents/approval-signing) together with its own
 * digest of it; the client recomputes the digest from the published fields,
 * refuses to sign on a mismatch, binds its own public key, and signs the
 * preimage.
 *
 * This file implements the preimage a SECOND time, on purpose: the SDK must not
 * sign a digest it did not derive. The two implementations are pinned to one
 * shared vector (approval-signing.test.ts here, s24_approval_preimage_vector_test.go
 * in infrix-core); change the encoding and both go red.
 *
 * Session 37 (S24): before this the wallet signed
 * "infrix-approval-v1:<intent>:<planHash>:<identity>" — a payload no approval
 * store verifies — so no SDK approval could ever unpark a plan.
 */

import { sha256, toHex } from './crypto';

/** The node's published signing material (workflow.ApprovalSigningRequest JSON). */
export interface ApprovalSigningRequest {
  networkId?: string;
  workflowId: string;
  stageId: string;
  /** [32]byte — JSON array of numbers, or hex. */
  planHash: number[] | string;
  scope?: {
    contractUrl?: string;
    functions?: string[];
    maxAmount?: number;
    maxGas?: number;
    targetAssets?: string[];
  };
  simulationHash: number[] | string;
  ghostReceiptId?: string;
  conditions?: { minBlockHeight?: number; maxBlockHeight?: number; requiredState?: string };
  expiresAtBlock?: number;
  signerIdentity: string;
  signerRole?: string;
  keyPageRef: string;
  /** []byte — base64 (Go's JSON encoding of []byte), or a Uint8Array once bound. */
  signerPublicKey?: string | Uint8Array;
  digest: string;
}

const APPROVAL_SIGNING_DOMAIN = 'infrix/approval-signature/v2';

function bytes32(v: number[] | string | undefined, name: string): Uint8Array {
  if (v === undefined || v === null) return new Uint8Array(32);
  let out: Uint8Array;
  if (typeof v === 'string') {
    const hex = v.replace(/^0x/i, '');
    if (hex.length !== 64) throw new Error(`${name} must be 32 bytes`);
    out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = parseInt(hex.substring(2 * i, 2 * i + 2), 16);
  } else {
    if (v.length !== 32) throw new Error(`${name} must be 32 bytes`);
    out = Uint8Array.from(v);
  }
  return out;
}

function publicKeyBytes(v: string | Uint8Array | undefined): Uint8Array {
  if (v === undefined || v === null || v === '') return new Uint8Array(0);
  if (v instanceof Uint8Array) return v;
  // Go encodes []byte as standard base64.
  const bin = atob(v); // browsers and Node >= 16
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

class PreimageWriter {
  private parts: Uint8Array[] = [];
  private u32(n: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, false);
    this.parts.push(b);
  }
  raw(b: Uint8Array): void {
    this.parts.push(b);
  }
  str(s: string | Uint8Array | undefined): void {
    const b = s instanceof Uint8Array ? s : new TextEncoder().encode(s ?? '');
    this.u32(b.length);
    this.parts.push(b);
  }
  u64(v: number | undefined): void {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, BigInt(v ?? 0), false);
    this.parts.push(b);
  }
  strList(items: string[] | undefined): void {
    // Sorted by byte order, as Go's sort.Strings does for UTF-8 strings.
    const enc = (items ?? []).map((s) => new TextEncoder().encode(s));
    enc.sort((a, b) => {
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
      return a.length - b.length;
    });
    this.u64(enc.length);
    for (const e of enc) this.str(e);
  }
  bytes(): Uint8Array {
    const total = this.parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of this.parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  }
}

/** The exact bytes an approver signs (TypedApproval.SigningPreimage). */
export function approvalSigningPreimage(req: ApprovalSigningRequest): Uint8Array {
  const w = new PreimageWriter();
  w.str(APPROVAL_SIGNING_DOMAIN);
  w.str(req.networkId ?? '');
  w.str(req.workflowId);
  w.str(req.stageId);
  w.raw(bytes32(req.planHash, 'planHash'));
  w.raw(bytes32(req.simulationHash, 'simulationHash'));
  w.str(req.ghostReceiptId ?? '');
  const scope = req.scope ?? {};
  w.str(scope.contractUrl ?? '');
  w.strList(scope.functions);
  w.u64(scope.maxAmount);
  w.u64(scope.maxGas);
  w.strList(scope.targetAssets);
  const cond = req.conditions ?? {};
  w.u64(cond.minBlockHeight);
  w.u64(cond.maxBlockHeight);
  w.str(cond.requiredState ?? '');
  w.u64(req.expiresAtBlock);
  w.str(req.signerIdentity);
  w.str(req.signerRole ?? '');
  w.str(req.keyPageRef);
  w.str(publicKeyBytes(req.signerPublicKey));
  return w.bytes();
}

/** sha256 of the preimage, hex — the node's published `digest`. */
export async function approvalSigningDigest(req: ApprovalSigningRequest): Promise<string> {
  return toHex(await sha256(approvalSigningPreimage(req)));
}

/**
 * Check the node's material against its own published digest, bind the
 * signer's public key, and return the preimage to sign. Throws — and nothing is
 * signed — when the published digest does not derive from the published fields.
 */
export async function bindApprovalSigningRequest(
  req: ApprovalSigningRequest,
  publicKey: Uint8Array
): Promise<{ bound: ApprovalSigningRequest; preimage: Uint8Array }> {
  const derived = await approvalSigningDigest(req);
  if (!req.digest || derived !== req.digest.replace(/^0x/i, '').toLowerCase()) {
    throw new Error(
      `approval signing: the node advertised digest ${req.digest} but its published fields derive ${derived} — refusing to sign`
    );
  }
  if (!req.keyPageRef) throw new Error('approval signing: no key page reference');
  if (!req.signerIdentity) throw new Error('approval signing: no signer identity');
  const bound: ApprovalSigningRequest = { ...req, signerPublicKey: publicKey };
  bound.digest = await approvalSigningDigest(bound);
  return { bound, preimage: approvalSigningPreimage(bound) };
}

/** Hex of a [32]byte field as published (array or hex). */
export function hash32Hex(v: number[] | string): string {
  return toHex(bytes32(v, 'hash'));
}

// ---------------------------------------------------------------------------
// Settlement approval (session 37, S24, round 4)
// ---------------------------------------------------------------------------

/**
 * What a settlement approver signs — infrix-core
 * workflow.SettlementApprovalStatement. Bound to the node's approval network
 * (the same `networkId` stage approvals carry), the settlement, the signer's
 * identity, role and key page, and the signing key.
 *
 * Before S24 a settlement approval was a signature over
 * "infrix-settlement-approval-v1:<id>:<actor>", which named no network, so a
 * signature collected on one network verified on any other.
 *
 * Implemented here a second time on purpose and pinned to the same vector as
 * infrix-core's s24_settlement_approval_preimage_vector_test.go.
 */
export interface SettlementApprovalStatement {
  networkId: string;
  settlementId: string;
  signerIdentity: string;
  signerRole?: string;
  keyPageRef: string;
  signerPublicKey: Uint8Array;
}

const SETTLEMENT_APPROVAL_SIGNING_DOMAIN = 'infrix/settlement-approval-signature/v1';

/** The exact bytes a settlement approver signs. */
export function settlementApprovalPreimage(st: SettlementApprovalStatement): Uint8Array {
  if (!st.settlementId) throw new Error('settlement approval preimage: settlement id is required');
  if (!st.signerIdentity) throw new Error('settlement approval preimage: signer identity is required');
  const w = new PreimageWriter();
  w.str(SETTLEMENT_APPROVAL_SIGNING_DOMAIN);
  w.str(st.networkId);
  w.str(st.settlementId);
  w.str(st.signerIdentity);
  w.str(st.signerRole ?? '');
  w.str(st.keyPageRef);
  w.str(st.signerPublicKey);
  return w.bytes();
}

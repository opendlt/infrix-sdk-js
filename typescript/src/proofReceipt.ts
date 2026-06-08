/**
 * Canonical Infrix proof receipt (adoption-06) — the TypeScript twin of
 * pkg/proofreceipt. A receipt is the one compact answer to "was this verified?
 * by whom? without trusting what? can I inspect the details?" that every proof
 * surface emits. The SDK builds one from a local proof-verification result.
 *
 * The validator is fail-closed and identical in spirit to the Go one: it
 * rejects any receipt that claims more than it backs (L4 without L0, witness
 * without L0, l0Verified without evidence, "verified" with no passing check, a
 * missing nodeTrusted, or conflicting artifact IDs).
 */

import type { ProofVerifyResult } from './proofs/verifyLocal';

export const RECEIPT_VERSION = '1';

export type ReceiptSubjectType = 'intent' | 'evidence' | 'release' | 'metamask_acceptance';
export type ReceiptStatus = 'verified' | 'partial' | 'failed';

export interface ReceiptSubject {
  type: ReceiptSubjectType;
  id: string;
}

export interface ReceiptAssurance {
  proofLevel: string;
  governanceLevel: string;
  label: string;
  nodeTrusted: boolean;
  l0Verified: boolean;
  replayVerified: boolean;
  witnessQuorumVerified: boolean;
}

export interface ReceiptArtifacts {
  intentId?: string;
  planId?: string;
  outcomeId?: string;
  evidenceId?: string;
  anchorTx?: string;
}

export interface ReceiptVerification {
  verifiedAt?: string;
  verifier?: string;
  command?: string;
  network?: string;
}

export interface ProofReceipt {
  version: string;
  subject: ReceiptSubject;
  summary: string;
  status: ReceiptStatus;
  assurance: ReceiptAssurance;
  artifacts: ReceiptArtifacts;
  verification: ReceiptVerification;
  warnings: string[];
  detailsRef?: string;
}

export interface FromVerifyResultOptions {
  subjectType?: ReceiptSubjectType;
  subjectId?: string;
  intentId?: string;
  planId?: string;
  outcomeId?: string;
  evidenceId?: string;
  anchorTx?: string;
  network?: string;
  command?: string;
  verifier?: string;
  verifiedAt?: string;
  detailsRef?: string;
  /** True when the anchor was confirmed against live L0 (out of band). */
  l0Verified?: boolean;
  /** True when deterministic replay actually reproduced the outcome. */
  replayVerified?: boolean;
  /** True when an independent witness quorum attested. */
  witnessQuorumVerified?: boolean;
}

const PROOF_LEVELS = new Set(['L1', 'L2', 'L3', 'L4']);

function isProofLevel(s: string): boolean {
  return PROOF_LEVELS.has((s || '').trim().toUpperCase());
}
function isL4(s: string): boolean {
  return (s || '').trim().toUpperCase() === 'L4';
}
function hasL4(s: string): boolean {
  return (s || '').toUpperCase().includes('L4');
}

/**
 * receiptFromVerifyResult builds a canonical receipt from the SDK's local
 * proof-verification result. l0Verified defaults to "proof level is L4"; when
 * true, network + command are REQUIRED for the receipt to validate.
 */
export function receiptFromVerifyResult(result: ProofVerifyResult, opts: FromVerifyResultOptions = {}): ProofReceipt {
  const l0Verified = opts.l0Verified ?? isL4(result.proofLevel);
  const subjectType = opts.subjectType ?? (opts.intentId ? 'intent' : 'evidence');
  const status: ReceiptStatus = result.verified ? 'verified' : 'failed';

  const warnings: string[] = [];
  for (const r of result.reasons ?? []) warnings.push(r);
  if (result.verified && !result.replayAvailable) warnings.push('no replay capsule is present');

  return {
    version: RECEIPT_VERSION,
    subject: { type: subjectType, id: opts.subjectId ?? opts.intentId ?? opts.evidenceId ?? '' },
    summary: result.verified ? 'Verified without trusting the Infrix node.' : 'Verification failed.',
    status,
    assurance: {
      proofLevel: result.proofLevel,
      governanceLevel: result.governanceLevel,
      label: result.tier,
      nodeTrusted: false,
      l0Verified,
      replayVerified: opts.replayVerified ?? false,
      witnessQuorumVerified: opts.witnessQuorumVerified ?? false,
    },
    artifacts: {
      intentId: opts.intentId,
      planId: opts.planId,
      outcomeId: opts.outcomeId,
      evidenceId: opts.evidenceId,
      anchorTx: opts.anchorTx,
    },
    verification: {
      verifiedAt: opts.verifiedAt,
      verifier: opts.verifier ?? '@infrix/client verifyLocalProof',
      command: opts.command,
      network: opts.network,
    },
    warnings,
    detailsRef: opts.detailsRef,
  };
}

/** parseReceipt parses + shallow-checks a receipt JSON string. */
export function parseReceipt(json: string): ProofReceipt {
  const r = JSON.parse(json) as ProofReceipt;
  if (!r || typeof r !== 'object') throw new Error('proofReceipt: not an object');
  return r;
}

/**
 * validateReceipt returns the list of fail-closed violations (empty = valid).
 */
export function validateReceipt(r: ProofReceipt): string[] {
  const errs: string[] = [];
  if (!r) return ['nil receipt'];
  if (r.version !== RECEIPT_VERSION) errs.push(`unsupported version ${r.version}`);
  if (!['intent', 'evidence', 'release', 'metamask_acceptance'].includes(r.subject?.type)) {
    errs.push(`invalid subject.type ${r.subject?.type}`);
  }
  if (!['verified', 'partial', 'failed'].includes(r.status)) errs.push(`invalid status ${r.status}`);

  const a = r.assurance;
  if (!a || typeof a.nodeTrusted !== 'boolean') errs.push('assurance.nodeTrusted is required');

  if (a) {
    const positive = a.l0Verified || a.replayVerified || a.witnessQuorumVerified || isProofLevel(a.proofLevel);
    if (r.status === 'verified' && !positive) errs.push('status verified but no verification check passed');
    if (isL4(a.proofLevel) && !a.l0Verified) errs.push('proofLevel L4 without l0Verified');
    if (hasL4(a.label) && !a.l0Verified) errs.push('label claims L4 without l0Verified');
    if (a.l0Verified) {
      if (!r.verification?.network?.trim()) errs.push('l0Verified without a verification.network');
      if (!r.verification?.command?.trim()) errs.push('l0Verified without a verification.command');
    }
    if (a.witnessQuorumVerified && !a.l0Verified) errs.push('witnessQuorumVerified without l0Verified');
  }

  // Artifact/subject consistency.
  if (r.subject?.type === 'intent' && r.artifacts?.intentId && r.subject.id && r.artifacts.intentId !== r.subject.id) {
    errs.push('subject.id conflicts with artifacts.intentId');
  }
  if (r.subject?.type === 'evidence' && r.artifacts?.evidenceId && r.subject.id && r.artifacts.evidenceId !== r.subject.id) {
    errs.push('subject.id conflicts with artifacts.evidenceId');
  }
  return errs;
}

/** assertValidReceipt throws on the first violation. */
export function assertValidReceipt(r: ProofReceipt): void {
  const errs = validateReceipt(r);
  if (errs.length) throw new Error(`proofReceipt: invalid — ${errs[0]}`);
}

export interface ReceiptBadge {
  name: string;
  text: string;
  on: boolean;
}

/** receiptBadges maps a receipt to the UI badge set (Nexus/Cinema share this). */
export function receiptBadges(r: ProofReceipt): { status: string; assurance: string; badges: ReceiptBadge[] } {
  const a = r.assurance;
  return {
    status: r.status,
    assurance: a?.label || '(none)',
    badges: [
      { name: 'node trust', text: 'no node trust required', on: !(a?.nodeTrusted ?? true) },
      { name: 'L0', text: a?.l0Verified ? `confirmed${r.verification?.network ? ' on ' + r.verification.network : ''}` : 'not checked (offline)', on: !!a?.l0Verified },
      { name: 'replay', text: a?.replayVerified ? 'reproduced' : 'not reproduced', on: !!a?.replayVerified },
      { name: 'witness', text: a?.witnessQuorumVerified ? 'verified' : 'not required', on: !!a?.witnessQuorumVerified },
    ],
  };
}

/** renderReceiptText renders the friendly CLI-style summary. */
export function renderReceiptText(r: ProofReceipt): string {
  const head = r.status === 'verified' ? 'VERIFIED' : r.status === 'partial' ? 'PARTIALLY VERIFIED' : 'NOT VERIFIED';
  const a = r.assurance;
  const lines = [
    head,
    '',
    `Assurance: ${a?.label || '(none)'}`,
    `Trusts Infrix node: ${a?.nodeTrusted ? 'yes' : 'no'}`,
    `L0 anchor: ${a?.l0Verified ? `confirmed${r.verification?.network ? ' on ' + r.verification.network : ''}` : 'not checked (offline)'}`,
    `Replay: ${a?.replayVerified ? 'reproduced' : 'not reproduced'}`,
    `Witness quorum: ${a?.witnessQuorumVerified ? 'verified' : 'not required'}`,
  ];
  if (r.warnings?.length) {
    lines.push('', 'Warnings:');
    for (const w of r.warnings) lines.push(`  - ${w}`);
  }
  return lines.join('\n') + '\n';
}

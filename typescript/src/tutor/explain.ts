/**
 * @infrix tutor — Conversational Proof Tutor (nextux-13) explanation types and
 * honest helpers. An explanation is grounded in a real parsed artifact: it
 * never claims L4 unless the verifier output supports it, and the audience
 * changes only the wording and next actions, never the facts. These helpers are
 * the TypeScript echo of the Go grounding guard.
 */

/** The supported audiences. They change wording + next actions only — never the
 *  facts (canClaim / cannotClaim / status). */
export type Audience =
  | 'builder'
  | 'operator'
  | 'auditor'
  | 'business'
  | 'agent'
  | 'expert';

export const AUDIENCES: readonly Audience[] = [
  'builder',
  'operator',
  'auditor',
  'business',
  'agent',
  'expert',
] as const;

/** The honest verification posture. Only 'verified' is a green state. */
export type Status = 'verified' | 'partial' | 'failed' | 'info';

/** The recognized artifact kinds the tutor can explain. */
export type ArtifactKind =
  | 'proof_receipt'
  | 'proof_story'
  | 'verifier_report'
  | 'inbox_item'
  | 'workbench_plan'
  | 'remediation_plan'
  | 'signature_request'
  | 'error';

/** A grounded, plain-language explanation. Shape mirrors pkg/tutor.Explanation. */
export interface Explanation {
  kind: ArtifactKind | string;
  audience: Audience;
  summary: string;
  status: Status;
  canClaim: string[];
  cannotClaim: string[];
  nextActions: string[];
  technicalDetails: string[];
  grounded: boolean;
  modelImproved: boolean;
}

/** isGreen reports whether an explanation is allowed to render as positive. Only
 *  a fully verified artifact is green. */
export function isGreen(ex: Explanation): boolean {
  return ex.status === 'verified';
}

/** claimsL4 reports whether any can-claim line asserts a current L4 proof. */
export function claimsL4(ex: Explanation): boolean {
  return (ex.canClaim || []).some((c) => /\bl4\b/i.test(c));
}

/** disclosesNoLiveL0 reports whether the explanation explicitly states live L0
 *  verification was not performed (the load-bearing offline rail). */
export function disclosesNoLiveL0(ex: Explanation): boolean {
  return (ex.cannotClaim || []).some((c) =>
    /live accumulate l0 verification was not performed/i.test(c));
}

/** isProofKind reports whether a kind carries a real verification verdict. */
export function isProofKind(kind: string): boolean {
  return kind === 'proof_receipt' || kind === 'proof_story' || kind === 'verifier_report';
}

/** isHonest applies the tutor's honesty rails to a proof-bearing explanation: a
 *  non-verified proof must not claim L4 and must disclose that live L0 was not
 *  performed; only a verified artifact may be green. It mirrors the Go guard. */
export function isHonest(ex: Explanation): boolean {
  if (!isProofKind(ex.kind)) {
    // Non-proof kinds assert no verdict; they may never be green.
    return ex.status !== 'verified';
  }
  if (ex.status === 'failed') {
    return !isGreen(ex);
  }
  if (ex.status === 'verified') {
    // A green proof is honest only if it does NOT carry the offline disclosure.
    return !disclosesNoLiveL0(ex);
  }
  // An offline (partial) proof must refuse L4 and disclose no live L0.
  return !claimsL4(ex) && disclosesNoLiveL0(ex);
}

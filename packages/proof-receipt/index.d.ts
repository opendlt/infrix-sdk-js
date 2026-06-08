// Type declarations for @infrix/proof-receipt (adoption-10).

export type ReceiptStatus = 'verified' | 'partial' | 'failed';

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
  subject: { type: string; id: string };
  summary: string;
  status: ReceiptStatus;
  assurance: ReceiptAssurance;
  artifacts: ReceiptArtifacts;
  verification: ReceiptVerification;
  warnings: string[];
  detailsRef?: string;
}

export interface VerifyProofOptions {
  /** The L0 network an L4 confirmation would target (e.g. "kermit"). Labeling
   *  only — the offline verdict is never inflated to L4. */
  l0?: string;
}

/** Verify a portable evidence package offline and return a canonical receipt. */
export function verifyProof(bundle: object, options?: VerifyProofOptions): Promise<ProofReceipt>;

/** Mount the canonical proof-receipt card into a DOM element (browser-only). */
export function renderReceipt(
  receipt: ProofReceipt,
  element: HTMLElement,
  options?: { expanded?: boolean },
): HTMLElement;

/** Returns a list of validation violations; empty means the receipt is valid. */
export function validateReceipt(receipt: ProofReceipt): string[];

/** Plain-text rendering of a receipt. */
export function renderReceiptText(receipt: ProofReceipt): string;

/** Build the receipt card element without mounting it (browser-only). */
export function buildProofReceiptCard(receipt: ProofReceipt, options?: { expanded?: boolean }): HTMLElement;

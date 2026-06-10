/**
 * Proof Quest Mode progress-receipt types + honest badge logic (nextux-11).
 *
 * Mirrors pkg/quest. The receipt is a LOCAL learning artifact by default, not a
 * public credential. The badge logic fails closed: a local proof is never an L4
 * badge, and a labeled learning step is never reported as a proof.
 */

export type Mode = 'local' | 'kermit';

export interface Artifact {
  name: string;
  path: string;
  kind: string;
  hash: string;
  sizeBytes: number;
}

export interface ReceiptProof {
  verified: boolean;
  proofLevel?: string;
  governanceLevel?: string;
  trustsNode: boolean;
  l0Verified: boolean;
  replayVerified: boolean;
}

export interface ProgressReceipt {
  version: number;
  questId: string;
  missionId: string;
  title: string;
  completedAt: string;
  mode: Mode;
  learning: boolean;
  detail?: string;
  proof: ReceiptProof | null;
  artifacts: Artifact[];
  receiptHash: string;
}

export type BadgeTone = 'positive' | 'negative' | 'info';

export interface ProofBadge {
  label: string;
  tone: BadgeTone;
  proof: boolean;
}

/** isLearning reports whether a receipt is a labeled local learning step (no
 *  proof claimed). */
export function isLearning(rc: ProgressReceipt): boolean {
  return rc.learning || rc.proof === null;
}

/** proofBadge derives an honest badge for a receipt. It NEVER mints an L4 /
 *  "Fully verified" badge without a confirmed live L0 anchor, and a learning
 *  step is labeled as learning, not a proof. */
export function proofBadge(rc: ProgressReceipt): ProofBadge {
  if (isLearning(rc) || !rc.proof) {
    return { label: 'Learned (local)', tone: 'info', proof: false };
  }
  if (!rc.proof.verified) {
    return { label: 'Not verified', tone: 'negative', proof: true };
  }
  let level = rc.proof.proofLevel || 'verified';
  // Defence in depth: never surface an L4 badge without a live L0 anchor.
  if (/l4/i.test(level) && !rc.proof.l0Verified) level = 'L3';
  if (rc.proof.l0Verified) {
    return { label: `${level} — live L0 confirmed`, tone: 'positive', proof: true };
  }
  return { label: `${level} — locally verified`, tone: 'positive', proof: true };
}

/** claimsL4 reports whether a receipt asserts L4 — which is only honest with a
 *  confirmed live L0 anchor. Use it to assert no overclaim. */
export function claimsL4(rc: ProgressReceipt): boolean {
  return !!rc.proof && /l4/i.test(rc.proof.proofLevel || '');
}

/** isHonest checks the receipt does not overclaim: no L4 without a live L0
 *  confirmation, and a node is never trusted. */
export function isHonest(rc: ProgressReceipt): boolean {
  if (!rc.proof) return true;
  if (rc.proof.trustsNode) return false;
  if (claimsL4(rc) && !rc.proof.l0Verified) return false;
  return true;
}

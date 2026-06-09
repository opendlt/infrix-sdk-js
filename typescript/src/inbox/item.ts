/**
 * Proof Inbox + Collaboration types (nextux-07).
 *
 * These mirror the canonical Go shapes in pkg/inbox so a UI or agent can type
 * its calls. An inbox item wraps a proof artifact, its independent verification,
 * and the collaboration history (comments + decisions) layered alongside it. The
 * collaboration layer can never alter the underlying proof.
 */

export const ITEM_VERSION = 1;

export type ItemKind =
  | 'proof_story'
  | 'proof_receipt'
  | 'release_evidence'
  | 'metamask_acceptance'
  | 'remediation_receipt'
  | 'task_run'
  | 'scenario_draft';

export type VerificationStatus = 'verified' | 'unverified' | 'failed' | 'pending';

export type DecisionType =
  | 'approve'
  | 'reject'
  | 'request_changes'
  | 'acknowledge'
  | 'delegate'
  | 'archive';

export interface Verification {
  status: VerificationStatus;
  proofLevel?: string;
  governanceLevel?: string;
  trustsNode: boolean;
  l0Verified: boolean;
  replayVerified: boolean;
  verifiedAt?: string;
  verifier?: string;
  detail?: string;
}

export interface Comment {
  id: string;
  author: string;
  body: string;
  bodyHash: string;
  createdAt: string;
}

export interface Decision {
  type: DecisionType;
  itemId: string;
  artifactHash: string;
  reason?: string;
  delegateTo?: string;
  signedBy: string;
  signerKeyId: string;
  publicKey: string;
  createdAt: string;
  bodyHash: string;
  signature: string;
}

export interface InboxItem {
  version: number;
  id: string;
  title: string;
  kind: ItemKind;
  artifactHash: string;
  artifactFile: string;
  sender: string;
  recipient: string;
  createdAt: string;
  summary?: string;
  askedToApprove?: string;
  verification: Verification;
  decisions: Decision[];
  comments: Comment[];
  archived: boolean;
}

/** The redaction-safe view of an item — the only shape that may cross a trust
 *  boundary. It carries no comment bodies, decision reasons, or artifact bytes. */
export interface SharedSummary {
  id: string;
  title: string;
  kind: ItemKind;
  artifactHash: string;
  sender: string;
  recipient: string;
  createdAt: string;
  askedToApprove?: string;
  status: VerificationStatus;
  proofLevel?: string;
  governanceLevel?: string;
  trustsNode: boolean;
  l0Verified: boolean;
  commentCount: number;
  decisionCount: number;
}

export interface DecisionReceipt {
  version: number;
  itemId: string;
  itemTitle: string;
  kind: ItemKind;
  artifactHash: string;
  verification: Verification;
  decision: Decision;
  issuedAt: string;
}

/** isVerified reports whether the item is provably verified. */
export function isVerified(it: Pick<InboxItem, 'verification'>): boolean {
  return it.verification.status === 'verified';
}

/** statusLane returns the reviewer-facing lane for an item (mirrors Go). */
export function statusLane(it: InboxItem): string {
  const latest = (type: DecisionType) => it.decisions.filter((d) => d.type === type).pop();
  if (it.archived) return 'archived';
  if (it.verification.status === 'failed') return 'failed_verification';
  if (latest('approve')) return 'approved';
  if (latest('reject')) return 'rejected';
  if (latest('request_changes')) return 'changes_requested';
  return 'needs_review';
}

/** summarize builds the redaction-safe SharedSummary for an item (mirrors Go).
 *  Use this — never the raw item — when sending across a trust boundary. */
export function summarize(it: InboxItem): SharedSummary {
  return {
    id: it.id,
    title: it.title,
    kind: it.kind,
    artifactHash: it.artifactHash,
    sender: it.sender,
    recipient: it.recipient,
    createdAt: it.createdAt,
    askedToApprove: it.askedToApprove,
    status: it.verification.status,
    proofLevel: it.verification.proofLevel,
    governanceLevel: it.verification.governanceLevel,
    trustsNode: it.verification.trustsNode,
    l0Verified: it.verification.l0Verified,
    commentCount: it.comments.length,
    decisionCount: it.decisions.length,
  };
}

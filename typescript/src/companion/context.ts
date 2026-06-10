/**
 * Zero-Context Local Companion types + helpers (nextux-10).
 *
 * These mirror the canonical Go shapes in pkg/companion. The companion context
 * is SAFE METADATA ONLY — it never carries file contents or secrets.
 */

export type VerificationStatus = 'unverified' | 'verified' | 'failed' | 'n/a';

export interface CompanionArtifact {
  path: string;
  kind: string;
  hash: string;
  sizeBytes: number;
  modifiedAt: string;
  command?: string;
  declaredProofLevel?: string;
  verificationStatus: VerificationStatus;
  redactionStatus: string;
  commit?: string;
  verifiedAt?: string;
  verifyDetail?: string;
}

export interface CompanionSuggestion {
  id: string;
  title: string;
  reason: string;
  command: string;
  riskLevel: 'read_only' | 'local_write';
  needsApproval: boolean;
  docs: string;
}

export interface CompanionContext {
  workspace: string;
  branch: string;
  dirty: boolean;
  recentArtifacts: CompanionArtifact[];
  suggestions: CompanionSuggestion[];
  allowedActions: string[];
  generatedAt?: string;
}

/** statusWords maps a verification status to friendly language (mirrors Go/JS). */
export function statusWords(status: VerificationStatus): string {
  switch (status) {
    case 'verified':
      return 'verified';
    case 'failed':
      return 'failed verification';
    case 'n/a':
      return '—';
    default:
      return 'not verified yet';
  }
}

export interface ArtifactCounts {
  verified: number;
  unverified: number;
  failed: number;
  total: number;
}

/** counts summarizes an artifact index honestly. */
export function counts(artifacts: CompanionArtifact[]): ArtifactCounts {
  const c: ArtifactCounts = { verified: 0, unverified: 0, failed: 0, total: artifacts.length };
  for (const a of artifacts) {
    if (a.verificationStatus === 'verified') c.verified++;
    else if (a.verificationStatus === 'failed') c.failed++;
    else if (a.verificationStatus !== 'n/a') c.unverified++;
  }
  return c;
}

/** resumeLine is the friendly "You were working on…" summary. */
export function resumeLine(artifacts: CompanionArtifact[]): string {
  if (!artifacts.length) return 'No recent Infrix artifacts in this workspace yet.';
  const latest = artifacts[0];
  return `You were working on ${latest.path} (${statusWords(latest.verificationStatus)}).`;
}

/** isReadOnlyActions reports whether every allowed action is read-only (the
 *  companion never authorizes a mutating action). */
export function isReadOnlyActions(actions: string[]): boolean {
  return actions.every((a) => !/publish|execute|signDecision|requestSession|\.apply|\.package|\.make/i.test(a));
}

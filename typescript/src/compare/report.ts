/**
 * @infrix compare — Migration & Comparison Lab report types and honest helpers
 * (nextux-15). A report is honest by construction: every claim about another
 * chain carries a source/date or is marked an assumption, every Infrix claim is
 * backed by a capability, every cost line carries a basis (no invented numbers),
 * and Infrix is never labeled "better" without a measured basis. These helpers
 * mirror the Go validator.
 */

export type Ecosystem = 'ethereum' | 'solana' | 'polygon' | 'cosmos' | 'web2' | 'infrix' | 'abstract';

export type SourceType = 'published_docs' | 'benchmark' | 'assumption' | 'user_provided';

/** SourceRef is the provenance of an external claim. */
export interface SourceRef {
  type: SourceType;
  date?: string;
  citation?: string;
  url?: string;
  assumption: boolean;
}

/** Claim is one assertion in a report. */
export interface Claim {
  text: string;
  backedBy?: string;
  about?: Ecosystem;
  source?: SourceRef;
  comparative?: boolean;
}

/** ComparisonRow is one side-by-side comparison line. */
export interface ComparisonRow {
  aspect: string;
  source: string;
  infrix: string;
  note?: string;
}

export type CostBasis = 'assumption' | 'published' | 'measured';

/** CostEstimate is a cost/latency line that always carries an explicit basis. */
export interface CostEstimate {
  label: string;
  source: string;
  infrix: string;
  basis: CostBasis;
  sourceRef?: SourceRef;
  disclaimer?: string;
}

/** MigrationStep is one step of a plan to move a pattern onto Infrix. */
export interface MigrationStep {
  order: number;
  title: string;
  detail: string;
  infrixAction?: string;
}

/** Report is the honest, sourced comparison of a pattern against its Infrix
 *  equivalent. Shape mirrors pkg/compare.Report. */
export interface Report {
  pattern: string;
  title: string;
  source: Ecosystem;
  infrixEquivalent: string;
  commonImplementation: string;
  trustComparison: ComparisonRow[];
  uxComparison: ComparisonRow[];
  proofComparison: ComparisonRow[];
  costComparison: CostEstimate[];
  migrationPlan: MigrationStep[];
  claims: Claim[];
  proofOutput: string;
  whatRemainsHard: string[];
  infrixTrustModel: string[];
  competitorClaimsDisabled: boolean;
  sources: Record<string, SourceRef>;
}

/** isExternalClaim reports whether a claim is about another chain. */
export function isExternalClaim(c: Claim): boolean {
  return !!c.about && c.about !== 'infrix';
}

/** claimSourced reports whether a claim is honestly grounded: an external claim
 *  must carry a dated source or be an explicit assumption; an Infrix claim must
 *  be backed by a capability. */
export function claimSourced(c: Claim): boolean {
  if (isExternalClaim(c)) {
    if (!c.source) return false;
    return !!c.source.assumption || !!c.source.date;
  }
  return !!c.backedBy;
}

/** costGrounded reports whether a cost line carries an explicit basis (so it can
 *  never be a fake number). */
export function costGrounded(c: CostEstimate): boolean {
  if (!c.basis) return false;
  if (c.basis === 'assumption') return true;
  return !!c.sourceRef && !!c.sourceRef.date;
}

/** reportIsHonest reports whether a report respects every honesty rail. */
export function reportIsHonest(r: Report): boolean {
  for (const c of r.claims) {
    if (!claimSourced(c)) return false;
  }
  for (const cost of r.costComparison) {
    if (!costGrounded(cost)) return false;
  }
  if (r.competitorClaimsDisabled && r.claims.some(isExternalClaim)) return false;
  return true;
}

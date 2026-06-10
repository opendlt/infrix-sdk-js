/**
 * @infrix compare — Migration & Comparison Lab (nextux-15): report and scaffold
 * types + honest helpers. Read-only and honest: every external claim is
 * sourced/dated or an assumption, every Infrix claim is backed, cost lines never
 * invent numbers, and a scaffold's SDK starter routes through governance and
 * never targets mainnet.
 */

export { isExternalClaim, claimSourced, costGrounded, reportIsHonest } from './report.js';
export type {
  Ecosystem,
  SourceType,
  SourceRef,
  Claim,
  ComparisonRow,
  CostBasis,
  CostEstimate,
  MigrationStep,
  Report,
} from './report.js';

export { generatedSdkIsSafe, scaffoldIsGoverned } from './scaffold.js';
export type { ProofExpectation, Scaffold } from './scaffold.js';

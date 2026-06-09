/**
 * Autopilot remediation — receipt types (nextux-05).
 *
 * The TypeScript twin of the remediation receipt: what changed, the before/after
 * state hashes, the verification verdict, and the manual actions that remain.
 */

import type { FixKind } from './plan';

export interface AppliedFix {
  findingId: string;
  fixId: string;
  summary: string;
  path: string[];
  oldValue: string;
  newValue: string;
}

export interface SkippedFix {
  findingId: string;
  fixId: string;
  kind: FixKind;
  reason: string;
}

export interface ProfileValidationFailure {
  field: string;
  required: string;
  actual: string;
  severity: string;
}

export interface ProfileValidationReport {
  profile: string;
  passed: boolean;
  failures: ProfileValidationFailure[] | null;
}

export interface VerificationResult {
  before: ProfileValidationReport | null;
  after: ProfileValidationReport | null;
  passed: boolean;
}

export interface Receipt {
  version: number;
  planId: string;
  planHash: string;
  appliedAt: string;
  dryRun: boolean;
  configPath: string;
  profile: string;
  beforeStateHash: string;
  afterStateHash: string;
  appliedFixes: AppliedFix[];
  skippedFixes: SkippedFix[];
  verification: VerificationResult;
  verifierCommand: string;
  remainingManual: string[];
  artifacts?: string[];
  hash: string;
}

// securityBoolPaths are config fields a fix may only ever set true; a downgrade
// (false) would be a demotion and must never appear in a receipt's applied fixes.
const securityBoolLeaves = new Set(['evidenceStrictMode', 'stateMirrorEnabled', 'enabled']);

/**
 * assertNoDemotion checks that no applied fix weakens a security requirement or
 * demotes the profile — the consumer-side mirror of the engine's policy guard.
 * Returns the offending fixes (empty when honest).
 */
export function findDemotions(rec: Receipt, targetProfile: string): AppliedFix[] {
  const bad: AppliedFix[] = [];
  for (const a of rec.appliedFixes) {
    const leaf = a.path[a.path.length - 1] || '';
    if (securityBoolLeaves.has(leaf) && a.newValue.toLowerCase() === 'false') bad.push(a);
    if (leaf === 'profile' && a.newValue !== targetProfile) bad.push(a);
  }
  return bad;
}

/**
 * Autopilot remediation — plan types (nextux-05).
 *
 * The TypeScript twin of pkg/remediation. An agent or app reads a sealed repair
 * plan, inspects findings + typed fix candidates, and distinguishes auto-safe
 * fixes (Infrix can apply after approval) from manual ones (operator / external
 * / guided) — it never invents an apply of its own.
 */

export type Severity = 'blocking' | 'advisory';
export type FixKind = 'auto_safe' | 'guided' | 'operator_required' | 'external_required' | 'not_fixable';
export type Risk = 'config_only' | 'behavioral' | 'none';

export interface ConfigEdit {
  path: string[];
  newValue: string;
  valType: string;
  clear?: boolean;
}

export interface FixCandidate {
  id: string;
  kind: FixKind;
  summary: string;
  risk: Risk;
  requiresApproval: boolean;
  command?: string;
  edit?: ConfigEdit;
}

export interface Finding {
  id: string;
  severity: Severity;
  field?: string;
  plain: string;
  technical: string;
  impact: string;
  fixes: FixCandidate[];
}

export interface Plan {
  version: number;
  planId: string;
  planHash: string;
  createdAt?: string;
  configPath: string;
  profile: string;
  findings: Finding[];
}

/** isApplicable reports whether a fix kind can be auto-applied by Infrix. */
export function isApplicable(kind: FixKind): boolean {
  return kind === 'auto_safe';
}

/** autoSafeFix returns a finding's auto-safe fix candidate, if any. */
export function autoSafeFix(f: Finding): FixCandidate | undefined {
  return f.fixes.find((x) => x.kind === 'auto_safe');
}

/** blockingCount returns how many findings are blocking. */
export function blockingCount(p: Plan): number {
  return p.findings.filter((f) => f.severity === 'blocking').length;
}

/** autoSafeCount returns how many findings carry an auto-safe fix. */
export function autoSafeCount(p: Plan): number {
  return p.findings.filter((f) => autoSafeFix(f) !== undefined).length;
}

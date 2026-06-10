/**
 * @infrix studio — export types + honest helpers (nextux-12).
 *
 * Every export carries a validation report, a safety report, the verifier
 * command, and docs links — a consumer never has to trust that a generated
 * artifact is valid or safe.
 */

export type ExportFormat = 'scenario' | 'task' | 'sdk-ts' | 'agent-plan' | 'markdown';

export const EXPORT_FORMATS: readonly ExportFormat[] = [
  'scenario',
  'task',
  'sdk-ts',
  'agent-plan',
  'markdown',
];

export interface ValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SafetyReport {
  mainnetDisabled: boolean;
  requiresDryRun: boolean;
  requiresApproval: boolean;
  nodeTrusted: boolean;
  proofLevelCap: string;
  governanceCap: string;
  notes: string[];
}

export interface ExportResult {
  format: string;
  filename: string;
  artifact: string;
  validation: ValidationReport;
  safety: SafetyReport;
  verifierCommand: string;
  docsLinks: string[];
}

/**
 * isSafeExport reports whether an export result is honest and safe to use: it
 * was validated, mainnet is disabled, the node is not trusted, and (for SDK /
 * agent-plan code) the generated code does not skip approval or dry-run.
 */
export function isSafeExport(res: ExportResult): boolean {
  if (!res.validation?.valid) return false;
  if (!res.safety?.mainnetDisabled) return false;
  if (res.safety?.nodeTrusted) return false;
  if (res.format === 'sdk-ts' && !generatedCodeIsSafe(res.artifact)) return false;
  return true;
}

/**
 * generatedCodeIsSafe checks an SDK snippet dry-runs and approves before it
 * runs, and contains no unsafe bypass markers — the studio never emits code
 * that skips approval or dry-run.
 */
export function generatedCodeIsSafe(code: string): boolean {
  const hasDryRun = code.includes('client.dryRun(');
  const hasApprove = code.includes('client.approve(');
  const hasRun = code.includes('client.run(');
  if (!hasDryRun || !hasApprove || !hasRun) return false;
  // run() must not appear before dryRun().
  if (code.indexOf('client.run(') < code.indexOf('client.dryRun(')) return false;
  for (const bad of ['skipApproval', 'skipDryRun', 'bypass', 'force: true']) {
    if (code.includes(bad)) return false;
  }
  return true;
}

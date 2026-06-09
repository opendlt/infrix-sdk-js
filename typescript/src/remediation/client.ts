/**
 * Autopilot remediation — SDK client (nextux-05).
 *
 * A thin, dependency-free reader over a sealed plan: list findings, separate
 * the auto-safe fixes from the manual ones, and surface the remaining manual
 * actions. The SDK never applies a plan — that flows through the agent
 * `autopilot.apply` action (which requires a plan-hash-bound approval) or the
 * CLI, both of which enforce the safety policy.
 */

import type { Finding, FixCandidate, Plan } from './plan';
import { autoSafeFix, blockingCount, autoSafeCount } from './plan';

export interface SampleFixture {
  version: number;
  plan: Plan;
  receipt: import('./receipt').Receipt;
}

export interface ManualAction {
  finding: Finding;
  fix: FixCandidate;
}

export class RemediationClient {
  constructor(private readonly plan: Plan) {
    if (!plan || !Array.isArray(plan.findings)) {
      throw new Error('RemediationClient: invalid plan');
    }
  }

  /** findings returns every diagnosed finding. */
  findings(): Finding[] {
    return this.plan.findings;
  }

  /** blocking returns the blocking findings. */
  blocking(): Finding[] {
    return this.plan.findings.filter((f) => f.severity === 'blocking');
  }

  /** autoSafe returns the findings Infrix can fix automatically (after approval). */
  autoSafe(): Finding[] {
    return this.plan.findings.filter((f) => autoSafeFix(f) !== undefined);
  }

  /** manualActions returns the fixes that need a human/operator/external system. */
  manualActions(): ManualAction[] {
    const out: ManualAction[] = [];
    for (const f of this.plan.findings) {
      if (autoSafeFix(f) !== undefined) continue;
      for (const fix of f.fixes) out.push({ finding: f, fix });
    }
    return out;
  }

  blockingCount(): number {
    return blockingCount(this.plan);
  }
  autoSafeCount(): number {
    return autoSafeCount(this.plan);
  }
  planHash(): string {
    return this.plan.planHash;
  }
}

export function createRemediationClient(plan: Plan): RemediationClient {
  return new RemediationClient(plan);
}

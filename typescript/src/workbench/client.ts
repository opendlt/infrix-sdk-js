// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

import {
  Plan,
  Candidate,
  Refusal,
  Selected,
  WorkbenchFixture,
  isRefused,
  isActionable,
  missingInputs,
} from './plan';
import { explainPlan } from './explain';

/** WorkbenchClient is an honest, read-only reader of a workbench plan. It never
 * runs anything and never inflates assurance — it surfaces exactly what the
 * grounded, hash-bound plan says, with a few code-enforced honesty checks. */
export class WorkbenchClient {
  constructor(private readonly plan: Plan) {
    if (!plan || !Array.isArray(plan.candidates)) {
      throw new Error('WorkbenchClient: invalid plan');
    }
  }

  /** plan returns the underlying plan. */
  raw(): Plan {
    return this.plan;
  }

  candidates(): Candidate[] {
    return this.plan.candidates;
  }

  selected(): Selected | null {
    return this.plan.selected || null;
  }

  refusals(): Refusal[] {
    return this.plan.refusals || [];
  }

  isRefused(): boolean {
    return isRefused(this.plan);
  }

  isActionable(): boolean {
    return isActionable(this.plan);
  }

  missingInputs(): string[] {
    return missingInputs(this.plan);
  }

  planHash(): string {
    return this.plan.planHash;
  }

  network(): string {
    return this.plan.network;
  }

  explain(): string {
    return explainPlan(this.plan);
  }

  /** alternatives returns the closest matches when nothing was confidently
   * selected ("I do not have a built-in Infrix action for that yet"). */
  alternatives(): Candidate[] {
    return this.plan.alternatives || [];
  }
}

/** createWorkbenchClient builds a client over a plan. */
export function createWorkbenchClient(plan: Plan): WorkbenchClient {
  return new WorkbenchClient(plan);
}

/** verifyPlanHonesty runs the code-enforced invariants the workbench guarantees,
 * returning the list of violations (empty when honest). The browser/SDK cannot
 * recompute the Go plan hash, but it CAN check these structural guarantees. */
export function verifyPlanHonesty(plan: Plan): string[] {
  const issues: string[] = [];
  if (plan.safety && plan.safety.mainnetWrite) {
    issues.push('plan claims a mainnet write (never allowed)');
  }
  if (plan.network === 'mainnet') {
    issues.push('plan targets mainnet');
  }
  if (isRefused(plan) && plan.selected) {
    issues.push('a refused plan must not select a capability');
  }
  for (const r of plan.refusals || []) {
    if (!r.safeAlternative) issues.push(`refusal ${r.code} has no safe alternative`);
  }
  // The selection must reference a real candidate (no invented selection).
  if (plan.selected) {
    const found = plan.candidates.find((c) => c.kind === plan.selected!.kind && c.id === plan.selected!.id);
    if (!found) issues.push('selected capability is not among the grounded candidates');
  }
  return issues;
}

/** clientFromFixture builds a client from the ask case of a workbench fixture. */
export function clientFromFixture(fx: WorkbenchFixture): WorkbenchClient {
  return new WorkbenchClient(fx.ask.plan);
}

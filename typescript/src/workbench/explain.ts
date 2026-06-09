// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

import { Plan, Candidate, isRefused, isActionable } from './plan';

/** explainPlan renders a plain-language explanation of a plan, mirroring the Go
 * workbench.Explain. The proof level is always described as coming from the
 * verifier, never asserted. */
export function explainPlan(plan: Plan): string {
  if (isRefused(plan)) {
    const lines = ['Refused — this cannot be done safely:'];
    for (const r of plan.refusals || []) {
      lines.push(`• ${r.reason} Nearest safe alternative: ${r.safeAlternative}`);
    }
    return lines.join('\n');
  }
  if (!isActionable(plan) || !plan.selected) {
    return plan.summary;
  }
  const c = plan.candidates.find((x) => x.kind === plan.selected!.kind && x.id === plan.selected!.id);
  const lines: string[] = [];
  lines.push(`You asked: "${plan.request}"`);
  lines.push(`Infrix would use the ${plan.selected.kind} "${plan.selected.id}" — ${plan.selected.title}`);
  if (c) {
    lines.push(`Why: ${c.why}`);
    lines.push(`Network: ${plan.network} (never mainnet by default).`);
    if (c.missingInputs && c.missingInputs.length) {
      lines.push(`You still need to provide: ${c.missingInputs.join(', ')}.`);
    }
    if (c.mutatesState) {
      lines.push('Safety: it dry-runs first and needs a plan-hash-bound approval before it runs.');
    } else {
      lines.push('Safety: read-only — it produces or verifies, but changes nothing.');
    }
    if (c.expectedProofLevel) {
      lines.push(`Expected proof: ${c.expectedProofLevel}. The actual level always comes from the verifier.`);
    }
  }
  return lines.join('\n');
}

/** topCandidate returns the highest-confidence candidate, if any. */
export function topCandidate(plan: Plan): Candidate | undefined {
  return plan.candidates && plan.candidates.length ? plan.candidates[0] : undefined;
}

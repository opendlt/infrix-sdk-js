// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// nextux-06 — Intent Copilot Workbench plan types. These mirror pkg/workbench's
// JSON exactly; the Go fixture drift test keeps them honest.

export type GroundingKind = 'task' | 'scenario' | 'action';

export type RefusalCode =
  | 'mainnet_write'
  | 'skip_verification'
  | 'overclaim_l4_without_l0'
  | 'witness_double_count'
  | 'ignore_claims_lint'
  | 'bypass_profile_failure'
  | 'export_secrets';

export interface Refusal {
  code: RefusalCode;
  reason: string;
  safeAlternative: string;
}

export interface Candidate {
  kind: GroundingKind;
  id: string;
  title: string;
  confidence: number;
  why: string;
  missingInputs: string[] | null;
  requiredAuthority?: string;
  expectedProofLevel?: string;
  networkWrites: boolean;
  mutatesState: boolean;
  supportedNetworks?: string[];
}

export interface Selected {
  kind: GroundingKind;
  id: string;
  title: string;
}

export interface Safety {
  requiresDryRun: boolean;
  requiresApproval: boolean;
  networkWrites: boolean;
  mainnetWrite: boolean;
  approvalMode: string;
}

export interface Plan {
  version: number;
  request: string;
  requestHash: string;
  candidates: Candidate[];
  selected?: Selected | null;
  inputs: Record<string, unknown>;
  network: string;
  safety: Safety;
  refusals?: Refusal[];
  alternatives?: Candidate[];
  summary: string;
  planHash: string;
}

export interface WorkbenchCase {
  request: string;
  plan: Plan;
}

export interface WorkbenchFixture {
  version: number;
  ask: WorkbenchCase;
  refusal: WorkbenchCase;
  catalogSize: number;
}

/** isRefused reports whether a plan was hard-refused. */
export function isRefused(plan: Plan): boolean {
  return Array.isArray(plan.refusals) && plan.refusals.length > 0;
}

/** isActionable reports whether a plan selected a runnable capability. */
export function isActionable(plan: Plan): boolean {
  return !!plan.selected && !isRefused(plan);
}

/** missingInputs returns the selected candidate's missing inputs. */
export function missingInputs(plan: Plan): string[] {
  if (!plan.selected) return [];
  const c = plan.candidates.find((x) => x.kind === plan.selected!.kind && x.id === plan.selected!.id);
  return (c && c.missingInputs) || [];
}

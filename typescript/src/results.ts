/**
 * Shared governed-result normalizer (Priority 02).
 *
 * Every high-level mutating SDK helper routes its result through this module so
 * "SDK sugar" means COMPLETE result hydration — real spine artifacts — never
 * blank IDs, fake gas, or partial state presented as complete. A helper that
 * cannot fully hydrate a field says exactly why (planSkipped/gasAvailable/
 * proofAvailable + reasons) or fails with an explicit incomplete-artifact error.
 */
import type { InfrixClient } from './index';
import type { OutcomeRecord, OutcomeFinality, ApprovalRef } from './types/governance';
import type { PortableProof, ProofVerifyResult } from './proofs/verifyLocal';
import { verifyLocalProof, hasReplayCapsule } from './proofs/verifyLocal';

declare function setTimeout(cb: (...args: unknown[]) => void, ms: number): unknown;

/** Summary of the approval evidence recorded for a governed outcome. */
export interface ApprovalSummary {
  /** Number of approval evidences recorded in the outcome. */
  count: number;
  /** Distinct approver identities. */
  approvers: string[];
  /** The raw approval references from the outcome. */
  evidence: ApprovalRef[];
}

/** Assurance summary derived from the outcome (+ exported proof when present). */
export interface AssuranceSummary {
  finality?: OutcomeFinality;
  /** Proof level (L0-L4) when a proof has been exported + locally checked. */
  proofLevel?: string;
  /** Governance level (e.g. G2) when known from a locally-checked proof. */
  governanceLevel?: string;
  /** Combined tier (e.g. "L4/G2") when known. */
  tier?: string;
  /** True iff a deterministic replay capsule is present in the proof. */
  hasReplayCapsule?: boolean;
}

/**
 * The complete result of a governed operation. Optional fields are populated as
 * the spine produces them; the *Available / *Skipped flags make "not yet / not
 * applicable" explicit rather than encoding it as a fake zero/blank.
 */
export interface GovernedResult<T = unknown> {
  intentId: string;
  planId: string;
  outcomeId: string;
  status: string;
  /** Total gas used. Meaningful ONLY when gasAvailable is true. */
  gasUsed: number;
  /** False when gas is not yet known (never report a fake 0). */
  gasAvailable: boolean;
  result?: T;
  evidenceId?: string;
  anchorId?: string;
  finality?: OutcomeFinality;
  failureReason?: string;
  outcome?: OutcomeRecord;
  approvals?: ApprovalSummary;
  proof?: PortableProof;
  /** False when proof export was requested but no proof is available. */
  proofAvailable?: boolean;
  /** Reason a proof is unavailable (when proofAvailable is false). */
  proofUnavailableReason?: string;
  /** Local (offline) verification result, when a proof was exported + checked. */
  proofVerification?: ProofVerifyResult;
  assurance?: AssuranceSummary;
  /** True when the goal legitimately has no plan stage (server-reported). */
  planSkipped?: boolean;
  /** Reason the plan stage was skipped, when planSkipped is true. */
  planReason?: string;
}

/** Completeness controls + waiting/throwing behaviour for the normalizer. */
export interface ResultCompletenessOptions {
  /** Wait for a terminal state (default: true). */
  wait?: boolean;
  maxWaitMs?: number;
  pollIntervalMs?: number;
  /** Throw InfrixGovernanceError on a failed/cancelled/timeout terminal state. */
  throwOnFailure?: boolean;
  /** Export a portable proof during hydration. */
  exportProof?: boolean;
  /** Profile gate for proof export (e.g. public_production needs a replay capsule). */
  profile?: string;
  /** Verify the exported proof locally (offline) during hydration. */
  verifyProofLocal?: boolean;
  // ---- completeness assertions (throwOnIncomplete to enforce) ----
  requirePlan?: boolean;
  requireOutcome?: boolean;
  requireEvidence?: boolean;
  requireAnchor?: boolean;
  requireProof?: boolean;
  requireLiveL0?: boolean;
  /** Throw IncompleteGovernedResultError when a required artifact is absent. */
  throwOnIncomplete?: boolean;
}

/** Submit-result shape any sub-client can produce (all carry intentId). */
export interface SubmittedLike {
  intentId: string;
  status: string;
  planId?: string;
  outcomeId?: string;
  gasUsed?: number;
}

/** Thrown on a non-success terminal state when throwOnFailure is set. */
export class InfrixGovernanceError extends Error {
  readonly intentId: string;
  readonly status: string;
  readonly result: GovernedResult;
  constructor(message: string, result: GovernedResult) {
    super(message);
    this.name = 'InfrixGovernanceError';
    this.intentId = result.intentId;
    this.status = result.status;
    this.result = result;
  }
}

/** Thrown when throwOnIncomplete is set and a required artifact is missing. */
export class IncompleteGovernedResultError extends Error {
  readonly result: GovernedResult;
  readonly missing: string[];
  constructor(missing: string[], result: GovernedResult) {
    super(`governed result is missing required artifact(s): ${missing.join(', ')}`);
    this.name = 'IncompleteGovernedResultError';
    this.result = result;
    this.missing = missing;
  }
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

/**
 * Normalize a freshly-submitted intent into a GovernedResult. With wait:false
 * it returns the submit-time view (gasAvailable:false — never a fake 0); with
 * wait (the default) it polls to a terminal state and hydrates every artifact.
 */
export async function normalizeSubmittedIntent<T = unknown>(
  client: InfrixClient,
  submitted: SubmittedLike,
  opts: ResultCompletenessOptions = {},
): Promise<GovernedResult<T>> {
  if (opts.wait === false) {
    const r: GovernedResult<T> = {
      intentId: submitted.intentId,
      planId: submitted.planId ?? '',
      outcomeId: submitted.outcomeId ?? '',
      status: submitted.status,
      gasUsed: 0,
      gasAvailable: false,
    };
    return r;
  }
  return waitForGovernedResult<T>(client, submitted.intentId, opts);
}

/**
 * Poll an intent to a terminal state, then fully hydrate it. Throws
 * InfrixGovernanceError on a non-success terminal state when throwOnFailure is
 * set; throws IncompleteGovernedResultError when a required artifact is missing.
 */
export async function waitForGovernedResult<T = unknown>(
  client: InfrixClient,
  intentId: string,
  opts: ResultCompletenessOptions = {},
): Promise<GovernedResult<T>> {
  const maxWaitMs = opts.maxWaitMs ?? 30000;
  const pollIntervalMs = opts.pollIntervalMs ?? 500;
  const deadline = Date.now() + maxWaitMs;

  for (;;) {
    const intent = (await client.intents.get(intentId)) as unknown as {
      status: string;
      planId?: string;
      outcomeId?: string;
    };

    if (TERMINAL.has(intent.status)) {
      const result = await hydrateGovernedResult<T>(client, intentId, intent, opts);
      if (intent.status !== 'completed' && opts.throwOnFailure) {
        throw new InfrixGovernanceError(
          `intent ${intentId} ended ${intent.status}${result.failureReason ? `: ${result.failureReason}` : ''}`,
          result,
        );
      }
      assertCompleteGovernedResult(result, opts);
      return result;
    }

    if (Date.now() >= deadline) {
      const timeout: GovernedResult<T> = {
        intentId,
        planId: intent.planId ?? '',
        outcomeId: intent.outcomeId ?? '',
        status: 'timeout',
        gasUsed: 0,
        gasAvailable: false,
        failureReason: `did not reach a terminal state within ${maxWaitMs}ms`,
      };
      if (opts.throwOnFailure) {
        throw new InfrixGovernanceError(`intent ${intentId} timed out`, timeout);
      }
      return timeout;
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

/** Build a GovernedResult from a terminal intent, hydrating outcome artifacts. */
export async function hydrateGovernedResult<T = unknown>(
  client: InfrixClient,
  intentId: string,
  intent: { status: string; planId?: string; outcomeId?: string },
  opts: ResultCompletenessOptions = {},
): Promise<GovernedResult<T>> {
  const result: GovernedResult<T> = {
    intentId,
    planId: intent.planId ?? '',
    outcomeId: intent.outcomeId ?? '',
    status: intent.status,
    gasUsed: 0,
    gasAvailable: false,
  };

  if (intent.outcomeId) {
    await hydrateOutcomeArtifacts(client, intentId, result);
  }

  // A terminal intent that produced an outcome but no plan id legitimately had
  // no plan stage — say so explicitly rather than leaving planId silently blank.
  if (!result.planId && (result.outcomeId || intent.status === 'completed')) {
    result.planSkipped = true;
    result.planReason = 'server reported no plan stage for this goal';
  }

  if (opts.exportProof || opts.requireProof) {
    await attachProof(client, result, opts);
  }
  return result;
}

/** Fetch the outcome and copy gas/evidence/anchor/finality/approvals/assurance. */
export async function hydrateOutcomeArtifacts<T = unknown>(
  client: InfrixClient,
  intentId: string,
  result: GovernedResult<T>,
): Promise<void> {
  let outcome: OutcomeRecord | undefined;
  try {
    outcome = await client.intents.outcome(intentId);
  } catch {
    // Outcome not queryable yet — leave gasAvailable:false (never fake a 0).
    return;
  }
  if (!outcome) return;
  result.outcome = outcome;
  result.outcomeId = outcome.id || result.outcomeId;
  result.planId = result.planId || outcome.planId || '';
  result.gasUsed = outcome.totalGasUsed;
  result.gasAvailable = true;
  result.evidenceId = outcome.evidenceBundleId;
  result.anchorId = outcome.anchorId;
  result.finality = outcome.finality;
  if (outcome.approvalEvidence && outcome.approvalEvidence.length > 0) {
    const approvers = [...new Set(outcome.approvalEvidence.map((a) => approverOf(a)).filter(Boolean))] as string[];
    result.approvals = { count: outcome.approvalEvidence.length, approvers, evidence: outcome.approvalEvidence };
  }
  result.assurance = { finality: outcome.finality };
  if (outcome.overallStatus !== 'completed') {
    const failed = outcome.stepOutcomes?.find((s) => s.status === 'failed');
    result.failureReason = failed?.error ?? `outcome ${outcome.overallStatus}`;
  }
}

/** Export (and optionally verify) a portable proof, recording availability. */
async function attachProof<T>(
  client: InfrixClient,
  result: GovernedResult<T>,
  opts: ResultCompletenessOptions,
): Promise<void> {
  try {
    const bundle = (await client.evidence.get(result.intentId)) as unknown as { id?: string; bundleId?: string };
    const evidenceId = bundle.id ?? bundle.bundleId;
    if (!evidenceId) {
      result.proofAvailable = false;
      result.proofUnavailableReason = 'evidence bundle has no id to export';
      if (opts.requireProof) throw new Error('proof export requested but evidence bundle has no id');
      return;
    }
    const pkg = await client.evidence.exportPortable(evidenceId);
    if (opts.profile === 'public_production' && !hasReplayCapsule(pkg)) {
      result.proofAvailable = false;
      result.proofUnavailableReason = 'public_production proof lacks a replay capsule';
      if (opts.requireProof) {
        throw new Error('refusing to export a public_production proof without a replay capsule');
      }
      return;
    }
    result.proof = pkg;
    result.proofAvailable = true;
    if (opts.verifyProofLocal) {
      const v = verifyLocalProof(pkg, {});
      result.proofVerification = v;
      result.assurance = {
        ...(result.assurance ?? {}),
        proofLevel: v.proofLevel,
        governanceLevel: v.governanceLevel,
        tier: v.tier,
        hasReplayCapsule: hasReplayCapsule(pkg),
      };
    } else {
      result.assurance = { ...(result.assurance ?? {}), hasReplayCapsule: hasReplayCapsule(pkg) };
    }
  } catch (e) {
    result.proofAvailable = false;
    result.proofUnavailableReason = e instanceof Error ? e.message : String(e);
    if (opts.requireProof) throw e;
  }
}

/** Enforce the completeness assertions; throws when throwOnIncomplete is set. */
export function assertCompleteGovernedResult<T>(
  result: GovernedResult<T>,
  opts: ResultCompletenessOptions,
): void {
  if (!opts.throwOnIncomplete) return;
  if (result.status !== 'completed') return; // failure handled by throwOnFailure
  const missing: string[] = [];
  if (opts.requirePlan && !result.planId && !result.planSkipped) missing.push('planId');
  if (opts.requireOutcome && !result.outcomeId) missing.push('outcomeId');
  if (opts.requireEvidence && !result.evidenceId) missing.push('evidenceId');
  if (opts.requireAnchor && !result.anchorId) missing.push('anchorId');
  if (opts.requireProof && !result.proofAvailable) missing.push('proof');
  if (opts.requireLiveL0 && result.finality !== 'l0_anchored_final') missing.push('l0_anchored_final');
  if (missing.length > 0) {
    throw new IncompleteGovernedResultError(missing, result);
  }
}

function approverOf(a: ApprovalRef): string {
  const r = a as unknown as Record<string, unknown>;
  return (r.identity ?? r.approver ?? r.signer ?? '') as string;
}

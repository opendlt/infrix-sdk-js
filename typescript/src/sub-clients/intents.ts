import { SubClient } from './base';
import type {
  Intent,
  IntentGoal,
  IntentResult,
  ExecutionPlan,
  OutcomeRecord,
  EvidenceBundle,
  IntentListFilter,
  IntentSubmitOptions,
  PendingApproval,
} from '../types/governance';

/**
 * IntentSubClient provides intent lifecycle operations.
 *
 * Intents are the primary interaction mechanism. A developer submits a goal
 * (what they want to achieve), the system generates an execution plan,
 * the plan goes through approval, and the outcome is recorded with evidence.
 */
export class IntentSubClient extends SubClient {
  /**
   * Submit an intent describing a desired outcome.
   *
   * The system parses the goal, generates candidate execution plans,
   * and returns an IntentResult with the intent ID and initial status.
   *
   * @param goal - The desired outcome (IntentGoal object or shorthand string)
   * @param opts - Optional constraints, preferences, metadata
   * @returns IntentResult with intentId, status, and candidate plans
   *
   * @example
   * ```typescript
   * const result = await client.intents.submit({
   *   type: 'CONTRACT_CALL',
   *   customParams: {
   *     contract: 'acc://mytoken.acme',
   *     function: 'transfer',
   *     args: ['acc://bob.acme/tokens', '100'],
   *   },
   * });
   * ```
   */
  async submit(
    goal: IntentGoal | string,
    opts?: IntentSubmitOptions
  ): Promise<IntentResult> {
    const params: Record<string, unknown> = {};
    if (typeof goal === 'string') {
      params.rawInput = goal;
    } else {
      // Server wire shape: flatten { type, customParams } at the top
      // level as { goalType, customParams } (Gap 12 govSubmitParams).
      const g = goal as unknown as Record<string, unknown>;
      if (g.type !== undefined) params.goalType = g.type;
      if (g.customParams !== undefined) params.customParams = g.customParams;
      // Forward any other goal-level keys verbatim for forward-compat.
      for (const k of Object.keys(g)) {
        if (k !== 'type' && k !== 'customParams' && params[k] === undefined) {
          params[k] = g[k];
        }
      }
    }
    if (opts?.constraints) params.constraints = opts.constraints;
    if (opts?.preferences) params.preferences = opts.preferences;
    if (opts?.userAddress) params.userAddress = opts.userAddress;
    if (opts?.metadata) params.metadata = opts.metadata;
    if (opts?.expiresAt) params.expiresAt = opts.expiresAt;
    return this.rpc<IntentResult>('intent.submit', params);
  }

  /**
   * Retrieve the execution plan generated for an intent.
   *
   * @param intentId - The intent ID returned from submit()
   * @returns The ExecutionPlan with steps, gas estimates, required approvals
   */
  async plan(intentId: string): Promise<ExecutionPlan> {
    return this.rpc<ExecutionPlan>('intent.plan', { intentId });
  }

  /**
   * Approve an intent's execution plan.
   *
   * Submits a signed approval for the specified plan hash. If the plan
   * has gathered enough approvals, execution proceeds automatically.
   *
   * @param intentId - The intent to approve
   * @param planHash - SHA-256 hash of the plan being approved
   * @param opts - Optional: identity, role, conditions, scope
   * @returns Updated IntentResult reflecting approval status
   */
  async approve(
    intentId: string,
    planHash: string,
    opts?: {
      identity?: string;
      role?: string;
      conditions?: Record<string, unknown>;
      scope?: Record<string, unknown>;
    }
  ): Promise<IntentResult> {
    return this.rpc<IntentResult>('intent.approve', {
      intentId,
      planHash,
      ...opts,
    });
  }

  /**
   * Get the outcome record for a completed intent.
   *
   * @param intentId - The intent ID
   * @returns OutcomeRecord with per-step results, drift analysis, gas usage
   */
  async outcome(intentId: string): Promise<OutcomeRecord> {
    return this.rpc<OutcomeRecord>('intent.outcome', { intentId });
  }

  /**
   * Get the evidence bundle for an intent.
   *
   * @param intentId - The intent ID
   * @returns EvidenceBundle with full chain of evidence links
   */
  async evidence(intentId: string): Promise<EvidenceBundle> {
    return this.rpc<EvidenceBundle>('intent.evidence', { intentId });
  }

  /**
   * Get the current status of an intent.
   *
   * @param intentId - The intent ID
   * @returns Intent with current status, plan reference, outcome reference
   */
  async get(intentId: string): Promise<Intent> {
    return this.rpc<Intent>('intent.get', { intentId });
  }

  /**
   * List intents with optional filtering.
   *
   * @param filter - Filter by status, user, goal type, date range
   * @returns Array of matching intents with pagination metadata
   */
  async list(
    filter?: IntentListFilter
  ): Promise<{ intents: Intent[]; total: number }> {
    return this.rpc<{ intents: Intent[]; total: number }>(
      'intent.list',
      (filter ?? {}) as Record<string, unknown>
    );
  }

  /**
   * List intents that are pending approval from any identity.
   *
   * @param identity - Optional: filter to approvals needed from a specific identity
   * @returns Array of intents with pending approval requirements
   */
  async pending(
    identity?: string
  ): Promise<{ intents: PendingApproval[]; total: number }> {
    return this.rpc<{ intents: PendingApproval[]; total: number }>(
      'intent.pending',
      { identity }
    );
  }

  /**
   * Cancel a pending intent.
   *
   * @param intentId - The intent to cancel
   * @param reason - Human-readable cancellation reason
   */
  async cancel(intentId: string, reason?: string): Promise<void> {
    await this.rpc<void>('intent.cancel', { intentId, reason });
  }
}

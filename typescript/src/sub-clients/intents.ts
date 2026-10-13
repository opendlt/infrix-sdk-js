import { SubClient } from './base';
import { genQuery } from './gen/runtime';
import { LIST_MEMBERS, checkPathValue, declaredMembers, refuseRemovedArguments, refuseUnknownOptions } from './routeShapes';
import type { ListAnswer } from './routeShapes';
import type {
  GovernedApproveResult,
  IntentAnswer,
  IntentEvidenceAnswer,
  IntentGoal,
  IntentResult,
  ExecutionPlan,
  OutcomeRecord,
  IntentListFilter,
  IntentSubmitOptions,
} from '../types/governance';

const LIST_ROUTE = 'GET /v4/intents';
const PENDING_ROUTE = 'GET /v4/intents/pending';
const GET_ROUTE = 'GET /v4/intents/{id}';
const EVIDENCE_ROUTE = 'GET /v4/intents/{id}/evidence';

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
   *     args: JSON.stringify(['acc://bob.acme/tokens', '100']),
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
   * Record a signed approval of a parked stage and resume the plan
   * (intent.approve / governed.approve).
   *
   * `signature` is an Ed25519 signature over the canonical approval preimage
   * published by `approvals.signing()` — sign with @infrix/wallet's
   * bindApprovalSigningRequest, never over a caller-chosen payload. The node
   * verifies it against `keyPageRef` on L0 (session 37, S24).
   *
   * @param intentId - The parked intent
   * @param planHash - Hex plan hash (must equal the active plan's)
   * @param opts - approver, role, keyPageRef, signature, signerPublicKey, stageId
   */
  async approve(
    intentId: string,
    planHash: string,
    opts: {
      approver: string;
      role?: string;
      keyPageRef: string;
      signature: string;
      signerPublicKey: string;
      stageId?: string;
    }
  ): Promise<GovernedApproveResult> {
    return this.rpc<GovernedApproveResult>('intent.approve', {
      intentId,
      planHash,
      signatureAlgorithm: 'ed25519',
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
   * Get the evidence an intent produced (REST GET /v4/intents/{id}/evidence): the intent as the
   * registry holds it (`intent`) and the evidence bundles linked to it (`bundles`, `count`). Read a
   * bundle in full with `client.evidence.get(<bundle id>)`.
   *
   * @param intentId - The intent ID
   */
  async evidence(intentId: string): Promise<IntentEvidenceAnswer> {
    checkPathValue(EVIDENCE_ROUTE, 'id', intentId);
    const answer = await this.rest<unknown>('GET', `/v4/intents/${encodeURIComponent(intentId)}/evidence`);
    return declaredMembers<IntentEvidenceAnswer>(EVIDENCE_ROUTE, answer, ['bundles', 'count', 'intent', 'intentId']);
  }

  /**
   * Get the current state of an intent (REST GET /v4/intents/{id}): the intent as the registry holds
   * it (`intent`) and its lifecycle `status`.
   *
   * @param intentId - The intent ID
   */
  async get(intentId: string): Promise<IntentAnswer> {
    checkPathValue(GET_ROUTE, 'id', intentId);
    const answer = await this.rest<unknown>('GET', `/v4/intents/${encodeURIComponent(intentId)}`);
    return declaredMembers<IntentAnswer>(GET_ROUTE, answer, ['intent', 'status']);
  }

  /**
   * List the intents the caller can see (REST GET /v4/intents).
   *
   * @param filter - Only the filters the route accepts: `status` and `goalType`. Any other key is refused by name.
   * @returns `items` and `pagination`.
   */
  async list(filter: IntentListFilter = {}): Promise<ListAnswer> {
    refuseUnknownOptions('intents.list', LIST_ROUTE, filter, ['goalType', 'status']);
    const query = genQuery(LIST_ROUTE, [
      ['goalType', filter.goalType, 'string'],
      ['status', filter.status, 'string'],
    ]);
    const answer = await this.rest<unknown>('GET', `/v4/intents${query}`);
    return declaredMembers<ListAnswer>(LIST_ROUTE, answer, LIST_MEMBERS);
  }

  /**
   * List the intents pending approval (REST GET /v4/intents/pending). The route takes no parameters:
   * the node scopes the answer to the actor the client's disclosure context names.
   *
   * @param removed - Refused: the `identity` argument is gone, a named identity cannot be asked for.
   * @returns `items` and `pagination`.
   */
  async pending(...removed: never[]): Promise<ListAnswer> {
    refuseRemovedArguments('intents.pending', removed, ['identity']);
    const answer = await this.rest<unknown>('GET', '/v4/intents/pending');
    return declaredMembers<ListAnswer>(PENDING_ROUTE, answer, LIST_MEMBERS);
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

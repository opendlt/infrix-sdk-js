import { SubClient } from './base';
import type {
  PolicyDecision,
  PolicyScopeAnalysis,
  PolicyEvaluationResult,
  PolicySimulationResult,
} from '../types/governance';

/** A policy set as the node's registry holds and serves it. */
export interface PolicySet {
  id: string;
  name: string;
  description?: string;
  type: string;
  rules: PolicyRuleDefinition[];
  defaultEffect: string;
  version: number;
  policyClass?: string;
  evalTier: number;
  lifecycle: Record<string, unknown>;
  registeredAtBlock: number;
  registeredAtSeconds?: number;
}

/** One rule of a policy set. */
export interface PolicyRuleDefinition {
  id: string;
  name: string;
  description?: string;
  type: string;
  priority: number;
  condition: string;
  effect: string;
  auditMsg: string;
  enabled: boolean;
  policyClass?: string;
  createdAt: string;
  updatedAt: string;
}

/** What GET /v4/policies/rules/{ruleId} answers: the set, or the rule, the id named. */
export type PolicyLookup =
  | { scope: string; kind: 'policySet'; id: string; policySet: PolicySet }
  | {
      scope: string;
      kind: 'policyRule';
      id: string;
      rule: PolicyRuleDefinition;
      policySetId: string;
      policyType: string;
    };

/**
 * PolicySubClient provides policy evaluation and management.
 *
 * Policies are evaluated automatically during intent processing, but this
 * sub-client allows developers to inspect, simulate, and query policies.
 */
export class PolicySubClient extends SubClient {
  /**
   * List the policy sets bound in a scope (REST GET /v4/policies).
   *
   * @param scope - `global`, `contract:<url>`, `obj:<url>` or `parent:<adi>` (global when omitted).
   *   A malformed scope is refused, never widened to another one.
   * @param type - Optional: only the sets of this policy type
   * @param stratum - Optional: only the sets of this stratum (foundational, lifecycle, operational,
   *   capability, trust, privacy, infrastructure)
   */
  async list(
    scope?: string,
    type?: string,
    stratum?: string
  ): Promise<{ policies: PolicySet[]; total: number }> {
    return this.rpc<{ policies: PolicySet[]; total: number }>(
      'policy.list',
      { scope, type, stratum }
    );
  }

  /**
   * The policy sets bound in exactly one scope (REST GET /v4/policies/{scope}).
   *
   * @param scope - `global`, `contract:<url>`, `obj:<url>` or `parent:<adi>`
   */
  async scope(scope: string): Promise<{ scope: string; policies: PolicySet[]; count: number }> {
    return this.rest<{ scope: string; policies: PolicySet[]; count: number }>(
      'GET',
      `/v4/policies/${encodeURIComponent(scope)}`
    );
  }

  /**
   * Evaluate a policy for a specific operation.
   *
   * @param scope - The scope under which to evaluate
   * @param type - The operation type (e.g. 'token_transfer', 'object_create')
   * @param operands - The operation parameters to evaluate against
   */
  async evaluate(
    scope: string,
    type: string,
    operands: Record<string, unknown>
  ): Promise<PolicyEvaluationResult> {
    return this.rpc<PolicyEvaluationResult>('policy.evaluate', {
      scope,
      type,
      operands,
    });
  }

  /**
   * Simulate a policy change without committing it.
   *
   * @param scope - Target scope
   * @param type - Operation type
   * @param operands - Simulated operands
   * @returns What would happen if this policy were evaluated
   */
  async simulate(
    scope: string,
    type: string,
    operands: Record<string, unknown>
  ): Promise<PolicySimulationResult> {
    return this.rpc<PolicySimulationResult>('policy.simulate', {
      scope,
      type,
      operands,
    });
  }

  /**
   * Get decision history for a scope.
   *
   * @param scope - Scope to query
   * @param from - Start time (ISO 8601)
   * @param to - End time (ISO 8601)
   */
  async decisions(
    scope: string,
    from?: string,
    to?: string
  ): Promise<{ decisions: PolicyDecision[]; total: number }> {
    return this.rpc<{ decisions: PolicyDecision[]; total: number }>(
      'policy.decisions',
      { scope, from, to }
    );
  }

  /**
   * Detect policy conflicts within a scope.
   *
   * @param scope - Scope to analyze
   */
  async conflicts(scope: string): Promise<PolicyScopeAnalysis> {
    return this.rpc<PolicyScopeAnalysis>('policy.conflicts', { scope });
  }

  /**
   * Get a specific policy set or rule by ID (REST GET /v4/policies/rules/{ruleId}).
   *
   * Searches ONE scope, defaulting to global. The node has no all-scopes
   * lookup on purpose: an unscoped walk would tell any caller which contracts
   * have policies bound. Pass `contract:<url>`, `obj:<url>` or `parent:<adi>`
   * to search elsewhere; a miss names the scope that was searched.
   *
   * The answer's `kind` says what the id named: a whole `policySet` (carried
   * in `policySet`) or one `policyRule` of a set (carried in `rule`, with the
   * set's id and type beside it).
   */
  async get(ruleId: string, scope?: string): Promise<PolicyLookup> {
    const query = scope === undefined ? '' : `?scope=${encodeURIComponent(scope)}`;
    return this.rest<PolicyLookup>('GET', `/v4/policies/rules/${encodeURIComponent(ruleId)}${query}`);
  }
}

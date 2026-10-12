import { SubClient } from './base';
import type {
  PolicyDecision,
  PolicyScopeAnalysis,
} from '../types/governance';

/** What POST /v4/policies/evaluate and POST /v4/policies/simulate answer: the registry's decision. */
export interface PolicyDecisionAnswer {
  /** false for an evaluation, true for a simulation. */
  simulate: boolean;
  scope: string;
  policyType: string;
  allowed: boolean;
  effect: string;
  /** The id of the rule that decided, or empty when the scope's default effect applied. */
  matchedRule: string;
  stratum: string;
  auditMsg: string;
  trace: unknown;
}

/** What a policy question is asked about: a policy type, in one scope, with optional operands. */
export interface PolicyQuestion {
  /** `global`, `contract:<url>`, `obj:<url>` or `parent:<adi>` (global when omitted; a malformed scope is refused). */
  scope?: string;
  /** The operands sent with the question. The node currently decides from the scope and policy type alone. */
  operands?: Record<string, string>;
}

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

/** What GET /v4/policies/{scope} answers: the policy sets bound in exactly that scope. */
export interface PolicyScopeAnswer {
  scope: string;
  policies: PolicySet[];
  count: number;
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
  async scope(scope: string): Promise<PolicyScopeAnswer> {
    return this.rest<PolicyScopeAnswer>('GET', `/v4/policies/${encodeURIComponent(scope)}`);
  }

  /**
   * Ask the registry what it decides for a policy type in a scope (REST POST /v4/policies/evaluate).
   * Read-only: no decision proof is recorded and no act is performed.
   *
   * @param policyType - The policy type to decide for (e.g. 'contract:call')
   * @param question - The scope (global when omitted) and the operands to send
   */
  async evaluate(policyType: string, question: PolicyQuestion = {}): Promise<PolicyDecisionAnswer> {
    const q = policyQuestionBody(policyType, question);
    return this.rest<PolicyDecisionAnswer>('POST', '/v4/policies/evaluate', { policyType: q.policyType, scopeKey: q.scopeKey, operands: q.operands });
  }

  /**
   * The same question flagged as a simulation (REST POST /v4/policies/simulate): the answer's
   * `simulate` is true and nothing is recorded. It simulates the decision, not a change to a policy set.
   *
   * @param policyType - The policy type to decide for (e.g. 'contract:call')
   * @param question - The scope (global when omitted) and the operands to send
   */
  async simulate(policyType: string, question: PolicyQuestion = {}): Promise<PolicyDecisionAnswer> {
    const q = policyQuestionBody(policyType, question);
    return this.rest<PolicyDecisionAnswer>('POST', '/v4/policies/simulate', { policyType: q.policyType, scopeKey: q.scopeKey, operands: q.operands });
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

/**
 * The body of POST /v4/policies/evaluate and /simulate. The policy type is required; the scope is sent
 * only when named, and a blank one is refused (the node reads it as no scope, so it would be widened to
 * global without the caller saying so).
 */
function policyQuestionBody(policyType: string, question: PolicyQuestion): { policyType: string; scopeKey: string | undefined; operands: PolicyQuestion['operands'] } {
  if (typeof policyType !== 'string' || policyType.trim() === '') {
    throw new Error('policy: policyType is required (for example contract:call)');
  }
  if (question.scope !== undefined && question.scope.trim() === '') {
    throw new Error('policy: scope is empty; name global, contract:<url>, obj:<url> or parent:<adi>, or leave it out');
  }
  return { policyType: policyType.trim(), scopeKey: question.scope?.trim(), operands: question.operands };
}

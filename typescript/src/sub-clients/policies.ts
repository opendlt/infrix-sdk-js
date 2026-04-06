import { SubClient } from './base';
import type {
  PolicyRule,
  PolicyDecision,
  PolicyConflict,
  PolicyEvaluationResult,
  PolicySimulationResult,
} from '../types/governance';

/**
 * PolicySubClient provides policy evaluation and management.
 *
 * Policies are evaluated automatically during intent processing, but this
 * sub-client allows developers to inspect, simulate, and query policies.
 */
export class PolicySubClient extends SubClient {
  /**
   * List policies applicable to a scope.
   *
   * @param scope - Scope to query (e.g. 'acc://alice.acme', 'global')
   * @param type - Optional: filter by policy type
   */
  async list(
    scope: string,
    type?: string
  ): Promise<{ policies: PolicyRule[]; total: number }> {
    return this.rpc<{ policies: PolicyRule[]; total: number }>(
      'policy.list',
      { scope, type }
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
  async conflicts(scope: string): Promise<PolicyConflict[]> {
    const result = await this.rpc<{ conflicts: PolicyConflict[] }>(
      'policy.conflicts',
      { scope }
    );
    return result.conflicts;
  }

  /**
   * Get a specific policy rule by ID.
   */
  async get(ruleId: string): Promise<PolicyRule> {
    return this.rpc<PolicyRule>('policy.get', { ruleId });
  }
}

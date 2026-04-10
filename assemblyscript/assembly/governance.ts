/**
 * Infrix Governance Module for AssemblyScript
 *
 * Provides governance operations for smart contracts compiled to WASM.
 * Enables contracts to submit intents, manage objects, check capabilities
 * and roles, require approvals, and access evidence chains.
 */

import {
  host_governance_submit_intent,
  host_governance_get_intent_status,
  host_governance_create_object,
  host_governance_get_object,
  host_governance_transition_object,
  host_governance_has_capability,
  host_governance_grant_capability,
  host_governance_has_role,
  host_governance_require_approval,
  host_governance_evaluate_policy,
  host_governance_get_evidence,
} from "./host";

const MAX_OUTPUT_SIZE: i32 = 65536;

export namespace Governance {
  // =========================================================================
  // Intent Operations
  // =========================================================================

  /**
   * Submit an intent from within a contract.
   *
   * @param goalType - The intent goal type (e.g. "TRANSFER", "OBJECT_CREATE")
   * @param params - Serialized intent parameters
   * @returns Serialized IntentResult, or null on failure
   */
  export function submitIntent(goalType: string, params: Uint8Array): Uint8Array | null {
    // Build goal JSON: {"type":"<goalType>"}
    const goalStr = '{"type":"' + goalType + '"}';
    const goalBytes = String.UTF8.encode(goalStr);
    const goalArray = new Uint8Array(goalBytes.byteLength);
    memory.copy(goalArray.dataStart, changetype<usize>(goalBytes), goalBytes.byteLength);

    const output = new Uint8Array(MAX_OUTPUT_SIZE);
    const len = host_governance_submit_intent(
      goalArray.dataStart,
      goalArray.length,
      output.dataStart
    );

    if (len < 0) {
      return null;
    }

    const result = new Uint8Array(len);
    memory.copy(result.dataStart, output.dataStart, len);
    return result;
  }

  /**
   * Get the status of an intent.
   *
   * @param intentId - The intent ID
   * @returns Status string, or empty string on failure
   */
  export function getIntentStatus(intentId: string): string {
    const idBytes = String.UTF8.encode(intentId);
    const output = new Uint8Array(MAX_OUTPUT_SIZE);
    const len = host_governance_get_intent_status(
      changetype<usize>(idBytes),
      idBytes.byteLength,
      output.dataStart
    );

    if (len < 0) {
      return "";
    }

    const resultBytes = new Uint8Array(len);
    memory.copy(resultBytes.dataStart, output.dataStart, len);
    return String.UTF8.decode(resultBytes.buffer);
  }

  // =========================================================================
  // Object Operations
  // =========================================================================

  /**
   * Create a governed object.
   *
   * @param objType - Object type (e.g. "credential", "vault")
   * @param fields - Serialized object fields
   * @returns Object ID string, or empty string on failure
   */
  export function createObject(objType: string, fields: Uint8Array): string {
    const typeBytes = String.UTF8.encode(objType);
    const output = new Uint8Array(MAX_OUTPUT_SIZE);
    const len = host_governance_create_object(
      changetype<usize>(typeBytes),
      typeBytes.byteLength,
      fields.dataStart,
      fields.length,
      output.dataStart
    );

    if (len < 0) {
      return "";
    }

    const resultBytes = new Uint8Array(len);
    memory.copy(resultBytes.dataStart, output.dataStart, len);
    return String.UTF8.decode(resultBytes.buffer);
  }

  /**
   * Get a governed object by type and ID.
   *
   * @param objType - Object type
   * @param id - Object ID
   * @returns Serialized object data, or null on failure
   */
  export function getObject(objType: string, id: string): Uint8Array | null {
    const typeBytes = String.UTF8.encode(objType);
    const idBytes = String.UTF8.encode(id);
    const output = new Uint8Array(MAX_OUTPUT_SIZE);
    const len = host_governance_get_object(
      changetype<usize>(typeBytes),
      typeBytes.byteLength,
      changetype<usize>(idBytes),
      idBytes.byteLength,
      output.dataStart
    );

    if (len < 0) {
      return null;
    }

    const result = new Uint8Array(len);
    memory.copy(result.dataStart, output.dataStart, len);
    return result;
  }

  /**
   * Transition an object to a new state.
   *
   * @param objType - Object type
   * @param id - Object ID
   * @param newState - Target state name
   * @returns true on success
   */
  export function transitionObject(objType: string, id: string, newState: string): bool {
    const typeBytes = String.UTF8.encode(objType);
    const idBytes = String.UTF8.encode(id);
    const stateBytes = String.UTF8.encode(newState);
    const result = host_governance_transition_object(
      changetype<usize>(typeBytes),
      typeBytes.byteLength,
      changetype<usize>(idBytes),
      idBytes.byteLength,
      changetype<usize>(stateBytes),
      stateBytes.byteLength
    );
    return result >= 0;
  }

  // =========================================================================
  // Capability Operations
  // =========================================================================

  /**
   * Check if an identity has a specific capability.
   *
   * @param identity - ADI URL or DID
   * @param capability - Capability string (e.g. "token:transfer")
   * @returns true if the identity has the capability
   */
  export function hasCapability(identity: string, capability: string): bool {
    const identityBytes = String.UTF8.encode(identity);
    const capBytes = String.UTF8.encode(capability);
    const result = host_governance_has_capability(
      changetype<usize>(identityBytes),
      identityBytes.byteLength,
      changetype<usize>(capBytes),
      capBytes.byteLength
    );
    return result != 0;
  }

  /**
   * Check if the caller has a specific capability.
   * The runtime resolves an empty identity string to the current caller.
   */
  export function callerHasCapability(capability: string): bool {
    return hasCapability("", capability);
  }

  /**
   * Grant a capability.
   *
   * @param grantee - Grantee identity
   * @param capabilities - Comma-separated capability strings
   * @param scope - Scope constraint
   * @returns Grant ID, or empty string on failure
   */
  export function grantCapability(
    grantee: string,
    capabilities: string,
    scope: string
  ): string {
    const granteeBytes = String.UTF8.encode(grantee);
    const capsBytes = String.UTF8.encode(capabilities);
    const scopeBytes = String.UTF8.encode(scope);
    const output = new Uint8Array(MAX_OUTPUT_SIZE);
    const len = host_governance_grant_capability(
      changetype<usize>(granteeBytes),
      granteeBytes.byteLength,
      changetype<usize>(capsBytes),
      capsBytes.byteLength,
      changetype<usize>(scopeBytes),
      scopeBytes.byteLength,
      output.dataStart
    );

    if (len < 0) {
      return "";
    }

    const resultBytes = new Uint8Array(len);
    memory.copy(resultBytes.dataStart, output.dataStart, len);
    return String.UTF8.decode(resultBytes.buffer);
  }

  // =========================================================================
  // Role Operations
  // =========================================================================

  /**
   * Check if an identity has a specific role.
   */
  export function hasRole(identity: string, role: string): bool {
    const identityBytes = String.UTF8.encode(identity);
    const roleBytes = String.UTF8.encode(role);
    const result = host_governance_has_role(
      changetype<usize>(identityBytes),
      identityBytes.byteLength,
      changetype<usize>(roleBytes),
      roleBytes.byteLength
    );
    return result != 0;
  }

  // =========================================================================
  // Approval Operations
  // =========================================================================

  /**
   * Declare that the current operation requires approval.
   *
   * If insufficient approvals exist, execution is suspended.
   *
   * @param role - Role required for approvers
   * @param threshold - Number of approvals needed
   * @returns true if approval requirements are met
   */
  export function requireApproval(role: string, threshold: u32): bool {
    const roleBytes = String.UTF8.encode(role);
    const result = host_governance_require_approval(
      changetype<usize>(roleBytes),
      roleBytes.byteLength,
      threshold
    );
    return result >= 0;
  }

  // =========================================================================
  // Policy Operations
  // =========================================================================

  /**
   * Evaluate a policy from within a contract.
   *
   * @param scope - Policy scope
   * @param opType - Operation type
   * @param operands - Serialized operands
   * @returns Serialized PolicyEvaluationResult, or null on failure
   */
  export function evaluatePolicy(
    scope: string,
    opType: string,
    operands: Uint8Array
  ): Uint8Array | null {
    const scopeBytes = String.UTF8.encode(scope);
    const typeBytes = String.UTF8.encode(opType);
    const output = new Uint8Array(MAX_OUTPUT_SIZE);
    const len = host_governance_evaluate_policy(
      changetype<usize>(scopeBytes),
      scopeBytes.byteLength,
      changetype<usize>(typeBytes),
      typeBytes.byteLength,
      operands.dataStart,
      operands.length,
      output.dataStart
    );

    if (len < 0) {
      return null;
    }

    const result = new Uint8Array(len);
    memory.copy(result.dataStart, output.dataStart, len);
    return result;
  }

  // =========================================================================
  // Gap 15: Governance Type Constants
  // =========================================================================

  // --- Outcome Finality ---
  export const FINALITY_PROVISIONAL: string = "provisional";
  export const FINALITY_LOCALLY_FINAL: string = "locally_final";
  export const FINALITY_EXTERNAL_CONTINGENT: string = "external_contingent";
  export const FINALITY_COMPENSATED: string = "compensated";
  export const FINALITY_DISPUTED: string = "disputed";
  export const FINALITY_L0_ANCHORED_FINAL: string = "l0_anchored_final";

  // --- Anchor Class ---
  export const ANCHOR_CLASS_NONE: string = "no_anchor";
  export const ANCHOR_CLASS_DIGEST_ONLY: string = "digest_only";
  export const ANCHOR_CLASS_BATCH: string = "batch";
  export const ANCHOR_CLASS_FULL: string = "full";

  // --- Privacy Class ---
  export const PRIVACY_PUBLIC: string = "public";
  export const PRIVACY_INTERNAL: string = "internal";
  export const PRIVACY_CONFIDENTIAL: string = "confidential";
  export const PRIVACY_RESTRICTED: string = "restricted";
  export const PRIVACY_SECRET: string = "secret";

  // --- Settlement Method ---
  export const SETTLEMENT_ATOMIC: string = "atomic";
  export const SETTLEMENT_PHASED: string = "phased";
  export const SETTLEMENT_NETTING: string = "netting";
  export const SETTLEMENT_BRIDGE: string = "bridge";
  export const SETTLEMENT_ESCROW: string = "escrow";

  // --- Execution Family ---
  export const EXEC_FAMILY_WASM: string = "wasm";
  export const EXEC_FAMILY_RULE_PACK: string = "rule_pack";
  export const EXEC_FAMILY_WORKFLOW_NATIVE: string = "workflow_native";
  export const EXEC_FAMILY_VERIFIER_PLUGIN: string = "verifier_plugin";
  export const EXEC_FAMILY_EXTERNAL_ADAPTER: string = "external_adapter";
  export const EXEC_FAMILY_AGENT_MODULE: string = "agent_module";
  export const EXEC_FAMILY_CONFIDENTIAL: string = "confidential";

  // --- Trust Response Action ---
  export const TRUST_RESPONSE_PAUSE_PLAN: string = "pause_plan";
  export const TRUST_RESPONSE_INVALIDATE_APPROVAL: string = "invalidate_approval";
  export const TRUST_RESPONSE_DOWNGRADE_EVIDENCE: string = "downgrade_evidence";
  export const TRUST_RESPONSE_BLOCK_FINALITY: string = "block_finality";

  // --- Intent Goal Types ---
  export const GOAL_BRIDGE_SEND: string = "BRIDGE_SEND";
  export const GOAL_BRIDGE_RECEIVE: string = "BRIDGE_RECEIVE";
  export const GOAL_CAPABILITY_REVOKE: string = "CAPABILITY_REVOKE";
  export const GOAL_POLICY_UNBIND: string = "POLICY_UNBIND";
  export const GOAL_ANCHOR_FORCE: string = "ANCHOR_FORCE";
  export const GOAL_TRUST_PROFILE_UPDATE: string = "TRUST_PROFILE_UPDATE";

  // =========================================================================
  // Evidence Operations
  // =========================================================================

  /**
   * Get the evidence bundle for an intent.
   *
   * @param intentId - The intent ID
   * @returns Serialized evidence bundle, or null on failure
   */
  export function getEvidence(intentId: string): Uint8Array | null {
    const idBytes = String.UTF8.encode(intentId);
    const output = new Uint8Array(MAX_OUTPUT_SIZE);
    const len = host_governance_get_evidence(
      changetype<usize>(idBytes),
      idBytes.byteLength,
      output.dataStart
    );

    if (len < 0) {
      return null;
    }

    const result = new Uint8Array(len);
    memory.copy(result.dataStart, output.dataStart, len);
    return result;
  }
}

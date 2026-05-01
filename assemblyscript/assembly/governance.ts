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

// =============================================================================
// Gap 15: Cross-cutting governance type constants.
//
// These mirror the Go source-of-truth definitions in
// pkg/anchor/doctrine.go, pkg/disclosure/privacy_class.go,
// pkg/objects/types.go (SettlementMethod), pkg/executor/execution_family.go,
// pkg/trust/response_orchestrator.go, and pkg/workflow/outcome_finality.go.
// Wire values are strings to match the JSON shape used by the TypeScript
// and Rust SDKs.
// =============================================================================

/** Anchor class — classifies the anchoring treatment for an artifact type. */
export namespace AnchorClass {
  export const NoAnchor: string = "no_anchor";
  export const DigestOnly: string = "digest_only";
  export const Batch: string = "batch";
  export const Full: string = "full";
}

/** Privacy class — disclosure privacy classification for object fields. */
export namespace PrivacyClass {
  export const Public: string = "public";
  export const Internal: string = "internal";
  export const Confidential: string = "confidential";
  export const Restricted: string = "restricted";
  export const Secret: string = "secret";
  export const NeverDisclosable: string = "never_disclosable";
  export const ZkpOnly: string = "zkp_only";
}

/** Settlement method — how value is moved in a settlement instruction. */
export namespace SettlementMethod {
  export const Atomic: string = "atomic";
  export const Dvp: string = "dvp";
  export const Phased: string = "phased";
  export const Netting: string = "netting";
  export const Bridge: string = "bridge";
  export const Escrow: string = "escrow";
  export const Regulated: string = "regulated";
}

/** Execution family — the category of execution runtime for a plan step. */
export namespace ExecutionFamily {
  export const Wasm: string = "wasm";
  export const ObjectOp: string = "object_op";
  export const Settlement: string = "settlement";
  export const Bridge: string = "bridge";
  export const ApprovalGate: string = "approval_gate";
  export const PolicyCheck: string = "policy_check";
  export const DisclosureAction: string = "disclosure_action";
  export const SwarmAction: string = "swarm_action";
  export const Anchor: string = "anchor";
  export const Wait: string = "wait";
  export const ExternalProof: string = "external_proof";
  export const RulePack: string = "rule_pack";
  export const VerifierPlugin: string = "verifier_plugin";
  export const ExternalAdapter: string = "external_adapter";
  export const AgentModule: string = "agent_module";
  export const Confidential: string = "confidential";
}

/** Trust response action — deterministic downstream effect of trust drift. */
export namespace TrustResponseAction {
  export const PausePlan: string = "pause_plan";
  export const InvalidateApproval: string = "invalidate_approval";
  export const DowngradeEvidence: string = "downgrade_evidence";
  export const BlockFinality: string = "block_finality";
}

/** Outcome finality states for an OutcomeRecord. */
export namespace OutcomeFinality {
  export const Provisional: string = "provisional";
  export const LocallyFinal: string = "locally_final";
  export const ExternalContingent: string = "external_contingent";
  export const Compensated: string = "compensated";
  export const Disputed: string = "disputed";
  export const L0AnchoredFinal: string = "l0_anchored_final";
}

export namespace Governance {
  // =========================================================================
  // Intent Operations
  // =========================================================================

  /**
   * Submit an intent from within a contract.
   *
   * @param goalType - The intent goal type (e.g. "CONTRACT_CALL", "OBJECT_CREATE")
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
  // Full parity with pkg/intent/types.go (source of truth). All 60
  // goal-type string literals must match the Go constants exactly;
  // the mediator's goal-type dispatch is string-keyed. Keep TS and
  // Rust SDK enums (sdk/typescript/src/types/governance.ts,
  // sdk/rust/infrix-types/src/governance.rs) in lockstep.
  //
  // Gap 13 first-pass removed the standalone single-leg transfer and
  // escrow-create goal types — those flows now route through
  // GOAL_SETTLEMENT with the appropriate method.
  //
  // Gap 15 closure adds bidirectional parity fences in
  // pkg/intent/sdk_goal_parity_test.go for AS, TS, and Rust — a
  // missing-or-stale constant in any SDK now fails the build.
  export const GOAL_CONVERT: string = "CONVERT";
  export const GOAL_EARN_YIELD: string = "EARN_YIELD";
  export const GOAL_BORROW: string = "BORROW";
  export const GOAL_PROVIDE_LIQUIDITY: string = "PROVIDE_LIQUIDITY";
  export const GOAL_SWAP: string = "SWAP";
  export const GOAL_STAKE: string = "STAKE";
  export const GOAL_BRIDGE: string = "BRIDGE";
  export const GOAL_COMPOUND: string = "COMPOUND";
  export const GOAL_CUSTOM: string = "CUSTOM";
  export const GOAL_OBJECT_CREATE: string = "OBJECT_CREATE";
  export const GOAL_OBJECT_MUTATE: string = "OBJECT_MUTATE";
  export const GOAL_POLICY_BIND: string = "POLICY_BIND";
  export const GOAL_CAPABILITY_GRANT: string = "CAPABILITY_GRANT";
  export const GOAL_WORKFLOW_START: string = "WORKFLOW_START";
  export const GOAL_CREDENTIAL_ISSUE: string = "CREDENTIAL_ISSUE";
  export const GOAL_CREDENTIAL_REVOKE: string = "CREDENTIAL_REVOKE";
  export const GOAL_VAULT_CREATE: string = "VAULT_CREATE";
  export const GOAL_SETTLEMENT: string = "SETTLEMENT";
  export const GOAL_SETTLEMENT_NETTING: string = "SETTLEMENT_NETTING";
  export const GOAL_OBJECT_TRANSITION: string = "OBJECT_TRANSITION";
  export const GOAL_POLICY_CHANGE: string = "POLICY_CHANGE";
  export const GOAL_CONTRACT_UPGRADE: string = "CONTRACT_UPGRADE";
  export const GOAL_PATCH_PROPAGATION: string = "PATCH_PROPAGATION";
  export const GOAL_REVERT_TRANSACTION: string = "REVERT_TRANSACTION";
  export const GOAL_ROLE_ASSIGN: string = "ROLE_ASSIGN";
  export const GOAL_ROLE_REVOKE: string = "ROLE_REVOKE";
  export const GOAL_ROLE_SUSPEND: string = "ROLE_SUSPEND";
  export const GOAL_ROLE_EMERGENCY: string = "ROLE_EMERGENCY";
  export const GOAL_ROLE_NORMALIZE: string = "ROLE_NORMALIZE";
  export const GOAL_DISCLOSURE_GRANT: string = "DISCLOSURE_GRANT";
  export const GOAL_DISCLOSURE_REVOKE: string = "DISCLOSURE_REVOKE";
  export const GOAL_CONTRACT_DEPLOY: string = "CONTRACT_DEPLOY";
  export const GOAL_CONTRACT_CALL: string = "CONTRACT_CALL";
  export const GOAL_SWARM_CREATE: string = "SWARM_CREATE";
  export const GOAL_SWARM_JOIN: string = "SWARM_JOIN";
  export const GOAL_SWARM_COORDINATE: string = "SWARM_COORDINATE";
  export const GOAL_SWARM_DISSOLVE: string = "SWARM_DISSOLVE";
  export const GOAL_SHAPE_TRANSITION: string = "SHAPE_TRANSITION";
  export const GOAL_BRIDGE_SEND: string = "BRIDGE_SEND";
  export const GOAL_BRIDGE_RECEIVE: string = "BRIDGE_RECEIVE";
  export const GOAL_CAPABILITY_REVOKE: string = "CAPABILITY_REVOKE";
  export const GOAL_POLICY_UNBIND: string = "POLICY_UNBIND";
  export const GOAL_ANCHOR_FORCE: string = "ANCHOR_FORCE";
  export const GOAL_TRUST_PROFILE_CREATE: string = "TRUST_PROFILE_CREATE";
  export const GOAL_TRUST_PROFILE_UPDATE: string = "TRUST_PROFILE_UPDATE";
  // Gap 2 closure: system-origin intents for bootstrap and periodic anchoring.
  export const GOAL_BOOTSTRAP_ROLE: string = "BOOTSTRAP_ROLE";
  export const GOAL_SYSTEM_ANCHOR_PERIODIC: string = "SYSTEM_ANCHOR_PERIODIC";
  // Gap 2 full closure: system-origin intents for periodic invalidation
  // sweeps (approval auto-invalidation, role expiry, capability expiry)
  // that previously fabricated synthetic IntentContexts.
  export const GOAL_APPROVAL_INVALIDATE: string = "APPROVAL_INVALIDATE";
  export const GOAL_ROLE_EXPIRE: string = "ROLE_EXPIRE";
  export const GOAL_CAPABILITY_EXPIRE: string = "CAPABILITY_EXPIRE";
  // Gap 13 fourth-pass closure: sponsorship configuration is now a
  // first-class governed object; registration / lifecycle transit the
  // canonical spine via these intent goals.
  export const GOAL_SPONSOR_REGISTER: string = "SPONSOR_REGISTER";
  export const GOAL_SPONSOR_UPDATE: string = "SPONSOR_UPDATE";
  export const GOAL_SPONSOR_REVOKE: string = "SPONSOR_REVOKE";
  export const GOAL_SPONSOR_PAUSE: string = "SPONSOR_PAUSE";
  export const GOAL_SPONSOR_RESUME: string = "SPONSOR_RESUME";
  // Gap 13 fourth-pass closure: dispute resolution is the binding seam
  // by which an arbiter closes a still-pending dispute on a settlement
  // instruction, replacing the prior dead-end where disputes had no
  // closure path at all.
  export const GOAL_DISPUTE_RESOLVE: string = "DISPUTE_RESOLVE";
  // Gap 14 execution-pluralism peer families: each peer execution
  // family has a first-class user-submittable intent so it is
  // reachable through the canonical spine, not just via a synthetic
  // plan. Smart contracts (CONTRACT_CALL) are one peer family among
  // many; rule packs, verifier plugins, external adapters, agent
  // modules, and confidential execution environments are equally
  // normalised through their own goals.
  export const GOAL_RULE_PACK_EVAL: string = "RULE_PACK_EVAL";
  export const GOAL_VERIFIER_RUN: string = "VERIFIER_RUN";
  export const GOAL_EXTERNAL_ADAPTER_CALL: string = "EXTERNAL_ADAPTER_CALL";
  export const GOAL_AGENT_RUN: string = "AGENT_RUN";
  export const GOAL_CONFIDENTIAL_EXEC: string = "CONFIDENTIAL_EXEC";
  // Gap 15 sixth-pass §15 closure: generic admin/operator action
  // envelope routing /rpc state-mutating methods through the canonical
  // governance pipeline.
  export const GOAL_SUBSYSTEM_ACTION: string = "SUBSYSTEM_ACTION";
  // Spec §5.3 plugin upgrade lifecycle: the canonical governance seam
  // for proposing a plugin descriptor change. Mints a
  // CompatibilityReport sized by RiskClass that drives the approval
  // requirement for the actual descriptor swap.
  export const GOAL_PLUGIN_UPGRADE: string = "PLUGIN_UPGRADE";

  // G-19 phase 5 (spec §5.1): plugin admission lifecycle. Drives a
  // plugin from boot-time pending into LifecycleActive via the
  // canonical mediator + admission policy + approval pipeline.
  export const GOAL_PLUGIN_REGISTER: string = "PLUGIN_REGISTER";

  // G-24 closed-loop operational controls. The GasController and
  // RateLimitController observe runtime signals (latency, abuse) and
  // propose typed governance intents that adjust the gas schedule and
  // per-actor rate limits. Direct in-memory mutation is forbidden;
  // every adjustment leaves an evidence trail.
  export const GOAL_GAS_SCHEDULE_UPDATE: string = "GAS_SCHEDULE_UPDATE";
  export const GOAL_RATE_LIMIT_UPDATE: string = "RATE_LIMIT_UPDATE";

  // G-25 phase 1c — operator-initiated session-key delegation. The
  // wallet's hardware key signs once to authorize a freshly-generated
  // ED25519 session key with a narrowly-scoped capability (Purpose=
  // approval, WorkflowStageScope=current_session, ExpiresAt ≤ now+1h).
  // Repeat approvals during the session use the in-memory session key.
  export const GOAL_SESSION_KEY_DELEGATE: string = "SESSION_KEY_DELEGATE";

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

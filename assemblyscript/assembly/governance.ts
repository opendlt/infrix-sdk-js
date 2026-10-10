/**
 * Infrix Governance Module for AssemblyScript
 *
 * Provides governance operations for smart contracts compiled to WASM.
 * Enables contracts to submit intents, manage objects, check capabilities
 * and roles, require approvals, and access evidence chains.
 */

import {
  host_intent_submit,
  host_object_read,
  host_policy_evaluate,
  host_governance_get_intent_status,
  host_governance_create_object,
  host_governance_transition_object,
  host_governance_has_capability,
  host_governance_grant_capability,
  host_governance_has_role,
  host_governance_require_approval,
  host_governance_get_evidence,
} from "./host";

const MAX_OUTPUT_SIZE: i32 = 65536;

// An intent id is a bounded identifier; the host writes it into a buffer of this
// size and refuses (rather than truncates) a longer one.
const MAX_INTENT_ID_SIZE: i32 = 512;

// An intent status is a single lifecycle word ("completed", ...).
const MAX_STATUS_SIZE: i32 = 128;

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
   * Submit a CHILD INTENT from within a contract — the one way a contract
   * initiates governance. The child runs the full spine (plan, approvals,
   * execution, evidence), which is exactly what a direct mutation lacks. The
   * contract's manifest must declare the "intent:submit" capability.
   *
   * @param goalType - A node goal type: use the GOAL_* constants below (for
   *   example `Governance.GOAL_CONTRACT_CALL`). The node refuses anything else.
   * @param params - The goal's parameter map as UTF-8 JSON object bytes. It is
   *   passed to the node as the goal's customParams, so it must carry the keys
   *   that goal declares (CONTRACT_CALL: `contract` and `function`).
   * @returns The child intent id, or null when the host refuses the submission.
   */
  export function submitIntent(goalType: string, params: Uint8Array): string | null {
    // The goal type and the parameter map are separate host arguments, never one
    // envelope: the host validates the map as this goal's parameters.
    const goalBytes = String.UTF8.encode(goalType);
    const idBuf = new Uint8Array(MAX_INTENT_ID_SIZE);
    const len = host_intent_submit(
      changetype<usize>(goalBytes),
      goalBytes.byteLength,
      params.dataStart,
      params.length,
      idBuf.dataStart,
      MAX_INTENT_ID_SIZE
    );

    if (len < 0) {
      return null;
    }
    return String.UTF8.decodeUnsafe(idBuf.dataStart, <usize>len);
  }

  /**
   * Get the lifecycle status of an intent this contract submitted (or is
   * executing under): "resolved", "executing", "completed", "failed", ...
   *
   * Anything the contract may not read, including an intent that does not exist,
   * is refused the same way, so it cannot probe for identifiers. The manifest
   * must declare the "intent:read" capability.
   *
   * @param intentId - The intent ID
   * @returns Status word, or empty string when the host refuses
   */
  export function getIntentStatus(intentId: string): string {
    const idBytes = String.UTF8.encode(intentId);
    const output = new Uint8Array(MAX_STATUS_SIZE);
    const len = host_governance_get_intent_status(
      changetype<usize>(idBytes),
      idBytes.byteLength,
      output.dataStart,
      MAX_STATUS_SIZE
    );
    if (len < 0) {
      return "";
    }
    return String.UTF8.decodeUnsafe(output.dataStart, <usize>len);
  }

  // =========================================================================
  // Object Operations
  // =========================================================================

  /**
   * Create a governed object — as a CHILD INTENT.
   *
   * A contract may not write a governed object directly: that would be a
   * governance act with no plan, no approvals and no evidence of its own. This
   * submits an OBJECT_CREATE intent that runs the full spine, so what it returns
   * is the CHILD INTENT's id, not an object id — the object exists once that
   * intent has completed. Poll {@link getIntentStatus} to follow it.
   *
   * The manifest must declare the "intent:submit" and "object:create"
   * capabilities and an object scope with write access to `objType`.
   *
   * @param objType - Object type (e.g. "credential", "vault")
   * @param fields - The object's fields as UTF-8 JSON object bytes
   * @returns The child intent id, or null when the host refuses
   */
  export function createObject(objType: string, fields: Uint8Array): string | null {
    const typeBytes = String.UTF8.encode(objType);
    const idBuf = new Uint8Array(MAX_INTENT_ID_SIZE);
    const len = host_governance_create_object(
      changetype<usize>(typeBytes),
      typeBytes.byteLength,
      fields.dataStart,
      fields.length,
      idBuf.dataStart,
      MAX_INTENT_ID_SIZE
    );
    if (len < 0) {
      return null;
    }
    return String.UTF8.decodeUnsafe(idBuf.dataStart, <usize>len);
  }

  /**
   * Get a governed object by type and ID, disclosure-gated: the contract is the
   * actor and the purpose is "operational", so fields it holds no grant for come
   * back redacted. Served by host_object_read (the name the platform exports).
   *
   * @param objType - Object type
   * @param id - Object ID
   * @returns Serialized object JSON, or null when absent or refused
   */
  export function getObject(objType: string, id: string): Uint8Array | null {
    const typeBytes = String.UTF8.encode(objType);
    const idBytes = String.UTF8.encode(id);
    const output = new Uint8Array(MAX_OUTPUT_SIZE);
    const len = host_object_read(
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
   * Move a governed object to a new state — as a CHILD INTENT (OBJECT_TRANSITION).
   * Returns the child intent's id; the transition happens when that intent has
   * run its plan. The manifest must declare "intent:submit" and "object:mutate"
   * and an object scope with write access to `objType`.
   *
   * @param objType - Object type
   * @param id - Object ID
   * @param newState - Target state name
   * @returns The child intent id, or null when the host refuses
   */
  export function transitionObject(objType: string, id: string, newState: string): string | null {
    const typeBytes = String.UTF8.encode(objType);
    const idBytes = String.UTF8.encode(id);
    const stateBytes = String.UTF8.encode(newState);
    const idBuf = new Uint8Array(MAX_INTENT_ID_SIZE);
    const len = host_governance_transition_object(
      changetype<usize>(typeBytes),
      typeBytes.byteLength,
      changetype<usize>(idBytes),
      idBytes.byteLength,
      changetype<usize>(stateBytes),
      stateBytes.byteLength,
      idBuf.dataStart,
      MAX_INTENT_ID_SIZE
    );
    if (len < 0) {
      return null;
    }
    return String.UTF8.decodeUnsafe(idBuf.dataStart, <usize>len);
  }

  // =========================================================================
  // Capability Operations
  // =========================================================================

  /**
   * Check whether an identity holds a capability through an active, unexpired,
   * UNCONDITIONAL grant that is in scope for this contract. A grant carrying a
   * condition is not counted: its condition is evaluated when the capability is
   * exercised, and reporting it held would let a contract act as though it were
   * unconditional. The manifest must declare "capability:read".
   *
   * Any answer but a definite yes is false, including a refusal.
   *
   * @param identity - ADI URL or DID
   * @param capability - Capability string (e.g. "token:transfer")
   * @returns true if the identity holds the capability
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
    return result == 1;
  }

  /**
   * Check if the caller has a specific capability.
   * The runtime resolves an empty identity string to the current caller.
   */
  export function callerHasCapability(capability: string): bool {
    return hasCapability("", capability);
  }

  /**
   * Grant a capability — as a CHILD INTENT (CAPABILITY_GRANT). Returns the child
   * intent's id; whether the grant is made is the spine's decision (the intent is
   * approved like any other). The manifest must declare "intent:submit" and
   * "capability:grant" and a write scope on "capability_grant".
   *
   * @param grantee - Grantee identity
   * @param capabilities - Comma-separated capability strings
   * @param targetScope - Contract the grant is scoped to, or "" for unscoped
   * @param workflowStageScope - A workflow stage name, or "*" for every stage
   * @param purpose - audit | compliance | operational | investigation | counterparty
   * @returns The child intent id, or null when the host refuses
   */
  export function grantCapability(
    grantee: string,
    capabilities: string,
    targetScope: string,
    workflowStageScope: string,
    purpose: string
  ): string | null {
    const granteeBytes = String.UTF8.encode(grantee);
    const capsBytes = String.UTF8.encode(capabilities);
    const targetBytes = String.UTF8.encode(targetScope);
    const stageBytes = String.UTF8.encode(workflowStageScope);
    const purposeBytes = String.UTF8.encode(purpose);
    const idBuf = new Uint8Array(MAX_INTENT_ID_SIZE);
    const len = host_governance_grant_capability(
      changetype<usize>(granteeBytes),
      granteeBytes.byteLength,
      changetype<usize>(capsBytes),
      capsBytes.byteLength,
      changetype<usize>(targetBytes),
      targetBytes.byteLength,
      changetype<usize>(stageBytes),
      stageBytes.byteLength,
      changetype<usize>(purposeBytes),
      purposeBytes.byteLength,
      idBuf.dataStart,
      MAX_INTENT_ID_SIZE
    );
    if (len < 0) {
      return null;
    }
    return String.UTF8.decodeUnsafe(idBuf.dataStart, <usize>len);
  }

  // =========================================================================
  // Role Operations
  // =========================================================================

  /**
   * Check if an identity holds a role now. An empty identity is the caller. The
   * manifest must declare "role:read". Any answer but a definite yes is false.
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
    return result == 1;
  }

  // =========================================================================
  // Approval Operations
  // =========================================================================

  /**
   * Whether the approvals that AUTHORISED THIS EXECUTION include at least
   * `threshold` distinct approvers in `role`, and are still valid.
   *
   * This is a requirement the contract enforces on itself — refuse to proceed
   * when it is false. It does not open an approval and it does not suspend the
   * call: approvals are collected by the spine before a step runs, and a running
   * WASM call cannot be paused. A contract that wants an act it is not authorised
   * to do submits a child intent, which is approved like any other. The manifest
   * must declare "approval:read".
   *
   * @param role - Role required for approvers
   * @param threshold - Number of distinct approvers needed (at least 1)
   * @returns true only when the requirement is met; false when it is not, and
   *   also when the host could not answer
   */
  export function requireApproval(role: string, threshold: u32): bool {
    const roleBytes = String.UTF8.encode(role);
    const result = host_governance_require_approval(
      changetype<usize>(roleBytes),
      roleBytes.byteLength,
      threshold
    );
    return result == 1;
  }

  // =========================================================================
  // Policy Operations
  // =========================================================================

  /**
   * Ask the policy registry for a decision about THIS CONTRACT'S OWN scope.
   *
   * Returns the decision as JSON: allowed, effect, matchedRule, stratum and
   * auditMsg (the evaluation trace is withheld). It takes a policy TYPE and
   * nothing else, on purpose: the scope is pinned to the calling contract by the
   * host (a contract that could name any scope could probe policy it has no
   * standing to see), and the operands are the platform's (a contract supplying
   * them would be supplying answers, not a question). The earlier signature,
   * evaluatePolicy(scope, opType, operands), named an import the platform never
   * served and could not have been served as declared. The manifest must declare
   * "policy:evaluate".
   *
   * @param policyType - Policy type, e.g. "contract:call"
   * @returns Serialized decision JSON, or null when the host could not answer
   *   (a denial is an answer: its `allowed` is false)
   */
  export function evaluatePolicy(policyType: string): Uint8Array | null {
    const typeBytes = String.UTF8.encode(policyType);
    const output = new Uint8Array(MAX_OUTPUT_SIZE);
    const len = host_policy_evaluate(
      changetype<usize>(typeBytes),
      typeBytes.byteLength,
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
  // Exactly the node's ValidGoalTypes (infrix-schema intent.ValidGoalTypes).
  // This block is generated, not written: tools/sdkgen rewrites the region
  // between the SDKGEN markers from goal-vocabulary.json at the repo root, which
  // infrix-core generates from the code its admission path runs
  // (`go test ./pkg/release -run SDKGoalParity -count=1 -update-sdk-vocabulary`).
  // Run `go run .` in tools/sdkgen after refreshing that file. Keep the
  // TypeScript union (typescript/src/types/governance.ts) and the Rust enum
  // (infrix-crates infrix-types/src/governance.rs) in lockstep — the same
  // vocabulary file feeds all three.
  //
  // Gap 13 first-pass removed the standalone single-leg transfer and
  // escrow-create goal types — those flows route through
  // GOAL_SETTLEMENT with the appropriate method.
  // SDKGEN-BEGIN(intent_goal_type)
  export const GOAL_AGENT_RUN: string = "AGENT_RUN";
  export const GOAL_ANCHOR_FORCE: string = "ANCHOR_FORCE";
  export const GOAL_APPROVAL_INVALIDATE: string = "APPROVAL_INVALIDATE";
  export const GOAL_BOOTSTRAP_CAPABILITY: string = "BOOTSTRAP_CAPABILITY";
  export const GOAL_BOOTSTRAP_ROLE: string = "BOOTSTRAP_ROLE";
  export const GOAL_BORROW: string = "BORROW";
  export const GOAL_BRIDGE: string = "BRIDGE";
  export const GOAL_BRIDGE_RECEIVE: string = "BRIDGE_RECEIVE";
  export const GOAL_BRIDGE_SEND: string = "BRIDGE_SEND";
  export const GOAL_CAPABILITY_EXPIRE: string = "CAPABILITY_EXPIRE";
  export const GOAL_CAPABILITY_GRANT: string = "CAPABILITY_GRANT";
  export const GOAL_CAPABILITY_REVOKE: string = "CAPABILITY_REVOKE";
  export const GOAL_COMPOUND: string = "COMPOUND";
  export const GOAL_CONFIDENTIAL_EXEC: string = "CONFIDENTIAL_EXEC";
  export const GOAL_CONTRACT_CALL: string = "CONTRACT_CALL";
  export const GOAL_CONTRACT_DEPLOY: string = "CONTRACT_DEPLOY";
  export const GOAL_CONTRACT_UPGRADE: string = "CONTRACT_UPGRADE";
  export const GOAL_CONVERT: string = "CONVERT";
  export const GOAL_COSMWASM_EXEC: string = "COSMWASM_EXEC";
  export const GOAL_CREDENTIAL_ISSUE: string = "CREDENTIAL_ISSUE";
  export const GOAL_CREDENTIAL_REVOKE: string = "CREDENTIAL_REVOKE";
  export const GOAL_CUSTOM: string = "CUSTOM";
  export const GOAL_DISCLOSURE_APPROVE: string = "DISCLOSURE_APPROVE";
  export const GOAL_DISCLOSURE_EXPIRE: string = "DISCLOSURE_EXPIRE";
  export const GOAL_DISCLOSURE_GRANT: string = "DISCLOSURE_GRANT";
  export const GOAL_DISCLOSURE_REGISTER_KEY: string = "DISCLOSURE_REGISTER_KEY";
  export const GOAL_DISCLOSURE_REVOKE: string = "DISCLOSURE_REVOKE";
  export const GOAL_DISPUTE_RESOLVE: string = "DISPUTE_RESOLVE";
  export const GOAL_EARN_YIELD: string = "EARN_YIELD";
  export const GOAL_EBPF_EXEC: string = "EBPF_EXEC";
  export const GOAL_EVM_CALL: string = "EVM_CALL";
  export const GOAL_EVM_DEPLOY: string = "EVM_DEPLOY";
  export const GOAL_EXTERNAL_ADAPTER_CALL: string = "EXTERNAL_ADAPTER_CALL";
  export const GOAL_GAS_SCHEDULE_UPDATE: string = "GAS_SCHEDULE_UPDATE";
  export const GOAL_MOVE_EXEC: string = "MOVE_EXEC";
  export const GOAL_OBJECT_CREATE: string = "OBJECT_CREATE";
  export const GOAL_OBJECT_MUTATE: string = "OBJECT_MUTATE";
  export const GOAL_OBJECT_TRANSITION: string = "OBJECT_TRANSITION";
  export const GOAL_PATCH_PROPAGATION: string = "PATCH_PROPAGATION";
  export const GOAL_PENDING_REAP: string = "PENDING_REAP";
  export const GOAL_PLUGIN_REGISTER: string = "PLUGIN_REGISTER";
  export const GOAL_PLUGIN_UPGRADE: string = "PLUGIN_UPGRADE";
  export const GOAL_POLICY_BIND: string = "POLICY_BIND";
  export const GOAL_POLICY_CHANGE: string = "POLICY_CHANGE";
  export const GOAL_POLICY_UNBIND: string = "POLICY_UNBIND";
  export const GOAL_PROVIDE_LIQUIDITY: string = "PROVIDE_LIQUIDITY";
  export const GOAL_RATE_LIMIT_UPDATE: string = "RATE_LIMIT_UPDATE";
  export const GOAL_REVERT_TRANSACTION: string = "REVERT_TRANSACTION";
  export const GOAL_ROLE_ASSIGN: string = "ROLE_ASSIGN";
  export const GOAL_ROLE_EMERGENCY: string = "ROLE_EMERGENCY";
  export const GOAL_ROLE_EXPIRE: string = "ROLE_EXPIRE";
  export const GOAL_ROLE_NORMALIZE: string = "ROLE_NORMALIZE";
  export const GOAL_ROLE_POLICY_RECHECK: string = "ROLE_POLICY_RECHECK";
  export const GOAL_ROLE_REVOKE: string = "ROLE_REVOKE";
  export const GOAL_ROLE_SUSPEND: string = "ROLE_SUSPEND";
  export const GOAL_RULE_PACK_EVAL: string = "RULE_PACK_EVAL";
  export const GOAL_SESSION_KEY_DELEGATE: string = "SESSION_KEY_DELEGATE";
  export const GOAL_SETTLEMENT: string = "SETTLEMENT";
  export const GOAL_SETTLEMENT_FINALITY_SWEEP: string = "SETTLEMENT_FINALITY_SWEEP";
  export const GOAL_SETTLEMENT_NETTING: string = "SETTLEMENT_NETTING";
  export const GOAL_SHAPE_TRANSITION: string = "SHAPE_TRANSITION";
  export const GOAL_SPONSOR_PAUSE: string = "SPONSOR_PAUSE";
  export const GOAL_SPONSOR_REGISTER: string = "SPONSOR_REGISTER";
  export const GOAL_SPONSOR_RESUME: string = "SPONSOR_RESUME";
  export const GOAL_SPONSOR_REVOKE: string = "SPONSOR_REVOKE";
  export const GOAL_SPONSOR_UPDATE: string = "SPONSOR_UPDATE";
  export const GOAL_STAKE: string = "STAKE";
  export const GOAL_SUBSYSTEM_ACTION: string = "SUBSYSTEM_ACTION";
  export const GOAL_SVM_EXEC: string = "SVM_EXEC";
  export const GOAL_SWAP: string = "SWAP";
  export const GOAL_SWARM_COORDINATE: string = "SWARM_COORDINATE";
  export const GOAL_SWARM_CREATE: string = "SWARM_CREATE";
  export const GOAL_SWARM_DISSOLVE: string = "SWARM_DISSOLVE";
  export const GOAL_SWARM_JOIN: string = "SWARM_JOIN";
  export const GOAL_SYSTEM_ANCHOR_PERIODIC: string = "SYSTEM_ANCHOR_PERIODIC";
  export const GOAL_TRUST_FRESHNESS_SWEEP: string = "TRUST_FRESHNESS_SWEEP";
  export const GOAL_TRUST_PROFILE_CREATE: string = "TRUST_PROFILE_CREATE";
  export const GOAL_TRUST_PROFILE_UPDATE: string = "TRUST_PROFILE_UPDATE";
  export const GOAL_VAULT_CREATE: string = "VAULT_CREATE";
  export const GOAL_VERIFIER_RUN: string = "VERIFIER_RUN";
  export const GOAL_WORKFLOW_START: string = "WORKFLOW_START";
  // SDKGEN-END(intent_goal_type)

  // =========================================================================
  // Evidence Operations
  // =========================================================================

  /**
   * Get the evidence bundle of an intent this contract submitted (or is executing
   * under), as JSON, in the form the disclosure layer gives an operational
   * reader: identities hashed, free text dropped, the hash chain intact. The
   * bundle is sealed when the intent's execution completes; until then the host
   * refuses. The manifest must declare "evidence:read".
   *
   * @param intentId - The intent ID
   * @returns Serialized evidence bundle, or null when the host refuses
   */
  export function getEvidence(intentId: string): Uint8Array | null {
    const idBytes = String.UTF8.encode(intentId);
    const output = new Uint8Array(MAX_OUTPUT_SIZE);
    const len = host_governance_get_evidence(
      changetype<usize>(idBytes),
      idBytes.byteLength,
      output.dataStart,
      MAX_OUTPUT_SIZE
    );

    if (len < 0) {
      return null;
    }

    const result = new Uint8Array(len);
    memory.copy(result.dataStart, output.dataStart, len);
    return result;
  }
}

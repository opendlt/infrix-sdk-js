// =============================================================================
// Intent Types
// =============================================================================

/** The parsed, validated user intent. */
export interface Intent {
  id: string;
  userAddress: string;
  goal: IntentGoal;
  constraints: IntentConstraints;
  preferences: IntentPreferences;
  rawInput?: string;
  parseConfidence: number;
  confirmed: boolean;
  status: IntentStatus;
  planId?: string;
  outcomeId?: string;
  createdAt: string;          // ISO 8601
  expiresAt?: string;         // ISO 8601
  blockHeight: number;
  metadata?: Record<string, string>;
}

/**
 * Intent goal types matching Go IntentGoalType constants in
 * pkg/intent/types.go. The mediator dispatches by exact string match,
 * so this union MUST stay in perfect parity with ValidGoalTypes (see
 * pkg/intent/sdk_goal_parity_test.go:TestSDKGoalParity_TypeScript —
 * that test fails loud if any entry here is missing from Go or any
 * Go entry is missing here). The standalone single-leg transfer and
 * escrow-create goal types were removed in Gap 13 first-pass; those
 * flows now route through 'SETTLEMENT' with the appropriate method.
 */
export type IntentGoalType =
  | 'CONVERT'
  | 'EARN_YIELD'
  | 'BORROW'
  | 'PROVIDE_LIQUIDITY'
  | 'SWAP'
  | 'STAKE'
  | 'BRIDGE'
  | 'COMPOUND'
  | 'CUSTOM'
  | 'OBJECT_CREATE'
  | 'OBJECT_MUTATE'
  | 'POLICY_BIND'
  | 'CAPABILITY_GRANT'
  | 'WORKFLOW_START'
  | 'CREDENTIAL_ISSUE'
  | 'VAULT_CREATE'
  | 'SETTLEMENT'
  | 'SETTLEMENT_NETTING'
  | 'OBJECT_TRANSITION'
  | 'POLICY_CHANGE'
  | 'CONTRACT_UPGRADE'
  | 'PATCH_PROPAGATION'
  | 'REVERT_TRANSACTION'
  | 'ROLE_ASSIGN'
  | 'ROLE_REVOKE'
  | 'ROLE_SUSPEND'
  | 'ROLE_EMERGENCY'
  | 'ROLE_NORMALIZE'
  | 'DISCLOSURE_GRANT'
  | 'DISCLOSURE_REVOKE'
  | 'CONTRACT_DEPLOY'
  | 'CONTRACT_CALL'
  | 'SWARM_CREATE'
  | 'SWARM_JOIN'
  | 'SWARM_COORDINATE'
  | 'SWARM_DISSOLVE'
  | 'SHAPE_TRANSITION'
  | 'BRIDGE_SEND'
  | 'BRIDGE_RECEIVE'
  | 'CAPABILITY_REVOKE'
  | 'POLICY_UNBIND'
  | 'ANCHOR_FORCE'
  | 'TRUST_PROFILE_CREATE'
  | 'TRUST_PROFILE_UPDATE'
  | 'BOOTSTRAP_ROLE'
  | 'SYSTEM_ANCHOR_PERIODIC'
  | 'APPROVAL_INVALIDATE'
  | 'ROLE_EXPIRE'
  | 'CAPABILITY_EXPIRE'
  | 'SPONSOR_REGISTER'
  | 'SPONSOR_UPDATE'
  | 'SPONSOR_REVOKE'
  | 'SPONSOR_PAUSE'
  | 'SPONSOR_RESUME'
  | 'DISPUTE_RESOLVE'
  | 'RULE_PACK_EVAL'
  | 'VERIFIER_RUN'
  | 'EXTERNAL_ADAPTER_CALL'
  | 'AGENT_RUN'
  | 'CONFIDENTIAL_EXEC'
  | 'SUBSYSTEM_ACTION';

/** The desired outcome of an intent. */
export interface IntentGoal {
  type: IntentGoalType;
  sourceAssets?: AssetAmount[];
  targetAssets?: AssetAmount[];
  targetState?: TargetStateSpec;
  via?: string;
  customType?: string;
  customParams?: Record<string, unknown>;
}

/** Asset and quantity. */
export interface AssetAmount {
  asset: string;
  amount: number;
  amountDecimal?: string;
  isMinimum?: boolean;
  isMaximum?: boolean;
  tokenStandard?: string;
  contractUrl?: string;
}

/** Desired on-chain state. */
export interface TargetStateSpec {
  stateType: string;
  parameters: Record<string, string>;
  contract?: string;
}

/** Hard constraints that disqualify execution paths. */
export interface IntentConstraints {
  minOutput?: number;
  minOutputDecimal?: string;
  maxGas?: number;
  maxCredits?: number;
  minConfidence?: number;
  minAvgConfidence?: number;
  maxSteps?: number;
  maxSlippage?: number;
  requiredContracts?: string[];
  excludedContracts?: string[];
  deadline?: string;           // ISO 8601
  allowedImmuneStates?: string[];
}

/** Soft optimization preferences for ranking paths. */
export interface IntentPreferences {
  optimize: OptimizationTarget;
  customWeights?: Record<string, number>;
  preferContracts?: string[];
  avoidContracts?: string[];
  maxAlternatives?: number;
}

export type OptimizationTarget =
  | 'minimize_cost'
  | 'maximize_output'
  | 'maximize_safety'
  | 'balanced'
  | 'minimize_steps'
  | 'custom';

export type IntentStatus =
  | 'pending'
  | 'planning'
  | 'awaiting_approval'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

/** Result from intent submission. */
export interface IntentResult {
  intentId: string;
  status: IntentStatus;
  planId?: string;
  outcomeId?: string;
  gasUsed?: number;
  evidenceId?: string;
  error?: string;
  blockHeight?: number;
}

/** Options for intent submission. */
export interface IntentSubmitOptions {
  constraints?: IntentConstraints;
  preferences?: IntentPreferences;
  userAddress?: string;
  metadata?: Record<string, string>;
  expiresAt?: string;
}

/** Filter for listing intents. */
export interface IntentListFilter {
  status?: IntentStatus;
  userAddress?: string;
  goalType?: IntentGoalType;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

/** An intent pending approval with its requirements. */
export interface PendingApproval {
  intent: Intent;
  plan: ExecutionPlan;
  requiredRoles: string[];
  requiredThreshold: number;
  currentApprovals: number;
  approvers: string[];
}

/** Result of intent parsing. */
export interface ParseResult {
  intent: Intent;
  confidence: number;
  ambiguous: boolean;
  candidates?: IntentCandidate[];
  warnings?: string[];
  usedLLM?: boolean;
}

/** A candidate interpretation of an ambiguous intent. */
export interface IntentCandidate {
  intent: Intent;
  confidence: number;
  explanation: string;
}

// =============================================================================
// Execution Plan Types
// =============================================================================

/** Pre-execution plan generated from an intent. */
export interface ExecutionPlan {
  id: string;
  workflowDefId?: string;
  instanceId?: string;
  generatedAt: string;        // ISO 8601
  blockHeight: number;
  planHash: string;           // hex-encoded SHA-256
  steps: PlanStep[];
  totalGasEstimate: number;
  requiredApprovals: PlanApprovalReq[];
  externalProofs?: PlanProofReq[];
  deadline?: number;
  driftThreshold?: number;
  trustAssumptions?: string[];
  compensationPlan?: PlanStep[];
  ghostEvidence?: GhostPlanEvidence;
}

/** Ghost simulation evidence attached to a plan. */
export interface GhostPlanEvidence {
  simulatedAt: string;        // ISO 8601
  totalGasEstimate: number;
  stepPredictions: GhostStepPrediction[];
  overallConfidence: number;
  freshnessStatus: string;
}

/** Ghost prediction for a single plan step. */
export interface GhostStepPrediction {
  stageId: string;
  gasPredicted: number;
  statusPredicted: string;
  stateRootAfter?: string;    // hex
  readSetSize?: number;
  writeSetSize?: number;
}

/** Canonical spine stages. */
export type SpineStage =
  | 'intent'
  | 'plan'
  | 'approval'
  | 'execution'
  | 'outcome'
  | 'evidence'
  | 'anchor';

/** A single step in the execution plan. */
export interface PlanStep {
  stageId: string;
  stageName: string;
  type: PlanStepType;
  /** Canonical spine stage this step represents. */
  spineStage: SpineStage;
  description: string;
  gasEstimate: number;
  policyCondition?: string;
  executionTarget?: string;
  dependsOn?: string[];
  expectedOutput?: string;
  /** @deprecated Use typed params and StepFamily() dispatch instead. */
  stepType?: string;
  contractCallParams?: ContractCallStepParams;
  objectOperationParams?: ObjectOperationStepParams;
  settlementParams?: SettlementStepParams;
  bridgeParams?: BridgeStepParams;
  approvalParams?: ApprovalStepParams;
  swarmActionParams?: SwarmActionStepParams;
  anchorParams?: AnchorStepParams;
  trustProfileRef?: string;
}

export type PlanStepType =
  | 'contract_call'
  | 'contract_deploy'
  | 'object_create'
  | 'object_mutate'
  | 'object_transition'
  | 'policy_check'
  | 'policy_evaluate'
  | 'approval_gate'
  | 'approval_checkpoint'
  | 'settlement'
  | 'settlement_leg'
  | 'bridge_action'
  | 'escrow_create'
  | 'escrow_release'
  | 'capability_grant'
  | 'capability_revoke'
  | 'role_assign'
  | 'role_revoke'
  | 'evidence_anchor'
  | 'anchor'
  | 'l0_transfer'
  | 'l0_data_write'
  | 'external_proof'
  | 'wait'
  | 'compensation'
  | 'compensate'
  | 'swarm_action';

/** Parameters for a contract call step. */
export interface ContractCallStepParams {
  contract: string;
  function: string;
  arguments?: unknown[];
  value?: number;
  gasLimit?: number;
}

/** Parameters for an object operation step. */
export interface ObjectOperationStepParams {
  objectType: string;
  objectId?: string;
  fields?: Record<string, unknown>;
  targetState?: string;
  /** Explicit operation: 'create' | 'mutate' | 'transition'. */
  operation?: 'create' | 'mutate' | 'transition';
}

/** Parameters for a settlement step. */
export interface SettlementStepParams {
  sourceAccount: string;
  destAccount: string;
  amount: number;
  tokenType: string;
  conditions?: Record<string, unknown>;
}

/** Parameters for a bridge action step. */
export interface BridgeStepParams {
  sourceChain: string;
  destChain: string;
  messageType: string;
  payload?: string;
  trustProfileId?: string;
}

/** Parameters for a swarm action step. */
export interface SwarmActionStepParams {
  swarmId: string;
  action: string;
  memberIndex?: number;
  targetMember?: string;
  function?: string;
  gasLimit?: number;
}

/** Parameters for an approval gate step. */
export interface ApprovalStepParams {
  requiredRoles?: string[];
  requiredCount: number;
  planHashBinding?: string;
  timeoutBlocks?: number;
}

/** Parameters for an anchor step. */
export interface AnchorStepParams {
  artifactType: string;
  artifactRef: string;
  anchorLevel?: string;
  dataAccount?: string;
  requireConfirmation?: boolean;
}

/** Approval requirement within a plan. */
export interface PlanApprovalReq {
  stageId: string;
  roles?: string[];
  identities?: string[];
  threshold: number;
}

/** External proof requirement within a plan. */
export interface PlanProofReq {
  stageId: string;
  proofType: string;
  source: string;
}

// =============================================================================
// Outcome Types
// =============================================================================

/** Post-execution outcome record for drift analysis. */
export interface OutcomeRecord {
  id: string;
  planId: string;
  instanceId?: string;
  completedAt: string;        // ISO 8601
  blockHeight: number;
  overallStatus: 'completed' | 'failed' | 'compensated';
  stepOutcomes: StepOutcome[];
  totalGasUsed: number;
  totalGasPlanned: number;
  gasDrift: number;           // percentage
  approvalEvidence: ApprovalRef[];
  driftAnalysis?: DriftAnalysis;
  outcomeHash: string;        // hex-encoded SHA-256
  planHashVerified: boolean;
  complianceViolations?: ComplianceViolationRef[];
  complianceReportId?: string;
  forensicReportId?: string;
  shapeTransitions?: ShapeTransitionRef[];
  swarmOutcomes?: SwarmStepOutcome[];
  trustProfilesUsed?: string[];
  trustDrifts?: OutcomeTrustDrift[];
  evidenceBundleId?: string;
  anchorId?: string;
  anchorStatus?: string;
  /** Finality state of this outcome. */
  finality: OutcomeFinality;
}

/** Outcome finality states. */
export type OutcomeFinality =
  | 'provisional'
  | 'locally_final'
  | 'external_contingent'
  | 'compensated'
  | 'disputed'
  | 'l0_anchored_final';

// =============================================================================
// Gap 15: Cross-cutting governance types
// =============================================================================

/** Anchor class — classifies the anchoring treatment for an artifact type. */
export type AnchorClass =
  | 'no_anchor'
  | 'digest_only'
  | 'batch'
  | 'full';

/** Privacy class — disclosure privacy classification for object fields. */
export type PrivacyClass =
  | 'public'
  | 'internal'
  | 'confidential'
  | 'restricted'
  | 'secret'
  | 'never_disclosable'
  | 'zkp_only';

/** Settlement method — how value is moved in a settlement instruction. */
export type SettlementMethod =
  | 'atomic'
  | 'dvp'
  | 'phased'
  | 'netting'
  | 'bridge'
  | 'escrow'
  | 'regulated';

/** Execution family — the category of execution runtime for a plan step. */
export type ExecutionFamily =
  | 'wasm'
  | 'object_op'
  | 'settlement'
  | 'bridge'
  | 'approval_gate'
  | 'policy_check'
  | 'disclosure_action'
  | 'swarm_action'
  | 'anchor'
  | 'wait'
  | 'external_proof'
  | 'rule_pack'
  | 'verifier_plugin'
  | 'external_adapter'
  | 'agent_module'
  | 'confidential';

/** Trust response action — deterministic downstream effect of trust drift. */
export type TrustResponseAction =
  | 'pause_plan'
  | 'invalidate_approval'
  | 'downgrade_evidence'
  | 'block_finality';

/** Actual result for a single plan step. */
export interface StepOutcome {
  stageId: string;
  plannedGas: number;
  actualGas: number;
  gasDrift: number;           // percentage
  status: 'completed' | 'failed' | 'skipped' | 'compensated';
  error?: string;
  outputHash?: string;
  ghostGasPredicted?: number;
  ghostGasDrift?: number;
  ghostStatusMatch?: boolean;
  shapeTransition?: ShapeTransitionRef;
  swarmOutcome?: SwarmStepOutcome;
  trustResult?: StepTrustResult;
}

/** Evidence of an approval within the outcome. */
export interface ApprovalRef {
  stageId: string;
  identity: string;
  role: string;
  planHash: string;
  signedAt: string;           // ISO 8601
}

/** How far execution diverged from the plan. */
export interface DriftAnalysis {
  exceededThreshold: boolean;
  maxStepDrift: number;
  driftingSteps: string[];
  summary: string;
  ghostDriftSummary?: string;
  ghostMaxDrift?: number;
}

/** Trust drift between plan and execution for a trust profile. */
export interface OutcomeTrustDrift {
  profileId: string;
  domain: string;
  planState: string;
  execState: string;
  planVersion?: number;
  execVersion?: number;
  drifted: boolean;
}

/** Reference to a compliance violation detected during execution. */
export interface ComplianceViolationRef {
  invariantId: string;
  framework: string;
  severity: string;
  description: string;
  evidenceRef?: string;
}

/** Trust evaluation result for a single plan step. */
export interface StepTrustResult {
  profileId: string;
  domain: string;
  passed: boolean;
  score?: number;
  state?: string;
  checkCount?: number;
  failCount?: number;
}

/** Outcome of a swarm coordination step. */
export interface SwarmStepOutcome {
  swarmId: string;
  action: string;
  memberResults?: MemberResult[];
  invariantsPassed?: boolean;
  coordinationStatus?: string;
}

/** Result of a single swarm member's execution within a swarm step. */
export interface MemberResult {
  contractUrl: string;
  success: boolean;
  gasUsed: number;
  error?: string;
}

/** Reference to a shape transition that occurred during execution. */
export interface ShapeTransitionRef {
  contractUrl: string;
  fromShape: string;
  toShape: string;
  triggeredBy?: string;
  blockHeight?: number;
}

// =============================================================================
// Approval Types
// =============================================================================

/** Target types for approval envelopes. */
export type ApprovalTargetType =
  | 'intent'
  | 'plan'
  | 'object'
  | 'object_operation'
  | 'policy_change'
  | 'capability_grant'
  | 'workflow_stage'
  | 'settlement'
  | 'escrow'
  | 'capability'
  | 'role';

/** Approval lifecycle states. */
export type ApprovalState =
  | 'pending'
  | 'granted'
  | 'denied'
  | 'expired'
  | 'revoked'
  | 'active'
  | 'consumed';

/** A signed approval envelope. */
export interface ApprovalEnvelope {
  id: string;
  type?: string;
  targetType: ApprovalTargetType;
  targetId: string;
  planHash: string;
  intentId?: string;
  objectId?: string;
  workflowId?: string;
  stageId?: string;
  scope?: ApprovalScope;
  conditions?: ApprovalConditions | Record<string, unknown>;
  simulationHash?: string;
  ghostReceiptId?: string;
  separationConstraints?: SeparationConstraint[];
  requiredCredential?: string;
  delegatedFrom?: string;
  delegationChain?: string[];
  signerIdentity: string;
  signerRole?: string;
  keyPageRef?: string;
  signature?: string;
  signatureHex?: string;
  signedAt?: string;          // ISO 8601
  createdAt: string;
  expiresAt?: string;
  expiresAtBlock?: number;
  expiresAtTime?: string;
  status: ApprovalState;
  state?: ApprovalState;
  revokedBy?: string;
  revokedAt?: string;
  revokeReason?: string;
}

/** Scope constraints for an approval. */
export interface ApprovalScope {
  contractUrl?: string;
  functions?: string[];
  maxAmount?: number;
  maxGas?: number;
  objectTypes?: string[];
  targetAssets?: string[];
}

/** Conditions attached to an approval. */
export interface ApprovalConditions {
  minBlockHeight?: number;
  maxBlockHeight?: number;
  requiredState?: string;
}

/** Separation-of-duties constraint requiring distinct identities for specified roles. */
export interface SeparationConstraint {
  role1: string;
  role2: string;
  mustBeDifferentIdentity: boolean;
}

/** Filter for listing approvals. */
export interface ApprovalListFilter {
  targetId?: string;
  targetType?: string;
  status?: string;
  identity?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

/** Options for submitting an approval. */
export interface ApprovalSubmitOptions {
  identity?: string;
  role?: string;
  conditions?: Record<string, unknown>;
  scope?: ApprovalScope;
  signatureHex?: string;
  expiresAt?: string;
}

// =============================================================================
// Evidence Types
// =============================================================================

/** Evidence bundle lifecycle states. */
export type BundleState =
  | 'created'
  | 'anchored'
  | 'verified'
  | 'expired';

/** Anchor status for evidence bundles. */
export type EvidenceAnchorStatus =
  | 'unanchored'
  | 'pending'
  | 'anchored'
  | 'verified'
  | 'failed';

/** Complete evidence bundle for an operation. */
export interface EvidenceBundle {
  id: string;
  type?: string;
  intentId: string;
  planId: string;
  outcomeId?: string;
  chain: EvidenceChain;
  stateRoot: string;          // hex
  anchorStatus: EvidenceAnchorStatus;
  anchorId?: string;
  anchorTxHash?: string;      // hex
  anchorBlockHeight?: number;
  anchorDataIndex?: number;
  level: EvidenceLevel;
  policyDecisions?: DecisionProofRef[];
  approvalEvidence?: ApprovalEvidenceRef[];
  trustAssumptions?: EvidenceTrustAssumption[];
  externalProofs?: ExternalProofRef[];
  driftAnalysis?: DriftAnalysisRef;
  stepOutcomes?: StepOutcomeRef[];
  bundleHash?: string;        // hex
  chainVerified?: boolean;
  state?: BundleState;
  expiresAt?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  auditEventIds?: string[];
}

/** Ordered chain of evidence links. */
export interface EvidenceChain {
  intentId: string;
  links: EvidenceLink[];
  chainHash: string;          // hex
  stateRoot: string;          // hex
  createdAt?: string;         // ISO 8601
  anchorId?: string;
  anchorStatus?: string;
  anchoredAt?: string;        // ISO 8601
}

/** A single link in the evidence chain. */
export interface EvidenceLink {
  sequence: number;
  type: EvidenceLinkType;
  contentHash: string;        // hex
  prevHash: string;           // hex
  timestamp: string;          // ISO 8601
  blockHeight?: number;
  stageId?: string;
  artifactRef?: string;
  metadata?: Record<string, string>;
}

export type EvidenceLinkType =
  | 'intent_submitted'
  | 'plan_generated'
  | 'plan_approved'
  | 'step_executed'
  | 'step_failed'
  | 'outcome_recorded'
  | 'anchor_committed'
  | 'policy_evaluated'
  | 'capability_checked'
  | 'capability_grant'
  | 'capability_revoke'
  | 'capability_exercise'
  | 'capability_denied'
  | 'grant_state'
  | 'delegation_chain'
  | 'sod_violation'
  | 'role_checked'
  | 'role_state'
  | 'role_assignment'
  | 'role_revocation'
  | 'role_sod_check'
  | 'role_emergency_grant'
  | 'external_proof';

export type EvidenceLevel =
  | 'light'
  | 'basic'
  | 'standard'
  | 'comprehensive'
  | 'full'
  | 'forensic';

/** Result of evidence verification. */
export interface EvidenceVerificationResult {
  valid: boolean;
  chainIntegrity: boolean;
  stateRootMatch: boolean;
  anchorVerified: boolean;
  linkCount: number;
  errors: string[];
  warnings: string[];
}

export type EvidenceExportFormat = 'json' | 'cbor' | 'protobuf' | 'pdf';

/** Reference to a policy decision within an evidence bundle. */
export interface DecisionProofRef {
  timestamp: string;
  policyType: string;
  scopeKey: string;
  decision: string;
  ruleId?: string;
  auditMsg?: string;
  actor?: string;
  blockHeight?: number;
}

/** Reference to an approval within an evidence bundle. */
export interface ApprovalEvidenceRef {
  stageId: string;
  identity: string;
  role: string;
  planHash: string;
  signedAt: string;           // ISO 8601
}

/** Trust assumption captured within an evidence bundle. */
export interface EvidenceTrustAssumption {
  profileId: string;
  profileName?: string;
  evaluation?: string;
  detail?: string;
}

/** Reference to a drift analysis within an evidence bundle. */
export interface DriftAnalysisRef {
  exceededThreshold: boolean;
  maxStepDrift: number;
  driftingSteps: string[];
  summary: string;
  ghostDriftSummary?: string;
  ghostMaxDrift?: number;
}

/** Reference to a step outcome within an evidence bundle. */
export interface StepOutcomeRef {
  stageId: string;
  plannedGas: number;
  actualGas: number;
  gasDrift: number;
  status: string;
  error?: string;
  outputHash?: string;
  ghostGasPredicted?: number;
  ghostGasDrift?: number;
  ghostStatusMatch?: boolean;
}

/** Reference to an external proof within an evidence bundle. */
export interface ExternalProofRef {
  sourceChain: string;
  proofType: string;
  proofHash: string;          // hex
  txHash?: string;            // hex
  blockHeight?: number;
  verified: boolean;
}

/** Snapshot of a role binding state within an evidence link. */
export interface RoleSnapshot {
  bindingID: string;
  roleName: string;
  scope: string;
  state: string;
}

/** SoD approver identity within an evidence link. */
export interface RoleSoDApprover {
  identity: string;
  role: string;
}

// =============================================================================
// Trust Types
// =============================================================================

/** Trust profile for a bridge adapter or external system. */
export interface TrustProfile {
  id: string;
  adapterId?: string;
  sourceDomain: string;
  chainId?: string;
  proofType: BridgeProofType;
  trustAssumption: TrustAssumption;
  finalityModel: FinalityModel;
  freshnessWindow?: number;   // seconds
  verifierModuleId?: string;
  minConfirmations?: number;
  validatorSetSize?: number;
  quorumThreshold?: string;
  cryptoAssumptions?: string[];
  bridgePausable?: boolean;
  upgradePolicy?: string;
  auditStatus?: string;
}

export type BridgeProofType =
  | 'merkle_inclusion'
  | 'validator_signed'
  | 'light_client'
  | 'zk_bridge'
  | 'optimistic'
  | 'oracle';

export type TrustAssumption =
  | 'trustless'
  | 'pow_majority'
  | 'honest_majority'
  | 'bft_quorum'
  | 'honest_minority'
  | 'single_honest'
  | 'optimistic'
  | 'trusted_operator'
  | 'trusted_oracle'
  | 'cryptographic'
  | 'economic_security';

export type FinalityModel =
  | 'instant'
  | 'probabilistic'
  | 'absolute'
  | 'deterministic'
  | 'epoch_based'
  | 'optimistic'
  | 'optimistic_challenge'
  | 'economic';

/** Minimum trust requirements for evaluating a profile. */
export interface TrustRequirement {
  minFinalityModel?: FinalityModel;
  maxTrustAssumption?: TrustAssumption;
  minConfirmations?: number;
  maxFreshnessAge?: number;   // seconds
  requireAudit?: boolean;
  allowedProofTypes?: BridgeProofType[];
}

/** Result of evaluating a trust profile against requirements. */
export interface TrustEvaluation {
  profileId: string;
  adapterId?: string;
  passed: boolean;
  checks: TrustCheck[];
  overallScore?: number;
}

export interface TrustCheck {
  name?: string;
  requirement: string;
  actual: string;
  passed: boolean;
  detail?: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface TrustListFilter {
  proofType?: string;
  minConfirmations?: number;
  auditStatus?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Capability Types
// =============================================================================

/** A capability grant from a grantor to a grantee. */
export interface CapabilityGrant {
  id: string;
  grantorDID: string;
  granteeDID: string;
  capabilities: string[];
  targetScope: CapabilityScope;
  grantedAt: string;          // ISO 8601
  expiresAt?: string;
  revokedAt?: string;
  status: 'active' | 'revoked' | 'expired';
  conditions?: Record<string, unknown>;
  evidenceId?: string;
}

export interface CapabilityScope {
  contractUrl?: string;
  objectType?: string;
  domain?: string;
  functions?: string[];
  maxAmount?: number;
}

export interface CapabilityType {
  name: string;
  description: string;
  domain: string;
  implies?: string[];
}

export interface CapabilityListFilter {
  grantee?: string;
  grantor?: string;
  capability?: string;
  scope?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Role Types
// =============================================================================

/** Role categories. */
export type RoleCategory =
  | 'system'
  | 'governance'
  | 'operational'
  | 'emergency';

/** Scope types for role bindings. */
export type RoleScopeType =
  | 'global'
  | 'contract'
  | 'object'
  | 'adi'
  | 'object_type'
  | 'workflow'
  | 'domain';

/** Role binding lifecycle states. */
export type BindingState =
  | 'pending'
  | 'active'
  | 'suspended'
  | 'revoked'
  | 'expired';

/** Well-known system role names. */
export type SystemRole =
  | 'admin'
  | 'operator'
  | 'treasury_officer'
  | 'compliance_auditor'
  | 'emergency_admin'
  | 'signer'
  | 'senior_signer'
  | 'authority';

/** A role binding assigning a role to an identity within a scope. */
export interface RoleBinding {
  id: string;
  holderIdentity: string;
  roleName: string;
  roleCategory?: RoleCategory;
  scopeType: RoleScopeType;
  scopeTarget: string;
  assignedBy: string;
  assignedAt: string;         // ISO 8601
  expiresAt?: string;
  revokedAt?: string;
  status: BindingState;
  holderKeyPage?: string;
  holderDID?: string;
  effectiveFrom?: string;     // ISO 8601
  effectiveUntil?: string;    // ISO 8601
  isEmergency?: boolean;
  emergencyJustification?: string;
  incompatibleRoles?: string[];
  grantedViaIntentId?: string;
  grantedViaPlanId?: string;
  conditions?: Record<string, unknown>;
}

export interface RoleListFilter {
  role?: string;
  scope?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface RoleAssignOptions {
  expiresAt?: string;
  conditions?: Record<string, unknown>;
  assignedBy?: string;
  holderKeyPage?: string;
  holderDID?: string;
  roleCategory?: RoleCategory;
  effectiveFrom?: string;
  effectiveUntil?: string;
  isEmergency?: boolean;
  emergencyJustification?: string;
  incompatibleRoles?: string[];
}

// =============================================================================
// Settlement Types
// =============================================================================

/** A settlement instruction describing a multi-leg atomic settlement. */
export interface SettlementInstruction {
  id: string;
  instructionUrl?: string;
  instructionId?: string;
  fromVault?: string;
  toVault?: string;
  assetType?: string;
  amount?: number;
  settlementMethod?: string;
  legs: SettlementLeg[];
  requiredApprovals: number;
  currentApprovals?: number;
  deadline?: string;          // ISO 8601
  preconditions: SettlementPrecondition[];
  proofRequirements?: string[];
  trustProfileRefs: string[];
  compensationInstructions?: CompensationInstruction[];
  nettingGroupId?: string;
  reservationId?: string;
  finalityRequirement?: string;
  finalityBlockHeight?: number;
  intentId?: string;
  planId?: string;
  createdBy: string;
  createdAt: string;          // ISO 8601
  updatedAt?: string;         // ISO 8601
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'cancelled';
  state?: string;
  evidenceId?: string;
}

export interface SettlementLeg {
  legId: string;
  fromAccount: string;
  fromVault?: string;
  toAccount: string;
  toVault?: string;
  asset: string;
  assetType?: string;
  amount: number;
  amountDecimal?: string;
  sequence: number;
  domain?: string;
  bridgeProofId?: string;
  status?: string;
  reservationId?: string;
  settledAt?: string;         // ISO 8601
  failReason?: string;
}

export interface SettlementPrecondition {
  type: 'balance_check' | 'approval' | 'trust_evaluation' | 'time_lock' | 'custom';
  target?: string;
  operator?: string;
  value?: string;
  params: Record<string, unknown>;
  satisfied?: boolean;
  evaluatedAt?: string;       // ISO 8601
}

/** Compensation instruction for a failed settlement leg. */
export interface CompensationInstruction {
  legId: string;
  action: string;
  targetVault: string;
  amount: number;
  executed?: boolean;
  executedAt?: string;        // ISO 8601
}

export interface SettlementListFilter {
  status?: string;
  party?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface SettlementCreateOptions {
  legs: SettlementLeg[];
  preconditions?: SettlementPrecondition[];
  trustProfileRefs?: string[];
  deadline?: string;
}

// =============================================================================
// Escrow Types
// =============================================================================

/** An escrow holding funds with conditional release. */
export interface Escrow {
  id: string;
  escrowUrl?: string;
  escrowId?: string;
  depositor: string;
  beneficiary: string;
  arbiter?: string;
  asset: string;
  assetType?: string;
  amount: number;
  amountDecimal?: string;
  deadline?: string;          // ISO 8601
  parties?: EscrowParty[];
  assets?: EscrowAsset[];
  releaseConditions: EscrowCondition[];
  releaseLogic?: string;
  disputes?: DisputeRecord[];
  disputeWindow?: number;     // seconds
  settlementInstructionId?: string;
  status: 'funded' | 'released' | 'disputed' | 'refunded' | 'expired';
  state?: string;
  createdAt: string;          // ISO 8601
  updatedAt?: string;         // ISO 8601
  fundedAt?: string;          // ISO 8601
  releasedAt?: string;
  intentId?: string;
  planId?: string;
  evidenceId?: string;
}

/** A party to an escrow arrangement. */
export interface EscrowParty {
  partyId: string;
  role: string;
  address: string;
  shareBps?: number;
}

/** An asset held within an escrow. */
export interface EscrowAsset {
  assetType: string;
  amount: number;
  released?: boolean;
  refunded?: boolean;
}

export interface EscrowCondition {
  conditionId?: string;
  type: 'approval' | 'time_lock' | 'external_proof' | 'state_check' | 'custom';
  description?: string;
  parameters?: Record<string, unknown>;
  params: Record<string, unknown>;
  satisfied: boolean;
  satisfiedAt?: string;       // ISO 8601
  evaluatedAt?: string;       // ISO 8601
}

/** A dispute record within an escrow. */
export interface DisputeRecord {
  disputeId: string;
  filedBy: string;
  filedAt: string;            // ISO 8601
  reason: string;
  evidence?: string[];
  resolution?: string;
  resolvedBy?: string;
  resolvedAt?: string;        // ISO 8601
}

export interface EscrowListFilter {
  status?: string;
  depositor?: string;
  beneficiary?: string;
  limit?: number;
  offset?: number;
}

export interface EscrowCreateOptions {
  depositor: string;
  beneficiary: string;
  asset: string;
  amount: number;
  releaseConditions: EscrowCondition[];
  disputeWindow?: number;
  arbiter?: string;
}

// =============================================================================
// Disclosure Types
// =============================================================================

/** Disclosure target types. */
export type DisclosureTargetType =
  | 'object'
  | 'contract_state'
  | 'evidence'
  | 'outcome'
  | 'call_envelope';

/** Disclosure scope types. */
export type DisclosureScopeType =
  | 'global'
  | 'contract'
  | 'object'
  | 'workflow';

/** Disclosure purpose categories. */
export type DisclosurePurpose =
  | 'audit'
  | 'compliance'
  | 'operational'
  | 'investigation'
  | 'counterparty';

/** Disclosure proof types. */
export type DisclosureProofType =
  | 'none'
  | 'zkp'
  | 'authorization';

/** A disclosure grant allowing access to specific object fields. */
export interface DisclosureGrant {
  id: string;
  grantUrl?: string;
  grantorIdentity: string;
  grantorRole?: string;
  granteeIdentity: string;
  granteeDid?: string;
  granteeRole?: string;
  targetType: string;
  targetId: string;
  disclosedFields: string[];
  disclosedKeys?: string[];
  scopeType?: DisclosureScopeType;
  scopeTarget?: string;
  effectiveFrom?: string;     // ISO 8601
  effectiveUntil?: string;    // ISO 8601
  workflowStageScope?: string;
  conditions?: Record<string, unknown>;
  proofRequired?: boolean;
  proofType?: DisclosureProofType;
  purpose?: DisclosurePurpose | string;
  justification?: string;
  grantedViaIntentId?: string;
  grantedViaPlanId?: string;
  approvalRequired?: boolean;
  authorityUrl?: string;
  grantedAt: string;          // ISO 8601
  expiresAt?: string;
  revokedAt?: string;
  status: 'active' | 'revoked' | 'expired';
}

export interface DisclosureListFilter {
  grantee?: string;
  grantor?: string;
  targetType?: string;
  targetId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface DisclosureGrantOptions {
  expiresAt?: string;
  purpose?: string;
  conditions?: Record<string, unknown>;
}

// =============================================================================
// Anchor Types
// =============================================================================

/** Types of artifacts that can be anchored to L0. */
export type ArtifactType =
  | 'state_root'
  | 'evidence_bundle'
  | 'evidence_chain'
  | 'outcome'
  | 'outcome_digest'
  | 'approval_digest'
  | 'plan_hash'
  | 'audit_checkpoint'
  | 'settlement'
  | 'custom';

/** Anchor encoding types. */
export type AnchorType =
  | 'full'
  | 'digest'
  | 'merkle_root'
  | 'batch';

/** Anchor record lifecycle status. */
export type AnchorRecordStatus =
  | 'pending'
  | 'submitted'
  | 'committed'
  | 'confirmed'
  | 'verified'
  | 'failed';

/** A record anchored to L0 (Accumulate layer). */
export interface AnchoredRecord {
  id: string;
  artifactType: ArtifactType;
  artifactId?: string;
  artifactHash: string;       // hex
  anchorType?: AnchorType;
  anchorData?: string;        // hex
  anchorDataSize?: number;
  l0TxHash: string;           // hex
  l0BlockHeight: number;
  l0DataAccount: string;      // acc:// URL
  l0DataIndex?: number;
  previousAnchorId?: string;
  previousAnchorHash?: string; // hex
  infrixBlockHeight?: number;
  stateRoot?: string;         // hex
  status: AnchorRecordStatus;
  submittedAt?: string;       // ISO 8601
  committedAt?: string;
  confirmedAt?: string;
  verifiedAt?: string;
  failedAt?: string;
  failureReason?: string;
  retryCount?: number;
  anchoredByPolicy?: string;
  anchoredViaIntentId?: string;
  creditsConsumed?: number;
  batchId?: string;
  batchMerkleProof?: string[];
}

export interface AnchorListFilter {
  artifactType?: string;
  status?: string;
  fromBlock?: number;
  toBlock?: number;
  limit?: number;
  offset?: number;
}

export interface AnchorVerificationResult {
  anchorId: string;
  valid: boolean;
  l0TxHash: string;
  l0BlockHeight: number;
  artifactHashMatch: boolean;
  l0DataPresent: boolean;
  errors: string[];
}

export interface AnchorStats {
  totalAnchors: number;
  pendingAnchors: number;
  verifiedAnchors: number;
  failedAnchors: number;
  avgAnchorLatencyMs: number;
  lastAnchorAt?: string;
}

// =============================================================================
// Object Types
// =============================================================================

/** Registry object types matching Go ObjectType constants. */
export type ObjectType =
  | 'asset'
  | 'data_record'
  | 'identity'
  | 'permission_set'
  | 'authority'
  | 'contract'
  | 'intent'
  | 'approval'
  | 'policy_binding'
  | 'workflow_instance'
  | 'execution_plan'
  | 'outcome_record'
  | 'anchored_record'
  | 'credential'
  | 'attestation'
  | 'vault'
  | 'capability_grant'
  | 'settlement_instruction'
  | 'escrow'
  | 'bridge_proof'
  | 'trust_profile'
  | 'role_binding'
  | 'evidence_bundle'
  | 'disclosure_grant';

/** A governed object in the object registry. */
export interface GoverningObject {
  type: string;
  id: string;
  owner: string;
  state: string;
  fields: Record<string, unknown>;
  policies: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ObjectAuditEntry {
  timestamp: string;
  action: 'create' | 'transition' | 'field_update' | 'policy_bind' | 'policy_evaluate';
  actor: string;
  details: Record<string, unknown>;
  intentId?: string;
  evidenceId?: string;
}

export interface ObjectListFilter {
  status?: string;
  owner?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface ObjectCreateOptions {
  owner?: string;
  policies?: string[];
  metadata?: Record<string, string>;
}

export interface ObjectTransitionOptions {
  reason?: string;
  metadata?: Record<string, string>;
}

// =============================================================================
// Policy Types
// =============================================================================

/** A policy rule applied to a scope. */
export interface PolicyRule {
  id: string;
  name: string;
  scope: string;
  type: string;
  expression: string;
  action: 'allow' | 'deny' | 'require_approval';
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PolicyScope = string;

export interface PolicyDecision {
  ruleId: string;
  ruleName: string;
  action: string;
  operands: Record<string, unknown>;
  result: 'allowed' | 'denied' | 'approval_required';
  timestamp: string;
  evaluationMs: number;
}

export interface PolicyConflict {
  ruleA: string;
  ruleB: string;
  conflictType: 'contradiction' | 'subsumption' | 'overlap';
  description: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  matchedRules: PolicyDecision[];
  deniedBy?: string;
  requiresApproval: boolean;
  requiredRoles?: string[];
}

export interface PolicySimulationResult {
  wouldAllow: boolean;
  matchedRules: PolicyDecision[];
  sideEffects: string[];
  warnings: string[];
}

// =============================================================================
// L0 Protocol Object Types
// =============================================================================

/** An Accumulate token/credit account. */
export interface Asset {
  accountUrl: string;
  tokenUrl: string;
  balance: number;
  creditBalance?: number;
  ownerAdi: string;
  authorityUrl: string;
  lastTxBlock?: number;
}

/** An Accumulate data account. */
export interface DataRecord {
  accountUrl: string;
  entryCount: number;
  ownerAdi: string;
  authorityUrl: string;
  dataType?: string;
}

/** An Accumulate ADI (Accumulate Digital Identifier). */
export interface Identity {
  adiUrl: string;
  keyBooks: string[];
  subAccounts?: string[];
  authorities?: string[];
  createdAt?: string;
}

/** An Accumulate key page (permission set). */
export interface PermissionSet {
  keyPageUrl: string;
  keyBookUrl: string;
  keys: KeyEntry[];
  creditBalance: number;
  threshold: number;
  version: number;
}

/** A key entry within a permission set. */
export interface KeyEntry {
  publicKeyHash: string;      // hex
  delegate?: string;
  lastUsedOn?: number;
}

/** An Accumulate key book (authority). */
export interface Authority {
  keyBookUrl: string;
  ownerAdi: string;
  pages: string[];
  pageCount: number;
}

/** A deployed contract object. */
export interface ContractObject {
  contractUrl: string;
  ownerAdi: string;
  authorityUrl: string;
  codeHash: string;           // hex
  version: number;
  deployedAt?: string;
}

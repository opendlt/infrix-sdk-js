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

/** Intent goal types matching Go IntentGoalType constants. */
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
  | 'TRANSFER'
  | 'POLICY_BIND'
  | 'CAPABILITY_GRANT'
  | 'WORKFLOW_START'
  | 'CREDENTIAL_ISSUE'
  | 'VAULT_CREATE'
  | 'SETTLEMENT'
  | 'ESCROW_CREATE'
  | 'OBJECT_TRANSITION'
  | 'POLICY_CHANGE';

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
}

/** A single step in the execution plan. */
export interface PlanStep {
  stageId: string;
  stageName: string;
  type: PlanStepType;
  description: string;
  gasEstimate: number;
  policyCondition?: string;
  executionTarget?: string;
  dependsOn?: string[];
  expectedOutput?: string;
}

export type PlanStepType =
  | 'contract_call'
  | 'contract_deploy'
  | 'object_create'
  | 'object_transition'
  | 'settlement_leg'
  | 'escrow_create'
  | 'escrow_release'
  | 'capability_grant'
  | 'capability_revoke'
  | 'role_assign'
  | 'role_revoke'
  | 'policy_evaluate'
  | 'approval_checkpoint'
  | 'evidence_anchor'
  | 'l0_transfer'
  | 'l0_data_write'
  | 'external_proof'
  | 'compensation';

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
}

/** Actual result for a single plan step. */
export interface StepOutcome {
  stageId: string;
  plannedGas: number;
  actualGas: number;
  gasDrift: number;           // percentage
  status: 'completed' | 'failed' | 'skipped' | 'compensated';
  error?: string;
  outputHash?: string;
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
}

// =============================================================================
// Approval Types
// =============================================================================

/** A signed approval envelope. */
export interface ApprovalEnvelope {
  id: string;
  targetType: 'intent' | 'object' | 'settlement' | 'escrow' | 'capability' | 'role';
  targetId: string;
  planHash: string;
  scope?: ApprovalScope;
  conditions?: Record<string, unknown>;
  signerIdentity: string;
  signerRole?: string;
  signatureHex?: string;
  createdAt: string;
  expiresAt?: string;
  status: 'active' | 'revoked' | 'expired' | 'consumed';
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

/** Complete evidence bundle for an operation. */
export interface EvidenceBundle {
  id: string;
  intentId: string;
  planId: string;
  chain: EvidenceChain;
  stateRoot: string;          // hex
  anchorStatus: 'pending' | 'anchored' | 'verified' | 'failed';
  anchorId?: string;
  level: EvidenceLevel;
  createdAt: string;
  completedAt?: string;
}

/** Ordered chain of evidence links. */
export interface EvidenceChain {
  intentId: string;
  links: EvidenceLink[];
  chainHash: string;          // hex
  stateRoot: string;          // hex
}

/** A single link in the evidence chain. */
export interface EvidenceLink {
  sequence: number;
  type: EvidenceLinkType;
  contentHash: string;        // hex
  prevHash: string;           // hex
  timestamp: string;          // ISO 8601
  blockHeight: number;
  stageId?: string;
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
  | 'role_checked'
  | 'external_proof';

export type EvidenceLevel =
  | 'basic'
  | 'standard'
  | 'comprehensive'
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
  | 'honest_majority'
  | 'honest_minority'
  | 'single_honest'
  | 'trusted_operator'
  | 'economic_security';

export type FinalityModel =
  | 'instant'
  | 'probabilistic'
  | 'deterministic'
  | 'optimistic_challenge'
  | 'economic';

/** Result of evaluating a trust profile against requirements. */
export interface TrustEvaluation {
  profileId: string;
  passed: boolean;
  checks: TrustCheck[];
  overallScore?: number;
}

export interface TrustCheck {
  requirement: string;
  actual: string;
  passed: boolean;
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

/** A role binding assigning a role to an identity within a scope. */
export interface RoleBinding {
  id: string;
  holderIdentity: string;
  roleName: string;
  scopeType: 'global' | 'contract' | 'adi' | 'object_type';
  scopeTarget: string;
  assignedBy: string;
  assignedAt: string;         // ISO 8601
  expiresAt?: string;
  revokedAt?: string;
  status: 'active' | 'revoked' | 'expired';
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
}

// =============================================================================
// Settlement Types
// =============================================================================

/** A settlement instruction describing a multi-leg atomic settlement. */
export interface SettlementInstruction {
  id: string;
  legs: SettlementLeg[];
  preconditions: SettlementPrecondition[];
  trustProfileRefs: string[];
  createdBy: string;
  createdAt: string;          // ISO 8601
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'cancelled';
  requiredApprovals: number;
  currentApprovals: number;
  evidenceId?: string;
}

export interface SettlementLeg {
  legId: string;
  fromAccount: string;
  toAccount: string;
  asset: string;
  amount: number;
  amountDecimal?: string;
  sequence: number;
}

export interface SettlementPrecondition {
  type: 'balance_check' | 'approval' | 'trust_evaluation' | 'time_lock' | 'custom';
  params: Record<string, unknown>;
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
  depositor: string;
  beneficiary: string;
  asset: string;
  amount: number;
  amountDecimal?: string;
  releaseConditions: EscrowCondition[];
  disputeWindow?: number;     // seconds
  arbiter?: string;
  status: 'funded' | 'released' | 'disputed' | 'refunded' | 'expired';
  createdAt: string;          // ISO 8601
  releasedAt?: string;
  evidenceId?: string;
}

export interface EscrowCondition {
  type: 'approval' | 'time_lock' | 'external_proof' | 'state_check' | 'custom';
  params: Record<string, unknown>;
  satisfied: boolean;
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

/** A disclosure grant allowing access to specific object fields. */
export interface DisclosureGrant {
  id: string;
  grantorIdentity: string;
  granteeIdentity: string;
  targetType: string;
  targetId: string;
  disclosedFields: string[];
  purpose?: string;
  grantedAt: string;          // ISO 8601
  expiresAt?: string;
  revokedAt?: string;
  status: 'active' | 'revoked' | 'expired';
  conditions?: Record<string, unknown>;
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

/** A record anchored to L0 (Accumulate layer). */
export interface AnchoredRecord {
  id: string;
  artifactType: 'evidence_chain' | 'outcome' | 'settlement' | 'state_root' | 'custom';
  artifactHash: string;       // hex
  l0TxHash: string;           // hex
  l0DataAccount: string;      // acc:// URL
  l0BlockHeight: number;
  status: 'pending' | 'committed' | 'verified' | 'failed';
  committedAt?: string;
  verifiedAt?: string;
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

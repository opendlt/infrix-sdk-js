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
 * Intent goal types: exactly the node's `ValidGoalTypes` (infrix-schema
 * `intent.ValidGoalTypes`). The mediator dispatches by exact string match, so a
 * goal missing here cannot be NAMED by a typed client and a goal that is not the
 * node's is REFUSED at admission.
 *
 * The body of this union is generated, not written: `tools/sdkgen` rewrites the
 * region between the SDKGEN markers from `goal-vocabulary.json` at the repo root,
 * which infrix-core generates from the code its admission path runs
 * (`go test ./pkg/release -run SDKGoalParity -count=1 -update-sdk-vocabulary`).
 * Run `go run .` in `tools/sdkgen` after refreshing that file. Three fences keep
 * this honest: `tools/sdkgen`'s tests, `src/goalVocabulary.test.ts`, and
 * infrix-core's `pkg/release` SDKGoalParity fence, which parses this union
 * independently of the generator.
 *
 * The standalone single-leg transfer and escrow-create goal types were
 * removed in Gap 13 first-pass; those flows now route through
 * 'SETTLEMENT' with the appropriate method.
 */
// SDKGEN-BEGIN(intent_goal_type)
export const INTENT_GOAL_TYPES = [
  'AGENT_RUN',
  'ANCHOR_FORCE',
  'APPROVAL_INVALIDATE',
  'BOOTSTRAP_CAPABILITY',
  'BOOTSTRAP_ROLE',
  'BORROW',
  'BRIDGE',
  'BRIDGE_RECEIVE',
  'BRIDGE_SEND',
  'CAPABILITY_EXPIRE',
  'CAPABILITY_GRANT',
  'CAPABILITY_REVOKE',
  'COMPOUND',
  'CONFIDENTIAL_EXEC',
  'CONTRACT_CALL',
  'CONTRACT_DEPLOY',
  'CONTRACT_UPGRADE',
  'CONVERT',
  'COSMWASM_EXEC',
  'CREDENTIAL_ISSUE',
  'CREDENTIAL_REVOKE',
  'CUSTOM',
  'DISCLOSURE_APPROVE',
  'DISCLOSURE_EXPIRE',
  'DISCLOSURE_GRANT',
  'DISCLOSURE_REGISTER_KEY',
  'DISCLOSURE_REVOKE',
  'DISPUTE_RESOLVE',
  'EARN_YIELD',
  'EBPF_EXEC',
  'EVM_CALL',
  'EVM_DEPLOY',
  'EXTERNAL_ADAPTER_CALL',
  'GAS_SCHEDULE_UPDATE',
  'MOVE_EXEC',
  'OBJECT_CREATE',
  'OBJECT_MUTATE',
  'OBJECT_TRANSITION',
  'PATCH_PROPAGATION',
  'PENDING_REAP',
  'PLUGIN_REGISTER',
  'PLUGIN_UPGRADE',
  'POLICY_BIND',
  'POLICY_CHANGE',
  'POLICY_UNBIND',
  'PROVIDE_LIQUIDITY',
  'RATE_LIMIT_UPDATE',
  'REVERT_TRANSACTION',
  'ROLE_ASSIGN',
  'ROLE_EMERGENCY',
  'ROLE_EXPIRE',
  'ROLE_NORMALIZE',
  'ROLE_POLICY_RECHECK',
  'ROLE_REVOKE',
  'ROLE_SUSPEND',
  'RULE_PACK_EVAL',
  'SESSION_KEY_DELEGATE',
  'SETTLEMENT',
  'SETTLEMENT_FINALITY_SWEEP',
  'SETTLEMENT_NETTING',
  'SHAPE_TRANSITION',
  'SPONSOR_PAUSE',
  'SPONSOR_REGISTER',
  'SPONSOR_RESUME',
  'SPONSOR_REVOKE',
  'SPONSOR_UPDATE',
  'STAKE',
  'SUBSYSTEM_ACTION',
  'SVM_EXEC',
  'SWAP',
  'SWARM_COORDINATE',
  'SWARM_CREATE',
  'SWARM_DISSOLVE',
  'SWARM_JOIN',
  'SYSTEM_ANCHOR_PERIODIC',
  'TRUST_FRESHNESS_SWEEP',
  'TRUST_PROFILE_CREATE',
  'TRUST_PROFILE_UPDATE',
  'VAULT_CREATE',
  'VERIFIER_RUN',
  'WORKFLOW_START',
] as const;
export type IntentGoalType = (typeof INTENT_GOAL_TYPES)[number];
// SDKGEN-END(intent_goal_type)

const INTENT_GOAL_TYPE_SET: ReadonlySet<string> = new Set<string>(INTENT_GOAL_TYPES);

/**
 * True when `value` is a goal type the node accepts. Use it to validate a goal
 * string that did not come from the typed union (CLI input, JSON, a prompt).
 */
export function isIntentGoalType(value: unknown): value is IntentGoalType {
  return typeof value === 'string' && INTENT_GOAL_TYPE_SET.has(value);
}

/**
 * The scope a CAPABILITY_GRANT states. The node declares `workflowStageScope`
 * and `purpose` required and has no default for either: a default would be an
 * ambient grant, exercisable at every stage and for every purpose.
 */
export interface CapabilityGrantScope {
  /** A workflow stage name, or '*' to opt into every stage. */
  workflowStageScope: string;
  /** Why the capability is granted (a bounded set). */
  purpose: DisclosurePurpose;
  /** Scope the grant to one contract (`targetScope`); unscoped when omitted. */
  contractUrl?: string;
}

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

/** Filter for listing intents: the parameters GET /v4/intents accepts, and no others. */
export interface IntentListFilter {
  status?: IntentStatus;
  goalType?: IntentGoalType;
}

/** What GET /v4/intents/{id} answers: every member the route declares. */
export interface IntentAnswer {
  /** The intent as the object registry holds it. */
  readonly intent: unknown;
  /** The intent's lifecycle state. */
  readonly status: unknown;
}

/** What GET /v4/intents/{id}/evidence answers: every member the route declares. */
export interface IntentEvidenceAnswer {
  /** The evidence bundles linked to the intent, as the object registry holds them (each carries its `id`). */
  readonly bundles: unknown;
  readonly count: unknown;
  /** The intent as the object registry holds it. */
  readonly intent: unknown;
  readonly intentId: unknown;
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
  signature: string;
  signerPublicKey: string;
  signatureAlgorithm: 'ed25519';
  /** @deprecated Approvals are signed over the canonical preimage; nodes do not return this. */
  signaturePayload?: string;
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

/** Filter for listing approvals: the parameter GET /v4/approvals accepts, and no other. */
export interface ApprovalListFilter {
  status?: string;
}

/** Options for submitting an approval. */
export interface ApprovalSubmitOptions {
  identity: string;
  role?: string;
  conditions?: Record<string, unknown>;
  scope?: ApprovalScope;
  /**
   * Hex Ed25519 signature over the CANONICAL approval preimage published by
   * `approvals.signing()` (sign with @infrix/wallet's bindApprovalSigningRequest).
   * The node verifies it in the approval store, against `keyPageRef` on L0.
   */
  signature: string;
  /** Hex Ed25519 public key; sha256 of it must be an entry on `keyPageRef`. */
  signerPublicKey: string;
  signatureAlgorithm: 'ed25519';
  /** Accumulate key page holding the signing key (required by the node). */
  keyPageRef: string;
  /** Why the approval is given (>= 10 characters); required on the stage path. */
  rationale?: string;
  /**
   * @deprecated Ignored. Approvals are signed over the canonical preimage, not
   * over a caller-chosen payload (session 37, S24).
   */
  signaturePayload?: string;
  stageId?: string;
  expiresAt?: string;
}

/** Result of a signed stage approval (intent.approve / governed.approve / approval.submit). */
export interface GovernedApproveResult {
  intentId: string;
  stageId: string;
  approvalId: string;
  status: 'resumed' | 'awaiting_more_approvals';
  succeeded?: boolean;
  outcomeId?: string;
  evidenceId?: string;
  anchorId?: string;
  detail?: string;
}

/**
 * What an approver must sign for a parked stage (approval.signing /
 * GET /v4/intents/approval-signing). Recompute `digest` from the fields before
 * signing — never sign a digest you did not derive.
 */
export interface ApprovalSigningRequest {
  workflowId: string;
  stageId: string;
  planHash: number[] | string;
  scope: {
    contractUrl?: string;
    functions?: string[];
    maxAmount?: number;
    maxGas?: number;
    targetAssets?: string[];
  };
  simulationHash: number[] | string;
  conditions: { minBlockHeight?: number; maxBlockHeight?: number; requiredState?: string };
  signerIdentity: string;
  keyPageRef: string;
  digest: string;
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

/** What GET /v4/evidence/{id}/verify answers: every member the route declares. */
export interface EvidenceVerifyAnswer {
  readonly bundleId: unknown;
  /** Whether the bundle's hash chain holds. */
  readonly chainVerified: unknown;
}

/** What GET /v4/evidence/{id}/export answers: every member the route declares. */
export interface EvidenceExportAnswer {
  readonly bundle: unknown;
  readonly bundleId: unknown;
  readonly bytes: unknown;
  readonly exportHash: unknown;
  readonly format: unknown;
}

/** What GET /v4/evidence/{id}/anchor answers: every member the route declares. */
export interface EvidenceAnchorAnswer {
  readonly anchorBlock: unknown;
  readonly anchorDataIdx: unknown;
  readonly anchorStatus: unknown;
  readonly anchorTxHash: unknown;
  readonly bundleId: unknown;
  readonly stateRoot: unknown;
}

/** The formats GET /v4/evidence/{id}/export accepts. */
export type EvidenceExportFormat = 'json' | 'portable';

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
  /**
   * The GOVERNED validator set a bridge profile's quorum proofs are verified
   * against. Set only by TRUST_PROFILE_CREATE / TRUST_PROFILE_UPDATE (each
   * parks for admin approval); every change bumps the profile version.
   */
  bridgeValidators?: BridgeValidator[];
  cryptoAssumptions?: string[];
  bridgePausable?: boolean;
  upgradePolicy?: string;
  auditStatus?: string;
}

/** One member of a governed bridge validator set. */
export interface BridgeValidator {
  /** 32-byte validator id, hex. */
  id: string;
  /** Public key, hex: 32 bytes (ed25519) or 33/65 bytes (secp256k1). */
  publicKey: string;
  algorithm: 'ed25519' | 'secp256k1';
  /** Stake weight, a positive decimal integer. */
  stake: string;
}

/**
 * Body of POST /v4/bridge/receive. It names the message and carries the
 * proof; what the proof is verified against (verifier, validator set,
 * threshold) comes from the node's governed bridge-<sourceChain> trust
 * profile. A body carrying verifierId, expectedClaims, proof or proofType is
 * refused by name (400): the proof has exactly one key, proofHex.
 */
export interface BridgeReceiveRequest {
  sourceChain: string;
  messageId: string;
  /** Hex SHA-256 of the payload the validator quorum signed. */
  payloadHash: string;
  /** Hex JSON BridgeQuorumPresentation over the canonical bridge message. */
  proofHex: string;
  actor: string;
  trustProfileId?: string;
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

/** Filter for listing capability grants: the parameter GET /v4/capabilities/grants accepts, and no other. */
export interface CapabilityListFilter {
  state?: string;
}

/** What GET /v4/capabilities/check answers: every member the route declares. */
export interface CapabilityCheckAnswer {
  readonly capability: unknown;
  /** Whether the identity holds the capability. */
  readonly granted: boolean;
  /** The grants that give the identity the capability. */
  readonly grants: unknown;
  readonly identity: unknown;
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

/**
 * What GET /v4/roles and GET /v4/roles/{identity} answer: every member each route declares. `identity`
 * is declared by the per-identity route only, so it is present on an `roles.list(identity)` answer and
 * absent on `roles.list()`.
 */
export interface RoleListAnswer {
  readonly count: unknown;
  /** The identity the roles belong to (GET /v4/roles/{identity} only). */
  readonly identity?: unknown;
  readonly roles: unknown;
}

/** What GET /v4/roles/check answers: every member the route declares. */
export interface RoleCheckAnswer {
  /** Whether the identity holds the role. */
  readonly hasRole: boolean;
  readonly identity: unknown;
  readonly role: unknown;
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

/** Filter for listing settlements: the parameters GET /v4/settlements accepts, and no others. */
export interface SettlementListFilter {
  id?: string;
  state?: string;
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

/** Filter for listing escrows: the parameters GET /v4/escrows accepts, and no others. */
export interface EscrowListFilter {
  status?: string;
  limit?: number;
}

/** What GET /v4/escrows answers: every member the route declares. */
export interface EscrowListAnswer {
  readonly escrows: unknown;
  readonly total: unknown;
}

/** What GET /v4/escrows/{id} answers: every member the route declares. */
export interface EscrowAnswer {
  readonly amount: unknown;
  readonly arbiter: unknown;
  readonly asset: unknown;
  readonly beneficiary: unknown;
  readonly createdAt: unknown;
  readonly depositedAt: unknown;
  readonly depositor: unknown;
  readonly disputes: unknown;
  readonly holdingAccount: unknown;
  readonly id: unknown;
  readonly instructionId: unknown;
  readonly instructionState: unknown;
  readonly legId: unknown;
  readonly refunded: unknown;
  readonly refundedAt: unknown;
  readonly released: unknown;
  readonly releasedAt: unknown;
  readonly status: unknown;
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

/** Filter for listing disclosure grants: the parameter GET /v4/disclosures accepts, and no other. */
export interface DisclosureListFilter {
  state?: string;
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

/** Filter for listing anchors: the parameters GET /v4/anchors accepts, and no others. */
export interface AnchorListFilter {
  intentId?: string;
  state?: string;
}

/** What GET /v4/anchors/{id} answers: every member the route declares. */
export interface AnchorAnswer {
  readonly anchor: unknown;
  readonly id: unknown;
  readonly state: unknown;
  readonly txHash: unknown;
}

/** What GET /v4/anchors/{id}/verify answers: every member the route declares. */
export interface AnchorVerifyAnswer {
  readonly anchor: unknown;
  readonly dataUrl: unknown;
  readonly digest: unknown;
  readonly id: unknown;
  readonly state: unknown;
  readonly txHash: unknown;
  /** Whether the anchor verified against L0. */
  readonly verified: unknown;
}

/** What GET /v4/anchors/stats answers: every member the route declares. */
export interface AnchorStatsAnswer {
  readonly byState: unknown;
  readonly byType: unknown;
  readonly scope: unknown;
  readonly totalAnchors: unknown;
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

/** Filter for listing objects of a type: the parameters GET /v4/objects/{type} accepts, and no others. */
export interface ObjectListFilter {
  /** The field to match, with `value`. */
  field?: string;
  /** The most objects a `field` match returns. */
  filterLimit?: number;
  id?: string;
  state?: string;
  value?: string;
}

/** What GET /v4/objects/{type}/{id}/audit answers: every member the route declares. */
export interface ObjectAuditAnswer {
  /** The object's audit trail. */
  readonly audit: unknown;
  readonly objectId: unknown;
  readonly objectType: unknown;
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

/** One finding of a policy set's static analysis (GET /v4/policies/conflicts). */
export interface PolicyAnalysisWarning {
  severity: string;
  ruleId?: string;
  message: string;
}

/** The static analysis of one policy set. Lists are omitted when empty. */
export interface PolicyAnalysis {
  policySetId: string;
  policyClass?: string;
  coverageScore?: number;
  unreachableRules?: string[];
  redundantRules?: string[];
  warnings?: PolicyAnalysisWarning[];
  referencedOperands?: string[];
  unusedOperands?: string[];
}

/** One rule as the structural conflict detector reports it. */
export interface PolicyConflictRule {
  ruleId: string;
  priority: number;
  effect: string;
  auditMsg?: string;
}

/**
 * The structural conflict detector's report for one policy set: duplicate rule ids, identical
 * conditions with opposing effects, a rule whose type is not its set's, contradictions on one priority
 * band, and conflicts between strata (the higher stratum wins) among the policy sets bound in the scope.
 * A cross-stratum conflict is reported on the OVERRIDDEN set (`lowerSetId`).
 */
export interface PolicyConflictReport {
  hasConflict: boolean;
  matchingRules?: PolicyConflictRule[];
  conflictPairs?: Array<{ ruleA: PolicyConflictRule; ruleB: PolicyConflictRule }>;
  crossStratumConflicts?: Array<{
    higherStratumRule: string;
    higherStratum?: number;
    higherEffect: string;
    higherSetId?: string;
    lowerStratumRule: string;
    lowerStratum?: number;
    lowerEffect: string;
    lowerSetId?: string;
    resolution: string;
  }>;
}

/**
 * What GET /v4/policies/conflicts answers: for each policy set bound in the scope, TWO analyses. `analysis`
 * is the shadowing analysis (unreachable and redundant rules, coverage, warnings). `conflicts` is the
 * structural conflict detector's report; `conflictsError` replaces it when the detector could not run.
 * A set is conflict-free only when `conflicts.hasConflict` is false.
 */
export interface PolicyScopeAnalysis {
  scope: string;
  results: Array<{
    policySetId: string;
    analysis: PolicyAnalysis;
    conflicts?: PolicyConflictReport;
    conflictsError?: string;
  }>;
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

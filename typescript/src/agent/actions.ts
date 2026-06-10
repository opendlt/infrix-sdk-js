/**
 * Agent Action Protocol types (nextux-01).
 *
 * These mirror the canonical Go manifest/response shapes in pkg/agentapi so an
 * agent can type its calls. The Go registry is the single source of truth; the
 * `agent.test.ts` drift test asserts the action id list here matches what the
 * engine reports.
 */

export type RiskLevel =
  | 'read_only'
  | 'local_write'
  | 'testnet_write'
  | 'mainnet_write'
  | 'authority_change'
  | 'release_publish';

export type ApprovalMode =
  | 'deny_writes'
  | 'ask_before_write'
  | 'ask_before_external_write'
  | 'preapproved_local_only';

/** The canonical nextux-01 initial action set. */
export const ACTION_IDS = [
  'proof.verify',
  'proof.receipt.create',
  'proof.receipt.explain',
  'demo.start',
  'demo.stop',
  'examples.search',
  'examples.run',
  'doctor.run',
  'readiness.check',
  'release.evidence.verify',
  'release.evidence.make',
  'release.evidence.publish',
  'metamask.acceptance.package',
  'metamask.acceptance.verify',
  'nexus.open',
  'cinema.replay.open',
  'workflow.plan',
  'workflow.execute',
  'workflow.exportProof',
  'wallet.connect.metamask',
  // nextux-02 — Scenario Builder actions.
  'scenario.listTemplates',
  'scenario.create',
  'scenario.validate',
  'scenario.run',
  'scenario.exportStory',
  'scenario.verifyStory',
  'autopilot.diagnose',
  'autopilot.plan',
  'autopilot.apply',
  'autopilot.verify',
  'autopilot.receipt',
  // nextux-06 — Intent Copilot Workbench actions.
  'workbench.ask',
  'workbench.plan',
  'workbench.dryRun',
  'workbench.run',
  'workbench.explain',
  // nextux-07 — Proof Inbox + Collaboration actions.
  'inbox.list',
  'inbox.summarize',
  'inbox.verify',
  'inbox.import',
  'inbox.comment',
  'inbox.prepareDecision',
  'inbox.signDecision',
  // nextux-08 — Wallet & Identity Control Center actions.
  'identity.status',
  'identity.explainSignature',
  'identity.listPermissions',
  'identity.requestSession',
  'identity.revokeSession',
  // nextux-09 — Embedded Verification Widget Kit action.
  'widgets.generateEmbed',
] as const;

export type ActionId = (typeof ACTION_IDS)[number];

/** A small JSON-Schema subset, matching pkg/agentapi.Schema. */
export interface Schema {
  type: string;
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: string[];
  example?: unknown;
}

export interface Authority {
  requiresSigner: boolean;
  requiresL0KeyPage: boolean;
}

/** The full, machine-readable description of an agent action. */
export interface Manifest {
  id: string;
  title: string;
  description: string;
  mutatesState: boolean;
  networkWrites: boolean;
  requiresApproval: boolean;
  dryRunSupported: boolean;
  riskLevel: RiskLevel;
  profiles: string[];
  authority: Authority;
  requiredInputs?: string[];
  optionalInputs?: string[];
  outputs?: string[];
  inputSchema: Schema;
  outputSchema: Schema;
  errors: string[];
  authoritySummary?: string;
  expectedProofLevel?: string;
  failureModes?: string[];
  rollbackOrCleanup?: string;
}

export interface Assurance {
  proofLevel: string;
  governanceLevel: string;
  label?: string;
  trustsInfrixNode: boolean;
  l0Verified?: boolean;
  replayVerified?: boolean;
}

export interface Artifact {
  type: string;
  path?: string;
  url?: string;
  command?: string;
  summary?: string;
}

export interface NextAction {
  action: string;
  why?: string;
  inputHint?: string;
  recommended?: boolean;
}

export interface DryRunResult {
  summary: string;
  networkTarget: string;
  identitiesTouched: string[];
  keyPagesNeeded: string[];
  estimatedCost: string;
  expectedProofLevel: string;
  expectedFinality: string;
  expectedArtifacts: string[];
  irreversibleEffects: string[];
  walletPromptExpected: boolean;
  disabledUnderProfile: boolean;
  disabledReason?: string;
  deterministic: boolean;
}

export interface ApprovalRequest {
  action: string;
  inputHash: string;
  sessionId: string;
  approvalMode: ApprovalMode;
  riskLevel: RiskLevel;
  reason?: string;
}

export interface ApprovalToken {
  action: string;
  inputHash: string;
  sessionId: string;
  approvedBy: string;
  approvedAt: number;
  expiresAt: number;
  approvalMode: ApprovalMode;
  signature: string;
}

/** The stable structured error shape (from pkg/usererror). */
export interface AgentError {
  code: string;
  title: string;
  message: string;
  impact?: string;
  fixes?: { label: string; command?: string; safeToRun: boolean }[];
  docs?: string;
  retryable: boolean;
}

/** The structured envelope every agent action returns. */
export interface AgentResponse {
  ok: boolean;
  action: string;
  summary?: string;
  assurance?: Assurance;
  receipt?: unknown;
  artifacts: Artifact[];
  nextActions: NextAction[];
  warnings: string[];
  errors: AgentError[];
  explanation?: string;
  dryRun?: DryRunResult;
  approvalRequest?: ApprovalRequest;
  data?: unknown;
}

export interface Session {
  id: string;
  createdAt: number;
  expiresAt: number;
  allowedActions: string[];
  allowedNetwork: string;
  allowedProfile: string;
  writeBudget: number;
  writesUsed: number;
  approvalMode: ApprovalMode;
  allowSigning: boolean;
  callerIdentity?: string;
  auditLogPath: string;
}

export interface SelfTestReport {
  ok: boolean;
  checks: { name: string; ok: boolean; detail?: string }[];
}

/**
 * Lean governance type definitions for the wallet SDK.
 *
 * These mirror the full types from @infrix/client but include only
 * the fields the wallet needs to operate. This avoids a hard dependency
 * on @infrix/client while maintaining wire-format compatibility.
 */

export interface IntentGoal {
  type: string;
  sourceAssets?: Array<{ asset: string; amount: number }>;
  targetAssets?: Array<{ asset: string; amount: number }>;
  targetState?: { stateType: string; parameters: Record<string, string> };
  via?: string;
  customType?: string;
  customParams?: Record<string, unknown>;
}

export interface IntentResult {
  intentId: string;
  status: string;
  planId?: string;
  outcomeId?: string;
  gasUsed?: number;
  error?: string;
}

export interface IntentSubmitOptions {
  constraints?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  metadata?: Record<string, string>;
}

export interface ApprovalEnvelope {
  id: string;
  targetId: string;
  planHash: string;
  signerIdentity: string;
  createdAt: string;
  status: string;
}

export interface OutcomeRecord {
  id: string;
  planId: string;
  overallStatus: string;
  totalGasUsed: number;
  gasDrift: number;
}

export interface EvidenceBundle {
  id: string;
  intentId: string;
  anchorStatus: string;
}

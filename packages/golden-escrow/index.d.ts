// Type declarations for @infrix/golden-escrow (adoption-10).

import type { ProofReceipt } from '@infrix/proof-receipt';

export interface EscrowParams {
  buyer: string;
  seller: string;
  amount: number;
  asset?: string;
}

/** The governed result of creating an escrow (ids are real, never fabricated). */
export interface EscrowHandle {
  escrowId: string;
  intentId: string;
  planId?: string;
  outcomeId?: string;
  evidenceId?: string;
  status?: string;
  [key: string]: unknown;
}

export interface CreateAndProveResult {
  escrowId: string;
  governedResult: EscrowHandle;
  proof: object;
  proofReceipt: ProofReceipt;
  verifyCommand: string;
}

/** A `withGoldenApp`-shaped client surface this package drives. */
export interface GoldenAppClient {
  escrow: { create(params: EscrowParams): Promise<EscrowHandle> };
  proofs: { export(params: { intentId: string }): Promise<object> };
}

export interface CreateEscrowAppOptions {
  /** Live node endpoint; the core `@infrix/client` is loaded lazily. */
  endpoint?: string;
  /** Inject a client (e.g. for tests) instead of building one from `endpoint`. */
  client?: GoldenAppClient;
  /** L0 network to label for an L4 confirmation command (labeling only). */
  l0?: string;
}

export interface EscrowApp {
  createAndProve(params: EscrowParams): Promise<CreateAndProveResult>;
}

export function createEscrowApp(options?: CreateEscrowAppOptions): EscrowApp;

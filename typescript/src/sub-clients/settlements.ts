import { SubClient } from './base';
import type {
  SettlementInstruction,
  SettlementListFilter,
  SettlementCreateOptions,
} from '../types/governance';

/**
 * SettlementSubClient provides settlement instruction management.
 */
export class SettlementSubClient extends SubClient {
  /**
   * List settlement instructions.
   *
   * @param filter - Filter by status, parties, date range
   */
  async list(
    filter?: SettlementListFilter
  ): Promise<{ settlements: SettlementInstruction[]; total: number }> {
    return this.rpc<{ settlements: SettlementInstruction[]; total: number }>(
      'settlement.list',
      (filter ?? {}) as Record<string, unknown>
    );
  }

  /**
   * Create a settlement instruction via the intent pipeline.
   *
   * @param instruction - Settlement parameters (legs, preconditions, trust refs)
   */
  async create(
    instruction: SettlementCreateOptions
  ): Promise<{ intentId: string; settlementId: string; status: string }> {
    return this.rpc<{
      intentId: string;
      settlementId: string;
      status: string;
    }>('settlement.create', { instruction });
  }

  /**
   * Approve a pending settlement instruction.
   *
   * The signature is over the canonical settlement-approval statement bound
   * to the node's approval network — @infrix/wallet settlementApprovalPreimage
   * ({networkId, settlementId, signerIdentity, signerRole, keyPageRef,
   * signerPublicKey}). The node verifies it under `signerPublicKey` AND
   * requires that key to be an entry on `keyPageRef` in L0, owned by the
   * approver. A signature made for another network is refused
   * (session 37, S24).
   *
   * @param id - Settlement ID
   * @param opts - role, keyPageRef, signature, signerPublicKey
   */
  async approve(
    id: string,
    opts: {
      role?: string;
      keyPageRef: string;
      signature: string;
      signerPublicKey: string;
    }
  ): Promise<{ status: string }> {
    return this.rpc<{ status: string }>('settlement.approve', {
      id,
      signatureAlgorithm: 'ed25519',
      ...opts,
    });
  }

  /**
   * Get a specific settlement instruction.
   */
  async get(id: string): Promise<SettlementInstruction> {
    return this.rpc<SettlementInstruction>('settlement.get', { id });
  }
}

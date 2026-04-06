import { SubClient } from './base';
import type {
  Escrow,
  EscrowListFilter,
  EscrowCreateOptions,
} from '../types/governance';

/**
 * EscrowSubClient provides escrow management.
 */
export class EscrowSubClient extends SubClient {
  /**
   * List escrows.
   */
  async list(
    filter?: EscrowListFilter
  ): Promise<{ escrows: Escrow[]; total: number }> {
    return this.rpc<{ escrows: Escrow[]; total: number }>(
      'escrow.list',
      (filter ?? {}) as Record<string, unknown>
    );
  }

  /**
   * Create an escrow via the intent pipeline.
   */
  async create(
    params: EscrowCreateOptions
  ): Promise<{ intentId: string; escrowId: string; status: string }> {
    return this.rpc<{ intentId: string; escrowId: string; status: string }>(
      'escrow.create',
      { params }
    );
  }

  /**
   * Release funds from an escrow (requires authorization).
   */
  async release(
    id: string,
    opts?: { identity?: string }
  ): Promise<{ intentId: string; status: string }> {
    return this.rpc<{ intentId: string; status: string }>('escrow.release', {
      id,
      ...opts,
    });
  }

  /**
   * Dispute an escrow.
   */
  async dispute(
    id: string,
    reason: string
  ): Promise<{ intentId: string; status: string }> {
    return this.rpc<{ intentId: string; status: string }>('escrow.dispute', {
      id,
      reason,
    });
  }

  /**
   * Get a specific escrow.
   */
  async get(id: string): Promise<Escrow> {
    return this.rpc<Escrow>('escrow.get', { id });
  }
}

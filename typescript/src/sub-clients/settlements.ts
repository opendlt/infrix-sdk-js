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
   * @param id - Settlement ID
   * @param opts - Optional: identity, role
   */
  async approve(
    id: string,
    opts?: { identity?: string; role?: string }
  ): Promise<{ status: string }> {
    return this.rpc<{ status: string }>('settlement.approve', {
      id,
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

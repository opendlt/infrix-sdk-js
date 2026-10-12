import { SubClient } from './base';
import { genQuery } from './gen/runtime';
import { checkPathValue, declaredMembers, refuseUnknownOptions } from './routeShapes';
import type {
  EscrowAnswer,
  EscrowListAnswer,
  EscrowListFilter,
  EscrowCreateOptions,
} from '../types/governance';

const LIST_ROUTE = 'GET /v4/escrows';
const GET_ROUTE = 'GET /v4/escrows/{id}';

/**
 * EscrowSubClient provides escrow management.
 */
export class EscrowSubClient extends SubClient {
  /**
   * List the escrows the caller can see (REST GET /v4/escrows).
   *
   * @param filter - Only the filters the route accepts: `status` and `limit`.
   * @returns `escrows` and `total`.
   */
  async list(filter: EscrowListFilter = {}): Promise<EscrowListAnswer> {
    refuseUnknownOptions('escrows.list', LIST_ROUTE, filter, ['limit', 'status']);
    const query = genQuery(LIST_ROUTE, [
      ['limit', filter.limit, 'int'],
      ['status', filter.status, 'string'],
    ]);
    const answer = await this.rest<unknown>('GET', `/v4/escrows${query}`);
    return declaredMembers<EscrowListAnswer>(LIST_ROUTE, answer, ['escrows', 'total']);
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
   * Get one escrow (REST GET /v4/escrows/{id}).
   */
  async get(id: string): Promise<EscrowAnswer> {
    checkPathValue(GET_ROUTE, 'id', id);
    const answer = await this.rest<unknown>('GET', `/v4/escrows/${encodeURIComponent(id)}`);
    return declaredMembers<EscrowAnswer>(GET_ROUTE, answer, [
      'amount', 'arbiter', 'asset', 'beneficiary', 'createdAt', 'depositedAt', 'depositor', 'disputes',
      'holdingAccount', 'id', 'instructionId', 'instructionState', 'legId', 'refunded', 'refundedAt',
      'released', 'releasedAt', 'status',
    ]);
  }
}

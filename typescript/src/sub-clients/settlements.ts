import { SubClient } from './base';
import { genQuery } from './gen/runtime';
import {
  LIST_MEMBERS,
  REGISTRY_OBJECT_MEMBERS,
  checkPathValue,
  declaredMembers,
} from './routeShapes';
import type { ListAnswer, RegistryObjectAnswer } from './routeShapes';
import type {
  SettlementListFilter,
  SettlementCreateOptions,
} from '../types/governance';

const LIST_ROUTE = 'GET /v4/settlements';
const GET_ROUTE = 'GET /v4/settlements/{id}';

/**
 * SettlementSubClient provides settlement instruction management.
 */
export class SettlementSubClient extends SubClient {
  /**
   * List the settlement instructions the caller can see (REST GET /v4/settlements).
   *
   * @param filter - Only the filters the route accepts: `state` and `id`.
   * @returns `items` and `pagination`.
   */
  async list(filter: SettlementListFilter = {}): Promise<ListAnswer> {
    const query = genQuery(LIST_ROUTE, [
      ['id', filter.id, 'string'],
      ['state', filter.state, 'string'],
    ]);
    const answer = await this.rest<unknown>('GET', `/v4/settlements${query}`);
    return declaredMembers<ListAnswer>(LIST_ROUTE, answer, LIST_MEMBERS);
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
   * Get one settlement instruction (REST GET /v4/settlements/{id}); the instruction's own record is
   * in `fields`.
   */
  async get(id: string): Promise<RegistryObjectAnswer> {
    checkPathValue(GET_ROUTE, 'id', id);
    const answer = await this.rest<unknown>('GET', `/v4/settlements/${encodeURIComponent(id)}`);
    return declaredMembers<RegistryObjectAnswer>(GET_ROUTE, answer, REGISTRY_OBJECT_MEMBERS);
  }
}

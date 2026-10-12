import { SubClient } from './base';
import { genQuery } from './gen/runtime';
import { LIST_MEMBERS, checkPathValue, declaredMembers } from './routeShapes';
import type { ListAnswer } from './routeShapes';
import type {
  AnchorAnswer,
  AnchorListFilter,
  AnchorStatsAnswer,
  AnchorVerifyAnswer,
} from '../types/governance';

const LIST_ROUTE = 'GET /v4/anchors';
const STATS_ROUTE = 'GET /v4/anchors/stats';
const GET_ROUTE = 'GET /v4/anchors/{id}';
const VERIFY_ROUTE = 'GET /v4/anchors/{id}/verify';

/**
 * AnchorSubClient provides L0 anchor verification and management.
 *
 * Every read answers exactly the members its route declares; an answer that lacks one is refused
 * rather than read as empty.
 */
export class AnchorSubClient extends SubClient {
  /**
   * List the anchors the caller can see (REST GET /v4/anchors).
   *
   * @param filter - Only the filters the route accepts: `intentId` and `state`.
   * @returns `items` and `pagination`.
   */
  async list(filter: AnchorListFilter = {}): Promise<ListAnswer> {
    const query = genQuery(LIST_ROUTE, [
      ['intentId', filter.intentId, 'string'],
      ['state', filter.state, 'string'],
    ]);
    const answer = await this.rest<unknown>('GET', `/v4/anchors${query}`);
    return declaredMembers<ListAnswer>(LIST_ROUTE, answer, LIST_MEMBERS);
  }

  /**
   * Verify an anchor against L0 state (REST GET /v4/anchors/{id}/verify).
   *
   * @param anchorId - The anchor to verify
   * @returns `verified` with the anchor's `anchor`, `dataUrl`, `digest`, `id`, `state` and `txHash`.
   */
  async verify(anchorId: string): Promise<AnchorVerifyAnswer> {
    checkPathValue(VERIFY_ROUTE, 'id', anchorId);
    const answer = await this.rest<unknown>('GET', `/v4/anchors/${encodeURIComponent(anchorId)}/verify`);
    return declaredMembers<AnchorVerifyAnswer>(VERIFY_ROUTE, answer, [
      'anchor', 'dataUrl', 'digest', 'id', 'state', 'txHash', 'verified',
    ]);
  }

  /**
   * Anchoring statistics over the anchors THIS actor can see (REST GET /v4/anchors/stats).
   *
   * Actor-scoped, not repo-wide. The node aggregates over ListWithActor, which
   * excludes records the caller may not see, so these counts cover exactly what
   * list() would enumerate for you. The repo-wide version was removed under the
   * Gap 12 closure for leaking cardinality; the scoped one leaks nothing you
   * could not already count yourself.
   */
  async stats(): Promise<AnchorStatsAnswer> {
    const answer = await this.rest<unknown>('GET', '/v4/anchors/stats');
    return declaredMembers<AnchorStatsAnswer>(STATS_ROUTE, answer, ['byState', 'byType', 'scope', 'totalAnchors']);
  }

  /**
   * Get one anchored record (REST GET /v4/anchors/{id}).
   */
  async get(anchorId: string): Promise<AnchorAnswer> {
    checkPathValue(GET_ROUTE, 'id', anchorId);
    const answer = await this.rest<unknown>('GET', `/v4/anchors/${encodeURIComponent(anchorId)}`);
    return declaredMembers<AnchorAnswer>(GET_ROUTE, answer, ['anchor', 'id', 'state', 'txHash']);
  }
}

import { SubClient } from './base';
import { genQuery } from './gen/runtime';
import { LIST_MEMBERS, declaredMembers } from './routeShapes';
import type { ListAnswer } from './routeShapes';
import type {
  DisclosureListFilter,
  DisclosureGrantOptions,
} from '../types/governance';

const LIST_ROUTE = 'GET /v4/disclosures';

/** What GET /v4/disclosures/check answers. */
export interface DisclosureCheckResult {
  viewer: string;
  targetType: string;
  targetId: string;
  authorized: boolean;
  /** Present when a field was asked about. */
  field?: string;
  /** Present when a grant authorizes the access. */
  grantId?: string;
}

/**
 * DisclosureSubClient provides disclosure grant management.
 */
export class DisclosureSubClient extends SubClient {
  /**
   * List the disclosure grants the caller can see (REST GET /v4/disclosures).
   *
   * @param filter - Only the filter the route accepts: `state`.
   * @returns `items` and `pagination`; an answer that lacks either is refused, never read as empty.
   */
  async list(filter: DisclosureListFilter = {}): Promise<ListAnswer> {
    const query = genQuery(LIST_ROUTE, [['state', filter.state, 'string']]);
    const answer = await this.rest<unknown>('GET', `/v4/disclosures${query}`);
    return declaredMembers<ListAnswer>(LIST_ROUTE, answer, LIST_MEMBERS);
  }

  /**
   * Grant disclosure to a grantee for specific fields of a target object.
   *
   * @param grantee - Identity receiving disclosure access
   * @param target - Object being disclosed (type:id)
   * @param fields - Fields to disclose (empty = all)
   * @param opts - Optional: expiresAt, purpose, conditions
   */
  async grant(
    grantee: string,
    target: string,
    fields: string[],
    opts?: DisclosureGrantOptions
  ): Promise<{ intentId: string; grantId: string; status: string }> {
    return this.rpc<{ intentId: string; grantId: string; status: string }>(
      'disclosure.grant',
      { grantee, target, fields, ...opts }
    );
  }

  /**
   * Ask whether a viewer may read a target (REST GET /v4/disclosures/check).
   *
   * @param viewer - Identity whose access is checked
   * @param target - The object as `<targetType>:<targetId>` (split at the first colon, so the id may be a URL)
   * @param field - A specific field (default: any field)
   * @param opts.purpose - The purpose the viewer asserts; a grant that names purposes matches only with one
   * @param opts.workflowInstance - The workflow instance, for a grant scoped to workflow stages
   * @param opts.grantId - With `approvalId`: the grant that requires an approval, when relying on one
   * @param opts.approvalId - With `grantId`: the approval relied on for that grant
   * @returns `authorized`, and the `grantId` that authorizes it when one does
   */
  async check(
    viewer: string,
    target: string,
    field?: string,
    opts: {
      purpose?: string;
      workflowInstance?: string;
      grantId?: string;
      approvalId?: string;
    } = {}
  ): Promise<DisclosureCheckResult> {
    const colon = target.indexOf(':');
    if (colon <= 0 || colon === target.length - 1) {
      throw new Error('check: target must be <targetType>:<targetId>, e.g. intent:intent-123');
    }
    if ((opts.grantId === undefined) !== (opts.approvalId === undefined)) {
      throw new Error('check: grantId and approvalId must be given together');
    }
    const query = new URLSearchParams({
      viewer,
      targetType: target.slice(0, colon),
      targetId: target.slice(colon + 1),
    });
    if (field !== undefined) query.set('field', field);
    if (opts.purpose !== undefined) query.set('purpose', opts.purpose);
    if (opts.workflowInstance !== undefined) query.set('workflowInstance', opts.workflowInstance);
    if (opts.grantId !== undefined) query.set('grantId', opts.grantId);
    if (opts.approvalId !== undefined) query.set('approvalId', opts.approvalId);
    return this.rest<DisclosureCheckResult>('GET', `/v4/disclosures/check?${query.toString()}`);
  }

  /**
   * Revoke a disclosure grant.
   */
  async revoke(
    grantId: string,
    reason?: string
  ): Promise<{ status: string }> {
    return this.rpc<{ status: string }>('disclosure.revoke', {
      grantId,
      reason,
    });
  }
}

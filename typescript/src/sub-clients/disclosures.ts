import { SubClient } from './base';
import type {
  DisclosureGrant,
  DisclosureListFilter,
  DisclosureGrantOptions,
} from '../types/governance';

/**
 * DisclosureSubClient provides disclosure grant management.
 */
export class DisclosureSubClient extends SubClient {
  /**
   * List disclosure grants.
   */
  async list(
    filter?: DisclosureListFilter
  ): Promise<{ grants: DisclosureGrant[]; total: number }> {
    return this.rpc<{ grants: DisclosureGrant[]; total: number }>(
      'disclosure.list',
      (filter ?? {}) as Record<string, unknown>
    );
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
   * Check if a grantee has disclosure access to a specific field.
   */
  async check(
    grantee: string,
    target: string,
    field: string
  ): Promise<{ disclosed: boolean; grantId?: string }> {
    return this.rpc<{ disclosed: boolean; grantId?: string }>(
      'disclosure.check',
      { grantee, target, field }
    );
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

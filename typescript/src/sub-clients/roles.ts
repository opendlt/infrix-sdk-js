import { SubClient } from './base';
import { genQuery } from './gen/runtime';
import { checkPathValue, declaredMembers } from './routeShapes';
import type {
  RoleAssignOptions,
  RoleCheckAnswer,
  RoleListAnswer,
} from '../types/governance';

const LIST_ROUTE = 'GET /v4/roles';
const IDENTITY_ROUTE = 'GET /v4/roles/{identity}';
const CHECK_ROUTE = 'GET /v4/roles/check';

/** The members GET /v4/roles and GET /v4/roles/{identity} declare. */
const ROLE_LIST_MEMBERS = ['count', 'roles'] as const;

/**
 * RoleSubClient provides role binding management.
 */
export class RoleSubClient extends SubClient {
  /**
   * List the role bindings the caller can see (REST GET /v4/roles), or, given an identity, the roles
   * assigned to that identity (REST GET /v4/roles/{identity}).
   *
   * @param identity - DID or ADI URL; omit to list every binding the caller can see
   * @returns `roles` and their `count`
   */
  async list(identity?: string): Promise<RoleListAnswer> {
    if (identity === undefined) {
      const all = await this.rest<unknown>('GET', '/v4/roles');
      return declaredMembers<RoleListAnswer>(LIST_ROUTE, all, ROLE_LIST_MEMBERS);
    }
    checkPathValue(IDENTITY_ROUTE, 'identity', identity);
    const answer = await this.rest<unknown>('GET', `/v4/roles/${encodeURIComponent(identity)}`);
    return declaredMembers<RoleListAnswer>(IDENTITY_ROUTE, answer, ROLE_LIST_MEMBERS);
  }

  /**
   * Assign a role to an identity via the intent pipeline.
   *
   * @param identity - DID or ADI URL of the assignee
   * @param role - Role name (e.g. 'admin', 'treasury_officer', 'auditor')
   * @param scope - Scope for the role (contract URL, ADI, etc.)
   * @param opts - Optional: expiresAt, conditions
   */
  async assign(
    identity: string,
    role: string,
    scope: string,
    opts?: RoleAssignOptions
  ): Promise<{ intentId: string; bindingId: string; status: string }> {
    return this.rpc<{ intentId: string; bindingId: string; status: string }>(
      'role.assign',
      { identity, role, scope, ...opts }
    );
  }

  /**
   * Check if an identity has a specific role (REST GET /v4/roles/check).
   *
   * The route takes the identity and the role and nothing else: there is no scope constraint to ask
   * about.
   *
   * @param identity - DID or ADI URL to check
   * @param role - Role name
   */
  async check(identity: string, role: string): Promise<RoleCheckAnswer> {
    const query = genQuery(CHECK_ROUTE, [
      ['identity', identity, 'string'],
      ['role', role, 'string'],
    ]);
    const answer = await this.rest<unknown>('GET', `/v4/roles/check${query}`);
    return declaredMembers<RoleCheckAnswer>(CHECK_ROUTE, answer, ['hasRole', 'identity', 'role']);
  }

  /**
   * Revoke a role binding.
   *
   * @param bindingId - The binding to revoke
   * @param reason - Revocation reason
   */
  async revoke(
    bindingId: string,
    reason?: string
  ): Promise<{ intentId: string; status: string }> {
    return this.rpc<{ intentId: string; status: string }>('role.revoke', {
      bindingId,
      reason,
    });
  }
}

import { SubClient } from './base';
import type {
  RoleBinding,
  RoleListFilter,
  RoleAssignOptions,
} from '../types/governance';

/**
 * RoleSubClient provides role binding management.
 */
export class RoleSubClient extends SubClient {
  /**
   * List roles assigned to an identity.
   *
   * @param identity - DID or ADI URL
   * @param filter - Optional: scope, role name, status
   */
  async list(
    identity?: string,
    filter?: RoleListFilter
  ): Promise<{ bindings: RoleBinding[]; total: number }> {
    return this.rpc<{ bindings: RoleBinding[]; total: number }>('role.list', {
      identity,
      ...(filter ?? {}),
    });
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
   * Check if an identity has a specific role.
   *
   * @param identity - DID or ADI URL to check
   * @param role - Role name
   * @param scope - Optional scope constraint
   */
  async check(
    identity: string,
    role: string,
    scope?: string
  ): Promise<{ hasRole: boolean; bindingId?: string; expiresAt?: string }> {
    return this.rpc<{
      hasRole: boolean;
      bindingId?: string;
      expiresAt?: string;
    }>('role.check', { identity, role, scope });
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

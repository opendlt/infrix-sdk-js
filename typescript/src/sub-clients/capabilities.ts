import { SubClient } from './base';
import type {
  CapabilityGrant,
  CapabilityType,
  CapabilityListFilter,
  CapabilityScope,
} from '../types/governance';

/**
 * CapabilitySubClient provides capability grant management.
 */
export class CapabilitySubClient extends SubClient {
  /**
   * List available capability types in the system.
   */
  async list(): Promise<{ capabilities: CapabilityType[] }> {
    return this.rpc<{ capabilities: CapabilityType[] }>(
      'capability.types',
      {}
    );
  }

  /**
   * List active capability grants.
   *
   * @param filter - Filter by grantee, grantor, capability, scope, status
   */
  async grants(
    filter?: CapabilityListFilter
  ): Promise<{ grants: CapabilityGrant[]; total: number }> {
    return this.rpc<{ grants: CapabilityGrant[]; total: number }>(
      'capability.grants',
      (filter ?? {}) as Record<string, unknown>
    );
  }

  /**
   * Create a capability grant via the intent pipeline.
   *
   * @param grantee - DID or ADI URL of the grantee
   * @param capabilities - Array of capability strings (e.g. ['token:transfer', 'object:create'])
   * @param scope - Scope constraint for the grant
   */
  async grant(
    grantee: string,
    capabilities: string[],
    scope?: CapabilityScope
  ): Promise<{ intentId: string; grantId: string; status: string }> {
    return this.rpc<{ intentId: string; grantId: string; status: string }>(
      'capability.grant',
      { grantee, capabilities, scope }
    );
  }

  /**
   * Revoke a capability grant.
   *
   * @param grantId - The grant to revoke
   * @param reason - Revocation reason
   */
  async revoke(
    grantId: string,
    reason?: string
  ): Promise<{ intentId: string; status: string }> {
    return this.rpc<{ intentId: string; status: string }>(
      'capability.revoke',
      { grantId, reason }
    );
  }

  /**
   * Check if an identity has a specific capability.
   *
   * @param identity - DID or ADI URL to check
   * @param capability - Capability string to check
   * @param scope - Optional scope constraint
   */
  async check(
    identity: string,
    capability: string,
    scope?: string
  ): Promise<{ granted: boolean; grantId?: string; expiresAt?: string }> {
    return this.rpc<{
      granted: boolean;
      grantId?: string;
      expiresAt?: string;
    }>('capability.check', { identity, capability, scope });
  }
}

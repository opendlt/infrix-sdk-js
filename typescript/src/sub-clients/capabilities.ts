import { SubClient } from './base';
import { genQuery } from './gen/runtime';
import { LIST_MEMBERS, declaredMembers, refuseRemovedArguments, refuseUnknownOptions } from './routeShapes';
import type { ListAnswer } from './routeShapes';
import type {
  CapabilityCheckAnswer,
  CapabilityType,
  CapabilityListFilter,
  CapabilityScope,
} from '../types/governance';

const GRANTS_ROUTE = 'GET /v4/capabilities/grants';
const CHECK_ROUTE = 'GET /v4/capabilities/check';

/**
 * CapabilitySubClient provides capability grant management.
 *
 * Every read answers exactly the members its route declares; an answer that lacks one is refused
 * rather than read as empty.
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
   * List the capability grants the caller can see (REST GET /v4/capabilities/grants).
   *
   * @param filter - Only the filter the route accepts: `state`.
   * @returns `items` and `pagination`.
   */
  async grants(filter: CapabilityListFilter = {}): Promise<ListAnswer> {
    refuseUnknownOptions('capabilities.grants', GRANTS_ROUTE, filter, ['state']);
    const query = genQuery(GRANTS_ROUTE, [['state', filter.state, 'string']]);
    const answer = await this.rest<unknown>('GET', `/v4/capabilities/grants${query}`);
    return declaredMembers<ListAnswer>(GRANTS_ROUTE, answer, LIST_MEMBERS);
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
   * Check if an identity has a specific capability (REST GET /v4/capabilities/check).
   *
   * The route takes the identity and the capability and nothing else: there is no scope constraint
   * to ask about. `grants` names the grants that give the capability.
   *
   * @param identity - DID or ADI URL to check
   * @param capability - Capability string to check
   */
  async check(identity: string, capability: string, ...removed: never[]): Promise<CapabilityCheckAnswer> {
    refuseRemovedArguments('capabilities.check', removed, ['scope']);
    const query = genQuery(CHECK_ROUTE, [
      ['capability', capability, 'string'],
      ['identity', identity, 'string'],
    ]);
    const answer = await this.rest<unknown>('GET', `/v4/capabilities/check${query}`);
    return declaredMembers<CapabilityCheckAnswer>(CHECK_ROUTE, answer, [
      'capability', 'granted', 'grants', 'identity',
    ]);
  }
}

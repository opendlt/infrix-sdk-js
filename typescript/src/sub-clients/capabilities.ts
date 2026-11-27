import { SubClient } from './base';
import { genQuery } from './gen/runtime';
import { LIST_MEMBERS, declaredMembers, refuseRemovedArguments, refuseUnknownOptions } from './routeShapes';
import type { ListAnswer } from './routeShapes';
import type {
  CapabilityCheckAnswer,
  CapabilityType,
  CapabilityListFilter,
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
   * Create a capability grant via the intent pipeline (JSON-RPC capability.grant, the node's POST /v4/capabilities/grants).
   *
   * One key per field, named as the node's CAPABILITY_GRANT declaration names it (main's ruling (C), 2c-28cm): this sent
   * `capabilities` and a `scope` object, which the node's door never read (it refuses `scope` by name). The node answers the grant id
   * it minted when none is named, so the caller can always revoke what it granted.
   *
   * @param grantee - DID or ADI URL of the grantee
   * @param capability - the one capability granted (e.g. 'object:create')
   * @param opts - workflowStageScope ('*' for every stage) and grantPurpose are required; targetScope (the target the grant applies
   *   to, every target when omitted), grantId and expiry (unix seconds) are optional
   */
  async grant(
    grantee: string,
    capability: string,
    opts: { workflowStageScope: string; grantPurpose: string; targetScope?: string; grantId?: string; expiry?: string }
  ): Promise<{ intentId: string; grantId: string; status: string }> {
    const params: Record<string, unknown> = {
      grantee,
      capability,
      workflowStageScope: opts.workflowStageScope,
      grantPurpose: opts.grantPurpose,
    };
    if (opts.targetScope !== undefined) params.targetScope = opts.targetScope;
    if (opts.grantId !== undefined) params.grantId = opts.grantId;
    if (opts.expiry !== undefined) params.expiry = opts.expiry;
    return this.rpc<{ intentId: string; grantId: string; status: string }>('capability.grant', params);
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

import { SubClient } from './base';
import type {
  TrustProfile,
  TrustEvaluation,
  TrustListFilter,
} from '../types/governance';

/**
 * TrustSubClient provides trust profile management and evaluation.
 */
export class TrustSubClient extends SubClient {
  /**
   * List trust profiles for a domain.
   *
   * @param domain - Domain to query (e.g. 'ethereum', 'accumulate', 'all')
   */
  async list(
    domain?: string,
    filter?: TrustListFilter
  ): Promise<{ profiles: TrustProfile[]; total: number }> {
    return this.rpc<{ profiles: TrustProfile[]; total: number }>(
      'trust.list',
      { domain, ...(filter ?? {}) }
    );
  }

  /**
   * Get a specific trust profile.
   *
   * @param profileId - The trust profile ID (typically adapterId)
   */
  async get(profileId: string): Promise<TrustProfile> {
    return this.rpc<TrustProfile>('trust.get', { profileId });
  }

  /**
   * Evaluate a trust profile against requirements.
   *
   * @param profileId - The trust profile to evaluate
   * @param requirements - Minimum trust requirements to check against
   */
  async evaluate(
    profileId: string,
    requirements: Record<string, unknown>
  ): Promise<TrustEvaluation> {
    return this.rpc<TrustEvaluation>('trust.evaluate', {
      profileId,
      requirements,
    });
  }

  /**
   * Compare two trust profiles.
   */
  async compare(
    profileIdA: string,
    profileIdB: string
  ): Promise<{ comparison: Record<string, unknown> }> {
    return this.rpc<{ comparison: Record<string, unknown> }>('trust.compare', {
      profileIdA,
      profileIdB,
    });
  }
}

import { SubClient } from './base';
import type {
  TrustProfile,
  TrustEvaluation,
  TrustListFilter,
} from '../types/governance';

/** One row of GET /v4/trust/dashboard. `score` is a two-decimal string. */
export interface TrustDashboardEntry {
  profileId: string;
  domain: string;
  label: string;
  state: string;
  proofType: string;
  score: string;
}

/** What GET /v4/trust/requirements/{scope} answers: the policy sets governing the scope. */
export interface TrustRequirements {
  scope: string;
  policies: Array<Record<string, unknown>>;
  count: number;
}

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

  /**
   * The universal trust dashboard: every external dependency across all trust domains with its
   * state and evaluation score (REST GET /v4/trust/dashboard).
   */
  async dashboard(): Promise<{ profiles: TrustDashboardEntry[]; count: number }> {
    return this.rpc<{ profiles: TrustDashboardEntry[]; count: number }>('trust.dashboard', {});
  }

  /**
   * The policy sets that set trust requirements in a scope (REST GET /v4/trust/requirements/{scope}).
   *
   * @param scope - `global`, `contract:<url>`, `obj:<url>` or `parent:<adi>`; a malformed scope is refused
   */
  async requirements(scope: string): Promise<TrustRequirements> {
    return this.rest<TrustRequirements>('GET', `/v4/trust/requirements/${encodeURIComponent(scope)}`);
  }
}

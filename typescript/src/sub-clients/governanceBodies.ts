import { SubClient } from './base';

/** What GET /v4/committees answers: the committees the caller is a member of. */
export interface CommitteeList {
  committees: Array<{ committeeId: string; memberCount: number }>;
  total: number;
}

/** What GET /v4/committees/{id}/motions answers. */
export interface CommitteeMotions {
  committeeId: string;
  motions: Array<Record<string, unknown>>;
  total: number;
}

/** What GET /v4/emergency/cases answers. */
export interface EmergencyCaseList {
  cases: Array<Record<string, unknown>>;
  total: number;
}

/**
 * CommitteeSubClient reads committee state. A committee is visible only to its members: a
 * non-member sees an empty list, and the node answers not-found, never forbidden, for the
 * motions of a committee they do not belong to.
 */
export class CommitteeSubClient extends SubClient {
  /** The committees the calling actor belongs to. */
  async list(): Promise<CommitteeList> {
    return this.rest<CommitteeList>('GET', '/v4/committees');
  }

  /** The motions before a committee the calling actor belongs to. */
  async motions(committeeId: string): Promise<CommitteeMotions> {
    return this.rest<CommitteeMotions>('GET', `/v4/committees/${encodeURIComponent(committeeId)}/motions`);
  }
}

/**
 * EmergencySubClient reads emergency cases, which only an emergency authority can see.
 */
export class EmergencySubClient extends SubClient {
  /** The emergency cases visible to the calling actor. */
  async cases(): Promise<EmergencyCaseList> {
    return this.rest<EmergencyCaseList>('GET', '/v4/emergency/cases');
  }
}

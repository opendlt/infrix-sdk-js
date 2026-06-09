/**
 * Scoped agent sessions (nextux-08).
 *
 * Mirrors pkg/identityux.SessionRequest validation: a capability scope is
 * mandatory (no scope-less sessions), the network defaults to local (never
 * mainnet), the TTL is finite, and a mainnet session must be explicit.
 */

export interface SessionView {
  id: string;
  createdAt: string;
  expiresAt: string;
  allowedActions: string[];
  network: string;
  profile: string;
  approvalMode: string;
  allowSigning: boolean;
  writeBudget: number;
  writesUsed: number;
  callerIdentity?: string;
  expired: boolean;
}

export interface SessionRequest {
  capabilities: string[];
  network?: string;
  profile?: string;
  ttlSeconds?: number;
  allowSigning?: boolean;
  callerIdentity?: string;
  allowMainnet?: boolean;
}

export const DEFAULT_SESSION_TTL_SECONDS = 1800;

export class SessionScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionScopeError';
  }
}

/** normalizeSessionRequest fills the safe defaults (local network, finite TTL). */
export function normalizeSessionRequest(r: SessionRequest): SessionRequest {
  return {
    ...r,
    network: (r.network || '').trim() || 'local',
    profile: (r.profile || '').trim() || 'local',
    ttlSeconds: r.ttlSeconds && r.ttlSeconds > 0 ? r.ttlSeconds : DEFAULT_SESSION_TTL_SECONDS,
  };
}

/** validateSessionRequest enforces the session invariants; throws on violation. */
export function validateSessionRequest(r: SessionRequest): void {
  const scope = (r.capabilities ?? []).map((c) => c.trim()).filter(Boolean);
  if (scope.length === 0) {
    throw new SessionScopeError('an agent session requires an explicit capability scope (no scope-less sessions)');
  }
  if ((r.network || '').trim().toLowerCase() === 'mainnet' && !r.allowMainnet) {
    throw new SessionScopeError('a mainnet session must be explicitly authorized (no default mainnet authority)');
  }
  if ((r.ttlSeconds ?? 0) < 0) {
    throw new SessionScopeError('session TTL cannot be negative');
  }
}

/** sessionWarnings flags the safety-relevant properties of a session. */
export function sessionWarnings(s: SessionView): string[] {
  const w: string[] = [];
  if ((s.network || '').toLowerCase() === 'mainnet') w.push('this session can act on MAINNET');
  if (s.allowSigning) w.push('this session may sign (it can produce decisions/intents on your behalf)');
  if (!s.allowedActions || s.allowedActions.length === 0) w.push('this session has no action scope (it can run every action)');
  return w;
}

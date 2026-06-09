/**
 * Progressive Disclosure design system — the assurance gate (nextux-03).
 *
 * A faithful port of pkg/uxcopy.AssuranceBadge.Allowed: badges are gated by
 * data, not formatting, so the SDK can never present a "Live L0 verified" badge
 * on a bundle whose L0 anchor was not confirmed. The rules live in the fixture's
 * allowed/disallowed conditions; this evaluates them.
 */

import type { AssuranceBadge, AssuranceState } from './labels';

const BOOLEAN_FIELDS: Record<string, boolean> = {
  verified: true,
  cryptographicallyVerified: true,
  l0Verified: true,
  replayVerified: true,
  nodeTrusted: true,
  witnessQuorumMet: true,
  distinctOperatorsMet: true,
  operatorAttested: true,
  disclosureProofVerified: true,
  releaseEvidenceVerified: true,
};

/** conditionHolds evaluates a "field=value" token against an assurance state. */
export function conditionHolds(state: AssuranceState, token: string): boolean {
  const parts = String(token || '').trim().split('=');
  if (parts.length !== 2) return false;
  const field = parts[0].trim();
  const val = parts[1].trim();
  if (field === 'verificationMode') {
    return val === 'local_only' && !state.l0Verified;
  }
  if (val !== 'true' && val !== 'false') return false;
  if (!(field in BOOLEAN_FIELDS)) return false;
  const cur = !!(state as Record<string, unknown>)[field];
  return cur === (val === 'true');
}

/** badgeAllowed reports whether one badge may be shown for a state. */
export function badgeAllowed(badge: AssuranceBadge, state: AssuranceState): boolean {
  for (const t of badge.allowedConditions || []) if (!conditionHolds(state, t)) return false;
  for (const t of badge.disallowedConditions || []) if (conditionHolds(state, t)) return false;
  return true;
}

/** badgesFor returns the badges ALLOWED for a state, preserving fixture order. */
export function badgesFor(badges: AssuranceBadge[], state: AssuranceState): AssuranceBadge[] {
  return (badges || []).filter((b) => badgeAllowed(b, state));
}

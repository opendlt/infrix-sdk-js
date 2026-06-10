/**
 * @infrix rooms — role model and capability helpers (nextux-14). The role policy
 * is the single source of room authority: a viewer can never approve, a private
 * payload is visible only to the roles a disclosure policy authorizes. These
 * helpers mirror the Go role matrix so the SDK reports the same guards.
 */

export type Role =
  | 'buyer'
  | 'seller'
  | 'regulator'
  | 'witness'
  | 'auditor'
  | 'ai_assistant'
  | 'viewer';

export const ROLES: readonly Role[] = [
  'buyer',
  'seller',
  'regulator',
  'witness',
  'auditor',
  'ai_assistant',
  'viewer',
] as const;

/** A room action key (e.g. room.approve). */
export type RoomAction = string;

/** A data scope a role may or may not see. */
export type DataScope =
  | 'public'
  | 'deal_terms'
  | 'private_payload'
  | 'event_log'
  | 'proof';

/** RolePolicy is a role's complete capability profile. Shape mirrors
 *  pkg/rooms.RolePolicy. */
export interface RolePolicy {
  role: Role;
  label: string;
  allowedActions: RoomAction[];
  visibleData: DataScope[];
  requiresSignature: boolean;
  canApprove: boolean;
  canComment: boolean;
}

/** roleByName resolves a role policy from a policy list. */
export function roleByName(roles: RolePolicy[], role: string): RolePolicy | null {
  return roles.find((p) => p.role === role) || null;
}

/** roleAllows reports whether a policy permits an action. */
export function roleAllows(policy: RolePolicy, action: RoomAction): boolean {
  return policy.allowedActions.includes(action);
}

/** canSee reports whether a policy permits seeing a data scope. */
export function canSee(policy: RolePolicy, scope: DataScope): boolean {
  return policy.visibleData.includes(scope);
}

/** canSeePrivatePayload reports whether a role may see the private payload — the
 *  data only a scenario's disclosure policy authorizes. */
export function canSeePrivatePayload(roles: RolePolicy[], role: string): boolean {
  const p = roleByName(roles, role);
  return !!(p && canSee(p, 'private_payload'));
}

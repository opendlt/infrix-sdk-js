/**
 * @infrix rooms — Multiplayer Demo Rooms (nextux-14): role, event, replay, and
 * room-summary types + honest helpers. Read-only and honest: a room's proof
 * assurance is exactly the verifier's verdict, a viewer can never approve, an AI
 * agent can never approve without delegation, and a private payload is hidden
 * from unauthorized roles.
 */

export { ROLES, roleByName, roleAllows, canSee, canSeePrivatePayload } from './roles.js';
export type { Role, RoomAction, DataScope, RolePolicy } from './roles.js';

export { lastEventHash, replayBoundToLog, comments } from './events.js';
export type { RoomEvent, Replay } from './events.js';

export {
  participantCanApprove,
  agentApprovalGated,
  proofIsHonest,
  pendingApprovalRoles,
} from './client.js';
export type {
  Mode,
  State,
  Assurance,
  ProofSummary,
  ParticipantView,
  RequiredApprovalView,
  RoomSummary,
  RoomListEntry,
  RoomData,
} from './client.js';

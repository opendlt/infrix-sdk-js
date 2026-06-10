/**
 * @infrix rooms — room summary types and honest helpers (nextux-14). A room is
 * grounded in a real governed scenario run: its proof assurance is exactly the
 * verifier's verdict, never the room's claim. These helpers report the same
 * honest, read-only view the CLI, Nexus, and agent see.
 */

import type { Role, RolePolicy } from './roles.js';
import type { Replay } from './events.js';

/** A room mode. Mainnet is never a mode. */
export type Mode = 'local' | 'kermit' | 'watch-only' | 'replay-only';

/** A room's lifecycle state. */
export type State = 'created' | 'proven' | 'closed';

/** Assurance is the honest, verifier-backed assurance a room reports. */
export interface Assurance {
  proofLevel: string;
  governanceLevel: string;
  trustsInfrixNode: boolean;
  l0Verified: boolean;
  replayVerified: boolean;
  verified: boolean;
}

/** ProofSummary is the honest proof posture of a room. */
export interface ProofSummary {
  storyRef: string;
  storyId: string;
  artifactHash: string;
  cinemaBinding: string;
  assurance: Assurance;
}

/** ParticipantView is the redacted view of a participant. */
export interface ParticipantView {
  id: string;
  name: string;
  role: Role;
  roleLabel: string;
  isAgent: boolean;
  delegated: boolean;
  canApprove: boolean;
}

/** RequiredApprovalView is the status of one required approval. */
export interface RequiredApprovalView {
  role: Role;
  roleLabel: string;
  subject: string;
  label: string;
  satisfied: boolean;
}

/** RoomSummary is the friendly, read-only state of a room. Shape mirrors
 *  pkg/rooms.Summary. */
export interface RoomSummary {
  roomId: string;
  scenarioId: string;
  title: string;
  promise?: string;
  mode: Mode;
  network: string;
  state: State;
  stateLabel: string;
  privateScopes: string[];
  participants: ParticipantView[];
  requiredApprovals: RequiredApprovalView[];
  pendingApprovals: string[];
  eventCount: number;
  commentCount: number;
  approvalCount: number;
  proof?: ProofSummary;
}

/** RoomListEntry is a room in the launcher list. */
export interface RoomListEntry {
  roomId: string;
  scenarioId: string;
  title: string;
  mode: Mode;
  network?: string;
  state: State;
  stateLabel: string;
}

/** RoomData is the full Go-generated room payload (room summary, role policies,
 *  the shared replay, and the launcher list). */
export interface RoomData {
  version: number;
  rooms: RoomListEntry[];
  room: RoomSummary;
  roles: RolePolicy[];
  replay: Replay;
}

/** participantCanApprove reports whether a participant may approve: the view
 *  already encodes the role + delegation gate, so this is the single read. */
export function participantCanApprove(p: ParticipantView): boolean {
  return !!p.canApprove;
}

/** agentApprovalGated reports whether the AI-agent approval guard holds for a
 *  participant: an approving agent MUST be delegated, and an undelegated agent
 *  must NOT be able to approve. Returns true when the guard is satisfied (it is
 *  trivially true for non-agents). */
export function agentApprovalGated(p: ParticipantView): boolean {
  if (!p.isAgent) return true; // the rule only applies to AI agents
  if (p.canApprove) return p.delegated; // an approving agent must be delegated
  return true; // an undelegated agent that cannot approve is correctly gated
}

/** proofIsHonest reports whether a room's proof respects the honesty rails: a
 *  local room never claims L4 or live L0, and the node is never trusted. */
export function proofIsHonest(room: RoomSummary): boolean {
  if (!room.proof) return true;
  const a = room.proof.assurance;
  if (/l4/i.test(a.proofLevel)) return false;
  if (a.l0Verified) return false;
  if (a.trustsInfrixNode) return false;
  return true;
}

/** pendingApprovalRoles returns the role labels still awaiting approval. */
export function pendingApprovalRoles(room: RoomSummary): string[] {
  return room.pendingApprovals || [];
}

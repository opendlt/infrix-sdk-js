/**
 * @infrix rooms — event log and shared-replay helpers (nextux-14). The event log
 * is a hash chain and the shared replay binds to its head, so a replay can never
 * silently drift from the activity it claims to show. These helpers mirror the
 * Go binding.
 */

import type { Role } from './roles.js';

/** RoomEvent is one recorded room event. Shape mirrors pkg/rooms.Event. */
export interface RoomEvent {
  seq: number;
  actor: string;
  role: Role | string;
  action: string;
  timestamp: string;
  artifactHash?: string;
  detail?: string;
  prevHash: string;
  hash: string;
}

/** Replay is the shared, watch-together replay bound to the event log. Shape
 *  mirrors pkg/rooms.Replay. */
export interface Replay {
  roomId: string;
  scenarioId: string;
  network: string;
  storyRef: string;
  cinemaBinding: string;
  eventLogHash: string;
  eventCount: number;
  events: RoomEvent[];
}

/** lastEventHash returns the head hash of an event list, or '' when empty. */
export function lastEventHash(events: RoomEvent[]): string {
  if (!events || events.length === 0) return '';
  return events[events.length - 1].hash;
}

/** replayBoundToLog reports whether a replay binds to its event log (the head
 *  hash and the count both match). */
export function replayBoundToLog(replay: Replay): boolean {
  if (!replay || !Array.isArray(replay.events) || replay.events.length === 0) return false;
  return replay.eventLogHash === lastEventHash(replay.events) && replay.eventCount === replay.events.length;
}

/** comments returns the comment events from a log, in order. */
export function comments(events: RoomEvent[]): RoomEvent[] {
  return (events || []).filter((e) => e.action === 'room.comment');
}

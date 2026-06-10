/**
 * Proof Quest Mode progress-trail types + helpers (nextux-11).
 *
 * Mirrors pkg/quest. The trail reports honestly which quests are complete and
 * which are locked by prerequisites; a learning mission is never reported as a
 * verified proof.
 */

export interface MissionStatus {
  id: string;
  title: string;
  promise: string;
  completed: boolean;
  learning: boolean;
  proofLevel?: string;
  detail?: string;
}

export interface QuestStatus {
  id: string;
  title: string;
  promise: string;
  persona: string;
  estimatedTime: string;
  prerequisites: string[] | null;
  nextQuest?: string;
  locked: boolean;
  lockReason?: string;
  started: boolean;
  completed: boolean;
  missions: MissionStatus[];
}

export interface Status {
  quests: QuestStatus[];
  completed: number;
  total: number;
  nextQuest?: string;
}

export interface TrailCounts {
  completed: number;
  total: number;
  locked: number;
}

/** counts summarizes a progress trail honestly. */
export function counts(status: Status): TrailCounts {
  return {
    completed: status.completed,
    total: status.total,
    locked: (status.quests || []).filter((q) => q.locked).length,
  };
}

/** nextQuestId returns the recommended next quest id (first incomplete, unlocked). */
export function nextQuestId(status: Status): string {
  return status.nextQuest || '';
}

/** questStatusById returns a trail entry. */
export function questStatusById(status: Status, id: string): QuestStatus | undefined {
  return (status.quests || []).find((q) => q.id === id);
}

/** missionStateWord maps a mission to an honest status word — a learning step is
 *  "learned (local)", never "verified L3". */
export function missionStateWord(m: MissionStatus): string {
  if (!m.completed) return 'not done yet';
  if (m.learning) return 'learned (local)';
  return m.proofLevel ? `verified ${m.proofLevel}` : 'verified';
}

/**
 * Proof Quest Mode catalog types + helpers (nextux-11).
 *
 * These mirror the canonical Go shapes in pkg/quest. A quest is a short mission
 * that orchestrates the existing Infrix surfaces; the SDK reads the catalog and
 * the progress trail honestly — it never asserts a completion.
 */

export type MissionKind =
  | 'run_proof'
  | 'verify_offline'
  | 'cinema_replay'
  | 'workbench_plan'
  | 'safe_approval'
  | 'inbox_review'
  | 'identity_explain'
  | 'widget_verify'
  | 'release_evidence'
  | 'kermit_upgrade';

export interface Mission {
  id: string;
  title: string;
  promise: string;
  kind: MissionKind;
  actions: string[];
  requires: string;
}

export interface Quest {
  id: string;
  title: string;
  promise: string;
  estimatedTime: string;
  persona: string;
  prerequisites: string[] | null;
  missions: Mission[];
  artifacts: string[];
  nextQuest?: string;
}

/** questById looks up a quest in a catalog. */
export function questById(catalog: Quest[], id: string): Quest | undefined {
  return catalog.find((q) => q.id === id);
}

/** missionActions returns the union of real actions a quest orchestrates — the
 *  honest "this is built on existing surfaces, not parallel demo logic" view. */
export function missionActions(q: Quest): string[] {
  const set = new Set<string>();
  for (const m of q.missions) for (const a of m.actions) set.add(a);
  return [...set];
}

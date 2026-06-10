/**
 * @infrix quests — Proof Quest Mode catalog, progress-trail, and progress-receipt
 * types + honest helpers (nextux-11). Read-only and honest: the SDK reports the
 * learning trail but never asserts a completion — the Go verifier is the gate.
 */

export { questById, missionActions } from './catalog.js';
export type { Quest, Mission, MissionKind } from './catalog.js';

export { counts, nextQuestId, questStatusById, missionStateWord } from './progress.js';
export type { Status, QuestStatus, MissionStatus, TrailCounts } from './progress.js';

export { isLearning, proofBadge, claimsL4, isHonest } from './receipt.js';
export type { ProgressReceipt, ReceiptProof, Artifact, Mode, ProofBadge, BadgeTone } from './receipt.js';

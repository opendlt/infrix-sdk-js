/**
 * @infrix tutor — Conversational Proof Tutor (nextux-13): explanation, lesson,
 * and quiz types + honest helpers. Read-only and honest: an explanation is
 * grounded in a real parsed artifact and never claims L4 unless the verifier
 * supports it; the audience changes wording only; the Go verifier is always the
 * assurance gate.
 */

export {
  AUDIENCES,
  isGreen,
  claimsL4,
  disclosesNoLiveL0,
  isProofKind,
  isHonest,
} from './explain.js';
export type { Audience, Status, ArtifactKind, Explanation } from './explain.js';

export {
  lessonByTopic,
  isQuizAnswerCorrect,
  correctChoice,
  quizIsWellFormed,
} from './lessons.js';
export type { Lesson, QuizQuestion } from './lessons.js';

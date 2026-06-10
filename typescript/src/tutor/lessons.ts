/**
 * @infrix tutor — lesson + quiz types and honest helpers (nextux-13). The
 * curriculum and quizzes are grounded in real Infrix concepts; the SDK reports
 * them and grades answers, but it asserts no proof — the Go verifier is always
 * the assurance gate.
 */

/** A grounded multiple-choice check tied to a lesson. */
export interface QuizQuestion {
  topic: string;
  question: string;
  choices: string[];
  /** 0-based index of the correct choice. */
  answer: number;
  explain: string;
}

/** A short, grounded teaching unit. Shape mirrors pkg/tutor.Lesson. */
export interface Lesson {
  id: string;
  topic: string;
  title: string;
  explanation: string;
  example: string;
  tryIt: string;
  quiz: QuizQuestion;
  related: string[];
  aliases: string[];
  glossaryRef?: string;
}

/** lessonByTopic resolves a lesson by id, canonical topic, or alias
 *  (case-insensitive), or null when none matches — never an invented lesson. */
export function lessonByTopic(lessons: Lesson[], topic: string): Lesson | null {
  const key = String(topic || '').toLowerCase();
  return (
    lessons.find(
      (l) =>
        l.topic.toLowerCase() === key ||
        l.id.toLowerCase() === key ||
        (l.aliases || []).some((a) => a.toLowerCase() === key),
    ) || null
  );
}

/** isQuizAnswerCorrect grades a 0-based choice index against a question. */
export function isQuizAnswerCorrect(q: QuizQuestion, choice: number): boolean {
  return choice === q.answer;
}

/** correctChoice returns the text of the correct choice, or '' if out of range. */
export function correctChoice(q: QuizQuestion): string {
  if (q.answer < 0 || q.answer >= q.choices.length) return '';
  return q.choices[q.answer];
}

/** quizIsWellFormed reports whether a quiz is internally consistent (a real
 *  answer index, at least two choices, an explanation). */
export function quizIsWellFormed(q: QuizQuestion): boolean {
  return (
    !!q.question &&
    Array.isArray(q.choices) &&
    q.choices.length >= 2 &&
    q.answer >= 0 &&
    q.answer < q.choices.length &&
    !!q.explain
  );
}

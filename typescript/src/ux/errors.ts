/**
 * Progressive Disclosure design system — error helpers (nextux-03).
 *
 * Selectors over the registry's error cards (the browser/SDK twin of
 * uxcopy.ErrorCard). They integrate with the SDK's existing InfrixUserError:
 * given a stable code, look up the design-system card to render plain meaning,
 * impact on assurance, fixes, and a docs link.
 */

import type { ErrorCard } from './labels';

/** errorCardByCode finds the card for a stable error code (or undefined). */
export function errorCardByCode(cards: ErrorCard[], code: string): ErrorCard | undefined {
  return (cards || []).find((c) => c.code === code);
}

/**
 * explainErrorCard renders a one-line, agent-friendly explanation: the plain
 * meaning plus the first safe-to-run fix command when there is one.
 */
export function explainErrorCard(card: ErrorCard): string {
  if (!card) return '';
  const safe = (card.fixes || []).find((f) => f.safeToRun && f.command);
  if (safe) return `${card.plainMeaning} Fix: ${safe.command}`;
  const first = (card.fixes || [])[0];
  if (first) return `${card.plainMeaning} ${first.label}`;
  return card.plainMeaning;
}

/**
 * cardForUserError maps an InfrixUserError-like object ({ code }) onto its
 * design-system card, falling back to the UNKNOWN card so a surface always has
 * something actionable to render.
 */
export function cardForUserError(cards: ErrorCard[], err: { code?: string } | null | undefined): ErrorCard | undefined {
  const code = (err && err.code) || 'UNKNOWN';
  return errorCardByCode(cards, code) || errorCardByCode(cards, 'UNKNOWN');
}

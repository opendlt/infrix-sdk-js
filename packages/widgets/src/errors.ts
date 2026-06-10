// @infrix/widgets — error resolution (nextux-09).
//
// Errors are explained with the SAME canonical error cards Nexus and the SDK use
// (vendored from the uxcopy fixture), so the widget never invents wording.

// @ts-ignore — vendored browser module.
import { errorCardByCode } from './vendor/uxLabels.js';

export interface ErrorFix {
  label: string;
  command?: string;
  safeToRun?: boolean;
}

export interface ErrorCard {
  code: string;
  title: string;
  plainMeaning: string;
  fixes: ErrorFix[];
  retryGuidance?: string;
  docs?: string;
  technical?: string;
}

const FALLBACK: ErrorCard = {
  code: 'UNKNOWN',
  title: 'Something went wrong',
  plainMeaning: 'The widget hit an error it could not resolve into specific guidance.',
  fixes: [{ label: 'Check the proof input and try again', safeToRun: true }],
  docs: 'docs/errors/README.md',
};

/** resolveErrorCard maps an error (a stable code string, an object with a
 *  `.code`, or an Error) to a canonical resolution card. It never throws. */
export function resolveErrorCard(err: unknown): ErrorCard {
  const code = extractCode(err);
  if (code) {
    const card = errorCardByCode(code) as ErrorCard | null;
    if (card) {
      return { ...FALLBACK, ...card, fixes: card.fixes || [] };
    }
  }
  const message = extractMessage(err);
  return {
    ...FALLBACK,
    plainMeaning: message || FALLBACK.plainMeaning,
  };
}

function extractCode(err: unknown): string {
  if (typeof err === 'string') return /^[A-Z][A-Z0-9_]+$/.test(err) ? err : '';
  if (err && typeof err === 'object') {
    const c = (err as { code?: unknown }).code;
    if (typeof c === 'string') return c;
  }
  return '';
}

function extractMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return '';
}

// @infrix/widgets — shared hooks, the widget shell, and badge rendering.

import { useState, useEffect } from 'react';
import { ensureStyles } from './styles.js';
import { canonicalBadges } from './verifier.js';
import type { VerifyResult, AssuranceState, CanonicalBadge } from './verifier.js';

export type { AssuranceState, CanonicalBadge } from './verifier.js';
export { assuranceState, canonicalBadges } from './verifier.js';

export type Theme = 'light' | 'dark' | 'auto';
export type Variant = 'full' | 'compact';

/** Props every widget supports. */
export interface CommonProps {
  /** light | dark | auto (follows prefers-color-scheme). Default: auto. */
  theme?: Theme;
  /** full | compact. Default: full. */
  variant?: Variant;
  /** Extra class names merged onto the widget root. */
  className?: string;
  /** Called with the verification result once verification completes. */
  onVerify?: (result: VerifyResult) => void;
  /** Called when verification (or input parsing) fails. */
  onError?: (error: unknown) => void;
}

type Phase = 'verifying' | 'done' | 'error';

interface VerificationState {
  phase: Phase;
  result?: VerifyResult;
  error?: unknown;
}

/** useVerification runs `verifyFn` on mount unless a precomputed `result` is
 *  supplied (which renders synchronously — used by SSR + tests). It calls
 *  onVerify/onError exactly once. */
export function useVerification(
  verifyFn: () => Promise<VerifyResult>,
  precomputed: VerifyResult | undefined,
  onVerify?: (r: VerifyResult) => void,
  onError?: (e: unknown) => void,
): VerificationState {
  const [state, setState] = useState<VerificationState>(
    precomputed ? { phase: 'done', result: precomputed } : { phase: 'verifying' },
  );

  useEffect(() => {
    if (precomputed) {
      onVerify?.(precomputed);
      return;
    }
    let cancelled = false;
    verifyFn()
      .then((result) => {
        if (cancelled) return;
        setState({ phase: 'done', result });
        onVerify?.(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ phase: 'error', error });
        onError?.(error);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

/** WidgetShell is the themed, scoped root every widget renders into. */
export function WidgetShell(props: {
  kind: string;
  theme?: Theme;
  variant?: Variant;
  className?: string;
  ariaLabel: string;
  children: unknown;
}): JSX.Element {
  ensureStyles();
  const cls = ['iw-widget', `iw-widget-${props.kind}`, props.className].filter(Boolean).join(' ');
  return (
    <div
      className={cls}
      data-theme={props.theme || 'auto'}
      data-variant={props.variant || 'full'}
      role="group"
      aria-label={props.ariaLabel}
    >
      {props.children as never}
    </div>
  );
}

/** StatusLine renders the honest status + label. */
export function StatusLine(props: { result: VerifyResult }): JSX.Element {
  const r = props.result;
  const word = r.status === 'verified' ? 'Verified' : r.status === 'partial' ? 'Partially verified' : 'Not verified';
  return (
    <div>
      <span className="iw-status" data-status={r.status} role="status">
        {word}
      </span>
      <p className="iw-honest">{r.honestLabel}</p>
    </div>
  );
}

/** BadgeList renders the canonical, data-gated assurance badges. */
export function BadgeList(props: { result: VerifyResult }): JSX.Element {
  const list = canonicalBadges(props.result);
  return (
    <ul className="iw-badges" aria-label="Assurance">
      {list.map((b) => (
        <li
          key={b.id}
          className="iw-badge"
          data-on="true"
          data-role={b.colorRole || 'neutral'}
          aria-label={b.screenReader || b.short}
          title={b.plain || b.short}
        >
          {b.short}
        </li>
      ))}
    </ul>
  );
}

/** Spinner is the verifying indicator (respects prefers-reduced-motion). */
export function Spinner(): JSX.Element {
  return <span className="iw-spinner" aria-hidden="true" />;
}

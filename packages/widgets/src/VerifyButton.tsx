// @infrix/widgets — InfrixVerifyButton.

import { useState } from 'react';
import { verifyBundle } from './verifier.js';
import type { VerifyResult } from './verifier.js';
import { WidgetShell, StatusLine, BadgeList, Spinner } from './shared.js';
import type { CommonProps } from './shared.js';

export interface InfrixVerifyButtonProps extends CommonProps {
  /** A portable evidence package to verify (in memory). */
  bundle?: unknown;
  /** A URL to fetch the proof bundle from (the user's own proof). */
  bundleUrl?: string;
  /** An opt-in L0 verification endpoint (nothing is sent without it). */
  l0?: string;
  /** Button label. Default: "Verify proof". */
  label?: string;
  /** Override fetch (for the bundleUrl fetch). */
  fetchImpl?: typeof fetch;
}

type Phase = 'idle' | 'verifying' | 'done' | 'error';

export function InfrixVerifyButton(props: InfrixVerifyButtonProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<VerifyResult | undefined>(undefined);

  async function run(): Promise<void> {
    setPhase('verifying');
    try {
      let bundle = props.bundle;
      if (bundle == null && props.bundleUrl) {
        const f = props.fetchImpl || fetch;
        const res = await f(props.bundleUrl);
        if (!res.ok) throw new Error(`could not load proof (${res.status})`);
        bundle = await res.json();
      }
      if (bundle == null) throw new Error('no bundle or bundleUrl provided');
      const r = await verifyBundle(bundle, { l0: props.l0 });
      setResult(r);
      setPhase('done');
      props.onVerify?.(r);
    } catch (err) {
      setPhase('error');
      props.onError?.(err);
    }
  }

  return (
    <WidgetShell kind="verify" theme={props.theme} variant={props.variant} className={props.className} ariaLabel="Verify proof">
      <button
        type="button"
        className="iw-btn"
        onClick={run}
        disabled={phase === 'verifying'}
        aria-busy={phase === 'verifying'}
      >
        {phase === 'verifying' ? <Spinner /> : null}
        {phase === 'verifying' ? 'Verifying…' : props.label || 'Verify proof'}
      </button>
      {phase === 'error' && (
        <p className="iw-status" data-status="failed" role="alert">
          Verification failed.
        </p>
      )}
      {phase === 'done' && result && (
        <div className="iw-verify-result">
          <StatusLine result={result} />
          <BadgeList result={result} />
        </div>
      )}
    </WidgetShell>
  );
}

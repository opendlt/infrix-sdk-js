// @infrix/widgets — InfrixTrustBoundary.
//
// Explains, in the canonical Nexus vocabulary, exactly what trust a proof does
// and does not require: no node trust, whether L0 was confirmed, whether replay
// is present. The badges are data-gated, so no green appears unless earned.

import { verifyReceiptResult } from './verifier.js';
import type { VerifyResult } from './verifier.js';
import { WidgetShell, BadgeList, useVerification } from './shared.js';
import type { CommonProps } from './shared.js';

export interface InfrixTrustBoundaryProps extends CommonProps {
  /** A canonical proof receipt to explain. */
  receipt?: unknown;
  /** A precomputed verification result (renders synchronously; used by SSR). */
  result?: VerifyResult;
}

export function InfrixTrustBoundary(props: InfrixTrustBoundaryProps): JSX.Element {
  const verifyFn = (): Promise<VerifyResult> => Promise.resolve(verifyReceiptResult(props.receipt));
  const state = useVerification(verifyFn, props.result, props.onVerify, props.onError);
  const r = state.result;

  return (
    <WidgetShell kind="trust" theme={props.theme} variant={props.variant} className={props.className} ariaLabel="Trust boundary">
      <h3 className="iw-title">Trust boundary</h3>
      {!r ? (
        <p className="iw-hint">No receipt to explain.</p>
      ) : (
        <div>
          <p className="iw-honest">{r.honestLabel}</p>
          <dl className="iw-grid">
            <dt>Node trust</dt>
            <dd>{r.nodeTrusted ? 'TRUSTS the Infrix node' : 'no node trust required'}</dd>
            <dt>L0 anchor</dt>
            <dd>{r.l0Verified ? `confirmed${r.network ? ' on ' + r.network : ''}` : r.l0Checked ? 'not confirmed' : 'not checked (needs an L0 endpoint or backend)'}</dd>
            <dt>Replay</dt>
            <dd>{r.replayPresent ? 'present' : 'not present'}</dd>
          </dl>
          <BadgeList result={r} />
        </div>
      )}
    </WidgetShell>
  );
}

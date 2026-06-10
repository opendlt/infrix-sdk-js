// @infrix/widgets — InfrixProofReceipt.

import { verifyBundle, verifyReceiptResult } from './verifier.js';
import type { VerifyResult } from './verifier.js';
import { WidgetShell, StatusLine, BadgeList, Spinner, useVerification } from './shared.js';
import type { CommonProps } from './shared.js';

export interface InfrixProofReceiptProps extends CommonProps {
  /** A portable evidence package to verify offline and render. */
  bundle?: unknown;
  /** A pre-built canonical proof receipt to validate + render. */
  receipt?: unknown;
  /** A precomputed verification result (renders synchronously; used by SSR). */
  result?: VerifyResult;
  /** An opt-in L0 verification endpoint (nothing is sent without it). */
  l0?: string;
}

export function InfrixProofReceipt(props: InfrixProofReceiptProps): JSX.Element {
  const verifyFn = (): Promise<VerifyResult> =>
    props.bundle != null
      ? verifyBundle(props.bundle, { l0: props.l0 })
      : Promise.resolve(verifyReceiptResult(props.receipt));

  const state = useVerification(verifyFn, props.result, props.onVerify, props.onError);

  return (
    <WidgetShell kind="receipt" theme={props.theme} variant={props.variant} className={props.className} ariaLabel="Proof receipt">
      <h3 className="iw-title">Proof receipt</h3>
      {state.phase === 'verifying' && (
        <p className="iw-hint">
          <Spinner /> Verifying…
        </p>
      )}
      {state.phase === 'error' && (
        <p className="iw-status" data-status="failed" role="alert">
          Could not verify this proof.
        </p>
      )}
      {state.phase === 'done' && state.result && <ReceiptBody result={state.result} />}
    </WidgetShell>
  );
}

function ReceiptBody(props: { result: VerifyResult }): JSX.Element {
  const r = props.result;
  return (
    <div>
      <StatusLine result={r} />
      <dl className="iw-grid">
        <dt>Assurance</dt>
        <dd>{r.label || '—'}</dd>
        <dt>Trusts node</dt>
        <dd>{r.nodeTrusted ? 'yes' : 'no'}</dd>
        <dt>L0 anchor</dt>
        <dd>{r.l0Verified ? `confirmed${r.network ? ' on ' + r.network : ''}` : r.l0Checked ? 'not confirmed' : 'not checked (offline)'}</dd>
      </dl>
      <BadgeList result={r} />
      {r.warnings.length > 0 && (
        <ul className="iw-warnings">
          {r.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

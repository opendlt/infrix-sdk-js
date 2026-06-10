// @infrix/widgets — InfrixProofStory.
//
// Verifies a portable proof story (manifest checksums, Cinema binding, assurance
// honesty) IN THE BROWSER and renders the outcome. An offline story is never
// inflated to L4; a tampered story shows a failed status.

import { verifyStory } from './verifier.js';
import type { VerifyResult } from './verifier.js';
import { WidgetShell, StatusLine, BadgeList, Spinner, useVerification } from './shared.js';
import type { CommonProps } from './shared.js';

export interface InfrixProofStoryProps extends CommonProps {
  /** A proof story (share bundle or { story, files }). */
  story?: unknown;
  /** A precomputed verification result (renders synchronously; used by SSR). */
  result?: VerifyResult;
  /** An opt-in L0 verification endpoint (nothing is sent without it). */
  l0?: string;
}

function storyTitle(input: unknown): string {
  const o = input as { story?: { title?: string }; title?: string };
  return (o && o.story && o.story.title) || (o && o.title) || 'Proof story';
}

export function InfrixProofStory(props: InfrixProofStoryProps): JSX.Element {
  const verifyFn = (): Promise<VerifyResult> => verifyStory(props.story, { l0: props.l0 });
  const state = useVerification(verifyFn, props.result, props.onVerify, props.onError);

  return (
    <WidgetShell kind="story" theme={props.theme} variant={props.variant} className={props.className} ariaLabel="Proof story">
      <h3 className="iw-title">{storyTitle(props.story)}</h3>
      {state.phase === 'verifying' && (
        <p className="iw-hint">
          <Spinner /> Verifying the story…
        </p>
      )}
      {state.phase === 'error' && (
        <p className="iw-status" data-status="failed" role="alert">
          Could not verify the story.
        </p>
      )}
      {state.phase === 'done' && state.result && (
        <div>
          <StatusLine result={state.result} />
          <dl className="iw-grid">
            <dt>Assurance</dt>
            <dd>{state.result.label || '—'}</dd>
            <dt>Cinema</dt>
            <dd>{state.result.cinemaBound ? 'bound to the proof' : 'not bound'}</dd>
            <dt>Replay</dt>
            <dd>{state.result.replayPresent ? 'present' : 'not present'}</dd>
          </dl>
          <BadgeList result={state.result} />
          {state.result.warnings.length > 0 && (
            <ul className="iw-warnings">
              {state.result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </WidgetShell>
  );
}

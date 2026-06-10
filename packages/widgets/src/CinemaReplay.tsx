// @infrix/widgets — InfrixCinemaReplay.
//
// Renders a proof story's recorded Cinema replay as an accessible step timeline
// — the SAME steps the Cinema canvas animates, bound to the proof. It verifies
// the story (manifest + Cinema binding) and surfaces an honest status; it never
// claims the replay is verified unless the story verified.

import { verifyStory } from './verifier.js';
import type { VerifyResult } from './verifier.js';
import { WidgetShell, StatusLine, Spinner, useVerification } from './shared.js';
import type { CommonProps } from './shared.js';

export interface CinemaStep {
  index: number;
  label: string;
}

export interface InfrixCinemaReplayProps extends CommonProps {
  /** A proof story (share bundle or { story, files }). */
  story?: unknown;
  /** A precomputed verification result (renders synchronously; used by SSR). */
  result?: VerifyResult;
}

function b64ToString(b64: string): string {
  if (typeof atob === 'function') return atob(b64);
  // Node fallback (typed loosely so the browser-first package needs no node types).
  const B = (globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } }).Buffer;
  return B ? B.from(b64, 'base64').toString('binary') : '';
}

/** extractCinemaSteps pulls the recorded steps out of a story's Cinema artifact,
 *  tolerating the common shapes (steps / frames / timeline / events). */
export function extractCinemaSteps(input: unknown): CinemaStep[] {
  const obj = input as { story?: any; files?: Record<string, string> };
  let cinema: any = null;
  try {
    if (obj && obj.story && obj.files) {
      const cinemaFile = obj.story.artifacts && obj.story.artifacts.cinemaReplay;
      if (cinemaFile && obj.files[cinemaFile]) {
        cinema = JSON.parse(decodeUtf8(b64ToString(obj.files[cinemaFile])));
      }
    } else if (obj && (obj as any).steps) {
      cinema = obj;
    }
  } catch {
    cinema = null;
  }
  if (!cinema) return [];
  const cap = cinema.capsule || {};
  const arr: any[] =
    cinema.steps || cinema.frames || cinema.timeline || cinema.events ||
    cap.executionTrace || cap.steps || cap.trace || [];
  return arr.map((s, i) => ({
    index: i + 1,
    label:
      typeof s === 'string'
        ? s
        : String((s && (s.label || s.name || s.title || s.action || s.summary)) || `Step ${i + 1}`),
  }));
}

function decodeUtf8(binary: string): string {
  // b64ToString returns a binary string; re-decode as UTF-8.
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function InfrixCinemaReplay(props: InfrixCinemaReplayProps): JSX.Element {
  const verifyFn = (): Promise<VerifyResult> => verifyStory(props.story, {});
  const state = useVerification(verifyFn, props.result, props.onVerify, props.onError);
  const steps = extractCinemaSteps(props.story);

  return (
    <WidgetShell kind="cinema" theme={props.theme} variant={props.variant} className={props.className} ariaLabel="Cinema replay">
      <h3 className="iw-title">Cinema replay</h3>
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
      {state.phase === 'done' && state.result && <StatusLine result={state.result} />}
      {steps.length === 0 ? (
        <p className="iw-hint">No recorded replay steps.</p>
      ) : (
        <ol className="iw-steps" aria-label="Replay steps">
          {steps.map((s) => (
            <li className="iw-step" key={s.index}>
              <span className="iw-step-index">{s.index}.</span>
              <span className="iw-step-label">{s.label}</span>
            </li>
          ))}
        </ol>
      )}
    </WidgetShell>
  );
}

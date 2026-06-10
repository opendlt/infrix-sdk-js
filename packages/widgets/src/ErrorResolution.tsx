// @infrix/widgets — InfrixErrorResolution.
//
// Renders the canonical error-resolution card for a stable Infrix error code (or
// any error), using the SAME wording Nexus + the SDK use.

import { resolveErrorCard } from './errors.js';
import { WidgetShell } from './shared.js';
import type { CommonProps } from './shared.js';

export interface InfrixErrorResolutionProps extends CommonProps {
  /** An error: a stable code string, an object with `.code`, or an Error. */
  error: unknown;
}

export function InfrixErrorResolution(props: InfrixErrorResolutionProps): JSX.Element {
  const card = resolveErrorCard(props.error);
  return (
    <WidgetShell kind="error" theme={props.theme} variant={props.variant} className={props.className} ariaLabel={`Error: ${card.title}`}>
      <div className="iw-error" role="alert">
        <p className="iw-error-title">{card.title}</p>
        <p className="iw-honest">{card.plainMeaning}</p>
        {card.fixes.length > 0 && (
          <div className="iw-error-fix">
            {card.fixes.map((f, i) => (
              <div key={i}>
                <span className="iw-hint">{f.label}</span>
                {f.command && <code className="iw-mono iw-task-cmd">{f.command}</code>}
              </div>
            ))}
          </div>
        )}
        {card.retryGuidance && <p className="iw-hint">{card.retryGuidance}</p>}
      </div>
    </WidgetShell>
  );
}

// @infrix/widgets — InfrixTaskCard.
//
// Renders a Task Template Marketplace card with an HONEST trust chip: a positive
// (green) trust state is shown only for an official_verified source; an unsigned
// or tampered source never gets a positive chip.

import { WidgetShell } from './shared.js';
import type { CommonProps } from './shared.js';

export interface TaskCardData {
  id: string;
  title: string;
  description?: string;
  /** official_verified | publisher_verified | local_unsigned | tampered | unknown */
  trust?: string;
  category?: string;
  runCommand?: string;
}

export interface InfrixTaskCardProps extends CommonProps {
  task: TaskCardData;
}

const POSITIVE_TRUST = new Set(['official_verified', 'publisher_verified']);

const TRUST_LABEL: Record<string, string> = {
  official_verified: 'Official · verified',
  publisher_verified: 'Publisher · verified',
  local_unsigned: 'Local · unsigned',
  tampered: 'Tampered',
  unknown: 'Unknown source',
};

export function InfrixTaskCard(props: InfrixTaskCardProps): JSX.Element {
  const t = props.task || ({} as TaskCardData);
  const trust = t.trust || 'unknown';
  const positive = POSITIVE_TRUST.has(trust);

  return (
    <WidgetShell kind="task" theme={props.theme} variant={props.variant} className={props.className} ariaLabel={`Task: ${t.title}`}>
      <div className="iw-task-head">
        <h3 className="iw-title" style={{ margin: 0 }}>
          {t.title}
        </h3>
        <span className="iw-task-trust" data-trust={positive ? trust : 'unverified'} aria-label={`Trust: ${TRUST_LABEL[trust] || trust}`}>
          {TRUST_LABEL[trust] || trust}
        </span>
      </div>
      {t.category && <p className="iw-hint">{t.category}</p>}
      {t.description && <p className="iw-honest">{t.description}</p>}
      {t.runCommand && (
        <code className="iw-mono iw-task-cmd">{t.runCommand}</code>
      )}
    </WidgetShell>
  );
}

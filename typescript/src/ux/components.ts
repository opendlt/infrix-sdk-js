/**
 * Progressive Disclosure design system — framework-agnostic view-models
 * (nextux-03).
 *
 * The SDK is not a DOM library, so "components" here are plain view-model
 * builders: structured, honest data a host (React, web component, embed, or an
 * AI agent's renderer) turns into UI. They reuse the same gate as every surface,
 * so what an embed shows can never exceed what the state proves.
 */

import type { AssuranceBadge, AssuranceState, NextAction, PersonaProfile } from './labels';
import { badgesFor } from './assurance';

export interface AssuranceBadgeViewModel {
  id: string;
  short: string;
  colorRole: string;
  screenReader: string;
  icon: string;
  plain: string;
}

/** assuranceBadgeViewModels returns the honest badge row for a state. */
export function assuranceBadgeViewModels(
  badges: AssuranceBadge[],
  state: AssuranceState,
): AssuranceBadgeViewModel[] {
  return badgesFor(badges, state).map((b) => ({
    id: b.id,
    short: b.short,
    colorRole: b.colorRole,
    screenReader: b.screenReader,
    icon: b.icon,
    plain: b.plain,
  }));
}

export type ReceiptStatus = 'verified' | 'partial' | 'failed';

export interface ProofReceiptInput {
  status: ReceiptStatus;
  summary?: string;
  state: AssuranceState;
  trust?: string;
  artifacts?: Array<{ label: string; value: string }>;
  warnings?: string[];
}

export interface ProofReceiptViewModel {
  status: ReceiptStatus;
  headline: string;
  summary: string;
  badges: AssuranceBadgeViewModel[];
  trust: string;
  artifacts: Array<{ label: string; value: string }>;
  warnings: string[];
}

const HEADLINE: Record<ReceiptStatus, string> = {
  verified: 'VERIFIED',
  partial: 'PARTIALLY VERIFIED',
  failed: 'NOT VERIFIED',
};

/** proofReceiptViewModel shapes a receipt for rendering (badges are gated). */
export function proofReceiptViewModel(
  badges: AssuranceBadge[],
  input: ProofReceiptInput,
): ProofReceiptViewModel {
  return {
    status: input.status,
    headline: HEADLINE[input.status] || HEADLINE.failed,
    summary: input.summary || '',
    badges: assuranceBadgeViewModels(badges, input.state || {}),
    trust: input.trust || '',
    artifacts: input.artifacts || [],
    warnings: input.warnings || [],
  };
}

/**
 * nextActionsForPersona returns a persona's next actions, lead actions first
 * (presentation only — the relevant SET is the same data; the persona reorders).
 */
export function nextActionsForPersona(
  actions: NextAction[],
  profiles: PersonaProfile[],
  persona: string,
): NextAction[] {
  const prof = profiles.find((p) => p.persona === persona) || profiles[0];
  const relevant = (a: NextAction) => (a.personas || []).includes(persona as NextAction['personas'][number]);
  const byId = new Map(actions.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const out: NextAction[] = [];
  for (const id of (prof && prof.leadActions) || []) {
    const a = byId.get(id);
    if (a && relevant(a) && !seen.has(id)) {
      out.push(a);
      seen.add(id);
    }
  }
  for (const a of actions) {
    if (!seen.has(a.id) && relevant(a)) out.push(a);
  }
  return out;
}

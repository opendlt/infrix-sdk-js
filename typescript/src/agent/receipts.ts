/**
 * Receipt + error helpers for the Agent Action Protocol.
 */

import type { AgentResponse, AgentError, Assurance } from './actions';

/**
 * assuranceOf returns the honest assurance summary of a response, or null. It
 * never upgrades the verdict — it is exactly what the verifier returned.
 */
export function assuranceOf(resp: AgentResponse): Assurance | null {
  return resp.assurance ?? null;
}

/**
 * trustsNode reports whether a response's assurance relied on trusting the
 * Infrix node (false means independently verified).
 */
export function trustsNode(resp: AgentResponse): boolean {
  return resp.assurance?.trustsInfrixNode === true;
}

/**
 * firstError returns the first structured error of a failed response, or null.
 */
export function firstError(resp: AgentResponse): AgentError | null {
  return resp.errors && resp.errors.length > 0 ? resp.errors[0] : null;
}

/**
 * explainError returns a stable, agent-safe one-line explanation for a failed
 * response: the message plus a safe fix command when one exists. The wording is
 * derived from the stable error catalog, so it does not drift between calls.
 */
export function explainError(resp: AgentResponse): string {
  const e = firstError(resp);
  if (!e) return '';
  const msg = e.message || e.title;
  const safeFix = (e.fixes ?? []).find((f) => f.safeToRun && f.command);
  if (safeFix) return `${msg} Fix: ${safeFix.command}`;
  if (e.fixes && e.fixes.length > 0) return `${msg} ${e.fixes[0].label}`;
  return msg;
}

/**
 * verifierCommand extracts a copyable verifier command from a response's
 * artifacts, if one is present (so an agent can hand a user an independent
 * check).
 */
export function verifierCommand(resp: AgentResponse): string | null {
  for (const a of resp.artifacts ?? []) {
    if (a.command) return a.command;
  }
  return null;
}

/**
 * Autopilot remediation — SDK entry (nextux-05).
 *
 * Re-exports the plan + receipt types and the client. Load a sealed plan (from
 * `infrix autopilot plan` or the `autopilot.plan` agent action) and read it; an
 * apply goes through the approval-gated agent action / CLI, never the SDK.
 */

export * from './plan';
export * from './receipt';
export * from './client';

/**
 * Task Template Marketplace — run planning helpers (nextux-04).
 *
 * A task's execution is the ordered sequence of EXISTING agent actions it
 * wraps. These helpers let an agent SDK user plan that sequence and validate
 * their inputs before driving the actions (via the agent client) or invoking
 * `infrix tasks run`. The SDK never executes a task itself — execution flows
 * through the governed agent actions, which enforce dry-run + approval + the
 * mainnet block.
 */

import type { TaskTemplate } from './templates';

/** PlannedStep is one ordered agent action the task runner will invoke. */
export interface PlannedStep {
  id: string;
  uses: string;
}

/** planActions returns the ordered agent actions a task runs. */
export function planActions(t: TaskTemplate): PlannedStep[] {
  return t.actions.map((a) => ({ id: a.id, uses: a.uses }));
}

/** requiredInputs returns the template's required input field names. */
export function requiredInputs(t: TaskTemplate): string[] {
  return t.inputsSchema?.required ? [...t.inputsSchema.required] : [];
}

/**
 * missingInputs returns the required inputs absent (or empty) in a draft — the
 * "generate missing input draft" check an agent does before dry-running.
 */
export function missingInputs(t: TaskTemplate, input: Record<string, unknown>): string[] {
  const draft = input || {};
  return requiredInputs(t).filter((k) => draft[k] === undefined || draft[k] === null || draft[k] === '');
}

/** runCommand returns the exact CLI command to run a task (for guidance). */
export function runCommand(t: TaskTemplate, opts: { inputFile?: string; outDir?: string; network?: string } = {}): string {
  const parts = ['infrix', 'tasks', 'run', t.id];
  if (opts.inputFile) parts.push('--input', opts.inputFile);
  if (opts.outDir) parts.push('--out', opts.outDir);
  if (opts.network) parts.push('--network', opts.network);
  return parts.join(' ');
}

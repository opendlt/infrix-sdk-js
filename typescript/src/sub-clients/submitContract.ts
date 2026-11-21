/**
 * THE GOVERNED-SUBMIT WIRE CONTRACT (core item 2c part 28aa).
 *
 * Every submit door on both roots (governed.submit, intent.submit, REST POST /v4/intents) decodes ONE request,
 * core.SubmitGovernedRequest, strictly: a member it does not name is refused by name, and every member it names
 * reaches the intent or is refused by name. This module builds exactly that request from a goal and the submit
 * options, and refuses — by name, before anything is sent — what the node would refuse.
 *
 * The goal is flattened beside the envelope: `goalType` and every other IntentGoal member (sourceAssets,
 * targetAssets, targetState, via, customType, customParams, priority) at the top level.
 */
import type { IntentGoal, IntentSubmitOptions } from '../types/governance';
import { checkRequesterMetadata } from './requesterMetadata';

/** The IntentGoal members the contract carries (goal.type travels as goalType). */
export const SUBMIT_GOAL_MEMBERS = [
  'type',
  'sourceAssets',
  'targetAssets',
  'targetState',
  'via',
  'customType',
  'customParams',
  'priority',
] as const;

/** The submit options the contract carries, each under its own name. */
export const SUBMIT_OPTION_MEMBERS = ['constraints', 'preferences', 'userAddress', 'rawInput', 'expiresAt', 'preview', 'metadata'] as const;

/**
 * buildSubmitParams is the governed-submit request for goal and opts (the disclosure context — actor, purpose,
 * workflowInstance — is the caller's to add). It throws, naming the member, for anything the node refuses:
 * a natural-language string as the goal, a goal member or option the contract does not name, and metadata that is
 * not a bounded JSON object (checkRequesterMetadata: the requester's own annotation, recorded as the intent's
 * RequesterMetadata, core item 2c part 28ac row 3).
 */
export function buildSubmitParams(method: string, goal: IntentGoal | string, opts?: IntentSubmitOptions): Record<string, unknown> {
  if (typeof goal === 'string') {
    throw new Error(
      `${method} takes a structured goal: natural-language text is resolved by intent.resolve (POST /v4/intents/resolve), ` +
        'which previews the goal it parses; submit that goal, with the text as opts.rawInput',
    );
  }
  if (goal === null || typeof goal !== 'object') {
    throw new Error(`${method} takes a structured goal`);
  }
  const params: Record<string, unknown> = {};
  const g = goal as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(g)) {
    if (v === undefined) continue;
    if (!(SUBMIT_GOAL_MEMBERS as readonly string[]).includes(k)) {
      throw new Error(`${method}: the goal member ${k} is not part of the governed-submit contract (${SUBMIT_GOAL_MEMBERS.join(', ')})`);
    }
    params[k === 'type' ? 'goalType' : k] = v;
  }
  if (params.goalType === undefined) {
    throw new Error(`${method}: the goal has no type`);
  }
  for (const [k, v] of Object.entries(opts ?? {})) {
    if (v === undefined) continue;
    if (k === 'metadata') {
      checkRequesterMetadata(method, v);
    }
    if (!(SUBMIT_OPTION_MEMBERS as readonly string[]).includes(k)) {
      throw new Error(`${method}: the option ${k} is not part of the governed-submit contract (${SUBMIT_OPTION_MEMBERS.join(', ')})`);
    }
    if (params[k] !== undefined) {
      throw new Error(`${method}: the option ${k} collides with the goal's own ${k}`);
    }
    params[k] = v;
  }
  return params;
}

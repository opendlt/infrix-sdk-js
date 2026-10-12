import { genDeclared, genPathValue } from './gen/runtime';

/**
 * Hand-written reads of the node's REST routes answer exactly the members the route declares in the
 * route census (docs/release/census/rest-response-shapes.txt of infrix-core): no more, no fewer, and
 * never a key the route does not return. The shared pieces live here so every client reads an answer
 * the same way the generated clients (./gen) do.
 */

/**
 * The members of an answer, each one required: a node answer that lacks a declared member is refused
 * (an explicit null is an answer). An empty value read from a missing key is an all-clear a caller
 * cannot tell from a real one, so `{}` is never read as "no items".
 *
 * @param route - The route as the census names it, e.g. `GET /v4/anchors`.
 * @param answer - The `data` payload the node answered.
 * @param members - Every member the route declares.
 */
export function declaredMembers<T>(route: string, answer: unknown, members: ReadonlyArray<keyof T & string>): T {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) {
    throw new Error(`the node's answer to ${route} is not an object`);
  }
  const record = answer as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const member of members) {
    out[member] = genDeclared(route, member, record[member]);
  }
  return out as T;
}

/** Refuse a path value that is not a non-empty string, so the mistake is named by the client. */
export function checkPathValue(route: string, name: string, value: string): void {
  genPathValue(route, name, value);
}

/** A page of a list route's answer (GET /v4/anchors, /v4/approvals, /v4/intents, ...). */
export interface ListAnswer {
  /** The records the page holds. */
  readonly items: unknown;
  /** The paging the route reports. */
  readonly pagination: unknown;
}

/** The members of a list answer. */
export const LIST_MEMBERS = ['items', 'pagination'] as const;

/** One governed object as the registry-backed routes answer it (GET /v4/objects/{type}/{id}, /v4/approvals/{id}, ...). */
export interface RegistryObjectAnswer {
  readonly audit: unknown;
  readonly created: unknown;
  readonly fields: unknown;
  readonly id: unknown;
  readonly state: unknown;
  readonly type: unknown;
  readonly updated: unknown;
  readonly url: unknown;
  readonly version: unknown;
}

/** The members of a registry object answer. */
export const REGISTRY_OBJECT_MEMBERS = [
  'audit', 'created', 'fields', 'id', 'state', 'type', 'updated', 'url', 'version',
] as const;

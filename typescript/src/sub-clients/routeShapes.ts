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

/**
 * Refuse, by name, an argument a method no longer takes.
 *
 * The method keeps a rest parameter typed `never[]` so a TypeScript caller that still passes the
 * argument gets a compile error, and a JavaScript caller (which has no types to tell it) is refused
 * here at runtime instead of silently getting a different result: `approvals.pending('acc://alice.acme')`
 * used to list the named identity's approvals and now would list the calling actor's, with no sign that
 * the identity was dropped.
 *
 * @param method - The method as callers write it, e.g. `approvals.pending`.
 * @param passed - The extra arguments the caller passed (the method's `...removed` parameter).
 * @param names - What each extra argument used to be, in position order.
 */
export function refuseRemovedArguments(method: string, passed: readonly unknown[], names: readonly string[]): void {
  for (let i = 0; i < passed.length; i++) {
    if (passed[i] === undefined) continue;
    throw new Error(`${method} no longer accepts ${names[i] ?? `extra argument ${i + 1}`}: the route does not take it`);
  }
}

/**
 * Refuse, by name, a filter/option key the route does not accept. A key outside `accepted` that carries a
 * value would otherwise be dropped on the way to the query string, and the caller would read an unfiltered
 * answer as the filtered one it asked for.
 *
 * @param method - The method as callers write it, e.g. `anchors.list`.
 * @param route - The route as the census names it, e.g. `GET /v4/anchors`.
 * @param options - The filter object the caller passed.
 * @param accepted - Every key the route takes.
 */
export function refuseUnknownOptions(method: string, route: string, options: object, accepted: readonly string[]): void {
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || accepted.includes(key)) continue;
    throw new Error(`${method} does not accept ${key}: ${route} takes ${accepted.length === 0 ? 'no parameters' : accepted.join(', ')}`);
  }
}

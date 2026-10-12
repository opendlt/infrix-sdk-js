/**
 * The three routes a node answers WITHOUT a credential: `GET /v4/health`, `GET /v4/ready` and
 * `GET /v4/openapi.json`.
 *
 * They are bearer-exempt by design (the node's gate lists exactly these three), because a load
 * balancer and an SDK generator reach them before they hold a token. The node's matrix claims of each
 * that it answers without a credential and exposes no more than health, readiness or the API
 * specification. This is the client half of that claim, so it sends NO credential and NO disclosure
 * context: not an Authorization header, not an actor. A client that attached them would keep working
 * against a node whose gate had quietly started to require one, and nothing would show it.
 *
 * It is a standalone client, built from a node URL alone, because the point of these routes is that
 * you do not need an `InfrixClient`, a token or an actor to ask them.
 *
 * Every read refuses an answer that lacks a key it reads, naming it: a status read from a missing
 * key would be a green all-clear, and a caller cannot tell it from a real one.
 */
const ROUTE_HEALTH = 'GET /v4/health';
const ROUTE_READY = 'GET /v4/ready';
const ROUTE_OPENAPI = 'GET /v4/openapi.json';

/** What GET /v4/health answers. */
export interface NodeHealth {
  apiVersion: string;
  status: string;
}

/**
 * What GET /v4/ready answers. A node that is not ready answers 503 with `ready: false` and the
 * subsystems it lacks in `missing`; this is returned, not thrown, because "not ready" is the answer.
 */
export interface NodeReadiness {
  apiVersion: string;
  ready: boolean;
  /** The required subsystems the node lacks. Present when `ready` is false. */
  missing?: string[];
}

/** The members of the OpenAPI 3.1 document GET /v4/openapi.json serves (the document itself, no envelope). */
export interface OpenApiDocument {
  openapi: string;
  info: { title?: string; version?: string; [member: string]: unknown };
  paths: Record<string, Record<string, unknown>>;
  components: Record<string, unknown>;
  [member: string]: unknown;
}

/** Raised when a public route answers something other than what it is for. */
export class PublicRouteError extends Error {
  constructor(
    readonly route: string,
    message: string,
    readonly status?: number
  ) {
    super(`${route}: ${message}`);
    this.name = 'PublicRouteError';
  }
}

type PublicFetch = (url: string, init: { method: string; headers: Record<string, string> }) => Promise<{
  status: number;
  json: () => Promise<unknown>;
}>;

function object(route: string, v: unknown, what: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new PublicRouteError(route, `the answer carries no ${what} object`);
  }
  return v as Record<string, unknown>;
}

function need(route: string, o: Record<string, unknown>, ...keys: string[]): void {
  const missing = keys.filter((k) => !(k in o));
  if (missing.length > 0) {
    throw new PublicRouteError(
      route,
      `the node's answer carries no ${missing.map((k) => `\`${k}\``).join(', ')} (it returned ${Object.keys(o).sort().join(', ') || 'nothing'})`
    );
  }
}

export class PublicRoutesClient {
  private readonly base: string;
  private readonly doFetch: PublicFetch;

  /**
   * @param baseUrl the node's origin, e.g. `https://node.example:8443` (a trailing slash or a
   *   `/v4/jsonrpc` path is dropped: the REST routes live beside the RPC endpoint).
   * @param fetchImpl a fetch to use instead of the global one.
   */
  constructor(baseUrl: string, fetchImpl?: PublicFetch) {
    const u = new URL(baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new PublicRouteError('client', `${baseUrl} must use http or https`);
    }
    this.base = `${u.protocol}//${u.host}`;
    this.doFetch = fetchImpl ?? ((url, init) => (globalThis as unknown as { fetch: PublicFetch }).fetch(url, init));
  }

  /** One credential-free GET: the route's path, no Authorization, no X-Actor / X-Purpose / X-Workflow-Instance. */
  private async get(route: string): Promise<{ status: number; body: unknown }> {
    const path = route.slice(route.indexOf(' ') + 1);
    const res = await this.doFetch(`${this.base}${path}`, { method: 'GET', headers: { Accept: 'application/json' } });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new PublicRouteError(route, `the answer (${res.status}) is not JSON`, res.status);
    }
    return { status: res.status, body };
  }

  /** The node's health: `{ apiVersion, status }`. */
  async health(): Promise<NodeHealth> {
    const { status, body } = await this.get(ROUTE_HEALTH);
    if (status !== 200) throw new PublicRouteError(ROUTE_HEALTH, `answered ${status}, want 200`, status);
    const data = object(ROUTE_HEALTH, object(ROUTE_HEALTH, body, 'envelope')['data'], '`data`');
    need(ROUTE_HEALTH, data, 'apiVersion', 'status');
    return data as unknown as NodeHealth;
  }

  /**
   * Whether the node is ready to serve. A node that is not ready answers 503 with the list of what it
   * lacks, and that is RETURNED (`ready: false`, `missing`): it is the answer, and a probe must be able
   * to read it. Any other status is an error.
   */
  async ready(): Promise<NodeReadiness> {
    const { status, body } = await this.get(ROUTE_READY);
    if (status !== 200 && status !== 503) throw new PublicRouteError(ROUTE_READY, `answered ${status}, want 200 or 503`, status);
    const data = object(ROUTE_READY, object(ROUTE_READY, body, 'envelope')['data'], '`data`');
    need(ROUTE_READY, data, 'ready', 'apiVersion');
    if (typeof data['ready'] !== 'boolean') {
      throw new PublicRouteError(ROUTE_READY, 'the answer carries a `ready` that is not a boolean');
    }
    if (status === 503 && data['ready'] !== false) {
      throw new PublicRouteError(ROUTE_READY, 'answered 503 yet says it is ready');
    }
    return data as unknown as NodeReadiness;
  }

  /** The OpenAPI 3.1 document the node serves about itself (the document, not an envelope). */
  async openapi(): Promise<OpenApiDocument> {
    const { status, body } = await this.get(ROUTE_OPENAPI);
    if (status !== 200) throw new PublicRouteError(ROUTE_OPENAPI, `answered ${status}, want 200`, status);
    const doc = object(ROUTE_OPENAPI, body, 'document');
    if ('data' in doc) {
      throw new PublicRouteError(ROUTE_OPENAPI, 'the answer is wrapped in an envelope; the route serves the document itself');
    }
    need(ROUTE_OPENAPI, doc, 'openapi', 'info', 'paths', 'components');
    return doc as OpenApiDocument;
  }
}

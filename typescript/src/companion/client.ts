/**
 * Zero-Context Local Companion client (nextux-10).
 *
 * A thin, typed client over the LOCAL companion server's read-only endpoints
 * (/v1/companion/*). The companion runs on localhost only; this client talks to
 * it and never to any third party. It can only READ context + suggestions and
 * RESOLVE a safe route to open — it never runs a command.
 */

import type { CompanionContext, CompanionArtifact, CompanionSuggestion } from './context.js';

export type CompanionFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface InfrixCompanionClientOptions {
  /** The companion server base URL, e.g. http://127.0.0.1:8765. */
  baseUrl: string;
  /** Override fetch (for tests / custom transports). */
  fetchImpl?: CompanionFetch;
}

export class InfrixCompanionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'InfrixCompanionError';
    this.status = status;
  }
}

export class InfrixCompanionClient {
  private base: string;
  private fetchImpl: CompanionFetch;

  constructor(opts: InfrixCompanionClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '');
    const f = opts.fetchImpl ?? (globalThis.fetch as unknown as CompanionFetch);
    if (!f) throw new Error('InfrixCompanionClient: no fetch implementation available');
    this.fetchImpl = f;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(this.base + path);
    if (!res.ok) throw new InfrixCompanionError(`companion ${path} returned ${res.status}`, res.status);
    return (await res.json()) as T;
  }

  /** Get the full safe workspace context (metadata only — no file contents). */
  async context(): Promise<CompanionContext> {
    return this.get<CompanionContext>('/v1/companion/context');
  }

  /** List the recent workspace artifacts (safe metadata). */
  async recentArtifacts(): Promise<CompanionArtifact[]> {
    const r = await this.get<{ artifacts: CompanionArtifact[] }>('/v1/companion/artifacts');
    return r.artifacts ?? [];
  }

  /** Get the next-best-action suggestions. */
  async suggestions(): Promise<CompanionSuggestion[]> {
    const r = await this.get<{ suggestions: CompanionSuggestion[] }>('/v1/companion/suggestions');
    return r.suggestions ?? [];
  }

  /** Resolve a safe Nexus route to open (the server sanitizes it; it opens
   *  nothing and runs no command). */
  async open(route: string): Promise<{ route: string; url: string }> {
    const res = await this.fetchImpl(this.base + '/v1/companion/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route }),
    });
    if (!res.ok) throw new InfrixCompanionError(`companion open returned ${res.status}`, res.status);
    return (await res.json()) as { route: string; url: string };
  }
}

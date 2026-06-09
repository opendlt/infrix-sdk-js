/**
 * Task Template Marketplace — SDK client (nextux-04).
 *
 * A thin, dependency-free client over a loaded catalog fixture: list, search,
 * get, and inspect templates the same way the CLI does. Load the fixture however
 * your environment prefers (bundle the shipped templates.fixture.json, or fetch
 * it from a server) and construct a client.
 */

import type { CatalogFixture, InputsSchema, TaskTemplate, TrustState } from './templates';
import { isTrusted } from './templates';

export class InfrixTasksClient {
  constructor(private readonly fx: CatalogFixture) {
    if (!fx || !Array.isArray(fx.templates)) {
      throw new Error('InfrixTasksClient: invalid catalog fixture');
    }
  }

  /** list returns every template in the catalog. */
  list(): TaskTemplate[] {
    return this.fx.templates;
  }

  /** search returns templates whose id/title/summary/category match the query. */
  search(query: string): TaskTemplate[] {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return this.list();
    return this.fx.templates.filter((t) =>
      `${t.id} ${t.title} ${t.summary} ${t.category}`.toLowerCase().includes(q),
    );
  }

  /** get returns one template by id. */
  get(id: string): TaskTemplate | undefined {
    return this.fx.templates.find((t) => t.id === id);
  }

  /** trustOf returns a template's evaluated trust state. */
  trustOf(id: string): TrustState | undefined {
    return this.get(id)?.trust;
  }

  /** trusted reports whether a template may run by default. */
  trusted(id: string): boolean {
    const t = this.get(id);
    return !!t && isTrusted(t.trust);
  }

  /** inputsSchemaOf returns a template's inputs schema (if any). */
  inputsSchemaOf(id: string): InputsSchema | undefined {
    return this.get(id)?.inputsSchema;
  }
}

/** createTasksClient builds a client from a loaded catalog fixture. */
export function createTasksClient(fx: CatalogFixture): InfrixTasksClient {
  return new InfrixTasksClient(fx);
}

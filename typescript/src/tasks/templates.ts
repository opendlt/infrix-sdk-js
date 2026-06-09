/**
 * Task Template Marketplace — SDK types (nextux-04).
 *
 * The TypeScript twin of pkg/tasks. These types describe the Go-generated
 * catalog fixture (src/tasks/templates.fixture.json). An AI agent or app can
 * query the same registry the CLI uses: discover tasks, inspect input schemas,
 * check trust, and read the ordered agent actions a task runs — all from
 * structured data, with no proof logic of its own.
 */

export type TrustState =
  | 'official_verified'
  | 'publisher_verified'
  | 'local_unsigned'
  | 'remote_unsigned'
  | 'tampered'
  | 'revoked'
  | 'unknown';

/** isTrusted reports whether a trust state permits a default (non-forced) run. */
export function isTrusted(t: TrustState): boolean {
  return t === 'official_verified' || t === 'publisher_verified';
}

/** One task step: the existing agent action it invokes. */
export interface FixtureAction {
  id: string;
  uses: string;
}

/** A JSON-Schema-lite inputs description (mirrors agentapi.Schema). */
export interface InputsSchema {
  type: string;
  description?: string;
  properties?: Record<string, { type?: string; description?: string; enum?: string[] }>;
  required?: string[];
}

/** The catalog view of one task template. */
export interface TaskTemplate {
  id: string;
  title: string;
  summary: string;
  category: string;
  publisher: string;
  trust: TrustState;
  defaultNetwork: string;
  networks: string[];
  outputs: string[];
  actions: FixtureAction[];
  inputsSchema?: InputsSchema;
}

/** The whole task catalog (the Go-generated fixture shape). */
export interface CatalogFixture {
  version: number;
  templates: TaskTemplate[];
}

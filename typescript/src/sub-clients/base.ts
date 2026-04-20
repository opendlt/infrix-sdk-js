/**
 * Base class for governance sub-clients. Provides shared RPC + REST access.
 *
 * `rpc(method, params)` — JSON-RPC 2.0 against `${baseUrl}/rpc`.
 * `rest<T>(method, path, body?)` — REST against `${baseUrl}${path}`. Used for
 *   /v4/* endpoints whose semantics (read-only contract simulate, governance
 *   metadata envelopes) are REST-native and have no JSON-RPC counterpart.
 *
 * Every sub-client receives both injectors uniformly — sub-clients that do
 * not currently use REST still receive `rest` so future migrations require
 * no plumbing changes.
 */
export type RestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export abstract class SubClient {
  constructor(
    protected readonly rpc: <T>(
      method: string,
      params: Record<string, unknown>
    ) => Promise<T>,
    protected readonly rest: <T>(
      method: RestMethod,
      path: string,
      body?: unknown
    ) => Promise<T>
  ) {}
}

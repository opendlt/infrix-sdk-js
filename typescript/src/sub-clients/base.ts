/**
 * Base class for governance sub-clients. Provides shared RPC access.
 */
export abstract class SubClient {
  constructor(
    protected readonly rpc: <T>(
      method: string,
      params: Record<string, unknown>
    ) => Promise<T>
  ) {}
}

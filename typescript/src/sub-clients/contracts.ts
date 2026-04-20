import { SubClient } from './base';
import type {
  QueryResult,
  CallResult,
  ContractInfo,
  ContractSchema,
} from '../types/contract';

/**
 * ContractSubClient exposes read-only contract inspection and simulation
 * RPCs. All state-changing contract operations (deploy, call, upgrade)
 * are governance-routed and must be submitted as intents via
 * `client.intents.submit(...)` with a goal of `CONTRACT_DEPLOY`,
 * `CONTRACT_CALL`, or `CONTRACT_UPGRADE`. There is no low-level mutation
 * path on this sub-client.
 *
 * Transports:
 *   - query / inspect / schema → JSON-RPC (registered in
 *     pkg/devnet/rpc_handler.go: contract.query / contract.inspect /
 *     contract.schema). Read-only and gated.
 *   - simulate → REST POST /v4/contracts/{addr}/simulate
 *     (pkg/api/v4/rest/contracts.go::handleSimulate). The simulate
 *     endpoint is REST-native; it carries the V4 governance-metadata
 *     envelope that the JSON-RPC dispatcher does not produce.
 */
export class ContractSubClient extends SubClient {
  /** Execute a read-only query on a contract (no state change). */
  async query(
    url: string,
    fn: string,
    args: unknown[] = []
  ): Promise<QueryResult> {
    return this.rpc<QueryResult>('contract.query', {
      url,
      function: fn,
      args,
    });
  }

  /**
   * Simulate a call without committing state. Used for gas estimation
   * and preview; does not emit evidence or mutate state.
   *
   * Routed through REST POST /v4/contracts/{addr}/simulate to match the
   * server-side handler at pkg/api/v4/rest/contracts.go:51. The legacy
   * JSON-RPC `contract.simulate` method was never registered server-side
   * and would have returned method-not-found at runtime.
   */
  async simulate(
    url: string,
    fn: string,
    args: unknown[] = [],
    opts?: { gasLimit?: number }
  ): Promise<CallResult> {
    return this.rest<CallResult>(
      'POST',
      `/v4/contracts/${encodeURIComponent(url)}/simulate`,
      {
        function: fn,
        arguments: args,
        gasLimit: opts?.gasLimit ?? 500000,
      }
    );
  }

  /** Get contract metadata. */
  async inspect(url: string): Promise<ContractInfo> {
    return this.rpc<ContractInfo>('contract.inspect', { url });
  }

  /** Get the contract's ABI/schema. */
  async schema(url: string): Promise<ContractSchema | null> {
    const result = await this.rpc<{ schema: ContractSchema | null }>(
      'contract.schema',
      { url }
    );
    return result.schema;
  }
}

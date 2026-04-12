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
   */
  async simulate(
    url: string,
    fn: string,
    args: unknown[] = [],
    opts?: { gasLimit?: number }
  ): Promise<CallResult> {
    return this.rpc<CallResult>('contract.simulate', {
      url,
      function: fn,
      args,
      gasLimit: opts?.gasLimit ?? 500000,
    });
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

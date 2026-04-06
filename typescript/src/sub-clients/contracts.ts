import { SubClient } from './base';
import type {
  DeployResult,
  CallResult,
  QueryResult,
  UpgradeResult,
  ContractInfo,
  BatchCallRequest,
  BatchCallResult,
  ContractSchema,
} from '../types/contract';

/**
 * ContractSubClient provides low-level contract operations.
 *
 * NOTE: For most operations, prefer the governance sub-clients (intents,
 * objects, policies, etc.) which route through the intent pipeline with
 * full policy evaluation, approval, and evidence generation.
 *
 * Direct contract calls bypass governance entirely. Use this only when
 * you need raw, ungoverned access to contract functions.
 */
export class ContractSubClient extends SubClient {
  /** Deploy a contract from hex-encoded WASM bytecode. */
  async deploy(
    url: string,
    bytecodeHex: string,
    opts?: { gasLimit?: number }
  ): Promise<DeployResult> {
    return this.rpc<DeployResult>('contract.deploy', {
      url,
      bytecode: bytecodeHex,
      gasLimit: opts?.gasLimit ?? 500000,
    });
  }

  /** Execute a state-changing function on a deployed contract. */
  async call(
    url: string,
    fn: string,
    args: unknown[] = [],
    opts?: { gasLimit?: number }
  ): Promise<CallResult> {
    return this.rpc<CallResult>('contract.call', {
      url,
      function: fn,
      args,
      gasLimit: opts?.gasLimit ?? 500000,
    });
  }

  /** Execute a read-only query. */
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

  /** Upgrade a contract's bytecode. */
  async upgrade(url: string, bytecodeHex: string): Promise<UpgradeResult> {
    return this.rpc<UpgradeResult>('contract.upgrade', {
      url,
      bytecode: bytecodeHex,
    });
  }

  /** Get contract metadata. */
  async inspect(url: string): Promise<ContractInfo> {
    return this.rpc<ContractInfo>('contract.inspect', { url });
  }

  /** Simulate a contract call without state changes. */
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

  /** Execute multiple contract calls in parallel. */
  async callBatch(calls: BatchCallRequest[]): Promise<BatchCallResult[]> {
    const normalized = calls.map((c) => ({
      url: c.url,
      function: c.function,
      args: c.args ?? [],
      gasLimit: c.gasLimit ?? 500000,
    }));
    const result = await this.rpc<{ results: BatchCallResult[] }>(
      'contract.callBatch',
      { calls: normalized }
    );
    return result.results;
  }

  /** Get contract schema. */
  async schema(url: string): Promise<ContractSchema | null> {
    const result = await this.rpc<{ schema: ContractSchema | null }>(
      'contract.schema',
      { url }
    );
    return result.schema;
  }
}

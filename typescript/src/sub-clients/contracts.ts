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
   *
   * `caller` is REQUIRED: a simulation predicts what happens when a particular
   * actor calls the contract, and the node refuses one that names none (it used
   * to run as the contract calling ITSELF).
   *
   * `args` are the call's PRE-ENCODED argument bytes — a Uint8Array or a hex
   * string. The REST body field is hex, and the SDK defines no ABI encoding of
   * its own, so an array of values is refused here instead of being sent as a
   * body the node cannot decode.
   */
  async simulate(
    url: string,
    fn: string,
    opts: { caller: string; args?: Uint8Array | string; gasLimit?: number }
  ): Promise<CallResult> {
    if (!opts || typeof opts.caller !== 'string' || opts.caller === '') {
      throw new Error(
        'simulate: caller is required — a simulation predicts what happens when a particular actor calls the contract'
      );
    }
    if (opts.args !== undefined && typeof opts.args !== 'string' && !(opts.args instanceof Uint8Array)) {
      throw new Error(
        'simulate: args must be pre-encoded bytes (a Uint8Array or a hex string); an array of values has no defined encoding'
      );
    }
    return this.rest<CallResult>(
      'POST',
      `/v4/contracts/${encodeURIComponent(url)}/simulate`,
      {
        function: fn,
        arguments: argsToHex(opts.args),
        caller: opts.caller,
        gasLimit: opts.gasLimit ?? 500000,
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

/** argsToHex normalizes pre-encoded call arguments to the bare hex the REST body carries. */
function argsToHex(args: Uint8Array | string | undefined): string {
  if (args === undefined) return '';
  if (typeof args === 'string') {
    const h = args.startsWith('0x') ? args.slice(2) : args;
    if (h.length % 2 !== 0 || /[^0-9a-fA-F]/.test(h)) {
      throw new Error('simulate: args string must be valid hex');
    }
    return h.toLowerCase();
  }
  let out = '';
  for (let i = 0; i < args.length; i++) out += args[i].toString(16).padStart(2, '0');
  return out;
}

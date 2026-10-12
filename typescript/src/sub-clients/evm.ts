import { SubClient } from './base';
import type { IntentResult } from '../types/governance';

/**
 * EvmSubClient — the governed Solidity/EVM deploy door (DX P6-5).
 *
 * Bring your existing Solidity contract to Infrix: compile it to EVM bytecode
 * (`solc --bin`) and deploy it here. Unlike a raw chain, there is no
 * `sendRawTransaction` bypass — `deploy()` and `call()` wrap your bytecode /
 * calldata as a GOVERNED intent (`EVM_DEPLOY` / `EVM_CALL`) and submit it
 * through the same spine as every other goal (policy → approval → execution →
 * evidence → anchor), producing a portable proof. The raw payload is preserved
 * as the `raw_tx_wrapped_as_intent` evidence link.
 *
 * State-changing EVM operations are governance-routed by construction; this
 * sub-client is the supported low-level door, not a bypass of it.
 *
 * @example
 * ```typescript
 * // hex from `solc --bin ERC20.sol` is CREATION bytecode: say so with `creation`
 * const deployed = await client.evm.deploy(erc20Bytecode, {
 *   authority: 'acc://myco.acme',
 *   creation: true,
 * });
 * // balanceOf(address) selector + padded address
 * const res = await client.evm.call(deployed.intentId, '0x70a08231...');
 * ```
 */
export class EvmSubClient extends SubClient {
  /**
   * Deploy EVM bytecode through the governed `EVM_DEPLOY` intent.
   *
   * What `bytecode` IS is stated by `opts.creation`, never guessed:
   *
   * - `creation: true` - `bytecode` is INIT CODE (the `solc --bin` creation
   *   bytecode). The node runs it with the deployer as the constructor's
   *   caller, appends `constructorArgs`, and installs only the runtime the
   *   constructor returns. The deploy fails if the constructor reverts, faults
   *   or returns no code.
   * - `creation` omitted or `false` (the default) - `bytecode` is the contract's
   *   RUNTIME bytecode. It is installed verbatim and no constructor runs, so
   *   passing a `solc --bin` file this way installs the constructor code itself,
   *   not your contract.
   *
   * @param bytecode - EVM bytecode as a hex string (with or without 0x) or a
   *   Uint8Array: init code with `creation: true`, runtime code otherwise.
   * @param opts.authority - The deploying authority ADI URL (e.g.
   *   `acc://myco.acme`). Required.
   * @param opts.creation - Run `bytecode` as init code and install the runtime
   *   it returns. Must be a boolean; defaults to `false`.
   * @param opts.constructorArgs - ABI-encoded constructor arguments appended to
   *   the init code (hex string or Uint8Array). Only valid with
   *   `creation: true`; given without it the call throws before any request.
   * @returns IntentResult (intentId + status). If approval is required the
   *   status reflects that; approve via `client.approvals`.
   */
  async deploy(
    bytecode: string | Uint8Array,
    opts: { authority: string; creation?: boolean; constructorArgs?: string | Uint8Array }
  ): Promise<IntentResult> {
    if (!opts?.authority) {
      throw new Error('evm.deploy: opts.authority (deploying ADI URL) is required');
    }
    if (opts.creation !== undefined && typeof opts.creation !== 'boolean') {
      throw new Error('evm.deploy: opts.creation must be a boolean (true runs the bytecode as init code)');
    }
    if (opts.constructorArgs !== undefined && opts.creation !== true) {
      throw new Error(
        'evm.deploy: opts.constructorArgs needs opts.creation: true - without it the bytecode is installed verbatim as the runtime and no constructor runs'
      );
    }
    const customParams: Record<string, unknown> = {
      authority: opts.authority,
      bytecode: toHex(bytecode),
    };
    if (opts.creation !== undefined) {
      customParams.creation = opts.creation;
    }
    const ctorArgs = opts.constructorArgs === undefined ? '' : toHex(opts.constructorArgs);
    if (ctorArgs !== '') {
      customParams.constructorArgs = ctorArgs;
    }
    return this.rpc<IntentResult>('intent.submit', {
      goalType: 'EVM_DEPLOY',
      customParams,
    });
  }

  /**
   * Call a deployed EVM contract through the governed `EVM_CALL` intent.
   *
   * @param contract - The deployed contract URL (e.g. `acc://myco.acme/evm-<addr>`).
   * @param calldata - Raw EVM calldata (`selector || args`) as a hex string or
   *   Uint8Array.
   * @param opts.value - Optional value to send (hex, uint256 big-endian).
   */
  async call(
    contract: string,
    calldata: string | Uint8Array,
    opts?: { value?: string | Uint8Array }
  ): Promise<IntentResult> {
    const customParams: Record<string, unknown> = {
      contract,
      calldata: toHex(calldata),
    };
    if (opts?.value !== undefined) {
      customParams.value = toHex(opts.value);
    }
    return this.rpc<IntentResult>('intent.submit', {
      goalType: 'EVM_CALL',
      customParams,
    });
  }
}

/** toHex normalizes bytecode/calldata to a bare lowercase hex string. */
function toHex(v: string | Uint8Array): string {
  if (typeof v === 'string') {
    const s = v.trim().replace(/^0x/i, '');
    return s.toLowerCase();
  }
  let out = '';
  for (const b of v) out += b.toString(16).padStart(2, '0');
  return out;
}

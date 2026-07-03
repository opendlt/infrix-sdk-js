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
 * // hex from `solc --bin ERC20.sol`
 * const deployed = await client.evm.deploy(erc20Bytecode, { authority: 'acc://myco.acme' });
 * // balanceOf(address) selector + padded address
 * const res = await client.evm.call(deployed.intentId, '0x70a08231...');
 * ```
 */
export class EvmSubClient extends SubClient {
  /**
   * Deploy EVM bytecode through the governed `EVM_DEPLOY` intent.
   *
   * @param bytecode - EVM creation bytecode as a hex string (with or without
   *   0x) or a Uint8Array. This is the `solc --bin` output.
   * @param opts.authority - The deploying authority ADI URL (e.g.
   *   `acc://myco.acme`). Required.
   * @returns IntentResult (intentId + status). If approval is required the
   *   status reflects that; approve via `client.approvals`.
   */
  async deploy(
    bytecode: string | Uint8Array,
    opts: { authority: string }
  ): Promise<IntentResult> {
    if (!opts?.authority) {
      throw new Error('evm.deploy: opts.authority (deploying ADI URL) is required');
    }
    return this.rpc<IntentResult>('intent.submit', {
      goalType: 'EVM_DEPLOY',
      customParams: {
        authority: opts.authority,
        bytecode: toHex(bytecode),
      },
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

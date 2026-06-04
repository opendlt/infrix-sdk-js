import { SubClient } from './base';

/**
 * MetaMask -> Accumulate intent signing (direction-hardening #1).
 *
 * A holder of an ordinary MetaMask (secp256k1) key signs an Infrix intent
 * as EIP-712 typed data — no new wallet, no seed phrase, no Accumulate
 * knowledge. The flow is two calls:
 *
 *   1. `prepare(req)` -> the EIP-712 typed-data the wallet signs
 *      (`eth_signTypedData_v4`).
 *   2. `submit(req + signature)` -> Infrix verifies the wallet signature
 *      AND that the signing eth address is an active key on the signer's
 *      ADI key page, then admits the intent.
 *
 * The Infrix node carries this on Accumulate's real EIP-712 machinery —
 * the intent is a WriteData transaction and the signature is the
 * canonical Accumulate TypedDataSignature.
 */
export interface EIP712IntentRequest {
  goalType: string;
  customType?: string;
  customParams?: Record<string, unknown>;
  sourceAssets?: AssetAmount[];
  targetAssets?: AssetAmount[];
  /** Accumulate key page URL, e.g. acc://alice.acme/book/1. */
  signer: string;
  signerVersion: number;
  /**
   * The signer's secp256k1 public key, hex (0x-optional, 33-byte
   * compressed or 65-byte uncompressed). MetaMask exposes the address,
   * not the public key, so the dApp recovers it once (e.g. ecrecover of a
   * one-time personal_sign) and supplies it here — the Accumulate EIP-712
   * message embeds the public key.
   */
  publicKey: string;
  /** Signature nonce (non-zero); typically Date.now(). */
  timestamp: number;
  memo?: string;
  /** Overrides the node default EIP-712 domain network. */
  networkName?: string;
  /** Explicit chain id (decimal/hex); overrides networkName. */
  chainId?: string;
}

export interface AssetAmount {
  asset: string;
  amount?: string;
  amountDecimal?: string;
  isMinimum?: boolean;
  isMaximum?: boolean;
}

/** Result of POST /v4/intents/eip712/prepare. */
export interface PreparedEIP712Intent {
  /** The EIP-712 message to pass verbatim to eth_signTypedData_v4. */
  typedData: unknown;
  /** Accumulate transaction hash (hex). */
  transactionHash: string;
  /** EIP-712 domain chain id used (decimal). */
  chainId: string;
}

/** Result of POST /v4/intents/eip712/submit. */
export interface SubmittedEIP712Intent {
  /** The ADI the intent was admitted under (e.g. acc://alice.acme). */
  actor: string;
  /** 0x-prefixed eth address of the signing key. */
  ethAddress: string;
  /** The admitted intent result (intent/plan/evidence projection). */
  result: unknown;
}

/** Minimal EIP-1193 provider shape (window.ethereum). */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

/**
 * EIP712SubClient exposes the MetaMask intent-signing bridge.
 *
 * `signAndSubmitWithMetaMask` is the one-call browser convenience: it
 * prepares the typed data, asks MetaMask to sign it, and submits the
 * signed intent. The caller must still supply `publicKey` (recovered from
 * the user's key out-of-band) and the signing `address`.
 */
export class EIP712SubClient extends SubClient {
  /** Build the EIP-712 typed data a wallet signs for this intent. */
  async prepare(req: EIP712IntentRequest): Promise<PreparedEIP712Intent> {
    return this.rest<PreparedEIP712Intent>('POST', '/v4/intents/eip712/prepare', req);
  }

  /** Submit a MetaMask-signed intent (signature is 0x-hex, 65-byte RSV). */
  async submit(
    req: EIP712IntentRequest & { signature: string }
  ): Promise<SubmittedEIP712Intent> {
    return this.rest<SubmittedEIP712Intent>('POST', '/v4/intents/eip712/submit', req);
  }

  /**
   * Browser convenience: prepare -> eth_signTypedData_v4 -> submit.
   *
   * @param req      the intent (must include the recovered publicKey)
   * @param provider window.ethereum (or any EIP-1193 provider)
   * @param address  the signing account address (0x...)
   */
  async signAndSubmitWithMetaMask(
    req: EIP712IntentRequest,
    provider: Eip1193Provider,
    address: string
  ): Promise<SubmittedEIP712Intent> {
    const prepared = await this.prepare(req);
    const signature = (await provider.request({
      method: 'eth_signTypedData_v4',
      params: [address, JSON.stringify(prepared.typedData)],
    })) as string;
    return this.submit({ ...req, signature });
  }
}

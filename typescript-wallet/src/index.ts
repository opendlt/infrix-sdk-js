/**
 * @infrix/wallet — ADI-native smart wallet SDK for the Infrix platform.
 *
 * @example
 * ```typescript
 * import { InfrixWallet, InfrixProvider } from '@infrix/wallet';
 *
 * // Direct usage
 * const wallet = new InfrixWallet('acc://alice.acme');
 * await wallet.generateKey();
 * await wallet.call('acc://game.acme/counter', 'increment');
 *
 * // Browser extension bridge
 * if (InfrixProvider.isAvailable()) {
 *   const wallet = await InfrixProvider.connect();
 *   console.log(wallet.adi); // "acc://alice.acme"
 * }
 * ```
 */

// Core wallet
export { InfrixWallet } from './wallet';
export type {
  WalletOptions,
  Transaction,
  SignedTransaction,
  CallReceipt,
  DeployReceipt,
  QueryResult,
  RecoveryRequest,
  SponsorConfig,
} from './wallet';

// Key store
export { MemoryKeyStore } from './keystore';
export type { KeyStore, KeyInfo } from './keystore';

// Session keys
export { SessionManager } from './session';
export type { SessionScope, SessionKey } from './session';

// Governance types (re-exported from wallet governance types)
export type {
  IntentGoal,
  IntentResult,
  IntentSubmitOptions,
  ApprovalEnvelope,
  OutcomeRecord,
  EvidenceBundle,
} from './governance-types';

// Crypto
export { generateEd25519KeyPair, signEd25519, verifyEd25519, sha256, toHex, fromHex } from './crypto';
export type { Ed25519KeyPair } from './crypto';

// ---- Browser Extension Bridge ----

/** Event handler type for provider events. */
type ProviderEventHandler = (...args: unknown[]) => void;

/**
 * InfrixProvider bridges dApps to the Infrix browser extension wallet.
 *
 * In a browser with the extension installed, `window.infrix` is injected
 * by the content script. This class provides a typed API over it.
 *
 * @example
 * ```typescript
 * if (InfrixProvider.isAvailable()) {
 *   const wallet = await InfrixProvider.connect();
 *   console.log(`Connected: ${wallet.adi}`);
 * }
 * ```
 */
export class InfrixProvider {
  private static handlers = new Map<string, ProviderEventHandler[]>();

  /** Check if the Infrix wallet extension is installed. */
  static isAvailable(): boolean {
    return typeof window !== 'undefined' && !!(window as any).infrix;
  }

  /**
   * Connect to the browser extension and return a wallet instance.
   * Prompts the user to approve the connection if not already granted.
   */
  static async connect(): Promise<import('./wallet').InfrixWallet> {
    if (!InfrixProvider.isAvailable()) {
      throw new Error('Infrix wallet extension is not installed');
    }

    const provider = (window as any).infrix;
    const account = await provider.connect();

    const { InfrixWallet } = await import('./wallet');
    return new InfrixWallet(account.adi, {
      rpcUrl: account.rpcUrl || 'http://localhost:8080/rpc',
    });
  }

  /** Register an event handler. */
  static on(event: 'accountChanged' | 'disconnect', handler: ProviderEventHandler): void {
    const existing = InfrixProvider.handlers.get(event) || [];
    existing.push(handler);
    InfrixProvider.handlers.set(event, existing);

    // Wire to the extension if available.
    if (InfrixProvider.isAvailable()) {
      (window as any).infrix.on(event, handler);
    }
  }

  /** Remove an event handler. */
  static off(event: string, handler: ProviderEventHandler): void {
    const existing = InfrixProvider.handlers.get(event) || [];
    InfrixProvider.handlers.set(event, existing.filter(h => h !== handler));
  }
}

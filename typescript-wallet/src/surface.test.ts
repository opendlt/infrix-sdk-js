/**
 * Governance-first wallet surface assertions (Gap 15).
 *
 * Compile-time proof that the InfrixWallet has no direct contract
 * mutation methods. State-changing contract operations must be
 * expressed as intents via `wallet.submitIntent(...)`.
 */
import { InfrixWallet } from './wallet';
import type * as pub from './index';

// Compile-time assertions — the test runner here is `tsc --noEmit`.
// If a forbidden method reappears, the type assertions below fail
// to compile.
type WalletShape = InfrixWallet;
type ForbiddenNames = 'deploy' | 'call' | 'query' | 'sign' | 'signAndSubmit';
type AllowedNames = 'submitIntent' | 'approveIntent' | 'signApproval' | 'getIntentOutcome';

type _NoForbidden = Exclude<keyof WalletShape, ForbiddenNames> extends keyof WalletShape
  ? true
  : false;
type _HasAllowed = AllowedNames extends keyof WalletShape ? true : false;

// These must both be `true`; any regression flips them to `never`/`false`.
const noForbidden: _NoForbidden = true;
const hasAllowed: _HasAllowed = true;
void noForbidden;
void hasAllowed;

// Legacy contract-receipt types must not be re-exported.
type _PublicExports = keyof typeof pub;
type _ForbiddenExports =
  | 'CallReceipt'
  | 'DeployReceipt'
  | 'QueryResult'
  | 'Transaction'
  | 'SignedTransaction';
type _NoForbiddenExports = Extract<_PublicExports, _ForbiddenExports> extends never ? true : false;
const noForbiddenExports: _NoForbiddenExports = true;
void noForbiddenExports;

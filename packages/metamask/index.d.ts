// Type declarations for @infrix/metamask (adoption-10).

export type MetaMaskErrorCodeValue =
  | 'METAMASK_PROVIDER_MISSING'
  | 'METAMASK_USER_REJECTED'
  | 'METAMASK_PUBLIC_KEY_RECOVERY_FAILED'
  | 'METAMASK_ADDRESS_MISMATCH'
  | 'METAMASK_TYPED_DATA_UNSUPPORTED'
  | 'METAMASK_KEY_PAGE_BINDING_FAILED'
  | 'METAMASK_CHALLENGE_INVALID';

export const MetaMaskErrorCode: {
  ProviderMissing: 'METAMASK_PROVIDER_MISSING';
  UserRejected: 'METAMASK_USER_REJECTED';
  RecoveryFailed: 'METAMASK_PUBLIC_KEY_RECOVERY_FAILED';
  AddressMismatch: 'METAMASK_ADDRESS_MISMATCH';
  TypedDataUnsupported: 'METAMASK_TYPED_DATA_UNSUPPORTED';
  KeyPageBindingFailed: 'METAMASK_KEY_PAGE_BINDING_FAILED';
  ChallengeInvalid: 'METAMASK_CHALLENGE_INVALID';
};

export interface UserErrorFix {
  label: string;
  command?: string;
  safeToRun: boolean;
}

export class InfrixMetaMaskError extends Error {
  readonly code: MetaMaskErrorCodeValue;
  readonly title: string;
  readonly fixes: UserErrorFix[];
  readonly docs?: string;
  readonly retryable: boolean;
  constructor(code: MetaMaskErrorCodeValue, message?: string, opts?: { cause?: unknown });
}

export interface ProviderStatus {
  present: boolean;
  isMetaMask: boolean;
  supportsTypedDataV4: boolean;
  ready: boolean;
}

export interface BindingChallenge {
  purpose: string;
  domain: string;
  signer: string;
  address: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  isMetaMask?: boolean;
}

export interface MetaMaskApp {
  connect(provider?: Eip1193Provider): Promise<{ provider: Eip1193Provider; address: string }>;
  submitGovernedIntent(params: Record<string, unknown>): Promise<Record<string, unknown>>;
  recoverPublicKey(params: Record<string, unknown>): Promise<Record<string, unknown>>;
  providerStatus(provider?: Eip1193Provider): ProviderStatus;
  translateError(err: unknown): InfrixMetaMaskError;
  buildChallenge(params?: Partial<BindingChallenge> & { nowMs?: number; ttlMs?: number }): BindingChallenge;
  assertChallengeFresh(challenge: BindingChallenge, nowMs?: number): void;
}

export interface CreateInfrixMetaMaskOptions {
  endpoint?: string;
  client?: unknown;
  api?: unknown;
}

export function createInfrixMetaMask(options?: CreateInfrixMetaMaskOptions): MetaMaskApp;
export function translateError(err: unknown): InfrixMetaMaskError;
export function providerStatus(provider?: Eip1193Provider): ProviderStatus;
export function buildChallenge(params?: Partial<BindingChallenge> & { nowMs?: number; ttlMs?: number }): BindingChallenge;
export function assertChallengeFresh(challenge: BindingChallenge, nowMs?: number): void;

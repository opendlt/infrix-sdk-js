/**
 * Typed errors for the MetaMask governed-intent path.
 *
 * Every failure mode the consumer-grade helper can hit is an explicit class so
 * a dApp can branch on `err.code` (or `instanceof`) instead of string-matching.
 */

export type MetaMaskErrorCode =
  | 'MetaMaskProviderMissing'
  | 'MetaMaskUserRejected'
  | 'MetaMaskPublicKeyRecoveryFailed'
  | 'MetaMaskAddressMismatch'
  | 'MetaMaskKeyPageNotVerified'
  | 'MetaMaskIntentRejected'
  | 'MetaMaskProofUnavailable'
  | 'MetaMaskChallengeInvalid';

/** Base class for every MetaMask-path error. */
export class MetaMaskError extends Error {
  readonly code: MetaMaskErrorCode;
  readonly cause?: unknown;
  constructor(code: MetaMaskErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = code;
    this.code = code;
    this.cause = cause;
  }
}

/** No EIP-1193 provider (window.ethereum / MetaMask) is available. */
export class MetaMaskProviderMissing extends MetaMaskError {
  constructor(message = 'no EIP-1193 provider found (is MetaMask installed/connected?)', cause?: unknown) {
    super('MetaMaskProviderMissing', message, cause);
  }
}

/** The user rejected a MetaMask prompt (connect / sign). */
export class MetaMaskUserRejected extends MetaMaskError {
  constructor(message = 'the user rejected the MetaMask request', cause?: unknown) {
    super('MetaMaskUserRejected', message, cause);
  }
}

/** secp256k1 public-key recovery from the personal_sign challenge failed. */
export class MetaMaskPublicKeyRecoveryFailed extends MetaMaskError {
  constructor(message = 'could not recover the secp256k1 public key from the signature', cause?: unknown) {
    super('MetaMaskPublicKeyRecoveryFailed', message, cause);
  }
}

/** The recovered key's address does not match the MetaMask account. */
export class MetaMaskAddressMismatch extends MetaMaskError {
  constructor(message = 'the recovered public key does not match the MetaMask address', cause?: unknown) {
    super('MetaMaskAddressMismatch', message, cause);
  }
}

/** The node could not verify the signer against an Accumulate L0 key page. */
export class MetaMaskKeyPageNotVerified extends MetaMaskError {
  constructor(message = 'the signing key is not an authorized entry on the Accumulate L0 key page', cause?: unknown) {
    super('MetaMaskKeyPageNotVerified', message, cause);
  }
}

/** The node rejected the intent (policy / validation / signature). */
export class MetaMaskIntentRejected extends MetaMaskError {
  constructor(message = 'the node rejected the intent', cause?: unknown) {
    super('MetaMaskIntentRejected', message, cause);
  }
}

/** Proof export was requested but no proof is available. */
export class MetaMaskProofUnavailable extends MetaMaskError {
  constructor(message = 'no exportable proof is available for this intent', cause?: unknown) {
    super('MetaMaskProofUnavailable', message, cause);
  }
}

/** A public-key-binding challenge is malformed, expired, or altered. */
export class MetaMaskChallengeInvalid extends MetaMaskError {
  constructor(message = 'the public-key binding challenge is invalid', cause?: unknown) {
    super('MetaMaskChallengeInvalid', message, cause);
  }
}

/**
 * Classify a raw EIP-1193 provider error. MetaMask uses code 4001 for
 * user-rejected requests; everything else is surfaced as the supplied fallback.
 */
export function classifyProviderError(err: unknown, fallback: MetaMaskError): MetaMaskError {
  const code = (err as { code?: unknown })?.code;
  if (code === 4001 || code === 'ACTION_REJECTED') {
    return new MetaMaskUserRejected(undefined, err);
  }
  return fallback;
}

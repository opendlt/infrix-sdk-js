// @infrix/metamask (adoption-10) — submit a governed Infrix intent from MetaMask
// with one import. It wraps the core MetaMask flow (connect, recover public key,
// sign EIP-712 typed data, verify against an Accumulate key page) and adds the
// ergonomic, runtime-local pieces a dApp always needs: provider-compatibility
// status, challenge freshness, and error translation into actionable, typed
// errors. The wallet-bound flow is delegated to the core `@infrix/client`
// (loaded lazily as a peer) or to an injected api for tests.

/** Stable error codes — aligned with the Infrix error-translation catalog. */
export const MetaMaskErrorCode = Object.freeze({
  ProviderMissing: 'METAMASK_PROVIDER_MISSING',
  UserRejected: 'METAMASK_USER_REJECTED',
  RecoveryFailed: 'METAMASK_PUBLIC_KEY_RECOVERY_FAILED',
  AddressMismatch: 'METAMASK_ADDRESS_MISMATCH',
  TypedDataUnsupported: 'METAMASK_TYPED_DATA_UNSUPPORTED',
  KeyPageBindingFailed: 'METAMASK_KEY_PAGE_BINDING_FAILED',
  ChallengeInvalid: 'METAMASK_CHALLENGE_INVALID',
});

const CATALOG = {
  [MetaMaskErrorCode.ProviderMissing]: {
    title: 'No MetaMask provider was found',
    fixes: [{ label: 'Install or unlock MetaMask, then reload', safeToRun: false }],
    docs: 'docs/errors/metamask.md',
    retryable: false,
  },
  [MetaMaskErrorCode.UserRejected]: {
    title: 'The signature was rejected in MetaMask',
    fixes: [{ label: 'Re-run and approve the MetaMask prompt', safeToRun: false }],
    docs: 'docs/errors/metamask.md',
    retryable: true,
  },
  [MetaMaskErrorCode.RecoveryFailed]: {
    title: 'Could not recover the public key from the signature',
    fixes: [{ label: 'Re-run the signing flow with a fresh challenge', safeToRun: false }],
    docs: 'docs/errors/metamask.md',
    retryable: true,
  },
  [MetaMaskErrorCode.AddressMismatch]: {
    title: 'The recovered address does not match MetaMask',
    fixes: [{ label: 'Make sure the same account that connected also signs', safeToRun: false }],
    docs: 'docs/errors/metamask-address-mismatch.md',
    retryable: false,
  },
  [MetaMaskErrorCode.TypedDataUnsupported]: {
    title: 'Typed-data signing is not supported by this wallet',
    fixes: [{ label: 'Use a wallet that supports EIP-712 (e.g. MetaMask)', safeToRun: false }],
    docs: 'docs/errors/metamask.md',
    retryable: false,
  },
  [MetaMaskErrorCode.KeyPageBindingFailed]: {
    title: 'The key is not authorized on the L0 key page',
    fixes: [{ label: 'Bind the MetaMask key to the ADI key page', safeToRun: false }],
    docs: 'docs/errors/metamask.md',
    retryable: false,
  },
  [MetaMaskErrorCode.ChallengeInvalid]: {
    title: 'The signing challenge is missing or expired',
    fixes: [{ label: 'Request a fresh challenge and sign again', safeToRun: false }],
    docs: 'docs/errors/metamask.md',
    retryable: true,
  },
};

/** Typed, actionable MetaMask error. */
export class InfrixMetaMaskError extends Error {
  constructor(code, message, opts = {}) {
    const entry = CATALOG[code] || { title: 'MetaMask error', fixes: [], retryable: false };
    super(message || entry.title);
    this.name = 'InfrixMetaMaskError';
    this.code = code;
    this.title = entry.title;
    this.fixes = entry.fixes;
    this.docs = entry.docs;
    this.retryable = !!entry.retryable;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

/**
 * translateError maps any thrown error from a provider/flow into a typed
 * InfrixMetaMaskError. EIP-1193 user rejection (code 4001) and a missing
 * provider are recognized; anything else becomes a recovery-failed error so the
 * caller always gets an actionable code (never a raw stack).
 */
export function translateError(err) {
  if (err instanceof InfrixMetaMaskError) return err;
  const code = err && (err.code ?? err.errorCode);
  const msg = (err && err.message) || String(err);
  if (code === 4001 || /user rejected|user denied|rejected the request/i.test(msg)) {
    return new InfrixMetaMaskError(MetaMaskErrorCode.UserRejected, msg, { cause: err });
  }
  if (/no (metamask|ethereum|provider)|window\.ethereum|provider (is )?(missing|not found)/i.test(msg)) {
    return new InfrixMetaMaskError(MetaMaskErrorCode.ProviderMissing, msg, { cause: err });
  }
  if (/address (mismatch|does not match)/i.test(msg)) {
    return new InfrixMetaMaskError(MetaMaskErrorCode.AddressMismatch, msg, { cause: err });
  }
  if (/signtypeddata|typed.?data/i.test(msg)) {
    return new InfrixMetaMaskError(MetaMaskErrorCode.TypedDataUnsupported, msg, { cause: err });
  }
  return new InfrixMetaMaskError(MetaMaskErrorCode.RecoveryFailed, msg, { cause: err });
}

/**
 * providerStatus reports MetaMask provider compatibility. `provider` defaults
 * to window.ethereum when available.
 */
export function providerStatus(provider) {
  const p = provider || (typeof globalThis !== 'undefined' ? globalThis.ethereum : undefined) ||
    (typeof window !== 'undefined' ? window.ethereum : undefined);
  const present = !!p && typeof p.request === 'function';
  return {
    present,
    isMetaMask: !!(p && p.isMetaMask),
    // Typed-data v4 support cannot be proven without prompting; assume a
    // request-capable provider can attempt it (the flow surfaces unsupported).
    supportsTypedDataV4: present,
    ready: present,
  };
}

// --- challenge freshness (local, mirrors the core binding challenge) ---

/**
 * buildChallenge constructs a public-key-binding challenge with issuedAt and
 * expiresAt timestamps. `nowMs`/`ttlMs` are injectable for deterministic tests.
 */
export function buildChallenge(params = {}) {
  const now = typeof params.nowMs === 'number' ? params.nowMs : Date.now();
  const ttl = typeof params.ttlMs === 'number' ? params.ttlMs : 5 * 60 * 1000;
  return {
    purpose: 'recover-public-key-for-accumulate-eip712',
    domain: params.domain || 'infrix',
    signer: params.signer || '',
    address: params.address || '',
    nonce: params.nonce || '',
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl).toISOString(),
  };
}

/**
 * assertChallengeFresh throws an InfrixMetaMaskError(ChallengeInvalid) if the
 * challenge is missing required fields or is expired at `nowMs` (default now).
 */
export function assertChallengeFresh(challenge, nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  if (!challenge || typeof challenge !== 'object' || !challenge.expiresAt || !challenge.issuedAt) {
    throw new InfrixMetaMaskError(MetaMaskErrorCode.ChallengeInvalid, 'challenge is missing issuedAt/expiresAt');
  }
  const exp = Date.parse(challenge.expiresAt);
  const iss = Date.parse(challenge.issuedAt);
  if (Number.isNaN(exp) || Number.isNaN(iss)) {
    throw new InfrixMetaMaskError(MetaMaskErrorCode.ChallengeInvalid, 'challenge timestamps are not valid ISO-8601');
  }
  if (now > exp) {
    throw new InfrixMetaMaskError(MetaMaskErrorCode.ChallengeInvalid, 'challenge has expired');
  }
}

/**
 * createInfrixMetaMask builds the one-import MetaMask app. Provide `{ endpoint }`
 * for live use (the core `@infrix/client` is loaded lazily as a peer), or inject
 * `{ api }` (a MetaMaskApi-shaped object) for tests.
 *
 * @param {{ endpoint?: string, client?: any, api?: any }} [options]
 */
export function createInfrixMetaMask(options = {}) {
  const { endpoint, client, api } = options;
  if (!endpoint && !client && !api) {
    throw new TypeError('createInfrixMetaMask: provide { endpoint } (live) or { api }/{ client } (injected)');
  }

  let apiPromise = null;
  async function resolveApi() {
    if (api) return api;
    if (!apiPromise) {
      apiPromise = (async () => {
        const mod = await import('@infrix/client');
        const c = client || new mod.InfrixClient(endpoint);
        return mod.withMetaMask(c).metamask;
      })();
    }
    return apiPromise;
  }

  const wrap = async (fn) => {
    try {
      return await fn();
    } catch (e) {
      throw translateError(e);
    }
  };

  return {
    /** Connect to a wallet provider (defaults to window.ethereum). */
    async connect(provider) {
      const status = providerStatus(provider);
      if (!status.present) {
        throw new InfrixMetaMaskError(MetaMaskErrorCode.ProviderMissing, 'no EIP-1193 provider available');
      }
      return wrap(async () => (await resolveApi()).connect(provider));
    },
    /** Submit a governed intent signed via MetaMask typed data. */
    async submitGovernedIntent(params) {
      return wrap(async () => (await resolveApi()).submitIntent(params));
    },
    /** Recover the signer's public key from a signed challenge. */
    async recoverPublicKey(params) {
      return wrap(async () => (await resolveApi()).recoverPublicKey(params));
    },
    providerStatus,
    translateError,
    buildChallenge,
    assertChallengeFresh,
  };
}

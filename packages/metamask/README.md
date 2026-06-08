# @infrix/metamask

Submit a governed Infrix intent from MetaMask with **one import** — connect,
sign EIP-712 typed data, and have the signer verified against an Accumulate key
page.

## Install (30 seconds)

```sh
npm install @infrix/metamask @infrix/client
```

`@infrix/client` is a peer dependency. For tests you can inject an api/client.

## One working snippet

```js
import { createInfrixMetaMask } from '@infrix/metamask';

const mm = createInfrixMetaMask({ endpoint: 'https://my-infrix-node' });

await mm.connect();                                  // window.ethereum
const result = await mm.submitGovernedIntent({
  signer: 'acc://alice.acme/book/1',
  signerVersion: 1,
  goal: { type: 'TOKEN_TRANSFER', targetAssets: [{ asset: 'ACME', amount: '5' }] },
});

console.log(result.intentId, result.l0KeyPageVerified);
```

## What it includes

- **Public-key recovery** — recover the secp256k1 key from the signature.
- **Typed-data signing** — canonical EIP-712 Accumulate intent.
- **Challenge freshness** — `buildChallenge` / `assertChallengeFresh` guard replay.
- **Error translation** — every failure becomes a typed `InfrixMetaMaskError`
  with a stable `code`, a fix, and a `retryable` flag (never a raw provider error).
- **Provider compatibility status** — `providerStatus()` reports whether a usable
  EIP-1193 provider is present.

## Expected output

`submitGovernedIntent` returns the governed result, including `intentId`,
`status`, and `l0KeyPageVerified` (whether the signer was confirmed on the
Accumulate key page).

## Error handling

```js
import { MetaMaskErrorCode } from '@infrix/metamask';

try {
  await mm.connect();
} catch (e) {
  if (e.code === MetaMaskErrorCode.ProviderMissing) {
    // show "install MetaMask"
  } else if (e.code === MetaMaskErrorCode.UserRejected) {
    // e.retryable === true — offer "try again"
  }
}
```

## Live vs offline

This package signs and submits against a live node. The returned result reports
`l0KeyPageVerified`: `true` only when the node confirmed the signer's key
against Accumulate L0. It does not claim more than the node verified.

This is **SDK support for MetaMask signing**, not a product-readiness claim — the
end-to-end real-browser acceptance lives in the MetaMask acceptance harness.

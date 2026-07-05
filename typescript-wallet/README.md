# @infrix/wallet

ADI-native smart wallet SDK for the [Infrix](https://github.com/opendlt/infrix-sdk-js)
platform — wallet and signing integration for governed intents.

## Install

```sh
npm install @infrix/wallet
```

## Usage

```ts
import { Wallet } from "@infrix/wallet";

// Create/attach an ADI-native wallet and sign governed intents.
const wallet = await Wallet.fromKey(privateKey);
const signed = await wallet.sign(intent);
```

## Provenance

Published from `opendlt/infrix-sdk-js` via npm trusted publishing (OIDC) with build
provenance. See [`docs/release/npm-publishing.md`](https://github.com/opendlt/infrix-sdk-js/blob/main/docs/release/npm-publishing.md).

## License

MIT — see [LICENSE](./LICENSE).

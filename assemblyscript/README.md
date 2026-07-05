# @infrix/sdk

The AssemblyScript contract SDK for [Infrix](https://github.com/opendlt/infrix-sdk-js).

Infrix is a governance-first execution fabric. The primary way you interact with it
from AssemblyScript is by emitting governance intents that describe a desired
outcome; contract operations remain available as a secondary, lower-level surface.

## Install

```sh
npm install @infrix/sdk
```

## Usage

```ts
import { Governance } from "@infrix/sdk";

// Submit a governed transfer intent — the canonical surface.
Governance.submitIntent("GOVERNED_TRANSFER", {
  from: "acc://alice.acme",
  to: "acc://bob.acme",
  amount: 100,
});
```

Low-level contract storage (executed under an approved plan):

```ts
import { Storage, U256 } from "@infrix/sdk";

export function increment(): void {
  let count = Storage.getU256("counter");
  if (count === null) count = U256.zero();
  Storage.setU256("counter", count.add(U256.one()));
}
```

A `describe`/`it` testing framework is available at `@infrix/sdk/testing`.

## Package contents

The published tarball carries the AssemblyScript sources under `assembly/` (the API
contract authors compile against) and the compiled release build under `build/`
(`release.js`, `release.d.ts`, `release.wasm`). Debug builds, `.wat`/source-map
inspection artifacts, and internal tests are intentionally excluded.

## Provenance

Published from `opendlt/infrix-sdk-js` via npm trusted publishing (OIDC) with build
provenance. See [`docs/release/npm-publishing.md`](https://github.com/opendlt/infrix-sdk-js/blob/main/docs/release/npm-publishing.md).

## License

MIT — see [LICENSE](./LICENSE).

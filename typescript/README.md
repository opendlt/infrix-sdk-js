# @infrix/client

The core TypeScript client for the [Infrix](https://github.com/opendlt/infrix-sdk-js)
governance-first execution platform — intents, reads, and the v4 governance API.

## Install

```sh
npm install @infrix/client
```

## Usage

```ts
import { Infrix } from "@infrix/client";

// Submit a governed intent describing a desired outcome; plans, policies,
// approvals, evidence, and anchoring are handled by the Infrix spine.
const infrix = new Infrix({ endpoint: "https://…" });
await infrix.submitIntent("GOVERNED_TRANSFER", {
  from: "acc://alice.acme",
  to: "acc://bob.acme",
  amount: 100,
});
```

The package also ships the `create-infrix-app` scaffolding CLI:

```sh
npx create-infrix-app my-app
```

## Provenance

Published from `opendlt/infrix-sdk-js` via npm trusted publishing (OIDC) with build
provenance. See [`docs/release/npm-publishing.md`](https://github.com/opendlt/infrix-sdk-js/blob/main/docs/release/npm-publishing.md).

## License

MIT — see [LICENSE](./LICENSE).

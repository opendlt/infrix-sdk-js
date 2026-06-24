# infrix-sdk-js

**The JavaScript / TypeScript / AssemblyScript SDKs for [Infrix](https://github.com/opendlt/infrix-accumen).**

This repo holds the client-side SDK surfaces extracted from the Infrix monorepo,
published to npm under the `@infrix/*` scope. Each package maps to one adoption
outcome — submit an intent, verify a proof offline, embed a widget — so you
import exactly what you need.

The verifier and fixtures are vendored into the packages, so the SDK builds and
tests **standalone** with no dependency on the Go monorepo.

## Published packages

| Package | Source | What it is |
|---------|--------|------------|
| [`@infrix/client`](https://www.npmjs.com/package/@infrix/client) | `typescript/` | The core TypeScript client (intents, reads, the v4 governance API) |
| [`@infrix/wallet`](https://www.npmjs.com/package/@infrix/wallet) | `typescript-wallet/` | Wallet / signing integration |
| [`@infrix/sdk`](https://www.npmjs.com/package/@infrix/sdk) | `assemblyscript/` | The AssemblyScript contract SDK |
| [`@infrix/verify`](https://www.npmjs.com/package/@infrix/verify) | `packages/verify` | The in-browser, no-node-trust portable-proof verifier |
| [`@infrix/proof-receipt`](https://www.npmjs.com/package/@infrix/proof-receipt) | `packages/proof-receipt` | Render / read the canonical proof receipt |
| [`@infrix/metamask`](https://www.npmjs.com/package/@infrix/metamask) | `packages/metamask` | MetaMask typed-data signing helpers |
| [`@infrix/widgets`](https://www.npmjs.com/package/@infrix/widgets) | `packages/widgets` | React widget kit (proof receipt, error resolution) |
| [`@infrix/widgets-webcomponent`](https://www.npmjs.com/package/@infrix/widgets-webcomponent) | `packages/widgets-webcomponent` | The same widgets as framework-free Web Components |
| [`@infrix/golden-escrow`](https://www.npmjs.com/package/@infrix/golden-escrow) | `packages/golden-escrow` | One-call golden-escrow demo flow |

## Install

```sh
npm install @infrix/client
# or just the verifier, for a no-node-trust proof check in the browser:
npm install @infrix/verify
```

## Layout

```
typescript/         @infrix/client      (standalone project)
typescript-wallet/  @infrix/wallet      (standalone project)
assemblyscript/     @infrix/sdk         (standalone project)
packages/           @infrix/{verify, proof-receipt, metamask, widgets,
                    widgets-webcomponent, golden-escrow}  (npm workspace)
```

## Build & test

Each project area installs and tests independently:

```sh
cd packages && npm ci && npm test     # the happy-path workspace
cd typescript && npm ci && npm test   # @infrix/client
```

## License

MIT — see [LICENSE](LICENSE).

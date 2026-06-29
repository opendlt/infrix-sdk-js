# infrix-sdk-js

**The JavaScript / TypeScript / AssemblyScript SDKs for [Infrix](https://github.com/opendlt) — the policy-governed, identity-native execution fabric on Accumulate.**

## What Infrix is, in one sentence

Infrix turns every state change into a **governed intent** that runs through one
canonical path — **intent → policy → approval → outcome → evidence → anchor** —
and emits a portable cryptographic **proof you can re-verify yourself, without
trusting the node that produced it.** Governance is enforced by construction
(default-deny policy, explicit capabilities, explain traces), not bolted on.

## Start here: prove it to yourself in 30 seconds

No wallet, no funding, no account, no node. Install the verifier and check a
**real** Infrix proof offline — the verdict is math you re-run, not the node's
word:

```sh
mkdir infrix-taste && cd infrix-taste && npm init -y && npm install @infrix/verify
```

```js
// verify.mjs
import { verifyPortablePackage } from '@infrix/verify';
import { createRequire } from 'node:module';

// @infrix/verify ships a real, known-good portable proof to check against:
const proof = createRequire(import.meta.url)('@infrix/verify/portable-fixture.valid.json');

const result = await verifyPortablePackage(proof);
console.log(result.passed ? '✅ proof verified offline' : '❌ verification failed');
for (const c of result.checks) {
  console.log(`  ${c.passed ? '✓' : '✗'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
}
```

```sh
node verify.mjs
# ✅ proof verified offline
#   ✓ version — v4
#   ✓ export_hash — 27d4629d210dc010…
#   ✓ bundle_data — embedded bundle id=ev-nexus-fixture-intent
#   ✓ plan_hash — matches an ApprovalEvidence.PlanHash
#   ✓ outcome_digest
#   ✓ inclusion_proofs …
```

`@infrix/verify` is the **same verifier the node and the `infrix` CLI use** — so a
proof that passes here passes for anyone, anywhere, with no trusted server in the
loop. That is the thing most chains can't show you: their explorer says *"valid
because our node says so."* Infrix hands you the math and lets you check it.

## What you can run today (and what needs a node)

Be honest with yourself about the boundary before you start:

| You want to… | Use | Needs an Infrix node? |
|---|---|---|
| Verify a proof offline (the demo above) | `@infrix/verify` | **No** — runs anywhere |
| Render a proof receipt / badges in your UI | `@infrix/proof-receipt`, `@infrix/widgets` | No |
| Submit a governed intent & read state | `@infrix/client` | **Yes** — point it at an Infrix node |
| Author a WASM contract | `@infrix/sdk` (AssemblyScript) or the [`infrix-sdk`](https://github.com/opendlt/infrix-crates) crate (Rust) | to deploy, yes |

> Running governed flows yourself needs an Infrix node. Infrix is **open-core**:
> the SDKs, the offline verifier, and the [schema](https://github.com/opendlt/infrix-schema)
> are open; the governance runtime / node is the access-gated component. A hosted
> devnet endpoint is on the way — until then, the intent-submitting paths target a
> node you run or are granted access to.

The verifier and fixtures are vendored into the packages, so everything in this
repo builds and tests **standalone**, with no dependency on the Go monorepo.

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

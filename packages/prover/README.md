# @infrix/prover

Lazy-loaded **WebAssembly selective-disclosure prover** for Infrix. Generate
zero-knowledge predicate proofs **client-side** — in the browser or in Node — so
a holder proves a fact (age over 18, solvency, set membership) **without
revealing the underlying data**. The private witness is marshalled to an
in-process WASM module and never leaves the device; only the public proof
envelope is returned.

This is the proving half that `@infrix/client` deliberately does not bundle
(the module is ~16 MB): install it separately and load it on demand.

```js
import { loadProver } from '@infrix/prover';

const prover = await loadProver();            // instantiates the WASM once (lazy)

const envelope = await prover.prove({
  predicate: 'threshold_gte',
  publicInputs: [18n],                        // the public threshold
  privateInputs: [21n],                       // the private value (never leaves)
  holderSigner: ed25519PrivateKey,            // Uint8Array, 64-byte Go format
  purpose: 'age-over-18',
});

// Submit the public envelope for verification (no private data in it):
await client.predicates.verify(envelope);     // via @infrix/client, or:
prover.verify(envelope);                       // in-module self-check
```

## API

- `loadProver(opts?) → Promise<{ prove, verify }>` — instantiate once (cached).
  `opts.assetsDir` (Node) / `opts.baseUrl` (browser) override where the WASM +
  `wasm_exec.js` are loaded from. The artifact's sha256 is checked against the
  vendored `manifest.json` before instantiation.
- `prove(request) → envelope` — `request` fields: `predicate` (string),
  `setSize?` (number, for membership), `publicInputs` / `privateInputs`
  (`bigint | number | string` arrays), `holderSigner` (`Uint8Array`),
  and optional `holderDID`, `nullifierKey` (`Uint8Array`), `grantId`, `purpose`,
  `domain`, `challenge` (`Uint8Array`), `issuedAtBlock`. Returns the public
  `PredicateProof` envelope (the shape `client.predicates.verify` accepts).
- `verify(envelope) → { valid, reason? }` — in-module self-check.

## Performance

Groth16 proving in WASM is **seconds, not milliseconds**. The first proof of a
given predicate pays a one-time circuit compile + trusted-setup cost (~10 s on a
reference machine); subsequent proofs are ~0.5–1 s. In the browser, **run the
prover in a Web Worker** so the main thread never blocks. Shipping precomputed
`CircuitMaterial` (a shared trusted setup) skips the per-circuit setup.

## How the artifact is produced

The WASM is compiled from the same Go prover the node uses
(`infrix-core/pkg/zkp/predicate`, gnark/Groth16) — there is no separate,
drift-prone JS circuit implementation. `npm run vendor` builds/copies it from a
sibling `infrix-core` checkout (or `$INFRIX_CORE_DIR`); published builds ship it
in `assets/`.

## Security

- The private witness never crosses the network — only the local WASM boundary.
- The loaded WASM's sha256 is verified against `manifest.json` before use.
- A witness that does not satisfy the predicate fails at proving time
  (fail-loud) — there is no silent unsatisfiable proof.

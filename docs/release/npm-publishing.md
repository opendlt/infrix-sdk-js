# npm publishing — trusted publishing / OIDC (audit G4)

The `@infrix/*` SDK packages are published through GitHub Actions
(`.github/workflows/publish.yml`) using npm **trusted publishing**: the workflow
authenticates to the npm registry with a short-lived credential minted from
GitHub's OIDC identity, so there is **no long-lived npm token** anywhere in the
release path. Every published tarball also carries **build provenance**
(`publishConfig.provenance: true` in each package manifest).

This is the fifth-pass audit G4 remediation. Relocating the old
`npm-access-key-*.txt` out of the project tree removed the local *colocation*
risk, but trusted publishing removes the standing *credential* itself.

## One-time setup (operator, on npmjs.com)

Trusted publishers are configured per package on the npm website — they cannot be
set from this repo. For **each** package below:

1. npmjs.com → the package → **Settings** → **Trusted Publisher** → **GitHub Actions**.
2. Organization / repository: `opendlt/infrix-sdk-js`.
3. Workflow filename: `publish.yml`.
4. (Optional) Environment: leave blank unless you add one to `publish.yml`.

Packages:

- `@infrix/verify`
- `@infrix/proof-receipt`
- `@infrix/widgets`
- `@infrix/widgets-webcomponent`
- `@infrix/metamask`
- `@infrix/golden-escrow`
- `@infrix/prover`
- `@infrix/templates`

Until a package is registered as a trusted publisher, its publish step **fails
closed** — there is intentionally no token fallback.

## Publishing

- **Release:** publishing runs automatically when a GitHub Release is *published*.
- **Manual dry-run:** run the `publish` workflow via *workflow_dispatch* with
  `dry_run` checked (the default) to build and list exactly what would ship
  without touching the registry.
- **Manual real publish:** run *workflow_dispatch* with `dry_run` unchecked.

Every path first runs `npm run check:supply-chain`, which builds each package's
real published payload and validates license, pinned dependencies, size budgets,
and required generated files (e.g. the `@infrix/prover` WASM assets) before any
publish can proceed.

## Requirements baked into the workflow

- `permissions: id-token: write` — required for the OIDC token exchange and for
  provenance attestation.
- npm is upgraded to the latest (`>= 11.5.1`) because trusted publishing support
  is not in the npm bundled with Node 22.
- `infrix-core` is checked out as a sibling so `@infrix/prover` can build its WASM
  assets; a publish without them is a supply-chain finding, not a skip.

## Note on local publishing

Because `publishConfig.provenance` is `true`, a plain local `npm publish` will try
to generate provenance and fail outside a supported CI. This is intentional:
publishing must go through the trusted-publishing workflow. Treat any remaining
long-lived npm token as transitional and revoke it once trusted publishing is
confirmed working for all packages.

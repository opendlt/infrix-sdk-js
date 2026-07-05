# npm publishing — trusted publishing / OIDC

Every publishable `@infrix/*` package is released through GitHub Actions
(`.github/workflows/publish.yml`) using npm **trusted publishing**: the workflow
authenticates to the registry with a short-lived credential minted from GitHub's
OIDC identity, so there is **no long-lived npm token** anywhere in the release
path. Every published tarball also carries **build provenance**
(`publishConfig.provenance: true` in every manifest).

This began as the fifth-pass audit G4 remediation (workspace packages) and was
extended in the sixth pass (S1–S5) to cover the **full npm surface** — including
the three standalone packages — behind a single no-write preflight and an explicit,
re-runnable publish plan.

## The full package surface (11 packages)

Workspace packages (under `packages/`, derived from `packages/package.json`
`workspaces` so the release set can never drift):

- `@infrix/verify`
- `@infrix/proof-receipt`
- `@infrix/widgets`
- `@infrix/widgets-webcomponent`
- `@infrix/metamask`
- `@infrix/golden-escrow`
- `@infrix/prover`
- `@infrix/templates`

Standalone packages (their own project dirs):

- `@infrix/client` — `typescript/`
- `@infrix/wallet` — `typescript-wallet/`
- `@infrix/sdk` — `assemblyscript/`

All eleven are enumerated by `scripts/release-npm.mjs`, the single release
orchestrator.

## Release policy — publish-if-absent

Each package is versioned **independently**. `scripts/release-npm.mjs` queries the
registry for every package's exact `name@version` and builds a plan:

- **absent** → it will be published;
- **published** → it is **skipped** (that version is already released — idempotent);
- **error** (registry unreachable / auth failure) → the run **fails closed**.

Because only absent versions are ever published, a release can never fail on an
already-published version, and re-running after a partial failure simply resumes
the packages that have not published yet. **To release a changed package, bump its
version** — an unbumped package is treated as already-released and skipped.

The orchestrator writes a `release-manifest.json` (uploaded as a workflow
artifact) recording the exact package set, versions, statuses, and outcomes.

## Publishing

- **Release:** publishing runs automatically when a GitHub Release is *published*.
- **Manual dry-run:** run the `publish` workflow via *workflow_dispatch* with
  `dry_run` checked (the default). It builds and lists exactly what would ship for
  every package without touching the registry.
- **Manual real publish:** run *workflow_dispatch* with `dry_run` unchecked.

Before any publish, the workflow runs, in order:

1. `npm run check:supply-chain` — builds each workspace package's real payload and
   validates license, pinned deps, size budgets, and required generated files
   (e.g. the `@infrix/prover` WASM assets).
2. `npm test --workspaces --if-present` (workspace) and `npm test` in each
   standalone package — behavioral tests, not just payload shape (audit S4).
3. `node scripts/release-npm.mjs --preflight` — the no-write registry plan above
   (audit S1/S3); it fails closed on any registry error so a release never starts
   blind.

Only then does `--dry-run` or `--publish` run.

## One-time setup (operator, on npmjs.com)

Trusted publishers are configured per package on the npm website — they cannot be
set from this repo. For **each** of the eleven packages:

1. npmjs.com → the package → **Settings** → **Trusted Publisher** → **GitHub Actions**.
2. Organization / repository: `opendlt/infrix-sdk-js`.
3. Workflow filename: `publish.yml`.

Until a package is registered as a trusted publisher, its publish step **fails
closed** — there is intentionally no token fallback.

## Requirements baked into the workflow

- `permissions: id-token: write` — required for the OIDC token exchange and for
  provenance attestation.
- npm is **pinned** to `11.5.1` (`npm install -g npm@11.5.1`) — the minimum that
  supports OIDC trusted publishing, and not in the npm bundled with Node 22. The
  publish toolchain is pinned rather than `@latest` so lifecycle/provenance/JSON
  semantics cannot drift between releases without a code change (audit S5). Mirror
  this version in local release verification.
- `infrix-core` is checked out as a sibling so `@infrix/prover` can build its WASM
  assets; a publish without them is a supply-chain finding, not a skip.

## Local release verification

From the repo root, with an `infrix-core` checkout available:

```sh
export INFRIX_CORE_DIR=/path/to/infrix-core
node scripts/release-npm.mjs --preflight   # registry plan, no writes
node scripts/release-npm.mjs --dry-run     # build + pack every package, no writes
```

Use npm `11.5.1` locally to match CI.

## Note on local publishing

Because `publishConfig.provenance` is `true`, a plain local `npm publish` will try
to generate provenance and fail outside a supported CI. This is intentional:
publishing must go through the trusted-publishing workflow. Treat any remaining
long-lived npm token as transitional and revoke it once trusted publishing is
confirmed working for all packages.

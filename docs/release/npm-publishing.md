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

## Release policy — publish-if-absent with a payload-identity guard

Each package is versioned **independently**. `scripts/release-npm.mjs` queries the
registry for every package's exact `name@version` and builds a plan:

- **absent** → it will be published;
- **published-same** → **skipped** (that version is already released AND the local
  built tarball is byte-for-byte identical to the registry copy — idempotent);
- **published-different** → the run **fails** (audit Z1). The local payload differs
  from what is on the registry for this exact version, so a green release would
  silently NOT ship the local change. Bump the version to ship it, or revert the
  local change;
- **error** (registry unreachable / auth failure) → the run **fails closed**.

Payload identity is decided by comparing the local built tarball shasum
(`npm pack --dry-run --json`, built via the package's real prepack) against the
registry `dist.shasum`. CI pins npm (below), so the comparison is apples-to-apples.

Because only absent versions are ever published, a release can never fail on an
already-published version, and re-running after a partial failure simply resumes
the packages that have not published yet. **To release a changed package, bump its
version.**

The orchestrator writes a `release-manifest.json` (uploaded as a workflow
artifact) recording each package's version, status, `registryShasum`,
`localShasum`, `payloadMatchesRegistry`, and publish outcome.

### Modes

- `--preflight` — no writes; registry plan + payload-identity check; fails on any
  error or `published-different`.
- `--dry-run` — **release-readiness**: the preflight gate (fails on error /
  `published-different`), then `npm publish --dry-run` for every package.
- `--payload-only` — **registry-independent**: only builds and packs every package,
  with no registry query and no readiness gate (audit Z6). Use it to validate
  packability offline; it is NOT a release-readiness check.
- `--publish` — the preflight gate, then publishes each absent package.

## Publishing

- **Release:** publishing runs automatically when a GitHub Release is *published*.
- **Manual dry-run:** run the `publish` workflow via *workflow_dispatch* with
  `dry_run` checked (the default). It builds and lists exactly what would ship for
  every package without touching the registry.
- **Manual real publish:** run *workflow_dispatch* with `dry_run` unchecked.

Before any publish, the workflow runs, in order:

1. `node scripts/supply-chain-all.mjs` — builds every one of the **eleven**
   packages' real payload (workspace and standalone, via the shared enumeration in
   `scripts/release-packages.mjs`) and validates license, pinned deps, size
   budgets, declared `main`/`types`/`exports` targets, and required generated files
   (e.g. the `@infrix/prover` WASM assets). The workspace-only
   `cd packages && npm run check:supply-chain` remains for local workspace dev.

   **AUTHORITATIVE runner = CI (Linux).** `supply-chain-all.mjs` uses the npm
   LIFECYCLE (`npm run build --workspaces`, per-package prepack, `npm pack`), which
   produces the exact published tarball manifest. CI runs it on Linux and archives
   that fresh manifest for all 11 packages — that is the source of truth for a
   publish.

   **Release manifest must cover ALL 11 packages (pass-24 audit P1-4).** The
   archived `supply-chain-manifest.json` records `complete: true` only when it
   covers all 11 packages; an incomplete manifest is a supply-chain FAILURE and the
   CI step fails (so an incomplete manifest is never archived). **No publish or
   release claim may be made unless the archived CI manifest is `complete: true`
   for all 11 packages.**

   **Windows-reproducible fallback (pass-23 audit P2-3 / pass-24 P1-4).** On some
   Windows checkouts the npm lifecycle spawner fails with `spawn EPERM` (a
   node/npm/Windows toolchain interaction), so `supply-chain-all.mjs` cannot run
   locally there. Use `node scripts/supply-chain-direct.mjs` instead: it spawns **no
   npm** (pure Node), so it never hits that EPERM, and reproducibly verifies license
   + pinned deps + the declared/required on-disk payload + size budgets over the
   same 11 packages. It is **STRICT by default** (release/audit posture): a package
   whose build output is absent is `NEEDS_BUILD` and the guard **FAILS** — it never
   prints "passed" with missing publish output. Build the package(s) first, then
   re-run. `node scripts/supply-chain-direct.mjs --triage` is the Windows soft-check
   that reports `NEEDS_BUILD` without failing, for diagnosing what to build. It
   verifies the on-disk BUILT state; freshness (delete-then-rebuild) and the exact
   `npm pack` tarball manifest remain delegated to the authoritative CI runner
   above. Fenced by `release/supply-chain-direct.test.mjs`.
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

### Trusted-publisher readiness gate (audit Z5)

npm exposes no API to query trusted-publisher configuration, so the operator
attests it in `release/trusted-publishers.json` — one entry per package. The
publish step runs `release-npm.mjs --publish --require-trusted-publisher-ready`,
which **refuses to write anything to the registry** until every publishable package
in that file is `configured: true`. This prevents a partial/split release where an
earlier package publishes but a later one fails for lack of trusted-publisher setup.

After configuring a package on npmjs.com, set its `configured` to `true` and fill
in `operator` and `date`, then commit. The gate list is checked against the shared
package enumeration, so a newly added package with no entry also blocks publish.

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
node scripts/supply-chain-all.mjs          # payload guard over all 11 packages
node scripts/release-npm.mjs --preflight    # registry plan + payload-identity, no writes
node scripts/release-npm.mjs --dry-run      # release-readiness gate + pack every package
node scripts/release-npm.mjs --payload-only # pack every package, ignore registry (offline)
```

Use npm `11.5.1` locally to match CI.

## Note on local publishing

Because `publishConfig.provenance` is `true`, a plain local `npm publish` will try
to generate provenance and fail outside a supported CI. This is intentional:
publishing must go through the trusted-publishing workflow. Treat any remaining
long-lived npm token as transitional and revoke it once trusted publishing is
confirmed working for all packages.

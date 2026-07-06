# npm trusted-publisher setup runbook

Pass-17 audit P1-7. The npm release path is **fail-closed by design**: every one
of the eleven `@infrix/*` packages is listed in `trusted-publishers.json` with
`configured:false`, and `scripts/release-npm.mjs --publish
--require-trusted-publisher-ready` refuses to write to the registry until every
package is `configured:true`. This is the correct posture — the repo does NOT
overclaim publish-readiness.

The in-repo infrastructure is already complete:

- `.github/workflows/publish.yml` uses OIDC trusted publishing (`id-token: write`,
  a pinned trusted-publishing npm, no long-lived `NODE_AUTH_TOKEN`);
- every publishable `package.json` sets `publishConfig.provenance: true`;
- `trusted-publishers.json` is the machine-readable attestation matrix and the
  publish gate reads it.

What remains is a one-time **operator action on npmjs.com** that no repository can
perform or truthfully attest to on the operator's behalf (npm exposes no API to
query trusted-publisher config). Do NOT set `configured:true` until you have
actually completed the npm-side setup for that package.

## Steps (per package, once)

1. On npmjs.com, open **Package → Settings → Trusted Publisher → GitHub Actions**.
2. Set repository `opendlt/infrix-sdk-js` and workflow `publish.yml`.
3. Save. The package now accepts an OIDC-minted short-lived credential from that
   workflow — no standing token.
4. In `release/trusted-publishers.json`, set that package's
   `"configured": true` and fill `"operator"` (your npm handle) and `"date"`
   (ISO date) as the committed attestation.

Repeat for all eleven packages:
`@infrix/verify`, `@infrix/proof-receipt`, `@infrix/widgets`,
`@infrix/widgets-webcomponent`, `@infrix/metamask`, `@infrix/golden-escrow`,
`@infrix/prover`, `@infrix/templates`, `@infrix/client`, `@infrix/wallet`,
`@infrix/sdk`.

## Release once all entries are `configured:true`

```sh
# Dry run — validates the gate, packs, and provenance without publishing.
node scripts/release-npm.mjs --require-trusted-publisher-ready

# Publish with OIDC + provenance.
node scripts/release-npm.mjs --publish --require-trusted-publisher-ready
```

The gate (`trusted-publishers.test.mjs`) fences that this matrix covers every
publishable package and that the readiness check is fail-closed, so a package can
never be silently dropped or a partial release slip through.

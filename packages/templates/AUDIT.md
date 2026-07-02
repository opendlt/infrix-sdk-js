# @infrix/templates — audit notes

These starter templates are reviewed to use only the **real** Infrix APIs and to
follow the platform's safety posture. Each is verified by `test/templates.test.mjs`
(scaffolds valid files, parses as JS, and contains the asserted real API calls).

## Standards every template meets

- **Kermit-by-default, disclosure context up front.** Every template connects via
  `new InfrixClient('kermit', { actor, purpose })` — never a hardcoded endpoint,
  and never mainnet. This is enforced by the test suite.
- **No placeholders.** The retired `credential-gated-release` scaffold hard-coded
  `credential: 'kyc-tier-2'` — a string that issued/verified nothing. It is
  replaced by `credential-gated`, which **issues a genuine verifiable credential**
  (`client.credentials.issue`) and gates the governed release on it. The test
  asserts `kyc-tier-2` never appears.
- **Private data stays local.** `selective-disclosure-vp` proves `age >= 21`
  through `@infrix/prover` — the age claim is the private witness and never leaves
  the prover; only the public envelope is submitted to `predicates.verify`.

## Per-template notes

| Template | API surface | Risk |
|----------|-------------|------|
| `issue-credential` | `credentials.createDID`, `credentials.issue` (→ node `vc.issue`) | governed write; needs an issuer identity |
| `selective-disclosure-vp` | `credentials.present` + `@infrix/prover` + `predicates.verify` | local proving; no secret leaves the device |
| `credential-gated` | `credentials.issue` + `withGovernanceSugar().callContract` | governed write; release gated on a real credential |

## Review checklist for new templates

1. Connects via a network **name** (`kermit`/`local`), never a raw URL; sets an
   actor + purpose.
2. Uses a real API call for every claimed capability — no string placeholders.
3. Never targets mainnet by default.
4. Ships a `package.json` with pinned `@infrix/*` dependencies.
5. Adds a row to this file and a coverage assertion to the test.

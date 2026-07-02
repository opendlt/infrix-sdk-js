# @infrix/templates

Audited, versioned **starter templates** for Infrix apps — the OpenZeppelin-style
catalog. Each is a reviewable module that scaffolds a runnable app using the real
`@infrix/client` credential/predicate APIs (and `@infrix/prover`), with **no
placeholders**.

```js
import { listTemplates, scaffoldFiles } from '@infrix/templates';

listTemplates(); // ['issue-credential', 'selective-disclosure-vp', 'credential-gated']

const files = scaffoldFiles('selective-disclosure-vp', 'my-app');
// { 'package.json': '...', 'index.js': '...', 'README.md': '...' } — write them to disk.
```

## Templates

| id | What it does |
|----|--------------|
| `issue-credential` | Derive a DID and issue a signed verifiable credential (`credentials.issue`). |
| `selective-disclosure-vp` | Prove "age ≥ 21" from a credential without revealing the age (`credentials.present` + `@infrix/prover`). |
| `credential-gated` | Issue a **real** credential and gate a governed release on it (replaces the old `kyc-tier-2` placeholder). |

Every template connects via the `kermit` network preset with a disclosure
context, never a hardcoded endpoint or mainnet. See [AUDIT.md](./AUDIT.md) for the
review standards each template meets and the checklist for adding new ones.

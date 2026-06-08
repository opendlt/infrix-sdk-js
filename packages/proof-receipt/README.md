# @infrix/proof-receipt

Verify an Infrix portable proof and render its receipt — in the browser or in
Node — **without trusting any node**.

## Install (30 seconds)

```sh
npm install @infrix/proof-receipt
```

## One working snippet

```js
import { verifyProof, renderReceipt } from '@infrix/proof-receipt';

const bundle = await (await fetch('/my-proof.infrix.json')).json();

const receipt = await verifyProof(bundle);     // offline cryptographic check
renderReceipt(receipt, document.getElementById('proof')); // browser only
```

Node:

```js
import { verifyProof, renderReceiptText } from '@infrix/proof-receipt';
const receipt = await verifyProof(bundle);
console.log(renderReceiptText(receipt));
```

## Expected output

`verifyProof` returns a canonical `ProofReceipt`:

```jsonc
{
  "version": "1",
  "status": "verified",
  "summary": "Verified without trusting the Infrix node.",
  "assurance": {
    "proofLevel": "L3",
    "label": "L3/G2",
    "nodeTrusted": false,
    "l0Verified": false,
    "replayVerified": true,
    "witnessQuorumVerified": false
  },
  "warnings": []
}
```

## Proof & assurance

The receipt answers four questions: **what** was verified, **why it matters**,
**did it require trusting a node** (always `nodeTrusted: false`), and **how far**
the assurance goes. The card keeps raw hashes inside an expandable section so
the headline stays readable.

## Offline vs live

This package verifies **offline**: it checks the proof's cryptographic structure
(`exportHash`, inclusion proofs, plan/outcome digests, policy decisions, …)
entirely in your runtime — no server, no node trust. An offline verdict caps at
**L3**.

Reaching **L4** means confirming the proof's anchor against Accumulate L0, which
the in-language verifier cannot do alone. Pass `{ l0 }` to label the network and
get the exact command:

```js
const receipt = await verifyProof(bundle, { l0: 'kermit' });
// receipt.assurance.l0Verified === false  (never inflated)
// receipt.verification.command === 'infrix verify <bundle>.infrix.json --l0 kermit'
// receipt.warnings includes an "offline verification only" note
```

## Error handling

`verifyProof` never throws on an invalid proof — it returns a receipt with
`status: "failed"` (or `"partial"`) and the failing checks surfaced as
`warnings`. It throws a `TypeError` only when you pass something that is not a
parsed bundle object. Use `validateReceipt(receipt)` to fail closed: it returns
a list of violations (empty means valid) and rejects any receipt that overclaims.

## API

- `verifyProof(bundle, { l0? }): Promise<ProofReceipt>`
- `renderReceipt(receipt, element, { expanded? }): HTMLElement` (browser)
- `validateReceipt(receipt): string[]`
- `renderReceiptText(receipt): string`

The proof-verification and receipt logic are the same canonical modules the
Nexus app and the `infrix verify` flow use — this package vendors them at build
so it ships self-contained.

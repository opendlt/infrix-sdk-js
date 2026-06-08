# @infrix/golden-escrow

Build the golden verifiable-escrow flow with **one import and one call** —
create the escrow through the governance pipeline, export the portable proof,
and get a proof receipt you can verify yourself.

## Install (30 seconds)

```sh
npm install @infrix/golden-escrow @infrix/client
```

`@infrix/client` is a peer dependency (the core SDK). For tests you can inject a
client instead.

## One working snippet

```js
import { createEscrowApp } from '@infrix/golden-escrow';

const escrow = createEscrowApp({ endpoint: 'https://my-infrix-node' });

const result = await escrow.createAndProve({
  buyer: 'acc://buyer.acme',
  seller: 'acc://seller.acme',
  amount: 1000,
});

console.log(result.escrowId);                  // the real escrow id
console.log(result.proofReceipt.status);        // "verified"
console.log(result.verifyCommand);              // "infrix verify <bundle>.infrix.json"
```

## Expected output

`createAndProve` returns:

```ts
{
  escrowId: string;          // real, from the governed result — never fabricated
  governedResult: EscrowHandle;
  proof: object;             // the portable evidence package
  proofReceipt: ProofReceipt;// verified offline via @infrix/proof-receipt
  verifyCommand: string;     // the exact command to verify it yourself
}
```

## Proof & assurance

The receipt is produced by verifying the exported proof **offline** (no node
trust). It caps at **L3** by construction; it is never inflated to L4. To reach
L4, confirm the L0 anchor with the printed `verifyCommand` (add `--l0 <network>`),
or pass `{ l0: 'kermit' }` to `createEscrowApp` to have the command pre-filled.

## Error handling

`createAndProve` throws `TypeError` for missing/invalid inputs (buyer, seller,
amount) and fails closed if the pipeline returns no `intentId` — it will never
hand back a half-proof. The proof receipt itself reports `status: "failed"`
(rather than throwing) when a bundle does not verify.

## Live vs offline

- **Offline** (default): the proof is checked cryptographically in your runtime.
- **Live (L4)**: run the returned `verifyCommand` with `--l0` to confirm the
  anchor against Accumulate L0.

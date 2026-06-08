// Example: create a governed escrow and prove it in one call.
//
//   node examples/create-and-prove.mjs https://my-infrix-node
//
// Requires the @infrix/client peer dependency for a live endpoint.

import { createEscrowApp } from '@infrix/golden-escrow';

const endpoint = process.argv[2];
if (!endpoint) {
  console.error('usage: node examples/create-and-prove.mjs <endpoint>');
  process.exit(2);
}

const escrow = createEscrowApp({ endpoint });
const result = await escrow.createAndProve({
  buyer: 'acc://buyer.acme',
  seller: 'acc://seller.acme',
  amount: 1000,
});

console.log('escrow id:    ', result.escrowId);
console.log('proof status: ', result.proofReceipt.status);
console.log('assurance:    ', result.proofReceipt.assurance.label);
console.log('verify with:  ', result.verifyCommand);

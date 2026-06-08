// Example: verify a portable proof in Node and print its receipt.
//
//   node examples/node-verify.mjs <bundle.infrix.json>
//
// Verification is offline (no node trusted). Pass --l0 <network> to see the
// command that would confirm the L0 anchor for L4.

import fs from 'node:fs';
import { verifyProof, renderReceiptText, validateReceipt } from '@infrix/proof-receipt';

const file = process.argv[2];
if (!file) {
  console.error('usage: node examples/node-verify.mjs <bundle.infrix.json> [--l0 <network>]');
  process.exit(2);
}
const l0Index = process.argv.indexOf('--l0');
const l0 = l0Index >= 0 ? process.argv[l0Index + 1] : undefined;

const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
const receipt = await verifyProof(bundle, l0 ? { l0 } : {});

console.log(renderReceiptText(receipt));

const violations = validateReceipt(receipt);
if (violations.length) {
  console.error('\nreceipt did not validate:', violations.join('; '));
  process.exit(1);
}
process.exit(receipt.status === 'verified' ? 0 : 1);

// End-to-end selective-disclosure example (DX P1-3b-5).
//
// A holder proves "I am over 21" WITHOUT revealing their actual age, entirely in
// JavaScript. The private value never leaves the process — only the public proof
// envelope does. Run:  node examples/selective-disclosure-vp.mjs
//
// In a published app you would:  import { loadProver } from '@infrix/prover'
// here we import the local package source so the example runs in-repo.

import { generateKeyPairSync } from 'node:crypto';
import { loadProver } from '../src/index.js';

// A holder key proves control of the identity the proof is bound to. Go's
// ed25519.PrivateKey is seed(32) || pubkey(32).
function holderKey() {
  const jwk = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
  return new Uint8Array(Buffer.concat([Buffer.from(jwk.d, 'base64url'), Buffer.from(jwk.x, 'base64url')]));
}

const t0 = Date.now();
const prover = await loadProver(); // instantiates the WASM once
console.log(`prover loaded in ${Date.now() - t0} ms`);

const ACTUAL_AGE = 25n; // private — NEVER leaves this process
const THRESHOLD = 21n; // public — the fact the verifier learns is "age >= 21"

const t1 = Date.now();
const envelope = await prover.prove({
  predicate: 'threshold_gte',
  publicInputs: [THRESHOLD],
  privateInputs: [ACTUAL_AGE],
  holderSigner: holderKey(),
  purpose: 'age-over-21',
  challenge: new Uint8Array([1, 2, 3, 4]), // a fresh verifier nonce
});
console.log(`proof generated in ${Date.now() - t1} ms`);

// The public envelope is what you submit to a verifier. It does NOT contain 25.
console.log('holder DID:      ', envelope.holderDid);
console.log('reveals age (25):', JSON.stringify(envelope).includes('"25"')); // false
console.log('envelope keys:   ', Object.keys(envelope).join(', '));

// In production: await client.predicates.verify(envelope) against a node.
// Here we self-check against the in-module trusted setup:
const result = await prover.verify(envelope);
console.log('verified:        ', result.valid, result.reason || '');

process.exit(result.valid ? 0 : 1);

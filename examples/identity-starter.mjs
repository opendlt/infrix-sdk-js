// Deterministic offline identity starter — TS/JS form (DX P1-5).
//
// Ties P1-4 (client.credentials) to P1-3b (@infrix/prover): derive a DID,
// then prove a fact FROM a credential's claim ("age >= 21") without revealing
// the age — entirely client-side, no node. In a published app you would import
// '@infrix/client' and '@infrix/prover'; here we import the in-repo builds.
//
// Build the client first:  (cd typescript && npm run build)
// Then run:                node examples/identity-starter.mjs

import { generateKeyPairSync } from 'node:crypto';
import { InfrixClient } from '../typescript/dist/index.js';
import { loadProver } from '../packages/prover/src/index.js';

function holderKey() {
  const jwk = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
  return new Uint8Array(Buffer.concat([Buffer.from(jwk.d, 'base64url'), Buffer.from(jwk.x, 'base64url')]));
}

// createDID is offline — no connection is made.
const client = new InfrixClient('local', { actor: 'acc://alice.acme', purpose: 'demo' });
const holderDID = client.credentials.createDID('acc://alice.acme');
console.log('1. holder DID (offline):', holderDID);

// A credential the holder possesses. In production this is issued by a node
// (client.credentials.issue → vc.issue); offline we use its claim set directly.
const vc = { credentialSubject: { id: holderDID, age: '25', tier: '2' } };
console.log('2. credential claim age =', vc.credentialSubject.age, '(stays private)');

// Selective disclosure in one call: present() reads the named claim (age) as the
// private witness and proves the predicate via the WASM prover.
const prover = await loadProver();
const envelope = await client.credentials.present(
  vc,
  { predicate: 'threshold_gte', publicInputs: [21], claimInputs: ['age'], holderSigner: holderKey() },
  prover
);
console.log('3. proved age >= 21 —', 'reveals 25:', JSON.stringify(envelope).includes('"25"'));

const result = await prover.verify(envelope);
console.log('4. verify:', result.valid);

process.exit(result.valid && !JSON.stringify(envelope).includes('"25"') ? 0 : 1);

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as nodeCrypto from 'node:crypto';

import { fromHex, toHex, sha256, signEd25519 } from './crypto';
import { governanceSignatureMetadataHash, governanceTransactionHash, signGovernanceHalf, GovernanceSigningMaterial } from './governance-signing';

interface Vector {
  name: string;
  account: string;
  page: string;
  planHash: string;
  bundleId: string;
  pageVersion: number;
  timestamp: number;
  keySeed: string;
  payload: string;
  publishedTransaction?: string;
  transaction?: string;
  transactionHash: string;
  signature: string;
  metadataHash: string;
  signingHash: string;
}

// core's shared vectors, copied byte-identical (core pkg/l0/proofcapture/testdata/governance-signing-vectors.json, written by the Go encoder)
const vectors: Vector[] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'testdata', 'governance-signing-vectors.json'), 'utf8'));

// the wallet's key envelope (IFRXED1 || pkcs8 length || pkcs8 || public key) for an Ed25519 seed
function envelopeFromSeed(seedHex: string): Uint8Array {
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(seedHex, 'hex')]);
  const key = nodeCrypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  const spki = nodeCrypto.createPublicKey(key).export({ format: 'der', type: 'spki' }) as Buffer;
  const pub = spki.subarray(spki.length - 32);
  return new Uint8Array(Buffer.concat([Buffer.from('IFRXED1'), Buffer.from([pkcs8.length >> 8, pkcs8.length & 0xff]), pkcs8, pub]));
}

function material(v: Vector, transaction?: string): GovernanceSigningMaterial {
  return { account: v.account, page: v.page, bundleId: v.bundleId, payload: v.payload, pageVersion: v.pageVersion, transaction, transactionHash: transaction ? v.transactionHash : undefined };
}

test('the vectors are present: an initiator and a co-signer at least', () => {
  assert.ok(vectors.length >= 3);
  assert.ok(vectors.some((v) => v.transaction) && vectors.some((v) => v.publishedTransaction));
});

for (const v of vectors) {
  test(`governance half reproduces the Go encoder byte for byte: ${v.name}`, async () => {
    const key = envelopeFromSeed(v.keySeed);
    const half = await signGovernanceHalf(material(v, v.publishedTransaction), fromHex(v.planHash), BigInt(v.timestamp), key.slice(key.length - 32), (m) => signEd25519(key, m));
    assert.equal(half.governanceSignature, v.signature);
    assert.equal(half.governanceTransaction, v.transaction ?? '');
    const pub = key.slice(key.length - 32);
    const md = await governanceSignatureMetadataHash(pub, v.page, v.pageVersion, BigInt(v.timestamp));
    assert.equal(toHex(md), v.metadataHash);
    assert.equal(toHex(await sha256(new Uint8Array([...md, ...fromHex(v.transactionHash)]))), v.signingHash);
  });
}

test('the initiator transaction hashes to the vector hash', async () => {
  const v = vectors.find((x) => x.transaction)!;
  const tx = fromHex(v.transaction!);
  // the initiator is the last 32 bytes of the header (field 2), which follows field 1 and its length
  const headerLen = tx[1];
  const initiator = tx.slice(2 + headerLen - 32, 2 + headerLen);
  const h = await governanceTransactionHash(v.account, initiator, fromHex(v.payload));
  assert.equal(toHex(h), v.transactionHash);
});

test('a published transaction that is not exactly the plan approval is refused', async () => {
  const v = vectors.find((x) => x.publishedTransaction)!;
  const key = envelopeFromSeed(v.keySeed);
  const tampered = fromHex(v.publishedTransaction!);
  tampered[tampered.length - 1] ^= 0x01;
  await assert.rejects(signGovernanceHalf(material(v, toHex(tampered)), fromHex(v.planHash), BigInt(v.timestamp), key.slice(key.length - 32), (m) => signEd25519(key, m)), /not exactly the WriteData/);
  await assert.rejects(signGovernanceHalf({ ...material(v, v.publishedTransaction), transactionHash: '00'.repeat(32) }, fromHex(v.planHash), BigInt(v.timestamp), key.slice(key.length - 32), (m) => signEd25519(key, m)), /hashes to/);
  const other = fromHex(v.planHash);
  other[0] ^= 0xff;
  await assert.rejects(signGovernanceHalf(material(v, v.publishedTransaction), other, BigInt(v.timestamp), key.slice(key.length - 32), (m) => signEd25519(key, m)), /is not the approval of plan/);
});

// THE WALLET SIGNS THE GOVERNANCE HALF (core KNOWN-LIMITS L3160): approveIntent reads the governance material beside the approval material and
// submits, as the first approver, the initiated transaction and its signature under the governance page, a signature that verifies over
// sha256(metadata hash || transaction hash); with no governance material it submits no governance half
test('approveIntent submits the governance half the material asks for', async () => {
  const { InfrixWallet } = await import('./wallet');
  const { approvalSigningDigest } = await import('./approval-signing');
  const { verifyEd25519 } = await import('./crypto');
  const v = vectors.find((x) => x.transaction)!;
  const adi = 'acc://s28ch-approver.acme';
  const realFetch = globalThis.fetch;
  for (const withGovernance of [true, false]) {
    const wallet = new InfrixWallet(adi, { rpcUrl: 'http://wallet.test/rpc' });
    const info = await wallet.generateKey();
    const material: Record<string, unknown> = {
      workflowId: 'intent-s28ch', stageId: 'stage-1', planHash: v.planHash, simulationHash: '00'.repeat(32), signerIdentity: adi, keyPageRef: adi + '/book/1', digest: '',
    };
    material.digest = await approvalSigningDigest(material as never);
    if (withGovernance) material.governance = { account: v.account, page: v.page, bundleId: v.bundleId, payload: v.payload, pageVersion: v.pageVersion };
    let submitted: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
      const req = JSON.parse(init.body);
      const result = req.method === 'approval.signing' ? material : ((submitted = req.params), { approved: true });
      return { status: 200, json: async () => ({ jsonrpc: '2.0', id: req.id, result }) };
    }) as never;
    try {
      await wallet.approveIntent('intent-s28ch', { keyPageRef: adi + '/book/1', rationale: 'S28ch: the wallet signs the governance half' });
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.ok(submitted);
    if (!withGovernance) {
      assert.equal(submitted!.governanceTransaction, undefined);
      assert.equal(submitted!.governanceSignature, undefined);
      continue;
    }
    const tx = fromHex(submitted!.governanceTransaction as string);
    const sig = fromHex(submitted!.governanceSignature as string);
    const headerLen = tx[1];
    const initiator = tx.slice(2 + headerLen - 32, 2 + headerLen);
    const txHash = await governanceTransactionHash(v.account, initiator, fromHex(v.payload));
    // the signature: type, public key (field 2), signature (field 3), signer (4), version (5), timestamp (6), transaction hash (8)
    assert.deepEqual(Array.from(sig.slice(0, 4)), [0x01, 0x02, 0x02, 0x20]);
    const pubKey = sig.slice(4, 36);
    assert.deepEqual(Array.from(pubKey), Array.from(info.publicKey));
    const raw = sig.slice(38, 102);
    let i = 102 + 2 + sig[103]; // past field 4
    assert.equal(sig[i], 0x05);
    i += 2; // version 1
    assert.equal(sig[i], 0x06);
    i++;
    let ts = 0n;
    for (let shift = 0n; ; shift += 7n, i++) {
      ts |= BigInt(sig[i] & 0x7f) << shift;
      if ((sig[i] & 0x80) === 0) break;
    }
    const md = await governanceSignatureMetadataHash(pubKey, v.page, v.pageVersion, ts);
    assert.deepEqual(Array.from(initiator), Array.from(md), 'the first approver initiates: the header names its signature metadata');
    assert.ok(await verifyEd25519(pubKey, await sha256(new Uint8Array([...md, ...txHash])), raw));
    assert.equal(toHex(sig.slice(sig.length - 32)), toHex(txHash));
  }
});

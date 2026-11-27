/**
 * The approver's governance half (brief 28ch row 5, core KNOWN-LIMITS L3160): the Accumulate WriteData an approval is executed as, and the
 * approver's ED25519 signature of it under the app's governance key page. This is the TypeScript port of core's ONE client body,
 * workflow.GovernanceSigning.Sign (proofcapture.InitiateGovernance / SignGovernanceFor), byte for byte:
 *
 * - before any approver submitted the transaction (the material publishes none), the approver INITIATES it: a WriteData of the approval payload
 *   (`infrix:approval:v1` || planHash || bundleId, one double-hash entry item) to the governance data account, whose header names the
 *   initiator, the hash of this approver's signature metadata;
 * - afterwards it CHECKS the published transaction is exactly that WriteData (nothing else in the header or the body) and that it hashes to the
 *   published hash, then signs it.
 *
 * Both sign under the governance page at the published page version with the key the approval itself is signed with. The encoding is
 * Accumulate's binary encoding (field-numbered, uvarint lengths, an empty object written as 0x80) and the transaction hash is Accumulate's
 * WriteData hash. Every output is pinned by core's shared vectors (core pkg/l0/proofcapture/testdata/governance-signing-vectors.json, copied
 * byte-identical as src/testdata/governance-signing-vectors.json and checked by governance-signing.test.ts).
 */

import { fromHex, sha256, toHex } from './crypto';

/** Signs a message with the approver's Ed25519 key (the wallet's key store, or signEd25519 over a key envelope). */
export type Ed25519Signer = (message: Uint8Array) => Promise<Uint8Array>;

/** The governance half of the approval-signing material (`approval.signing` / GET /v4/intents/approval-signing: `governance`). */
export interface GovernanceSigningMaterial {
  account: string;
  page: string;
  bundleId: string;
  payload: string;
  pageVersion: number;
  transaction?: string;
  transactionHash?: string;
}

/** What an approval door takes beside the approval signature: the transaction (the initiator's only) and the governance signature, hex. */
export interface GovernanceHalf {
  governanceTransaction: string;
  governanceSignature: string;
}

export const GOVERNANCE_APPROVAL_TAG = 'infrix:approval:v1';

const TX_TYPE_WRITE_DATA = 0x05;
const DATA_ENTRY_DOUBLE_HASH = 0x03;
const SIGNATURE_TYPE_ED25519 = 0x02;
const EMPTY_OBJECT = 0x80;

class Writer {
  private parts: number[] = [];
  private uvarint(v: bigint): void {
    let x = v;
    while (x >= 0x80n) {
      this.parts.push(Number((x & 0x7fn) | 0x80n));
      x >>= 7n;
    }
    this.parts.push(Number(x));
  }
  private field(n: number): void {
    this.uvarint(BigInt(n));
  }
  uint(n: number, v: number | bigint): void {
    this.field(n);
    this.uvarint(BigInt(v));
  }
  bytes(n: number, v: Uint8Array): void {
    this.field(n);
    this.uvarint(BigInt(v.length));
    for (const b of v) this.parts.push(b);
  }
  string(n: number, v: string): void {
    this.bytes(n, new TextEncoder().encode(v));
  }
  hash(n: number, v: Uint8Array): void {
    if (v.length !== 32) throw new Error('a hash field must be 32 bytes');
    this.field(n);
    for (const b of v) this.parts.push(b);
  }
  done(): Uint8Array {
    return this.parts.length === 0 ? new Uint8Array([EMPTY_OBJECT]) : new Uint8Array(this.parts);
  }
}

function concat(...xs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(xs.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of xs) {
    out.set(x, o);
    o += x.length;
  }
  return out;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function uint64(v: number | bigint, name: string): bigint {
  const b = BigInt(v);
  if (b < 0n || b > 0xffffffffffffffffn) throw new Error(`${name} must be an unsigned 64-bit integer`);
  return b;
}

/** The approval payload a governance WriteData carries: the tag, the 32-byte plan hash and the bundle id. */
export function governanceApprovalPayload(planHash: Uint8Array, bundleId: string): Uint8Array {
  if (planHash.length !== 32) throw new Error('the plan hash must be 32 bytes');
  return concat(new TextEncoder().encode(GOVERNANCE_APPROVAL_TAG), planHash, new TextEncoder().encode(bundleId));
}

function writeDataBody(payload: Uint8Array | null): Uint8Array {
  const w = new Writer();
  w.uint(1, TX_TYPE_WRITE_DATA);
  if (payload !== null) {
    const e = new Writer();
    e.uint(1, DATA_ENTRY_DOUBLE_HASH);
    e.bytes(2, payload);
    w.bytes(2, e.done());
  }
  return w.done();
}

function header(principal: string, initiator: Uint8Array): Uint8Array {
  const w = new Writer();
  w.string(1, principal);
  w.hash(2, initiator);
  return w.done();
}

/** The binary governance transaction: the WriteData of payload to account, initiated by initiator. */
export function encodeGovernanceTransaction(account: string, initiator: Uint8Array, payload: Uint8Array): Uint8Array {
  const w = new Writer();
  w.bytes(1, header(account, initiator));
  w.bytes(2, writeDataBody(payload));
  return w.done();
}

/** Accumulate's hash of a WriteData transaction: sha256(sha256(header) || MerkleRoot(sha256(body without entry), entry hash)). */
export async function governanceTransactionHash(account: string, initiator: Uint8Array, payload: Uint8Array): Promise<Uint8Array> {
  const entryHash = await sha256(await sha256(payload)); // one item: its merkle root is its own hash
  const bodyHash = await sha256(concat(await sha256(writeDataBody(null)), entryHash));
  return sha256(concat(await sha256(header(account, initiator)), bodyHash));
}

interface Ed25519Fields {
  publicKey: Uint8Array;
  signature?: Uint8Array;
  signer: string;
  signerVersion: bigint;
  timestamp: bigint;
  transactionHash?: Uint8Array;
}

function encodeEd25519Signature(s: Ed25519Fields): Uint8Array {
  const w = new Writer();
  w.uint(1, SIGNATURE_TYPE_ED25519);
  w.bytes(2, s.publicKey);
  if (s.signature && s.signature.length > 0) w.bytes(3, s.signature);
  w.string(4, s.signer);
  if (s.signerVersion !== 0n) w.uint(5, s.signerVersion);
  if (s.timestamp !== 0n) w.uint(6, s.timestamp);
  if (s.transactionHash) w.hash(8, s.transactionHash);
  return w.done();
}

/** The hash of an ED25519 signature's metadata (the signature without its signature bytes and transaction hash): the initiator a transaction
 * header names, and the first half of what the key signs (sha256(metadata hash || transaction hash)). */
export async function governanceSignatureMetadataHash(publicKey: Uint8Array, page: string, version: number | bigint, timestamp: number | bigint): Promise<Uint8Array> {
  return sha256(encodeEd25519Signature({ publicKey, signer: page, signerVersion: uint64(version, 'the page version'), timestamp: uint64(timestamp, 'the timestamp') }));
}

async function signUnder(txHash: Uint8Array, page: string, version: bigint, timestamp: bigint, publicKey: Uint8Array, sign: Ed25519Signer): Promise<Uint8Array> {
  const md = await governanceSignatureMetadataHash(publicKey, page, version, timestamp);
  const sig = await sign(await sha256(concat(md, txHash)));
  if (sig.length !== 64) throw new Error('the Ed25519 signer returned a signature that is not 64 bytes');
  return encodeEd25519Signature({ publicKey, signature: sig, signer: page, signerVersion: version, timestamp, transactionHash: txHash });
}

function checkMaterial(m: GovernanceSigningMaterial, planHash: Uint8Array): Uint8Array {
  if (!m.account || !m.page || !m.bundleId) throw new Error('the governance material names no account, page or bundle id');
  if (!Number.isSafeInteger(m.pageVersion) || m.pageVersion <= 0) throw new Error('the governance material names no page version');
  const payload = governanceApprovalPayload(planHash, m.bundleId);
  if (toHex(payload) !== m.payload.toLowerCase()) {
    throw new Error(`the published governance payload ${m.payload} is not the approval of plan ${toHex(planHash)} for bundle ${m.bundleId}`);
  }
  return payload;
}

/**
 * The approver's governance half, as workflow.GovernanceSigning.Sign computes it: with no published transaction it initiates one and returns it
 * with the signature; with one it checks that transaction is exactly the plan's WriteData hashing to the published hash, and returns only the
 * signature. publicKey and sign are the approver's Ed25519 key (the key the approval is signed with); timestamp is the signature's timestamp
 * (microseconds, as the node's own clients sign).
 */
export async function signGovernanceHalf(m: GovernanceSigningMaterial, planHash: Uint8Array, timestamp: number | bigint, publicKey: Uint8Array, sign: Ed25519Signer): Promise<GovernanceHalf> {
  if (publicKey.length !== 32) throw new Error('the approver public key must be 32 bytes');
  const payload = checkMaterial(m, planHash);
  const version = uint64(m.pageVersion, 'the page version');
  const ts = uint64(timestamp, 'the timestamp');
  if (ts === 0n) throw new Error('the governance signature needs a timestamp');
  if (!m.transaction) {
    const initiator = await governanceSignatureMetadataHash(publicKey, m.page, version, ts);
    const txHash = await governanceTransactionHash(m.account, initiator, payload);
    const sig = await signUnder(txHash, m.page, version, ts, publicKey, sign);
    return { governanceTransaction: toHex(encodeGovernanceTransaction(m.account, initiator, payload)), governanceSignature: toHex(sig) };
  }
  const published = fromHex(m.transaction);
  const initiator = publishedInitiator(published, m.account);
  if (!equalBytes(published, encodeGovernanceTransaction(m.account, initiator, payload))) {
    throw new Error(`the published governance transaction is not exactly the WriteData of the approval of plan ${toHex(planHash)} to ${m.account}`);
  }
  const txHash = await governanceTransactionHash(m.account, initiator, payload);
  if (toHex(txHash) !== (m.transactionHash ?? '').toLowerCase()) {
    throw new Error(`the published governance transaction hashes to ${toHex(txHash)}, not the published hash ${m.transactionHash}`);
  }
  const sig = await signUnder(txHash, m.page, version, ts, publicKey, sign);
  return { governanceTransaction: '', governanceSignature: toHex(sig) };
}

/** Reads the initiator out of a published transaction's header, whose principal must be account; the caller re-encodes and compares the whole. */
function publishedInitiator(tx: Uint8Array, account: string): Uint8Array {
  const want = header(account, new Uint8Array(32));
  // field 1 (the header), its uvarint length, then the header: field 1 (the principal string), field 2 (the 32-byte initiator)
  if (tx.length < 2 + want.length || tx[0] !== 0x01) throw new Error('the published governance transaction does not start with its header');
  let len = 0;
  let shift = 0;
  let i = 1;
  for (; i < tx.length; i++) {
    len |= (tx[i] & 0x7f) << shift;
    shift += 7;
    if ((tx[i] & 0x80) === 0) break;
  }
  i++;
  if (len !== want.length) throw new Error(`the published governance transaction's header is ${len} bytes; a header naming only ${account} and its initiator is ${want.length}`);
  const h = tx.slice(i, i + len);
  const prefix = want.slice(0, want.length - 32);
  if (!equalBytes(h.slice(0, prefix.length), prefix)) throw new Error(`the published governance transaction is not for the governance account ${account}`);
  return h.slice(prefix.length);
}

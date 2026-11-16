// THE STATEMENT CHAINS OF did:infrix's anon AND chain PROFILES, verified in TypeScript (infrix core part 25g, row H3, ledger raise L2557; core: pkg/did/statementchain and
// pkg/did/chain_verifiers.go, the source; the Go second implementation is infrix-verify's didchain package). Every rule is core's, stated as the bytes a verifier reads:
//
// THE STATEMENT DIGEST of an entry:
//   SHA-256( "infrix:did-statement:v1\x00" || lp(DID) || lp(NetworkID) || lp(VersionID) || be64(Sequence) || lp(PredecessorStorageHash) ||
//            be64(count) || for each operation: lp(type) || lp(JCS(the stored operation without its "type" member)) || lp(DocumentHash) )
// where lp(x) is the 8-byte big-endian length of x and x, and JCS is canonicalJson.ts.
//
// A REGISTRY ENTRY is the JSON of a v2 envelope (version 2, hashAlgorithm "sha-256/jcs-rfc8785"); its document hash is SHA-256 of JCS of the "document" member AS STORED; its storage hash
// is SHA-256("infrix:did-storage-entry:v1\x00" || the entry's bytes). THE CHAIN and THE AUTHORITY are core's (see verifyHistory and the authorizers below).
//
// WHAT THIS MODULE DOES NOT CHECK, AND CORE DOES: that each document is what its statement's typed operations yield from the document before (core's resolver applies the operations).

import { sha256 } from '@noble/hashes/sha2';
import { keccak_256 } from '@noble/hashes/sha3';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { bytesToHex, concatBytes } from '@noble/hashes/utils';
import { secp256k1 } from '@noble/curves/secp256k1';
import { ed25519 } from '@noble/curves/ed25519';
import { CanonicalJSONError, JValue, canonicalizeJSON, parseJSON, writeCanonical } from './canonicalJson';
import { base58Decode, bech32Decode, bech32Encode, convertBits, parseBitcoinAddress } from './accounts';
import { formatChainDID } from './v1';

const enc = new TextEncoder();
export const STATEMENT_DOMAIN = 'infrix:did-statement:v1\u0000';
export const STORAGE_DOMAIN = 'infrix:did-storage-entry:v1\u0000';
export const HASH_ALGORITHM = 'sha-256/jcs-rfc8785';
export const CHAIN_STATEMENT_MESSAGE_PREFIX = 'infrix:did-statement:v1:';
export const CHAIN_SCHEMES: Record<string, string> = { eip155: 'eip155:eip191', solana: 'solana:ed25519', bip122: 'bip122:bip137', cosmos: 'cosmos:adr036' };

/** The refusal classes: a history that is not a chain of authorized statements, an entry that is not a registry entry of the DID, and a signature the namespace verifier refuses. */
export type ChainRefusal = 'statement-chain-refused' | 'anon-history-refused' | 'chain-signature-refused';

export class StatementChainError extends Error {
  constructor(public readonly refusal: ChainRefusal, message: string) {
    super(message);
    this.name = 'StatementChainError';
  }
}
const entryRefuse = (m: string): never => { throw new StatementChainError('anon-history-refused', m); };
const chainRefuse = (m: string): never => { throw new StatementChainError('statement-chain-refused', m); };
const sigRefuse = (m: string): never => { throw new StatementChainError('chain-signature-refused', m); };

export interface StoredOperation { type: string; members: Map<string, JValue> }

export interface Entry {
  did: string; networkId: string; accountUrl: string; versionId: string; sequence: bigint;
  predecessorStorageHash: Uint8Array; operations: StoredOperation[]; documentHash: Uint8Array; storageHash: Uint8Array;
  deactivated: boolean; document: JValue; scheme: string; signer: Uint8Array; signature: Uint8Array;
}

function lp(parts: Uint8Array[], b: Uint8Array): void {
  parts.push(be64(BigInt(b.length)), b);
}
function be64(v: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, v);
  return out;
}

/** The statement digest of an entry. */
export function statementDigest(e: Entry): Uint8Array {
  const parts: Uint8Array[] = [enc.encode(STATEMENT_DOMAIN)];
  lp(parts, enc.encode(e.did));
  lp(parts, enc.encode(e.networkId));
  lp(parts, enc.encode(e.versionId));
  parts.push(be64(e.sequence));
  lp(parts, e.predecessorStorageHash);
  parts.push(be64(BigInt(e.operations.length)));
  for (const op of e.operations) {
    const members = new Map([...op.members].filter(([name]) => name !== 'type'));
    let canonical: Uint8Array;
    try {
      canonical = enc.encode(writeCanonical({ obj: members }));
    } catch (err) {
      return chainRefuse(`operation ${op.type} has no canonical form: ${(err as Error).message}`);
    }
    lp(parts, enc.encode(op.type));
    lp(parts, canonical);
  }
  lp(parts, e.documentHash);
  return sha256(concatBytes(...parts));
}

export function storageHash(raw: Uint8Array): Uint8Array {
  return sha256(concatBytes(enc.encode(STORAGE_DOMAIN), raw));
}

function b64(v: JValue | undefined, what: string): Uint8Array {
  if (typeof v !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(v) || v.length % 4 !== 0) return entryRefuse(`${what} is not base64`);
  return Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
}
function str(v: JValue | undefined, what: string): string {
  if (typeof v !== 'string') return entryRefuse(`${what} is not a string`);
  return v;
}
function obj(v: JValue | undefined, what: string, allowed?: string[]): Map<string, JValue> {
  if (v === null || typeof v !== 'object' || Array.isArray(v) || !('obj' in v)) return entryRefuse(`${what} is not a JSON object`);
  if (allowed) for (const name of v.obj.keys()) if (!allowed.includes(name)) entryRefuse(`${what} carries the member ${JSON.stringify(name)}, which it does not define`);
  return v.obj;
}
function rawText(v: JValue): string {
  return writeCanonical(v);
}

/** Read one registry entry's bytes: the v2 envelope of the canonical hash, its document hashed as stored, its bindings and its statement. */
export function decodeEntry(raw: Uint8Array): Entry {
  let parsed: JValue;
  try {
    parsed = parseJSON(new TextDecoder().decode(raw));
    writeCanonical(parsed);
  } catch (err) {
    return entryRefuse(`the entry is not I-JSON: ${(err as Error).message}`);
  }
  const top = obj(parsed, 'the entry', ['document', 'metadata', 'hash', 'hashAlgorithm', 'version', 'identity', 'predecessor', 'migration', 'statement']);
  for (const required of ['document', 'metadata', 'hash', 'hashAlgorithm', 'version', 'identity', 'statement']) if (!top.has(required)) entryRefuse(`the entry carries no ${required}`);
  if (top.has('migration')) entryRefuse('a registry entry carries no migration evidence');
  const version = top.get('version');
  if (!(version && typeof version === 'object' && 'num' in version && version.num === '2')) entryRefuse('the entry is not version 2');
  if (top.get('hashAlgorithm') !== HASH_ALGORITHM) entryRefuse(`the entry's hash algorithm is not ${HASH_ALGORITHM}`);
  const document = top.get('document')!;
  const documentHash = b64(top.get('hash'), 'hash');
  if (bytesToHex(sha256(canonicalizeJSON(rawText(document)))) !== bytesToHex(documentHash)) entryRefuse('the stored document hash does not match the document as stored');
  const metadata = obj(top.get('metadata'), 'the metadata');
  const versionId = str(metadata.get('versionId'), 'metadata.versionId');
  if (versionId.trim() === '') entryRefuse('the metadata carries no version id');
  const deactivatedValue = metadata.get('deactivated');
  if (deactivatedValue !== undefined && typeof deactivatedValue !== 'boolean') entryRefuse('metadata.deactivated is not a boolean');
  const identity = obj(top.get('identity'), 'the identity binding', ['canonicalDid', 'accountUrl', 'networkId', 'aliases']);
  const did = str(identity.get('canonicalDid'), 'identity.canonicalDid');
  if (obj(document, 'the document').get('id') !== did) entryRefuse('the document names another DID than the identity binding');
  let predecessorStorageHash: Uint8Array = new Uint8Array();
  if (top.has('predecessor')) {
    const p = obj(top.get('predecessor'), 'the predecessor binding', ['versionId', 'storageFormatVersion', 'documentHash', 'storageHash']);
    const pv = str(p.get('versionId'), 'predecessor.versionId');
    const pd = b64(p.get('documentHash'), 'predecessor.documentHash');
    predecessorStorageHash = b64(p.get('storageHash'), 'predecessor.storageHash');
    if (pv.trim() === '' || pd.length !== 32 || predecessorStorageHash.length !== 32) entryRefuse('the predecessor binding is not a version and two hashes');
  }
  const statement = obj(top.get('statement'), 'the statement', ['sequence', 'operations', 'scheme', 'signer', 'signature']);
  const seq = statement.get('sequence');
  if (!(seq && typeof seq === 'object' && 'num' in seq && /^(0|[1-9][0-9]*)$/.test(seq.num) && BigInt(seq.num) < 2n ** 64n)) entryRefuse('statement.sequence is not an unsigned integer');
  const operations: StoredOperation[] = [];
  const ops = statement.get('operations');
  if (ops !== undefined) {
    if (!Array.isArray(ops)) entryRefuse('statement.operations is not an array');
    (ops as JValue[]).forEach((op, i) => {
      const members = obj(op, `operation ${i}`);
      const type = members.get('type');
      if (typeof type !== 'string' || type === '') entryRefuse(`operation ${i} names no type`);
      operations.push({ type: type as string, members });
    });
  }
  return {
    did, networkId: str(identity.get('networkId'), 'identity.networkId'), accountUrl: str(identity.get('accountUrl'), 'identity.accountUrl'), versionId,
    sequence: BigInt((seq as { num: string }).num), predecessorStorageHash, operations, documentHash, storageHash: storageHash(raw), deactivated: deactivatedValue === true,
    document, scheme: str(statement.get('scheme'), 'statement.scheme'), signer: b64(statement.get('signer'), 'statement.signer'), signature: b64(statement.get('signature'), 'statement.signature'),
  };
}

export interface Authorizer {
  scheme(e: Entry): string;
  authorize(previous: Entry | undefined, next: Entry, digest: Uint8Array): void;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Hold a history to the chain rules and to the authorizer, entry by entry (core's statementchain.Verify). */
export function verifyHistory(did: string, networkId: string, history: Entry[], authorizer: Authorizer): void {
  if (history.length === 0) chainRefuse('the history holds no entry');
  history.forEach((e, i) => {
    const previous = i > 0 ? history[i - 1] : undefined;
    if (e.did !== did) chainRefuse(`entry ${i} names ${e.did}, the history is of ${did}`);
    if (e.networkId !== networkId) chainRefuse(`entry ${i} names network ${e.networkId}, the history is of ${networkId}`);
    if (e.documentHash.length === 0) chainRefuse(`entry ${i} binds no document`);
    if (!previous) {
      if (e.predecessorStorageHash.length !== 0 || e.operations.length !== 0 || e.sequence !== 1n || e.versionId !== '1' || e.deactivated) {
        chainRefuse('the first entry is not a genesis (version 1, sequence 1, no predecessor, no operation, active)');
      }
    } else {
      if (!equalBytes(e.predecessorStorageHash, previous.storageHash)) chainRefuse(`entry ${i} does not extend the exact storage hash of the entry before it`);
      if (e.sequence !== previous.sequence + 1n) chainRefuse(`entry ${i}'s sequence is not the previous plus one`);
      if (e.versionId !== String(previous.sequence + 1n)) chainRefuse(`entry ${i}'s version is not the previous plus one`);
      if (e.operations.length === 0) chainRefuse(`entry ${i} carries no operation`);
      const deactivates = e.operations.filter((o) => o.type === 'deactivate').length;
      const reactivates = e.operations.filter((o) => o.type === 'reactivate').length;
      if (deactivates + reactivates > 0 && e.operations.length !== 1) chainRefuse(`entry ${i}: a lifecycle operation is its own statement`);
      if (previous.deactivated && reactivates === 0) chainRefuse(`entry ${i} changes a deactivated subject without a reactivation`);
      if (reactivates > 0 && !previous.deactivated) chainRefuse(`entry ${i} reactivates a subject that is active`);
      const want = (previous.deactivated || deactivates > 0) && reactivates === 0;
      if (e.deactivated !== want) chainRefuse(`entry ${i} says deactivated=${e.deactivated}, its operations yield ${want}`);
    }
    const scheme = authorizer.scheme(e);
    if (scheme === '' || e.scheme !== scheme) chainRefuse(`entry ${i}'s scheme ${e.scheme} is not the authorizer's ${scheme}`);
    const digest = statementDigest(e);
    try {
      authorizer.authorize(previous, e, digest);
    } catch (err) {
      chainRefuse(`entry ${i}'s signature is not accepted: ${(err as Error).message}`);
    }
  });
}

// ---- the anon profile ----

/** The Ed25519 keys of a document's authentication relationship that name Multikey verification methods of the document. */
export function authenticationKeys(document: JValue): Uint8Array[] {
  const doc = obj(document, 'the document');
  const auth = doc.get('authentication');
  const refs = typeof auth === 'string' ? [auth] : Array.isArray(auth) ? auth.filter((r): r is string => typeof r === 'string') : [];
  const methods = Array.isArray(doc.get('verificationMethod')) ? (doc.get('verificationMethod') as JValue[]) : [];
  const keys: Uint8Array[] = [];
  for (const ref of refs) {
    for (const m of methods) {
      if (m === null || typeof m !== 'object' || Array.isArray(m) || !('obj' in m)) continue;
      const mb = m.obj.get('publicKeyMultibase');
      if (m.obj.get('id') !== ref || m.obj.get('type') !== 'Multikey' || typeof mb !== 'string' || !mb.startsWith('z')) continue;
      const raw = base58Decode(mb.slice(1));
      if (raw && raw.length === 34 && raw[0] === 0xed && raw[1] === 0x01) keys.push(raw.slice(2));
    }
  }
  return keys;
}

export const anonAuthorizer: Authorizer = {
  scheme: () => 'ed25519',
  authorize(previous, next, digest) {
    const authority = previous ?? next;
    if (next.signer.length !== 32 || next.signature.length !== 64) throw new Error('the signer and signature are not 32 and 64 bytes (Ed25519)');
    if (!authenticationKeys(authority.document).some((k) => equalBytes(k, next.signer))) throw new Error(`the signer is not an authentication key of version ${authority.versionId}`);
    if (!ed25519.verify(next.signature, digest, next.signer, { zip215: false })) throw new Error('the signature does not verify over the statement digest');
  },
};

export interface AnonHistory { did: string; registry: string; entries: string[] }
export interface AnonVerdict {
  verified: boolean; did: string; networkId: string; account: string; entries: number; tailVersionId: string; tailDeactivated: boolean; tailStorageHash: string; signers: string[];
}

/** Verify an anon history (core's VerifyAnonHistoryFile, but for the documents re-derived from the operations). */
export function verifyAnonHistory(h: AnonHistory): AnonVerdict {
  if (!h || h.entries.length === 0) entryRefuse('the history holds no entries');
  const m = /^did:infrix:v1:anon:(g1-[0-9a-f]{64}):([0-9a-f]{64})$/.exec(h.did);
  if (!m) return entryRefuse(`${h.did} is not a canonical did:infrix:v1:anon DID`);
  const [, network, subject] = m;
  if (!/^acc:\/\/[^/]+$/.test(h.registry)) entryRefuse(`registry ${h.registry} is not an Accumulate identity URL`);
  const account = `${h.registry}/did-anon-${subject}`;
  const history = h.entries.map((encoded, i) => {
    const e = decodeEntry(b64(encoded, `entry ${i}`));
    if (e.did !== h.did || e.networkId !== network || e.accountUrl !== account) entryRefuse(`entry ${i} is bound to ${e.did} on ${e.networkId} at ${e.accountUrl}, not to ${account}`);
    return e;
  });
  verifyHistory(h.did, network, history, anonAuthorizer);
  const tail = history[history.length - 1];
  const signers: string[] = [];
  for (const e of history) if (!signers.includes(bytesToHex(e.signer))) signers.push(bytesToHex(e.signer));
  return { verified: true, did: h.did, networkId: network, account, entries: history.length, tailVersionId: tail.versionId, tailDeactivated: tail.deactivated, tailStorageHash: bytesToHex(tail.storageHash), signers };
}

// ---- the chain profile ----

export interface ChainAccount { namespace: string; reference: string; account: string }

/** Read a canonical did:infrix:v1:chain DID (the formatter's own canonical spelling, or refused). */
export function parseChainDID(did: string): ChainAccount {
  const parts = did.split(':');
  if (parts.length !== 7 || parts.slice(0, 4).join(':') !== 'did:infrix:v1:chain') return sigRefuse(`${did} is not a did:infrix:v1:chain DID`);
  let canonical: string;
  try {
    canonical = formatChainDID(parts[4], parts[5], parts[6]);
  } catch (err) {
    return sigRefuse(`${did}: ${(err as Error).message}`);
  }
  if (canonical !== did) sigRefuse(`${did} is not canonical (${canonical})`);
  return { namespace: parts[4], reference: parts[5], account: parts[6] };
}

export function chainStatementMessage(digest: Uint8Array): Uint8Array {
  return enc.encode(CHAIN_STATEMENT_MESSAGE_PREFIX + bytesToHex(digest));
}

export function eip191PersonalMessageHash(message: Uint8Array): Uint8Array {
  return keccak_256(concatBytes(enc.encode(`\u0019Ethereum Signed Message:\n${message.length}`), message));
}

function varString(b: Uint8Array): Uint8Array {
  const n = b.length;
  const prefix = n < 0xfd ? [n] : n <= 0xffff ? [0xfd, n & 0xff, n >> 8] : [0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  return concatBytes(Uint8Array.from(prefix), b);
}

export function bitcoinMessageHash(message: Uint8Array): Uint8Array {
  return sha256(sha256(concatBytes(varString(enc.encode('Bitcoin Signed Message:\n')), varString(message))));
}

export function cosmosADR036SignDoc(message: Uint8Array, signer: string): Uint8Array {
  const data = btoa(String.fromCharCode(...message));
  return canonicalizeJSON(JSON.stringify({ account_number: '0', chain_id: '', fee: { amount: [], gas: '0' }, memo: '', sequence: '0', msgs: [{ type: 'sign/MsgSignData', value: { data, signer } }] }));
}

export function hash160(b: Uint8Array): Uint8Array {
  return ripemd160(sha256(b));
}

/** Recover the public key of a low-s r || s with a recovery id over a 32-byte hash (refused: zero, at or above n, high s, no key). */
function recoverKey(rs: Uint8Array, recovery: number, hash: Uint8Array) {
  if (rs.length !== 64) return sigRefuse('r || s is not 64 bytes');
  let sig;
  try {
    sig = secp256k1.Signature.fromCompact(rs);
  } catch {
    return sigRefuse('r or s is zero or not below the order of secp256k1');
  }
  if (sig.r === 0n || sig.s === 0n) sigRefuse('r or s is zero');
  if (sig.hasHighS()) sigRefuse('s is in the upper half of the order: the malleated twin of a low-s signature');
  try {
    const key = sig.addRecoveryBit(recovery).recoverPublicKey(hash);
    if (!secp256k1.verify(rs, hash, key.toRawBytes(true), { lowS: true })) throw new Error('no verify');
    return key;
  } catch {
    return sigRefuse('no public key is recovered from the signature');
  }
}

/** Verify that a chain DID's account signed a message in its namespace's standard (core's namespace verifiers, rule for rule). */
export function verifyChainSignature(account: ChainAccount, message: Uint8Array, signer: Uint8Array, signature: Uint8Array): void {
  switch (account.namespace) {
    case 'eip155': {
      if (signature.length !== 65) sigRefuse('an eip155 signature is 65 bytes r || s || v');
      let v = signature[64];
      if (v === 27 || v === 28) v -= 27;
      else if (v !== 0 && v !== 1) sigRefuse(`v is ${v}, want 27 or 28 (or 0 or 1)`);
      const key = recoverKey(signature.subarray(0, 64), v, eip191PersonalMessageHash(message));
      const uncompressed = key.toRawBytes(false);
      if (!equalBytes(signer, uncompressed)) sigRefuse('the signer is not the public key the signature recovers');
      const address = '0x' + bytesToHex(keccak_256(uncompressed.subarray(1)).subarray(12));
      if (address !== account.account) sigRefuse(`the signature recovers address ${address}, the DID names ${account.account}`);
      return;
    }
    case 'solana': {
      const key = base58Decode(account.account);
      if (!key || key.length !== 32) sigRefuse('the solana account is not a 32-byte public key');
      if (!equalBytes(signer, key!)) sigRefuse("the signer is not the account's public key");
      if (signature.length !== 64) sigRefuse('an Ed25519 signature is 64 bytes');
      let ok = false;
      try {
        ok = ed25519.verify(signature, message, key!, { zip215: false });
      } catch {
        ok = false;
      }
      if (!ok) sigRefuse("the Ed25519 signature does not verify under the account's key");
      return;
    }
    case 'bip122': {
      const address = parseBitcoinAddress(account.reference, account.account);
      if (address.kind === 'p2sh') sigRefuse('a P2SH account is not verified by this method: a script hash proves no key without its script');
      if (address.kind !== 'p2pkh' && address.kind !== 'p2wpkh') sigRefuse(`a ${address.kind} account signs by BIP-322, which this method does not verify`);
      if (signature.length !== 65) sigRefuse('a Bitcoin message signature is 65 bytes header || r || s');
      const header = signature[0];
      let kind: string;
      let compressed = true;
      if (header >= 27 && header <= 30) (kind = 'p2pkh'), (compressed = false);
      else if (header >= 31 && header <= 34) kind = 'p2pkh';
      else if (header >= 35 && header <= 38) return sigRefuse(`header ${header} names a P2SH-P2WPKH signature, which this method does not verify`);
      else if (header >= 39 && header <= 42) kind = 'p2wpkh';
      else return sigRefuse(`header ${header} is not a BIP-137 header (27 to 42)`);
      if (kind !== address.kind) sigRefuse(`header ${header} names a ${kind} signature, the account is ${address.kind}`);
      const key = recoverKey(signature.subarray(1), (header - 27) % 4, bitcoinMessageHash(message));
      const serialized = key.toRawBytes(compressed);
      if (!equalBytes(signer, serialized)) sigRefuse('the signer is not the public key the signature recovers');
      if (bytesToHex(hash160(serialized)) !== address.payloadHex) sigRefuse('the signature recovers another key hash than the account commits to');
      return;
    }
    case 'cosmos': {
      let decoded;
      try {
        decoded = bech32Decode(account.account);
      } catch {
        return sigRefuse('the cosmos account is not bech32');
      }
      let payload: number[] = [];
      try {
        payload = convertBits(decoded.data, 5, 8, false);
      } catch {
        payload = [];
      }
      if (payload.length !== 20) sigRefuse('the cosmos account is not a 20-byte account address (a module, interchain or contract address holds no key and signs nothing)');
      if (signer.length !== 33) sigRefuse('the signer is not a 33-byte compressed secp256k1 public key');
      try {
        secp256k1.ProjectivePoint.fromHex(signer);
      } catch {
        sigRefuse('the signer is not a secp256k1 public key');
      }
      if (bech32Encode(decoded.hrp, convertBits(hash160(signer), 8, 5, true), 'bech32') !== account.account) sigRefuse("the signer's address is not the DID's account");
      if (signature.length !== 64) sigRefuse('r || s is not 64 bytes');
      let ok = false;
      try {
        ok = secp256k1.verify(signature, sha256(cosmosADR036SignDoc(message, account.account)), signer, { lowS: true });
      } catch {
        ok = false;
      }
      if (!ok) sigRefuse('the secp256k1 signature does not verify over the ADR-036 sign document (64 bytes r || s, low s)');
      return;
    }
  }
  sigRefuse(`the namespace ${account.namespace} has no verifier`);
}

export const chainAuthorizer: Authorizer = {
  scheme(e) {
    try {
      return CHAIN_SCHEMES[parseChainDID(e.did).namespace] ?? '';
    } catch {
      return '';
    }
  },
  authorize(_previous, next, digest) {
    verifyChainSignature(parseChainDID(next.did), chainStatementMessage(digest), next.signer, next.signature);
  },
};

export { CanonicalJSONError };

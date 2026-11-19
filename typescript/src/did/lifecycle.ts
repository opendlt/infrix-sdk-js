// THE REACTIVATION COMMITMENT AND THE LEDGER TIMES (infrix core part 25j, raise L2573), rule for rule as core's pkg/did/statementchain/lifecycle.go and pkg/did/ledger_time.go, and
// infrix-verify's didchain/lifecycle.go.
//
// A deactivate operation MAY carry reactivationCommitment: the canonical base64 of the SHA-256 of a fresh Ed25519 public key. A deactivation without one is FINAL. A reactivation of a
// committed deactivation carries reactivationKey (the key) and reactivationProof (its Ed25519 signature over the statement digest computed with the reactivate operation's
// reactivationProof member left out), each the canonical base64 of its length. deactivate is the only operation of its statement; reactivate is the first, at most once, and the
// operations after it apply in the same version. An anon reactivation is signed by the committed key itself; a chain one by the account, and proven by the committed key.
//
// A history file MAY carry ledgerTimes (one RFC 3339 whole-second UTC time per entry, the ledger's record of when each landed): every stated updated (whole seconds) is then not after its
// entry's ledger time and not before the entry before it's, and every stated created is the creation's updated (a first entry of version "1") or the first entry's created.

import { sha256 } from '@noble/hashes/sha2';
import { ed25519 } from '@noble/curves/ed25519';
import { JValue } from './canonicalJson';
import { base58Decode } from './accounts';

export type LifecycleRefusal = 'reactivation-final' | 'reactivation-key' | 'reactivation-proof' | 'recovery-key-listed' | 'time-after-ledger' | 'time-before-predecessor' | 'created-time' | 'ledger-time';

export const MEMBER_REACTIVATION_COMMITMENT = 'reactivationCommitment';
export const MEMBER_REACTIVATION_KEY = 'reactivationKey';
export const MEMBER_REACTIVATION_PROOF = 'reactivationProof';

/** A lifecycle operation as an entry stores it. */
export interface LifecycleOperation { type: string; members: Map<string, JValue> }

/** The refusal of a lifecycle or time rule: its name and a sentence; statementChain.ts raises it as a StatementChainError of that name. */
export class LifecycleError extends Error {
  constructor(public readonly refusal: LifecycleRefusal | 'statement-chain-refused', message: string) {
    super(message);
    this.name = 'LifecycleError';
  }
}

const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeB64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
function encodeB64(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b));
}

/** A byte member of a lifecycle operation: absent is undefined; present, the canonical (padded, standard) base64 of exactly size bytes. */
export function lifecycleMember(op: LifecycleOperation, name: string, size: number): Uint8Array | undefined {
  if (!op.members.has(name)) return undefined;
  const text = op.members.get(name);
  if (typeof text !== 'string') throw new LifecycleError('statement-chain-refused', `${op.type}.${name} is not a string`);
  if (!B64.test(text)) throw new LifecycleError('statement-chain-refused', `${op.type}.${name} is not the canonical base64 of ${size} bytes`);
  const value = decodeB64(text);
  if (value.length !== size || encodeB64(value) !== text) throw new LifecycleError('statement-chain-refused', `${op.type}.${name} is not the canonical base64 of ${size} bytes`);
  return value;
}

/** Hold a statement's operations to the places of the lifecycle operations; answer whether it deactivates and whether it reactivates. */
export function checkPlacement(i: number, ops: LifecycleOperation[]): { deactivates: boolean; reactivates: boolean } {
  let deactivates = false;
  let reactivates = false;
  ops.forEach((op, j) => {
    if (op.type === 'deactivate') {
      if (ops.length !== 1) throw new LifecycleError('statement-chain-refused', `entry ${i}: deactivate is the only operation of its statement, and this one carries ${ops.length}`);
      deactivates = true;
    } else if (op.type === 'reactivate') {
      if (j !== 0) throw new LifecycleError('statement-chain-refused', `entry ${i}: reactivate is the first operation of its statement, and here it is operation ${j}`);
      reactivates = true;
    }
  });
  return { deactivates, reactivates };
}

/** The operations a reactivation proof covers: the reactivate operation without its reactivationProof member. */
export function withoutProof<T extends LifecycleOperation>(ops: T[]): T[] {
  return ops.map((op) => (op.type === 'reactivate' ? { ...op, members: new Map([...op.members].filter(([name]) => name !== MEMBER_REACTIVATION_PROOF)) } : op));
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Hold an entry's lifecycle members: a deactivation's commitment is well formed; a reactivation proves the commitment of the deactivation before it over proofDigest. */
export function verifyLifecycle(i: number, ops: LifecycleOperation[], previousOps: LifecycleOperation[], deactivates: boolean, reactivates: boolean, proofDigest: () => Uint8Array): void {
  if (deactivates) {
    lifecycleMember(ops[0], MEMBER_REACTIVATION_COMMITMENT, 32);
    return;
  }
  if (!reactivates) return;
  const commitment = lifecycleMember(previousOps[0], MEMBER_REACTIVATION_COMMITMENT, 32);
  if (commitment === undefined) throw new LifecycleError('reactivation-final', `entry ${i}: the deactivation carries no reactivation commitment, so it is final`);
  const key = lifecycleMember(ops[0], MEMBER_REACTIVATION_KEY, 32);
  if (key === undefined || !equalBytes(sha256(key), commitment)) throw new LifecycleError('reactivation-key', `entry ${i}: the reactivation names no key, or the SHA-256 of its key is not the commitment`);
  const proof = lifecycleMember(ops[0], MEMBER_REACTIVATION_PROOF, 64);
  if (proof === undefined || !ed25519.verify(proof, proofDigest(), key, { zip215: false })) {
    throw new LifecycleError('reactivation-proof', `entry ${i}: the reactivation proof is absent or is not the committed key's signature over the statement's own digest`);
  }
}

/** The committed key of a reactivation (undefined for any other operation list, or a key that does not decode). */
export function recoveryKey(ops: LifecycleOperation[]): Uint8Array | undefined {
  if (ops.length === 0 || ops[0].type !== 'reactivate') return undefined;
  try {
    return lifecycleMember(ops[0], MEMBER_REACTIVATION_KEY, 32);
  } catch {
    return undefined;
  }
}

/** A time as seconds since the epoch and the nanoseconds of its second. */
export interface Instant { seconds: number; nanos: number }

const TIME = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)$/;

/** Read an RFC 3339 time with the fraction it has (as Go's encoder writes a metadata time). */
export function parseInstant(text: string): Instant | undefined {
  const m = TIME.exec(text);
  if (!m) return undefined;
  const ms = Date.parse(m[1] + m[4]);
  if (Number.isNaN(ms)) return undefined;
  return { seconds: ms / 1000, nanos: Number((m[3] ?? '').padEnd(9, '0')) };
}

function sameInstant(a: Instant, b: Instant): boolean {
  return a.seconds === b.seconds && a.nanos === b.nanos;
}

/** Read a file's ledgerTimes: none is undefined; otherwise one canonical whole-second UTC RFC 3339 time per entry, never decreasing. */
export function parseLedgerTimes(list: string[] | undefined, entries: number): number[] | undefined {
  if (!list || list.length === 0) return undefined;
  if (list.length !== entries) throw new LifecycleError('ledger-time', `${list.length} ledger times for ${entries} entries`);
  return list.map((text, i, all) => {
    const at = parseInstant(text);
    if (!at || at.nanos !== 0 || !text.endsWith('Z') || text.includes('.') || new Date(at.seconds * 1000).toISOString().replace('.000Z', 'Z') !== text) {
      throw new LifecycleError('ledger-time', `ledger time ${i} ${JSON.stringify(text)} is not a whole-second UTC time`);
    }
    if (i > 0 && at.seconds < parseInstant(all[i - 1])!.seconds) throw new LifecycleError('ledger-time', `ledger time ${i} is before ledger time ${i - 1}`);
    return at.seconds;
  });
}

/** Hold every entry's stated times to the ledger times (seconds since the epoch). */
export function verifyTimes(history: { versionId: string; created: Instant; updated: Instant }[], ledger: number[]): void {
  let created: Instant | undefined;
  history.forEach((e, i) => {
    const stated = e.updated.seconds;
    if (stated > ledger[i]) throw new LifecycleError('time-after-ledger', `entry ${i}: version ${e.versionId} states a time after it landed`);
    if (i > 0 && stated < ledger[i - 1]) throw new LifecycleError('time-before-predecessor', `entry ${i}: version ${e.versionId} states a time before the entry before it landed`);
    if (i === 0) created = e.versionId === '1' ? e.updated : e.created;
    if (!sameInstant(e.created, created!)) throw new LifecycleError('created-time', `entry ${i}: version ${e.versionId} states a created time that is not the first entry's`);
  });
}

/** Every Ed25519 public key a document's verification methods list (a Multikey or Ed25519VerificationKey2020 whose publicKeyMultibase is z and the base58btc of 0xed 0x01 and 32 bytes),
 *  rule for rule as core's ContractDIDDocument.ListedEd25519Keys and infrix-verify's listedEd25519Keys. A document that is not an object lists none. */
export function listedEd25519Keys(document: JValue): Uint8Array[] {
  const member = (v: JValue | undefined, name: string): JValue | undefined => (v !== null && typeof v === 'object' && 'obj' in v ? v.obj.get(name) : undefined);
  const methods = member(document, 'verificationMethod');
  if (!Array.isArray(methods)) return [];
  const keys: Uint8Array[] = [];
  for (const vm of methods) {
    const type = member(vm, 'type');
    const mb = member(vm, 'publicKeyMultibase');
    if ((type !== 'Multikey' && type !== 'Ed25519VerificationKey2020') || typeof mb !== 'string' || !mb.startsWith('z')) continue;
    const raw = base58Decode(mb.slice(1));
    if (raw && raw.length === 34 && raw[0] === 0xed && raw[1] === 0x01) keys.push(raw.slice(2));
  }
  return keys;
}

/** Refuse a deactivation whose reactivation commitment is the SHA-256 of an Ed25519 key any of the documents (the history's versions up to and including it) lists: the method
 *  specification's Deactivate says the recovery key MUST NOT be a key the DID's documents list, and core refuses it since part 28e. */
export function verifyRecoveryKeyNotListed(i: number, ops: LifecycleOperation[], documents: JValue[]): void {
  if (ops.length !== 1 || ops[0].type !== 'deactivate') return;
  const commitment = lifecycleMember(ops[0], MEMBER_REACTIVATION_COMMITMENT, 32);
  if (commitment === undefined) return;
  documents.forEach((doc, j) => {
    for (const key of listedEd25519Keys(doc)) {
      if (equalBytes(sha256(key), commitment)) {
        throw new LifecycleError('recovery-key-listed', `entry ${i}: the reactivation commitment names a key version ${j + 1}'s document lists, so the key a deactivation stops could undo it`);
      }
    }
  });
}

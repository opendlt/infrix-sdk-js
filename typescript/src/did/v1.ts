// W.DID.CROSSSURFACE.PARITY: the did:infrix v1 formatter, the same construction rules as infrix core
// (pkg/did FormatInfrixAccDID / FormatInfrixChainDID), pinned by the shared vector set that
// `infrix did vectors --out` exports (testdata/did-vectors-v1.json, see did/vectors.test.ts).
//
// Offline and deterministic. The SDK used to mint the legacy spelling `did:infrix:acc://alice.acme`,
// which infrix core refuses as legacy input; it now mints only the canonical v1 identifier, and it
// needs the immutable network identifier to do so.

import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';

export const DID_V1_PREFIX = 'did:infrix:v1:';

/** The immutable network identifier: `g1-` and the 64 lower-case hex digits of the Directory genesis root. */
const NETWORK_ID = /^g1-[0-9a-f]{64}$/;

export class InfrixDIDError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message);
    this.name = 'InfrixDIDError';
  }
}

function checkNetworkId(networkId: string): void {
  if (!NETWORK_ID.test(networkId) || /^g1-0{64}$/.test(networkId)) {
    throw new InfrixDIDError('network', `network id ${JSON.stringify(networkId)} is not g1- followed by 64 lower-case hex digits (a mutable label such as "kermit" is refused)`);
  }
}

/** idchar = ALPHA / DIGIT / "." / "-" / "_" ; every other UTF-8 byte is percent-encoded in upper-case hex. */
function encodeSegment(segment: string): string {
  if (segment === '') throw new InfrixDIDError('malformed', 'a DID segment is empty');
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f]/.test(segment)) throw new InfrixDIDError('malformed', 'a DID segment contains a control character');
  let out = '';
  for (const byte of new TextEncoder().encode(segment.normalize('NFC'))) {
    const c = String.fromCharCode(byte);
    out += /[A-Za-z0-9._-]/.test(c) ? c : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

/** Segments of an Accumulate account URL: the authority and path parts, lower-cased and NFC. */
function accountSegments(account: string): string[] {
  const text = account.trim();
  const rest = /^acc:\/\//i.test(text) ? text.slice('acc://'.length) : text;
  if (/[@?#]/.test(rest)) throw new InfrixDIDError('malformed', 'an Accumulate account must not contain user info, a query or a fragment');
  const [authority, ...path] = rest.replace(/^\/+|\/+$/g, '').split('/');
  if (!authority || authority.includes(':')) {
    throw new InfrixDIDError('malformed', 'an Accumulate account needs an authority and no port');
  }
  if (path.some((p) => p === '')) throw new InfrixDIDError('malformed', 'an Accumulate account path has an empty segment');
  return [authority, ...path].map((s) => s.toLowerCase().normalize('NFC'));
}

/**
 * The canonical did:infrix v1 identifier of an Accumulate account on a network.
 *
 * @example
 *   formatAccDID('g1-<64 hex>', 'acc://Alice.ACME/Book')
 *   // → "did:infrix:v1:acc:g1-<64 hex>:alice.acme:book"
 */
export function formatAccDID(networkId: string, account: string): string {
  checkNetworkId(networkId);
  return DID_V1_PREFIX + 'acc:' + [networkId, ...accountSegments(account)].map(encodeSegment).join(':');
}

const CHAIN_NAMESPACES: Record<string, { reference: RegExp; account: RegExp }> = {
  eip155: { reference: /^(0|[1-9][0-9]{0,31})$/, account: /^0[xX][0-9a-fA-F]{40}$/ },
  cosmos: { reference: /^[-a-zA-Z0-9]{1,32}$/, account: /^[a-z0-9]{1,83}1[02-9ac-hj-np-z]{6,}$/ },
  solana: { reference: /^[1-9A-HJ-NP-Za-km-z]{32}$/, account: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ },
  bip122: { reference: /^[0-9a-f]{32}$/, account: /^[a-zA-Z0-9]{26,90}$/ },
};

function eip55ChecksumValid(hexPart: string): boolean {
  const digest = bytesToHex(keccak_256(new TextEncoder().encode(hexPart.toLowerCase())));
  for (let i = 0; i < hexPart.length; i++) {
    const c = hexPart[i];
    const nibble = parseInt(digest[i], 16);
    if (c >= 'a' && c <= 'f' && nibble >= 8) return false;
    if (c >= 'A' && c <= 'F' && nibble < 8) return false;
  }
  return true;
}

/** The canonical did:infrix v1 identifier of an account on a CAIP-2 chain. */
export function formatChainDID(namespace: string, reference: string, account: string): string {
  const ns = CHAIN_NAMESPACES[namespace];
  if (!ns) throw new InfrixDIDError('profile-semantics', `chain namespace ${JSON.stringify(namespace)} is not one of ${Object.keys(CHAIN_NAMESPACES).sort().join(', ')}`);
  if (!ns.reference.test(reference)) throw new InfrixDIDError('profile-semantics', `reference ${JSON.stringify(reference)} is not a valid ${namespace} chain reference`);
  if (!ns.account.test(account)) throw new InfrixDIDError('profile-semantics', `account ${JSON.stringify(account)} is not a valid ${namespace} account`);
  let canonical = account;
  if (namespace === 'eip155') {
    const hexPart = account.slice(2);
    if (hexPart !== hexPart.toLowerCase() && hexPart !== hexPart.toUpperCase() && !eip55ChecksumValid(hexPart)) {
      throw new InfrixDIDError('profile-semantics', `eip155 account ${JSON.stringify(account)} is mixed-case with an invalid EIP-55 checksum`);
    }
    canonical = '0x' + hexPart.toLowerCase();
  }
  return DID_V1_PREFIX + 'chain:' + [namespace, reference, canonical].map(encodeSegment).join(':');
}

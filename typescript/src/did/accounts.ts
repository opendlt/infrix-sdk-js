// Copyright 2024-2026 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// THE ACCOUNT STANDARDS OF THE CHAIN NAMESPACES, the same rules as infrix core (pkg/did/chain_accounts.go), held by the
// shared vector set (testdata/did-vectors-v1.json: the `bech32` and `chainAccounts` sections that `infrix did vectors`
// exports from the Go side, the source).
//
// A chain-profile DID names an account on a foreign chain. Three of the four namespaces used to be validated here by a
// regular expression and normalized by returning the account unchanged, so the SDK would mint the DID of an account no
// chain could hold. Each namespace now validates by its chain's own address standard:
//
//   cosmos   a bech32 address (BIP-173): the checksum, the human-readable part and the payload length (20 or 32 bytes),
//            lower case only. The prefix is bound to the chain ids this module knows; any well-formed prefix is accepted
//            for another chain id (the standard binds a prefix to no chain id).
//   solana   a base58 encoding of exactly 32 bytes in its one canonical spelling.
//   bip122   a Bitcoin address of the network the CAIP-2 reference names: base58check P2PKH and P2SH, segwit P2WPKH and
//            P2WSH (version 0, bech32) and P2TR (version 1, bech32m); every other address is refused by name.

import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

/** A refusal of an account by the standard of its chain. */
export class AccountStandardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountStandardError';
  }
}

// ---- base58 and base58check ----

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** The bytes of a base58 string, or null when it holds a character outside the alphabet. Leading '1's are leading zero bytes. */
export function base58Decode(text: string): Uint8Array | null {
  let value = 0n;
  for (const ch of text) {
    const digit = BASE58.indexOf(ch);
    if (digit < 0) return null;
    value = value * 58n + BigInt(digit);
  }
  let hex = value.toString(16);
  if (hex.length % 2 === 1) hex = '0' + hex;
  const body = value === 0n ? new Uint8Array(0) : Uint8Array.from(hex.match(/../g)!.map((pair) => parseInt(pair, 16)));
  let zeros = 0;
  // an index past the end reads undefined, which is not '1': the loop needs no bound of its own
  while (text[zeros] === '1') zeros++;
  const out = new Uint8Array(zeros + body.length);
  out.set(body, zeros);
  return out;
}

/** The base58 spelling of bytes (each leading zero byte is a leading '1'). */
export function base58Encode(bytes: Uint8Array): string {
  let value = 0n;
  for (const b of bytes) value = value * 256n + BigInt(b);
  let out = '';
  while (value > 0n) {
    out = BASE58[Number(value % 58n)] + out;
    value /= 58n;
  }
  let zeros = 0;
  // an index past the end reads undefined, which is not 0: the loop needs no bound of its own
  while (bytes[zeros] === 0) zeros++;
  return '1'.repeat(zeros) + out;
}

function checksum4(data: Uint8Array): Uint8Array {
  return sha256(sha256(data)).slice(0, 4);
}

/** The version byte and the payload of a base58check string, or null when it is not one (a character outside the alphabet, too short, a checksum that does not verify). */
export function base58CheckDecode(text: string): { version: number; payload: Uint8Array } | null {
  const raw = base58Decode(text);
  if (raw === null || raw.length < 5) return null;
  const body = raw.slice(0, raw.length - 4);
  const sum = raw.slice(raw.length - 4);
  const want = checksum4(body);
  if (!sum.every((byte, i) => byte === want[i])) return null;
  return { version: body[0], payload: body.slice(1) };
}

/** The base58check spelling of a payload under a version byte. */
export function base58CheckEncode(payload: Uint8Array, version: number): string {
  const body = new Uint8Array(1 + payload.length);
  body[0] = version;
  body.set(payload, 1);
  const full = new Uint8Array(body.length + 4);
  full.set(body);
  full.set(checksum4(body), body.length);
  return base58Encode(full);
}

// ---- bech32 and bech32m (BIP-173, BIP-350) ----

export type Bech32Variant = 'bech32' | 'bech32m';

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32M_CONSTANT = 0x2bc830a3;
/** The longest string the codec accepts unless the caller asks for less: Cosmos addresses are far shorter. */
export const BECH32_MAX_LENGTH = 255;

function bech32Polymod(values: number[]): number {
  const generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = (((chk & 0x1ffffff) << 5) ^ v) >>> 0;
    generator.forEach((g, i) => {
      if ((top >>> i) & 1) chk = (chk ^ g) >>> 0;
    });
  }
  return chk >>> 0;
}

function bech32HrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function bech32CheckHrp(hrp: string): void {
  if (hrp.length < 1 || hrp.length > 83) throw new AccountStandardError(`bech32: the human-readable part is ${hrp.length} characters, want 1 to 83`);
  hrp.split('').forEach((unit, i) => {
    const c = unit.charCodeAt(0);
    if (c < 33 || c > 126) throw new AccountStandardError(`bech32: the human-readable part holds a character outside 33..126 at ${i}`);
  });
}

/**
 * Decode a bech32 or bech32m string: the human-readable part (lower case), the 5-bit data groups without the checksum and
 * which checksum verified. The string must be all lower case or all upper case (mixed case is invalid), between 8 and
 * `maxLength` characters, with the separator last and at least six checksum characters after it.
 */
export function bech32Decode(text: string, maxLength: number = BECH32_MAX_LENGTH): { hrp: string; data: number[]; variant: Bech32Variant } {
  if (text.length < 8 || text.length > maxLength) throw new AccountStandardError(`bech32: the string is ${text.length} characters, want 8 to ${maxLength}`);
  const lower = text.toLowerCase();
  if (text !== lower && text !== text.toUpperCase()) throw new AccountStandardError('bech32: the string mixes upper and lower case');
  const pos = lower.lastIndexOf('1');
  if (pos < 1 || pos + 7 > lower.length) {
    throw new AccountStandardError('bech32: the separator is missing, leaves no human-readable part or leaves fewer than six checksum characters');
  }
  const hrp = lower.slice(0, pos);
  bech32CheckHrp(hrp);
  const data: number[] = [];
  for (let i = pos + 1; i < lower.length; i++) {
    const index = BECH32_CHARSET.indexOf(lower[i]);
    if (index < 0) throw new AccountStandardError(`bech32: ${JSON.stringify(lower[i])} is not a character of the charset`);
    data.push(index);
  }
  const polymod = bech32Polymod([...bech32HrpExpand(hrp), ...data]);
  if (polymod === 1) return { hrp, data: data.slice(0, data.length - 6), variant: 'bech32' };
  if (polymod === BECH32M_CONSTANT) return { hrp, data: data.slice(0, data.length - 6), variant: 'bech32m' };
  throw new AccountStandardError('bech32: the checksum does not verify');
}

/** Encode a human-readable part and 5-bit groups (the result is lower case). */
export function bech32Encode(hrp: string, data: number[], variant: Bech32Variant): string {
  bech32CheckHrp(hrp);
  if (hrp !== hrp.toLowerCase()) throw new AccountStandardError('bech32: the human-readable part must be lower-case to be encoded');
  const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const polymod = (bech32Polymod(values) ^ (variant === 'bech32m' ? BECH32M_CONSTANT : 1)) >>> 0;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((polymod >>> (5 * (5 - i))) & 31);
  let out = hrp + '1';
  for (const d of [...data, ...checksum]) {
    if (d < 0 || d > 31) throw new AccountStandardError('bech32: a data value is not a 5-bit group');
    out += BECH32_CHARSET[d];
  }
  return out;
}

/**
 * Regroup bits between widths (BIP-173's convertbits). With `pad` false any leftover bits must be zero and fewer than the
 * source width, or the encoding is not the one canonical spelling of its bytes.
 */
export function convertBits(data: ArrayLike<number>, from: number, to: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const maxv = (1 << to) - 1;
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v >>> from !== 0) throw new AccountStandardError('a value does not fit its source group width');
    acc = ((acc << from) | v) >>> 0;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >>> bits) & maxv);
    }
    acc &= (1 << bits) - 1;
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv) !== 0) {
    throw new AccountStandardError('the padding bits are not zero, or a whole group of padding remains');
  }
  return out;
}

// ---- cosmos ----

/** The human-readable part of the chain ids this module knows. A chain id outside the table is not refused: the standard binds a prefix to no chain id. */
const COSMOS_HRP: Record<string, string> = {
  'cosmoshub-4': 'cosmos', 'theta-testnet-001': 'cosmos', 'osmosis-1': 'osmo', 'osmo-test-5': 'osmo', 'juno-1': 'juno', 'stargaze-1': 'stars', 'akashnet-2': 'akash',
  'secret-4': 'secret', 'noble-1': 'noble', 'neutron-1': 'neutron', 'injective-1': 'inj', 'dydx-mainnet-1': 'dydx',
};

export function normalizeCosmosAccount(reference: string, account: string): string {
  if (account !== account.toLowerCase()) throw new AccountStandardError(`cosmos account ${JSON.stringify(account)} is not lower-case, and a Cosmos address is spelled in lower case only`);
  const { hrp, data, variant } = bech32Decode(account, BECH32_MAX_LENGTH);
  if (variant !== 'bech32') throw new AccountStandardError(`cosmos account ${JSON.stringify(account)} carries a bech32m checksum, and a Cosmos address is bech32`);
  const known = Object.prototype.hasOwnProperty.call(COSMOS_HRP, reference) ? COSMOS_HRP[reference] : undefined;
  if (known !== undefined && hrp !== known) {
    throw new AccountStandardError(`cosmos account ${JSON.stringify(account)} has the prefix ${JSON.stringify(hrp)}, and chain ${reference} uses ${JSON.stringify(known)}`);
  }
  const payload = convertBits(data, 5, 8, false);
  if (payload.length !== 20 && payload.length !== 32) {
    throw new AccountStandardError(`cosmos account ${JSON.stringify(account)} holds ${payload.length} bytes, want 20 (an account) or 32 (a module, an interchain account or a contract)`);
  }
  return account;
}

// ---- solana ----

export function normalizeSolanaAccount(_reference: string, account: string): string {
  const raw = base58Decode(account);
  if (raw === null || raw.length !== 32) {
    throw new AccountStandardError(`solana account ${JSON.stringify(account)} decodes to ${raw === null ? 0 : raw.length} bytes, want a 32-byte public key`);
  }
  // base58 is a bijection between strings and byte strings (a leading '1' is one leading zero byte and nothing else): a string that decodes IS the one canonical spelling of its bytes
  return account;
}

// ---- bip122 (Bitcoin) ----

export type BitcoinAddressKind = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr';

interface BitcoinNetwork {
  name: string;
  hrp: string;
  p2pkhVersion: number;
  p2shVersion: number;
}

/** The Bitcoin networks by the CAIP-2 reference of namespace bip122: the first 32 hexadecimal characters of the genesis block hash. */
const BITCOIN_NETWORKS: Record<string, BitcoinNetwork> = {
  '000000000019d6689c085ae165831e93': { name: 'mainnet', hrp: 'bc', p2pkhVersion: 0x00, p2shVersion: 0x05 },
  '000000000933ea01ad0ee984209779ba': { name: 'testnet', hrp: 'tb', p2pkhVersion: 0x6f, p2shVersion: 0xc4 },
  '00000008819873e925422c1ff0f99f7c': { name: 'signet', hrp: 'tb', p2pkhVersion: 0x6f, p2shVersion: 0xc4 },
  '0f9188f13cb7b2c71f2a335e3a4fc328': { name: 'regtest', hrp: 'bcrt', p2pkhVersion: 0x6f, p2shVersion: 0xc4 },
};

export interface BitcoinAddress {
  kind: BitcoinAddressKind;
  /** The hash or program the address commits to: 20 bytes for P2PKH, P2SH and P2WPKH, 32 for P2WSH and P2TR, hexadecimal. */
  payloadHex: string;
  network: string;
}

function parseSegwitAddress(network: BitcoinNetwork, account: string): BitcoinAddress {
  const { hrp, data, variant } = bech32Decode(account, 90);
  if (hrp !== network.hrp) throw new AccountStandardError(`bip122 account ${JSON.stringify(account)} has the human-readable part ${JSON.stringify(hrp)}, and ${network.name} uses ${JSON.stringify(network.hrp)}`);
  if (data.length < 1) throw new AccountStandardError(`bip122 account ${JSON.stringify(account)} carries no witness version`);
  const witnessVersion = data[0];
  const program = convertBits(data.slice(1), 5, 8, false);
  const hex = bytesToHex(Uint8Array.from(program));
  if (witnessVersion === 0 && variant === 'bech32' && program.length === 20) return { kind: 'p2wpkh', payloadHex: hex, network: network.name };
  if (witnessVersion === 0 && variant === 'bech32' && program.length === 32) return { kind: 'p2wsh', payloadHex: hex, network: network.name };
  if (witnessVersion === 1 && variant === 'bech32m' && program.length === 32) return { kind: 'p2tr', payloadHex: hex, network: network.name };
  if (witnessVersion === 0 && variant !== 'bech32') throw new AccountStandardError(`bip122 account ${JSON.stringify(account)} is witness version 0 with a bech32m checksum (BIP-350: version 0 is bech32)`);
  if (witnessVersion !== 0 && variant !== 'bech32m') throw new AccountStandardError(`bip122 account ${JSON.stringify(account)} is witness version ${witnessVersion} with a bech32 checksum (BIP-350: versions 1 and above are bech32m)`);
  throw new AccountStandardError(
    `bip122 account ${JSON.stringify(account)} is witness version ${witnessVersion} with a ${program.length}-byte program: only P2WPKH (version 0, 20 bytes), P2WSH (version 0, 32 bytes) and P2TR (version 1, 32 bytes) are accounts`,
  );
}

/**
 * Read a Bitcoin address of the network the CAIP-2 reference names, by the address standards: base58check (version byte and
 * 20-byte payload) or bech32 / bech32m (the network's human-readable part, witness version 0 with a 20- or 32-byte program
 * in bech32, witness version 1 with a 32-byte program in bech32m). Any other address is refused by name.
 */
export function parseBitcoinAddress(reference: string, account: string): BitcoinAddress {
  const network = Object.prototype.hasOwnProperty.call(BITCOIN_NETWORKS, reference) ? BITCOIN_NETWORKS[reference] : undefined;
  if (network === undefined) {
    throw new AccountStandardError(
      `bip122 reference ${JSON.stringify(reference)} is not a Bitcoin network this method registers (mainnet 000000000019d6689c085ae165831e93, testnet 000000000933ea01ad0ee984209779ba, signet, regtest): another chain is a registry entry`,
    );
  }
  if (account.toLowerCase().startsWith(network.hrp + '1')) return parseSegwitAddress(network, account);
  const decoded = base58CheckDecode(account);
  if (decoded === null) throw new AccountStandardError(`bip122 account ${JSON.stringify(account)} is neither a ${network.name} segwit address nor a base58check address`);
  if (decoded.payload.length !== 20) throw new AccountStandardError(`bip122 account ${JSON.stringify(account)} holds ${decoded.payload.length} bytes, want 20`);
  const payloadHex = bytesToHex(decoded.payload);
  if (decoded.version === network.p2pkhVersion) return { kind: 'p2pkh', payloadHex, network: network.name };
  if (decoded.version === network.p2shVersion) return { kind: 'p2sh', payloadHex, network: network.name };
  throw new AccountStandardError(
    `bip122 account ${JSON.stringify(account)} has the version byte 0x${decoded.version.toString(16).padStart(2, '0')}, which is neither the P2PKH (0x${network.p2pkhVersion.toString(16).padStart(2, '0')}) nor the P2SH (0x${network.p2shVersion.toString(16).padStart(2, '0')}) version of ${network.name}`,
  );
}

export function normalizeBitcoinAccount(reference: string, account: string): string {
  const parsed = parseBitcoinAddress(reference, account);
  return parsed.kind === 'p2wpkh' || parsed.kind === 'p2wsh' || parsed.kind === 'p2tr' ? account.toLowerCase() : account;
}

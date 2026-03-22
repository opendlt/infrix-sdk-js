/**
 * Infrix Types for AssemblyScript
 *
 * Core types for building Infrix smart contracts in AssemblyScript.
 */

// =============================================================================
// U256 - 256-bit Unsigned Integer
// =============================================================================

/**
 * 256-bit unsigned integer
 *
 * Represented as four 64-bit limbs in little-endian order.
 */
@unmanaged
export class U256 {
  lo1: u64; // Bits 0-63
  lo2: u64; // Bits 64-127
  hi1: u64; // Bits 128-191
  hi2: u64; // Bits 192-255

  constructor(lo1: u64 = 0, lo2: u64 = 0, hi1: u64 = 0, hi2: u64 = 0) {
    this.lo1 = lo1;
    this.lo2 = lo2;
    this.hi1 = hi1;
    this.hi2 = hi2;
  }

  /** Zero constant */
  @inline
  static zero(): U256 {
    return new U256(0, 0, 0, 0);
  }

  /** One constant */
  @inline
  static one(): U256 {
    return new U256(1, 0, 0, 0);
  }

  /** Create from u64 */
  @inline
  static fromU64(value: u64): U256 {
    return new U256(value, 0, 0, 0);
  }

  /** Create from big-endian bytes */
  static fromBeBytes(bytes: Uint8Array): U256 {
    if (bytes.length < 32) {
      return U256.zero();
    }

    const result = new U256();
    result.hi2 =
      ((<u64>bytes[0]) << 56) |
      ((<u64>bytes[1]) << 48) |
      ((<u64>bytes[2]) << 40) |
      ((<u64>bytes[3]) << 32) |
      ((<u64>bytes[4]) << 24) |
      ((<u64>bytes[5]) << 16) |
      ((<u64>bytes[6]) << 8) |
      (<u64>bytes[7]);
    result.hi1 =
      ((<u64>bytes[8]) << 56) |
      ((<u64>bytes[9]) << 48) |
      ((<u64>bytes[10]) << 40) |
      ((<u64>bytes[11]) << 32) |
      ((<u64>bytes[12]) << 24) |
      ((<u64>bytes[13]) << 16) |
      ((<u64>bytes[14]) << 8) |
      (<u64>bytes[15]);
    result.lo2 =
      ((<u64>bytes[16]) << 56) |
      ((<u64>bytes[17]) << 48) |
      ((<u64>bytes[18]) << 40) |
      ((<u64>bytes[19]) << 32) |
      ((<u64>bytes[20]) << 24) |
      ((<u64>bytes[21]) << 16) |
      ((<u64>bytes[22]) << 8) |
      (<u64>bytes[23]);
    result.lo1 =
      ((<u64>bytes[24]) << 56) |
      ((<u64>bytes[25]) << 48) |
      ((<u64>bytes[26]) << 40) |
      ((<u64>bytes[27]) << 32) |
      ((<u64>bytes[28]) << 24) |
      ((<u64>bytes[29]) << 16) |
      ((<u64>bytes[30]) << 8) |
      (<u64>bytes[31]);

    return result;
  }

  /** Convert to big-endian bytes */
  toBeBytes(): Uint8Array {
    const bytes = new Uint8Array(32);

    bytes[0] = <u8>(this.hi2 >> 56);
    bytes[1] = <u8>(this.hi2 >> 48);
    bytes[2] = <u8>(this.hi2 >> 40);
    bytes[3] = <u8>(this.hi2 >> 32);
    bytes[4] = <u8>(this.hi2 >> 24);
    bytes[5] = <u8>(this.hi2 >> 16);
    bytes[6] = <u8>(this.hi2 >> 8);
    bytes[7] = <u8>this.hi2;

    bytes[8] = <u8>(this.hi1 >> 56);
    bytes[9] = <u8>(this.hi1 >> 48);
    bytes[10] = <u8>(this.hi1 >> 40);
    bytes[11] = <u8>(this.hi1 >> 32);
    bytes[12] = <u8>(this.hi1 >> 24);
    bytes[13] = <u8>(this.hi1 >> 16);
    bytes[14] = <u8>(this.hi1 >> 8);
    bytes[15] = <u8>this.hi1;

    bytes[16] = <u8>(this.lo2 >> 56);
    bytes[17] = <u8>(this.lo2 >> 48);
    bytes[18] = <u8>(this.lo2 >> 40);
    bytes[19] = <u8>(this.lo2 >> 32);
    bytes[20] = <u8>(this.lo2 >> 24);
    bytes[21] = <u8>(this.lo2 >> 16);
    bytes[22] = <u8>(this.lo2 >> 8);
    bytes[23] = <u8>this.lo2;

    bytes[24] = <u8>(this.lo1 >> 56);
    bytes[25] = <u8>(this.lo1 >> 48);
    bytes[26] = <u8>(this.lo1 >> 40);
    bytes[27] = <u8>(this.lo1 >> 32);
    bytes[28] = <u8>(this.lo1 >> 24);
    bytes[29] = <u8>(this.lo1 >> 16);
    bytes[30] = <u8>(this.lo1 >> 8);
    bytes[31] = <u8>this.lo1;

    return bytes;
  }

  /** Check if zero */
  @inline
  isZero(): bool {
    return this.lo1 == 0 && this.lo2 == 0 && this.hi1 == 0 && this.hi2 == 0;
  }

  /** Clone this value */
  @inline
  clone(): U256 {
    return new U256(this.lo1, this.lo2, this.hi1, this.hi2);
  }

  /** Compare for equality */
  @inline
  eq(other: U256): bool {
    return (
      this.lo1 == other.lo1 &&
      this.lo2 == other.lo2 &&
      this.hi1 == other.hi1 &&
      this.hi2 == other.hi2
    );
  }

  /** Compare less than */
  lt(other: U256): bool {
    if (this.hi2 != other.hi2) return this.hi2 < other.hi2;
    if (this.hi1 != other.hi1) return this.hi1 < other.hi1;
    if (this.lo2 != other.lo2) return this.lo2 < other.lo2;
    return this.lo1 < other.lo1;
  }

  /** Compare greater than */
  @inline
  gt(other: U256): bool {
    return other.lt(this);
  }

  /** Compare less than or equal */
  @inline
  lte(other: U256): bool {
    return this.eq(other) || this.lt(other);
  }

  /** Compare greater than or equal */
  @inline
  gte(other: U256): bool {
    return this.eq(other) || this.gt(other);
  }

  /** Add two U256 values */
  add(other: U256): U256 {
    const result = new U256();

    let carry: u64 = 0;

    // Add lo1
    let sum = this.lo1 + other.lo1;
    if (sum < this.lo1) carry = 1;
    result.lo1 = sum;

    // Add lo2 with carry
    sum = this.lo2 + other.lo2 + carry;
    carry = sum < this.lo2 || (carry == 1 && sum == this.lo2) ? 1 : 0;
    result.lo2 = sum;

    // Add hi1 with carry
    sum = this.hi1 + other.hi1 + carry;
    carry = sum < this.hi1 || (carry == 1 && sum == this.hi1) ? 1 : 0;
    result.hi1 = sum;

    // Add hi2 with carry
    result.hi2 = this.hi2 + other.hi2 + carry;

    return result;
  }

  /** Subtract two U256 values */
  sub(other: U256): U256 {
    const result = new U256();

    let borrow: u64 = 0;

    // Subtract lo1
    let diff = this.lo1 - other.lo1;
    if (this.lo1 < other.lo1) borrow = 1;
    result.lo1 = diff;

    // Subtract lo2 with borrow
    const lo2WithBorrow = other.lo2 + borrow;
    diff = this.lo2 - lo2WithBorrow;
    borrow = this.lo2 < lo2WithBorrow || (borrow == 1 && other.lo2 == U64.MAX_VALUE) ? 1 : 0;
    result.lo2 = diff;

    // Subtract hi1 with borrow
    const hi1WithBorrow = other.hi1 + borrow;
    diff = this.hi1 - hi1WithBorrow;
    borrow = this.hi1 < hi1WithBorrow || (borrow == 1 && other.hi1 == U64.MAX_VALUE) ? 1 : 0;
    result.hi1 = diff;

    // Subtract hi2 with borrow
    result.hi2 = this.hi2 - other.hi2 - borrow;

    return result;
  }

  /** Multiply by u64 */
  mulU64(other: u64): U256 {
    const result = new U256();

    // Use 32-bit multiplication to avoid overflow
    const a0 = this.lo1 & 0xffffffff;
    const a1 = this.lo1 >> 32;
    const a2 = this.lo2 & 0xffffffff;
    const a3 = this.lo2 >> 32;
    const a4 = this.hi1 & 0xffffffff;
    const a5 = this.hi1 >> 32;
    const a6 = this.hi2 & 0xffffffff;
    const a7 = this.hi2 >> 32;

    const b0 = other & 0xffffffff;
    const b1 = other >> 32;

    let carry: u64 = 0;

    // Multiply and accumulate
    let prod = a0 * b0;
    result.lo1 = prod & 0xffffffff;
    carry = prod >> 32;

    prod = a0 * b1 + a1 * b0 + carry;
    result.lo1 |= (prod & 0xffffffff) << 32;
    carry = prod >> 32;

    prod = a1 * b1 + a2 * b0 + carry;
    result.lo2 = prod & 0xffffffff;
    carry = prod >> 32;

    prod = a2 * b1 + a3 * b0 + carry;
    result.lo2 |= (prod & 0xffffffff) << 32;
    carry = prod >> 32;

    prod = a3 * b1 + a4 * b0 + carry;
    result.hi1 = prod & 0xffffffff;
    carry = prod >> 32;

    prod = a4 * b1 + a5 * b0 + carry;
    result.hi1 |= (prod & 0xffffffff) << 32;
    carry = prod >> 32;

    prod = a5 * b1 + a6 * b0 + carry;
    result.hi2 = prod & 0xffffffff;
    carry = prod >> 32;

    prod = a6 * b1 + a7 * b0 + carry;
    result.hi2 |= (prod & 0xffffffff) << 32;

    return result;
  }
}

// =============================================================================
// Hash - 32-byte Hash
// =============================================================================

/**
 * 32-byte hash type
 */
@unmanaged
export class Hash {
  private data: StaticArray<u8> = new StaticArray<u8>(32);

  constructor() {
    for (let i = 0; i < 32; i++) {
      this.data[i] = 0;
    }
  }

  /** Create zero hash */
  static zero(): Hash {
    return new Hash();
  }

  /** Create from bytes */
  static fromBytes(bytes: Uint8Array): Hash {
    const hash = new Hash();
    const len = min(bytes.length, 32);
    for (let i = 0; i < len; i++) {
      hash.data[i] = bytes[i];
    }
    return hash;
  }

  /** Get as bytes */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = this.data[i];
    }
    return bytes;
  }

  /** Get byte at index */
  @inline
  getByte(index: i32): u8 {
    return this.data[index];
  }

  /** Set byte at index */
  @inline
  setByte(index: i32, value: u8): void {
    this.data[index] = value;
  }

  /** Check if zero */
  isZero(): bool {
    for (let i = 0; i < 32; i++) {
      if (this.data[i] != 0) return false;
    }
    return true;
  }

  /** Compare for equality */
  eq(other: Hash): bool {
    for (let i = 0; i < 32; i++) {
      if (this.data[i] != other.data[i]) return false;
    }
    return true;
  }
}

// =============================================================================
// Address - Accumulate URL Address
// =============================================================================

/**
 * Accumulate URL address type
 *
 * Stores addresses like "acc://example.acme/tokens"
 */
export class Address {
  private data: string;

  constructor(url: string = "") {
    this.data = url;
  }

  /** Create empty address */
  static empty(): Address {
    return new Address("");
  }

  /** Create from string */
  static fromString(url: string): Address {
    return new Address(url);
  }

  /** Get as string */
  toString(): string {
    return this.data;
  }

  /** Get length */
  @inline
  get length(): i32 {
    return this.data.length;
  }

  /** Check if empty */
  @inline
  isEmpty(): bool {
    return this.data.length == 0;
  }

  /** Check if this is an ADI URL */
  isAdi(): bool {
    if (!this.data.startsWith("acc://")) return false;
    const rest = this.data.substring(6);
    return rest.indexOf("/") < 0;
  }

  /** Get the ADI portion */
  getAdi(): string {
    if (!this.data.startsWith("acc://")) return "";
    const rest = this.data.substring(6);
    const slashPos = rest.indexOf("/");
    if (slashPos < 0) return rest;
    return rest.substring(0, slashPos);
  }

  /** Get the path portion */
  getPath(): string {
    if (!this.data.startsWith("acc://")) return "";
    const rest = this.data.substring(6);
    const slashPos = rest.indexOf("/");
    if (slashPos < 0) return "";
    return rest.substring(slashPos);
  }

  /** Compare for equality */
  eq(other: Address): bool {
    return this.data == other.data;
  }

  /** Encode to bytes */
  toBytes(): Uint8Array {
    const str = String.UTF8.encode(this.data);
    const bytes = new Uint8Array(str.byteLength);
    memory.copy(bytes.dataStart, changetype<usize>(str), str.byteLength);
    return bytes;
  }

  /** Decode from bytes */
  static fromBytes(bytes: Uint8Array): Address {
    const str = String.UTF8.decode(bytes.buffer);
    return new Address(str);
  }
}

// =============================================================================
// Error Codes
// =============================================================================

/** Contract execution error codes */
export namespace ErrorCode {
  export const SUCCESS: u32 = 0;
  export const INVALID_ARGUMENT: u32 = 1;
  export const OUT_OF_MEMORY: u32 = 2;
  export const OUT_OF_GAS: u32 = 3;
  export const STORAGE_ERROR: u32 = 4;
  export const UNAUTHORIZED: u32 = 5;
  export const ACCOUNT_NOT_FOUND: u32 = 6;
  export const INSUFFICIENT_BALANCE: u32 = 7;
  export const INSUFFICIENT_CREDITS: u32 = 8;
  export const CONTRACT_NOT_FOUND: u32 = 9;
  export const FUNCTION_NOT_FOUND: u32 = 10;
  export const INVALID_STATE: u32 = 11;
  export const OVERFLOW: u32 = 12;
  export const UNDERFLOW: u32 = 13;
  export const DIVISION_BY_ZERO: u32 = 14;
  export const INVALID_SIGNATURE: u32 = 15;
  export const REVERT: u32 = 16;
  export const PANIC: u32 = 17;
  export const CALL_DEPTH_EXCEEDED: u32 = 18;
  export const READ_ONLY_VIOLATION: u32 = 19;
  export const REENTRANCY_DETECTED: u32 = 20;
  export const NOT_PAYABLE: u32 = 21;
  export const ZERO_ADDRESS: u32 = 22;
  export const CONTRACT_NOT_INITIALIZED: u32 = 23;
  export const INVALID_INPUT: u32 = 24;
  export const UNKNOWN_FUNCTION: u32 = 25;
  export const ENCODING_ERROR: u32 = 26;
  export const DECODING_ERROR: u32 = 27;
  export const BUFFER_TOO_SMALL: u32 = 28;
  export const UNKNOWN: u32 = 255;
}

// =============================================================================
// Event Topic
// =============================================================================

/**
 * Event topic (32 bytes)
 */
@unmanaged
export class Topic {
  private data: StaticArray<u8> = new StaticArray<u8>(32);

  constructor() {
    for (let i = 0; i < 32; i++) {
      this.data[i] = 0;
    }
  }

  /** Create empty topic */
  static empty(): Topic {
    return new Topic();
  }

  /** Create from u32 (for event signatures) */
  static fromU32(value: u32): Topic {
    const topic = new Topic();
    topic.data[0] = <u8>(value >> 24);
    topic.data[1] = <u8>(value >> 16);
    topic.data[2] = <u8>(value >> 8);
    topic.data[3] = <u8>value;
    return topic;
  }

  /** Create from bytes */
  static fromBytes(bytes: Uint8Array): Topic {
    const topic = new Topic();
    const len = min(bytes.length, 32);
    for (let i = 0; i < len; i++) {
      topic.data[i] = bytes[i];
    }
    return topic;
  }

  /** Create from hash */
  static fromHash(hash: Hash): Topic {
    const topic = new Topic();
    for (let i = 0; i < 32; i++) {
      topic.data[i] = hash.getByte(i);
    }
    return topic;
  }

  /** Get as bytes */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = this.data[i];
    }
    return bytes;
  }

  /** Get byte at index */
  @inline
  getByte(index: i32): u8 {
    return this.data[index];
  }

  /** Check if empty */
  isEmpty(): bool {
    for (let i = 0; i < 32; i++) {
      if (this.data[i] != 0) return false;
    }
    return true;
  }
}

// =============================================================================
// Context
// =============================================================================

/**
 * Execution context
 */
export class Context {
  caller: Address;
  blockHeight: u64;
  blockTime: u64;
  txHash: Hash;
  value: U256;
  gasLimit: u64;

  constructor() {
    this.caller = Address.empty();
    this.blockHeight = 0;
    this.blockTime = 0;
    this.txHash = Hash.zero();
    this.value = U256.zero();
    this.gasLimit = 0;
  }
}

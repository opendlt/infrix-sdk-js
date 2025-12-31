/**
 * Accumen SDK
 *
 * High-level API for developing Accumen smart contracts in AssemblyScript.
 */

import { U256, Hash, Address, Topic, Context, ErrorCode } from "./types";
import {
  host_storage_get,
  host_storage_set,
  host_storage_delete,
  host_storage_has,
  host_env_caller,
  host_env_self_address,
  host_env_owner,
  host_env_block_height,
  host_env_block_time,
  host_env_value,
  host_env_gas_remaining,
  host_env_tx_hash,
  host_l0_get_balance,
  host_l0_transfer,
  host_l0_write_data,
  host_l0_check_authority,
  host_event_emit,
  host_crypto_sha256,
  host_crypto_keccak256,
  host_crypto_ed25519_verify,
  host_crypto_secp256k1_verify,
  host_call_contract,
  host_log,
  host_revert,
  host_assert,
} from "./host";

// =============================================================================
// Storage Module
// =============================================================================

/** Maximum storage value size */
const MAX_VALUE_SIZE: i32 = 65536;

export namespace Storage {
  /**
   * Get a value from storage
   */
  export function get(key: Uint8Array): Uint8Array | null {
    const buffer = new Uint8Array(MAX_VALUE_SIZE);
    const len = host_storage_get(
      key.dataStart,
      key.length,
      buffer.dataStart
    );

    if (len < 0) {
      return null;
    }

    const result = new Uint8Array(len);
    memory.copy(result.dataStart, buffer.dataStart, len);
    return result;
  }

  /**
   * Get a string value from storage
   */
  export function getString(key: string): string | null {
    const keyBytes = String.UTF8.encode(key);
    const keyArray = new Uint8Array(keyBytes.byteLength);
    memory.copy(keyArray.dataStart, changetype<usize>(keyBytes), keyBytes.byteLength);

    const value = get(keyArray);
    if (value === null) {
      return null;
    }
    return String.UTF8.decode(value.buffer);
  }

  /**
   * Get a U256 value from storage
   */
  export function getU256(key: string): U256 | null {
    const keyBytes = String.UTF8.encode(key);
    const keyArray = new Uint8Array(keyBytes.byteLength);
    memory.copy(keyArray.dataStart, changetype<usize>(keyBytes), keyBytes.byteLength);

    const value = get(keyArray);
    if (value === null || value.length < 32) {
      return null;
    }
    return U256.fromBeBytes(value);
  }

  /**
   * Set a value in storage
   */
  export function set(key: Uint8Array, value: Uint8Array): void {
    host_storage_set(
      key.dataStart,
      key.length,
      value.dataStart,
      value.length
    );
  }

  /**
   * Set a string value in storage
   */
  export function setString(key: string, value: string): void {
    const keyBytes = String.UTF8.encode(key);
    const keyArray = new Uint8Array(keyBytes.byteLength);
    memory.copy(keyArray.dataStart, changetype<usize>(keyBytes), keyBytes.byteLength);

    const valueBytes = String.UTF8.encode(value);
    const valueArray = new Uint8Array(valueBytes.byteLength);
    memory.copy(valueArray.dataStart, changetype<usize>(valueBytes), valueBytes.byteLength);

    set(keyArray, valueArray);
  }

  /**
   * Set a U256 value in storage
   */
  export function setU256(key: string, value: U256): void {
    const keyBytes = String.UTF8.encode(key);
    const keyArray = new Uint8Array(keyBytes.byteLength);
    memory.copy(keyArray.dataStart, changetype<usize>(keyBytes), keyBytes.byteLength);

    set(keyArray, value.toBeBytes());
  }

  /**
   * Delete a value from storage
   */
  export function remove(key: Uint8Array): void {
    host_storage_delete(key.dataStart, key.length);
  }

  /**
   * Delete a string-keyed value from storage
   */
  export function removeString(key: string): void {
    const keyBytes = String.UTF8.encode(key);
    const keyArray = new Uint8Array(keyBytes.byteLength);
    memory.copy(keyArray.dataStart, changetype<usize>(keyBytes), keyBytes.byteLength);
    remove(keyArray);
  }

  /**
   * Check if a key exists in storage
   */
  export function has(key: Uint8Array): bool {
    return host_storage_has(key.dataStart, key.length) != 0;
  }

  /**
   * Check if a string key exists in storage
   */
  export function hasString(key: string): bool {
    const keyBytes = String.UTF8.encode(key);
    const keyArray = new Uint8Array(keyBytes.byteLength);
    memory.copy(keyArray.dataStart, changetype<usize>(keyBytes), keyBytes.byteLength);
    return has(keyArray);
  }
}

// =============================================================================
// Storage Map
// =============================================================================

/**
 * Storage map for key-value mappings with a prefix
 */
export class StorageMap {
  private prefix: Uint8Array;

  constructor(prefix: string) {
    const prefixBytes = String.UTF8.encode(prefix);
    this.prefix = new Uint8Array(prefixBytes.byteLength);
    memory.copy(
      this.prefix.dataStart,
      changetype<usize>(prefixBytes),
      prefixBytes.byteLength
    );
  }

  private buildKey(key: Uint8Array): Uint8Array {
    const fullKey = new Uint8Array(this.prefix.length + key.length);
    memory.copy(fullKey.dataStart, this.prefix.dataStart, this.prefix.length);
    memory.copy(
      fullKey.dataStart + this.prefix.length,
      key.dataStart,
      key.length
    );
    return fullKey;
  }

  get(key: Uint8Array): Uint8Array | null {
    return Storage.get(this.buildKey(key));
  }

  getU256(key: Uint8Array): U256 | null {
    const value = this.get(key);
    if (value === null || value.length < 32) {
      return null;
    }
    return U256.fromBeBytes(value);
  }

  set(key: Uint8Array, value: Uint8Array): void {
    Storage.set(this.buildKey(key), value);
  }

  setU256(key: Uint8Array, value: U256): void {
    this.set(key, value.toBeBytes());
  }

  remove(key: Uint8Array): void {
    Storage.remove(this.buildKey(key));
  }

  has(key: Uint8Array): bool {
    return Storage.has(this.buildKey(key));
  }
}

// =============================================================================
// Environment Module
// =============================================================================

export namespace Env {
  /**
   * Get the caller's address
   */
  export function caller(): Address {
    const buffer = new Uint8Array(256);
    const len = host_env_caller(buffer.dataStart);
    if (len <= 0) {
      return Address.empty();
    }
    const bytes = new Uint8Array(len);
    memory.copy(bytes.dataStart, buffer.dataStart, len);
    return Address.fromBytes(bytes);
  }

  /**
   * Get this contract's address
   */
  export function selfAddress(): Address {
    const buffer = new Uint8Array(256);
    const len = host_env_self_address(buffer.dataStart);
    if (len <= 0) {
      return Address.empty();
    }
    const bytes = new Uint8Array(len);
    memory.copy(bytes.dataStart, buffer.dataStart, len);
    return Address.fromBytes(bytes);
  }

  /**
   * Get the contract owner's address
   */
  export function owner(): Address {
    const buffer = new Uint8Array(256);
    const len = host_env_owner(buffer.dataStart);
    if (len <= 0) {
      return Address.empty();
    }
    const bytes = new Uint8Array(len);
    memory.copy(bytes.dataStart, buffer.dataStart, len);
    return Address.fromBytes(bytes);
  }

  /**
   * Get the current block height
   */
  export function blockHeight(): u64 {
    return host_env_block_height();
  }

  /**
   * Get the current block time (Unix seconds)
   */
  export function blockTime(): u64 {
    return host_env_block_time();
  }

  /**
   * Get the value (tokens) sent with the call
   */
  export function value(): U256 {
    const buffer = new Uint8Array(32);
    host_env_value(buffer.dataStart);
    return U256.fromBeBytes(buffer);
  }

  /**
   * Get the remaining gas
   */
  export function gasRemaining(): u64 {
    return host_env_gas_remaining();
  }

  /**
   * Get the transaction hash
   */
  export function txHash(): Hash {
    const buffer = new Uint8Array(32);
    host_env_tx_hash(buffer.dataStart);
    return Hash.fromBytes(buffer);
  }

  /**
   * Get the full execution context
   */
  export function context(): Context {
    const ctx = new Context();
    ctx.caller = caller();
    ctx.blockHeight = blockHeight();
    ctx.blockTime = blockTime();
    ctx.txHash = txHash();
    ctx.value = value();
    ctx.gasLimit = gasRemaining();
    return ctx;
  }

  /**
   * Log a message (for debugging)
   */
  export function log(message: string): void {
    const bytes = String.UTF8.encode(message);
    host_log(changetype<usize>(bytes), bytes.byteLength);
  }

  /**
   * Revert the transaction with a message
   */
  export function revert(message: string): void {
    const bytes = String.UTF8.encode(message);
    host_revert(changetype<usize>(bytes), bytes.byteLength);
  }

  /**
   * Assert a condition, reverting if false
   */
  export function assert(condition: bool, message: string): void {
    const bytes = String.UTF8.encode(message);
    host_assert(condition ? 1 : 0, changetype<usize>(bytes), bytes.byteLength);
  }

  /**
   * Require a condition, reverting with error code if false
   */
  export function require(condition: bool, errorCode: u32): void {
    if (!condition) {
      revert("Error: " + errorCode.toString());
    }
  }
}

// =============================================================================
// L0 Module (Accumulate Layer 0 Operations)
// =============================================================================

export namespace L0 {
  /**
   * Get the token balance of an L0 account
   */
  export function getBalance(url: Address): U256 {
    const urlBytes = url.toBytes();
    const buffer = new Uint8Array(32);

    const result = host_l0_get_balance(
      urlBytes.dataStart,
      urlBytes.length,
      buffer.dataStart
    );

    if (result < 0) {
      return U256.zero();
    }

    return U256.fromBeBytes(buffer);
  }

  /**
   * Transfer tokens between L0 accounts
   */
  export function transfer(from: Address, to: Address, amount: U256): bool {
    const fromBytes = from.toBytes();
    const toBytes = to.toBytes();
    const amountBytes = amount.toBeBytes();

    const result = host_l0_transfer(
      fromBytes.dataStart,
      fromBytes.length,
      toBytes.dataStart,
      toBytes.length,
      amountBytes.dataStart
    );

    return result >= 0;
  }

  /**
   * Write data to an L0 Data Account
   */
  export function writeData(url: Address, data: Uint8Array): bool {
    const urlBytes = url.toBytes();

    const result = host_l0_write_data(
      urlBytes.dataStart,
      urlBytes.length,
      data.dataStart,
      data.length
    );

    return result >= 0;
  }

  /**
   * Check if a signer has authority over an L0 account
   */
  export function checkAuthority(url: Address, signer: Address): bool {
    const urlBytes = url.toBytes();
    const signerBytes = signer.toBytes();

    const result = host_l0_check_authority(
      urlBytes.dataStart,
      urlBytes.length,
      signerBytes.dataStart,
      signerBytes.length
    );

    return result != 0;
  }
}

// =============================================================================
// Events Module
// =============================================================================

export namespace Events {
  /**
   * Emit an event with topics and data
   */
  export function emit(topics: Topic[], data: Uint8Array): void {
    const topicCount = min(topics.length, 4);
    const topicBytes = new Uint8Array(topicCount * 32);

    for (let i = 0; i < topicCount; i++) {
      const topicData = topics[i].toBytes();
      memory.copy(
        topicBytes.dataStart + i * 32,
        topicData.dataStart,
        32
      );
    }

    host_event_emit(
      topicBytes.dataStart,
      <u32>(topicCount * 32),
      data.dataStart,
      data.length
    );
  }

  /**
   * Emit a simple event with just a topic signature
   */
  export function emitSimple(signature: u32): void {
    emit([Topic.fromU32(signature)], new Uint8Array(0));
  }

  /**
   * Emit an event with one indexed value
   */
  export function emitIndexed1(
    signature: u32,
    indexed: Uint8Array,
    data: Uint8Array
  ): void {
    const topic1 = Topic.fromBytes(indexed);
    emit([Topic.fromU32(signature), topic1], data);
  }

  /**
   * Emit an event with two indexed values
   */
  export function emitIndexed2(
    signature: u32,
    indexed1: Uint8Array,
    indexed2: Uint8Array,
    data: Uint8Array
  ): void {
    emit(
      [
        Topic.fromU32(signature),
        Topic.fromBytes(indexed1),
        Topic.fromBytes(indexed2),
      ],
      data
    );
  }
}

// =============================================================================
// Crypto Module
// =============================================================================

export namespace Crypto {
  /**
   * Compute SHA-256 hash
   */
  export function sha256(data: Uint8Array): Hash {
    const output = new Uint8Array(32);
    host_crypto_sha256(data.dataStart, data.length, output.dataStart);
    return Hash.fromBytes(output);
  }

  /**
   * Compute Keccak-256 hash (Ethereum compatible)
   */
  export function keccak256(data: Uint8Array): Hash {
    const output = new Uint8Array(32);
    host_crypto_keccak256(data.dataStart, data.length, output.dataStart);
    return Hash.fromBytes(output);
  }

  /**
   * Verify an Ed25519 signature
   */
  export function ed25519Verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): bool {
    if (signature.length != 64 || publicKey.length != 32) {
      return false;
    }

    const result = host_crypto_ed25519_verify(
      message.dataStart,
      message.length,
      signature.dataStart,
      publicKey.dataStart
    );

    return result != 0;
  }

  /**
   * Verify a secp256k1 signature
   */
  export function secp256k1Verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): bool {
    if (signature.length != 64 || publicKey.length != 33) {
      return false;
    }

    const result = host_crypto_secp256k1_verify(
      message.dataStart,
      message.length,
      signature.dataStart,
      publicKey.dataStart
    );

    return result != 0;
  }

  /**
   * Hash an address for event indexing
   */
  export function hashAddress(address: Address): Uint8Array {
    return sha256(address.toBytes()).toBytes();
  }

  /**
   * Hash a U256 for event indexing
   */
  export function hashU256(value: U256): Uint8Array {
    return value.toBeBytes();
  }
}

// =============================================================================
// Cross-Contract Calls Module
// =============================================================================

export namespace Calls {
  /**
   * Call another contract
   */
  export function call(address: Address, input: Uint8Array): Uint8Array | null {
    const addressBytes = address.toBytes();
    const output = new Uint8Array(MAX_VALUE_SIZE);

    const result = host_call_contract(
      addressBytes.dataStart,
      addressBytes.length,
      input.dataStart,
      input.length,
      output.dataStart
    );

    if (result < 0) {
      return null;
    }

    const finalOutput = new Uint8Array(result);
    memory.copy(finalOutput.dataStart, output.dataStart, result);
    return finalOutput;
  }

  /**
   * Build a function call with selector and encoded arguments
   */
  export function buildCall(selector: u32, args: Uint8Array): Uint8Array {
    const callData = new Uint8Array(4 + args.length);
    callData[0] = <u8>(selector >> 24);
    callData[1] = <u8>(selector >> 16);
    callData[2] = <u8>(selector >> 8);
    callData[3] = <u8>selector;
    memory.copy(callData.dataStart + 4, args.dataStart, args.length);
    return callData;
  }
}

// =============================================================================
// ABI Encoding Module
// =============================================================================

export namespace ABI {
  /**
   * Encode a u64 value (32 bytes, right-aligned)
   */
  export function encodeU64(value: u64): Uint8Array {
    const result = new Uint8Array(32);
    result[24] = <u8>(value >> 56);
    result[25] = <u8>(value >> 48);
    result[26] = <u8>(value >> 40);
    result[27] = <u8>(value >> 32);
    result[28] = <u8>(value >> 24);
    result[29] = <u8>(value >> 16);
    result[30] = <u8>(value >> 8);
    result[31] = <u8>value;
    return result;
  }

  /**
   * Decode a u64 value
   */
  export function decodeU64(data: Uint8Array): u64 {
    if (data.length < 32) return 0;
    return (
      ((<u64>data[24]) << 56) |
      ((<u64>data[25]) << 48) |
      ((<u64>data[26]) << 40) |
      ((<u64>data[27]) << 32) |
      ((<u64>data[28]) << 24) |
      ((<u64>data[29]) << 16) |
      ((<u64>data[30]) << 8) |
      (<u64>data[31])
    );
  }

  /**
   * Encode a U256 value
   */
  export function encodeU256(value: U256): Uint8Array {
    return value.toBeBytes();
  }

  /**
   * Decode a U256 value
   */
  export function decodeU256(data: Uint8Array): U256 {
    if (data.length < 32) return U256.zero();
    return U256.fromBeBytes(data);
  }

  /**
   * Encode a bool value
   */
  export function encodeBool(value: bool): Uint8Array {
    const result = new Uint8Array(32);
    result[31] = value ? 1 : 0;
    return result;
  }

  /**
   * Decode a bool value
   */
  export function decodeBool(data: Uint8Array): bool {
    if (data.length < 32) return false;
    return data[31] != 0;
  }

  /**
   * Encode an address
   */
  export function encodeAddress(address: Address): Uint8Array {
    const bytes = address.toBytes();
    const result = new Uint8Array(32);
    const len = min(bytes.length, 32);
    memory.copy(result.dataStart + (32 - len), bytes.dataStart, len);
    return result;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

export namespace Utils {
  /**
   * Check if an address is zero/empty
   */
  export function isZeroAddress(address: Address): bool {
    return address.isEmpty();
  }

  /**
   * Require an address is not zero
   */
  export function requireNonZeroAddress(address: Address): void {
    Env.assert(!address.isEmpty(), "Zero address not allowed");
  }

  /**
   * Safe add for U256 (reverts on overflow)
   */
  export function safeAdd(a: U256, b: U256): U256 {
    const result = a.add(b);
    // Check for overflow: result < a means overflow
    Env.assert(!result.lt(a), "Addition overflow");
    return result;
  }

  /**
   * Safe sub for U256 (reverts on underflow)
   */
  export function safeSub(a: U256, b: U256): U256 {
    Env.assert(a.gte(b), "Subtraction underflow");
    return a.sub(b);
  }

  /**
   * Calculate function selector from signature string
   * Uses a simple hash for demonstration - real implementation would use keccak256
   */
  export function functionSelector(signature: string): u32 {
    const bytes = String.UTF8.encode(signature);
    let hash: u32 = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < bytes.byteLength; i++) {
      hash ^= load<u8>(changetype<usize>(bytes) + i);
      hash = hash * 0x01000193; // FNV prime
    }
    return hash;
  }
}

// =============================================================================
// Reentrancy Guard
// =============================================================================

/**
 * Reentrancy guard to prevent reentrancy attacks
 */
export class ReentrancyGuard {
  private key: string;

  constructor(key: string = "__reentrancy_lock") {
    this.key = key;
  }

  enter(): void {
    Env.assert(!Storage.hasString(this.key), "Reentrancy detected");
    Storage.setString(this.key, "1");
  }

  exit(): void {
    Storage.removeString(this.key);
  }
}

/**
 * Host Function Declarations
 *
 * These functions are provided by the Accumen runtime and called by contracts.
 */

// =============================================================================
// Storage Operations
// =============================================================================

/** Get a value from storage. Returns length of value, or -1 if not found. */
// @ts-ignore: decorator
@external("accumen", "host_storage_get")
export declare function host_storage_get(
  key_ptr: usize,
  key_len: u32,
  value_ptr: usize
): i32;

/** Set a value in storage */
// @ts-ignore: decorator
@external("accumen", "host_storage_set")
export declare function host_storage_set(
  key_ptr: usize,
  key_len: u32,
  value_ptr: usize,
  value_len: u32
): void;

/** Delete a value from storage */
// @ts-ignore: decorator
@external("accumen", "host_storage_delete")
export declare function host_storage_delete(key_ptr: usize, key_len: u32): void;

/** Check if a key exists in storage */
// @ts-ignore: decorator
@external("accumen", "host_storage_has")
export declare function host_storage_has(key_ptr: usize, key_len: u32): i32;

// =============================================================================
// Environment
// =============================================================================

/** Get the caller's address. Returns length of address. */
// @ts-ignore: decorator
@external("accumen", "host_env_caller")
export declare function host_env_caller(output_ptr: usize): i32;

/** Get this contract's address. Returns length of address. */
// @ts-ignore: decorator
@external("accumen", "host_env_self_address")
export declare function host_env_self_address(output_ptr: usize): i32;

/** Get the contract owner's address. Returns length of address. */
// @ts-ignore: decorator
@external("accumen", "host_env_owner")
export declare function host_env_owner(output_ptr: usize): i32;

/** Get the current block height */
// @ts-ignore: decorator
@external("accumen", "host_env_block_height")
export declare function host_env_block_height(): u64;

/** Get the current block time (Unix seconds) */
// @ts-ignore: decorator
@external("accumen", "host_env_block_time")
export declare function host_env_block_time(): u64;

/** Get the value (tokens) sent with the call (32 bytes) */
// @ts-ignore: decorator
@external("accumen", "host_env_value")
export declare function host_env_value(output_ptr: usize): void;

/** Get the remaining gas */
// @ts-ignore: decorator
@external("accumen", "host_env_gas_remaining")
export declare function host_env_gas_remaining(): u64;

/** Get the transaction hash (32 bytes) */
// @ts-ignore: decorator
@external("accumen", "host_env_tx_hash")
export declare function host_env_tx_hash(output_ptr: usize): void;

// =============================================================================
// L0 Account Operations
// =============================================================================

/** Get L0 account information. Returns length or negative error. */
// @ts-ignore: decorator
@external("accumen", "host_l0_get_account")
export declare function host_l0_get_account(
  url_ptr: usize,
  url_len: u32,
  output_ptr: usize
): i32;

/** Get token balance (32 bytes). Returns length or negative error. */
// @ts-ignore: decorator
@external("accumen", "host_l0_get_balance")
export declare function host_l0_get_balance(
  url_ptr: usize,
  url_len: u32,
  output_ptr: usize
): i32;

/** Get data from a data account. Returns length or negative error. */
// @ts-ignore: decorator
@external("accumen", "host_l0_get_data")
export declare function host_l0_get_data(
  url_ptr: usize,
  url_len: u32,
  entry_hash_ptr: usize,
  output_ptr: usize
): i32;

/** Create an L0 account. Returns 0 on success or negative error. */
// @ts-ignore: decorator
@external("accumen", "host_l0_create_account")
export declare function host_l0_create_account(
  url_ptr: usize,
  url_len: u32,
  account_type: u8
): i32;

/** Write data to a data account. Returns 0 on success or negative error. */
// @ts-ignore: decorator
@external("accumen", "host_l0_write_data")
export declare function host_l0_write_data(
  url_ptr: usize,
  url_len: u32,
  data_ptr: usize,
  data_len: u32
): i32;

/** Transfer tokens. Returns 0 on success or negative error. */
// @ts-ignore: decorator
@external("accumen", "host_l0_transfer")
export declare function host_l0_transfer(
  from_ptr: usize,
  from_len: u32,
  to_ptr: usize,
  to_len: u32,
  amount_ptr: usize
): i32;

/** Burn credits. Returns 0 on success or negative error. */
// @ts-ignore: decorator
@external("accumen", "host_l0_burn_credits")
export declare function host_l0_burn_credits(
  url_ptr: usize,
  url_len: u32,
  amount: u64
): i32;

/** Get authority information. Returns length or negative error. */
// @ts-ignore: decorator
@external("accumen", "host_l0_get_authority")
export declare function host_l0_get_authority(
  url_ptr: usize,
  url_len: u32,
  output_ptr: usize
): i32;

/** Check if signer has authority. Returns 1 if authorized, 0 if not. */
// @ts-ignore: decorator
@external("accumen", "host_l0_check_authority")
export declare function host_l0_check_authority(
  url_ptr: usize,
  url_len: u32,
  signer_ptr: usize,
  signer_len: u32
): i32;

// =============================================================================
// Events
// =============================================================================

/** Emit an event with topics and data */
// @ts-ignore: decorator
@external("accumen", "host_event_emit")
export declare function host_event_emit(
  topics_ptr: usize,
  topics_len: u32,
  data_ptr: usize,
  data_len: u32
): void;

// =============================================================================
// Cryptography
// =============================================================================

/** Compute SHA-256 hash (32 bytes output) */
// @ts-ignore: decorator
@external("accumen", "host_crypto_sha256")
export declare function host_crypto_sha256(
  data_ptr: usize,
  data_len: u32,
  output_ptr: usize
): void;

/** Compute SHA3-256 hash (32 bytes output) */
// @ts-ignore: decorator
@external("accumen", "host_crypto_sha3_256")
export declare function host_crypto_sha3_256(
  data_ptr: usize,
  data_len: u32,
  output_ptr: usize
): void;

/** Compute Keccak-256 hash (32 bytes output) */
// @ts-ignore: decorator
@external("accumen", "host_crypto_keccak256")
export declare function host_crypto_keccak256(
  data_ptr: usize,
  data_len: u32,
  output_ptr: usize
): void;

/** Compute Blake2b-256 hash (32 bytes output) */
// @ts-ignore: decorator
@external("accumen", "host_crypto_blake2b_256")
export declare function host_crypto_blake2b_256(
  data_ptr: usize,
  data_len: u32,
  output_ptr: usize
): void;

/** Compute RIPEMD-160 hash (20 bytes output) */
// @ts-ignore: decorator
@external("accumen", "host_crypto_ripemd160")
export declare function host_crypto_ripemd160(
  data_ptr: usize,
  data_len: u32,
  output_ptr: usize
): void;

/** Verify Ed25519 signature. Returns 1 if valid, 0 if invalid. */
// @ts-ignore: decorator
@external("accumen", "host_crypto_ed25519_verify")
export declare function host_crypto_ed25519_verify(
  msg_ptr: usize,
  msg_len: u32,
  sig_ptr: usize,
  pubkey_ptr: usize
): i32;

/** Verify secp256k1 signature. Returns 1 if valid, 0 if invalid. */
// @ts-ignore: decorator
@external("accumen", "host_crypto_secp256k1_verify")
export declare function host_crypto_secp256k1_verify(
  msg_ptr: usize,
  msg_len: u32,
  sig_ptr: usize,
  pubkey_ptr: usize
): i32;

/** Recover secp256k1 public key. Returns length or negative error. */
// @ts-ignore: decorator
@external("accumen", "host_crypto_secp256k1_recover")
export declare function host_crypto_secp256k1_recover(
  msg_ptr: usize,
  msg_len: u32,
  sig_ptr: usize,
  recovery_id: u8,
  output_ptr: usize
): i32;

/** Verify BLS12-381 signature. Returns 1 if valid, 0 if invalid. */
// @ts-ignore: decorator
@external("accumen", "host_crypto_bls12_381_verify")
export declare function host_crypto_bls12_381_verify(
  msg_ptr: usize,
  msg_len: u32,
  sig_ptr: usize,
  pubkey_ptr: usize
): i32;

// =============================================================================
// Cross-Contract Calls
// =============================================================================

/** Call another contract. Returns output length or negative error. */
// @ts-ignore: decorator
@external("accumen", "host_call_contract")
export declare function host_call_contract(
  address_ptr: usize,
  address_len: u32,
  input_ptr: usize,
  input_len: u32,
  output_ptr: usize
): i32;

/** Delegate call to another contract. Returns output length or negative error. */
// @ts-ignore: decorator
@external("accumen", "host_delegate_call")
export declare function host_delegate_call(
  address_ptr: usize,
  address_len: u32,
  input_ptr: usize,
  input_len: u32,
  output_ptr: usize
): i32;

// =============================================================================
// Utility
// =============================================================================

/** Log a message (for debugging) */
// @ts-ignore: decorator
@external("accumen", "host_log")
export declare function host_log(msg_ptr: usize, msg_len: u32): void;

/** Revert the transaction with a message */
// @ts-ignore: decorator
@external("accumen", "host_revert")
export declare function host_revert(msg_ptr: usize, msg_len: u32): void;

/** Assert a condition, reverting if false */
// @ts-ignore: decorator
@external("accumen", "host_assert")
export declare function host_assert(
  condition: i32,
  msg_ptr: usize,
  msg_len: u32
): void;

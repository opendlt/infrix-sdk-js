/**
 * Infrix SDK for AssemblyScript
 *
 * Infrix is a governance-first execution fabric. The PRIMARY way you
 * interact with Infrix from AssemblyScript is by emitting governance
 * intents that describe a desired outcome — submitIntent(goal,
 * params, ...). Plans, policies, approvals, trust, evidence, and
 * anchoring are first-class.
 *
 * Contract operations (@contract decorator pattern, raw Storage /
 * Env access) remain available as a secondary, lower-level surface
 * for the WASM execution family. Most users should reach for the
 * governance API first; contract operations are what the spine
 * schedules under the hood once a plan is approved.
 *
 * @example Governance-first
 * ```typescript
 * import { Governance } from "@infrix/sdk";
 *
 * // Submit a governed transfer intent — the canonical surface.
 * Governance.submitIntent(
 *   "GOVERNED_TRANSFER",
 *   { from: "acc://alice.acme", to: "acc://bob.acme", amount: 100 },
 * );
 * ```
 *
 * @example Contract operations (secondary, low-level)
 * ```typescript
 * import { Storage, U256 } from "@infrix/sdk";
 *
 * // Direct contract storage — used inside WASM contract bodies that
 * // execute as the result of an approved governance plan.
 * const COUNTER_KEY = "counter";
 *
 * export function increment(): void {
 *   let count = Storage.getU256(COUNTER_KEY);
 *   if (count === null) count = U256.zero();
 *   Storage.setU256(COUNTER_KEY, count.add(U256.one()));
 * }
 * ```
 *
 * G-21 phase 2: governance exports are listed FIRST so any tool that
 * reads index.ts surface alphabetically or top-down sees governance
 * first. The governance-first sentinel test in
 * sdk/assemblyscript/__tests__/governance_first_sentinel.test.ts
 * locks the export ordering.
 */

// =============================================================================
// PRIMARY: governance surface
// =============================================================================

// Governance module is the canonical first contact with Infrix.
export { Governance } from "./governance";

// Cross-cutting governance enums (wire-compatible with TS / Rust SDKs).
export {
  AnchorClass,
  PrivacyClass,
  SettlementMethod,
  ExecutionFamily,
  TrustResponseAction,
  OutcomeFinality,
} from "./governance";

// =============================================================================
// SECONDARY: contract operations + value types
// =============================================================================

// Value-type primitives shared across both surfaces.
export {
  U256,
  Hash,
  Address,
  Topic,
  Context,
  ErrorCode,
} from "./types";

// Contract / execution-family modules. These are the lower-level
// primitives the spine schedules once a plan is approved; user code
// generally reaches for governance first.
export {
  Storage,
  StorageMap,
  Env,
  L0,
  Events,
  Crypto,
  Calls,
  ABI,
  Utils,
  ReentrancyGuard,
} from "./sdk";

// Export testing framework
export {
  describe,
  it,
  test,
  expect,
  Expect,
  assertEq,
  assertEq64,
  assertTrue,
  assertFalse,
  fail,
  TestContext,
  TestResult,
  ctx,
  runTests,
  testCount,
  getTestName,
  testSummary,
} from "./testing";

// =============================================================================
// ACU-20 Token Standard Interface
// =============================================================================

/**
 * ACU-20 Function Selectors
 */
export namespace ACU20 {
  export const NAME_SELECTOR: u32 = 0x06fdde03;
  export const SYMBOL_SELECTOR: u32 = 0x95d89b41;
  export const DECIMALS_SELECTOR: u32 = 0x313ce567;
  export const TOTAL_SUPPLY_SELECTOR: u32 = 0x18160ddd;
  export const BALANCE_OF_SELECTOR: u32 = 0x70a08231;
  export const TRANSFER_SELECTOR: u32 = 0xa9059cbb;
  export const APPROVE_SELECTOR: u32 = 0x095ea7b3;
  export const ALLOWANCE_SELECTOR: u32 = 0xdd62ed3e;
  export const TRANSFER_FROM_SELECTOR: u32 = 0x23b872dd;

  // Event signatures
  export const TRANSFER_EVENT: u32 = 0xddf252ad;
  export const APPROVAL_EVENT: u32 = 0x8c5be1e5;
}

// =============================================================================
// ACU-721 NFT Standard Interface
// =============================================================================

/**
 * ACU-721 Function Selectors
 */
export namespace ACU721 {
  export const OWNER_OF_SELECTOR: u32 = 0x6352211e;
  export const BALANCE_OF_SELECTOR: u32 = 0x70a08231;
  export const APPROVE_SELECTOR: u32 = 0x095ea7b3;
  export const GET_APPROVED_SELECTOR: u32 = 0x081812fc;
  export const SET_APPROVAL_FOR_ALL_SELECTOR: u32 = 0xa22cb465;
  export const IS_APPROVED_FOR_ALL_SELECTOR: u32 = 0xe985e9c5;
  export const TRANSFER_FROM_SELECTOR: u32 = 0x23b872dd;
  export const SAFE_TRANSFER_FROM_SELECTOR: u32 = 0x42842e0e;
  export const TOKEN_URI_SELECTOR: u32 = 0xc87b56dd;

  // Event signatures
  export const TRANSFER_EVENT: u32 = 0xddf252ad;
  export const APPROVAL_EVENT: u32 = 0x8c5be1e5;
  export const APPROVAL_FOR_ALL_EVENT: u32 = 0x17307eab;
}

// =============================================================================
// Contract Entry Point Helpers
// =============================================================================

/**
 * Extract function selector from call data
 */
export function getSelector(input: Uint8Array): u32 {
  if (input.length < 4) {
    return 0;
  }
  return (
    ((<u32>input[0]) << 24) |
    ((<u32>input[1]) << 16) |
    ((<u32>input[2]) << 8) |
    (<u32>input[3])
  );
}

/**
 * Get call data (without selector)
 */
export function getCallData(input: Uint8Array): Uint8Array {
  if (input.length <= 4) {
    return new Uint8Array(0);
  }
  const data = new Uint8Array(input.length - 4);
  memory.copy(data.dataStart, input.dataStart + 4, input.length - 4);
  return data;
}

/**
 * Encode return data
 */
export function encodeReturn(data: Uint8Array): Uint8Array {
  return data;
}

/**
 * Encode error return
 */
export function encodeError(errorCode: u32): Uint8Array {
  const result = new Uint8Array(4);
  result[0] = <u8>(errorCode >> 24);
  result[1] = <u8>(errorCode >> 16);
  result[2] = <u8>(errorCode >> 8);
  result[3] = <u8>errorCode;
  return result;
}

// =============================================================================
// Contract Dispatcher Template
// =============================================================================

/**
 * Base class for contract implementation
 *
 * @example
 * ```typescript
 * class MyToken extends Contract {
 *   dispatch(selector: u32, data: Uint8Array): Uint8Array {
 *     switch (selector) {
 *       case ACU20.BALANCE_OF_SELECTOR:
 *         return this.balanceOf(data);
 *       case ACU20.TRANSFER_SELECTOR:
 *         return this.transfer(data);
 *       default:
 *         return encodeError(ErrorCode.UNKNOWN_FUNCTION);
 *     }
 *   }
 * }
 * ```
 */
export abstract class Contract {
  /**
   * Dispatch a function call based on selector
   */
  abstract dispatch(selector: u32, data: Uint8Array): Uint8Array;

  /**
   * Main entry point for contract calls
   */
  call(input: Uint8Array): Uint8Array {
    const selector = getSelector(input);
    const data = getCallData(input);
    return this.dispatch(selector, data);
  }
}

/**
 * The Infrix contract ABI's result-code registry.
 *
 * Matrix row A.ABI.RESULTCODE.REGISTRY.
 *
 * # What this is
 *
 * A contract exports one entry point,
 * `__infrix_call(inPtr, inLen, outPtr) -> i32`. It returns the number of bytes
 * written on success, and on failure the NEGATION of an `infrix_types::Error`
 * discriminant. So a contract that does not implement the method you called
 * answers `-25`, one that cannot fund a transfer answers `-7`, and one whose
 * policy refused answers `-33`.
 *
 * The negative sign alone says only "the contract refused". Reading the number
 * is what lets a caller tell a wrong call — which will refuse again however
 * many times it is retried — apart from a refusal about the state of the world,
 * which may well succeed later.
 *
 * # This table is adopted, not invented
 *
 * Every entry is the published Rust SDK's own variant and discriminant, because
 * that is what already-deployed contracts answer. `contractResultCode.test.ts`
 * reads `infrix-crates/infrix-types/src/lib.rs` and fails if the two disagree.
 *
 * A negative code with no entry here is a refusal this SDK cannot name. It is
 * reported verbatim as unrecognised and classified `execution_failed`. A
 * contract may use its own numbers; what it does not get is a meaning invented
 * for it.
 */

/** Registry code (the absolute value of the dispatcher's negative return). */
export const CONTRACT_RESULT_CODES: Readonly<Record<number, string>> = Object.freeze({
  0: 'Success',
  1: 'InvalidArgument',
  2: 'OutOfMemory',
  3: 'OutOfGas',
  4: 'StorageError',
  5: 'Unauthorized',
  6: 'AccountNotFound',
  7: 'InsufficientBalance',
  8: 'InsufficientCredits',
  9: 'ContractNotFound',
  10: 'FunctionNotFound',
  11: 'InvalidState',
  12: 'Overflow',
  13: 'Underflow',
  14: 'DivisionByZero',
  15: 'InvalidSignature',
  16: 'Revert',
  17: 'Panic',
  18: 'CallDepthExceeded',
  19: 'ReadOnlyViolation',
  20: 'ReentrancyDetected',
  21: 'NotPayable',
  22: 'ZeroAddress',
  23: 'ContractNotInitialized',
  24: 'InvalidInput',
  25: 'UnknownFunction',
  26: 'EncodingError',
  27: 'DecodingError',
  28: 'BufferTooSmall',
  29: 'GovernanceError',
  30: 'ApprovalRequired',
  31: 'CapabilityDenied',
  32: 'RoleRequired',
  33: 'PolicyDenied',
  255: 'Unknown',
});

/**
 * The failure classes the governed step model uses. These are the same strings
 * infrix-core reports on a step outcome, so a caller branches on one value
 * whether it read the code off the wire itself or off a step result.
 */
export type ContractFailureClass =
  | 'invalid_input'
  | 'capability_denied'
  | 'policy_denied'
  | 'approval_missing'
  | 'trust_failed'
  | 'internal_error'
  | 'execution_failed';

/** What a dispatcher's return value meant. */
export interface ContractRefusal {
  /** The raw value the dispatcher returned. */
  readonly code: number;
  /** The registry's variant name, or null when the registry does not name it. */
  readonly name: string | null;
  /** The class a caller branches on. */
  readonly failureClass: ContractFailureClass;
  /** Whether the registry named the code. */
  readonly recognized: boolean;
  /** A sentence fit to show a person. */
  readonly message: string;
}

const INVALID_INPUT = new Set([1, 10, 21, 22, 24, 25, 26, 27, 28]);
const CAPABILITY_DENIED = new Set([5, 31, 32]);
const INTERNAL_ERROR = new Set([2, 4, 17, 255]);

/**
 * Classify a dispatcher result code.
 *
 * The mapping answers one question per class: was this the CALLER's mistake
 * (`invalid_input` — change the call, do not retry it), a matter of AUTHORITY
 * (`capability_denied`, `policy_denied`, `approval_missing`), a question of
 * TRUST (`trust_failed`), a fault in the machinery rather than a decision
 * (`internal_error`), or the contract declining on its own domain terms
 * (`execution_failed`, the honest default)?
 */
export function classifyContractResultCode(code: number): ContractFailureClass {
  if (code >= 0) throw new RangeError(String(code) + ' is a byte count, not a refusal');
  const magnitude = -code;
  if (!(magnitude in CONTRACT_RESULT_CODES)) return 'execution_failed';
  if (INVALID_INPUT.has(magnitude)) return 'invalid_input';
  if (CAPABILITY_DENIED.has(magnitude)) return 'capability_denied';
  if (INTERNAL_ERROR.has(magnitude)) return 'internal_error';
  if (magnitude === 33) return 'policy_denied';
  if (magnitude === 30) return 'approval_missing';
  if (magnitude === 15) return 'trust_failed';
  return 'execution_failed';
}

/** The registry's name for a code, or null when it names none. */
export function contractResultName(code: number): string | null {
  if (code >= 0) return null;
  const name = CONTRACT_RESULT_CODES[-code];
  return name === undefined ? null : name;
}

/**
 * Read a dispatcher's return value. Returns null for a non-negative value,
 * which is a byte count and not a refusal at all.
 */
export function describeContractRefusal(code: number): ContractRefusal | null {
  if (code >= 0) return null;
  const name = contractResultName(code);
  const failureClass = classifyContractResultCode(code);
  const message =
    name === null
      ? 'the contract refused with code ' +
        String(code) +
        ', which the ABI registry does not name. This is the contract’s own number and ' +
        'this SDK does not translate it.'
      : 'the contract refused with code ' +
        String(code) +
        ' (' +
        name +
        '), classified ' +
        failureClass +
        '.';
  return { code, name, failureClass, recognized: name !== null, message };
}

// Test-only entry point (never published: package.json "files" lists assembly/ and
// build/release.* only). It drives every Governance host-calling function with
// bytes the JS test writes into linear memory, so the compiled AssemblyScript runs
// against a recording host and what it actually passes to the host can be inspected.
//
// Inputs are packed in the scratch buffer one after another, each of the lengths
// the export is given. A result is written back at scratch[0] and its byte length
// returned; -1 means the SDK function returned null.
import { Governance } from "../assembly/governance";

const scratch = new ArrayBuffer(16384);

/** Address of the scratch buffer the test writes the inputs into. */
export function scratchPtr(): usize {
  return changetype<usize>(scratch);
}

function arg(offset: i32, length: i32): string {
  return String.UTF8.decodeUnsafe(changetype<usize>(scratch) + <usize>offset, <usize>length);
}

function argBytes(offset: i32, length: i32): Uint8Array {
  const out = new Uint8Array(length);
  memory.copy(out.dataStart, changetype<usize>(scratch) + <usize>offset, <usize>length);
  return out;
}

function putString(s: string | null): i32 {
  if (s === null) return -1;
  const bytes = String.UTF8.encode(s);
  memory.copy(changetype<usize>(scratch), changetype<usize>(bytes), <usize>bytes.byteLength);
  return bytes.byteLength;
}

function putBytes(b: Uint8Array | null): i32 {
  if (b === null) return -1;
  memory.copy(changetype<usize>(scratch), b.dataStart, <usize>b.length);
  return b.length;
}

export function pGetIntentStatus(idLen: i32): i32 {
  return putString(Governance.getIntentStatus(arg(0, idLen)));
}

export function pCreateObject(typeLen: i32, fieldsLen: i32): i32 {
  return putString(Governance.createObject(arg(0, typeLen), argBytes(typeLen, fieldsLen)));
}

export function pGetObject(typeLen: i32, idLen: i32): i32 {
  return putBytes(Governance.getObject(arg(0, typeLen), arg(typeLen, idLen)));
}

export function pTransitionObject(typeLen: i32, idLen: i32, stateLen: i32): i32 {
  return putString(Governance.transitionObject(arg(0, typeLen), arg(typeLen, idLen), arg(typeLen + idLen, stateLen)));
}

export function pHasCapability(identLen: i32, capLen: i32): i32 {
  return Governance.hasCapability(arg(0, identLen), arg(identLen, capLen)) ? 1 : 0;
}

export function pCallerHasCapability(capLen: i32): i32 {
  return Governance.callerHasCapability(arg(0, capLen)) ? 1 : 0;
}

export function pGrantCapability(a: i32, b: i32, c: i32, d: i32, e: i32): i32 {
  return putString(
    Governance.grantCapability(arg(0, a), arg(a, b), arg(a + b, c), arg(a + b + c, d), arg(a + b + c + d, e))
  );
}

export function pHasRole(identLen: i32, roleLen: i32): i32 {
  return Governance.hasRole(arg(0, identLen), arg(identLen, roleLen)) ? 1 : 0;
}

export function pRequireApproval(roleLen: i32, threshold: u32): i32 {
  return Governance.requireApproval(arg(0, roleLen), threshold) ? 1 : 0;
}

export function pEvaluatePolicy(typeLen: i32): i32 {
  return putBytes(Governance.evaluatePolicy(arg(0, typeLen)));
}

export function pGetEvidence(idLen: i32): i32 {
  return putBytes(Governance.getEvidence(arg(0, idLen)));
}

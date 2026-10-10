// Test-only entry point (never published: package.json "files" lists assembly/ and
// build/release.* only). It drives the real Governance.submitIntent with bytes the
// JS test writes into linear memory, so the compiled AssemblyScript runs against a
// recording host import and what it actually passes to the host can be inspected.
import { Governance } from "../assembly/governance";

const scratch = new ArrayBuffer(8192);

/** Address of the scratch buffer the test writes the inputs into. */
export function scratchPtr(): usize {
  return changetype<usize>(scratch);
}

/**
 * The goal type's UTF-8 bytes are at scratch[0, goalLen) and the params' UTF-8
 * bytes at scratch[goalLen, goalLen + paramsLen). Returns the child intent id's
 * byte length (the id is written back at scratch[0]), or -1 when submitIntent
 * returned null.
 */
export function submit(goalLen: i32, paramsLen: i32): i32 {
  const base = changetype<usize>(scratch);
  const goal = String.UTF8.decodeUnsafe(base, <usize>goalLen);
  const params = new Uint8Array(paramsLen);
  memory.copy(params.dataStart, base + <usize>goalLen, <usize>paramsLen);
  const id = Governance.submitIntent(goal, params);
  if (id === null) return -1;
  const bytes = String.UTF8.encode(id);
  memory.copy(base, changetype<usize>(bytes), <usize>bytes.byteLength);
  return bytes.byteLength;
}

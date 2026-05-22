/**
 * Infrix SDK — WASM entry point for SDK self-verification builds.
 *
 * AUDIT_FINDINGS_2026-05-21 #18 closure: pre-closure the SDK build
 * compiled assembly/index.ts directly, which exposed the entire SDK
 * surface (namespaces / abstract classes / value classes like U256,
 * Hash, Address) as WASM module exports. AssemblyScript correctly
 * surfaced AS235 warnings because namespaces and classes do NOT become
 * WASM module exports — only variables, functions, and enums do. The
 * SDK is consumer-facing TypeScript-level surface (contract authors
 * `import { U256, Storage } from "@infrix/sdk"`); it is NOT meant to
 * be a deployable WASM module by itself.
 *
 * This file is the build target for `asbuild` — it only re-exports
 * what AssemblyScript actually emits as WASM exports (top-level
 * functions and constants), so the build verifies the SDK compiles
 * end-to-end against the AS toolchain without flooding the operator
 * with 60 AS235 warnings about declarations the AS compiler cannot
 * structurally expose.
 *
 * Consumer contracts continue to `import` from "@infrix/sdk" which
 * resolves to assembly/index.ts (the package "main" via the build
 * output). Their own contract entry files will export top-level
 * functions for the runtime to call.
 */

// Touch the SDK so the AS compiler walks the full type graph and
// surfaces any structural breakage that would also break consumer
// builds — this is the actual verification value of the asbuild step.
// Importing the index for its side-effect is enough; we don't need to
// re-export anything because no class or namespace is a valid WASM
// export shape.
import "./index";

/**
 * SDK build heartbeat. Returns the SDK semantic-version-as-u32
 * (0.1.0 → 0x00010000) so a host can introspect which SDK release
 * a contract was built against. This is the canonical top-level
 * function export the asbuild surfaces.
 */
export function infrix_sdk_version(): u32 {
  // 0.1.0
  return (0 << 24) | (1 << 16) | (0 << 8) | 0;
}

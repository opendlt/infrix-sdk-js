/**
 * Local proof verification helper (platform-review-3 Epic 7).
 *
 * `verifyLocalProof` is a dependency-free, offline structural verifier over
 * a portable evidence package. It mirrors the gating the Go verifier
 * (pkg/verifykit) applies: it classifies the achieved proof + governance
 * level from the bundle, enforces a required tier, and enforces the replay
 * requirement (a public-production bundle must carry a replay capsule).
 *
 * It does NOT recompute the cryptographic export hash — that is the job of
 * `infrix verify` (or the shared WASM verifier). This helper answers the
 * day-one developer question — "does this proof meet L4/G2 with replay?" —
 * without a Go toolchain, and refuses to export a public-production proof
 * that lacks replay material.
 */

/** A portable evidence package (the JSON `infrix verify` consumes). */
export type PortableProof = Record<string, unknown>;

/** Required tier, e.g. "L4/G2". */
export interface VerifyRequire {
  /** Minimum tier as "L<n>/G<n>" (e.g. "L4/G2"). */
  require?: string;
  /** When true, the package must carry a replay capsule. */
  replay?: boolean;
  /**
   * When true, treat the bundle as L0-confirmed (the caller verified the
   * anchor against live L0 out of band). Offline, an anchored bundle caps
   * at L3; pass l0Confirmed when an L0 endpoint confirmed it.
   */
  l0Confirmed?: boolean;
}

/** Result of a local proof verification. */
export interface ProofVerifyResult {
  verified: boolean;
  proofLevel: string;
  governanceLevel: string;
  tier: string;
  replayAvailable: boolean;
  reasons: string[];
}

const PROOF_RANK: Record<string, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };
const GOV_RANK: Record<string, number> = { ungoverned: 0, G0: 1, G1: 2, G2: 3 };

/**
 * Verify a portable proof locally. Returns a structured verdict; never
 * throws on a malformed package (it reports the reason instead).
 */
export function verifyLocalProof(pkg: PortableProof, opts: VerifyRequire = {}): ProofVerifyResult {
  const reasons: string[] = [];
  const replayAvailable = hasReplayCapsule(pkg);

  const bundle = parseBundle(pkg);
  const anchored = isAnchored(bundle);
  const proofLevel = anchored && opts.l0Confirmed ? 'L4' : anchored ? 'L3' : 'L0';
  const governanceLevel = classifyGovernance(bundle, anchored);
  const tier = `${proofLevel}/${governanceLevel}`;

  if ((pkg.version ?? '') !== '4') {
    reasons.push(`unsupported package version ${String(pkg.version)} (expected 4)`);
  }

  let verified = reasons.length === 0;

  if (opts.require) {
    const [reqProof, reqGov] = parseTier(opts.require);
    if ((PROOF_RANK[proofLevel] ?? -1) < (PROOF_RANK[reqProof] ?? 99)) {
      reasons.push(`proof level ${proofLevel} below required ${reqProof}`);
      verified = false;
    }
    if ((GOV_RANK[governanceLevel] ?? -1) < (GOV_RANK[reqGov] ?? 99)) {
      reasons.push(`governance level ${governanceLevel} below required ${reqGov}`);
      verified = false;
    }
  }

  if (opts.replay && !replayAvailable) {
    reasons.push('deterministic replay required but no replay capsule is present');
    verified = false;
  }

  return { verified, proofLevel, governanceLevel, tier, replayAvailable, reasons };
}

/** hasReplayCapsule reports whether the package carries replay material. */
export function hasReplayCapsule(pkg: PortableProof): boolean {
  const c = pkg.replayCapsule;
  if (c == null) return false;
  if (typeof c === 'string') return c.length > 0 && c !== 'null';
  return Object.keys(c as object).length > 0;
}

function parseBundle(pkg: PortableProof): Record<string, unknown> {
  const raw = pkg.bundleData;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

function isAnchored(bundle: Record<string, unknown>): boolean {
  const a = String(bundle.anchor ?? '');
  return a === 'anchored' || a === 'verified';
}

function classifyGovernance(bundle: Record<string, unknown>, anchored: boolean): string {
  const decisions = asArray(bundle.policyDecisions);
  let policyAllowed = false;
  for (const d of decisions) {
    const dec = String((d as Record<string, unknown>).decision ?? '');
    if (['deny', 'denied', 'reject', 'rejected', 'block', 'blocked'].includes(dec)) {
      return 'ungoverned';
    }
    policyAllowed = true;
  }
  if (!policyAllowed) return 'ungoverned';

  const approvals = asArray(bundle.approvalEvidence);
  const signed = approvals.some((a) => {
    const r = a as Record<string, unknown>;
    return !!r.identity && !!r.planHash;
  });
  if (!signed) return 'G0';

  const proofs = asArray(bundle.externalProofs);
  const credentialed = proofs.some((p) => !!(p as Record<string, unknown>).verified);
  if (credentialed && anchored) return 'G2';
  return 'G1';
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function parseTier(s: string): [string, string] {
  const parts = s.split('/');
  return [parts[0]?.trim() ?? '', parts[1]?.trim() ?? ''];
}

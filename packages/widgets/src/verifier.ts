// @infrix/widgets — framework-neutral verification core (nextux-09).
//
// Every widget verifies through this module. It composes the SAME canonical
// browser verifiers Nexus and the SDK use (vendored from pkg/nexus/web): the
// offline portable-package verifier, the proof-receipt builder/validator, and
// the proof-story structural verifier. It is honest by construction:
//
//   - it never reports "verified" unless verification actually ran;
//   - an offline verdict is never inflated to L4 (L4 needs an L0 confirmation);
//   - it NEVER contacts a network by default — a live L0 check happens ONLY when
//     the caller explicitly supplies an `l0` verification endpoint, and the
//     label says plainly when live L0 was not checked.

// @ts-ignore — vendored browser module (typed as any via allowJs).
import { verifyPortablePackage } from './vendor/portableVerifier.js';
// @ts-ignore
import { buildReceiptFromVerifier, validateReceipt, receiptBadges } from './vendor/proofReceipt.js';
// @ts-ignore
import { verifyStoryStructure, verifyShareBundle } from './vendor/proofStory.js';
// @ts-ignore
import { setUxFixture, badgesFor } from './vendor/uxLabels.js';
import uxFixture from './vendor/uxFixture.js';

// Initialize the canonical UX label fixture ONCE so every widget renders the
// same assurance badges / trust-boundary wording as Nexus + the SDK (no
// duplicate wording). Guarded so re-imports are harmless.
let _fixtureLoaded = false;
function ensureLabels(): void {
  if (_fixtureLoaded) return;
  try {
    setUxFixture(uxFixture);
    _fixtureLoaded = true;
  } catch {
    /* the fixture is bundled; this never realistically fails */
  }
}
ensureLabels();

export type VerifyKind = 'receipt' | 'bundle' | 'story';
export type VerifyStatus = 'verified' | 'partial' | 'failed' | 'unverified';

export interface VerifyCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface VerifyResult {
  kind: VerifyKind;
  /** ran is true only when verification actually executed. A widget must never
   *  show a verified state when ran is false. */
  ran: boolean;
  /** localVerified is the offline structural verdict (no node trust). */
  localVerified: boolean;
  status: VerifyStatus;
  proofLevel: string;
  governanceLevel: string;
  label: string;
  nodeTrusted: boolean; // always false
  /** l0Checked is true only when a live L0 endpoint was supplied AND queried. */
  l0Checked: boolean;
  l0Verified: boolean;
  network: string;
  replayPresent: boolean;
  cinemaBound: boolean;
  checks: VerifyCheck[];
  warnings: string[];
  /** honestLabel is the user-facing one-liner: "Locally verified. Live L0 not
   *  checked." etc. It never says "Fully verified" unless L0 was confirmed. */
  honestLabel: string;
  /** receipt is the canonical proof receipt (when a bundle/receipt was given). */
  receipt?: unknown;
}

export interface VerifyOptions {
  /** l0, when set, is a verification-backend URL the caller explicitly opts into
   *  for a live L0 confirmation. The proof bundle is POSTed to it ONLY then — by
   *  default nothing leaves the browser. The endpoint must return
   *  { l0Verified: boolean, network?: string }. */
  l0?: string;
  /** network labels which network an L4 confirmation targets. */
  network?: string;
  /** fetchImpl overrides global fetch (for tests / custom transports). */
  fetchImpl?: typeof fetch;
}

const PROOF_LEVELS = new Set(['L1', 'L2', 'L3', 'L4']);

function honestLabelFor(r: { localVerified: boolean; ran: boolean; l0Checked: boolean; l0Verified: boolean; network: string }): string {
  if (!r.ran) return 'Not verified.';
  if (!r.localVerified) return 'Verification failed.';
  if (r.l0Verified) return `Fully verified — L0 confirmed${r.network ? ' on ' + r.network : ''}.`;
  if (r.l0Checked) return 'Locally verified. Live L0 not confirmed.';
  return 'Locally verified. Live L0 not checked.';
}

// confirmL0 performs the OPT-IN live L0 confirmation against a caller-supplied
// verification backend. It POSTs the bundle ONLY because the caller passed an
// endpoint; nothing leaves the browser otherwise (invariant: no payload leak by
// default).
async function confirmL0(bundle: unknown, opts: VerifyOptions): Promise<{ l0Verified: boolean; network: string }> {
  const f = opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!f) return { l0Verified: false, network: opts.network || '' };
  try {
    const res = await f(opts.l0 as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle }),
    });
    if (!res.ok) return { l0Verified: false, network: opts.network || '' };
    const json = (await res.json()) as { l0Verified?: boolean; network?: string };
    return { l0Verified: !!json.l0Verified, network: json.network || opts.network || '' };
  } catch {
    return { l0Verified: false, network: opts.network || '' };
  }
}

/** verifyBundle verifies a portable evidence package offline (and, only when an
 *  l0 endpoint is supplied, confirms the L0 anchor live). */
export async function verifyBundle(bundle: unknown, opts: VerifyOptions = {}): Promise<VerifyResult> {
  if (!bundle || typeof bundle !== 'object') {
    return failed('bundle', 'bundle must be a parsed portable evidence package object');
  }
  const result = await verifyPortablePackage(bundle);
  const checks: VerifyCheck[] = (result.checks || []).map((c: { name: string; passed: boolean; detail?: string; error?: string }) => ({
    name: c.name, passed: !!c.passed, detail: c.detail || c.error,
  }));

  let l0Checked = false;
  let l0Verified = false;
  let network = opts.network || '';
  if (opts.l0 && result.passed) {
    l0Checked = true;
    const c = await confirmL0(bundle, opts);
    l0Verified = c.l0Verified;
    network = c.network;
  }

  const receipt = buildReceiptFromVerifier(result, {
    verifier: '@infrix/widgets (offline)',
    command: opts.l0 ? `infrix verify <bundle>.infrix.json --l0 ${opts.l0}` : 'infrix verify <bundle>.infrix.json',
    network: l0Verified ? network : '',
    l0Verified,
    proofLevel: result.passed ? (l0Verified ? 'L4' : 'L3') : 'L0',
  });

  const localVerified = !!result.passed;
  const r: VerifyResult = {
    kind: 'bundle',
    ran: true,
    localVerified,
    status: localVerified ? 'verified' : 'failed',
    proofLevel: receipt.assurance.proofLevel,
    governanceLevel: receipt.assurance.governanceLevel || '',
    label: receipt.assurance.label,
    nodeTrusted: false,
    l0Checked,
    l0Verified,
    network,
    replayPresent: checks.some((c) => c.name.includes('replay')),
    cinemaBound: false,
    checks,
    warnings: receipt.warnings || [],
    honestLabel: '',
    receipt,
  };
  r.honestLabel = honestLabelFor(r);
  return r;
}

/** verifyStory verifies a proof story (a self-contained share bundle, or a
 *  { story, files } pair). It checks the manifest, Cinema binding, replay
 *  presence, and assurance honesty — offline, trusting no node. */
export async function verifyStory(input: unknown, opts: VerifyOptions = {}): Promise<VerifyResult> {
  const obj = input as { story?: unknown; files?: Record<string, unknown>; version?: number; manifest?: unknown[]; assurance?: any; artifacts?: Record<string, string> };
  let storyObj: any;
  let result: { ok: boolean; checks: { name: string; ok: boolean; detail?: string }[] };

  if (obj && obj.story && obj.files) {
    storyObj = obj.story;
    result = await verifyShareBundle(obj, { l0Confirmed: opts.l0 ? undefined : false });
  } else if (obj && Array.isArray(obj.manifest)) {
    // A bare story with no co-located files can only assert honesty, not the
    // manifest checksums — report that plainly rather than over-claiming.
    storyObj = obj;
    result = await verifyStoryStructure(obj, {}, { l0Confirmed: opts.l0 ? undefined : false });
  } else {
    return failed('story', 'input is not a proof story or a self-contained share bundle');
  }

  const checks: VerifyCheck[] = (result.checks || []).map((c) => ({ name: c.name, passed: !!c.ok, detail: c.detail }));
  const a = (storyObj && storyObj.assurance) || {};
  const localVerified = !!result.ok && !!a.verified;
  const cinemaBound = checks.some((c) => c.name === 'cinema-binding' && c.passed);
  const replayPresent = !!a.replayVerified || !!(storyObj.artifacts && storyObj.artifacts.cinemaReplay);

  let proofLevel = String(a.proofLevel || (localVerified ? 'L3' : 'L0')).toUpperCase();
  // Offline never inflates to L4.
  let l0Checked = false;
  let l0Verified = false;
  let network = opts.network || a.network || '';
  if (opts.l0 && localVerified) {
    l0Checked = true;
    const c = await confirmL0(input, opts);
    l0Verified = c.l0Verified;
    network = c.network;
  }
  if (proofLevel === 'L4' && !l0Verified) proofLevel = 'L3';

  const governanceLevel = String(a.governanceLevel || '');
  const r: VerifyResult = {
    kind: 'story',
    ran: true,
    localVerified,
    status: result.ok ? (localVerified ? 'verified' : 'partial') : 'failed',
    proofLevel: PROOF_LEVELS.has(proofLevel) ? proofLevel : (localVerified ? 'L3' : 'L0'),
    governanceLevel,
    label: governanceLevel ? `${proofLevel}/${governanceLevel}` : proofLevel,
    nodeTrusted: false,
    l0Checked,
    l0Verified,
    network,
    replayPresent,
    cinemaBound,
    checks,
    warnings: checks.filter((c) => !c.passed).map((c) => `check failed: ${c.name}${c.detail ? ' — ' + c.detail : ''}`),
    honestLabel: '',
    receipt: undefined,
  };
  r.honestLabel = honestLabelFor(r);
  return r;
}

/** verifyReceipt validates a canonical proof receipt fail-closed. */
export function verifyReceiptResult(receipt: unknown): VerifyResult {
  const errs: string[] = validateReceipt(receipt);
  const rec = receipt as any;
  const a = (rec && rec.assurance) || {};
  const valid = errs.length === 0;
  const localVerified = valid && rec.status === 'verified';
  const l0Verified = !!a.l0Verified;
  const r: VerifyResult = {
    kind: 'receipt',
    ran: true,
    localVerified,
    status: valid ? (rec.status as VerifyStatus) : 'failed',
    proofLevel: String(a.proofLevel || ''),
    governanceLevel: String(a.governanceLevel || ''),
    label: String(a.label || ''),
    nodeTrusted: !!a.nodeTrusted,
    l0Checked: l0Verified,
    l0Verified,
    network: (rec && rec.verification && rec.verification.network) || '',
    replayPresent: !!a.replayVerified,
    cinemaBound: false,
    checks: errs.map((e) => ({ name: 'validate', passed: false, detail: e })),
    warnings: valid ? (rec.warnings || []) : errs,
    honestLabel: '',
    receipt,
  };
  r.honestLabel = honestLabelFor(r);
  return r;
}

function failed(kind: VerifyKind, detail: string): VerifyResult {
  return {
    kind, ran: false, localVerified: false, status: 'failed',
    proofLevel: '', governanceLevel: '', label: '', nodeTrusted: false,
    l0Checked: false, l0Verified: false, network: '', replayPresent: false, cinemaBound: false,
    checks: [{ name: 'input', passed: false, detail }],
    warnings: [detail], honestLabel: 'Not verified.', receipt: undefined,
  };
}

/** badges returns the canonical assurance badges for a verify result (the SAME
 *  data-gated badge set Nexus uses — a green badge is impossible unless the
 *  state supports it). */
export function badges(r: VerifyResult): { name: string; text: string; on: boolean }[] {
  if (r.receipt) return receiptBadges(r.receipt).badges;
  return [
    { name: 'node trust', text: 'no node trust required', on: !r.nodeTrusted },
    { name: 'L0', text: r.l0Verified ? `confirmed${r.network ? ' on ' + r.network : ''}` : (r.l0Checked ? 'not confirmed' : 'not checked (offline)'), on: r.l0Verified },
    { name: 'replay', text: r.replayPresent ? 'present' : 'not present', on: r.replayPresent },
    { name: 'cinema', text: r.cinemaBound ? 'bound to proof' : 'n/a', on: r.cinemaBound },
  ];
}

/** assuranceBadgesFor exposes the canonical Nexus assurance badges for a state
 *  string (so widgets and Nexus share one badge vocabulary). */
export function assuranceBadgesFor(state: Record<string, unknown>): unknown[] {
  try {
    return badgesFor(state);
  } catch {
    return [];
  }
}

export interface AssuranceState {
  verified: boolean;
  cryptographicallyVerified: boolean;
  l0Verified: boolean;
  replayVerified: boolean;
  nodeTrusted: boolean;
  operatorAttested: boolean;
  witnessQuorumMet: boolean;
  distinctOperatorsMet: boolean;
  disclosureProofVerified: boolean;
  releaseEvidenceVerified: boolean;
}

/** assuranceState maps a VerifyResult to the data-gated badge state. Every
 *  positive is gated on the local verification actually passing, so a
 *  failed/unverified result (or an operator-attested-only state) can never light
 *  a green badge. "verified" (fully verified) requires an L0 confirmation. */
export function assuranceState(r: VerifyResult): AssuranceState {
  const ok = r.localVerified;
  return {
    verified: ok && r.l0Verified,
    cryptographicallyVerified: ok,
    l0Verified: ok && r.l0Verified,
    replayVerified: ok && r.replayPresent,
    nodeTrusted: r.nodeTrusted,
    operatorAttested: false,
    witnessQuorumMet: false,
    distinctOperatorsMet: false,
    disclosureProofVerified: false,
    releaseEvidenceVerified: false,
  };
}

export interface CanonicalBadge {
  id: string;
  short: string;
  plain?: string;
  colorRole?: string;
  screenReader?: string;
}

/** canonicalBadges returns the data-gated assurance badges (Nexus vocabulary).
 *  Because the gate only admits badges whose conditions hold, no green badge can
 *  appear unless the state supports it. This is React-free so the Web Component
 *  build can reuse it. */
export function canonicalBadges(r: VerifyResult): CanonicalBadge[] {
  try {
    return badgesFor(assuranceState(r) as unknown as Record<string, unknown>) as CanonicalBadge[];
  } catch {
    return [];
  }
}

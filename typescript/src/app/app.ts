/**
 * @infrix app — Prompt-to-Proof App Studio (nextux-16): the workspace, run,
 * assurance, and resume types a verifiable-app produces, plus honest guards.
 * Shapes mirror pkg/app. The app defines no proof of its own: an Assurance is
 * always sourced from the verifier (source === 'verifykit'), the node is never
 * trusted, local proof never reaches L4, and nothing targets mainnet.
 */

/** Assurance mirrors pkg/app.Assurance — copied straight from a verifier verdict. */
export interface Assurance {
  proofLevel: string;
  governanceLevel: string;
  verified: boolean;
  l0Verified: boolean;
  replayVerified: boolean;
  fullyVerified: boolean;
  /** Always false — the Infrix node is never trusted. */
  nodeTrusted: boolean;
  /** Always 'verifykit' — the provenance of the verdict. */
  source: string;
}

/** RunRecord mirrors pkg/app.RunRecord. deferred lists design requirements a run
 *  honestly does not verify on its network (e.g. a witness quorum, which needs
 *  Kermit) — disclosed, never hidden. */
export interface RunRecord {
  id: string;
  network: string;
  storyPath: string;
  proofLevel: string;
  governanceLevel: string;
  verified: boolean;
  l0Verified: boolean;
  deferred?: string[];
  ranAtUnix: number;
}

/** Workspace mirrors pkg/app.Workspace — a named verifiable-app. */
export interface Workspace {
  version: number;
  name: string;
  prompt: string;
  network: string;
  planHash: string;
  pattern?: string;
  patternTitle?: string;
  flowTitle: string;
  artifacts: Record<string, string>;
  runs: RunRecord[];
  assurance?: Assurance;
  shareLink?: string;
  createdAtUnix: number;
  updatedAtUnix: number;
}

/** PreviewNode is one workflow step in a read-only preview. */
export interface PreviewNode {
  id: string;
  kind: string;
  label: string;
}

/** PreviewArtifact is one generated artifact, inline, with its honest reports. */
export interface PreviewArtifact {
  format: string;
  filename: string;
  artifact: string;
  verifierCommand?: string;
  mainnetDisabled: boolean;
  nodeTrusted: boolean;
  proofLevelCap: string;
}

/** Preview mirrors pkg/app.Preview — a non-persisting preview of `app run`. */
export interface Preview {
  prompt: string;
  network: string;
  planHash: string;
  planSummary: string;
  pattern?: string;
  patternTitle?: string;
  flowTitle: string;
  nodes: PreviewNode[];
  expectedOutputs: string[];
  simulation: unknown;
  artifacts?: PreviewArtifact[];
  nodeTrusted: boolean;
  mainnetAllow: boolean;
  proofLevelCap: string;
}

/** NextAction is one grounded continuation step. */
export interface NextAction {
  step: string;
  command: string;
  why: string;
}

/** ResumeContext mirrors pkg/app.ResumeContext — the state an AI agent resumes
 *  an app from. */
export interface ResumeContext {
  version: number;
  name: string;
  prompt: string;
  network: string;
  planHash: string;
  pattern?: string;
  flowTitle: string;
  artifacts: Record<string, string>;
  runs: RunRecord[];
  assurance?: Assurance;
  shareLink?: string;
  nextActions: NextAction[];
  nodeTrusted: boolean;
  mainnetAllow: boolean;
}

/** assuranceIsFromVerifier reports whether an Assurance carries the verifier's
 *  provenance and never trusts the node — the honesty invariant the app upholds. */
export function assuranceIsFromVerifier(a: Assurance | undefined): boolean {
  return !!a && a.source === 'verifykit' && a.nodeTrusted === false;
}

/** localRunIsHonest reports whether a local run keeps its honest ceiling: it
 *  never claims L0 confirmation and never reaches L4. */
export function localRunIsHonest(rec: RunRecord): boolean {
  if (rec.network !== 'local') return true;
  return !rec.l0Verified && rec.proofLevel.toUpperCase() !== 'L4';
}

/** resumeIsHonest reports whether a resume context preserves the invariants an
 *  agent must not cross: the node is never trusted and mainnet is never allowed. */
export function resumeIsHonest(rc: ResumeContext): boolean {
  return rc.nodeTrusted === false && rc.mainnetAllow === false;
}

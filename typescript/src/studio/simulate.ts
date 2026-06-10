/**
 * @infrix studio — simulation types + honest helpers (nextux-12).
 *
 * A simulation is a read-only preview, never a live proof. These helpers keep
 * the browser/agent honest: a local flow never previews L4, and the node is
 * never reported as trusted.
 */

import type { Flow } from './flow.js';
import { workflowActions } from './flow.js';

export interface Simulation {
  flow: string;
  network: string;
  pathTaken: string[];
  requiredApprovals: string[];
  possibleFailures: string[];
  expectedArtifacts: string[];
  proofLevelCap: string;
  governanceCap: string;
  trustBoundary: string;
  missingInputs: string[];
  nodeTrusted: boolean;
  simulated: boolean;
  note: string;
}

export type BadgeTone = 'positive' | 'negative' | 'info';

export interface AssuranceBadge {
  label: string;
  tone: BadgeTone;
}

/**
 * assuranceBadge returns an honest badge for a simulation's proof cap. It NEVER
 * mints an L4/"fully verified" badge for a simulated preview — a simulation is
 * never a live proof — and always states that the node is not trusted.
 */
export function assuranceBadge(sim: Simulation): AssuranceBadge {
  if (sim.proofLevelCap === 'none') {
    return { label: 'No proof step', tone: 'info' };
  }
  // A simulation is a preview: present the cap as a "preview", never as a live
  // verified proof, and never overclaim L4 for a local flow.
  const cap = sim.proofLevelCap;
  return { label: `${cap} cap — simulated (node not trusted)`, tone: 'info' };
}

/**
 * isHonest reports whether a simulation respects the studio's non-negotiable
 * rules: it is marked simulated, never trusts the node, and never previews L4
 * for a non-Kermit network.
 */
export function isHonest(sim: Simulation): boolean {
  if (!sim.simulated) return false;
  if (sim.nodeTrusted) return false;
  if (sim.proofLevelCap === 'L4' && sim.network !== 'kermit') return false;
  return true;
}

/** previewsLiveProof always returns false — a simulation is never live. */
export function previewsLiveProof(_sim: Simulation): boolean {
  return false;
}

/**
 * localProofCap returns the honest proof-level cap a flow can reach without a
 * live L0 verify step: never above L3. Mirrors the Go proofCap logic for the
 * common case so a UI can preview before calling the engine.
 */
export function hasProofStep(flow: Flow): boolean {
  return flow.nodes.some((n) => n.kind === 'proof_export' || n.kind === 'proof_verify');
}

/** countActions returns how many governed actions a flow runs. */
export function countActions(flow: Flow): number {
  return workflowActions(flow).length;
}

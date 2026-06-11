/**
 * @infrix app — Prompt-to-Proof App Studio (nextux-16): the single golden front
 * door. Describe a verifiable app in plain language and Infrix grounds it, builds
 * it, runs it for a real proof, verifies it offline, anchors it for L4 on Kermit,
 * and ships an SDK + widget. Assurance always comes from the verifier; local proof
 * caps at L3 and nothing targets mainnet. These are the types + honest guards.
 */

export { assuranceIsFromVerifier, localRunIsHonest, resumeIsHonest } from './app.js';
export type {
  Assurance,
  RunRecord,
  Workspace,
  PreviewNode,
  PreviewArtifact,
  Preview,
  NextAction,
  ResumeContext,
} from './app.js';

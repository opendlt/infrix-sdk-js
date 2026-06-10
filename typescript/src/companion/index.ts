/**
 * @infrix companion — Zero-Context Local Companion types, honest context
 * helpers, and a typed client over the LOCAL (localhost-only) companion server
 * (nextux-10).
 */

export {
  statusWords,
  counts,
  resumeLine,
  isReadOnlyActions,
} from './context.js';
export type {
  CompanionContext,
  CompanionArtifact,
  CompanionSuggestion,
  VerificationStatus,
  ArtifactCounts,
} from './context.js';

export { InfrixCompanionClient, InfrixCompanionError } from './client.js';
export type { InfrixCompanionClientOptions, CompanionFetch } from './client.js';

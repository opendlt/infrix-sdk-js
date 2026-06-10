/**
 * @infrix studio — Visual Workflow Studio (nextux-12): flow, simulation, and
 * export types + honest helpers. Read-only and honest: a flow drafted here can
 * be validated, simulated, and exported, but a simulation is never a live proof
 * and the Go verifier is always the assurance gate.
 */

export {
  STUDIO_SCHEMA_VERSION,
  AUTHORITY_KINDS,
  workflowActions,
  targetsMainnet,
  structuralIssues,
  isStructurallyValid,
} from './flow.js';
export type {
  Network,
  NodeKind,
  Actor,
  Node,
  Edge,
  DisclosurePolicy,
  Policies,
  Safety,
  Flow,
} from './flow.js';

export {
  assuranceBadge,
  isHonest,
  previewsLiveProof,
  hasProofStep,
  countActions,
} from './simulate.js';
export type { Simulation, AssuranceBadge, BadgeTone } from './simulate.js';

export {
  EXPORT_FORMATS,
  isSafeExport,
  generatedCodeIsSafe,
} from './export.js';
export type {
  ExportFormat,
  ValidationReport,
  SafetyReport,
  ExportResult,
} from './export.js';

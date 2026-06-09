/**
 * Progressive Disclosure design system — types (nextux-03).
 *
 * The TypeScript twin of pkg/uxcopy. These types describe the Go-generated
 * fixture (src/ux/ux.fixture.json), the single source of truth for Infrix's
 * product language. The SDK ships the gate + selectors as pure functions over a
 * UxFixture, so a consumer renders the SAME honest labels, badges, error cards,
 * glossary terms, and next actions as the CLI and Nexus — and an AI agent can
 * explain Infrix from structured data instead of scraped prose.
 */

export type Category =
  | 'assurance'
  | 'trust'
  | 'network'
  | 'profile'
  | 'action'
  | 'error'
  | 'next-action'
  | 'glossary';

export type ColorRole = 'positive' | 'info' | 'caution' | 'negative';

export type Persona = 'builder' | 'operator' | 'auditor' | 'agent' | 'expert';

/** A label is the canonical wording for one public concept, all three layers. */
export interface Label {
  id: string;
  category: Category;
  short: string;
  plain: string;
  technical: string;
  neverUseWhen?: string[];
}

/**
 * The honest verification state a surface holds. Badges are gated against it;
 * every field is optional and defaults to false/absent.
 */
export interface AssuranceState {
  verified?: boolean;
  cryptographicallyVerified?: boolean;
  l0Verified?: boolean;
  replayVerified?: boolean;
  nodeTrusted?: boolean;
  witnessQuorumMet?: boolean;
  distinctOperatorsMet?: boolean;
  operatorAttested?: boolean;
  disclosureProofVerified?: boolean;
  releaseEvidenceVerified?: boolean;
  network?: string;
  proofLevel?: string;
  governanceLevel?: string;
}

/** A canonical, gated assurance badge. */
export interface AssuranceBadge {
  id: string;
  short: string;
  plain: string;
  technical: string;
  icon: string;
  colorRole: ColorRole;
  screenReader: string;
  /** All must hold for the badge to appear. */
  allowedConditions: string[];
  /** If any holds, the badge is forbidden. */
  disallowedConditions: string[];
}

export interface GlossaryTerm {
  term: string;
  plain: string;
  technical: string;
  related?: string[];
  firstUseReplacement: string;
  docs?: string;
}

export interface ErrorFix {
  label: string;
  command?: string;
  safeToRun: boolean;
}

export interface ErrorCard {
  code: string;
  title: string;
  plainMeaning: string;
  assuranceImpact?: string;
  fixes: ErrorFix[];
  retryGuidance?: string;
  docs: string;
  technical: string;
}

export interface NextAction {
  id: string;
  label: string;
  plain: string;
  command?: string;
  personas: Persona[];
}

export type GlossaryDensity = 'high' | 'normal' | 'low' | 'none';

export interface PersonaProfile {
  persona: Persona;
  title: string;
  tagline: string;
  showTechnicalByDefault: boolean;
  glossaryDensity: GlossaryDensity;
  leadActions: string[];
  panels: string[];
}

/** The whole product-language registry (the Go-generated fixture shape). */
export interface UxFixture {
  version: string;
  labels: Label[];
  assuranceBadges: AssuranceBadge[];
  glossary: GlossaryTerm[];
  errors: ErrorCard[];
  nextActions: NextAction[];
  personas: PersonaProfile[];
  categories: Category[];
}

export const UX_CATEGORIES: Category[] = [
  'assurance',
  'trust',
  'network',
  'profile',
  'action',
  'error',
  'next-action',
  'glossary',
];

export const UX_PERSONAS: Persona[] = ['builder', 'operator', 'auditor', 'agent', 'expert'];

/**
 * Progressive Disclosure design system — SDK entry (nextux-03).
 *
 * Re-exports the types, the assurance gate, the error helpers, and the
 * view-model builders, plus a small UxRegistry that wraps a loaded UxFixture
 * for ergonomic access. Load the fixture however your environment prefers (fetch
 * in the browser, read the shipped src/ux/ux.fixture.json in Node) and construct
 * a registry; every selector then speaks the one Infrix vocabulary.
 */

export * from './labels';
export * from './assurance';
export * from './errors';
export * from './components';

import type {
  AssuranceBadge,
  AssuranceState,
  ErrorCard,
  GlossaryTerm,
  NextAction,
  PersonaProfile,
  UxFixture,
} from './labels';
import { badgesFor } from './assurance';
import { errorCardByCode, cardForUserError } from './errors';
import { nextActionsForPersona, proofReceiptViewModel, ProofReceiptInput, ProofReceiptViewModel } from './components';

/** UxRegistry is an ergonomic wrapper over a loaded fixture. */
export class UxRegistry {
  constructor(private readonly fx: UxFixture) {
    if (!fx || !Array.isArray(fx.assuranceBadges)) {
      throw new Error('UxRegistry: invalid fixture');
    }
  }

  get version(): string {
    return this.fx.version;
  }

  badges(): AssuranceBadge[] {
    return this.fx.assuranceBadges;
  }

  /** badgesFor returns the honest, allowed badges for a state. */
  badgesFor(state: AssuranceState): AssuranceBadge[] {
    return badgesFor(this.fx.assuranceBadges, state);
  }

  errorCard(code: string): ErrorCard | undefined {
    return errorCardByCode(this.fx.errors, code);
  }

  cardForUserError(err: { code?: string } | null | undefined): ErrorCard | undefined {
    return cardForUserError(this.fx.errors, err);
  }

  glossary(): GlossaryTerm[] {
    return this.fx.glossary;
  }

  glossaryLookup(term: string): GlossaryTerm | undefined {
    return this.fx.glossary.find((t) => t.term === term);
  }

  personas(): PersonaProfile[] {
    return this.fx.personas;
  }

  nextActionsFor(persona: string): NextAction[] {
    return nextActionsForPersona(this.fx.nextActions, this.fx.personas, persona);
  }

  proofReceipt(input: ProofReceiptInput): ProofReceiptViewModel {
    return proofReceiptViewModel(this.fx.assuranceBadges, input);
  }
}

/** createUxRegistry builds a registry from a loaded fixture object. */
export function createUxRegistry(fixture: UxFixture): UxRegistry {
  return new UxRegistry(fixture);
}

/**
 * create-infrix-app templates (platform-review-3 Epic 7).
 *
 * A single golden path for new developers: `npx create-infrix-app` scaffolds
 * one of five governed-app templates, each a runnable starting point that
 * flows through the canonical spine while speaking its own domain language.
 *
 * The registry is data, so the scaffolder, the CLI, and the tests share one
 * source of truth for which templates exist.
 */

/** A scaffold template. */
export interface AppTemplate {
  /** Stable id used on the command line (`--template <id>`). */
  id: string;
  /** Human-readable title. */
  title: string;
  /** One-line description of the governed flow it demonstrates. */
  description: string;
  /** Files written into the target directory (path → contents). */
  files: (appName: string) => Record<string, string>;
}

const pkgJson = (appName: string, summary: string): string =>
  JSON.stringify(
    {
      name: appName,
      version: '0.1.0',
      private: true,
      type: 'module',
      description: summary,
      dependencies: { '@infrix/client': '^0.1.0' },
      scripts: { start: 'node index.js' },
    },
    null,
    2
  );

/** The five golden templates. */
export const TEMPLATES: AppTemplate[] = [
  {
    id: 'golden-escrow',
    title: 'Golden Escrow',
    description: 'Verifiable escrow with regulated release — the adoption wedge.',
    files: (app) => ({
      'package.json': pkgJson(app, 'Verifiable escrow with regulated release'),
      'index.js': escrowIndex,
      'README.md': `# ${app}\n\nGolden escrow: create → approve → release → export proof → verify.\n`,
    }),
  },
  {
    id: 'governed-approval',
    title: 'Governed Approval',
    description: 'A threshold-approved governed operation with signed approval evidence.',
    files: (app) => ({
      'package.json': pkgJson(app, 'Threshold-approved governed operation'),
      'index.js': approvalIndex,
      'README.md': `# ${app}\n\nGoverned approval: submit intent → collect approvals → execute → export proof.\n`,
    }),
  },
  {
    id: 'credential-gated-release',
    title: 'Credential-Gated Release',
    description: 'Release gated on a verified credential predicate (G2 governance).',
    files: (app) => ({
      'package.json': pkgJson(app, 'Credential-gated release'),
      'index.js': credentialIndex,
      'README.md': `# ${app}\n\nCredential-gated release: verify a credential predicate, then release.\n`,
    }),
  },
  {
    id: 'bridge-receipt',
    title: 'Bridge Receipt',
    description: 'A cross-chain settlement leg with an external-chain proof receipt.',
    files: (app) => ({
      'package.json': pkgJson(app, 'Cross-chain bridge receipt'),
      'index.js': bridgeIndex,
      'README.md': `# ${app}\n\nBridge receipt: settle a leg on an external chain, capture the proof.\n`,
    }),
  },
  {
    id: 'confidential-approval',
    title: 'Confidential Approval',
    description: 'A governed approval whose decision output is a confidential digest.',
    files: (app) => ({
      'package.json': pkgJson(app, 'Confidential approval'),
      'index.js': confidentialIndex,
      'README.md': `# ${app}\n\nConfidential approval: approve under a hardware-isolated confidential runner.\n`,
    }),
  },
];

/** listTemplates returns the template ids in registry order. */
export function listTemplates(): string[] {
  return TEMPLATES.map((t) => t.id);
}

/** getTemplate returns the template with the given id, or undefined. */
export function getTemplate(id: string): AppTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/**
 * scaffoldFiles returns the file map a template would write for an app —
 * the pure core of `createInfrixApp` (no filesystem). The CLI wraps this
 * with directory creation + writes.
 */
export function scaffoldFiles(templateId: string, appName: string): Record<string, string> {
  const t = getTemplate(templateId);
  if (!t) {
    throw new Error(
      `create-infrix-app: unknown template "${templateId}" (one of: ${listTemplates().join(', ')})`
    );
  }
  return t.files(appName);
}

// --- template bodies (kept terse; each is a runnable starting point) ---

// Every template demonstrates the same honest pattern: a high-level call that
// awaits a FULLY HYDRATED result (real spine artifacts, no blanks/fake gas),
// exports a proof, verifies it offline, and prints the assurance level.

/** Shared logger snippet that prints a hydrated GovernedResult honestly. */
const printResult = `function printGoverned(label, r) {
  console.log(label, {
    intentId: r.intentId, planId: r.planSkipped ? '(no plan stage)' : r.planId,
    outcomeId: r.outcomeId, evidenceId: r.evidenceId, anchorId: r.anchorId,
    finality: r.finality, gas: r.gasAvailable ? r.gasUsed : 'unavailable',
    approvals: r.approvals?.count ?? 0,
    proof: r.proofAvailable ? 'exported' : (r.proofUnavailableReason ?? 'not requested'),
    assurance: r.assurance?.tier ?? r.finality,
  });
}`;

const escrowIndex = `import { InfrixClient, withGoldenApp, withProofs } from '@infrix/client';

${printResult}

const client = withProofs(withGoldenApp(new InfrixClient(process.env.INFRIX_URL ?? 'http://localhost:8080')));
// High-level call -> fully hydrated result (real intent/plan/outcome/evidence/anchor).
const handle = await client.escrow.create({ buyer: 'acc://buyer.acme', seller: 'acc://seller.acme', amount: 1000 });
printGoverned('escrow created:', handle);
console.log('escrowId:', handle.escrowId);
await client.escrow.release({ escrowId: handle.escrowId });
// Export + verify OFFLINE + show assurance.
const proof = await client.proofs.export({ intentId: handle.intentId, profile: 'public_production' });
const verdict = client.proofs.verifyOffline(proof, { require: 'L3/G2', replay: true });
console.log('assurance tier:', verdict.tier, 'verified(offline):', verdict.verified);
console.log('full live verification: infrix verify proof.json --l0 kermit --require L4/G2 --require-replay');
`;

const approvalIndex = `import { InfrixClient, withGovernanceSugar } from '@infrix/client';

${printResult}

const governed = withGovernanceSugar(new InfrixClient(process.env.INFRIX_URL ?? 'http://localhost:8080'));
// Await a fully hydrated result; export + offline-verify the proof in one call.
const r = await governed.submitAndWait(
  { type: 'SUBMIT_GOVERNED', customParams: { action: 'approve-budget' } },
  { exportProof: true, verifyProofLocal: true },
);
printGoverned('governed approval:', r);
`;

const credentialIndex = `import { InfrixClient, withGovernanceSugar } from '@infrix/client';

${printResult}

const governed = withGovernanceSugar(new InfrixClient(process.env.INFRIX_URL ?? 'http://localhost:8080'));
// Credential-gated release as a governed object, fully hydrated + proven.
const r = await governed.createObject(
  'credential_release',
  { holder: 'acc://alice.acme', credential: 'kyc-tier-2' },
  { exportProof: true, verifyProofLocal: true },
);
printGoverned('credential-gated release:', r);
`;

const bridgeIndex = `import { InfrixClient, withGovernanceSugar } from '@infrix/client';

${printResult}

const governed = withGovernanceSugar(new InfrixClient(process.env.INFRIX_URL ?? 'http://localhost:8080'));
// Cross-chain settlement leg through the governed spine -> hydrated result.
const r = await governed.singleLegSettlement(
  'acc://alice.acme/tokens', 'acc://bob.acme/tokens', 1,
  { asset: 'ACME', exportProof: true, verifyProofLocal: true },
);
printGoverned('bridge settlement:', r);
`;

const confidentialIndex = `import { InfrixClient, withGovernanceSugar } from '@infrix/client';

${printResult}

const governed = withGovernanceSugar(new InfrixClient(process.env.INFRIX_URL ?? 'http://localhost:8080'));
const r = await governed.submitAndWait(
  { type: 'SUBMIT_GOVERNED', customParams: { confidential: true, action: 'approve' } },
  { exportProof: true, verifyProofLocal: true },
);
printGoverned('confidential governed intent:', r);
`;

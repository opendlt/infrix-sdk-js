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

const escrowIndex = `import { InfrixClient, withGoldenApp, withProofs } from '@infrix/client';

const client = withProofs(withGoldenApp(new InfrixClient(process.env.INFRIX_URL ?? 'http://localhost:8080')));
const { escrowId, intentId } = await client.escrow.create({ buyer: 'acc://buyer.acme', seller: 'acc://seller.acme', amount: 1000 });
await client.escrow.release({ escrowId });
const proof = await client.proofs.export({ intentId, profile: 'public_production' });
console.log('proof exported; verify with: infrix verify proof.json --l0 kermit --require L4/G2 --require-replay');
const verdict = client.proofs.verifyLocal(proof, { require: 'L3/G2', replay: true });
console.log('local verdict:', verdict);
`;

const approvalIndex = `import { InfrixClient } from '@infrix/client';

const client = new InfrixClient(process.env.INFRIX_URL ?? 'http://localhost:8080');
const res = await client.intents.submit({ type: 'SUBMIT_GOVERNED', customParams: { action: 'approve-budget' } });
console.log('submitted governed intent:', res.intentId);
`;

const credentialIndex = `import { InfrixClient } from '@infrix/client';

const client = new InfrixClient(process.env.INFRIX_URL ?? 'http://localhost:8080');
const catalog = await client.predicates.catalog();
console.log('available credential predicates:', catalog);
`;

const bridgeIndex = `import { InfrixClient } from '@infrix/client';

const client = new InfrixClient(process.env.INFRIX_URL ?? 'http://localhost:8080');
const res = await client.settlements.create({ legs: [{ chain: 'sepolia', amount: 1 }] });
console.log('cross-chain settlement leg created:', res);
`;

const confidentialIndex = `import { InfrixClient } from '@infrix/client';

const client = new InfrixClient(process.env.INFRIX_URL ?? 'http://localhost:8080');
const res = await client.intents.submit({ type: 'SUBMIT_GOVERNED', customParams: { confidential: true, action: 'approve' } });
console.log('confidential governed intent:', res.intentId);
`;

// @infrix/templates — audited, versioned starter templates for Infrix apps
// (DX P2-5). Each template is a reviewable module (not an inline string) that
// emits a runnable app using the REAL @infrix/client credential/predicate APIs
// and @infrix/prover — no placeholders (the old inline `credential: 'kyc-tier-2'`
// scaffold is replaced here with a genuinely-issued verifiable credential).

/** @typedef {{ id: string, title: string, family: string, description: string, audited: boolean, files: (appName: string) => Record<string, string> }} Template */

function pkgJson(appName, description, deps) {
  return JSON.stringify(
    {
      name: appName,
      version: '0.1.0',
      private: true,
      type: 'module',
      description,
      scripts: { start: 'node index.js' },
      dependencies: deps,
    },
    null,
    2
  ) + '\n';
}

// ---- issue-credential -------------------------------------------------------

const issueCredentialIndex = `import { InfrixClient } from '@infrix/client';

// Connect by network name; the disclosure context (actor + purpose) is required
// by the node for governed calls, so we pass it up front.
const client = new InfrixClient('kermit', {
  actor: process.env.INFRIX_ISSUER ?? 'acc://issuer.acme',
  purpose: 'issue-credential',
});

const subjectDID = client.credentials.createDID(process.env.SUBJECT_ADI ?? 'acc://alice.acme');

// Issue a real verifiable credential via the node's credential engine (vc.issue).
const vc = await client.credentials.issue({
  subjectDID,
  credentialTypes: ['KYCCredential'],
  claims: { tier: '2', country: 'US' },
});

console.log('issued credential', vc.id, 'to', subjectDID);
`;

// ---- selective-disclosure-vp ------------------------------------------------

const selectiveDisclosureIndex = `import { InfrixClient } from '@infrix/client';
import { loadProver } from '@infrix/prover';
import { generateKeyPairSync } from 'node:crypto';

function holderSigner() {
  const jwk = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
  return new Uint8Array(Buffer.concat([Buffer.from(jwk.d, 'base64url'), Buffer.from(jwk.x, 'base64url')]));
}

const client = new InfrixClient('kermit', { actor: 'acc://alice.acme', purpose: 'present' });

// A credential the holder possesses (issued elsewhere via credentials.issue).
const vc = { credentialSubject: { id: client.credentials.createDID('acc://alice.acme'), age: '25' } };

// Selective disclosure in one call: present() reads the 'age' claim as the
// private witness and proves 'age >= 21' — the age itself never leaves the prover.
const prover = await loadProver();
const envelope = await client.credentials.present(
  vc,
  { predicate: 'threshold_gte', publicInputs: [21], claimInputs: ['age'], holderSigner: holderSigner() },
  prover,
);

console.log('proved age >= 21 without revealing age:', !JSON.stringify(envelope).includes('"25"'));
console.log('verify:', await client.predicates.verify(envelope));
`;

// ---- credential-gated (the fixed, real version) -----------------------------

const credentialGatedIndex = `import { InfrixClient, withGovernanceSugar } from '@infrix/client';

const client = new InfrixClient('kermit', { actor: 'acc://issuer.acme', purpose: 'credential-gate' });

// Issue a REAL verifiable credential (not a placeholder string), then gate a
// governed release on it. This replaces the old inline placeholder scaffold.
const holderDID = client.credentials.createDID('acc://alice.acme');
const vc = await client.credentials.issue({
  subjectDID: holderDID,
  credentialTypes: ['ReleaseEligibility'],
  claims: { tier: '2' },
});

const governed = withGovernanceSugar(client);
const r = await governed.callContract('acc://vault.acme', 'release', [vc.id]);
console.log('release gated on credential', vc.id, '->', r.outcomeId);
`;

const clientDep = { '@infrix/client': '^0.1.0' };
const proverDeps = { '@infrix/client': '^0.1.0', '@infrix/prover': '^0.1.0' };

/** @type {Template[]} */
export const TEMPLATES = [
  {
    id: 'issue-credential',
    title: 'Issue a verifiable credential',
    family: 'credential',
    description: 'Derive a subject DID and issue a signed verifiable credential via the node.',
    audited: true,
    files: (app) => ({
      'package.json': pkgJson(app, 'Issue a verifiable credential', clientDep),
      'index.js': issueCredentialIndex,
      'README.md': `# ${app}\n\nIssue a verifiable credential: createDID -> credentials.issue.\n`,
    }),
  },
  {
    id: 'selective-disclosure-vp',
    title: 'Selective-disclosure verifiable presentation',
    family: 'disclosure',
    description: 'Prove a fact from a credential (age >= 21) without revealing the underlying claim.',
    audited: true,
    files: (app) => ({
      'package.json': pkgJson(app, 'Selective-disclosure verifiable presentation', proverDeps),
      'index.js': selectiveDisclosureIndex,
      'README.md': `# ${app}\n\nSelective disclosure: credentials.present -> @infrix/prover -> predicates.verify.\n`,
    }),
  },
  {
    id: 'credential-gated',
    title: 'Credential-gated release',
    family: 'credential',
    description: 'Issue a real credential and gate a governed release on it (no placeholder).',
    audited: true,
    files: (app) => ({
      'package.json': pkgJson(app, 'Credential-gated release', clientDep),
      'index.js': credentialGatedIndex,
      'README.md': `# ${app}\n\nCredential-gated release: issue a real VC, then release gated on it.\n`,
    }),
  },
];

/** listTemplates returns the template ids in registry order. */
export function listTemplates() {
  return TEMPLATES.map((t) => t.id);
}

/** getTemplate returns the template with the given id, or undefined. */
export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id);
}

/** scaffoldFiles returns the file map a template writes for an app. */
export function scaffoldFiles(templateId, appName) {
  const t = getTemplate(templateId);
  if (!t) throw new Error(`@infrix/templates: unknown template '${templateId}' (have: ${listTemplates().join(', ')})`);
  return t.files(appName || 'my-infrix-app');
}

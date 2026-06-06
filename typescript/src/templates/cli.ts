#!/usr/bin/env node
/**
 * create-infrix-app (platform-review-3 Epic 7).
 *
 * Scaffolds a governed-app starter into a new directory:
 *
 *   npx create-infrix-app my-app --template golden-escrow
 *
 * Templates: golden-escrow | governed-approval | credential-gated-release |
 *            bridge-receipt | confidential-approval
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { listTemplates, scaffoldFiles } from './index';

function parseArgs(argv: string[]): { appName: string; template: string } {
  let appName = '';
  let template = 'golden-escrow';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--template' || a === '-t') {
      template = argv[++i] ?? template;
    } else if (!a.startsWith('-') && !appName) {
      appName = a;
    }
  }
  return { appName, template };
}

export function main(argv: string[] = process.argv.slice(2)): number {
  const { appName, template } = parseArgs(argv);
  if (!appName) {
    process.stderr.write(
      `usage: create-infrix-app <app-name> [--template <id>]\n` +
        `templates: ${listTemplates().join(' | ')}\n`
    );
    return 2;
  }
  if (existsSync(appName)) {
    process.stderr.write(`create-infrix-app: directory "${appName}" already exists\n`);
    return 1;
  }
  let files: Record<string, string>;
  try {
    files = scaffoldFiles(template, appName);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }
  for (const [rel, contents] of Object.entries(files)) {
    const full = join(appName, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  process.stdout.write(
    `created ${appName} from template "${template}"\n` +
      `  cd ${appName} && npm install && npm start\n`
  );
  return 0;
}

// Run when invoked directly as a bin (the entry script is cli.js).
const entry = process.argv[1] ?? '';
if (entry.endsWith('cli.js') || entry.endsWith('create-infrix-app')) {
  process.exit(main());
}

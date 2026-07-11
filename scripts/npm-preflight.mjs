// npm environment preflight (pass-28 audit P1-7).
//
// The user-global npm on the audit workstation is COMPROMISED: its
// `%APPDATA%\npm\node_modules\npm\lib\cli.js` diverges from the trusted npm that
// ships bundled with the Node.js install:
//
//   C:\Users\<u>\AppData\Roaming\npm\node_modules\npm\lib\cli.js   length 72450
//   C:\Program Files\nodejs\node_modules\npm\lib\cli.js            length 419
//
// A release/supply-chain flow that spawns npm on such a host cannot be trusted, so
// its `npm pack` manifest is not trustworthy evidence from this machine. This
// preflight PINS trust to the npm bundled with the running Node install and REFUSES
// (exit 1) when a user-global npm is present and DIVERGES from it — forcing the
// no-npm direct-node path locally (build-all-direct.mjs + supply-chain-direct.mjs)
// and deferring the authoritative npm-pack manifest to CI on a clean host.
//
// Doctrine:
//   - scripts/supply-chain-direct.mjs  = local triage / reproducibility evidence.
//   - CI's archived npm-pack manifest (scripts/supply-chain-all.mjs on a clean
//     Linux runner) = the AUTHORITATIVE publish-payload evidence.
//   - npm may be spawned locally ONLY when this preflight passes (the trusted
//     bundled npm is the one that would run).
//
// Run:  node scripts/npm-preflight.mjs            # exit 0 trusted / exit 1 divergent
// Import: import { assertTrustedNpm } from './npm-preflight.mjs'

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const isWindows = process.platform === 'win32';

function sha256File(p) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  } catch {
    return null;
  }
}

// trustedNpmCliPath returns the path to the npm `lib/cli.js` bundled with the
// running Node.js install — the ONLY npm this preflight trusts. On Windows that is
// `<nodeDir>\node_modules\npm\lib\cli.js`; on POSIX it is
// `<nodeDir>/../lib/node_modules/npm/lib/cli.js`.
export function trustedNpmCliPath() {
  const nodeDir = path.dirname(process.execPath);
  const candidates = isWindows
    ? [path.join(nodeDir, 'node_modules', 'npm', 'lib', 'cli.js')]
    : [
        path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'lib', 'cli.js'),
        path.join(nodeDir, 'node_modules', 'npm', 'lib', 'cli.js'),
      ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

// userGlobalNpmCliPaths returns candidate user-global npm `lib/cli.js` locations
// that could SHADOW the trusted bundled npm on PATH.
export function userGlobalNpmCliPaths() {
  const out = [];
  if (isWindows) {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    out.push(path.join(appData, 'npm', 'node_modules', 'npm', 'lib', 'cli.js'));
  } else {
    const prefix = process.env.NPM_CONFIG_PREFIX || process.env.PREFIX;
    if (prefix) out.push(path.join(prefix, 'lib', 'node_modules', 'npm', 'lib', 'cli.js'));
    out.push(path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', 'npm', 'lib', 'cli.js'));
  }
  return out.filter((p) => fs.existsSync(p));
}

// checkNpmTrust compares each present user-global npm against the trusted bundled
// npm and returns a structured result. `trusted` is false iff a user-global npm
// exists and DIVERGES (different cli.js) from the trusted bundled npm.
export function checkNpmTrust() {
  const trustedPath = trustedNpmCliPath();
  const trustedHash = trustedPath ? sha256File(trustedPath) : null;
  const divergent = [];
  for (const p of userGlobalNpmCliPaths()) {
    const h = sha256File(p);
    if (!trustedHash || h !== trustedHash) {
      divergent.push({
        path: p,
        size: (() => {
          try {
            return fs.statSync(p).size;
          } catch {
            return -1;
          }
        })(),
        sha256: h,
      });
    }
  }
  // Trusted iff nothing shadows the bundled npm with a divergent cli.js. When the
  // bundled npm cannot be located (unusual), a PRESENT user-global npm is
  // unverifiable and therefore treated as divergent (conservative); when NOTHING
  // shadows the bundled npm, the environment is clean (the typical CI case).
  return { trustedPath, trustedHash, divergent, trusted: divergent.length === 0 };
}

// assertTrustedNpm throws when a user-global npm diverges from the trusted bundled
// npm (or the trusted npm cannot be located). Import + call this at the top of any
// script that spawns npm so it refuses to run on a compromised host.
export function assertTrustedNpm() {
  const r = checkNpmTrust();
  if (!r.trusted) {
    const lines = r.divergent
      .map((d) => `  - ${d.path} (${d.size} bytes, sha256 ${String(d.sha256).slice(0, 16)}…)`)
      .join('\n');
    const trustedLine = r.trustedPath
      ? `  trusted: ${r.trustedPath} (sha256 ${String(r.trustedHash).slice(0, 16)}…)\n`
      : `  trusted: (bundled npm not located under ${path.dirname(process.execPath)} — a present user-global npm is unverifiable)\n`;
    throw new Error(
      'npm-preflight: a user-global npm DIVERGES from the trusted npm bundled with the Node install:\n' +
        trustedLine +
        `  divergent user-global npm (UNTRUSTED — do not use for release):\n${lines}\n` +
        'Refusing to spawn npm. This host cannot produce trustworthy npm-pack evidence.\n' +
        'Use the no-npm direct-node path locally (node scripts/build-all-direct.mjs && node scripts/supply-chain-direct.mjs), ' +
        'and treat CI’s archived npm-pack manifest (scripts/supply-chain-all.mjs on a clean runner) as the authoritative publish evidence.',
    );
  }
  return r;
}

// Run as a CLI: exit 0 when trusted, exit 1 (with the reason) when divergent.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const r = assertTrustedNpm();
    console.log(`npm-preflight: OK — trusted bundled npm ${r.trustedPath} (no divergent user-global npm).`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

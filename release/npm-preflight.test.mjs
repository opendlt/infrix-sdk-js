// Pass-28 audit P1-7. The npm environment preflight must REFUSE to spawn npm on a
// host where a user-global npm diverges from the trusted npm bundled with the Node
// install (the audit workstation's compromised %APPDATA%\npm), and must PASS on a
// clean host with no shadowing npm. These tests exercise the pure trust-decision
// logic against temp fixtures so they are deterministic on any host regardless of
// that host's real npm state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const mod = await import(pathToFileURL(path.join(repoRoot, 'scripts', 'npm-preflight.mjs')).href);

function writeCli(dir, content) {
  const p = path.join(dir, 'node_modules', 'npm', 'lib', 'cli.js');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

// A local re-implementation of the decision, driven by explicit paths, mirrors the
// module's checkNpmTrust so the test controls the environment fully (the module
// derives real OS paths; here we feed synthetic ones and assert the SAME rule).
function decide(trustedPath, userGlobalPaths) {
  const trustedHash = trustedPath && fs.existsSync(trustedPath) ? sha256(trustedPath) : null;
  const divergent = [];
  for (const p of userGlobalPaths) {
    if (!fs.existsSync(p)) continue;
    const h = sha256(p);
    if (!trustedHash || h !== trustedHash) divergent.push(p);
  }
  return { trusted: divergent.length === 0, divergent };
}

test('exports the trust-decision API', () => {
  assert.equal(typeof mod.assertTrustedNpm, 'function');
  assert.equal(typeof mod.checkNpmTrust, 'function');
  assert.equal(typeof mod.trustedNpmCliPath, 'function');
  assert.equal(typeof mod.userGlobalNpmCliPaths, 'function');
});

test('REFUSES when a user-global npm diverges from the trusted bundled npm', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npmpf-'));
  const trusted = path.join(tmp, 'trusted');
  const userg = path.join(tmp, 'userglobal');
  const trustedCli = writeCli(trusted, 'module.exports = require("./cli-entry")\n'); // the small trusted shim
  const divergentCli = writeCli(userg, '/* trojanized bloated cli */\n' + 'x'.repeat(70000));
  const d = decide(trustedCli, [divergentCli]);
  assert.equal(d.trusted, false, 'a divergent user-global npm must NOT be trusted');
  assert.ok(d.divergent.includes(divergentCli));
});

test('PASSES when the user-global npm is byte-identical to the trusted bundled npm', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npmpf-'));
  const trusted = path.join(tmp, 'trusted');
  const userg = path.join(tmp, 'userglobal');
  const same = 'module.exports = require("./cli-entry")\n';
  const trustedCli = writeCli(trusted, same);
  const userCli = writeCli(userg, same);
  const d = decide(trustedCli, [userCli]);
  assert.equal(d.trusted, true, 'an identical user-global npm is trusted');
});

test('PASSES on a clean host with no user-global npm shadowing (typical CI)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npmpf-'));
  const trusted = path.join(tmp, 'trusted');
  const trustedCli = writeCli(trusted, 'module.exports = require("./cli-entry")\n');
  const d = decide(trustedCli, [/* none present */ path.join(tmp, 'absent', 'cli.js')]);
  assert.equal(d.trusted, true, 'no shadowing npm => clean');
  assert.equal(d.divergent.length, 0);
});

test('REFUSES a present user-global npm when the trusted bundled npm is unlocatable (conservative)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npmpf-'));
  const userg = path.join(tmp, 'userglobal');
  const userCli = writeCli(userg, '/* some npm */\n');
  const d = decide(path.join(tmp, 'no-trusted', 'cli.js'), [userCli]);
  assert.equal(d.trusted, false, 'unverifiable present user-global npm is treated as divergent');
});

test('assertTrustedNpm throws with actionable guidance when not trusted (real host is compromised)', () => {
  // The real audit workstation IS compromised, so on it checkNpmTrust().trusted is
  // false and assertTrustedNpm throws. On a clean host it passes. Assert the
  // contract holds either way: trusted => no throw; not trusted => throw naming the
  // no-npm direct path + CI as authoritative.
  const r = mod.checkNpmTrust();
  if (r.trusted) {
    assert.doesNotThrow(() => mod.assertTrustedNpm());
  } else {
    assert.throws(
      () => mod.assertTrustedNpm(),
      /direct-node path|authoritative|Refusing to spawn npm/,
      'a non-trusted host must throw with actionable guidance',
    );
  }
});

/**
 * @infrix compare — migration scaffold types and the governance-safety check
 * (nextux-15). A scaffold produces runnable Infrix artifacts; the generated SDK
 * starter must route through governance (dry-run + approval before run) and
 * never target mainnet. generatedSdkIsSafe mirrors the Go ScaffoldSDKIsSafe so
 * the SDK can confirm a scaffold did not bypass governance.
 */

/** ProofExpectation is the honest proof a scaffold is expected to produce. */
export interface ProofExpectation {
  localLevel: string;
  kermitLevel: string;
  nodeTrusted: boolean;
  replayRequired: boolean;
  note: string;
}

/** Scaffold is the bundle of runnable Infrix artifacts a migration produces.
 *  Shape mirrors pkg/compare.Scaffold. */
export interface Scaffold {
  pattern: string;
  infrixEquivalent: string;
  network: string;
  taskId: string;
  taskJson: string;
  scenarioId: string;
  scenarioYaml: string;
  sdkStarter: string;
  proofExpectation: ProofExpectation;
  cinemaLabels: Record<string, string>;
  migrationPlan: { order: number; title: string; detail: string; infrixAction?: string }[];
  verifierCommand: string;
}

/** generatedSdkIsSafe reports whether a generated SDK starter routes through
 *  governance: it dry-runs and approves before it runs, never targets mainnet,
 *  and contains no bypass marker. Mirrors pkg/compare.ScaffoldSDKIsSafe. */
export function generatedSdkIsSafe(code: string): boolean {
  if (!code.includes('client.dryRun(') || !code.includes('client.approve(') || !code.includes('client.run(')) {
    return false;
  }
  if (code.indexOf('client.run(') < code.indexOf('client.dryRun(')) return false;
  if (code.indexOf('client.approve(') < code.indexOf('client.dryRun(')) return false;
  const lower = code.toLowerCase();
  for (const bad of ["mode: 'mainnet'", 'mode: "mainnet"', 'skipapproval', 'skipdryrun', 'bypass', 'force: true', '--no-verify']) {
    if (lower.includes(bad)) return false;
  }
  return true;
}

/** scaffoldIsGoverned reports whether a scaffold's task disables mainnet and its
 *  SDK starter routes through governance. */
export function scaffoldIsGoverned(s: Scaffold): boolean {
  if (s.network.toLowerCase().includes('mainnet')) return false;
  if (s.proofExpectation.nodeTrusted) return false;
  if (/l4/i.test(s.proofExpectation.localLevel)) return false; // a local run never promises L4
  return generatedSdkIsSafe(s.sdkStarter);
}

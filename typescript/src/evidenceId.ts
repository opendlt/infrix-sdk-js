import type { IntentEvidenceAnswer } from './types/governance';

/** The one client member the lookup needs: the evidence an intent produced. */
export interface IntentEvidenceReader {
  intents: { evidence(intentId: string): Promise<IntentEvidenceAnswer> };
}

/**
 * The id the node gives the evidence bundle of an intent: `ev-<intentId>`. The node keeps one bundle
 * per intent under exactly this id (the admission and execution links accumulate in a single chain
 * that is sealed once, and the anchor commits to that chain), so it is the one id an intent's proof
 * can be exported from without a choice.
 */
export function canonicalEvidenceId(intentId: string): string {
  return `ev-${intentId}`;
}

/**
 * The id of the evidence bundle an intent produced, from GET /v4/intents/{id}/evidence (`bundles`).
 *
 * The rule, in full:
 *
 *   - no bundle yet                       -> `undefined` (the caller says "not available yet");
 *   - exactly one bundle                  -> its id;
 *   - several bundles                     -> the one whose id is {@link canonicalEvidenceId} of the
 *                                            intent, provided exactly one bundle carries it;
 *   - several bundles, none canonical, or
 *     the canonical id carried twice      -> an error that names every id and `evidence.exportPortable(id)`:
 *                                            a proof exported from the wrong bundle would verify as a proof
 *                                            of something else, so the caller picks the bundle by id.
 *
 * A bundle that has no string `id` is never chosen, and an answer whose `bundles` is not a list is refused.
 */
export async function evidenceIdForIntent(
  client: IntentEvidenceReader,
  intentId: string,
): Promise<string | undefined> {
  const { bundles } = await client.intents.evidence(intentId);
  if (!Array.isArray(bundles)) {
    throw new Error(`the node's answer to GET /v4/intents/{id}/evidence carries bundles that are not a list (intent ${intentId})`);
  }
  if (bundles.length === 0) return undefined;
  const ids = bundles.map((b) => (b as { id?: unknown } | null)?.id);
  if (bundles.length === 1) {
    const only = ids[0];
    return typeof only === 'string' && only !== '' ? only : undefined;
  }
  const canonical = canonicalEvidenceId(intentId);
  const canonicalCount = ids.filter((id) => id === canonical).length;
  if (canonicalCount === 1) return canonical;
  const named = ids.map((id) => (typeof id === 'string' && id !== '' ? id : '<no id>')).join(', ');
  throw new Error(
    `intent ${intentId} has ${bundles.length} evidence bundles (${named}) and ${
      canonicalCount === 0 ? `none is the canonical ${canonical}` : `the canonical ${canonical} appears ${canonicalCount} times`
    }; choose one and export it by its id with evidence.exportPortable(id)`,
  );
}

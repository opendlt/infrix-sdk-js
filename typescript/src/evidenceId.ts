import type { IntentEvidenceAnswer } from './types/governance';

/** The one client member the lookup needs: the evidence an intent produced. */
export interface IntentEvidenceReader {
  intents: { evidence(intentId: string): Promise<IntentEvidenceAnswer> };
}

/**
 * The id of the evidence bundle an intent produced, from GET /v4/intents/{id}/evidence (`bundles`).
 *
 * An intent that has produced no bundle yet answers `undefined`. An intent with more than one is
 * refused rather than resolved by guessing: a proof exported from the wrong bundle would verify as
 * a proof of something else, so the caller picks the bundle by id (`client.intents.evidence(...)`,
 * then `client.evidence.exportPortable(<id>)`).
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
  if (bundles.length > 1) {
    throw new Error(
      `intent ${intentId} has ${bundles.length} evidence bundles; export one by its id with evidence.exportPortable`,
    );
  }
  const id = (bundles[0] as { id?: unknown } | null)?.id;
  return typeof id === 'string' && id !== '' ? id : undefined;
}

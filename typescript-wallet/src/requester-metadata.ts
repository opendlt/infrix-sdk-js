/**
 * REQUESTER METADATA (core item 2c part 28ac row 3).
 *
 * A governed submission's `metadata` member is the REQUESTER's own annotation of the intent: one JSON object of
 * string keys and JSON values, which the node records as the intent's RequesterMetadata (never as the node's
 * attribution metadata, which no request sets). The node bounds it (infrix-schema intent.ParseRequesterMetadata):
 *
 *   - it must be a JSON object (a string, number, array, boolean or null is refused by name);
 *   - each key is 1 to MAX_REQUESTER_METADATA_KEY_BYTES UTF-8 bytes;
 *   - its compact JSON encoding is at most MAX_REQUESTER_METADATA_BYTES UTF-8 bytes, measured as JSON.stringify
 *     writes it, except that U+2028 and U+2029 count six bytes each (the node writes them as \u2028 and \u2029).
 *
 * checkRequesterMetadata refuses, by name and before anything is sent, exactly what the node refuses (the same check
 * as the client's typescript/src/sub-clients/requesterMetadata.ts; the wallet is its own package). The size
 * vector is the one infrix-schema's TestRequesterMetadataIsMeasuredAsAClientMeasuresIt pins.
 */

/** The bound on the compact JSON encoding of a requester's metadata (infrix-schema MaxRequesterMetadataBytes). */
export const MAX_REQUESTER_METADATA_BYTES = 4096;

/** The bound on one key of a requester's metadata (infrix-schema MaxRequesterMetadataKeyBytes). */
export const MAX_REQUESTER_METADATA_KEY_BYTES = 128;

const utf8 = new TextEncoder();

/** The size the node measures for a requester's metadata: its compact UTF-8 JSON, with U+2028 and U+2029 at six bytes. */
export function requesterMetadataSize(metadata: Record<string, unknown>): number {
  const json = JSON.stringify(metadata);
  let separators = 0;
  for (const ch of json) {
    if (ch === '\u2028' || ch === '\u2029') separators++;
  }
  // each separator is three UTF-8 bytes as written, six as the node writes it
  return utf8.encode(json).length + 3 * separators;
}

/** checkRequesterMetadata throws, naming the member, for metadata the node refuses; it answers the metadata unchanged. */
export function checkRequesterMetadata(method: string, metadata: unknown): Record<string, unknown> {
  const kind =
    metadata === null ? 'null' : Array.isArray(metadata) ? 'an array' : typeof metadata === 'string' ? 'a string' : typeof metadata === 'boolean' ? 'a boolean' : typeof metadata === 'number' ? 'a number' : typeof metadata === 'object' ? '' : typeof metadata;
  if (kind !== '') {
    throw new Error(`${method}: metadata must be a JSON object of string keys and JSON values, not ${kind}`);
  }
  const m = metadata as Record<string, unknown>;
  for (const k of Object.keys(m)) {
    if (k === '') {
      throw new Error(`${method}: metadata refused: a metadata key is empty`);
    }
    const n = utf8.encode(k).length;
    if (n > MAX_REQUESTER_METADATA_KEY_BYTES) {
      throw new Error(`${method}: metadata refused: a metadata key is ${n} bytes, over the ${MAX_REQUESTER_METADATA_KEY_BYTES}-byte bound`);
    }
  }
  const size = requesterMetadataSize(m);
  if (size > MAX_REQUESTER_METADATA_BYTES) {
    throw new Error(`${method}: metadata refused: metadata encodes to ${size} bytes, over the ${MAX_REQUESTER_METADATA_BYTES}-byte bound`);
  }
  return m;
}

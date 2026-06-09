/**
 * In-browser / in-Node scenario proof-story verifier (nextux-02).
 *
 * It checks the parts that are reliably reproducible cross-language: every
 * manifested artifact's SHA-256 (so tampering is caught), that no recognized
 * artifact is unmanifested, that the Cinema replay binds to the proof, and that
 * the story does not OVERCLAIM (an L4 claim requires l0Verified). Full
 * cryptographic re-verification of the proof bundle is layered via the existing
 * local proof verifier (verifyLocalProof) when the proof bundle bytes are
 * provided.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { Story } from './story';
import { isRecognizedArtifact } from './story';
import { verifyLocalProof } from '../proofs/verifyLocal';

export interface StoryCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface StoryVerifyResult {
  ok: boolean;
  checks: StoryCheck[];
}

export interface VerifyStoryOptions {
  /** When true and the proof bundle bytes are present, also re-verify the proof
   * locally (no node trust). */
  verifyProof?: boolean;
  /** Set when an L0 confirmation is available (required to confirm an L4 claim).
   * The browser cannot reach L0, so an L4 claim without this is reported as
   * unconfirmable rather than trusted. */
  l0Confirmed?: boolean;
}

function toBytes(v: Uint8Array | string): Uint8Array {
  return typeof v === 'string' ? new TextEncoder().encode(v) : v;
}

function hashHex(v: Uint8Array | string): string {
  return bytesToHex(sha256(toBytes(v)));
}

/**
 * verifyStoryStructure verifies a story against the artifact files it manifests.
 * `files` maps each filename to its raw bytes (or string). It returns a verdict
 * with per-check results; ok is true only when every check passes.
 */
export function verifyStoryStructure(
  story: Story,
  files: Record<string, Uint8Array | string>,
  opts: VerifyStoryOptions = {}
): StoryVerifyResult {
  const checks: StoryCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  if (story.version !== 1) {
    add('version', false, `unsupported story version ${story.version}`);
    return { ok: false, checks };
  }

  // Manifest checksums.
  const manifested = new Set<string>();
  let manifestOK = true;
  for (const m of story.manifest) {
    manifested.add(m.file);
    const data = files[m.file];
    if (data == null) {
      add(`manifest:${m.file}`, false, 'missing');
      manifestOK = false;
      continue;
    }
    const bytes = toBytes(data);
    if (hashHex(bytes) !== m.sha256 || bytes.length !== m.bytes) {
      add(`manifest:${m.file}`, false, 'checksum/size mismatch');
      manifestOK = false;
    }
  }
  add('manifest', manifestOK, manifestOK ? 'all manifested files match' : 'a manifested file failed');

  // Reject unmanifested recognized artifacts.
  for (const name of Object.keys(files)) {
    if (name === 'story.infrixstory.json') continue;
    if (isRecognizedArtifact(name) && !manifested.has(name)) {
      add(`unmanifested:${name}`, false, 'artifact present but not in manifest');
    }
  }

  // Every logical artifact must be manifested.
  for (const [logical, file] of Object.entries(story.artifacts)) {
    if (!manifested.has(file)) add(`artifact:${logical}`, false, `${file} not in manifest`);
  }

  // Honesty: an L4 claim requires l0Verified; and a verified claim needs a real
  // proof level.
  const a = story.assurance;
  if (a.proofLevel.toUpperCase() === 'L4' && !a.l0Verified) {
    add('honesty:l4', false, 'L4 claimed without l0Verified');
  }
  if (a.verified && !['L1', 'L2', 'L3', 'L4'].includes(a.proofLevel.toUpperCase())) {
    add('honesty:level', false, 'verified without a real proof level');
  }
  if ((a.l0Verified || a.proofLevel.toUpperCase() === 'L4') && opts.l0Confirmed === false) {
    add('l0', false, 'story claims L0/L4 but no L0 confirmation is available in this environment');
  }

  // Cinema binding.
  const cinemaFile = story.artifacts['cinemaReplay'];
  if (cinemaFile && files[cinemaFile] != null) {
    try {
      const cinema = JSON.parse(new TextDecoder().decode(toBytes(files[cinemaFile])));
      add('cinema-binding', cinema.boundOutcomeDigest === story.cinemaBinding,
        cinema.boundOutcomeDigest === story.cinemaBinding ? 'binds to the proof' : 'does not bind to the proof');
    } catch {
      add('cinema-binding', false, 'cinema artifact is not valid JSON');
    }
  }

  // Optional: re-verify the proof bundle locally (no node trust).
  if (opts.verifyProof) {
    const proofFile = story.artifacts['proofBundle'];
    const data = proofFile ? files[proofFile] : undefined;
    if (data != null) {
      try {
        const pkg = JSON.parse(new TextDecoder().decode(toBytes(data)));
        const res = verifyLocalProof(pkg);
        add('proof', res.verified === a.verified,
          `bundle verified=${res.verified} (claimed verified=${a.verified})`);
      } catch (e) {
        add('proof', false, `proof verify failed: ${String(e)}`);
      }
    }
  }

  return { ok: checks.every((c) => c.ok), checks };
}

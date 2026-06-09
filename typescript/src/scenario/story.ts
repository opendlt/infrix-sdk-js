/**
 * Scenario proof-story types (nextux-02). These mirror the canonical Go shapes
 * in pkg/scenario so an agent/app can type its calls and verify a story.
 */

export interface StoryAssurance {
  proofLevel: string;
  governanceLevel: string;
  trustsInfrixNode: boolean;
  l0Verified: boolean;
  replayVerified: boolean;
  minimumLevelMet: boolean;
  verified: boolean;
}

export interface ManifestEntry {
  file: string;
  sha256: string;
  bytes: number;
}

export interface StoryNarrative {
  promise?: string;
  description?: string;
  whyItMatters?: string;
  actors?: Record<string, string>;
  outcome?: string;
  cinemaLabels?: Record<string, string>;
}

export interface Story {
  version: number;
  storyId: string;
  scenarioId: string;
  title: string;
  network: string;
  assurance: StoryAssurance;
  artifacts: Record<string, string>;
  manifest: ManifestEntry[];
  redactions: string[];
  narrative: StoryNarrative;
  cinemaBinding: string;
  integrity: { sha256: string };
}

/** The recognized artifact filenames a scenario run produces. */
export const ARTIFACT_FILES = {
  scenario: 'scenario.yaml',
  proofBundle: 'proof.infrix.json',
  receipt: 'receipt.infrix.json',
  cinemaReplay: 'cinema.infrix.json',
  verifierTranscript: 'verify.txt',
  story: 'story.infrixstory.json',
} as const;

/** A recognized artifact file name is a tamper signal if unmanifested. */
export function isRecognizedArtifact(name: string): boolean {
  return (
    name === ARTIFACT_FILES.scenario ||
    name === ARTIFACT_FILES.receipt ||
    name === ARTIFACT_FILES.verifierTranscript ||
    name.endsWith('.infrix.json')
  );
}

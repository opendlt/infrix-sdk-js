import { SubClient } from './base';
import type {
  EvidenceBundle,
  EvidenceVerificationResult,
  EvidenceExportFormat,
  AnchoredRecord,
} from '../types/governance';

/**
 * EvidenceSubClient provides evidence chain access and verification.
 */
export class EvidenceSubClient extends SubClient {
  /**
   * Get the evidence bundle for an intent or operation.
   *
   * @param intentId - The intent whose evidence to retrieve
   */
  async get(intentId: string): Promise<EvidenceBundle> {
    return this.rpc<EvidenceBundle>('evidence.get', { intentId });
  }

  /**
   * Verify the integrity of an evidence bundle.
   *
   * Checks hash chain continuity, state root consistency, and anchor status.
   *
   * @param intentId - The intent whose evidence to verify
   */
  async verify(intentId: string): Promise<EvidenceVerificationResult> {
    return this.rpc<EvidenceVerificationResult>('evidence.verify', {
      intentId,
    });
  }

  /**
   * Export an evidence bundle in the specified format.
   *
   * @param intentId - The intent whose evidence to export
   * @param format - Export format: 'json', 'cbor', 'protobuf', 'pdf'
   */
  async export(
    intentId: string,
    format: EvidenceExportFormat
  ): Promise<{ data: string; mimeType: string; size: number }> {
    return this.rpc<{ data: string; mimeType: string; size: number }>(
      'evidence.export',
      { intentId, format }
    );
  }

  /**
   * Get the L0 anchor proof for an evidence bundle.
   *
   * @param intentId - The intent whose anchor to retrieve
   */
  async anchor(intentId: string): Promise<AnchoredRecord> {
    return this.rpc<AnchoredRecord>('evidence.anchor', { intentId });
  }

  /**
   * Export the canonical, self-contained PORTABLE evidence package for a
   * bundle — the artifact a third party verifies offline with no trust in
   * this node (drop it into `infrix verify` or pkg/evidence.VerifyPortablePackage).
   *
   * @param evidenceId - The evidence bundle id to export.
   * @returns The portable evidence package (PortableEvidencePackage shape).
   */
  async exportPortable(evidenceId: string): Promise<Record<string, unknown>> {
    return this.rpc<Record<string, unknown>>('explorer.evidenceExportPortable', {
      id: evidenceId,
    });
  }
}

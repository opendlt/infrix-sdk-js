import { SubClient } from './base';
import type {
  AnchoredRecord,
  AnchorListFilter,
  AnchorVerificationResult,
  AnchorStats,
} from '../types/governance';

/**
 * AnchorSubClient provides L0 anchor verification and management.
 */
export class AnchorSubClient extends SubClient {
  /**
   * List anchored records.
   */
  async list(
    filter?: AnchorListFilter
  ): Promise<{ anchors: AnchoredRecord[]; total: number }> {
    return this.rpc<{ anchors: AnchoredRecord[]; total: number }>(
      'anchor.list',
      (filter ?? {}) as Record<string, unknown>
    );
  }

  /**
   * Verify an anchor against L0 state.
   *
   * @param anchorId - The anchor to verify
   * @returns Verification result with L0 tx hash, block, and proof status
   */
  async verify(anchorId: string): Promise<AnchorVerificationResult> {
    return this.rpc<AnchorVerificationResult>('anchor.verify', { anchorId });
  }

  /**
   * Get anchoring statistics.
   */
  async stats(): Promise<AnchorStats> {
    return this.rpc<AnchorStats>('anchor.stats', {});
  }

  /**
   * Get a specific anchored record.
   */
  async get(anchorId: string): Promise<AnchoredRecord> {
    return this.rpc<AnchoredRecord>('anchor.get', { anchorId });
  }
}

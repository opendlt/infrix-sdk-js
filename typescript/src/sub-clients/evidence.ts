import { SubClient } from './base';
import { genCheckValue } from './gen/runtime';
import { REGISTRY_OBJECT_MEMBERS, checkPathValue, declaredMembers } from './routeShapes';
import type { RegistryObjectAnswer } from './routeShapes';
import type {
  EvidenceAnchorAnswer,
  EvidenceExportAnswer,
  EvidenceExportFormat,
  EvidenceVerifyAnswer,
} from '../types/governance';

const GET_ROUTE = 'GET /v4/evidence/{id}';
const VERIFY_ROUTE = 'GET /v4/evidence/{id}/verify';
const EXPORT_ROUTE = 'GET /v4/evidence/{id}/export';
const ANCHOR_ROUTE = 'GET /v4/evidence/{id}/anchor';

/** The export formats the route accepts. */
const EXPORT_FORMATS: readonly EvidenceExportFormat[] = ['json', 'portable'];

/**
 * EvidenceSubClient provides evidence chain access and verification.
 *
 * Every read is by EVIDENCE BUNDLE id (the `id` of a bundle), never by intent id: find the bundles an
 * intent produced with `client.intents.evidence(intentId)`. Every read answers exactly the members its
 * route declares; an answer that lacks one is refused rather than read as empty.
 */
export class EvidenceSubClient extends SubClient {
  /**
   * Get an evidence bundle as the object registry holds it (REST GET /v4/evidence/{id}): the
   * bundle's own record is in `fields`.
   *
   * @param evidenceId - The evidence bundle id
   */
  async get(evidenceId: string): Promise<RegistryObjectAnswer> {
    checkPathValue(GET_ROUTE, 'id', evidenceId);
    const answer = await this.rest<unknown>('GET', `/v4/evidence/${encodeURIComponent(evidenceId)}`);
    return declaredMembers<RegistryObjectAnswer>(GET_ROUTE, answer, REGISTRY_OBJECT_MEMBERS);
  }

  /**
   * Verify the integrity of an evidence bundle (REST GET /v4/evidence/{id}/verify): whether its
   * hash chain holds (`chainVerified`).
   *
   * @param evidenceId - The evidence bundle id
   */
  async verify(evidenceId: string): Promise<EvidenceVerifyAnswer> {
    checkPathValue(VERIFY_ROUTE, 'id', evidenceId);
    const answer = await this.rest<unknown>('GET', `/v4/evidence/${encodeURIComponent(evidenceId)}/verify`);
    return declaredMembers<EvidenceVerifyAnswer>(VERIFY_ROUTE, answer, ['bundleId', 'chainVerified']);
  }

  /**
   * Export an evidence bundle (REST GET /v4/evidence/{id}/export).
   *
   * @param evidenceId - The evidence bundle id
   * @param format - `json` or `portable`; the route refuses any other
   */
  async export(evidenceId: string, format: EvidenceExportFormat): Promise<EvidenceExportAnswer> {
    checkPathValue(EXPORT_ROUTE, 'id', evidenceId);
    const query = `?format=${encodeURIComponent(genCheckValue(`${EXPORT_ROUTE} format`, format, 'enum', EXPORT_FORMATS))}`;
    const answer = await this.rest<unknown>('GET', `/v4/evidence/${encodeURIComponent(evidenceId)}/export${query}`);
    return declaredMembers<EvidenceExportAnswer>(EXPORT_ROUTE, answer, [
      'bundle', 'bundleId', 'bytes', 'exportHash', 'format',
    ]);
  }

  /**
   * Get the L0 anchor proof for an evidence bundle (REST GET /v4/evidence/{id}/anchor).
   *
   * @param evidenceId - The evidence bundle id
   */
  async anchor(evidenceId: string): Promise<EvidenceAnchorAnswer> {
    checkPathValue(ANCHOR_ROUTE, 'id', evidenceId);
    const answer = await this.rest<unknown>('GET', `/v4/evidence/${encodeURIComponent(evidenceId)}/anchor`);
    return declaredMembers<EvidenceAnchorAnswer>(ANCHOR_ROUTE, answer, [
      'anchorBlock', 'anchorDataIdx', 'anchorStatus', 'anchorTxHash', 'bundleId', 'stateRoot',
    ]);
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

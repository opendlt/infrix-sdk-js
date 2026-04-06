import { SubClient } from './base';
import type {
  GoverningObject,
  ObjectAuditEntry,
  ObjectListFilter,
  ObjectCreateOptions,
  ObjectTransitionOptions,
} from '../types/governance';

/**
 * ObjectSubClient provides governed object operations.
 *
 * Objects are first-class governed entities (credentials, vaults, workflows,
 * tokens, etc.) that exist in the object registry and are subject to policies.
 */
export class ObjectSubClient extends SubClient {
  /**
   * List objects by type with optional filtering.
   *
   * @param type - Object type (e.g. 'credential', 'vault', 'workflow')
   * @param filter - Optional: status, owner, date range, pagination
   */
  async list(
    type: string,
    filter?: ObjectListFilter
  ): Promise<{ objects: GoverningObject[]; total: number }> {
    return this.rpc<{ objects: GoverningObject[]; total: number }>(
      'object.list',
      { type, ...(filter ?? {}) }
    );
  }

  /**
   * Get a single object by type and ID.
   *
   * @param type - Object type
   * @param id - Object ID
   */
  async get(type: string, id: string): Promise<GoverningObject> {
    return this.rpc<GoverningObject>('object.get', { type, id });
  }

  /**
   * Create a governed object via the intent pipeline.
   *
   * This does NOT directly create the object. It submits an OBJECT_CREATE
   * intent, which goes through policy evaluation, plan generation, approval,
   * and execution. The returned IntentResult tracks the creation lifecycle.
   *
   * @param type - Object type to create
   * @param fields - Object fields/properties
   * @param opts - Optional: owner, policies, metadata
   */
  async create(
    type: string,
    fields: Record<string, unknown>,
    opts?: ObjectCreateOptions
  ): Promise<{ intentId: string; objectId: string; status: string }> {
    return this.rpc<{ intentId: string; objectId: string; status: string }>(
      'object.create',
      { type, fields, ...opts }
    );
  }

  /**
   * Transition an object to a new state via the intent pipeline.
   *
   * @param type - Object type
   * @param id - Object ID
   * @param targetState - Target state name
   * @param opts - Optional: reason, metadata
   */
  async transition(
    type: string,
    id: string,
    targetState: string,
    opts?: ObjectTransitionOptions
  ): Promise<{ intentId: string; status: string }> {
    return this.rpc<{ intentId: string; status: string }>(
      'object.transition',
      { type, id, targetState, ...opts }
    );
  }

  /**
   * Get the audit trail for an object.
   *
   * @param type - Object type
   * @param id - Object ID
   * @returns Chronological list of state changes, policy evaluations, approvals
   */
  async audit(type: string, id: string): Promise<ObjectAuditEntry[]> {
    const result = await this.rpc<{ entries: ObjectAuditEntry[] }>(
      'object.audit',
      { type, id }
    );
    return result.entries;
  }

  /**
   * List all registered object types.
   */
  async types(): Promise<{ types: string[]; schemas: Record<string, unknown> }> {
    return this.rpc<{ types: string[]; schemas: Record<string, unknown> }>(
      'object.types',
      {}
    );
  }
}

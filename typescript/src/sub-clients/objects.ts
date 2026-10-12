import { SubClient } from './base';
import { genQuery } from './gen/runtime';
import {
  LIST_MEMBERS,
  REGISTRY_OBJECT_MEMBERS,
  checkPathValue,
  declaredMembers,
  refuseUnknownOptions,
} from './routeShapes';
import type { ListAnswer, RegistryObjectAnswer } from './routeShapes';
import type {
  ObjectAuditAnswer,
  ObjectListFilter,
  ObjectCreateOptions,
  ObjectTransitionOptions,
} from '../types/governance';

const LIST_ROUTE = 'GET /v4/objects/{type}';
const GET_ROUTE = 'GET /v4/objects/{type}/{id}';
const AUDIT_ROUTE = 'GET /v4/objects/{type}/{id}/audit';

/**
 * ObjectSubClient provides governed object operations.
 *
 * Objects are first-class governed entities (credentials, vaults, workflows,
 * tokens, etc.) that exist in the object registry and are subject to policies.
 */
export class ObjectSubClient extends SubClient {
  /**
   * List the objects of one type the caller can see (REST GET /v4/objects/{type}).
   *
   * @param type - Object type (e.g. 'credential', 'vault', 'workflow'); the route refuses a type
   *   the registry does not declare
   * @param filter - Only the filters the route accepts: `state`, and `field` with `value` (and
   *   `filterLimit`) to match a field; `id` narrows to one object
   * @returns `items` and `pagination`.
   */
  async list(type: string, filter: ObjectListFilter = {}): Promise<ListAnswer> {
    checkPathValue(LIST_ROUTE, 'type', type);
    refuseUnknownOptions('objects.list', LIST_ROUTE, filter, ['field', 'filterLimit', 'id', 'state', 'value']);
    const query = genQuery(LIST_ROUTE, [
      ['field', filter.field, 'string'],
      ['filterLimit', filter.filterLimit, 'int'],
      ['id', filter.id, 'string'],
      ['state', filter.state, 'string'],
      ['value', filter.value, 'string'],
    ]);
    const answer = await this.rest<unknown>('GET', `/v4/objects/${encodeURIComponent(type)}${query}`);
    return declaredMembers<ListAnswer>(LIST_ROUTE, answer, LIST_MEMBERS);
  }

  /**
   * Get one object by type and ID (REST GET /v4/objects/{type}/{id}); the object's own record is in
   * `fields`.
   *
   * @param type - Object type
   * @param id - Object ID
   */
  async get(type: string, id: string): Promise<RegistryObjectAnswer> {
    checkPathValue(GET_ROUTE, 'type', type);
    checkPathValue(GET_ROUTE, 'id', id);
    const answer = await this.rest<unknown>(
      'GET',
      `/v4/objects/${encodeURIComponent(type)}/${encodeURIComponent(id)}`
    );
    return declaredMembers<RegistryObjectAnswer>(GET_ROUTE, answer, REGISTRY_OBJECT_MEMBERS);
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
   * @param newState - The state the object moves to (the one key
   *   OBJECT_TRANSITION declares)
   * @param opts - Optional: reason, metadata
   */
  async transition(
    type: string,
    id: string,
    newState: string,
    opts?: ObjectTransitionOptions
  ): Promise<{ intentId: string; status: string }> {
    return this.rpc<{ intentId: string; status: string }>(
      'object.transition',
      { type, id, newState, ...opts }
    );
  }

  /**
   * Get the audit trail for an object (REST GET /v4/objects/{type}/{id}/audit).
   *
   * @param type - Object type
   * @param id - Object ID
   * @returns `audit`, the trail, with the `objectType` and `objectId` it belongs to
   */
  async audit(type: string, id: string): Promise<ObjectAuditAnswer> {
    checkPathValue(AUDIT_ROUTE, 'type', type);
    checkPathValue(AUDIT_ROUTE, 'id', id);
    const answer = await this.rest<unknown>(
      'GET',
      `/v4/objects/${encodeURIComponent(type)}/${encodeURIComponent(id)}/audit`
    );
    return declaredMembers<ObjectAuditAnswer>(AUDIT_ROUTE, answer, ['audit', 'objectId', 'objectType']);
  }

  /**
   * List the governance-authoritative object types: the ones created and transitioned through the
   * ObjectRegistry and never written directly. The registry declares more types than these; `total`
   * is the count of this list.
   */
  async types(): Promise<{ types: string[]; total: number; detail: string }> {
    return this.rpc<{ types: string[]; total: number; detail: string }>(
      'object.types',
      {}
    );
  }
}

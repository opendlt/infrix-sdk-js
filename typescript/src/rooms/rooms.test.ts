/**
 * Multiplayer Demo Rooms SDK tests (nextux-14).
 *
 * They verify the role / event / room helpers against the Go-generated room
 * fixture and assert the honesty invariants: a viewer can never approve, an
 * undelegated agent can never approve, the private payload is hidden from
 * unauthorized roles, the local room's proof never claims L4 / live L0 / node
 * trust, and the shared replay binds to the event log.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  canSeePrivatePayload,
  replayBoundToLog,
  proofIsHonest,
  participantCanApprove,
} from './index';
import type { RoomData } from './index';

function loadFixture(): RoomData {
  const p = join(__dirname, '..', '..', 'testdata', 'room.fixture.json');
  return JSON.parse(readFileSync(p, 'utf8')) as RoomData;
}

test('the room loads with seven role policies and several participants', () => {
  const { room, roles } = loadFixture();
  assert.equal(roles.length, 7, 'all seven role policies are present');
  assert.ok(room.participants.length >= 3, 'the room has several participants');
});

test('a viewer can never approve and an undelegated agent can never approve', () => {
  const { room } = loadFixture();
  const viewer = room.participants.find((p) => p.role === 'viewer');
  assert.ok(viewer, 'a viewer is present');
  assert.equal(participantCanApprove(viewer!), false, 'a viewer must not be able to approve');

  const agent = room.participants.find((p) => p.role === 'ai_assistant');
  assert.ok(agent, 'an AI assistant is present');
  if (!agent!.delegated) {
    assert.equal(participantCanApprove(agent!), false, 'an undelegated agent must not be able to approve');
  }
});

test('the private payload is hidden from unauthorized roles', () => {
  const { roles } = loadFixture();
  assert.equal(canSeePrivatePayload(roles, 'witness'), false, 'a witness must not see the private payload');
  assert.equal(canSeePrivatePayload(roles, 'viewer'), false, 'a viewer must not see the private payload');
  assert.equal(canSeePrivatePayload(roles, 'regulator'), true, 'a regulator may see the disclosed private payload');
});

test('a local room never claims L4, live L0, or node trust', () => {
  const { room } = loadFixture();
  const a = room.proof!.assurance;
  assert.ok(!/l4/i.test(a.proofLevel), 'a local room must not claim L4');
  assert.equal(a.l0Verified, false, 'a local room must not claim live L0');
  assert.equal(a.trustsInfrixNode, false, 'a room must never trust the node');
  assert.equal(proofIsHonest(room), true, 'the room proof must satisfy the honesty rails');
});

test('the shared replay binds to the event log', () => {
  const { replay } = loadFixture();
  assert.equal(replayBoundToLog(replay), true, 'the replay must bind to the event-log head');
});

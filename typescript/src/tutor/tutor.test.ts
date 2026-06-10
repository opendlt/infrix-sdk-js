/**
 * Conversational Proof Tutor SDK tests (nextux-13).
 *
 * They verify the explanation / lesson / quiz helpers against the Go-generated
 * tutor fixture and assert the honesty invariants: the worked example explains
 * an OFFLINE proof, so it never claims L4, is never green, and discloses that
 * live L0 was not performed; the curriculum carries the seven lessons; and the
 * six audiences are present.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AUDIENCES,
  isGreen,
  claimsL4,
  disclosesNoLiveL0,
  isHonest,
  lessonByTopic,
  isQuizAnswerCorrect,
  quizIsWellFormed,
} from './index';
import type { Audience, Explanation, Lesson, QuizQuestion } from './index';

interface TutorFixture {
  version: number;
  lessons: Lesson[];
  audiences: Audience[];
  sample: Explanation;
  sampleQuiz: QuizQuestion;
}

function loadFixture(): TutorFixture {
  const p = join(__dirname, '..', '..', '..', '..', 'pkg', 'nexus', 'web', 'testdata', 'tutor.fixture.json');
  return JSON.parse(readFileSync(p, 'utf8')) as TutorFixture;
}

test('the worked example explains an OFFLINE proof and refuses L4', () => {
  const { sample } = loadFixture();
  assert.equal(isGreen(sample), false, 'an offline proof is never green');
  assert.equal(claimsL4(sample), false, 'an offline proof never claims L4');
  assert.equal(disclosesNoLiveL0(sample), true, 'an offline proof discloses live L0 was not performed');
  assert.equal(isHonest(sample), true, 'the worked example satisfies the honesty rails');
});

test('the curriculum carries the seven lessons, each well-formed', () => {
  const { lessons } = loadFixture();
  assert.equal(lessons.length, 7, 'seven lessons');
  for (const l of lessons) {
    assert.ok(l.explanation.length > 0, `lesson ${l.topic} has an explanation`);
    assert.ok(l.example.length > 0, `lesson ${l.topic} has an example`);
    assert.ok(l.tryIt.length > 0, `lesson ${l.topic} has a try-it command`);
    assert.ok(quizIsWellFormed(l.quiz), `lesson ${l.topic} has a well-formed quiz`);
  }
});

test('teach by alias resolves (L4 -> the L3-vs-L4 lesson)', () => {
  const { lessons } = loadFixture();
  const l = lessonByTopic(lessons, 'L4');
  assert.ok(l, 'alias L4 resolves');
  assert.equal(l?.id, 'L3-vs-L4', 'L4 maps to the L3-vs-L4 lesson');
});

test('the six audiences are present', () => {
  const { audiences } = loadFixture();
  assert.equal(audiences.length, 6, 'six audiences');
  for (const want of AUDIENCES) {
    assert.ok(audiences.includes(want), `audience ${want} present`);
  }
});

test('the sample quiz grades honestly', () => {
  const { sampleQuiz } = loadFixture();
  assert.ok(quizIsWellFormed(sampleQuiz), 'the sample quiz is well-formed');
  assert.equal(isQuizAnswerCorrect(sampleQuiz, sampleQuiz.answer), true, 'the correct index grades correct');
  const wrong = (sampleQuiz.answer + 1) % sampleQuiz.choices.length;
  assert.equal(isQuizAnswerCorrect(sampleQuiz, wrong), false, 'a wrong index does not grade correct');
});

// @infrix/widgets — InfrixCinemaReplay tests (nextux-09).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { InfrixCinemaReplay, extractCinemaSteps } from '../CinemaReplay.js';
import { verifyStory } from '../verifier.js';
import { loadSampleBundle } from './fixtures.js';

test('extractCinemaSteps pulls the recorded replay steps out of a story bundle', () => {
  const steps = extractCinemaSteps(loadSampleBundle());
  assert.ok(steps.length > 0, 'a story with a Cinema replay must expose steps');
  for (const s of steps) {
    assert.ok(typeof s.index === 'number' && s.label.length > 0);
  }
});

test('renders the replay timeline with verified status', async () => {
  const bundle = loadSampleBundle();
  const result = await verifyStory(bundle);
  const html = renderToStaticMarkup(<InfrixCinemaReplay story={bundle} result={result} />);
  assert.match(html, /class="iw-steps"/);
  assert.match(html, /aria-label="Replay steps"/);
  assert.match(html, /Cinema replay/);
  // The story verified locally, so the status line is present.
  assert.match(html, /Verified/);
});

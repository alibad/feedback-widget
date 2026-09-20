import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fitAnnotationImage } from '../lib/annotation-layout.ts';

test('annotation preview fits wide, tall and mobile viewports without stretching', () => {
  for (const image of [
    { w: 1280, h: 720 },
    { w: 800, h: 2400 },
    { w: 2400, h: 800 },
  ]) {
    for (const available of [
      { w: 1232, h: 540 },
      { w: 366, h: 400 },
    ]) {
      const result = fitAnnotationImage(image, available);
      assert.ok(result.w <= available.w && result.h <= available.h);
      assert.ok(Math.abs(result.w / result.h - image.w / image.h) < 0.000001);
    }
  }
});

test('small images are not enlarged and unavailable geometry is safe', () => {
  assert.deepEqual(fitAnnotationImage({ w: 100, h: 80 }, { w: 900, h: 600 }), {
    w: 100,
    h: 80,
  });
  assert.deepEqual(fitAnnotationImage({ w: 0, h: 80 }, { w: 900, h: 600 }), {
    w: 1,
    h: 1,
  });
});

test('swatch visuals keep square bounds independent of their larger hit targets', () => {
  const css = readFileSync(
    new URL('../app/globals.css', import.meta.url),
    'utf8',
  );
  const dot = css.match(/\.annotation-swatch-dot\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(dot, /width: 26px/);
  assert.match(dot, /height: 26px/);
  assert.match(dot, /flex: 0 0 26px/);
  assert.doesNotMatch(css, /\.annotation-toolbar button\s*\{/);
});

test('save exports the committed text immediately and retains accessible icon labels', () => {
  const source = readFileSync(
    new URL('../components/feedback-annotator.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /const savedMarks = commitText\(\)/);
  assert.match(source, /savedMarks\.forEach/);
  assert.doesNotMatch(source, /Press Save image again/);
  assert.match(source, /aria-label=\{label\}/);
  assert.match(source, /aria-label=\{colorNames\[i\]\}/);
});

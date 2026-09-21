import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');

void test('mobile showcase embeds live production surfaces instead of screenshots', () => {
  assert.match(page, /<iframe/);
  assert.match(page, /src=\{selected\.appUrl\}/);
  assert.match(page, /Interactive production surface/);
  assert.doesNotMatch(page, /src=\{selected\.image\}/);
});

void test('mobile showcase includes each embeddable product surface', () => {
  for (const url of [
    'https://app.stackquest.dev/?feedback_demo=1',
    'https://app.doneos.net/?feedback_demo=1',
    'https://app.leelaquest.com/?debug=true&feedback_demo=1#/home',
    'https://studio.yogaquest.app/?feedback_demo=1',
    'https://app.scribe-quest.com/?feedback_demo=1',
  ]) {
    assert.match(page, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

void test('mobile showcase is the penultimate page section', () => {
  const showcase = page.lastIndexOf('<MobileShowcase />');
  const finalCta = page.lastIndexOf('<section className="bottom-cta wrap">');

  assert.ok(showcase > 0);
  assert.ok(finalCta > showcase);
  assert.equal(page.slice(showcase, finalCta).match(/<section/g)?.length ?? 0, 0);
});

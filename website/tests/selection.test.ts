import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  safeSelection,
  feedbackElementAtPoint,
} from '../lib/feedback-capture.ts';

// Deliberately small DOM doubles. All content-bearing getters throw, so a
// privacy regression cannot silently read text, input values, or arbitrary attrs.
class El {
  tagName: string;
  parentElement: El | null = null;
  children: El[] = [];
  shadowRoot: any = null;
  root: any = {};
  attrs: Record<string, string>;
  rect = { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };
  constructor(tag: string, attrs: Record<string, string> = {}) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
  }
  add(child: El) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }
  get textContent(): never {
    throw Error('Text must not be read');
  }
  get value(): never {
    throw Error('Value must not be read');
  }
  getAttribute(name: string) {
    assert.equal(name, 'data-feedback-label');
    return this.attrs[name] ?? null;
  }
  getRootNode() {
    return this.root;
  }
  getBoundingClientRect() {
    return this.rect;
  }
  matches(selector: string) {
    return selector
      .split(',')
      .some((s) =>
        s === '#feedback-widget-root'
          ? this.attrs.id === 'feedback-widget-root'
          : s.startsWith('[') && s.slice(1, -1) in this.attrs,
      );
  }
}
const select = (e: El | null) => safeSelection(e as unknown as Element | null);
test('unlabeled text, images, inputs, and nested icons target the exact element', () => {
  const body = new El('body'),
    section = body.add(new El('section'));
  for (const tag of ['p', 'h1', 'img', 'input', 'textarea', 'svg', 'path']) {
    const leaf = section.add(new El(tag));
    const result = select(leaf);
    assert.equal(result?.target, leaf);
    assert.match(result!.info, new RegExp(tag + ':nth-of-type'));
  }
});
test('labeled parent does not swallow its children; sibling index distinguishes matches', () => {
  const parent = new El('div', { 'data-feedback-label': 'Card' });
  parent.add(new El('span'));
  const second = parent.add(new El('span'));
  assert.equal(
    select(second)?.info,
    'div:nth-of-type(1) > span:nth-of-type(2)',
  );
});
test('protected areas and widget UI are excluded but public parent containers remain selectable', () => {
  const protectedAttributes: Record<string, string>[] = [
    { id: 'feedback-widget-root' },
    { 'data-private': '' },
    { 'data-sensitive': '' },
    { 'data-no-capture': '' },
  ];
  for (const attrs of protectedAttributes) {
    const outer = new El('section'),
      privateBox = outer.add(new El('div', attrs));
    assert.equal(select(privateBox.add(new El('span'))), null);
    assert.ok(select(outer));
  }
});
test('only bounded authored labels are read; IDs and text never become public context', () => {
  assert.match(
    select(new El('button', { 'data-feedback-label': 'Install skill' }))!.info,
    /Install skill/,
  );
  assert.equal(
    select(
      new El('div', {
        'data-feedback-label': 'secret@example.com',
        id: 'private-token',
      }),
    )!.info,
    'div:nth-of-type(1)',
  );
});
test('shadow descendants honor a protected host', () => {
  const host = new El('x-card', { 'data-private': '' }),
    leaf = new El('span');
  leaf.root = { host, children: [leaf] };
  assert.equal(select(leaf), null);
});
test('deep selection descriptions fit the report contract without losing the leaf', () => {
  let leaf = new El('body');
  for (let i = 0; i < 12; i++)
    leaf = leaf.add(new El('custom-component-with-a-long-name'));
  leaf = leaf.add(new El('button', { 'data-feedback-label': 'x'.repeat(100) }));
  const result = select(leaf)!;
  assert.ok(result.info.length <= 300);
  assert.ok(result.info.endsWith(`button:nth-of-type(1) (${'x'.repeat(100)})`));
  assert.ok(result.info.startsWith('custom-component'));
});
test('hit testing descends through open shadow roots and pointer-events-none decoration', () => {
  const host = new El('x-card'),
    button = new El('button'),
    icon = button.add(new El('svg'));
  host.shadowRoot = { elementFromPoint: () => button };
  const doc = {
    elementFromPoint: () => host,
    defaultView: {
      getComputedStyle: (el: El) => ({
        pointerEvents: el === icon ? 'none' : 'auto',
        visibility: 'visible',
      }),
    },
  };
  assert.equal(
    feedbackElementAtPoint(doc as unknown as Document, 20, 20),
    icon,
  );
});

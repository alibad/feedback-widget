import test from 'node:test';
import assert from 'node:assert/strict';

import { compare, nextVersion, VERSION_FILES } from './sync.mjs';

const reader = (source, repo) => ({ source: (f) => source[f], repo: (f) => repo[f] });

test('the drift this exists to catch', () => {
  // 2026-09-07: the microphone default changed in two files and the version
  // stayed 13.0.0 in both copies for eleven days.
  const { changed, added, removed } = compare(
    ['SKILL.md', 'references/common-pitfalls.md'],
    ['SKILL.md', 'references/common-pitfalls.md'],
    reader(
      { 'SKILL.md': 'default the microphone ON', 'references/common-pitfalls.md': 'default the microphone ON' },
      { 'SKILL.md': 'Start with microphone off', 'references/common-pitfalls.md': 'Start with microphone off' },
    ),
  );
  assert.deepEqual(changed, ['SKILL.md', 'references/common-pitfalls.md']);
  assert.deepEqual([added, removed], [[], []]);
});

test('identical trees report nothing', () => {
  const same = { 'SKILL.md': 'same' };
  const { changed, added, removed } = compare(['SKILL.md'], ['SKILL.md'], reader(same, same));
  assert.deepEqual([changed, added, removed], [[], [], []]);
});

test('added and removed files are distinguished from edits', () => {
  const { added, removed, changed } = compare(
    ['SKILL.md', 'references/new.md'],
    ['SKILL.md', 'references/gone.md'],
    reader({ 'SKILL.md': 'x', 'references/new.md': 'n' }, { 'SKILL.md': 'x', 'references/gone.md': 'g' }),
  );
  assert.deepEqual(added, ['references/new.md']);
  assert.deepEqual(removed, ['references/gone.md']);
  assert.deepEqual(changed, [], 'an unchanged shared file is not an edit');
});

test('version bumps', () => {
  assert.equal(nextVersion('13.0.0', 'patch'), '13.0.1');
  assert.equal(nextVersion('13.0.0', 'minor'), '13.1.0');
  assert.equal(nextVersion('13.2.5', 'major'), '14.0.0');
  assert.throws(() => nextVersion('13.0.0', 'sideways'), /unknown bump/);
});

test('every place verify.mjs requires the version to appear is rewritten', () => {
  // verify.mjs fails the build if these disagree, so a partial rewrite would
  // trade a silent drift for a broken release.
  const files = VERSION_FILES.map(([f]) => f);
  for (const required of [
    'package.json',
    '.claude-plugin/plugin.json',
    '.codex-plugin/plugin.json',
    'skills/add-feedback-widget/SKILL.md',
  ]) {
    assert.ok(files.includes(required), `${required} must be version-rewritten`);
  }
});

test('the SKILL.md frontmatter rewrite hits the version and nothing else', () => {
  const rewrite = VERSION_FILES.find(([f]) => f.endsWith('SKILL.md'))[1];
  const before = '---\nname: add-feedback-widget\nmetadata:\n  author: alibad\n  version: 13.0.0\n---\n\nversion: keep me\n';
  const after = rewrite(before, '13.1.0');
  assert.match(after, /\n  version: 13\.1\.0\n/);
  assert.match(after, /\nversion: keep me\n/, 'prose mentioning "version:" must be untouched');
});

test('BOTH README zip names follow the version', () => {
  // The first pass only rewrote one of the two and left the README advertising
  // add-feedback-widget-13.1.0.zip beside feedback-widget-plugin-13.0.0.zip.
  const rewrite = VERSION_FILES.find(([f]) => f === 'README.md')[1];
  const after = rewrite(
    '- `add-feedback-widget-13.0.0.zip`: skill\n- `feedback-widget-plugin-13.0.0.zip`: plugin\n',
    '13.1.0',
  );
  assert.match(after, /add-feedback-widget-13\.1\.0\.zip/);
  assert.match(after, /feedback-widget-plugin-13\.1\.0\.zip/);
  assert.doesNotMatch(after, /13\.0\.0/);
});

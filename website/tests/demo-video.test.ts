import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const media = new URL('../public/media/', import.meta.url);

test('demo video is a small, fast-start MP4 with a real poster', () => {
  const video = readFileSync(new URL('feedback-demo.mp4', media));
  assert.ok(video.length > 100_000 && video.length < 10 * 1024 * 1024);
  const atoms = new TextDecoder('latin1').decode(video);
  assert.equal(atoms.slice(4, 8), 'ftyp');
  assert.ok(atoms.indexOf('moov') > 0);
  assert.ok(atoms.indexOf('moov') < atoms.indexOf('mdat'));
  const poster = readFileSync(new URL('feedback-demo-poster.jpg', media));
  assert.equal(poster[0], 0xff);
  assert.equal(poster[1], 0xd8);
  assert.ok(
    statSync(new URL('feedback-demo-poster.jpg', media)).size < 200_000,
  );
});

test('English captions are ordered, readable, and cover the whole walkthrough', () => {
  const vtt = readFileSync(new URL('feedback-demo.en.vtt', media), 'utf8');
  assert.ok(vtt.startsWith('WEBVTT\n'));
  const time = (text: string) => {
    const [h, m, s] = text.split(':').map(Number);
    return h * 3600 + m * 60 + s;
  };
  let previousEnd = 0;
  const cues = vtt.trim().split('\n\n').slice(1);
  assert.ok(cues.length >= 14);
  for (const cue of cues) {
    const [, timing, ...lines] = cue.split('\n');
    const match = timing.match(/^(\S+) --> (\S+) line:90%$/);
    assert.ok(match);
    const start = time(match[1]);
    const end = time(match[2]);
    assert.ok(start >= previousEnd);
    assert.ok(end - start >= 1.3, `Caption is too brief: ${lines.join(' ')}`);
    assert.ok(lines.length <= 2);
    assert.ok(lines.every((line) => line.length <= 43));
    previousEnd = end;
  }
  assert.ok(previousEnd > 60 && previousEnd < 66);
});

test('demo is user-initiated and includes captions, a transcript, and a fallback', () => {
  const page = readFileSync(
    new URL('../app/page.tsx', import.meta.url),
    'utf8',
  );
  const video = page.match(/<video\b[\s\S]*?<\/video>/)?.[0];
  assert.ok(video);
  assert.match(video, /controls/);
  assert.match(video, /playsInline/);
  assert.match(video, /preload="none"/);
  assert.doesNotMatch(video, /autoPlay|autoplay/);
  assert.match(video, /kind="captions"/);
  assert.match(video, /Download the walkthrough/);
  assert.match(page, /Read the video transcript/);
  assert.match(page, /href="#demo"/);
});

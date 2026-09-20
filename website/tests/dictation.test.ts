import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  beginDictation,
  beginFieldDictation,
  insertDictation,
  speechConstructor,
  speechText,
  type SpeechEngine,
  type DictationState,
  type FieldDictationState,
} from '../lib/feedback-dictation.ts';

class FakeSpeech implements SpeechEngine {
  static latest: FakeSpeech;
  constructor() {
    FakeSpeech.latest = this;
  }
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onstart: SpeechEngine['onstart'] = null;
  onresult: SpeechEngine['onresult'] = null;
  onerror: SpeechEngine['onerror'] = null;
  onend: SpeechEngine['onend'] = null;
  started = false;
  stopped = false;
  aborted = false;
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
  abort() {
    this.aborted = true;
  }
}
const results = (...parts: [string, boolean][]) =>
  parts.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript } }));
test('detects prefixed and unprefixed recognition; unsupported is explicit', () => {
  assert.equal(speechConstructor({}), undefined);
  assert.equal(
    speechConstructor({ webkitSpeechRecognition: FakeSpeech }),
    FakeSpeech,
  );
  assert.equal(
    speechConstructor({ SpeechRecognition: FakeSpeech }),
    FakeSpeech,
  );
});
test('cumulative speech snapshots separate provisional words without duplication', () => {
  assert.deepEqual(speechText(results(['Hello', true], ['world', false])), {
    text: 'Hello',
    interim: 'world',
  });
  assert.deepEqual(speechText(results(['Hello', true], ['world', true])), {
    text: 'Hello world',
    interim: '',
  });
});
test('dictation is explicitly started, stops for final results, and retires callbacks', () => {
  const states: DictationState[] = [];
  const session = beginDictation(FakeSpeech, 'ar-SA', (s) => states.push(s));
  const engine = FakeSpeech.latest;
  assert.equal(engine.lang, 'ar-SA');
  assert.equal(engine.interimResults, true);
  assert.equal(engine.started, true);
  engine.onstart?.();
  engine.onresult?.({ results: results(['Hello', true], ['world', false]) });
  const stale = engine.onresult!;
  session.stop();
  assert.equal(engine.stopped, true);
  assert.equal(states.at(-1)?.phase, 'processing');
  engine.onresult?.({ results: results(['Hello', true], ['world', true]) });
  engine.onend?.();
  assert.equal(states.at(-1)?.text, 'Hello world');
  assert.equal(states.at(-1)?.phase, 'review');
  const count = states.length;
  stale({ results: results(['Unexpected', true]) });
  assert.equal(states.length, count);
});
test('cancel aborts and suppresses late speech events', () => {
  const states: DictationState[] = [];
  const session = beginDictation(FakeSpeech, 'en-US', (s) => states.push(s));
  const engine = FakeSpeech.latest,
    callback = engine.onresult!;
  session.abort();
  assert.equal(engine.aborted, true);
  const count = states.length;
  callback({ results: results(['Never insert this', true]) });
  assert.equal(states.length, count);
});
test('late microphone permission cannot resume a stopped session', () => {
  const states: DictationState[] = [];
  const session = beginDictation(FakeSpeech, 'en-US', (s) => states.push(s));
  session.stop();
  FakeSpeech.latest.onstart?.();
  assert.equal(states.at(-1)?.phase, 'processing');
  FakeSpeech.latest.onend?.();
});
test('start and stop failures release the microphone engine', () => {
  class FailedStart extends FakeSpeech {
    start() {
      throw new Error('Unavailable');
    }
  }
  class FailedStop extends FakeSpeech {
    stop() {
      throw new Error('Unavailable');
    }
  }
  const states: DictationState[] = [];
  beginDictation(FailedStart, 'en-US', (s) => states.push(s));
  assert.equal(FakeSpeech.latest.aborted, true);
  assert.equal(states.at(-1)?.phase, 'review');
  const session = beginDictation(FailedStop, 'en-US', (s) => states.push(s));
  session.stop();
  assert.equal(FakeSpeech.latest.aborted, true);
  assert.equal(states.at(-1)?.phase, 'review');
});
test('transcript storage is bounded and reaching its limit stops recognition', () => {
  const states: DictationState[] = [];
  beginDictation(FakeSpeech, 'en-US', (s) => states.push(s), {
    duration: 120000,
    settle: 5000,
    text: 10,
  });
  FakeSpeech.latest.onresult?.({
    results: results(['An overlong transcript', true]),
  });
  assert.equal(FakeSpeech.latest.stopped, true);
  assert.equal(states.at(-1)?.text.length, 10);
  assert.match(states.at(-1)!.error, /limit was reached/);
  FakeSpeech.latest.onend?.();
});
test('permission failure produces an actionable error, not a fabricated transcript', () => {
  const states: DictationState[] = [];
  beginDictation(FakeSpeech, 'en-US', (s) => states.push(s));
  FakeSpeech.latest.onerror?.({ error: 'not-allowed' });
  assert.match(states.at(-1)!.error, /permission was declined/);
  assert.equal(states.at(-1)?.text, '');
  assert.equal(FakeSpeech.latest.aborted, true);
});
test('stalled recognition times out and cleans up', async () => {
  const states: DictationState[] = [];
  beginDictation(FakeSpeech, 'en-US', (s) => states.push(s), {
    duration: 5,
    settle: 5,
    text: 8000,
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(states.at(-1)?.phase, 'review');
  assert.equal(FakeSpeech.latest.aborted, true);
  assert.match(states.at(-1)!.error, /stopped responding/);
});
test('insertion preserves existing text and selection boundaries', () => {
  assert.deepEqual(insertDictation('Hello world', 'beautiful', 6, 6, 120), {
    value: 'Hello beautiful world',
    caret: 16,
    fits: true,
  });
  assert.deepEqual(insertDictation('Hello old world', 'new', 6, 9, 120), {
    value: 'Hello new world',
    caret: 9,
    fits: true,
  });
  assert.equal(insertDictation('Hello', 'world', 5, 5, 10).fits, false);
  assert.equal(
    insertDictation('Hello', 'world', 5, 5, 10).value,
    'Hello world',
  );
  assert.equal(insertDictation('Hello.', 'new', -10, 100, 120).value, 'new');
});

test('direct dictation shows interim words in the original field without duplicates', () => {
  const states: FieldDictationState[] = [];
  const session = beginFieldDictation(
    FakeSpeech,
    'en-US',
    {
      value: 'Hello world',
      start: 6,
      end: 6,
      limit: 120,
    },
    (s) => states.push(s),
  );
  assert.equal(FakeSpeech.latest.started, true);
  assert.equal(states.at(-1)?.value, 'Hello world');
  FakeSpeech.latest.onresult?.({ results: results(['beautiful', false]) });
  assert.equal(states.at(-1)?.value, 'Hello beautiful world');
  FakeSpeech.latest.onresult?.({
    results: results(['beautiful', true], ['new', false]),
  });
  assert.equal(states.at(-1)?.value, 'Hello beautiful new world');
  session.stop();
  FakeSpeech.latest.onresult?.({ results: results(['beautiful new', true]) });
  FakeSpeech.latest.onend?.();
  assert.equal(states.at(-1)?.value, 'Hello beautiful new world');
  assert.equal(states.at(-1)?.phase, 'review');
});

test('empty or failed dictation never deletes the original selected text', () => {
  const states: FieldDictationState[] = [];
  beginFieldDictation(
    FakeSpeech,
    'en-US',
    {
      value: 'Keep these words',
      start: 0,
      end: 16,
      limit: 120,
    },
    (s) => states.push(s),
  );
  assert.equal(states.at(-1)?.value, 'Keep these words');
  FakeSpeech.latest.onerror?.({ error: 'not-allowed' });
  assert.equal(states.at(-1)?.value, 'Keep these words');
  assert.match(states.at(-1)!.error, /permission was declined/);
});

test('cancel restores the complete pre-dictation value and retires late events', () => {
  const states: FieldDictationState[] = [];
  const session = beginFieldDictation(
    FakeSpeech,
    'en-US',
    {
      value: 'Original report',
      start: 0,
      end: 8,
      limit: 120,
    },
    (s) => states.push(s),
  );
  FakeSpeech.latest.onresult?.({ results: results(['Changed', true]) });
  assert.equal(states.at(-1)?.value, 'Changed report');
  const late = FakeSpeech.latest.onresult!;
  session.cancel();
  assert.equal(states.at(-1)?.value, 'Original report');
  assert.equal(FakeSpeech.latest.aborted, true);
  const count = states.length;
  late({ results: results(['Too late', true]) });
  assert.equal(states.length, count);
});

test('dismissal keeps final words, drops provisional words, and immediately releases the mic', () => {
  const states: FieldDictationState[] = [];
  const session = beginFieldDictation(
    FakeSpeech,
    'en-US',
    {
      value: 'Report:',
      start: 7,
      end: 7,
      limit: 120,
    },
    (s) => states.push(s),
  );
  FakeSpeech.latest.onresult?.({
    results: results(['button', true], ['broken', false]),
  });
  session.finish();
  assert.equal(states.at(-1)?.value, 'Report: button');
  assert.equal(states.at(-1)?.phase, 'review');
  assert.equal(FakeSpeech.latest.aborted, true);
  const count = states.length;
  session.finish();
  assert.equal(states.length, count);
});

test('overflow stops recording and preserves the last fitting final text, without slicing a word', () => {
  const states: FieldDictationState[] = [];
  beginFieldDictation(
    FakeSpeech,
    'en-US',
    {
      value: 'Hi',
      start: 2,
      end: 2,
      limit: 12,
    },
    (s) => states.push(s),
  );
  FakeSpeech.latest.onresult?.({ results: results(['world', true]) });
  FakeSpeech.latest.onresult?.({
    results: results(['world', true], ['and everyone', true]),
  });
  assert.equal(states.at(-1)?.value, 'Hi world');
  assert.equal(FakeSpeech.latest.stopped, true);
  assert.match(states.at(-1)!.error, /didn’t fit/);
  FakeSpeech.latest.onend?.();
  assert.equal(states.at(-1)?.value, 'Hi world');
  assert.ok(states.every((s) => s.value.length <= 12));
});

test('provisional overflow does not replace a fitting final transcript or stop recognition early', () => {
  const states: FieldDictationState[] = [];
  beginFieldDictation(
    FakeSpeech,
    'en-US',
    {
      value: '',
      start: 0,
      end: 0,
      limit: 10,
    },
    (s) => states.push(s),
  );
  FakeSpeech.latest.onresult?.({
    results: results(['Hello', true], ['a very long guess', false]),
  });
  assert.equal(states.at(-1)?.value, 'Hello');
  assert.equal(FakeSpeech.latest.stopped, false);
  FakeSpeech.latest.onresult?.({ results: results(['Hello all', true]) });
  FakeSpeech.latest.onend?.();
  assert.equal(states.at(-1)?.value, 'Hello all');
});

test('unmount aborts without updating an unmounted field', () => {
  const states: FieldDictationState[] = [];
  const session = beginFieldDictation(
    FakeSpeech,
    'en-US',
    {
      value: '',
      start: 0,
      end: 0,
      limit: 120,
    },
    (s) => states.push(s),
  );
  const late = FakeSpeech.latest.onresult!;
  session.abort();
  const count = states.length;
  late({ results: results(['Late words', true]) });
  assert.equal(states.length, count);
  assert.equal(FakeSpeech.latest.aborted, true);
});

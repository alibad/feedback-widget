export type SpeechResults = ArrayLike<{
  isFinal: boolean;
  0: { transcript: string };
}>;
export type SpeechEngine = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: { results: SpeechResults }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
export type SpeechConstructor = new () => SpeechEngine;
export type DictationState = {
  phase: 'starting' | 'listening' | 'processing' | 'review';
  text: string;
  interim: string;
  error: string;
};

export function speechConstructor(
  scope: unknown,
): SpeechConstructor | undefined {
  const browser = scope as {
    SpeechRecognition?: SpeechConstructor;
    webkitSpeechRecognition?: SpeechConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

export function speechText(results: SpeechResults) {
  const final: string[] = [],
    interim: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const text = results[i][0]?.transcript?.trim();
    if (text) (results[i].isFinal ? final : interim).push(text);
  }
  return {
    text: final.join(' ').slice(0, 8000),
    interim: interim.join(' ').slice(0, 1000),
  };
}

const errors: Record<string, string> = {
  'not-allowed':
    'Microphone permission was declined. Allow it in your browser, then try again.',
  'service-not-allowed':
    'This browser has disabled its speech service. Try your device’s keyboard dictation or type instead.',
  'audio-capture':
    'No microphone is available. Check your microphone and try again.',
  'no-speech': 'No speech was detected. Try again when you’re ready.',
  network:
    'The speech service could not connect. Check your connection and try again.',
  'language-not-supported':
    'The speech service does not support that language. Choose another language.',
};

// Cumulative results replace the previous snapshot: interim updates must never
// duplicate words. A canceled or retired engine cannot update a later draft.
export function beginDictation(
  Engine: SpeechConstructor,
  language: string,
  emit: (state: DictationState) => void,
  limits = { duration: 120000, settle: 5000, text: 8000 },
) {
  const engine = new Engine();
  let retired = false;
  let state: DictationState = {
    phase: 'starting',
    text: '',
    interim: '',
    error: '',
  };
  let duration: ReturnType<typeof setTimeout> | undefined;
  let settle: ReturnType<typeof setTimeout> | undefined;
  const update = (next: Partial<DictationState>) => {
    if (!retired) {
      state = { ...state, ...next };
      emit(state);
    }
  };
  const cleanup = () => {
    clearTimeout(duration);
    clearTimeout(settle);
    engine.onstart = engine.onresult = engine.onerror = engine.onend = null;
  };
  const release = () => {
    try {
      engine.abort();
    } catch {
      /* Already stopped. */
    }
  };
  const finish = () => {
    if (retired) return;
    update({
      phase: 'review',
      interim: '',
      error:
        state.error ||
        (!state.text
          ? 'No speech was captured. Try again or type instead.'
          : ''),
    });
    retired = true;
    cleanup();
  };
  const stop = () => {
    if (retired || state.phase === 'processing') return;
    update({ phase: 'processing' });
    clearTimeout(duration);
    settle = setTimeout(() => {
      if (retired) return;
      update({
        error:
          'The speech service stopped responding. Review the captured words; the last words may be missing.',
      });
      finish();
      release();
    }, limits.settle);
    try {
      engine.stop();
    } catch {
      finish();
      release();
    }
  };
  engine.lang = language;
  engine.continuous = true;
  engine.interimResults = true;
  engine.maxAlternatives = 1;
  engine.onstart = () => {
    if (state.phase === 'starting') update({ phase: 'listening' });
  };
  engine.onresult = ({ results }) => {
    if (retired) return;
    const captured = speechText(results);
    const full = captured.text.length >= limits.text;
    update({
      ...captured,
      text: captured.text.slice(0, limits.text),
      ...(full && {
        error: 'The transcript limit was reached. Review the captured words.',
      }),
    });
    if (full) stop();
  };
  engine.onerror = ({ error }) => {
    update({
      error:
        errors[error] ??
        'Dictation stopped. Review any captured words and try again.',
    });
    finish();
    release();
  };
  engine.onend = finish;
  emit(state);
  duration = setTimeout(stop, limits.duration);
  try {
    engine.start();
  } catch {
    update({
      error:
        'Dictation could not start. Check microphone permission and try again.',
    });
    finish();
    release();
  }
  return {
    stop,
    abort() {
      retired = true;
      cleanup();
      release();
    },
  };
}

export function insertDictation(
  value: string,
  transcript: string,
  start: number,
  end: number,
  limit: number,
) {
  const a = Math.max(0, Math.min(start, value.length));
  const b = Math.max(a, Math.min(end, value.length));
  const text = transcript.trim();
  const left = value.slice(0, a),
    right = value.slice(b);
  const inserted =
    (left && text && !/\s$/.test(left) ? ' ' : '') +
    text +
    (right && text && !/^[\s.,!?;:]/.test(right) ? ' ' : '');
  const result = left + inserted + right;
  return {
    value: result,
    caret: left.length + inserted.length,
    fits: result.length <= limit,
  };
}

export type FieldDictationState = Pick<DictationState, 'phase' | 'error'> & {
  value: string;
  caret: number;
};

// Project cumulative recognition onto the original selection, not onto an
// earlier interim result. Only fitting, final words survive stop/dismissal.
export function beginFieldDictation(
  Engine: SpeechConstructor,
  language: string,
  draft: { value: string; start: number; end: number; limit: number },
  emit: (state: FieldDictationState) => void,
) {
  const original = { value: draft.value, caret: draft.start };
  let accepted = original;
  let retired = false;
  let overflow = false;
  let current: FieldDictationState = {
    ...original,
    phase: 'starting',
    error: '',
  };
  const engine = beginDictation(Engine, language, (next) => {
    if (retired) return;
    const project = (text: string) =>
      text.trim()
        ? insertDictation(
            draft.value,
            text,
            draft.start,
            draft.end,
            draft.limit,
          )
        : { ...original, fits: true };
    const final = project(next.text);
    if (final.fits && !overflow)
      accepted = { value: final.value, caret: final.caret };
    overflow ||= !final.fits;
    const live = project([next.text, next.interim].filter(Boolean).join(' '));
    const shown = !overflow && live.fits ? live : accepted;
    current = {
      value: shown.value,
      caret: shown.caret,
      phase: next.phase,
      error: overflow
        ? 'The last words didn’t fit and weren’t added. Shorten this field to dictate more.'
        : next.error,
    };
    emit(current);
    if (next.phase === 'review') retired = true;
    // Results arrive asynchronously, after the controller has been assigned.
    else if (overflow && next.phase !== 'processing') engine.stop();
  });
  return {
    stop: engine.stop,
    finish() {
      if (retired) return;
      retired = true;
      engine.abort();
      emit({ ...current, ...accepted, phase: 'review' });
    },
    cancel() {
      if (retired) return;
      retired = true;
      engine.abort();
      emit({ ...original, phase: 'review', error: '' });
    },
    abort() {
      retired = true;
      engine.abort();
    },
  };
}

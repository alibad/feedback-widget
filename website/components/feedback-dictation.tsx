'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { ChevronDown, Mic, Square, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  beginFieldDictation,
  speechConstructor,
  type FieldDictationState,
} from '@/lib/feedback-dictation';

type Field = 'title' | 'description';
const subscribeToBrowser = () => () => {};
const browserSpeechSupported = () => Boolean(speechConstructor(window));
const browserLanguage = () => navigator.language || 'en-US';
const serverSnapshot = () => null;
const languages = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'ar-SA', label: 'العربية' },
  { value: 'es-ES', label: 'Español' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'it-IT', label: 'Italiano' },
  { value: 'pt-BR', label: 'Português' },
  { value: 'hi-IN', label: 'हिन्दी' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'zh-CN', label: '中文' },
];

export function useFeedbackDictation(
  onChange: (field: Field, value: string) => void,
  onFocus: (field: Field, caret: number) => void,
) {
  const supported = useSyncExternalStore(
    subscribeToBrowser,
    browserSpeechSupported,
    serverSnapshot,
  );
  const locale = useSyncExternalStore(
    subscribeToBrowser,
    browserLanguage,
    serverSnapshot,
  );
  const [chosenLanguage, setLanguage] = useState<string | null>(null);
  const language = chosenLanguage ?? locale ?? 'en-US';
  const [state, setState] = useState<
    | (FieldDictationState & {
        field: Field;
        original: string;
        start: number;
      })
    | null
  >(null);
  const [seconds, setSeconds] = useState(0);
  const session = useRef<ReturnType<typeof beginFieldDictation> | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const callbacks = useRef({ onChange, onFocus });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onFocus };
  }, [onChange, onFocus]);
  const focusOnFinish = useRef(true);
  const activeSession = useRef(false);
  const active = Boolean(state && state.phase !== 'review');

  function finish() {
    focusOnFinish.current = false;
    session.current?.finish();
    activeSession.current = false;
    clearInterval(ticker.current);
  }
  useEffect(() => {
    const pause = () => {
      if (document.hidden) finish();
    };
    document.addEventListener('visibilitychange', pause);
    return () => {
      session.current?.abort();
      clearInterval(ticker.current);
      document.removeEventListener('visibilitychange', pause);
    };
  }, []);

  function startVoice(
    field: Field,
    value: string,
    selectionStart: number,
    end: number,
    limit: number,
  ) {
    if (activeSession.current) return;
    const Engine = speechConstructor(window);
    if (!Engine) return;
    session.current?.abort();
    clearInterval(ticker.current);
    focusOnFinish.current = true;
    const base = { field, original: value, start: selectionStart };
    if (value.length >= limit && selectionStart === end) {
      setState({
        ...base,
        value,
        caret: selectionStart,
        phase: 'review',
        error:
          'This field is full. Shorten it or select text to replace before dictating.',
      });
      return;
    }
    setSeconds(0);
    activeSession.current = true;
    ticker.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    try {
      session.current = beginFieldDictation(
        Engine,
        language,
        { value, start: selectionStart, end, limit },
        (next) => {
          setState({ ...base, ...next });
          callbacks.current.onChange(field, next.value);
          if (next.phase === 'review') {
            activeSession.current = false;
            clearInterval(ticker.current);
            if (focusOnFinish.current)
              callbacks.current.onFocus(field, next.caret);
          }
        },
      );
    } catch {
      activeSession.current = false;
      clearInterval(ticker.current);
      setState({
        ...base,
        value,
        caret: selectionStart,
        phase: 'review',
        error:
          'Voice input is unavailable. Use keyboard dictation or type instead.',
      });
    }
  }
  function undo() {
    if (!state || active) return;
    callbacks.current.onChange(state.field, state.original);
    callbacks.current.onFocus(state.field, state.start);
    setState(null);
  }
  return {
    supported,
    language,
    setLanguage,
    state,
    seconds,
    active,
    start: startVoice,
    finish,
    undo,
    stop: () => session.current?.stop(),
    cancel: () => session.current?.cancel(),
    edited: (field: Field) => {
      // Undo must never erase typing that happened after the voice session.
      if (state?.field === field && !active) setState(null);
    },
    reset: () => {
      session.current?.abort();
      activeSession.current = false;
      clearInterval(ticker.current);
      setState(null);
    },
  };
}

type Voice = ReturnType<typeof useFeedbackDictation>;

export function DictationOptions({
  voice,
  container,
}: {
  voice: Voice;
  container: RefObject<HTMLDialogElement | null>;
}) {
  const options = languages.some((l) => l.value === voice.language)
    ? languages
    : [{ value: voice.language, label: voice.language }, ...languages];
  return (
    <div className="feedback-voice-help" id="feedback-voice-help">
      <p>
        {voice.supported === false
          ? 'Voice input isn’t supported here. Use your keyboard’s microphone or type instead.'
          : 'Tap a mic to type by voice. Your browser may process audio through its speech service.'}
      </p>
      {voice.supported && (
        <details className="feedback-voice-options">
          <summary>
            Voice options <ChevronDown size={14} />
          </summary>
          <div>
            <label htmlFor="feedback-voice-language">Language</label>
            <Select
              value={voice.language}
              items={options}
              disabled={voice.active}
              onValueChange={(v) => v && voice.setLanguage(v)}
            >
              <SelectTrigger id="feedback-voice-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={container} alignItemWithTrigger={false}>
                {options.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p>
            No audio attachment is saved. Only your report text is sent when you
            publish. Each session stops after two minutes.
          </p>
        </details>
      )}
    </div>
  );
}

export function DictationButton({
  voice,
  field,
  disabled,
  onStart,
}: {
  voice: Voice;
  field: Field;
  disabled: boolean;
  onStart: () => void;
}) {
  const active = voice.active && voice.state?.field === field;
  const label = field === 'title' ? 'Summary' : 'What happened';
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={'feedback-voice-button' + (active ? ' is-listening' : '')}
      data-tooltip={active ? 'Stop' : 'Dictate'}
      aria-label={active ? 'Stop dictating ' + label : 'Dictate ' + label}
      aria-describedby="feedback-voice-help"
      title={
        active
          ? 'Stop dictation'
          : voice.supported === false
            ? 'Use keyboard dictation in this browser'
            : 'Dictate ' + label
      }
      disabled={
        disabled ||
        !voice.supported ||
        (voice.active && !active) ||
        (active && voice.state?.phase === 'processing')
      }
      onClick={active ? voice.stop : onStart}
    >
      <span className="feedback-voice-button-surface" aria-hidden="true">
        {active ? (
          <Square size={8} fill="currentColor" strokeWidth={0} />
        ) : (
          <Mic size={12} strokeWidth={2} />
        )}
      </span>
    </Button>
  );
}

export function DictationStatus({
  voice,
  field,
}: {
  voice: Voice;
  field: Field;
}) {
  const state = voice.state?.field === field ? voice.state : null;
  if (!state) return null;
  return (
    <div className="feedback-voice-status">
      <output className={state.error ? 'feedback-error' : undefined}>
        {state.error ||
          (state.phase === 'starting'
            ? 'Allow your microphone to begin…'
            : state.phase === 'listening'
              ? 'Listening…'
              : state.phase === 'processing'
                ? 'Finishing…'
                : state.value !== state.original
                  ? 'Voice added. Edit anything.'
                  : 'No changes made.')}
      </output>
      {voice.active ? (
        <>
          <span className="feedback-voice-time" aria-hidden="true">
            {Math.floor(voice.seconds / 60)}:
            {String(voice.seconds % 60).padStart(2, '0')}
          </span>
          <Button
            type="button"
            variant="ghost"
            className="feedback-voice-text-button"
            onClick={voice.cancel}
          >
            Cancel
          </Button>
        </>
      ) : (
        state.value !== state.original && (
          <Button
            type="button"
            variant="ghost"
            className="feedback-voice-text-button"
            onClick={voice.undo}
          >
            <Undo2 size={14} /> Undo
          </Button>
        )
      )}
    </div>
  );
}

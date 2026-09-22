'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  ArrowRight,
  Camera,
  CheckCheck,
  ChevronDown,
  FilePlus,
  MessageSquare,
  Mic,
  Minus,
  MousePointer2,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Video,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FeedbackAnnotator } from './feedback-annotator';
import {
  DictationButton,
  DictationOptions,
  DictationStatus,
  useFeedbackDictation,
} from './feedback-dictation';
import {
  feedbackAccessSchema,
  feedbackResultSchema,
  feedbackCategories,
  feedbackSchema,
  normalizeFeedback,
  redactFeedback,
  type FeedbackInput,
} from '@/lib/feedback-contract';
import {
  CAPTURE_LIMIT,
  REPORT_LIMIT,
  frameBlob,
  recordingMime,
  safeSelection,
  feedbackElementAtPoint,
  type DraftMedia,
  type Selection,
} from '@/lib/feedback-capture';

type Access = {
  authenticated: boolean;
  available: boolean;
  mediaAvailable?: boolean;
};
type Receipt = { issueUrl: string; submissionId: string };
type Diagnostic = { level: 'warn' | 'error'; message: string; at: string };
const messages: Record<string, string> = {
  unauthorized:
    'Sign in with ChatGPT before sending. Your draft is still here.',
  forbidden: 'Open this form on feedback.humanquest.net and try again.',
  invalid_request: 'Check the report length and required fields.',
  invalid_attachments:
    'An attachment expired or could not be attached. Edit the report and retry.',
  payload_too_large: 'This report is too large.',
  rate_limited:
    'The feedback limit has been reached. Try again later; daily site limits also apply.',
  setup_required: 'The GitHub connection is not ready. Nothing was sent.',
  submission_failed:
    'We could not confirm delivery. Keep this report and check delivery.',
  submission_pending:
    'Delivery is still being confirmed. Use Check delivery for this same report.',
  idempotency_conflict:
    'The saved submission differs. Keep the receipt and contact the maintainer.',
};

export function FeedbackWidget() {
  const dialog = useRef<HTMLDialogElement>(null),
    dialogBody = useRef<HTMLDivElement>(null),
    reviewHeading = useRef<HTMLHeadingElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    root = useRef<HTMLDivElement>(null);
  const titleInput = useRef<HTMLInputElement>(null),
    descriptionInput = useRef<HTMLTextAreaElement>(null);
  const selectionTarget = useRef<Element | null>(null),
    pointerStart = useRef<{ x: number; y: number } | null>(null);
  const mounted = useRef(true),
    generation = useRef(0),
    streams = useRef<MediaStream[]>([]),
    recorder = useRef<MediaRecorder | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    recordCanceled = useRef(false),
    capturing = useRef(false),
    pending = useRef(false);
  const mediaRef = useRef<DraftMedia[]>([]),
    logs = useRef<Diagnostic[]>([]),
    stopLogs = useRef<(() => void) | null>(null),
    frozen = useRef<FeedbackInput | null>(null),
    key = useRef('');
  const [access, setAccess] = useState<Access | null>(null),
    [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [category, setCategory] =
      useState<keyof typeof feedbackCategories>('general'),
    [consent, setConsent] = useState(false);
  const [media, setMedia] = useState<DraftMedia[]>([]),
    [selections, setSelections] = useState<Selection[]>([]),
    [annotating, setAnnotating] = useState<string | null>(null),
    [selectionMode, setSelectionMode] = useState(false),
    [highlight, setHighlight] = useState<{
      left: number;
      top: number;
      width: number;
      height: number;
    } | null>(null);
  const [selectionHint, setSelectionHint] = useState(
    'Point at an element, then click or tap. Scroll to reach more.',
  );
  const [recording, setRecording] = useState<'audio' | 'video' | null>(null),
    [seconds, setSeconds] = useState(0),
    [captureBusy, setCaptureBusy] = useState(false),
    [micEnabled, setMicEnabled] = useState(true),
    [minimized, setMinimized] = useState(false),
    [desktop, setDesktop] = useState(false);
  const [viewport, setViewport] = useState(true),
    [collectLogs, setCollectLogs] = useState(true),
    [diagnosticsActive, setDiagnosticsActive] = useState(false),
    [diagnostics, setDiagnostics] = useState(''),
    [confirm, setConfirm] = useState<{
      label: string;
      action: () => void;
    } | null>(null);
  const [reviewing, setReviewing] = useState(false),
    [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false),
    [error, setError] = useState(''),
    [progress, setProgress] = useState(''),
    [receipt, setReceipt] = useState<Receipt | null>(null),
    [submissionId, setSubmissionId] = useState('');
  const voice = useFeedbackDictation(
    (field, value) => {
      if (field === 'title') setTitle(value);
      else setDescription(value);
      key.current = '';
    },
    (field, caret) => {
      requestAnimationFrame(() => {
        if (!dialog.current?.open) return;
        const input =
          field === 'title' ? titleInput.current : descriptionInput.current;
        input?.focus();
        input?.setSelectionRange(caret, caret);
      });
    },
  );
  const report = normalizeFeedback({
    title,
    description,
    category,
    consent: true,
    idempotencyKey: key.current,
  });
  useEffect(() => {
    if (dialogBody.current) dialogBody.current.scrollTop = 0;
    if (reviewing && !confirm && !receipt)
      reviewHeading.current?.focus({ preventScroll: true });
  }, [reviewing, confirm, receipt]);
  function updateMedia(next: DraftMedia[]) {
    mediaRef.current = next;
    setMedia(next);
  }
  function releaseMedia() {
    for (const item of mediaRef.current) URL.revokeObjectURL(item.url);
    updateMedia([]);
  }
  function stopTracks() {
    streams.current.forEach((stream) =>
      stream.getTracks().forEach((track) => track.stop()),
    );
    streams.current = [];
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }
  function stopRecording(cancel = false) {
    recordCanceled.current = cancel;
    if (recorder.current && recorder.current.state !== 'inactive')
      recorder.current.stop();
    stopTracks();
  }
  function restoreDialog() {
    if (mounted.current) {
      setMinimized(false);
      if (!dialog.current?.open) dialog.current?.showModal();
    }
  }
  async function open() {
    restoreDialog();
    setDiagnosticsActive(true);
    setError('');
    try {
      const response = await fetch('/api/feedback', {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error();
      if (mounted.current)
        setAccess(feedbackAccessSchema.parse(await response.json()));
    } catch {
      setError('Could not check the connection. Reopen this form to retry.');
    }
  }
  function minimize() {
    voice.finish();
    dialog.current?.close();
    setMinimized(true);
  }
  function closeNow() {
    generation.current++;
    stopRecording(true);
    stopLogs.current?.();
    stopLogs.current = null;
    setDiagnosticsActive(false);
    setMicEnabled(true);
    setCollectLogs(true);
    logs.current = [];
    setSelectionMode(false);
    voice.finish();
    setAnnotating(null);
    releaseMedia();
    setSelections([]);
    setDiagnostics('');
    setViewport(true);
    setReviewing(false);
    setConsent(false);
    setConfirm(null);
    setReceipt(null);
    setSubmissionId('');
    key.current = '';
    frozen.current = null;
    dialog.current?.close();
    setMinimized(false);
    trigger.current?.focus();
  }
  function close() {
    voice.finish();
    if (busy || locked) {
      minimize();
      return;
    }
    if (mediaRef.current.length || recording || captureBusy) {
      setConfirm({
        label:
          'Close and discard captures? Your report text stays here, but unsent captures will be removed.',
        action: closeNow,
      });
      return;
    }
    closeNow();
  }
  useEffect(() => {
    mounted.current = true;
    setDesktop(
      window.matchMedia('(min-width: 700px) and (pointer:fine)').matches,
    );
    return () => {
      mounted.current = false;
      generation.current++;
      recordCanceled.current = true;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stopTracks();
      stopLogs.current?.();
      mediaRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, []);
  useEffect(() => {
    if (!selectionMode) return;
    const clearTarget = () => {
      selectionTarget.current = null;
      setHighlight(null);
    };
    window.addEventListener('scroll', clearTarget, true);
    window.addEventListener('resize', clearTarget);
    return () => {
      window.removeEventListener('scroll', clearTarget, true);
      window.removeEventListener('resize', clearTarget);
    };
  }, [selectionMode]);
  useEffect(() => {
    if (!collectLogs || !diagnosticsActive) return;
    const originals = { warn: console.warn, error: console.error };
    const replacements = {} as typeof originals;
    for (const level of ['warn', 'error'] as const) {
      replacements[level] = (...args: unknown[]) => {
        originals[level](...args);
        const message = redactFeedback(
          args
            .map((arg) =>
              typeof arg === 'string' ? arg : '[non-text value omitted]',
            )
            .join(' '),
        ).slice(0, 500);
        logs.current = [
          ...logs.current,
          { level, message, at: new Date().toISOString() },
        ].slice(-20);
      };
      console[level] = replacements[level];
    }
    const stop = () => {
      for (const level of ['warn', 'error'] as const)
        if (console[level] === replacements[level])
          console[level] = originals[level];
    };
    stopLogs.current = stop;
    return () => {
      stop();
      stopLogs.current = null;
    };
  }, [collectLogs, diagnosticsActive]);
  function addMedia(
    blob: Blob,
    kind: DraftMedia['kind'],
    label: string,
    extra: Partial<DraftMedia> = {},
  ) {
    if (blob.size > CAPTURE_LIMIT) {
      setError(
        'That capture exceeds 10 MB. Record a shorter clip or use a smaller image.',
      );
      return;
    }
    if (
      mediaRef.current.length >= 8 ||
      mediaRef.current.reduce((n, m) => n + m.blob.size, 0) + blob.size >
        REPORT_LIMIT
    ) {
      setError('Use at most 8 attachments and 25 MB per report.');
      return;
    }
    if (
      (kind === 'audio' || kind === 'video') &&
      mediaRef.current.some((m) => m.kind === kind)
    ) {
      setError(`Remove the existing ${kind} before adding another.`);
      return;
    }
    if (
      kind === 'file' &&
      mediaRef.current.filter((m) => m.kind === 'file').length >= 5
    ) {
      setError('Use at most 5 text files.');
      return;
    }
    if (
      kind === 'image' &&
      mediaRef.current.filter((m) => m.kind === 'image').length +
        selections.length >=
        8
    ) {
      setError('Use at most 8 screenshots and selections.');
      return;
    }
    updateMedia([
      ...mediaRef.current,
      {
        id: crypto.randomUUID(),
        kind,
        blob,
        url: URL.createObjectURL(blob),
        label,
        ...extra,
      },
    ]);
    key.current = '';
  }
  function removeMedia(item: DraftMedia) {
    const action = () => {
      URL.revokeObjectURL(item.url);
      updateMedia(mediaRef.current.filter((m) => m.id !== item.id));
      key.current = '';
      if (item.attachmentId)
        void fetch(`/api/feedback/media/${item.attachmentId}`, {
          method: 'DELETE',
        }).catch(() => {});
    };
    if (item.kind === 'audio' || item.kind === 'video')
      setConfirm({
        label: `Delete this ${item.kind} recording? This cannot be undone.`,
        action,
      });
    else action();
  }
  async function screenshot(extra: Partial<DraftMedia> = {}) {
    if (capturing.current || recorder.current) return;
    capturing.current = true;
    setCaptureBusy(true);
    setError('');
    minimize();
    const current = generation.current;
    const oldVisibility = root.current?.style.visibility ?? '';
    if (root.current) root.current.style.visibility = 'hidden';
    try {
      if (!navigator.mediaDevices?.getDisplayMedia)
        throw new Error(
          'This browser cannot capture a screen. Attach an image instead.',
        );
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions);
      streams.current.push(stream);
      if (current !== generation.current) {
        stopTracks();
        return;
      }
      const blob = await frameBlob(stream);
      if (current === generation.current && mounted.current)
        addMedia(blob, 'image', 'Screenshot', extra);
    } catch (e) {
      if (current === generation.current)
        setError(
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'Screen capture canceled. Your report is unchanged.'
            : e instanceof DOMException && e.name === 'InvalidStateError'
              ? 'Bring this browser tab to the foreground, then try Screenshot again.'
              : e instanceof Error
                ? e.message
                : 'Screen capture failed.',
        );
    } finally {
      stopTracks();
      capturing.current = false;
      if (root.current) root.current.style.visibility = oldVisibility;
      if (mounted.current) {
        setCaptureBusy(false);
        if (current === generation.current) restoreDialog();
      }
    }
  }
  async function startRecording(kind: 'audio' | 'video') {
    if (capturing.current || recorder.current) return;
    capturing.current = true;
    setCaptureBusy(true);
    setError('');
    const current = generation.current;
    recordCanceled.current = false;
    let owned: MediaStream[] = [];
    try {
      if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined')
        throw new Error(
          'Recording is unavailable in this browser. Attach an existing file instead.',
        );
      if (kind === 'video') {
        if (!navigator.mediaDevices.getDisplayMedia)
          throw new Error(
            'Screen recording is unavailable. Attach an existing video instead.',
          );
        minimize();
        owned.push(
          await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: 15 },
            audio: false,
            preferCurrentTab: true,
          } as DisplayMediaStreamOptions),
        );
        streams.current = owned;
        if (current !== generation.current) {
          stopTracks();
          return;
        }
        if (micEnabled) {
          owned.push(
            await navigator.mediaDevices.getUserMedia({ audio: true }),
          );
          streams.current = owned;
        }
      } else {
        owned.push(await navigator.mediaDevices.getUserMedia({ audio: true }));
        streams.current = owned;
      }
      if (current !== generation.current) {
        stopTracks();
        return;
      }
      const combined = new MediaStream(owned.flatMap((s) => s.getTracks()));
      const mime = recordingMime(kind);
      const rec = new MediaRecorder(combined, {
        ...(mime ? { mimeType: mime } : {}),
        ...(kind === 'video' ? { videoBitsPerSecond: 1_000_000 } : {}),
        audioBitsPerSecond: 64_000,
      });
      recorder.current = rec;
      const chunks: Blob[] = [];
      let size = 0;
      let failed = false;
      const start = Date.now();
      setSeconds(0);
      setRecording(kind);
      rec.ondataavailable = (e) => {
        if (e.data.size) {
          size += e.data.size;
          if (size <= CAPTURE_LIMIT) chunks.push(e.data);
          else {
            failed = true;
            setError(
              'Recording exceeded 10 MB. Please make a shorter recording.',
            );
            stopRecording(true);
          }
        }
      };
      rec.onerror = () => {
        failed = true;
        setError('Recording failed. Your report is unchanged.');
        stopRecording(true);
      };
      rec.onstop = () => {
        stopTracks();
        recorder.current = null;
        capturing.current = false;
        if (!mounted.current) return;
        setRecording(null);
        setCaptureBusy(false);
        if (current !== generation.current) return;
        if (!recordCanceled.current && !failed && chunks.length)
          addMedia(
            new Blob(chunks, { type: rec.mimeType }),
            kind,
            kind === 'video' ? 'Screen recording' : 'Voice note',
          );
        restoreDialog();
      };
      combined.getVideoTracks().forEach((track) =>
        track.addEventListener('ended', () => stopRecording(), {
          once: true,
        }),
      );
      rec.start(250);
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - start) / 1000);
        setSeconds(elapsed);
        if (elapsed >= (kind === 'video' ? 60 : 600)) stopRecording();
      }, 250);
    } catch (e) {
      owned.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      stopTracks();
      capturing.current = false;
      recorder.current = null;
      if (mounted.current) {
        setCaptureBusy(false);
        setRecording(null);
        setError(
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'Permission was declined. Nothing was recorded.'
            : e instanceof Error
              ? e.message
              : 'Recording could not start.',
        );
        if (current === generation.current) restoreDialog();
      }
    }
  }
  async function attach(files: FileList | null) {
    const current = generation.current;
    for (const file of Array.from(files ?? [])) {
      let kind: DraftMedia['kind'];
      let blob: Blob = file;
      const mime = file.type.split(';')[0];
      if (['image/png', 'image/jpeg', 'image/webp'].includes(mime))
        kind = 'image';
      else if (['video/webm', 'video/mp4'].includes(mime)) kind = 'video';
      else if (
        [
          'audio/webm',
          'audio/mp4',
          'audio/x-m4a',
          'audio/ogg',
          'audio/wav',
        ].includes(mime)
      )
        kind = 'audio';
      else if (
        mime === 'text/plain' ||
        (!mime && file.name.toLowerCase().endsWith('.txt'))
      ) {
        kind = 'file';
        if (file.size > 100000) {
          setError('Text attachments are limited to 100 KB.');
          continue;
        }
        blob = new Blob([redactFeedback(await file.text())], {
          type: 'text/plain',
        });
      } else {
        setError(
          'Choose PNG, JPG, WebP, WebM, MP4, M4A, OGG, WAV, or a plain-text file.',
        );
        continue;
      }
      if (current === generation.current)
        addMedia(
          blob,
          kind,
          kind === 'file' ? 'Redacted text attachment' : `Attached ${kind}`,
        );
    }
    if (fileInput.current) fileInput.current.value = '';
  }
  function beginSelection() {
    if (
      selections.length +
        mediaRef.current.filter((m) => m.kind === 'image').length >=
      8
    ) {
      setError('Use at most 8 screenshots and selections.');
      return;
    }
    minimize();
    selectionTarget.current = null;
    pointerStart.current = null;
    setSelectionMode(true);
    setSelectionHint(
      'Point at an element, then click or tap. Scroll to reach more.',
    );
    setHighlight(null);
  }
  function selectPoint(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (e.type === 'pointerdown') {
      pointerStart.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const overlay = e.currentTarget;
    overlay.style.pointerEvents = 'none';
    let selected: ReturnType<typeof safeSelection>;
    try {
      selected = safeSelection(
        feedbackElementAtPoint(document, e.clientX, e.clientY),
      );
    } finally {
      overlay.style.pointerEvents = '';
    }
    if (!selected) {
      setHighlight(null);
      selectionTarget.current = null;
      setSelectionHint(
        'Choose page content outside the feedback controls or a protected area.',
      );
      return;
    }
    selectionTarget.current = selected.target;
    setSelectionHint(selected.info);
    const rect = selected.target.getBoundingClientRect();
    setHighlight({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
  }
  function commitSelection(
    selected: NonNullable<ReturnType<typeof safeSelection>>,
    x: number,
    y: number,
  ) {
    const selection = {
      id: crypto.randomUUID(),
      elementInfo: selected.info,
      position: {
        x: Math.max(0, Math.min(20000, Math.round(x))),
        y: Math.max(0, Math.min(20000, Math.round(y))),
      },
    };
    setSelectionMode(false);
    setHighlight(null);
    key.current = '';
    setSelections((s) => [...s, selection]);
    restoreDialog();
  }
  function dictate(field: 'title' | 'description') {
    const input =
      field === 'title' ? titleInput.current : descriptionInput.current;
    const value = field === 'title' ? title : description;
    if (captureBusy || capturing.current || voice.active) return;
    voice.start(
      field,
      value,
      input?.selectionStart ?? value.length,
      input?.selectionEnd ?? value.length,
      field === 'title' ? 120 : 4000,
    );
  }
  function review(event: React.FormEvent) {
    event.preventDefault();
    if (capturing.current || voice.active) {
      setError('Finish recording or dictation before reviewing.');
      return;
    }
    if (!key.current) key.current = crypto.randomUUID();
    const result = feedbackSchema.safeParse({
      title,
      description,
      category,
      consent,
      idempotencyKey: key.current,
    });
    if (!result.success || report.description.length < 10) {
      setError('Add a description and confirm the public report.');
      return;
    }
    stopLogs.current?.();
    stopLogs.current = null;
    setCollectLogs(false);
    const ua = navigator.userAgent;
    const data = {
      ...(viewport
        ? {
            viewport: {
              width: innerWidth,
              height: innerHeight,
              dpr: devicePixelRatio,
            },
            client: {
              browser: ua.includes('Edg/')
                ? 'Edge'
                : ua.includes('Chrome/')
                  ? 'Chrome'
                  : ua.includes('Firefox/')
                    ? 'Firefox'
                    : ua.includes('Safari/')
                      ? 'Safari'
                      : 'Other',
              appVersion: '13.0.0',
            },
          }
        : {}),
      ...(logs.current.length ? { console: logs.current } : {}),
    };
    setDiagnostics(
      Object.keys(data).length ? JSON.stringify(data, null, 2) : '',
    );
    setError('');
    setReviewing(true);
  }
  async function upload(blob: Blob, kind: string) {
    const response = await fetch('/api/feedback/media', {
      method: 'POST',
      headers: { 'Content-Type': blob.type, 'X-Feedback-Kind': kind },
      body: blob,
      signal: AbortSignal.timeout(30000),
    });
    const data = z
      .object({ success: z.boolean(), id: z.uuid().optional() })
      .parse(await response.json());
    if (
      !response.ok ||
      !data.success ||
      typeof data.id !== 'string' ||
      !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(data.id)
    )
      throw new Error(
        response.status === 429
          ? messages.rate_limited
          : 'An attachment could not be uploaded. Your draft is intact; try again.',
      );
    return data.id as string;
  }
  async function submit() {
    if (pending.current || receipt) return;
    pending.current = true;
    setBusy(true);
    setError('');
    let issueAttempted = false;
    try {
      if (!frozen.current) {
        const list = mediaRef.current;
        if (list.length + (diagnostics ? 1 : 0) > 8)
          throw new Error('Keep attachments and diagnostics to 8 items total.');
        if ((list.length || diagnostics) && !access?.mediaAvailable)
          throw new Error(
            'Private media storage is not connected yet. Nothing was sent.',
          );
        for (let i = 0; i < list.length; i++) {
          setProgress(
            `Uploading private attachment ${i + 1} of ${list.length}…`,
          );
          if (!list[i].attachmentId)
            list[i].attachmentId = await upload(list[i].blob, list[i].kind);
        }
        let diagnosticsAttachmentId: string | undefined;
        if (diagnostics) {
          setProgress('Uploading reviewed diagnostics…');
          diagnosticsAttachmentId = await upload(
            new Blob([diagnostics], { type: 'application/json' }),
            'diagnostics',
          );
        }
        frozen.current = {
          ...report,
          consent: true,
          idempotencyKey: key.current,
          captures: [
            ...list
              .filter((m) => m.kind === 'image')
              .map((m) => ({
                attachmentId: m.attachmentId,
                elementInfo: m.elementInfo,
                position: m.position,
              })),
            ...selections.map(({ elementInfo, position }) => ({
              elementInfo,
              position,
            })),
          ],
          videoAttachmentId: list.find((m) => m.kind === 'video')?.attachmentId,
          audioAttachmentId: list.find((m) => m.kind === 'audio')?.attachmentId,
          attachments: list
            .filter((m) => m.kind === 'file')
            .map((m) => ({ id: m.attachmentId! })),
          diagnosticsAttachmentId,
        };
      }
      setLocked(true);
      issueAttempted = true;
      setProgress('Creating your GitHub issue…');
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(frozen.current),
        signal: AbortSignal.timeout(20000),
      });
      const result = feedbackResultSchema.parse(await response.json());
      if (result.success) {
        setReceipt(result);
        voice.reset();
        setTitle('');
        setDescription('');
        setConsent(false);
        releaseMedia();
        setSelections([]);
        setDiagnostics('');
        logs.current = [];
        setLocked(false);
        frozen.current = null;
      } else {
        setError(messages[result.code] ?? messages.submission_failed);
        setSubmissionId(result.submissionId ?? '');
        if (
          [
            'invalid_request',
            'invalid_attachments',
            'payload_too_large',
            'rate_limited',
            'setup_required',
            'unauthorized',
            'forbidden',
          ].includes(result.code) ||
          (response.status === 502 && result.code === 'submission_failed')
        ) {
          setLocked(false);
          frozen.current = null;
          if (result.code === 'invalid_attachments')
            updateMedia(
              mediaRef.current.map((m) => ({ ...m, attachmentId: undefined })),
            );
        }
      }
    } catch (e) {
      setError(
        issueAttempted
          ? 'The connection was interrupted. Your report may have been sent. Use Check delivery for this same report.'
          : e instanceof Error
            ? e.message
            : 'Upload failed. Your draft is still here.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
      setProgress('');
    }
  }
  const annotation = media.find((m) => m.id === annotating);
  const previews = (
    <div className="feedback-captures">
      {media.map((item) => (
        <article className="feedback-capture" key={item.id}>
          <strong>{item.label}</strong>
          {item.kind === 'image' ? (
            <img src={item.url} alt="Screenshot selected for this report" />
          ) : item.kind === 'video' ? (
            <video src={item.url} controls playsInline preload="metadata" />
          ) : item.kind === 'audio' ? (
            <audio src={item.url} controls preload="metadata" />
          ) : (
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              Review redacted text
            </a>
          )}
          {item.elementInfo && <p>{item.elementInfo}</p>}
          <small>
            {(item.blob.size / 1024 / 1024).toFixed(2)} MB · private attachment
          </small>
          {!reviewing && (
            <div className="feedback-actions">
              {item.kind === 'image' && desktop && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    dialog.current?.close();
                    setAnnotating(item.id);
                  }}
                >
                  Annotate
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => removeMedia(item)}
              >
                Remove
              </Button>
            </div>
          )}
        </article>
      ))}
      {selections.map((item) => (
        <article className="feedback-capture" key={item.id}>
          <strong>Selected element</strong>
          <p>{item.elementInfo}</p>
          <small>
            Element structure and position only · no page text or field values
          </small>
          {!reviewing && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setSelections((s) => s.filter((x) => x.id !== item.id))
              }
            >
              Remove selection
            </Button>
          )}
        </article>
      ))}
    </div>
  );
  return (
    <>
      <div id="feedback-widget-root" ref={root}>
        <Button
          ref={trigger}
          onClick={open}
          className="feedback-launcher"
          aria-haspopup="dialog"
        >
          <MessageSquare size={19} />
          {minimized ? 'Resume feedback' : 'Give feedback'}
        </Button>
        {recording && (
          <div className="feedback-recording" role="status">
            <span className="recording-dot" />
            {recording === 'video'
              ? 'Recording screen'
              : 'Recording voice'} ·{' '}
            {seconds}s / {recording === 'video' ? 60 : 600}s
            <Button onClick={() => stopRecording()}>
              <Square size={14} /> Stop & review
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                restoreDialog();
                setConfirm({
                  label: 'Discard this recording and stop sharing?',
                  action: () => stopRecording(true),
                });
              }}
            >
              Discard
            </Button>
          </div>
        )}
        {selectionMode && (
          <>
            <div className="feedback-selection-toolbar" role="status">
              <span className="feedback-selection-hint">
                {selectionHint}
                <small>
                  Tab: next element · Enter: select · Esc: cancel. No text or
                  values collected.
                </small>
              </span>
              <Button
                onClick={() => {
                  setSelectionMode(false);
                  setHighlight(null);
                  restoreDialog();
                }}
              >
                Cancel selection
              </Button>
            </div>
            <div
              className="feedback-selection-overlay"
              onPointerMove={selectPoint}
              onPointerDown={selectPoint}
              onPointerUp={selectPoint}
              onClick={(e) => {
                // Consume the click before removing the overlay, so choosing
                // a link or button never activates the underlying page.
                e.preventDefault();
                e.stopPropagation();
                const start = pointerStart.current;
                pointerStart.current = null;
                const selected = safeSelection(selectionTarget.current);
                if (
                  start &&
                  selected &&
                  Math.hypot(e.clientX - start.x, e.clientY - start.y) <= 10
                )
                  commitSelection(selected, e.clientX, e.clientY);
              }}
              onPointerCancel={() => {
                pointerStart.current = null;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setSelectionMode(false);
                  restoreDialog();
                }
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const choices = Array.from(
                    document.querySelectorAll('body *'),
                  ).filter((el) => {
                    const r = el.getBoundingClientRect();
                    return (
                      r.width > 0 &&
                      r.height > 0 &&
                      r.top < innerHeight &&
                      r.bottom > 0 &&
                      r.left < innerWidth &&
                      r.right > 0 &&
                      getComputedStyle(el).visibility !== 'hidden' &&
                      safeSelection(el)
                    );
                  });
                  const index = choices.indexOf(selectionTarget.current!);
                  const target =
                    choices[
                      index < 0
                        ? e.shiftKey
                          ? choices.length - 1
                          : 0
                        : (index + (e.shiftKey ? -1 : 1) + choices.length) %
                          choices.length
                    ];
                  const selected = safeSelection(target ?? null);
                  if (selected) {
                    selectionTarget.current = target;
                    const r = target.getBoundingClientRect();
                    setHighlight({
                      left: r.left,
                      top: r.top,
                      width: r.width,
                      height: r.height,
                    });
                    setSelectionHint(selected.info);
                  }
                }
                if (e.key === 'Enter' && selectionTarget.current) {
                  e.preventDefault();
                  const selected = safeSelection(selectionTarget.current);
                  if (selected) {
                    const r = selected.target.getBoundingClientRect();
                    commitSelection(
                      selected,
                      (Math.max(0, r.left) + Math.min(innerWidth, r.right)) / 2,
                      (Math.max(0, r.top) + Math.min(innerHeight, r.bottom)) /
                        2,
                    );
                  }
                }
              }}
              tabIndex={0}
              ref={(node) => node?.focus()}
              aria-label="Choose a page element. Tab to move, Enter to select, Escape to cancel."
            />
            {highlight && (
              <div className="feedback-selection-highlight" style={highlight} />
            )}
          </>
        )}
        <dialog
          ref={dialog}
          className="feedback-dialog"
          aria-labelledby="feedback-heading"
          aria-describedby="feedback-intro"
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <div className="feedback-dialog-heading">
            <div>
              <h2 id="feedback-heading">Send feedback</h2>
              <p id="feedback-intro" className="feedback-intro">
                Tell us, show us, or record what happened.
              </p>
            </div>
            <div className="feedback-window-actions">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Minimize feedback"
                title="Minimize — keep your draft"
                onClick={minimize}
              >
                <Minus size={20} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close feedback"
                title="Close feedback"
                onClick={close}
              >
                <X size={20} />
              </Button>
            </div>
          </div>
          <div className="feedback-dialog-body" ref={dialogBody}>
            {confirm ? (
              <div
                className="feedback-confirm"
                role="alertdialog"
                aria-label="Confirm discard"
              >
                <p>{confirm.label}</p>
                <div className="feedback-actions">
                  <Button
                    variant="outline"
                    autoFocus
                    onClick={() => setConfirm(null)}
                  >
                    Keep it
                  </Button>
                  <Button
                    onClick={() => {
                      const action = confirm.action;
                      setConfirm(null);
                      action();
                    }}
                  >
                    Discard
                  </Button>
                </div>
              </div>
            ) : receipt ? (
              <div className="feedback-receipt" role="status">
                <CheckCheck size={30} />
                <h3>Delivered to GitHub.</h3>
                <p>
                  Your report is public. Attachments are private to you and the
                  maintainer for seven days.
                </p>
                <a
                  className="action action-primary"
                  href={receipt.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View your issue <ArrowRight size={17} />
                </a>
                <Button onClick={close}>Done</Button>
              </div>
            ) : (
              <>
                {access && !access.authenticated && (
                  <div className="feedback-auth">
                    <div className="feedback-auth-row">
                      <div>
                        <strong>Sign in before you start</strong>
                        <p>Use your ChatGPT account to send a report.</p>
                      </div>
                      <a
                        className="feedback-signin"
                        href="/signin-with-chatgpt?return_to=%2F"
                        target="_top"
                      >
                        Sign in <ArrowRight size={15} />
                      </a>
                    </div>
                    <details className="feedback-auth-details">
                      <summary>
                        Why ChatGPT? <ChevronDown size={14} />
                      </summary>
                      <p>
                        This website is hosted on ChatGPT Sites, which uses your
                        ChatGPT account for sign-in. Your report goes to GitHub,
                        not to a chat. Sign in first: leaving the page clears
                        your draft and captures. You can explore the tools
                        without signing in.
                      </p>
                    </details>
                  </div>
                )}
                {access && !access.available && (
                  <p className="feedback-small">
                    Capture and preview work here. Publishing is waiting for the
                    GitHub connection.
                  </p>
                )}
                {!reviewing ? (
                  <form onSubmit={review} className="feedback-form">
                    <div className="feedback-category-row">
                      <label htmlFor="feedback-category">Category</label>
                      <Select
                        value={category}
                        items={feedbackCategories}
                        onValueChange={(value) => {
                          if (!value) return;
                          setCategory(value);
                          key.current = '';
                        }}
                      >
                        <SelectTrigger
                          id="feedback-category"
                          className="feedback-category-trigger"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent
                          container={dialog}
                          align="end"
                          alignItemWithTrigger={false}
                          className="feedback-category-menu"
                        >
                          {Object.entries(feedbackCategories).map(([v, l]) => (
                            <SelectItem key={v} value={v}>
                              {l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <DictationOptions voice={voice} container={dialog} />
                    <div className="feedback-field">
                      <label htmlFor="feedback-title">
                        Summary <span>optional · {title.length}/120</span>
                      </label>
                      <div className="feedback-voice-field">
                        <Input
                          ref={titleInput}
                          readOnly={
                            voice.active && voice.state?.field === 'title'
                          }
                          id="feedback-title"
                          maxLength={120}
                          value={title}
                          autoComplete="off"
                          placeholder="Leave blank and we'll take one from your report"
                          onChange={(e) => {
                            voice.edited('title');
                            setTitle(e.target.value);
                            key.current = '';
                          }}
                        />
                        <DictationButton
                          voice={voice}
                          field="title"
                          disabled={captureBusy}
                          onStart={() => dictate('title')}
                        />
                      </div>
                      <DictationStatus voice={voice} field="title" />
                    </div>
                    <div className="feedback-field">
                      <label htmlFor="feedback-description">
                        What happened? <span>{description.length}/4,000</span>
                      </label>
                      <div className="feedback-voice-field feedback-voice-multiline">
                        <Textarea
                          ref={descriptionInput}
                          readOnly={
                            voice.active && voice.state?.field === 'description'
                          }
                          id="feedback-description"
                          required
                          minLength={10}
                          maxLength={4000}
                          rows={3}
                          value={description}
                          placeholder="What did you expect? What happened instead?"
                          onChange={(e) => {
                            voice.edited('description');
                            setDescription(e.target.value);
                            key.current = '';
                          }}
                        />
                        <DictationButton
                          voice={voice}
                          field="description"
                          disabled={captureBusy}
                          onStart={() => dictate('description')}
                        />
                      </div>
                      <DictationStatus voice={voice} field="description" />
                    </div>
                    <fieldset
                      className="feedback-tools"
                      disabled={captureBusy || busy || voice.active}
                    >
                      <legend>
                        Add context <span>Optional</span>
                      </legend>
                      <div className="feedback-tool-grid">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => screenshot()}
                        >
                          <Camera size={18} /> Screenshot
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={beginSelection}
                        >
                          <MousePointer2 size={18} /> Select element
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => startRecording('video')}
                        >
                          <Video size={18} /> Record screen
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => startRecording('audio')}
                        >
                          <Mic size={18} /> Audio attachment
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => fileInput.current?.click()}
                        >
                          <FilePlus size={18} /> Attach files
                        </Button>
                      </div>
                      <input
                        ref={fileInput}
                        type="file"
                        hidden
                        multiple
                        accept="image/png,image/jpeg,image/webp,video/webm,video/mp4,audio/webm,audio/mp4,audio/x-m4a,audio/ogg,audio/wav,text/plain,.txt"
                        onChange={(e) => void attach(e.target.files)}
                      />
                      <label
                        className="feedback-option"
                        htmlFor="feedback-microphone"
                      >
                        <span>Microphone in screen recordings</span>
                        <Switch
                          id="feedback-microphone"
                          checked={micEnabled}
                          onCheckedChange={setMicEnabled}
                        />
                      </label>
                      <details className="feedback-capture-help">
                        <summary>
                          Capture limits & tips <ChevronDown size={14} />
                        </summary>
                        <p>
                          Capture only this website. Screen: 60 seconds. Voice:
                          10 minutes. Up to 10 MB per file and 25 MB per report.
                          Your browser asks permission before capture. On
                          mobile, attach existing media if screen sharing is
                          unavailable.
                        </p>
                      </details>
                    </fieldset>
                    {recording && (
                      <div className="feedback-notice" role="status">
                        <p>
                          <span className="recording-dot" /> Recording{' '}
                          {recording} · {seconds}s
                        </p>
                        <div className="feedback-actions">
                          <Button type="button" onClick={() => stopRecording()}>
                            Stop & review
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              setConfirm({
                                label:
                                  'Discard this recording and stop sharing?',
                                action: () => stopRecording(true),
                              })
                            }
                          >
                            Discard recording
                          </Button>
                        </div>
                      </div>
                    )}
                    {captureBusy && !recording && (
                      <p role="status">Waiting for capture permission…</p>
                    )}
                    {previews}
                    <details className="feedback-diagnostics">
                      <summary>
                        <SlidersHorizontal size={16} />
                        <span>Diagnostics</span>
                        <span className="feedback-diagnostics-state">
                          {viewport || collectLogs ? 'Included' : 'Off'}
                        </span>
                        <ChevronDown size={16} />
                      </summary>
                      <div className="feedback-diagnostics-content">
                        <label
                          className="feedback-option"
                          htmlFor="feedback-viewport"
                        >
                          <span>
                            <strong>Browser & screen</strong>
                            <small>
                              Browser family and screen dimensions only.
                            </small>
                          </span>
                          <Switch
                            id="feedback-viewport"
                            checked={viewport}
                            onCheckedChange={setViewport}
                          />
                        </label>
                        <label
                          className="feedback-option"
                          htmlFor="feedback-console"
                        >
                          <span>
                            <strong>Console warnings & errors</strong>
                            <small>
                              Up to 20 new messages while you reproduce.
                            </small>
                          </span>
                          <Switch
                            id="feedback-console"
                            checked={collectLogs}
                            onCheckedChange={(checked) => {
                              logs.current = [];
                              setCollectLogs(checked);
                            }}
                          />
                        </label>
                        <p className="feedback-small">
                          No browsing history, form values, DOM snapshots,
                          request bodies, cookies, or headers. Review the exact
                          redacted JSON before sending. Text redaction is a
                          safeguard, not a guarantee.
                        </p>
                      </div>
                    </details>
                    <div className="feedback-privacy">
                      <div className="feedback-privacy-summary">
                        <ShieldCheck size={16} />
                        <p>
                          Public report. Private attachments.{' '}
                          <span>Report uploads only when you publish.</span>
                        </p>
                      </div>
                      <details>
                        <summary>
                          Where does my feedback go? <ChevronDown size={14} />
                        </summary>
                        <p>
                          Report text and selected element labels become a
                          public issue in{' '}
                          <a
                            href="https://github.com/alibad/feedback-widget/issues"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            alibad/feedback-widget
                          </a>
                          . Screenshots, recordings, files, and diagnostics are
                          only available to you and the maintainer after
                          sign-in, for seven days. Check all content for private
                          information before publishing.
                        </p>
                        <p>
                          Drafts stay in memory. Unsubmitted uploads expire
                          after one day; submitted attachment access expires
                          after seven days. Expired objects are cleaned up on
                          later upload/submission traffic. Public issues stay on
                          GitHub; private delivery and abuse records expire
                          after 30 days.
                        </p>
                      </details>
                    </div>
                    <label className="feedback-consent">
                      <Checkbox
                        required
                        checked={consent}
                        onCheckedChange={setConsent}
                      />
                      <span>
                        I agree to publish my text and share reviewed
                        attachments privately with the maintainer.
                      </span>
                    </label>
                    {error && (
                      <p role="alert" className="feedback-error">
                        {error}
                      </p>
                    )}
                    <Button
                      type="submit"
                      className="feedback-primary"
                      disabled={captureBusy || voice.active}
                    >
                      Review feedback <ArrowRight size={17} />
                    </Button>
                  </form>
                ) : (
                  <div className="feedback-review">
                    <h3 ref={reviewHeading} tabIndex={-1}>
                      Review everything before sending
                    </h3>
                    <p className="feedback-small">
                      The following text is public. Common secrets and email
                      addresses are redacted; check it yourself.
                    </p>
                    <strong>{report.title}</strong>
                    <p>{feedbackCategories[category]}</p>
                    <pre>{report.description}</pre>
                    {previews}
                    {diagnostics && (
                      <details open>
                        <summary>Private diagnostics — exact content</summary>
                        <pre>{diagnostics}</pre>
                        <Button
                          variant="outline"
                          disabled={busy || locked}
                          onClick={() => {
                            setDiagnostics('');
                            logs.current = [];
                          }}
                        >
                          Remove diagnostics
                        </Button>
                      </details>
                    )}
                    {error && (
                      <p role="alert" className="feedback-error">
                        {error}
                      </p>
                    )}
                    {progress && <p role="status">{progress}</p>}
                    {submissionId && (
                      <p className="feedback-small">Receipt: {submissionId}</p>
                    )}
                    <div className="feedback-actions">
                      <Button
                        variant="outline"
                        disabled={busy || locked}
                        onClick={() => setReviewing(false)}
                      >
                        Edit report
                      </Button>
                      <Button
                        className="feedback-primary"
                        disabled={
                          busy || !access?.authenticated || !access.available
                        }
                        onClick={submit}
                      >
                        {busy
                          ? 'Sending…'
                          : locked
                            ? 'Check delivery'
                            : 'Publish issue'}{' '}
                        <ArrowRight size={17} />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </dialog>
        {annotation && (
          <FeedbackAnnotator
            url={annotation.url}
            onCancel={() => {
              setAnnotating(null);
              restoreDialog();
            }}
            onSave={(blob) => {
              if (blob.size > CAPTURE_LIMIT) {
                setError('Annotated image exceeds 10 MB.');
                return;
              }
              const total = mediaRef.current.reduce(
                (n, m) =>
                  n + (m.id === annotation.id ? blob.size : m.blob.size),
                0,
              );
              if (total > REPORT_LIMIT) {
                setError('Annotated image exceeds the report size limit.');
                return;
              }
              URL.revokeObjectURL(annotation.url);
              updateMedia(
                mediaRef.current.map((m) =>
                  m.id === annotation.id
                    ? {
                        ...m,
                        blob,
                        url: URL.createObjectURL(blob),
                        attachmentId: undefined,
                      }
                    : m,
                ),
              );
              setAnnotating(null);
              restoreDialog();
            }}
          />
        )}
      </div>
    </>
  );
}

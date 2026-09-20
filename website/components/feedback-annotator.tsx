'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Circle,
  Minus,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Plus,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { fitAnnotationImage } from '../lib/annotation-layout';
import { Button } from './ui/button';

type Point = { x: number; y: number };
type Tool = 'select' | 'draw' | 'line' | 'rect' | 'circle' | 'arrow' | 'text';
type Mark = {
  id: string;
  tool: Exclude<Tool, 'select'>;
  points: Point[];
  color: string;
  width: number;
  text?: string;
};
const tools: Record<Tool, string> = {
  select: 'Select / move',
  draw: 'Draw',
  line: 'Line',
  rect: 'Rectangle',
  circle: 'Circle',
  arrow: 'Arrow',
  text: 'Text',
};
const toolIcons = {
  select: MousePointer2,
  draw: Pencil,
  line: Minus,
  rect: Square,
  circle: Circle,
  arrow: MoveUpRight,
  text: Type,
};
const colorNames = ['Red', 'Blue', 'Green', 'Yellow', 'White', 'Black'];
const colors = [
  '#ef4444',
  '#2563eb',
  '#16a34a',
  '#facc15',
  '#ffffff',
  '#000000',
];
function bounds(mark: Mark) {
  const xs = mark.points.map((p) => p.x),
    ys = mark.points.map((p) => p.y);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return {
    x,
    y,
    w:
      mark.tool === 'text'
        ? (mark.text?.length ?? 0) * mark.width * 3.6
        : Math.max(...xs) - x,
    h: mark.tool === 'text' ? mark.width * 6 : Math.max(...ys) - y,
  };
}
function drawMark(ctx: CanvasRenderingContext2D, m: Mark) {
  const a = m.points[0],
    b = m.points.at(-1)!;
  ctx.save();
  ctx.strokeStyle = m.color;
  ctx.fillStyle = m.color;
  ctx.lineWidth = m.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (m.tool === 'text') {
    ctx.font = `${m.width * 6}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(m.text ?? '', a.x, a.y);
  } else if (m.tool === 'rect') ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  else if (m.tool === 'circle') {
    ctx.ellipse(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      Math.abs(b.x - a.x) / 2,
      Math.abs(b.y - a.y) / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  } else {
    ctx.moveTo(a.x, a.y);
    m.points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    if (m.tool === 'arrow') {
      const angle = Math.atan2(b.y - a.y, b.x - a.x),
        n = Math.max(14, m.width * 4);
      ctx.beginPath();
      ctx.moveTo(
        b.x - n * Math.cos(angle - 0.5),
        b.y - n * Math.sin(angle - 0.5),
      );
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(
        b.x - n * Math.cos(angle + 0.5),
        b.y - n * Math.sin(angle + 0.5),
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function FeedbackAnnotator({
  url,
  onSave,
  onCancel,
}: {
  url: string;
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    stage = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    image = useRef<HTMLImageElement | null>(null),
    textInput = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 }),
    [available, setAvailable] = useState({ w: 1, h: 1 }),
    [tool, setTool] = useState<Tool>('arrow'),
    [color, setColor] = useState(colors[0]),
    [width, setWidth] = useState(4);
  const [history, setHistory] = useState<Mark[][]>([[]]),
    [index, setIndex] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [draft, setDraft] = useState<Mark | null>(null),
    [text, setText] = useState<{ p: Point; value: string } | null>(null),
    [error, setError] = useState('');
  const gesture = useRef<{ start: Point; original?: Mark } | null>(null);
  const marks = history[index];
  const preview = fitAnnotationImage(size, available);
  function commit(next: Mark[]) {
    setHistory((h) => [...h.slice(0, index + 1), next]);
    setIndex(index + 1);
    setDraft(null);
  }
  function commitText() {
    const next = text?.value.trim()
      ? [
          ...marks,
          {
            id: crypto.randomUUID(),
            tool: 'text' as const,
            points: [text.p],
            color,
            width,
            text: text.value.slice(0, 200),
          },
        ]
      : marks;
    if (next !== marks) commit(next);
    setText(null);
    return next;
  }
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setAvailable({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    dialog.current?.showModal();
    const img = new Image();
    let alive = true;
    img.onload = () => {
      if (alive) {
        image.current = img;
        setSize({ w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.onerror = () => setError('This image could not be opened.');
    img.src = url;
    return () => {
      alive = false;
      image.current = null;
    };
  }, [url]);
  useEffect(() => {
    if (text) {
      const id = requestAnimationFrame(() => textInput.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [!!text]);
  useEffect(() => {
    const c = canvas.current,
      ctx = c?.getContext('2d');
    if (!c || !ctx || !image.current) return;
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.drawImage(image.current, 0, 0);
    marks.filter((m) => m.id !== draft?.id).forEach((m) => drawMark(ctx, m));
    if (draft) drawMark(ctx, draft);
    const active =
      draft?.id === selected ? draft : marks.find((m) => m.id === selected);
    if (active) {
      const b = bounds(active);
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(b.x - 8, b.y - 8, b.w + 16, b.h + 16);
      ctx.restore();
    }
  }, [marks, draft, selected, size]);
  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(size.w, ((e.clientX - r.left) * size.w) / r.width),
      ),
      y: Math.max(
        0,
        Math.min(size.h, ((e.clientY - r.top) * size.h) / r.height),
      ),
    };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = point(e);
    if (text) {
      commitText();
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'text') {
      setText({ p, value: '' });
      return;
    }
    if (tool === 'select') {
      const hit = [...marks].reverse().find((m) => {
        const b = bounds(m);
        return (
          p.x >= b.x - 10 &&
          p.x <= b.x + b.w + 10 &&
          p.y >= b.y - 10 &&
          p.y <= b.y + b.h + 10
        );
      });
      setSelected(hit?.id ?? null);
      gesture.current = hit ? { start: p, original: hit } : null;
      return;
    }
    setSelected(null);
    gesture.current = { start: p };
    setDraft({ id: crypto.randomUUID(), tool, color, width, points: [p, p] });
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = gesture.current;
    if (!g) return;
    const p = point(e);
    if (g.original) {
      const m = g.original;
      setDraft({
        ...m,
        points: m.points.map((q) => ({
          x: q.x + p.x - g.start.x,
          y: q.y + p.y - g.start.y,
        })),
      });
    } else
      setDraft((m) =>
        m
          ? {
              ...m,
              points: m.tool === 'draw' ? [...m.points, p] : [m.points[0], p],
            }
          : null,
      );
  }
  function up() {
    if (draft) commit([...marks.filter((m) => m.id !== draft.id), draft]);
    gesture.current = null;
  }
  function remove() {
    if (selected) {
      commit(marks.filter((m) => m.id !== selected));
      setSelected(null);
    }
  }
  async function save() {
    const savedMarks = commitText();
    const c = document.createElement('canvas');
    c.width = size.w;
    c.height = size.h;
    const ctx = c.getContext('2d');
    if (!ctx || !image.current) return;
    ctx.drawImage(image.current, 0, 0);
    savedMarks.forEach((m) => drawMark(ctx, m));
    c.toBlob((blob) => {
      if (blob) onSave(blob);
      else setError('Could not save this annotation.');
    }, 'image/png');
  }
  return (
    <dialog
      ref={dialog}
      className="feedback-annotator"
      aria-label="Annotate screenshot"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          setIndex((i) =>
            e.shiftKey
              ? Math.min(history.length - 1, i + 1)
              : Math.max(0, i - 1),
          );
          setSelected(null);
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          remove();
        }
      }}
    >
      <div className="annotation-header">
        <strong>Annotate screenshot</strong>
        <Button
          variant="ghost"
          onClick={onCancel}
          aria-label="Cancel annotation"
          title="Cancel annotation"
        >
          <X aria-hidden="true" />
        </Button>
        <Button onClick={save}>Save image</Button>
      </div>
      <div
        className="annotation-toolbar"
        role="toolbar"
        aria-label="Annotation tools"
      >
        <div
          className="annotation-group"
          role="group"
          aria-label="Drawing tools"
        >
          {Object.entries(tools).map(([value, label]) => {
            const Icon = toolIcons[value as Tool];
            return (
              <Button
                key={value}
                className="annotation-tool"
                variant={tool === value ? 'default' : 'ghost'}
                aria-label={label}
                title={label}
                aria-pressed={tool === value}
                onClick={() => {
                  commitText();
                  setTool(value as Tool);
                }}
              >
                <Icon aria-hidden="true" />
              </Button>
            );
          })}
        </div>
        <div
          className="annotation-group annotation-palette"
          role="group"
          aria-label="Annotation colors"
        >
          {colors.map((c, i) => (
            <button
              key={c}
              type="button"
              className="annotation-swatch"
              aria-label={colorNames[i]}
              title={colorNames[i]}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
            >
              <span
                className="annotation-swatch-dot"
                style={{ backgroundColor: c }}
              >
                {color === c && (
                  <Check
                    size={14}
                    color={i === 3 || i === 4 ? '#17211d' : '#fff'}
                    aria-hidden="true"
                  />
                )}
              </span>
            </button>
          ))}
          <label className="annotation-custom" title="Custom annotation color">
            <Plus size={16} aria-hidden="true" />
            <input
              type="color"
              aria-label="Custom annotation color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
        </div>
        <label className="annotation-stroke">
          Stroke
          <input
            aria-label="Stroke width"
            type="range"
            min="1"
            max="12"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
          <output>{width}</output>
        </label>
        <div
          className="annotation-group"
          role="group"
          aria-label="Edit history"
        >
          <Button
            className="annotation-tool"
            variant="ghost"
            aria-label="Undo"
            title="Undo (⌘/Ctrl Z)"
            disabled={index === 0}
            onClick={() => {
              setIndex(index - 1);
              setSelected(null);
            }}
          >
            <Undo2 aria-hidden="true" />
          </Button>
          <Button
            className="annotation-tool"
            variant="ghost"
            aria-label="Redo"
            title="Redo (⌘/Ctrl Shift Z)"
            disabled={index === history.length - 1}
            onClick={() => {
              setIndex(index + 1);
              setSelected(null);
            }}
          >
            <Redo2 aria-hidden="true" />
          </Button>
          <Button
            className="annotation-tool"
            variant="ghost"
            aria-label="Delete selected"
            title="Delete selected"
            disabled={!selected}
            onClick={remove}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p className="annotation-hint">
        {tools[tool]} · Enter confirms text · Esc cancels text · ⌘/Ctrl Z undoes
      </p>
      {error && <p role="alert">{error}</p>}
      <div ref={stage} className="annotation-stage">
        <div
          className="annotation-image"
          style={{ width: preview.w, height: preview.h }}
        >
          <canvas
            ref={canvas}
            width={size.w}
            height={size.h}
            style={{
              cursor:
                tool === 'select'
                  ? 'move'
                  : tool === 'text'
                    ? 'text'
                    : 'crosshair',
            }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => {
              gesture.current = null;
              setDraft(null);
            }}
          />
          {text && (
            <input
              ref={textInput}
              className="annotation-text"
              aria-label="Annotation text"
              maxLength={200}
              value={text.value}
              style={{
                left: `${(text.p.x / size.w) * 100}%`,
                top: `${(text.p.y / size.h) * 100}%`,
                color,
                fontSize: (width * 6 * preview.w) / size.w,
              }}
              onChange={(e) => setText({ ...text, value: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitText();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setText(null);
                }
              }}
            />
          )}
        </div>
      </div>
    </dialog>
  );
}

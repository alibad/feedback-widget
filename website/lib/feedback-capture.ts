'use client';

export const CAPTURE_LIMIT = 10 * 1024 * 1024;
export const REPORT_LIMIT = 25 * 1024 * 1024;
export type DraftMedia = {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  blob: Blob;
  url: string;
  label: string;
  attachmentId?: string;
  elementInfo?: string;
  position?: { x: number; y: number };
};
export type Selection = {
  id: string;
  elementInfo: string;
  position?: { x: number; y: number };
};

function parentElementOrHost(element: Element): Element | null {
  return (
    element.parentElement ?? (element.getRootNode() as ShadowRoot).host ?? null
  );
}

// Select the actual element, not its closest labeled ancestor. Public context
// contains only structural tag/index metadata and optional authored labels.
// Never read textContent, values, URLs, IDs, CSS classes, or arbitrary ARIA text.
export function safeSelection(element: Element | null) {
  if (
    !element ||
    ['HTML', 'BODY', 'SCRIPT', 'STYLE', 'META', 'LINK'].includes(
      element.tagName.toUpperCase(),
    )
  )
    return null;
  for (
    let node: Element | null = element;
    node;
    node = parentElementOrHost(node)
  ) {
    if (
      node.matches(
        '#feedback-widget-root,[data-private],[data-sensitive],[data-no-capture]',
      )
    )
      return null;
  }
  const path: string[] = [];
  for (
    let node: Element | null = element;
    node && path.length < 8;
    node = parentElementOrHost(node)
  ) {
    const tag =
      node.tagName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 40) || 'element';
    if (tag === 'body' || tag === 'html') break;
    const siblings =
      node.parentElement?.children ??
      (node.getRootNode() as ShadowRoot).children;
    const sameTag = Array.from(siblings ?? []).filter(
      (sibling) => sibling.tagName === node!.tagName,
    );
    path.unshift(
      `${tag}:nth-of-type(${Math.max(1, sameTag.indexOf(node) + 1)})`,
    );
  }
  const rawLabel = element.getAttribute('data-feedback-label');
  const label =
    rawLabel && /^[a-zA-Z0-9 /().,:+-]{1,100}$/.test(rawLabel) ? rawLabel : '';
  const suffix = label ? ` (${label})` : '';
  // Retain the exact leaf, dropping only whole ancestors to fit the report
  // contract. Server truncation must not remove the selected element itself.
  while (path.length > 1 && path.join(' > ').length + suffix.length > 300)
    path.shift();
  const info = `${path.join(' > ')}${suffix}`;
  return { target: element, info };
}

// Open shadow trees and pointer-events:none decoration remain selectable.
// Cross-origin frames and closed shadow roots are selected as their host box;
// never attempt to bypass browser isolation to inspect their internals.
export function feedbackElementAtPoint(doc: Document, x: number, y: number) {
  let target = doc.elementFromPoint(x, y);
  for (let depth = 0; target && depth < 16; depth++) {
    const shadowHit = target.shadowRoot?.elementFromPoint?.(x, y);
    if (shadowHit && shadowHit !== target) {
      target = shadowHit;
      continue;
    }
    const decoration: Element | undefined = Array.from(target.children)
      .reverse()
      .find((child) => {
        const style = doc.defaultView?.getComputedStyle(child);
        if (style?.pointerEvents !== 'none' || style.visibility === 'hidden')
          return false;
        const r = child.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          x >= r.left &&
          x <= r.right &&
          y >= r.top &&
          y <= r.bottom
        );
      });
    if (!decoration) break;
    target = decoration;
  }
  return target;
}

export async function frameBlob(stream: MediaStream) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
    if (!video.videoWidth)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('No video frame was available.')),
          5000,
        );
        video.addEventListener(
          'loadeddata',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    if (
      !canvas.width ||
      !canvas.height ||
      canvas.width * canvas.height > 32_000_000
    )
      throw new Error('Choose a smaller window or tab.');
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('Could not capture this frame.')),
        'image/png',
      ),
    );
  } finally {
    video.pause();
    video.srcObject = null;
    stream.getTracks().forEach((track) => track.stop());
  }
}

export function recordingMime(kind: 'audio' | 'video') {
  const options =
    kind === 'video'
      ? ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return options.find((mime) => MediaRecorder.isTypeSupported(mime));
}

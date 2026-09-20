/** Fit the preview without changing the full-resolution export coordinates. */
export function fitAnnotationImage(
  image: { w: number; h: number },
  available: { w: number; h: number },
) {
  if (
    ![image.w, image.h, available.w, available.h].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
    return { w: 1, h: 1 };
  const scale = Math.min(1, available.w / image.w, available.h / image.h);
  return { w: image.w * scale, h: image.h * scale };
}

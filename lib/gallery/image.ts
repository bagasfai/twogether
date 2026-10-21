export const MAX_EDGE = 2000;
export const WEBP_QUALITY = 0.82;
export const MAX_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height };
  const scale = maxEdge / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function galleryPhotoPath(galleryId: string, id: string): string {
  return `${galleryId}/${id}.webp`;
}

export function validatePickedFile(
  file: { type: string; size: number },
): { ok: true } | { ok: false; reason: "type" | "empty" | "size" } {
  if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, reason: "type" };
  if (file.size <= 0) return { ok: false, reason: "empty" };
  if (file.size > MAX_BYTES) return { ok: false, reason: "size" };
  return { ok: true };
}

// Browser-only. Re-encoding through a canvas also strips EXIF/GPS metadata.
export async function resizeToWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
        "image/webp",
        WEBP_QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}

export const MAX_EDGE = 2000;
export const ENCODE_QUALITY = 0.82;
// Limit on the stored (resized) file, matching the bucket's file_size_limit.
export const MAX_BYTES = 5 * 1024 * 1024;
// Loose guard on the picked original, checked before decoding: phone photos
// are routinely over MAX_BYTES and shrink well below it once resized, but a
// huge file is not worth decoding in the browser at all.
export const MAX_ORIGINAL_BYTES = 40 * 1024 * 1024;
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

export type PhotoExt = "webp" | "jpg";

export function galleryPhotoPath(galleryId: string, id: string, ext: PhotoExt = "webp"): string {
  return `${galleryId}/${id}.${ext}`;
}

export function validatePickedFile(
  file: { type: string; size: number },
): { ok: true } | { ok: false; reason: "type" | "empty" | "size" } {
  if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, reason: "type" };
  if (file.size <= 0) return { ok: false, reason: "empty" };
  if (file.size > MAX_ORIGINAL_BYTES) return { ok: false, reason: "size" };
  return { ok: true };
}

// Thrown when the browser can produce neither webp nor jpeg from a canvas.
export class ImageEncodeError extends Error {
  constructor() {
    super("This browser cannot encode the photo");
    this.name = "ImageEncodeError";
  }
}

export type EncodedPhoto = { blob: Blob; ext: PhotoExt };

type Encode = (type: string, quality: number) => Promise<Blob | null>;

// WebKit (every iOS browser, desktop Safari) cannot encode webp and hands back
// PNG bytes from canvas.toBlob("image/webp"). Uploading those under a .webp
// path would mislabel the file, so the result type is checked and jpeg is the
// fallback. The returned ext always matches blob.type.
export async function encodeWithFallback(encode: Encode): Promise<EncodedPhoto> {
  const webp = await encode("image/webp", ENCODE_QUALITY);
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };
  const jpeg = await encode("image/jpeg", ENCODE_QUALITY);
  if (jpeg && jpeg.type === "image/jpeg") return { blob: jpeg, ext: "jpg" };
  throw new ImageEncodeError();
}

// Browser-only. Re-encoding through a canvas also strips EXIF/GPS metadata.
export async function resizeForUpload(file: File): Promise<EncodedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await encodeWithFallback(
      (type, quality) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality)),
    );
  } finally {
    bitmap.close();
  }
}

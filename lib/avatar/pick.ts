import { ImageEncodeError, MAX_AVATAR_BYTES, MAX_AVATAR_ORIGINAL_BYTES } from "@/lib/avatar/image";
import { validatePickedFile } from "@/lib/gallery/image";

export const AVATAR_MESSAGES = {
  type: "Use a JPEG, PNG, or WebP image.",
  empty: "That file is empty.",
  size: "That image is too large. Pick one under 10 MB.",
  resizedTooLarge: "That image is still too large after resizing. Try another one.",
  encode: "This browser can't process the image. Try a different browser.",
  decode: "Couldn't read that image. Try another file.",
  upload: "Upload failed. Check your connection and try again.",
} as const;

export function pickError(file: { type: string; size: number }): string | null {
  const result = validatePickedFile(file);
  if (!result.ok) return AVATAR_MESSAGES[result.reason];
  if (file.size > MAX_AVATAR_ORIGINAL_BYTES) return AVATAR_MESSAGES.size;
  return null;
}

export function resizeErrorMessage(error: unknown): string {
  return error instanceof ImageEncodeError ? AVATAR_MESSAGES.encode : AVATAR_MESSAGES.decode;
}

export function blobTooLarge(blob: { size: number }): boolean {
  return blob.size > MAX_AVATAR_BYTES;
}

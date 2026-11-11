import { encodeWithFallback, type EncodedPhoto } from "@/lib/gallery/image";

export { ImageEncodeError } from "@/lib/gallery/image";
export { ACCEPTED_TYPES } from "@/lib/gallery/image";

export const AVATAR_SIZE = 256;
export const MAX_AVATAR_ORIGINAL_BYTES = 10 * 1024 * 1024;
export const MAX_AVATAR_BYTES = 524288;

export function squareCrop(
  width: number,
  height: number,
): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

export function avatarObjectPath(userId: string, ext: "webp" | "jpg"): string {
  return `${userId}/avatar.${ext}`;
}

export async function resizeAvatar(file: File): Promise<EncodedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    return await encodeWithFallback(
      (type, quality) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality)),
    );
  } finally {
    bitmap.close();
  }
}

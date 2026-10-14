const MAX_SIDE = 1600;

/**
 * A phone photo of a bank transfer, shrunk to a JPEG of at most 1600 px a side
 * (a few hundred KB) so it uploads quickly over venue Wi-Fi.
 */
export async function transferPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  if (!blob) throw new Error("Could not read the photo. Take it again.");
  return blob;
}

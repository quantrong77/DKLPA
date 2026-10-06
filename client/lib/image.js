// Thu nhỏ ảnh chụp (điện thoại 3–8 MB) trước khi tải lên: file Word kèm nhiều ảnh vẫn nhẹ, in vẫn rõ.

export const PHOTO_MAX_SIDE = 1600;
const KEEP_BYTES = 800 * 1024;

/** Kích thước mới giữ tỉ lệ, cạnh dài không quá maxSide (ảnh nhỏ hơn giữ nguyên). */
export function scaledSize(width, height, maxSide = PHOTO_MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* thử cách khác */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

/**
 * Ảnh PNG/JPG nhỏ giữ nguyên; ảnh lớn hoặc định dạng khác (WebP…) -> JPEG cạnh dài ≤ 1600 điểm ảnh.
 * Không đọc được ảnh (vd HEIC trên máy không hỗ trợ) -> ném lỗi.
 */
export async function shrinkImage(file, { maxSide = PHOTO_MAX_SIDE, quality = 0.85 } = {}) {
  let bitmap;
  try { bitmap = await decode(file); } catch {
    throw new Error(`Không đọc được ảnh "${file.name}" (dùng ảnh JPG hoặc PNG).`);
  }
  const w = bitmap.width;
  const h = bitmap.height;
  if (/^image\/(png|jpeg)$/.test(file.type) && file.size <= KEEP_BYTES && Math.max(w, h) <= maxSide) {
    bitmap.close?.();
    return file;
  }
  const size = scaledSize(w, h, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // ảnh PNG trong suốt -> nền trắng khi chuyển JPEG
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error(`Không thu nhỏ được ảnh "${file.name}".`);
  const name = String(file.name || 'anh').replace(/\.[^.]+$/, '') || 'anh';
  return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
}

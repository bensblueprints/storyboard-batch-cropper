import { computeCropRects } from './grid.js';

/**
 * @param {HTMLImageElement|ImageBitmap} image
 * @param {import('./state.js').CropRect} rect
 * @returns {Promise<Blob>}
 */
export async function cropToBlob(image, rect) {
  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas not supported');
  }
  ctx.drawImage(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create image blob'));
        }
      },
      'image/png',
      1
    );
  });
}

/**
 * @param {HTMLImageElement|ImageBitmap} image
 * @param {import('./state.js').CropRect} rect
 * @param {number} maxSize
 * @returns {string}
 */
export function cropToDataUrl(image, rect, maxSize = 160) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(maxSize / rect.width, maxSize / rect.height, 1);
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return '';
  }
  ctx.drawImage(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * @param {import('./state.js').QueuedImage} item
 * @returns {Promise<Blob[]>}
 */
export async function cropAllPanels(item) {
  const rects = computeCropRects(item.width, item.height, item.settings);
  const blobs = [];
  for (const rect of rects) {
    blobs.push(await cropToBlob(item.image, rect));
  }
  return blobs;
}

/**
 * @param {import('./state.js').QueuedImage} item
 * @returns {string[]}
 */
export function getPanelPreviewUrls(item) {
  const rects = computeCropRects(item.width, item.height, item.settings);
  return rects.map((rect, i) => cropToDataUrl(item.image, rect, 180));
}

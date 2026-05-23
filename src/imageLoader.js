import { createDefaultSettings, nextId, stemFromFilename } from './state.js';

const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * @param {File} file
 * @returns {Promise<import('./state.js').QueuedImage>}
 */
export async function loadImageFile(file) {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.name}`);
  }

  const bitmap = await decodeImage(file);
  const width = bitmap.width;
  const height = bitmap.height;

  return {
    id: nextId(),
    name: file.name,
    stem: stemFromFilename(file.name),
    image: bitmap,
    width,
    height,
    settings: createDefaultSettings(4),
  };
}

/**
 * @param {FileList|File[]} files
 * @returns {Promise<{ items: import('./state.js').QueuedImage[], errors: string[] }>}
 */
export async function loadImageFiles(files) {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
  const items = [];
  const errors = [];

  for (const file of list) {
    try {
      items.push(await loadImageFile(file));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { items, errors };
}

/**
 * @param {File} file
 * @returns {Promise<ImageBitmap|HTMLImageElement>}
 */
async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return bitmap;
    } catch {
      // fall through to canvas normalization
    }
  }

  return await normalizeWithCanvas(await fileToImageElement(file));
}

/**
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
function fileToImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load ${file.name}`));
    };
    img.src = url;
  });
}

/**
 * Draw through canvas to normalize EXIF orientation when createImageBitmap is unavailable.
 * @param {HTMLImageElement} img
 * @returns {Promise<HTMLImageElement>}
 */
function normalizeWithCanvas(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.resolve(img);
  }
  ctx.drawImage(img, 0, 0);
  return new Promise((resolve) => {
    const normalized = new Image();
    normalized.onload = () => resolve(normalized);
    normalized.src = canvas.toDataURL('image/png');
  });
}

/**
 * @param {import('./state.js').QueuedImage} item
 * @returns {string}
 */
export function createListThumbnailUrl(item) {
  const canvas = document.createElement('canvas');
  const size = 80;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return '';
  }
  const scale = Math.min(size / item.width, size / item.height);
  const w = item.width * scale;
  const h = item.height * scale;
  const x = (size - w) / 2;
  const y = (size - h) / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(item.image, x, y, w, h);
  return canvas.toDataURL('image/jpeg', 0.7);
}

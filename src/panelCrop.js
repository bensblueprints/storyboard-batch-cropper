import {
  computeSectionRects,
  computeCropRects,
  insetToCropRect,
  updatePanelCropEdge,
} from './grid.js';
import { getPanelPreviewUrls } from './cropEngine.js';

/** @typedef {'top'|'bottom'|'left'|'right'} CropEdge */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import('./state.js').QueuedImage} item
 * @param {number} panelIndex
 * @param {(edge: CropEdge, value: number) => void} onEdgeDrag
 */
export function createPanelCropController(canvas, item, panelIndex, onEdgeDrag) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas not supported');
  }

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = null;

  function getCellAndCrop() {
    const sections = computeSectionRects(item.width, item.height, item.settings);
    const cell = sections[panelIndex];
    const crop = insetToCropRect(cell, item.settings.panelCropOffsets?.[panelIndex] ?? null);
    return { cell, crop };
  }

  function render() {
    const { cell, crop } = getCellAndCrop();
    const maxWidth = canvas.parentElement?.clientWidth || cell.width;
    scale = Math.min(1, maxWidth / cell.width);
    canvas.width = Math.round(cell.width * scale);
    canvas.height = Math.round(cell.height * scale);
    offsetX = cell.x;
    offsetY = cell.y;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      item.image,
      cell.x,
      cell.y,
      cell.width,
      cell.height,
      0,
      0,
      canvas.width,
      canvas.height
    );

    drawCropOverlay(ctx, cell, crop, scale);
  }

  function panelToImageX(x) {
    return offsetX + x / scale;
  }

  function panelToImageY(y) {
    return offsetY + y / scale;
  }

  function hitTest(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const threshold = 10;
    const { crop } = getCellAndCrop();

    const cropPanel = {
      left: (crop.x - offsetX) * scale,
      top: (crop.y - offsetY) * scale,
      right: (crop.x + crop.width - offsetX) * scale,
      bottom: (crop.y + crop.height - offsetY) * scale,
    };

    const hits = [
      { edge: /** @type {CropEdge} */ ('left'), dist: Math.abs(x - cropPanel.left) },
      { edge: /** @type {CropEdge} */ ('right'), dist: Math.abs(x - cropPanel.right) },
      { edge: /** @type {CropEdge} */ ('top'), dist: Math.abs(y - cropPanel.top) },
      { edge: /** @type {CropEdge} */ ('bottom'), dist: Math.abs(y - cropPanel.bottom) },
    ].sort((a, b) => a.dist - b.dist);

    const best = hits[0];
    if (best.dist <= threshold) {
      return best.edge;
    }
    return null;
  }

  function cursorForEdge(edge) {
    if (edge === 'left' || edge === 'right') {
      return 'col-resize';
    }
    return 'row-resize';
  }

  function onPointerDown(e) {
    const edge = hitTest(e.clientX, e.clientY);
    if (!edge) {
      return;
    }
    dragging = edge;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = cursorForEdge(edge);
  }

  function onPointerMove(e) {
    if (dragging) {
      const rect = canvas.getBoundingClientRect();
      if (dragging === 'left' || dragging === 'right') {
        onEdgeDrag(dragging, panelToImageX(e.clientX - rect.left));
      } else {
        onEdgeDrag(dragging, panelToImageY(e.clientY - rect.top));
      }
      return;
    }

    const edge = hitTest(e.clientX, e.clientY);
    canvas.style.cursor = edge ? cursorForEdge(edge) : 'crosshair';
  }

  function onPointerUp(e) {
    if (dragging) {
      canvas.releasePointerCapture(e.pointerId);
      dragging = null;
      canvas.style.cursor = 'crosshair';
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerUp);

  return {
    render,
    destroy() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
    },
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./state.js').CropRect} cell
 * @param {import('./state.js').CropRect} crop
 * @param {number} scale
 */
function drawCropOverlay(ctx, cell, crop, scale) {
  const x = (crop.x - cell.x) * scale;
  const y = (crop.y - cell.y) * scale;
  const w = crop.width * scale;
  const h = crop.height * scale;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, ctx.canvas.width, y);
  ctx.fillRect(0, y + h, ctx.canvas.width, ctx.canvas.height - y - h);
  ctx.fillRect(0, y, x, h);
  ctx.fillRect(x + w, y, ctx.canvas.width - x - w, h);

  ctx.strokeStyle = 'rgba(76, 175, 130, 0.95)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.restore();
}

export { computeCropRects };

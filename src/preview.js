import { computeSplitLines } from './grid.js';
import { getPanelPreviewUrls } from './cropEngine.js';

/** @typedef {'vertical'|'horizontal'} Axis */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import('./state.js').QueuedImage} item
 * @param {(axis: Axis, lineIndex: number, value: number) => void} onLineDrag
 */
export function createPreviewController(canvas, item, onLineDrag) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas not supported');
  }

  let scale = 1;
  let dragging = null;

  function render() {
    const maxWidth = canvas.parentElement?.clientWidth || item.width;
    scale = Math.min(1, maxWidth / item.width);
    canvas.width = Math.round(item.width * scale);
    canvas.height = Math.round(item.height * scale);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(item.image, 0, 0, canvas.width, canvas.height);

    const { vertical, horizontal } = computeSplitLines(
      item.width,
      item.height,
      item.settings
    );

    drawLines(ctx, vertical, horizontal, canvas.width, canvas.height, item.width, item.height);
  }

  function toCanvas(value) {
    return value * scale;
  }

  function toImage(value) {
    return value / scale;
  }

  function hitTest(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const threshold = 10;

    const { vertical, horizontal } = computeSplitLines(
      item.width,
      item.height,
      item.settings
    );

    let best = null;
    let bestDistance = threshold + 1;

    for (let i = 0; i < vertical.length; i += 1) {
      const isEdge = i === 0 || i === vertical.length - 1;
      const hitSlop = isEdge ? 14 : threshold;
      const cx = toCanvas(vertical[i]);
      const distance = Math.abs(x - cx);
      if (distance <= hitSlop && distance < bestDistance) {
        best = { axis: /** @type {Axis} */ ('vertical'), lineIndex: i };
        bestDistance = distance;
      }
    }

    for (let i = 0; i < horizontal.length; i += 1) {
      const isEdge = i === 0 || i === horizontal.length - 1;
      const hitSlop = isEdge ? 14 : threshold;
      const cy = toCanvas(horizontal[i]);
      const distance = Math.abs(y - cy);
      if (distance <= hitSlop && distance < bestDistance) {
        best = { axis: /** @type {Axis} */ ('horizontal'), lineIndex: i };
        bestDistance = distance;
      }
    }

    return best;
  }

  function onPointerDown(e) {
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) {
      return;
    }
    dragging = hit;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = hit.axis === 'vertical' ? 'col-resize' : 'row-resize';
  }

  function onPointerMove(e) {
    if (dragging) {
      const rect = canvas.getBoundingClientRect();
      if (dragging.axis === 'vertical') {
        onLineDrag('vertical', dragging.lineIndex, toImage(e.clientX - rect.left));
      } else {
        onLineDrag('horizontal', dragging.lineIndex, toImage(e.clientY - rect.top));
      }
      return;
    }

    const hit = hitTest(e.clientX, e.clientY);
    if (hit) {
      canvas.style.cursor = hit.axis === 'vertical' ? 'col-resize' : 'row-resize';
    } else {
      canvas.style.cursor = 'crosshair';
    }
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

function drawLines(ctx, vertical, horizontal, canvasW, canvasH, imageW, imageH) {
  const sx = canvasW / imageW;
  const sy = canvasH / imageH;

  ctx.save();

  for (let i = 0; i < vertical.length; i += 1) {
    const isEdge = i === 0 || i === vertical.length - 1;
    const x = vertical[i] * sx;
    ctx.strokeStyle = isEdge ? 'rgba(255, 255, 255, 0.85)' : 'rgba(91, 141, 239, 0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash(isEdge ? [] : [6, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasH);
    ctx.stroke();
  }

  for (let i = 0; i < horizontal.length; i += 1) {
    const isEdge = i === 0 || i === horizontal.length - 1;
    const y = horizontal[i] * sy;
    ctx.strokeStyle = isEdge ? 'rgba(255, 255, 255, 0.85)' : 'rgba(91, 141, 239, 0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash(isEdge ? [] : [6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * @param {HTMLElement} container
 * @param {import('./state.js').QueuedImage} item
 * @param {number} [activePanelIndex]
 */
export function renderThumbnails(container, item, activePanelIndex = -1) {
  container.innerHTML = '';
  const urls = getPanelPreviewUrls(item);

  urls.forEach((url, index) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `thumbnail-item thumbnail-btn${index === activePanelIndex ? ' active' : ''}`;

    const img = document.createElement('img');
    img.src = url;
    img.alt = `Scene ${index + 1}`;

    const label = document.createElement('span');
    label.textContent = `Scene ${String(index + 1).padStart(2, '0')}`;

    el.appendChild(img);
    el.appendChild(label);
    el.dataset.panelIndex = String(index);
    container.appendChild(el);
  });
}

/**
 * @param {HTMLInputElement} input
 * @param {number} max
 */
export function syncSliderMax(input, max) {
  const clampedMax = Math.max(10, Math.round(max));
  input.max = String(clampedMax);
  if (Number(input.value) > clampedMax) {
    input.value = String(clampedMax);
  }
}

import { defaultGridForPanelCount } from './state.js';

/**
 * @typedef {import('./state.js').ImageSettings} ImageSettings
 * @typedef {import('./state.js').CropRect} CropRect
 * @typedef {import('./state.js').PanelCropInset} PanelCropInset
 */

const MIN_PANEL_SIZE = 12;

/**
 * @param {number} width
 * @param {number} height
 * @param {ImageSettings} settings
 * @returns {{ vertical: number[], horizontal: number[] }}
 */
export function computeSplitLines(width, height, settings) {
  const { grid } = settings;
  const vertical =
    settings.verticalBoundaries?.length === grid.cols + 1
      ? [...settings.verticalBoundaries]
      : computeAutoVertical(width, settings);
  const horizontal =
    settings.horizontalBoundaries?.length === grid.rows + 1
      ? [...settings.horizontalBoundaries]
      : computeAutoHorizontal(height, settings);

  return { vertical, horizontal };
}

function computeAutoVertical(width, settings) {
  const { grid, margins, gutters } = settings;
  const innerW = width - margins.left - margins.right;
  return buildAutoAxis(margins.left, innerW, grid.cols, gutters.x);
}

function computeAutoHorizontal(height, settings) {
  const { grid, margins, gutters } = settings;
  const innerH = height - margins.top - margins.bottom;
  return buildAutoAxis(margins.top, innerH, grid.rows, gutters.y);
}

function buildAutoAxis(origin, innerSize, count, gutter) {
  const lines = [origin];
  const cellSize = (innerSize - (count - 1) * gutter) / count;
  for (let i = 1; i < count; i += 1) {
    lines.push(origin + i * cellSize + (i - 1) * gutter);
  }
  lines.push(origin + innerSize);
  return lines;
}

/**
 * Section rects from grid lines only (phase 1).
 * @param {number} width
 * @param {number} height
 * @param {ImageSettings} settings
 * @returns {CropRect[]}
 */
export function computeSectionRects(width, height, settings) {
  const { vertical, horizontal } = computeSplitLines(width, height, settings);
  const rects = [];

  for (let r = 0; r < settings.grid.rows; r += 1) {
    for (let c = 0; c < settings.grid.cols; c += 1) {
      rects.push({
        x: Math.round(vertical[c]),
        y: Math.round(horizontal[r]),
        width: Math.max(1, Math.round(vertical[c + 1] - vertical[c])),
        height: Math.max(1, Math.round(horizontal[r + 1] - horizontal[r])),
      });
    }
  }

  return rects;
}

/**
 * @param {CropRect} cell
 * @param {PanelCropInset|null|undefined} inset
 * @returns {CropRect}
 */
export function applyPanelCropInset(cell, inset) {
  if (!inset) {
    return cell;
  }

  return {
    x: Math.round(cell.x + inset.left),
    y: Math.round(cell.y + inset.top),
    width: Math.max(1, Math.round(cell.width - inset.left - inset.right)),
    height: Math.max(1, Math.round(cell.height - inset.top - inset.bottom)),
  };
}

/**
 * Final export rects (phase 1 section + optional phase 2 crops).
 * @param {number} width
 * @param {number} height
 * @param {ImageSettings} settings
 * @returns {CropRect[]}
 */
export function computeCropRects(width, height, settings) {
  const sections = computeSectionRects(width, height, settings);
  const offsets = settings.panelCropOffsets;

  return sections.map((cell, index) =>
    applyPanelCropInset(cell, offsets?.[index] ?? null)
  );
}

/**
 * @param {CropRect} cell
 * @param {CropRect} crop
 * @returns {PanelCropInset}
 */
export function cropRectToInset(cell, crop) {
  return {
    top: crop.y - cell.y,
    left: crop.x - cell.x,
    right: cell.x + cell.width - (crop.x + crop.width),
    bottom: cell.y + cell.height - (crop.y + crop.height),
  };
}

/**
 * @param {CropRect} cell
 * @param {PanelCropInset|null|undefined} inset
 * @returns {CropRect}
 */
export function insetToCropRect(cell, inset) {
  return applyPanelCropInset(cell, inset ?? null);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {ImageSettings} settings
 * @param {number} panelIndex
 * @param {'top'|'bottom'|'left'|'right'} edge
 * @param {number} value image-space coordinate
 * @returns {ImageSettings}
 */
export function updatePanelCropEdge(width, height, settings, panelIndex, edge, value) {
  const sections = computeSectionRects(width, height, settings);
  const cell = sections[panelIndex];
  if (!cell) {
    return settings;
  }

  const offsets = settings.panelCropOffsets
    ? settings.panelCropOffsets.map((o) => (o ? { ...o } : null))
    : sections.map(() => null);

  const current = insetToCropRect(cell, offsets[panelIndex]);
  const next = { ...current };

  if (edge === 'left') {
    next.x = clamp(value, cell.x, current.x + current.width - MIN_PANEL_SIZE);
    next.width = current.x + current.width - next.x;
  } else if (edge === 'right') {
    const right = clamp(value, current.x + MIN_PANEL_SIZE, cell.x + cell.width);
    next.width = right - next.x;
  } else if (edge === 'top') {
    next.y = clamp(value, cell.y, current.y + current.height - MIN_PANEL_SIZE);
    next.height = current.y + current.height - next.y;
  } else {
    const bottom = clamp(value, current.y + MIN_PANEL_SIZE, cell.y + cell.height);
    next.height = bottom - next.y;
  }

  offsets[panelIndex] = cropRectToInset(cell, next);

  return {
    ...settings,
    panelCropOffsets: offsets,
  };
}

function clamp(value, min, max) {
  if (min > max) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

/** @param {number} width @param {number} height @param {ImageSettings} settings @returns {ImageSettings} */
export function ensurePanelCropOffsets(width, height, settings) {
  if (settings.panelCropOffsets?.length === settings.panelCount) {
    return settings;
  }
  const sections = computeSectionRects(width, height, settings);
  return {
    ...settings,
    panelCropOffsets: sections.map(() => null),
  };
}

export function updateBoundaryLine(width, height, settings, axis, lineIndex, value) {
  const { vertical, horizontal } = computeSplitLines(width, height, settings);
  const next = {
    ...settings,
    verticalBoundaries: [...vertical],
    horizontalBoundaries: [...horizontal],
    panelCropOffsets: null,
  };

  if (axis === 'vertical') {
    next.verticalBoundaries[lineIndex] = clampBoundary(
      value,
      lineIndex,
      next.verticalBoundaries,
      width
    );
  } else {
    next.horizontalBoundaries[lineIndex] = clampBoundary(
      value,
      lineIndex,
      next.horizontalBoundaries,
      height
    );
  }

  next.margins = {
    ...next.margins,
    left: Math.round(next.verticalBoundaries[0]),
    right: Math.round(width - next.verticalBoundaries[next.verticalBoundaries.length - 1]),
    top: Math.round(next.horizontalBoundaries[0]),
    bottom: Math.round(height - next.horizontalBoundaries[next.horizontalBoundaries.length - 1]),
  };

  return next;
}

function clampBoundary(value, lineIndex, boundaries, maxEdge) {
  const lastIndex = boundaries.length - 1;
  const min = lineIndex === 0 ? 0 : boundaries[lineIndex - 1] + MIN_PANEL_SIZE;
  const max =
    lineIndex === lastIndex ? maxEdge : boundaries[lineIndex + 1] - MIN_PANEL_SIZE;

  if (min > max) {
    return boundaries[lineIndex];
  }

  return Math.max(min, Math.min(max, value));
}

/** @param {ImageSettings} settings @returns {ImageSettings} */
export function resetManualLines(settings) {
  return {
    ...settings,
    verticalBoundaries: null,
    horizontalBoundaries: null,
  };
}

/** @param {ImageSettings} settings @param {number} panelIndex @returns {ImageSettings} */
export function resetPanelCrop(settings, panelIndex) {
  const offsets = settings.panelCropOffsets
    ? [...settings.panelCropOffsets]
    : [];
  offsets[panelIndex] = null;
  return { ...settings, panelCropOffsets: offsets };
}

/**
 * Copy selected panel's relative crop inset to every panel.
 * @param {number} width
 * @param {number} height
 * @param {ImageSettings} settings
 * @param {number} panelIndex
 * @returns {ImageSettings}
 */
export function applyPanelCropToAll(width, height, settings, panelIndex) {
  const sections = computeSectionRects(width, height, settings);
  const sourceCell = sections[panelIndex];
  const sourceInset = settings.panelCropOffsets?.[panelIndex];
  if (!sourceCell || !sourceInset) {
    return settings;
  }

  const sourceCrop = insetToCropRect(sourceCell, sourceInset);
  const offsets = sections.map((cell) => {
    const topPct = sourceInset.top / sourceCell.height;
    const bottomPct = sourceInset.bottom / sourceCell.height;
    const leftPct = sourceInset.left / sourceCell.width;
    const rightPct = sourceInset.right / sourceCell.width;

    return {
      top: Math.round(cell.height * topPct),
      bottom: Math.round(cell.height * bottomPct),
      left: Math.round(cell.width * leftPct),
      right: Math.round(cell.width * rightPct),
    };
  });

  // Preserve aspect of source crop - recalc from percentages
  void sourceCrop;

  return {
    ...settings,
    panelCropOffsets: offsets,
  };
}

/** @param {ImageSettings} source @returns {ImageSettings} */
export function cloneSettings(source) {
  return {
    panelCount: source.panelCount,
    grid: { ...source.grid },
    margins: { ...source.margins },
    gutters: { ...source.gutters },
    verticalBoundaries: source.verticalBoundaries ? [...source.verticalBoundaries] : null,
    horizontalBoundaries: source.horizontalBoundaries ? [...source.horizontalBoundaries] : null,
    panelCropOffsets: source.panelCropOffsets
      ? source.panelCropOffsets.map((o) => (o ? { ...o } : null))
      : null,
  };
}

/** @param {number} panelCount @param {ImageSettings} settings @returns {ImageSettings} */
export function applyPanelCount(panelCount, settings) {
  return {
    ...settings,
    panelCount,
    grid: defaultGridForPanelCount(panelCount),
    verticalBoundaries: null,
    horizontalBoundaries: null,
    panelCropOffsets: null,
  };
}

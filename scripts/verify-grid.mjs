import { computeCropRects, computeSplitLines, updateBoundaryLine } from '../src/grid.js';
import { createDefaultSettings } from '../src/state.js';

const width = 1200;
const height = 800;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const panelCount of [4, 6, 8, 12]) {
  const settings = createDefaultSettings(panelCount);
  const rects = computeCropRects(width, height, settings);
  assert(rects.length === panelCount, `${panelCount} panels should produce ${panelCount} rects`);
  assert(
    rects.every((r) => r.width > 0 && r.height > 0),
    `${panelCount} panel rects must be positive`
  );

  const totalArea = rects.reduce((sum, r) => sum + r.width * r.height, 0);
  const imageArea = width * height;
  assert(
    totalArea >= imageArea * 0.98 && totalArea <= imageArea * 1.02,
    `${panelCount} panel total area should approximate image area (${totalArea} vs ${imageArea})`
  );

  for (const rect of rects) {
    assert(rect.x >= 0 && rect.y >= 0, `${panelCount} rect origin in bounds`);
    assert(rect.x + rect.width <= width + 1, `${panelCount} rect width in bounds`);
    assert(rect.y + rect.height <= height + 1, `${panelCount} rect height in bounds`);
  }
}

const settings6 = createDefaultSettings(6);
settings6.grid = { rows: 3, cols: 2 };
settings6.gutters = { x: 10, y: 10 };
settings6.margins = { top: 20, bottom: 20, left: 20, right: 20 };
const rects6 = computeCropRects(width, height, settings6);
assert(rects6.length === 6, '3x2 grid yields 6 rects');

let manual = updateBoundaryLine(width, height, settings6, 'vertical', 1, 620);
manual = updateBoundaryLine(width, height, manual, 'horizontal', 1, 410);
manual = updateBoundaryLine(width, height, manual, 'vertical', 0, 30);
manual = updateBoundaryLine(width, height, manual, 'vertical', 2, 1180);
const manualRects = computeCropRects(width, height, manual);
assert(manualRects.length === 6, 'manual lines still yield 6 rects');
const { vertical, horizontal } = computeSplitLines(width, height, manual);
assert(Math.abs(vertical[1] - 620) < 1, 'vertical internal line stored');
assert(Math.abs(horizontal[1] - 410) < 1, 'horizontal internal line stored');
assert(Math.abs(vertical[0] - 30) < 1, 'vertical outer line stored');
assert(Math.abs(vertical[2] - 1180) < 1, 'vertical outer line stored');

console.log('All grid verification checks passed.');

import { computeCropRects } from './grid.js';
import { cropToBlob } from './cropEngine.js';

/**
 * @typedef {Object} SceneExport
 * @property {number} order
 * @property {string} id
 * @property {string} filename
 * @property {Blob} blob
 * @property {string} previewUrl
 * @property {string} sourceSheet
 * @property {number} sourceSheetOrder
 * @property {number} sourcePanel
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} ExportManifest
 * @property {string} version
 * @property {string} workflow
 * @property {string} exportedAt
 * @property {Object} project
 * @property {Object[]} scenes
 * @property {Object} ai
 */

/**
 * @param {import('./state.js').QueuedImage[]} images
 * @param {string} projectTitle
 * @returns {Promise<{ scenes: SceneExport[], manifest: ExportManifest }>}
 */
export async function buildExportPackage(images, projectTitle = 'Untitled Short Film') {
  /** @type {SceneExport[]} */
  const scenes = [];
  let order = 1;

  for (let sheetIndex = 0; sheetIndex < images.length; sheetIndex += 1) {
    const item = images[sheetIndex];
    const rects = computeCropRects(item.width, item.height, item.settings);

    for (let panelIndex = 0; panelIndex < rects.length; panelIndex += 1) {
      const rect = rects[panelIndex];
      const blob = await cropToBlob(item.image, rect);
      const id = `scene-${pad3(order)}`;

      scenes.push({
        order,
        id,
        filename: `scenes/${id}.png`,
        blob,
        previewUrl: URL.createObjectURL(blob),
        sourceSheet: item.name,
        sourceSheetOrder: sheetIndex + 1,
        sourcePanel: panelIndex + 1,
        width: rect.width,
        height: rect.height,
      });

      order += 1;
    }
  }

  const manifest = buildManifest(scenes, images, projectTitle);
  return { scenes, manifest };
}

/**
 * @param {SceneExport[]} scenes
 * @param {import('./state.js').QueuedImage[]} images
 * @param {string} projectTitle
 * @returns {ExportManifest}
 */
function buildManifest(scenes, images, projectTitle) {
  return {
    version: '1.0',
    workflow: 'short-film-storyboard',
    exportedAt: new Date().toISOString(),
    project: {
      title: projectTitle,
      sceneCount: scenes.length,
      sourceSheetCount: images.length,
    },
    scenes: scenes.map((scene) => ({
      id: scene.id,
      order: scene.order,
      filename: scene.filename,
      sourceSheet: scene.sourceSheet,
      sourceSheetOrder: scene.sourceSheetOrder,
      sourcePanel: scene.sourcePanel,
      width: scene.width,
      height: scene.height,
      shot: '',
      action: '',
      dialogue: '',
      notes: '',
    })),
    ai: {
      ready: true,
      pipeline: 'short-film',
      nextSteps: [
        'analyze-scenes',
        'extract-shot-metadata',
        'generate-prompts',
        'story-to-video',
      ],
    },
  };
}

/**
 * @param {{ scenes: SceneExport[], manifest: ExportManifest }|null} pkg
 */
export function revokeExportPackage(pkg) {
  if (!pkg) {
    return;
  }
  for (const scene of pkg.scenes) {
    URL.revokeObjectURL(scene.previewUrl);
  }
}

/** @param {number} n @returns {string} */
function pad3(n) {
  return String(n).padStart(3, '0');
}

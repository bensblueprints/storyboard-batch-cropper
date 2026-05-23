/**
 * @typedef {import('./exportPackage.js').SceneExport} SceneExport
 * @typedef {Object} SceneOverride
 * @property {string} name
 * @property {Blob} blob
 * @property {string} previewUrl
 * @typedef {Object} ExtraAsset
 * @property {string} id
 * @property {string} name
 * @property {'image'|'audio'} type
 * @property {Blob} blob
 * @property {string} previewUrl
 */

import { resolveModelForScene } from './falModels.js';
import { isAutoDuration, resolveSceneDurationSeconds } from './sceneDuration.js';

const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;

export const DEFAULT_HAPPY_HORSE_PROMPT = 'Bring the scene in the image to life.';

/**
 * @param {SceneExport[]} scenes
 * @param {import('./exportPackage.js').ExportManifest|null} manifest
 * @param {Record<string, string>} scenePromptMap
 */
export function ensureScenePrompts(scenes, manifest, scenePromptMap) {
  for (const scene of scenes) {
    if (scenePromptMap[scene.id] !== undefined) {
      continue;
    }
    const meta = manifest?.scenes?.find((entry) => entry.id === scene.id);
    const parts = [meta?.action, meta?.dialogue, meta?.notes].filter(
      (part) => part && String(part).trim()
    );
    scenePromptMap[scene.id] = parts.length ? parts.join('. ') : DEFAULT_HAPPY_HORSE_PROMPT;
  }
}

/**
 * @param {string} sceneId
 * @param {Record<string, string>} scenePromptMap
 * @returns {string}
 */
export function getScenePrompt(sceneId, scenePromptMap) {
  const prompt = scenePromptMap[sceneId]?.trim();
  return prompt || DEFAULT_HAPPY_HORSE_PROMPT;
}

/**
 * @param {Blob} blob
 * @param {number} [width]
 * @param {number} [height]
 * @returns {Promise<Blob>}
 */
export async function blobTo16x9(blob, width = TARGET_WIDTH, height = TARGET_HEIGHT) {
  const bitmap = await loadBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas not supported');
  }

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  const scale = Math.min(width / bitmap.width, height / bitmap.height);
  const drawW = bitmap.width * scale;
  const drawH = bitmap.height * scale;
  const x = (width - drawW) / 2;
  const y = (height - drawH) / 2;
  ctx.drawImage(bitmap, x, y, drawW, drawH);

  return canvasToBlob(canvas);
}

/**
 * @param {SceneExport} scene
 * @param {Record<string, SceneOverride>} overrides
 * @returns {Blob}
 */
export function getEffectiveSceneBlob(scene, overrides) {
  return overrides[scene.id]?.blob ?? scene.blob;
}

/**
 * @param {SceneExport} scene
 * @param {Record<string, SceneOverride>} overrides
 * @returns {string}
 */
export function getEffectiveScenePreview(scene, overrides) {
  return overrides[scene.id]?.previewUrl ?? scene.previewUrl;
}

/**
 * @param {SceneExport[]} scenes
 * @param {Record<string, SceneOverride>} overrides
 * @param {Record<string, string|null>} sceneAudioMap
 * @param {Record<string, string>} scenePromptMap
 * @param {Record<string, import('./sceneReferences.js').SceneReferenceImage[]>} sceneReferenceMap
 * @param {ExtraAsset[]} extraAssets
 * @param {string} projectTitle
 * @param {Record<string, import('./sceneDuration.js').SceneDurationSetting>} sceneDurationMap
 * @param {number} globalDuration
 * @param {string} [selectedModel]
 * @returns {Promise<{ scenes: Object[], job: Object, blobs: { id: string, blob: Blob }[], audioFiles: { filename: string, blob: Blob }[] }>}
 */
export async function buildHappyHorseJob(
  scenes,
  overrides,
  sceneAudioMap,
  scenePromptMap,
  sceneReferenceMap,
  extraAssets,
  projectTitle,
  sceneDurationMap,
  globalDuration,
  selectedModel = 'alibaba/happy-horse/image-to-video'
) {
  /** @type {Object[]} */
  const jobScenes = [];
  /** @type {{ id: string, blob: Blob }[]} */
  const blobs = [];
  /** @type {{ filename: string, blob: Blob }[]} */
  const audioFiles = [];
  const audioById = new Map(extraAssets.filter((a) => a.type === 'audio').map((a) => [a.id, a]));

  for (const scene of scenes) {
    const sourceBlob = getEffectiveSceneBlob(scene, overrides);
    const frameBlob = await blobTo16x9(sourceBlob);
    const frameFilename = `scenes-16x9/${scene.id}.png`;
    blobs.push({ id: scene.id, blob: frameBlob });

    const audioId = sceneAudioMap[scene.id] ?? null;
    const audioAsset = audioId ? audioById.get(audioId) : null;
    let audioFilename = null;

    if (audioAsset) {
      const ext = extensionFromName(audioAsset.name);
      audioFilename = `audio/${scene.id}${ext}`;
      if (!audioFiles.some((f) => f.filename === audioFilename)) {
        audioFiles.push({ filename: audioFilename, blob: audioAsset.blob });
      }
    }

    const refCount = (sceneReferenceMap[scene.id] ?? []).length;
    const effectiveModel = resolveModelForScene(selectedModel, refCount);
    const durationSetting = sceneDurationMap[scene.id];
    const durationSeconds = await resolveSceneDurationSeconds(
      scene.id,
      sceneDurationMap,
      globalDuration,
      sceneAudioMap,
      audioById,
      effectiveModel
    );

    jobScenes.push({
      id: scene.id,
      order: scene.order,
      frame: frameFilename,
      audio: audioFilename,
      prompt: getScenePrompt(scene.id, scenePromptMap),
      referenceImages: (sceneReferenceMap[scene.id] ?? []).map(
        (ref, index) => `scene-references/${scene.id}/ref-${String(index + 1).padStart(2, '0')}-${sanitizeFilename(ref.name)}`
      ),
      aspectRatio: '16:9',
      resolution: { width: TARGET_WIDTH, height: TARGET_HEIGHT },
      duration: durationSeconds,
      durationMode: isAutoDuration(durationSetting) ? 'auto' : 'manual',
      replaced: Boolean(overrides[scene.id]),
      sourceSheet: scene.sourceSheet,
      sourcePanel: scene.sourcePanel,
    });
  }

  const extraImages = extraAssets
    .filter((a) => a.type === 'image')
    .map((asset, index) => ({
      id: asset.id,
      filename: `extra-assets/extra-${String(index + 1).padStart(2, '0')}-${sanitizeFilename(asset.name)}`,
      name: asset.name,
    }));

  const job = {
    version: '1.0',
    engine: 'fal-ai',
    workflow: 'short-film-16x9-audio',
    createdAt: new Date().toISOString(),
    project: {
      title: projectTitle,
      sceneCount: scenes.length,
    },
    output: {
      aspectRatio: '16:9',
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
      withAudio: jobScenes.some((s) => s.audio),
      model: selectedModel,
      defaultDuration: globalDuration,
    },
    scenes: jobScenes,
    extraAssets: extraImages,
  };

  return { scenes: jobScenes, job, blobs, audioFiles };
}

/**
 * @param {Object[]} jobScenes
 * @param {import('./falVideo.js').SceneVideoResult[]} videoResults
 * @returns {Object[]}
 */
export function attachVideoResults(jobScenes, videoResults) {
  const byId = new Map(videoResults.map((v) => [v.sceneId, v]));
  return jobScenes.map((scene) => {
    const video = byId.get(scene.id);
    if (!video) {
      return scene;
    }
    return {
      ...scene,
      video: `videos/${scene.id}.mp4`,
      falVideoUrl: video.videoUrl,
      falRequestId: video.requestId,
      seed: video.seed,
    };
  });
}

/**
 * @param {Blob} file
 * @returns {Promise<'image'|'audio'>}
 */
export async function detectAssetType(file) {
  if (file.type.startsWith('audio/')) {
    return 'audio';
  }
  if (file.type.startsWith('image/')) {
    return 'image';
  }
  const ext = extensionFromName(file.name).toLowerCase();
  if (['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm'].includes(ext)) {
    return 'audio';
  }
  return 'image';
}

/**
 * @param {Record<string, SceneOverride>} overrides
 */
export function revokeSceneOverrides(overrides) {
  for (const override of Object.values(overrides)) {
    URL.revokeObjectURL(override.previewUrl);
  }
}

/**
 * @param {ExtraAsset[]} assets
 */
export function revokeExtraAssets(assets) {
  for (const asset of assets) {
    URL.revokeObjectURL(asset.previewUrl);
  }
}

/** @param {Blob} blob @returns {Promise<ImageBitmap|HTMLImageElement>} */
async function loadBitmap(blob) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** @param {HTMLCanvasElement} canvas @returns {Promise<Blob>} */
function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to encode 16:9 frame'));
        }
      },
      'image/png',
      1
    );
  });
}

/** @param {string} name @returns {string} */
function extensionFromName(name) {
  const match = name.match(/\.[^.]+$/);
  return match ? match[0] : '.bin';
}

/** @param {string} name @returns {string} */
function sanitizeFilename(name) {
  return name.replace(/[^\w.\-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
}

export { TARGET_WIDTH, TARGET_HEIGHT };

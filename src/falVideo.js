import { fal } from '@fal-ai/client';
import { blobTo16x9, getEffectiveSceneBlob, getScenePrompt } from './generation.js';
import { resolveModelForScene, supportsReferenceImages } from './falModels.js';
import { resolveSceneDurationSeconds } from './sceneDuration.js';

/** @typedef {import('./exportPackage.js').SceneExport} SceneExport */
/** @typedef {import('./sceneReferences.js').SceneReferenceImage} SceneReferenceImage */

/**
 * @typedef {Object} VideoGenerationOptions
 * @property {string} modelId
 * @property {string} [prompt]
 * @property {Record<string, string>} [scenePromptMap]
 * @property {Record<string, SceneReferenceImage[]>} [sceneReferenceMap]
 * @property {Record<string, import('./sceneDuration.js').SceneDurationSetting>} [sceneDurationMap]
 * @property {Record<string, string|null>} [sceneAudioMap]
 * @property {import('./generation.js').ExtraAsset[]} [extraAssets]
 * @property {number} [duration]
 * @property {number} [globalDuration]
 * @property {(message: string) => void} [onProgress]
 */

/**
 * @typedef {Object} SceneVideoResult
 * @property {string} sceneId
 * @property {number} order
 * @property {string} modelId
 * @property {string} videoUrl
 * @property {number|null} seed
 * @property {string} requestId
 * @property {Blob|null} videoBlob
 */

/** @param {string} apiKey */
export function configureFal(apiKey) {
  if (!apiKey) {
    throw new Error('FAL API key is required. Add your key in Step 4 before generating.');
  }
  fal.config({ credentials: apiKey });
}

/**
 * @param {SceneExport} scene
 * @param {Record<string, import('./generation.js').SceneOverride>} overrides
 * @param {VideoGenerationOptions} options
 * @returns {Promise<SceneVideoResult>}
 */
export async function generateSceneVideo(scene, overrides, options) {
  const {
    modelId,
    prompt = 'Bring the scene in the image to life.',
    duration = 5,
    sceneReferenceMap = {},
    onProgress,
  } = options;

  const refs = sceneReferenceMap[scene.id] ?? [];
  const effectiveModel = resolveModelForScene(modelId, refs.length);

  onProgress?.(`Uploading ${scene.id}…`);
  const frameBlob = await blobTo16x9(getEffectiveSceneBlob(scene, overrides));
  const mainFile = new File([frameBlob], `${scene.id}.png`, { type: 'image/png' });
  const mainImageUrl = await fal.storage.upload(mainFile);

  /** @type {string[]} */
  const refUrls = [];
  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index];
    onProgress?.(`Uploading ${scene.id} reference ${index + 1}/${refs.length}…`);
    const refFile = new File([ref.blob], ref.name, { type: ref.blob.type || 'image/png' });
    refUrls.push(await fal.storage.upload(refFile));
  }

  const input = buildModelInput(effectiveModel, {
    mainImageUrl,
    refUrls,
    prompt,
    duration,
  });

  onProgress?.(`Generating ${scene.id} (${effectiveModel})…`);
  const result = await fal.subscribe(effectiveModel, {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS' && update.logs?.length) {
        const last = update.logs[update.logs.length - 1];
        if (last?.message) {
          onProgress?.(`${scene.id}: ${last.message}`);
        }
      }
    },
  });

  const videoUrl = extractVideoUrl(result.data);
  if (!videoUrl) {
    throw new Error(`No video returned for ${scene.id}`);
  }

  onProgress?.(`Downloading ${scene.id}…`);
  const videoBlob = await fetchVideoBlob(videoUrl);

  return {
    sceneId: scene.id,
    order: scene.order,
    modelId: effectiveModel,
    videoUrl,
    seed: typeof result.data?.seed === 'number' ? result.data.seed : null,
    requestId: result.requestId,
    videoBlob,
  };
}

/**
 * @param {SceneExport[]} scenes
 * @param {Record<string, import('./generation.js').SceneOverride>} overrides
 * @param {VideoGenerationOptions & { onSceneComplete?: (result: SceneVideoResult, index: number, total: number) => void }} options
 * @returns {Promise<SceneVideoResult[]>}
 */
export async function generateAllSceneVideos(scenes, overrides, options) {
  const {
    onSceneComplete,
    onProgress,
    scenePromptMap,
    sceneDurationMap = {},
    sceneAudioMap = {},
    extraAssets = [],
    globalDuration,
    duration,
    ...sceneOptions
  } = options;
  const fallbackDuration = globalDuration ?? duration ?? 5;
  const audioById = new Map(
    extraAssets.filter((asset) => asset.type === 'audio').map((asset) => [asset.id, asset])
  );
  /** @type {SceneVideoResult[]} */
  const results = [];

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    onProgress?.(`Scene ${index + 1}/${scenes.length} — ${scene.id}`);
    const prompt = scenePromptMap
      ? getScenePrompt(scene.id, scenePromptMap)
      : sceneOptions.prompt;
    const refCount = (options.sceneReferenceMap?.[scene.id] ?? []).length;
    const effectiveModel = resolveModelForScene(sceneOptions.modelId, refCount);
    const sceneDuration = await resolveSceneDurationSeconds(
      scene.id,
      sceneDurationMap,
      fallbackDuration,
      sceneAudioMap,
      audioById,
      effectiveModel
    );
    const result = await generateSceneVideo(scene, overrides, {
      ...sceneOptions,
      scenePromptMap,
      prompt,
      duration: sceneDuration,
      onProgress,
    });
    results.push(result);
    onSceneComplete?.(result, index, scenes.length);
  }

  return results;
}

/**
 * @param {string} modelId
 * @param {{ mainImageUrl: string, refUrls: string[], prompt: string, duration: number }} payload
 * @returns {Record<string, unknown>}
 */
function buildModelInput(modelId, payload) {
  const { mainImageUrl, refUrls, prompt, duration } = payload;

  if (supportsReferenceImages(modelId) && refUrls.length > 0) {
    return {
      prompt: buildReferencePrompt(prompt, refUrls.length),
      image_urls: [mainImageUrl, ...refUrls].slice(0, 9),
      aspect_ratio: '16:9',
      resolution: '1080p',
      duration,
    };
  }

  if (supportsReferenceImages(modelId)) {
    return {
      prompt,
      image_urls: [mainImageUrl],
      aspect_ratio: '16:9',
      resolution: '1080p',
      duration,
    };
  }

  /** @type {Record<string, unknown>} */
  const input = {
    image_url: mainImageUrl,
    prompt,
  };

  if (modelId.includes('happy-horse')) {
    input.resolution = '1080p';
    input.duration = duration;
  } else if (modelId.includes('kling') || modelId.includes('minimax') || modelId.includes('pika')) {
    input.duration = String(duration);
  }

  if (refUrls.length > 0) {
    input.image_urls = refUrls.slice(0, 8);
  }

  return input;
}

/** @param {string} prompt @param {number} refCount @returns {string} */
function buildReferencePrompt(prompt, refCount) {
  if (refCount === 0) {
    return prompt;
  }
  const tags = Array.from({ length: refCount }, (_, index) => `character${index + 1}`).join(', ');
  if (/character\d+/i.test(prompt)) {
    return prompt;
  }
  return `${prompt} (${tags} from reference images)`;
}

/** @param {unknown} data @returns {string|null} */
function extractVideoUrl(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const record = /** @type {Record<string, unknown>} */ (data);
  const video = record.video;
  if (video && typeof video === 'object' && video !== null && 'url' in video) {
    const url = /** @type {{ url?: string }} */ (video).url;
    return url ?? null;
  }
  if (typeof record.video_url === 'string') {
    return record.video_url;
  }
  return null;
}

/** @param {string} url @returns {Promise<Blob>} */
async function fetchVideoBlob(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download video (${response.status})`);
  }
  return response.blob();
}

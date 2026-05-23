/** @typedef {'auto' | number} SceneDurationSetting */

export const DURATION_OPTIONS = [3, 4, 5, 6, 7, 8, 10, 15];

/** @param {SceneDurationSetting|undefined|null} value @returns {boolean} */
export function isAutoDuration(value) {
  return value === 'auto' || value === undefined || value === null;
}

/** @param {number} seconds @param {string} modelId @returns {number} */
export function clampDurationForModel(modelId, seconds) {
  const rounded = Math.max(1, Math.round(seconds));
  const id = modelId.toLowerCase();
  if (id.includes('kling')) {
    return rounded <= 7 ? 5 : 10;
  }
  return Math.max(3, Math.min(15, rounded));
}

/** @param {Blob} blob @returns {Promise<number|null>} */
export async function getAudioDurationSeconds(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio();
    await new Promise((resolve, reject) => {
      audio.addEventListener('loadedmetadata', resolve, { once: true });
      audio.addEventListener('error', reject, { once: true });
      audio.src = url;
    });
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      return null;
    }
    return Math.max(1, Math.round(audio.duration * 10) / 10);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * @param {string} sceneId
 * @param {Record<string, SceneDurationSetting>} sceneDurationMap
 * @param {number} globalDuration
 * @param {Record<string, string|null>} sceneAudioMap
 * @param {Map<string, { blob: Blob }>} audioById
 * @param {string} modelId
 * @returns {Promise<number>}
 */
export async function resolveSceneDurationSeconds(
  sceneId,
  sceneDurationMap,
  globalDuration,
  sceneAudioMap,
  audioById,
  modelId
) {
  const setting = sceneDurationMap[sceneId];
  if (!isAutoDuration(setting)) {
    return clampDurationForModel(modelId, Number(setting));
  }

  const audioId = sceneAudioMap[sceneId];
  const audio = audioId ? audioById.get(audioId) : null;
  if (audio) {
    const fromAudio = await getAudioDurationSeconds(audio.blob);
    if (fromAudio) {
      return clampDurationForModel(modelId, fromAudio);
    }
  }

  return clampDurationForModel(modelId, globalDuration);
}

/**
 * @param {string} sceneId
 * @param {Record<string, SceneDurationSetting>} sceneDurationMap
 * @param {number} globalDuration
 * @param {Record<string, string|null>} sceneAudioMap
 * @param {Map<string, { blob: Blob, name: string }>} audioById
 * @param {number|null} [cachedAudioSeconds]
 * @returns {string}
 */
export function describeSceneDuration(
  sceneId,
  sceneDurationMap,
  globalDuration,
  sceneAudioMap,
  audioById,
  cachedAudioSeconds = null
) {
  const setting = sceneDurationMap[sceneId];
  if (!isAutoDuration(setting)) {
    return `${setting}s`;
  }

  const audioId = sceneAudioMap[sceneId];
  const audio = audioId ? audioById.get(audioId) : null;
  if (audio && cachedAudioSeconds) {
    return `Auto · ${cachedAudioSeconds}s from ${audio.name}`;
  }
  if (audio) {
    return 'Auto · from attached audio';
  }
  return `Auto · ${globalDuration}s default`;
}

/** @param {number} cost @param {string} [currency] @returns {string} */
export function formatUsd(cost, currency = 'USD') {
  if (!Number.isFinite(cost)) {
    return '—';
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(cost);
  } catch {
    return `$${cost.toFixed(2)}`;
  }
}

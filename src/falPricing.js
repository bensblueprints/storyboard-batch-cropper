import { resolveModelForScene } from './falModels.js';
import { resolveSceneDurationSeconds } from './sceneDuration.js';

/** @typedef {{ unit_price: number, unit: string, currency: string }} ModelPricing */

/**
 * @param {string} apiKey
 * @param {string[]} endpointIds
 * @returns {Promise<Map<string, ModelPricing>>}
 */
export async function fetchModelPricing(apiKey, endpointIds) {
  /** @type {Map<string, ModelPricing>} */
  const prices = new Map();
  const unique = [...new Set(endpointIds.filter(Boolean))];
  if (!unique.length) {
    return prices;
  }

  for (let index = 0; index < unique.length; index += 50) {
    const batch = unique.slice(index, index + 50);
    const url = new URL('https://api.fal.ai/v1/models/pricing');
    for (const endpointId of batch) {
      url.searchParams.append('endpoint_id', endpointId);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        Authorization: `Key ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`FAL pricing returned ${response.status}`);
    }

    const data = await response.json();
    for (const entry of data.prices ?? []) {
      if (!entry.endpoint_id) {
        continue;
      }
      prices.set(entry.endpoint_id, {
        unit_price: entry.unit_price,
        unit: entry.unit,
        currency: entry.currency ?? 'USD',
      });
    }
  }

  return prices;
}

/**
 * @param {ModelPricing} pricing
 * @param {number} durationSeconds
 * @returns {number}
 */
export function estimateSceneCostFromPricing(pricing, durationSeconds) {
  const unit = pricing.unit.toLowerCase();
  if (unit.includes('second') || unit === 's' || unit === 'sec') {
    return pricing.unit_price * durationSeconds;
  }
  return pricing.unit_price;
}

/**
 * @param {string} apiKey
 * @param {string} endpointId
 * @returns {Promise<number|null>}
 */
async function estimateHistoricalCallCost(apiKey, endpointId) {
  const response = await fetch('https://api.fal.ai/v1/models/pricing/estimate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify({
      estimate_type: 'historical_api_price',
      endpoints: {
        [endpointId]: { call_quantity: 1 },
      },
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return typeof data.total_cost === 'number' ? data.total_cost : null;
}

/**
 * @typedef {Object} SceneCostEstimate
 * @property {number} cost
 * @property {string} currency
 * @property {number} durationSeconds
 * @property {string} modelId
 */

/**
 * @param {string} apiKey
 * @param {import('./exportPackage.js').SceneExport[]} scenes
 * @param {Object} options
 * @param {string} options.modelId
 * @param {Record<string, import('./sceneDuration.js').SceneDurationSetting>} options.sceneDurationMap
 * @param {number} options.globalDuration
 * @param {Record<string, string|null>} options.sceneAudioMap
 * @param {Array<{ id: string, type: string, blob: Blob }>} options.extraAssets
 * @param {Record<string, import('./sceneReferences.js').SceneReferenceImage[]>} options.sceneReferenceMap
 * @returns {Promise<{ perScene: Record<string, SceneCostEstimate>, total: number, currency: string }>}
 */
export async function estimateGenerationCosts(apiKey, scenes, options) {
  const {
    modelId,
    sceneDurationMap,
    globalDuration,
    sceneAudioMap,
    extraAssets,
    sceneReferenceMap,
  } = options;

  const audioById = new Map(
    extraAssets.filter((asset) => asset.type === 'audio').map((asset) => [asset.id, asset])
  );

  /** @type {Record<string, SceneCostEstimate>} */
  const perScene = {};
  /** @type {string[]} */
  const endpointIds = [];

  for (const scene of scenes) {
    const refCount = (sceneReferenceMap[scene.id] ?? []).length;
    const effectiveModel = resolveModelForScene(modelId, refCount);
    endpointIds.push(effectiveModel);

    const durationSeconds = await resolveSceneDurationSeconds(
      scene.id,
      sceneDurationMap,
      globalDuration,
      sceneAudioMap,
      audioById,
      effectiveModel
    );

    perScene[scene.id] = {
      cost: 0,
      currency: 'USD',
      durationSeconds,
      modelId: effectiveModel,
    };
  }

  const pricingMap = await fetchModelPricing(apiKey, endpointIds);
  let total = 0;
  let currency = 'USD';

  for (const scene of scenes) {
    const entry = perScene[scene.id];
    const pricing = pricingMap.get(entry.modelId);
    let cost = null;

    if (pricing) {
      cost = estimateSceneCostFromPricing(pricing, entry.durationSeconds);
      currency = pricing.currency || currency;
    } else {
      cost = await estimateHistoricalCallCost(apiKey, entry.modelId);
    }

    entry.cost = cost ?? 0;
    entry.currency = currency;
    total += entry.cost;
  }

  return { perScene, total, currency };
}

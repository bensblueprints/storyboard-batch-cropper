/** @typedef {{ endpoint_id: string, display_name: string, description: string, category: string, supports_refs: boolean }} FalVideoModel */

export const DEFAULT_I2V_MODEL = 'alibaba/happy-horse/image-to-video';

/** @type {FalVideoModel[]} */
export const FALLBACK_I2V_MODELS = [
  {
    endpoint_id: 'alibaba/happy-horse/image-to-video',
    display_name: 'Happy Horse 1.0',
    description: '1080p video with synchronized native audio',
    category: 'image-to-video',
    supports_refs: false,
  },
  {
    endpoint_id: 'alibaba/happy-horse/reference-to-video',
    display_name: 'Happy Horse Reference',
    description: 'Reference images + prompt for subject consistency',
    category: 'image-to-video',
    supports_refs: true,
  },
  {
    endpoint_id: 'fal-ai/minimax/video-01/image-to-video',
    display_name: 'MiniMax Video 01',
    description: 'Image to video generation',
    category: 'image-to-video',
    supports_refs: false,
  },
  {
    endpoint_id: 'fal-ai/kling-video/v2/master/image-to-video',
    display_name: 'Kling v2 Master',
    description: 'High quality image-to-video',
    category: 'image-to-video',
    supports_refs: false,
  },
  {
    endpoint_id: 'fal-ai/pika/v2/turbo/image-to-video',
    display_name: 'Pika v2 Turbo',
    description: 'Fast image-to-video',
    category: 'image-to-video',
    supports_refs: false,
  },
  {
    endpoint_id: 'fal-ai/luma-dream-machine/ray-2/image-to-video',
    display_name: 'Luma Ray 2',
    description: 'Cinematic image-to-video',
    category: 'image-to-video',
    supports_refs: false,
  },
];

/**
 * @param {string} [apiKey]
 * @returns {Promise<FalVideoModel[]>}
 */
export async function fetchImageToVideoModels(apiKey) {
  /** @type {FalVideoModel[]} */
  const models = [];
  /** @type {string|null} */
  let cursor = null;

  try {
    do {
      const url = new URL('https://api.fal.ai/v1/models');
      url.searchParams.set('category', 'image-to-video');
      url.searchParams.set('status', 'active');
      url.searchParams.set('limit', '100');
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }

      /** @type {Record<string, string>} */
      const headers = { Accept: 'application/json' };
      if (apiKey) {
        headers.Authorization = `Key ${apiKey}`;
      }

      const response = await fetch(url.toString(), { headers });
      if (!response.ok) {
        throw new Error(`FAL model catalog returned ${response.status}`);
      }

      const data = await response.json();
      for (const entry of data.models ?? []) {
        const endpointId = entry.endpoint_id;
        if (!endpointId) {
          continue;
        }
        models.push({
          endpoint_id: endpointId,
          display_name: entry.metadata?.display_name ?? endpointId,
          description: entry.metadata?.description ?? '',
          category: entry.metadata?.category ?? 'image-to-video',
          supports_refs: supportsReferenceImages(endpointId),
        });
      }

      cursor = data.next_cursor ?? null;
    } while (cursor);
  } catch {
    return [...FALLBACK_I2V_MODELS];
  }

  if (!models.length) {
    return [...FALLBACK_I2V_MODELS];
  }

  const seen = new Set();
  return models.filter((model) => {
    if (seen.has(model.endpoint_id)) {
      return false;
    }
    seen.add(model.endpoint_id);
    return true;
  });
}

/** @param {string} endpointId @returns {boolean} */
export function supportsReferenceImages(endpointId) {
  const id = endpointId.toLowerCase();
  return id.includes('reference-to-video') || id.includes('reference_to_video') || id.includes('/reference');
}

/**
 * @param {string} modelId
 * @param {number} refCount
 * @returns {string}
 */
export function resolveModelForScene(modelId, refCount) {
  if (refCount === 0) {
    return modelId;
  }
  if (modelId === 'alibaba/happy-horse/image-to-video') {
    return 'alibaba/happy-horse/reference-to-video';
  }
  if (supportsReferenceImages(modelId)) {
    return modelId;
  }
  return modelId;
}

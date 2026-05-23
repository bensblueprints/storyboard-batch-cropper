/** @typedef {{ id: string, name: string, blob: Blob, previewUrl: string }} SceneReferenceImage */

/**
 * @param {Record<string, SceneReferenceImage[]>} sceneReferenceMap
 * @param {string} sceneId
 */
export function revokeSceneReferences(sceneReferenceMap, sceneId) {
  const refs = sceneReferenceMap[sceneId];
  if (!refs) {
    return;
  }
  for (const ref of refs) {
    URL.revokeObjectURL(ref.previewUrl);
  }
  delete sceneReferenceMap[sceneId];
}

/**
 * @param {Record<string, SceneReferenceImage[]>} sceneReferenceMap
 */
export function revokeAllSceneReferences(sceneReferenceMap) {
  for (const sceneId of Object.keys(sceneReferenceMap)) {
    revokeSceneReferences(sceneReferenceMap, sceneId);
  }
}

/**
 * @param {Record<string, SceneReferenceImage[]>} sceneReferenceMap
 * @param {string} sceneId
 * @returns {SceneReferenceImage[]}
 */
export function getSceneReferences(sceneReferenceMap, sceneId) {
  return sceneReferenceMap[sceneId] ?? [];
}

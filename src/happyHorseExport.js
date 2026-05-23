import JSZip from 'jszip';

/**
 * @typedef {Object} HappyHorseZipPayload
 * @property {Object} job
 * @property {{ id: string, blob: Blob }[]} blobs
 * @property {{ filename: string, blob: Blob }[]} audioFiles
 * @property {import('./generation.js').ExtraAsset[]} [extraAssets]
 * @property {Record<string, import('./sceneReferences.js').SceneReferenceImage[]>} [sceneReferenceMap]
 * @property {import('./falVideo.js').SceneVideoResult[]} [videos]
 */

/**
 * @param {HappyHorseZipPayload} payload
 * @param {string} projectTitle
 * @returns {Promise<Blob>}
 */
export async function buildHappyHorseZip(payload, projectTitle) {
  const { job, blobs, audioFiles, videos = [], extraAssets = [], sceneReferenceMap = {} } = payload;

  const zip = new JSZip();
  const scenesFolder = zip.folder('scenes-16x9');
  if (!scenesFolder) {
    throw new Error('Failed to create ZIP folder');
  }

  for (const item of blobs) {
    scenesFolder.file(`${item.id}.png`, item.blob);
  }

  if (videos.length) {
    const videosFolder = zip.folder('videos');
    for (const item of videos) {
      if (item.videoBlob) {
        videosFolder?.file(`${item.sceneId}.mp4`, item.videoBlob);
      }
    }
  }

  if (audioFiles.length) {
    const audioFolder = zip.folder('audio');
    for (const file of audioFiles) {
      audioFolder?.file(file.filename.replace(/^audio\//, ''), file.blob);
    }
  }

  const imageExtras = extraAssets.filter((a) => a.type === 'image');
  if (imageExtras.length) {
    const extraFolder = zip.folder('extra-assets');
    imageExtras.forEach((asset, index) => {
      extraFolder?.file(
        `extra-${String(index + 1).padStart(2, '0')}-${asset.name}`,
        asset.blob
      );
    });
  }

  const refEntries = Object.entries(sceneReferenceMap);
  if (refEntries.length) {
    const refsRoot = zip.folder('scene-references');
    for (const [sceneId, refs] of refEntries) {
      const sceneFolder = refsRoot?.folder(sceneId);
      refs.forEach((ref, index) => {
        sceneFolder?.file(
          `ref-${String(index + 1).padStart(2, '0')}-${ref.name}`,
          ref.blob
        );
      });
    }
  }

  zip.file('happy-horse-job.json', `${JSON.stringify(job, null, 2)}\n`);
  zip.file(
    'README.txt',
    [
      'Happy Horse Generation Package',
      '==============================',
      '',
      `Project: ${projectTitle}`,
      `Scenes: ${job.project.sceneCount}`,
      'Aspect ratio: 16:9 (1920x1080 first frames)',
      videos.length ? `Videos: ${videos.length} Happy Horse clips (1080p + native audio)` : '',
      '',
      'Folders:',
      '  scenes-16x9/  — first-frame images sent to Happy Horse',
      '  videos/       — generated Happy Horse clips (if run completed)',
      '  audio/        — extra per-scene audio you assigned',
      '  extra-assets/ — additional reference images',
      '',
      'happy-horse-job.json — scene order, paths, and FAL metadata',
      '',
    ]
      .filter(Boolean)
      .join('\n')
  );

  return zip.generateAsync({ type: 'blob' });
}

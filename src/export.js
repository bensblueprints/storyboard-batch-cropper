import JSZip from 'jszip';
import { buildExportPackage } from './exportPackage.js';

/**
 * @param {import('./state.js').QueuedImage[]} images
 * @param {string} projectTitle
 * @returns {Promise<Blob>}
 */
export async function exportAllToZip(images, projectTitle = 'Untitled Short Film') {
  const { scenes, manifest } = await buildExportPackage(images, projectTitle);
  const zip = new JSZip();

  const scenesFolder = zip.folder('scenes');
  if (!scenesFolder) {
    throw new Error('Failed to create ZIP folder');
  }

  for (const scene of scenes) {
    scenesFolder.file(`${scene.id}.png`, scene.blob);
  }

  zip.file(
    'manifest.json',
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  zip.file(
    'README.txt',
    [
      'Short Film Storyboard Export',
      '===========================',
      '',
      `Project: ${manifest.project.title}`,
      `Scenes: ${manifest.project.sceneCount}`,
      '',
      'Files:',
      '  scenes/       — one PNG per storyboard shot, in story order',
      '  manifest.json — scene list + metadata slots for AI pipeline',
      '',
      'Use manifest.json to wire scenes into your AI storyboarding workflow.',
      '',
    ].join('\n')
  );

  for (const scene of scenes) {
    URL.revokeObjectURL(scene.previewUrl);
  }

  return zip.generateAsync({ type: 'blob' });
}

/**
 * @param {{ scenes: import('./exportPackage.js').SceneExport[], manifest: import('./exportPackage.js').ExportManifest }} pkg
 * @returns {Promise<Blob>}
 */
export async function zipFromPackage(pkg) {
  const zip = new JSZip();
  const scenesFolder = zip.folder('scenes');
  if (!scenesFolder) {
    throw new Error('Failed to create ZIP folder');
  }

  for (const scene of pkg.scenes) {
    scenesFolder.file(`${scene.id}.png`, scene.blob);
  }

  zip.file('manifest.json', `${JSON.stringify(pkg.manifest, null, 2)}\n`);
  zip.file(
    'README.txt',
    [
      'Short Film Storyboard Export',
      '===========================',
      '',
      `Project: ${pkg.manifest.project.title}`,
      `Scenes: ${pkg.manifest.project.sceneCount}`,
      '',
    ].join('\n')
  );

  return zip.generateAsync({ type: 'blob' });
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {string} text
 * @param {string} filename
 */
export function downloadText(text, filename) {
  downloadBlob(new Blob([text], { type: 'application/json' }), filename);
}

/** @param {string} slug @returns {string} */
export function slugifyProjectTitle(slug) {
  return slug.replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '') || 'short-film';
}

import {
  createInitialState,
  getActiveImage,
  getLayoutOptions,
  createDefaultSettings,
} from './state.js';
import { loadImageFiles, createListThumbnailUrl } from './imageLoader.js';
import {
  applyPanelCount,
  cloneSettings,
  resetManualLines,
  updateBoundaryLine,
  ensurePanelCropOffsets,
  updatePanelCropEdge,
  resetPanelCrop,
  applyPanelCropToAll,
} from './grid.js';
import { createPreviewController, renderThumbnails, syncSliderMax } from './preview.js';
import { createPanelCropController } from './panelCrop.js';
import { buildExportPackage, revokeExportPackage } from './exportPackage.js';
import { renderExportReview } from './review.js';
import {
  zipFromPackage,
  downloadBlob,
  downloadText,
  slugifyProjectTitle,
} from './export.js';
import { buildHappyHorseJob, detectAssetType, revokeSceneOverrides, revokeExtraAssets, attachVideoResults, ensureScenePrompts } from './generation.js';
import { buildHappyHorseZip } from './happyHorseExport.js';
import { renderGenerationReview, renderGenerationResults } from './generationReview.js';
import { getFalKey, saveFalKey, hasFalKey } from './falConfig.js';
import { configureFal, generateAllSceneVideos } from './falVideo.js';
import { fetchImageToVideoModels, DEFAULT_I2V_MODEL } from './falModels.js';
import { estimateGenerationCosts } from './falPricing.js';
import { formatUsd, getAudioDurationSeconds } from './sceneDuration.js';
import { revokeAllSceneReferences, revokeSceneReferences } from './sceneReferences.js';

/** @typedef {import('./state.js').AppState} AppState */
/** @typedef {import('./state.js').ImageSettings} ImageSettings */

/** @type {AppState} */
let state = createInitialState();

/** @type {ReturnType<typeof createPreviewController>|ReturnType<typeof createPanelCropController>|null} */
let previewController = null;

/** @type {string|null} */
let previewKey = null;

/** @type {string|null} */
let replaceSceneTargetId = null;

/** @type {string|null} */
let referenceSceneTargetId = null;

let assetIdCounter = 0;
let referenceIdCounter = 0;
let costEstimateTimer = null;
let costEstimateRequestId = 0;

const els = {
  dropZone: /** @type {HTMLElement} */ (document.getElementById('drop-zone')),
  fileInput: /** @type {HTMLInputElement} */ (document.getElementById('file-input')),
  imageList: /** @type {HTMLElement} */ (document.getElementById('image-list')),
  panelCountGroup: /** @type {HTMLElement} */ (document.getElementById('panel-count-group')),
  gridOptions: /** @type {HTMLElement} */ (document.getElementById('grid-options')),
  sectionControls: /** @type {HTMLElement} */ (document.getElementById('section-controls')),
  spacingControls: /** @type {HTMLElement} */ (document.getElementById('spacing-controls')),
  cropControls: /** @type {HTMLElement} */ (document.getElementById('crop-controls')),
  exportControls: /** @type {HTMLElement} */ (document.getElementById('export-controls')),
  panelPicker: /** @type {HTMLElement} */ (document.getElementById('panel-picker')),
  phaseSectionBtn: /** @type {HTMLButtonElement} */ (document.getElementById('phase-section-btn')),
  phaseCropBtn: /** @type {HTMLButtonElement} */ (document.getElementById('phase-crop-btn')),
  phaseExportBtn: /** @type {HTMLButtonElement} */ (document.getElementById('phase-export-btn')),
  phaseGenerateBtn: /** @type {HTMLButtonElement} */ (document.getElementById('phase-generate-btn')),
  generateControls: /** @type {HTMLElement} */ (document.getElementById('generate-controls')),
  falApiKey: /** @type {HTMLInputElement} */ (document.getElementById('fal-api-key')),
  falModelSelect: /** @type {HTMLSelectElement} */ (document.getElementById('fal-model-select')),
  falModelHint: /** @type {HTMLElement} */ (document.getElementById('fal-model-hint')),
  happyHorseDuration: /** @type {HTMLSelectElement} */ (document.getElementById('happy-horse-duration')),
  generationCostEstimateEl: /** @type {HTMLElement} */ (document.getElementById('generation-cost-estimate')),
  generationStatusEl: /** @type {HTMLElement} */ (document.getElementById('generation-status')),
  startHappyHorseBtn: /** @type {HTMLButtonElement} */ (document.getElementById('start-happy-horse-btn')),
  downloadHappyHorseBtn: /** @type {HTMLButtonElement} */ (document.getElementById('download-happy-horse-btn')),
  generationReview: /** @type {HTMLElement} */ (document.getElementById('generation-review')),
  generationLoading: /** @type {HTMLElement} */ (document.getElementById('generation-loading')),
  generationReviewContent: /** @type {HTMLElement} */ (document.getElementById('generation-review-content')),
  generationResults: /** @type {HTMLElement} */ (document.getElementById('generation-results')),
  extraAssetsInput: /** @type {HTMLInputElement} */ (document.getElementById('extra-assets-input')),
  replaceSceneInput: /** @type {HTMLInputElement} */ (document.getElementById('replace-scene-input')),
  sceneReferenceInput: /** @type {HTMLInputElement} */ (document.getElementById('scene-reference-input')),
  projectTitle: /** @type {HTMLInputElement} */ (document.getElementById('project-title')),
  exportSummary: /** @type {HTMLElement} */ (document.getElementById('export-summary')),
  refreshExportBtn: /** @type {HTMLButtonElement} */ (document.getElementById('refresh-export-btn')),
  downloadManifestBtn: /** @type {HTMLButtonElement} */ (document.getElementById('download-manifest-btn')),
  copyManifestBtn: /** @type {HTMLButtonElement} */ (document.getElementById('copy-manifest-btn')),
  marginTop: /** @type {HTMLInputElement} */ (document.getElementById('margin-top')),
  marginBottom: /** @type {HTMLInputElement} */ (document.getElementById('margin-bottom')),
  marginLeft: /** @type {HTMLInputElement} */ (document.getElementById('margin-left')),
  marginRight: /** @type {HTMLInputElement} */ (document.getElementById('margin-right')),
  gutterX: /** @type {HTMLInputElement} */ (document.getElementById('gutter-x')),
  gutterY: /** @type {HTMLInputElement} */ (document.getElementById('gutter-y')),
  marginTopVal: /** @type {HTMLElement} */ (document.getElementById('margin-top-val')),
  marginBottomVal: /** @type {HTMLElement} */ (document.getElementById('margin-bottom-val')),
  marginLeftVal: /** @type {HTMLElement} */ (document.getElementById('margin-left-val')),
  marginRightVal: /** @type {HTMLElement} */ (document.getElementById('margin-right-val')),
  gutterXVal: /** @type {HTMLElement} */ (document.getElementById('gutter-x-val')),
  gutterYVal: /** @type {HTMLElement} */ (document.getElementById('gutter-y-val')),
  resetLinesBtn: /** @type {HTMLButtonElement} */ (document.getElementById('reset-lines-btn')),
  resetPanelCropBtn: /** @type {HTMLButtonElement} */ (document.getElementById('reset-panel-crop-btn')),
  applyCropAllBtn: /** @type {HTMLButtonElement} */ (document.getElementById('apply-crop-all-btn')),
  applyAllBtn: /** @type {HTMLButtonElement} */ (document.getElementById('apply-all-btn')),
  exportBtn: /** @type {HTMLButtonElement} */ (document.getElementById('export-btn')),
  emptyState: /** @type {HTMLElement} */ (document.getElementById('empty-state')),
  previewArea: /** @type {HTMLElement} */ (document.getElementById('preview-area')),
  previewCanvas: /** @type {HTMLCanvasElement} */ (document.getElementById('preview-canvas')),
  activeFilename: /** @type {HTMLElement} */ (document.getElementById('active-filename')),
  activeDimensions: /** @type {HTMLElement} */ (document.getElementById('active-dimensions')),
  phaseLabel: /** @type {HTMLElement} */ (document.getElementById('phase-label')),
  previewHint: /** @type {HTMLElement} */ (document.getElementById('preview-hint')),
  thumbnails: /** @type {HTMLElement} */ (document.getElementById('thumbnails')),
  thumbnailGrid: /** @type {HTMLElement} */ (document.getElementById('thumbnail-grid')),
  exportReview: /** @type {HTMLElement} */ (document.getElementById('export-review')),
  exportLoading: /** @type {HTMLElement} */ (document.getElementById('export-loading')),
  exportReviewContent: /** @type {HTMLElement} */ (document.getElementById('export-review-content')),
  status: /** @type {HTMLElement} */ (document.getElementById('status')),
};

export function initUI() {
  bindDropZone();
  bindControls();
  render();
}

function bindDropZone() {
  els.dropZone.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => {
    if (els.fileInput.files?.length) {
      handleFiles(els.fileInput.files);
      els.fileInput.value = '';
    }
  });

  els.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.dropZone.classList.add('dragover');
  });
  els.dropZone.addEventListener('dragleave', () => {
    els.dropZone.classList.remove('dragover');
  });
  els.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    els.dropZone.classList.remove('dragover');
    if (e.dataTransfer?.files?.length) {
      handleFiles(e.dataTransfer.files);
    }
  });
}

function bindControls() {
  els.phaseSectionBtn.addEventListener('click', () => setPhase('section'));
  els.phaseCropBtn.addEventListener('click', () => setPhase('crop'));
  els.phaseExportBtn.addEventListener('click', () => setPhase('export'));
  els.phaseGenerateBtn.addEventListener('click', () => setPhase('generate'));

  els.startHappyHorseBtn.addEventListener('click', handleStartHappyHorse);
  els.downloadHappyHorseBtn.addEventListener('click', handleDownloadHappyHorse);

  els.falApiKey.addEventListener('change', handleFalKeyChange);
  els.falApiKey.addEventListener('input', handleFalKeyChange);

  els.falModelSelect.addEventListener('change', () => {
    state.selectedFalModel = els.falModelSelect.value || DEFAULT_I2V_MODEL;
    state.lastHappyHorseJob = null;
    scheduleGenerationCostEstimate(true);
    renderGenerationWorkspace();
    renderGenerateControls();
    renderExportControls();
  });

  els.happyHorseDuration.addEventListener('change', () => {
    state.happyHorseDuration = Number(els.happyHorseDuration.value) || 5;
    state.lastHappyHorseJob = null;
    scheduleGenerationCostEstimate(true);
    renderGenerationWorkspace();
    renderGenerateControls();
    renderExportControls();
  });

  els.extraAssetsInput.addEventListener('change', () => {
    if (els.extraAssetsInput.files?.length) {
      handleExtraAssets(els.extraAssetsInput.files);
      els.extraAssetsInput.value = '';
    }
  });

  els.replaceSceneInput.addEventListener('change', () => {
    const file = els.replaceSceneInput.files?.[0];
    if (file && replaceSceneTargetId) {
      applySceneOverride(replaceSceneTargetId, file);
    }
    els.replaceSceneInput.value = '';
    replaceSceneTargetId = null;
  });

  els.sceneReferenceInput.addEventListener('change', () => {
    if (els.sceneReferenceInput.files?.length && referenceSceneTargetId) {
      handleSceneReferenceFiles(referenceSceneTargetId, els.sceneReferenceInput.files);
    }
    els.sceneReferenceInput.value = '';
    referenceSceneTargetId = null;
  });

  els.projectTitle.addEventListener('input', () => {
    state.projectTitle = els.projectTitle.value.trim() || 'Untitled Short Film';
    invalidateExportPackage();
    if (state.phase === 'export') {
      buildExportPreview();
    }
  });

  els.refreshExportBtn.addEventListener('click', () => buildExportPreview());
  els.downloadManifestBtn.addEventListener('click', handleDownloadManifest);
  els.copyManifestBtn.addEventListener('click', handleCopyManifest);

  els.panelCountGroup.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest('[data-panels]');
    if (!btn) {
      return;
    }
    setPanelCount(Number(btn.getAttribute('data-panels')));
  });

  els.gridOptions.addEventListener('change', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (input.name !== 'grid-layout') {
      return;
    }
    const [rows, cols] = input.value.split('x').map(Number);
    updateActiveSettings((s) => ({
      ...s,
      grid: { rows, cols },
      verticalBoundaries: null,
      horizontalBoundaries: null,
      panelCropOffsets: null,
    }));
  });

  const marginInputs = [
    ['marginTop', 'top'],
    ['marginBottom', 'bottom'],
    ['marginLeft', 'left'],
    ['marginRight', 'right'],
  ];

  for (const [elKey, marginKey] of marginInputs) {
    const input = els[/** @type {keyof typeof els} */ (elKey)];
    input.addEventListener('input', () => {
      updateActiveSettings((s) => ({
        ...s,
        margins: { ...s.margins, [marginKey]: Number(input.value) },
        verticalBoundaries: null,
        horizontalBoundaries: null,
        panelCropOffsets: null,
      }));
    });
  }

  els.gutterX.addEventListener('input', () => {
    updateActiveSettings((s) => ({
      ...s,
      gutters: { ...s.gutters, x: Number(els.gutterX.value) },
      verticalBoundaries: null,
      horizontalBoundaries: null,
      panelCropOffsets: null,
    }));
  });

  els.gutterY.addEventListener('input', () => {
    updateActiveSettings((s) => ({
      ...s,
      gutters: { ...s.gutters, y: Number(els.gutterY.value) },
      verticalBoundaries: null,
      horizontalBoundaries: null,
      panelCropOffsets: null,
    }));
  });

  els.resetLinesBtn.addEventListener('click', () => {
    updateActiveSettings((s) => resetManualLines(s));
  });

  els.resetPanelCropBtn.addEventListener('click', () => {
    const active = getActiveImage(state);
    if (!active) {
      return;
    }
    active.settings = resetPanelCrop(active.settings, state.activePanelIndex);
    invalidateExportPackage();
    previewController?.render();
    renderThumbnails(els.thumbnailGrid, active, state.activePanelIndex);
    showStatus(`Reset crop for panel ${state.activePanelIndex + 1}`, 'success');
  });

  els.applyCropAllBtn.addEventListener('click', () => {
    const active = getActiveImage(state);
    if (!active) {
      return;
    }
    active.settings = applyPanelCropToAll(
      active.width,
      active.height,
      active.settings,
      state.activePanelIndex
    );
    invalidateExportPackage();
    previewController?.render();
    renderThumbnails(els.thumbnailGrid, active, state.activePanelIndex);
    showStatus('Applied panel crop to all panels', 'success');
  });

  els.applyAllBtn.addEventListener('click', applySettingsToAll);
  els.exportBtn.addEventListener('click', handleDownloadPackage);

  els.thumbnailGrid.addEventListener('click', (e) => {
    if (state.phase !== 'crop') {
      return;
    }
    const btn = /** @type {HTMLElement} */ (e.target).closest('[data-panel-index]');
    if (!btn) {
      return;
    }
    setActivePanelIndex(Number(btn.dataset.panelIndex));
  });

  window.addEventListener('resize', () => {
    previewController?.render();
  });
}

/** @param {'section'|'crop'|'export'|'generate'} phase */
async function setPhase(phase) {
  if (!state.images.length && phase !== 'section') {
    return;
  }

  state.phase = phase;
  destroyPreviewController();

  if (phase === 'crop') {
    const active = getActiveImage(state);
    if (active) {
      active.settings = ensurePanelCropOffsets(active.width, active.height, active.settings);
      if (state.activePanelIndex >= active.settings.panelCount) {
        state.activePanelIndex = 0;
      }
    }
  }

  if (phase === 'export') {
    await buildExportPreview();
  } else if (phase === 'generate') {
    if (!state.exportPackage) {
      await buildExportPreview();
    }
    await loadFalModelsIfNeeded();
    scheduleGenerationCostEstimate(true);
  } else if (phase !== 'generate') {
    invalidateExportPackage();
  }

  render();
}

function invalidateExportPackage() {
  revokeExportPackage(state.exportPackage);
  state.exportPackage = null;
  state.exportManifest = null;
  clearGenerationAssets();
}

function clearGenerationAssets() {
  revokeSceneOverrides(state.sceneOverrides);
  revokeExtraAssets(state.extraAssets);
  revokeAllSceneReferences(state.sceneReferenceMap);
  state.sceneOverrides = {};
  state.extraAssets = [];
  state.sceneAudioMap = {};
  state.scenePromptMap = {};
  state.sceneDurationMap = {};
  state.sceneAudioDurationCache = {};
  state.sceneReferenceMap = {};
  state.generationCostEstimate = null;
  state.lastHappyHorseJob = null;
}

function handleFalKeyChange() {
  saveFalKey(els.falApiKey.value);
  loadFalModelsIfNeeded();
  scheduleGenerationCostEstimate(true);
  renderGenerateControls();
  if (state.phase === 'generate') {
    renderGenerationWorkspace();
  }
}

async function loadFalModelsIfNeeded() {
  const apiKey = getFalKey();
  if (!apiKey || state.falModelsLoading) {
    return;
  }
  if (state.falModels.length > 0) {
    renderFalModelSelect();
    return;
  }

  state.falModelsLoading = true;
  els.falModelHint.textContent = 'Loading image-to-video models from fal.ai…';
  renderFalModelSelect();

  try {
    state.falModels = await fetchImageToVideoModels(apiKey);
    if (!state.falModels.some((model) => model.endpoint_id === state.selectedFalModel)) {
      state.selectedFalModel = state.falModels[0]?.endpoint_id ?? DEFAULT_I2V_MODEL;
    }
    els.falModelHint.textContent = `${state.falModels.length} image-to-video models available.`;
  } catch (err) {
    els.falModelHint.textContent = err instanceof Error ? err.message : 'Could not load models';
  } finally {
    state.falModelsLoading = false;
    renderFalModelSelect();
    renderGenerateControls();
    if (state.phase === 'generate') {
      scheduleGenerationCostEstimate(true);
      renderGenerationWorkspace();
    }
  }
}

function renderFalModelSelect() {
  const apiKey = getFalKey();
  els.falModelSelect.disabled = !apiKey || state.falModelsLoading;
  els.falModelSelect.innerHTML = '';

  if (!apiKey) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Enter FAL key to load models…';
    els.falModelSelect.appendChild(option);
    return;
  }

  if (state.falModelsLoading) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Loading models…';
    els.falModelSelect.appendChild(option);
    return;
  }

  for (const model of state.falModels) {
    const option = document.createElement('option');
    option.value = model.endpoint_id;
    option.textContent = model.display_name;
    option.title = model.description;
    option.selected = model.endpoint_id === state.selectedFalModel;
    els.falModelSelect.appendChild(option);
  }

  if (!state.falModels.length) {
    const option = document.createElement('option');
    option.value = DEFAULT_I2V_MODEL;
    option.textContent = DEFAULT_I2V_MODEL;
    els.falModelSelect.appendChild(option);
  }
}

function getSelectedModelLabel() {
  const model = state.falModels.find((entry) => entry.endpoint_id === state.selectedFalModel);
  return model?.display_name ?? state.selectedFalModel;
}

async function buildExportPreview() {
  if (!state.images.length) {
    return;
  }

  invalidateExportPackage();
  state.exportBuilding = true;
  renderExportWorkspace();

  try {
    const pkg = await buildExportPackage(state.images, state.projectTitle);
    state.exportPackage = pkg;
    state.exportManifest = pkg.manifest;
    if (state.selectedSceneOrder > pkg.scenes.length) {
      state.selectedSceneOrder = 1;
    }
    showStatus(`Prepared ${pkg.scenes.length} scenes for export`, 'success');
  } catch (err) {
    showStatus(err instanceof Error ? err.message : 'Export preview failed', 'error');
  } finally {
    state.exportBuilding = false;
    renderExportWorkspace();
    renderExportControls();
  }
}

/** @param {number} index */
function setActivePanelIndex(index) {
  state.activePanelIndex = index;
  destroyPreviewController();
  renderWorkspace();
  renderPanelPicker();
  const active = getActiveImage(state);
  if (active) {
    renderThumbnails(els.thumbnailGrid, active, state.activePanelIndex);
  }
}

/** @param {number} order */
function setSelectedSceneOrder(order) {
  state.selectedSceneOrder = order;
  renderExportWorkspace();
}

function destroyPreviewController() {
  previewController?.destroy();
  previewController = null;
  previewKey = null;
}

/** @param {FileList|File[]} files */
async function handleFiles(files) {
  const { items, errors } = await loadImageFiles(files);
  if (items.length === 0 && errors.length) {
    showStatus(errors.join(' '), 'error');
    return;
  }

  invalidateExportPackage();
  state.images.push(...items);
  if (state.activeIndex < 0) {
    state.activeIndex = 0;
  }
  state.phase = 'section';
  state.activePanelIndex = 0;
  state.selectedSceneOrder = 1;

  if (errors.length) {
    showStatus(`Loaded ${items.length} image(s). Skipped: ${errors.join('; ')}`, 'error');
  } else {
    showStatus(`Loaded ${items.length} image(s)`, 'success');
  }

  render();
}

/** @param {number} count */
function setPanelCount(count) {
  updateActiveSettings((s) => applyPanelCount(count, s));
}

/** @param {(settings: ImageSettings) => ImageSettings} updater */
function updateActiveSettings(updater) {
  const active = getActiveImage(state);
  if (!active) {
    return;
  }
  active.settings = updater(active.settings);
  invalidateExportPackage();
  if (state.phase === 'section') {
    destroyPreviewController();
  }
  render();
}

function applySettingsToAll() {
  const active = getActiveImage(state);
  if (!active || state.images.length < 2) {
    return;
  }
  const copy = cloneSettings(active.settings);
  for (const item of state.images) {
    item.settings = cloneSettings(copy);
  }
  invalidateExportPackage();
  showStatus('Applied settings to all images', 'success');
  render();
}

async function handleDownloadPackage() {
  if (state.phase === 'generate') {
    await handleDownloadHappyHorse();
    return;
  }

  if (!state.exportPackage) {
    await buildExportPreview();
  }
  if (!state.exportPackage) {
    return;
  }

  els.exportBtn.disabled = true;
  showStatus('Building ZIP…', 'info');

  try {
    const zip = await zipFromPackage(state.exportPackage);
    const slug = slugifyProjectTitle(state.projectTitle);
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadBlob(zip, `${slug}-${timestamp}.zip`);
    showStatus(`Downloaded ${state.exportPackage.scenes.length} scenes + manifest`, 'success');
  } catch (err) {
    showStatus(err instanceof Error ? err.message : 'Download failed', 'error');
  } finally {
    renderExportControls();
  }
}

function handleDownloadManifest() {
  if (!state.exportManifest) {
    return;
  }
  const slug = slugifyProjectTitle(state.projectTitle);
  downloadText(`${JSON.stringify(state.exportManifest, null, 2)}\n`, `${slug}-manifest.json`);
  showStatus('Downloaded manifest.json', 'success');
}

async function handleCopyManifest() {
  if (!state.exportManifest) {
    return;
  }
  try {
    await navigator.clipboard.writeText(`${JSON.stringify(state.exportManifest, null, 2)}\n`);
    showStatus('Copied manifest to clipboard', 'success');
  } catch {
    showStatus('Could not copy manifest', 'error');
  }
}

/** @param {number} index */
function setActiveIndex(index) {
  state.activeIndex = index;
  state.activePanelIndex = 0;
  destroyPreviewController();
  invalidateExportPackage();
  render();
}

/** @param {string} id */
function removeImage(id) {
  const index = state.images.findIndex((img) => img.id === id);
  if (index < 0) {
    return;
  }
  state.images.splice(index, 1);
  invalidateExportPackage();
  if (state.images.length === 0) {
    state.activeIndex = -1;
    state.phase = 'section';
  } else if (state.activeIndex >= state.images.length) {
    state.activeIndex = state.images.length - 1;
  } else if (state.activeIndex > index) {
    state.activeIndex -= 1;
  }
  destroyPreviewController();
  render();
}

function render() {
  renderImageList();
  renderPhaseControls();
  renderLayoutControls();
  renderSpacingControls();
  renderPanelPicker();
  renderExportControls();
  renderGenerateControls();
  renderWorkspace();

  const hasImages = state.images.length > 0;
  els.phaseCropBtn.disabled = !hasImages;
  els.phaseExportBtn.disabled = !hasImages;
  els.phaseGenerateBtn.disabled = !hasImages;
  els.applyAllBtn.disabled = state.images.length < 2;
}

function renderPhaseControls() {
  els.phaseSectionBtn.classList.toggle('active', state.phase === 'section');
  els.phaseCropBtn.classList.toggle('active', state.phase === 'crop');
  els.phaseExportBtn.classList.toggle('active', state.phase === 'export');
  els.phaseGenerateBtn.classList.toggle('active', state.phase === 'generate');

  const isEdit = state.phase === 'section' || state.phase === 'crop';
  els.sectionControls.classList.toggle('hidden', !isEdit || state.phase === 'crop');
  els.spacingControls.classList.toggle('hidden', !isEdit || state.phase === 'crop');
  els.cropControls.classList.toggle('hidden', state.phase !== 'crop');
  els.exportControls.classList.toggle('hidden', state.phase !== 'export');
  els.generateControls.classList.toggle('hidden', state.phase !== 'generate');
}

function renderGenerateControls() {
  const ready = Boolean(state.exportPackage);
  const keyReady = hasFalKey();

  if (!els.falApiKey.value && getFalKey()) {
    els.falApiKey.value = getFalKey();
  }
  if (els.happyHorseDuration.value !== String(state.happyHorseDuration)) {
    els.happyHorseDuration.value = String(state.happyHorseDuration);
  }

  renderFalModelSelect();

  els.startHappyHorseBtn.disabled =
    !ready || !keyReady || !state.selectedFalModel || state.generationRunning || state.falModelsLoading;
  els.downloadHappyHorseBtn.disabled = !state.lastHappyHorseJob || state.generationRunning;

  if (state.generationRunning && state.generationStatus) {
    els.generationStatusEl.textContent = state.generationStatus;
    els.generationStatusEl.classList.remove('hidden');
  } else if (!keyReady && state.phase === 'generate') {
    els.generationStatusEl.textContent = 'Paste your FAL API key above before generating.';
    els.generationStatusEl.classList.remove('hidden');
  } else if (keyReady && !state.selectedFalModel && state.phase === 'generate') {
    els.generationStatusEl.textContent = 'Choose an image-to-video model.';
    els.generationStatusEl.classList.remove('hidden');
  } else {
    els.generationStatusEl.classList.add('hidden');
  }

  if (els.generationCostEstimateEl) {
    const estimate = state.generationCostEstimate;
    if (!hasFalKey() || !state.exportPackage || state.generationRunning) {
      els.generationCostEstimateEl.textContent = '';
      els.generationCostEstimateEl.classList.add('hidden');
    } else if (estimate?.loading) {
      els.generationCostEstimateEl.textContent = 'Estimating fal.ai cost…';
      els.generationCostEstimateEl.classList.remove('hidden');
    } else if (estimate?.error) {
      els.generationCostEstimateEl.textContent = `Cost estimate unavailable: ${estimate.error}`;
      els.generationCostEstimateEl.classList.remove('hidden');
    } else if (estimate) {
      const sceneCount = state.exportPackage.scenes.length;
      els.generationCostEstimateEl.textContent = `Estimated total: ${formatUsd(estimate.total, estimate.currency)} for ${sceneCount} scene${sceneCount === 1 ? '' : 's'}`;
      els.generationCostEstimateEl.classList.remove('hidden');
    } else {
      els.generationCostEstimateEl.textContent = '';
      els.generationCostEstimateEl.classList.add('hidden');
    }
  }
}

function renderExportControls() {
  const ready = Boolean(state.exportPackage);
  els.projectTitle.value = state.projectTitle;

  if (state.phase === 'generate') {
    els.exportBtn.textContent = 'Download video package';
    els.exportBtn.disabled = !state.lastHappyHorseJob || state.generationRunning;
  } else {
    els.exportBtn.textContent = 'Download package';
    els.exportBtn.disabled = !ready || state.exportBuilding;
  }
  els.refreshExportBtn.disabled = state.exportBuilding || !state.images.length;
  els.downloadManifestBtn.disabled = !ready;
  els.copyManifestBtn.disabled = !ready;

  if (state.exportBuilding) {
    els.exportSummary.textContent = 'Building scene previews…';
  } else if (ready && state.exportPackage) {
    els.exportSummary.textContent = `${state.exportPackage.scenes.length} scenes ready in story order`;
  } else if (state.images.length) {
    els.exportSummary.textContent = 'Go to Step 3 or click Refresh preview';
  } else {
    els.exportSummary.textContent = 'Add storyboard images first';
  }
}

function renderImageList() {
  els.imageList.innerHTML = '';

  state.images.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = `image-list-item${index === state.activeIndex ? ' active' : ''}`;

    const thumb = document.createElement('img');
    thumb.src = createListThumbnailUrl(item);
    thumb.alt = '';

    const label = document.createElement('span');
    label.textContent = item.name;
    label.title = item.name;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-secondary';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeImage(item.id);
    });

    li.appendChild(thumb);
    li.appendChild(label);
    li.appendChild(removeBtn);
    li.addEventListener('click', () => setActiveIndex(index));
    els.imageList.appendChild(li);
  });
}

function renderLayoutControls() {
  const active = getActiveImage(state);
  const panelCount = active?.settings.panelCount ?? 4;

  els.panelCountGroup.querySelectorAll('[data-panels]').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.getAttribute('data-panels')) === panelCount);
  });

  els.gridOptions.innerHTML = '';
  const options = getLayoutOptions(panelCount);

  if (options.length <= 1) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = `${options[0].rows}×${options[0].cols} grid`;
    els.gridOptions.appendChild(p);
    return;
  }

  const current = active?.settings.grid ?? createDefaultSettings(panelCount).grid;
  options.forEach((layout) => {
    const label = document.createElement('label');
    label.className = 'grid-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'grid-layout';
    input.value = `${layout.rows}x${layout.cols}`;
    input.checked = layout.rows === current.rows && layout.cols === current.cols;
    label.appendChild(input);
    label.appendChild(document.createTextNode(`${layout.rows}×${layout.cols}`));
    els.gridOptions.appendChild(label);
  });
}

function renderSpacingControls() {
  const active = getActiveImage(state);
  const disabled = !active || state.phase === 'crop' || state.phase === 'export' || state.phase === 'generate';

  [
    els.marginTop,
    els.marginBottom,
    els.marginLeft,
    els.marginRight,
    els.gutterX,
    els.gutterY,
    els.resetLinesBtn,
    els.applyAllBtn,
  ].forEach((el) => {
    el.disabled = disabled;
  });

  if (!active) {
    return;
  }

  const maxMargin = Math.round(Math.min(active.width, active.height) * 0.25);
  const maxGutter = Math.round(Math.min(active.width, active.height) * 0.15);

  syncSliderMax(els.marginTop, maxMargin);
  syncSliderMax(els.marginBottom, maxMargin);
  syncSliderMax(els.marginLeft, maxMargin);
  syncSliderMax(els.marginRight, maxMargin);
  syncSliderMax(els.gutterX, maxGutter);
  syncSliderMax(els.gutterY, maxGutter);

  els.marginTop.value = String(active.settings.margins.top);
  els.marginBottom.value = String(active.settings.margins.bottom);
  els.marginLeft.value = String(active.settings.margins.left);
  els.marginRight.value = String(active.settings.margins.right);
  els.gutterX.value = String(active.settings.gutters.x);
  els.gutterY.value = String(active.settings.gutters.y);

  els.marginTopVal.textContent = active.settings.margins.top;
  els.marginBottomVal.textContent = active.settings.margins.bottom;
  els.marginLeftVal.textContent = active.settings.margins.left;
  els.marginRightVal.textContent = active.settings.margins.right;
  els.gutterXVal.textContent = active.settings.gutters.x;
  els.gutterYVal.textContent = active.settings.gutters.y;
}

function renderPanelPicker() {
  els.panelPicker.innerHTML = '';
  const active = getActiveImage(state);
  if (!active || state.phase !== 'crop') {
    return;
  }

  for (let i = 0; i < active.settings.panelCount; i += 1) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-secondary panel-picker-btn${i === state.activePanelIndex ? ' active' : ''}`;
    btn.textContent = String(i + 1);
    btn.addEventListener('click', () => setActivePanelIndex(i));
    els.panelPicker.appendChild(btn);
  }
}

function renderWorkspace() {
  if (!state.images.length) {
    els.emptyState.classList.remove('hidden');
    els.previewArea.classList.add('hidden');
    els.thumbnails.classList.add('hidden');
    els.exportReview.classList.add('hidden');
    els.generationReview.classList.add('hidden');
    destroyPreviewController();
    return;
  }

  els.emptyState.classList.add('hidden');

  if (state.phase === 'generate') {
    els.previewArea.classList.add('hidden');
    els.thumbnails.classList.add('hidden');
    els.exportReview.classList.add('hidden');
    els.generationReview.classList.remove('hidden');
    renderGenerationWorkspace();
    return;
  }

  els.generationReview.classList.add('hidden');

  if (state.phase === 'export') {
    els.previewArea.classList.add('hidden');
    els.thumbnails.classList.add('hidden');
    els.exportReview.classList.remove('hidden');
    renderExportWorkspace();
    return;
  }

  els.exportReview.classList.add('hidden');
  els.previewArea.classList.remove('hidden');
  els.thumbnails.classList.remove('hidden');

  const active = getActiveImage(state);
  if (!active) {
    return;
  }

  els.activeFilename.textContent = active.name;
  els.activeDimensions.textContent = `${active.width} × ${active.height}px`;

  if (state.phase === 'section') {
    els.phaseLabel.textContent = 'Step 1: Section panels';
    els.previewHint.textContent =
      'Drag any line — white edges or blue splits — to section panels';
    setupSectionPreview(active);
    renderThumbnails(els.thumbnailGrid, active);
  } else if (state.phase === 'crop') {
    els.phaseLabel.textContent = `Step 2: Crop panel ${state.activePanelIndex + 1}`;
    els.previewHint.textContent =
      'Drag the green edges to crop this panel. Shaded area is excluded from export.';
    active.settings = ensurePanelCropOffsets(active.width, active.height, active.settings);
    setupCropPreview(active);
    renderThumbnails(els.thumbnailGrid, active, state.activePanelIndex);
  }
}

function renderGenerationWorkspace() {
  els.generationLoading.classList.toggle('hidden', !state.generationRunning);
  els.generationReviewContent.classList.toggle('hidden', state.generationRunning);
  els.generationLoading.textContent = state.generationStatus || 'Generating videos…';

  if (state.generationRunning || !state.exportPackage) {
    els.generationReviewContent.innerHTML = '';
    els.generationResults.innerHTML = '';
    return;
  }

  ensureScenePrompts(
    state.exportPackage.scenes,
    state.exportPackage.manifest,
    state.scenePromptMap
  );

  renderGenerationReview(
    els.generationReviewContent,
    state.exportPackage.scenes,
    state.sceneOverrides,
    state.extraAssets,
    state.sceneAudioMap,
    state.scenePromptMap,
    state.sceneDurationMap,
    state.sceneReferenceMap,
    state.sceneAudioDurationCache,
    hasFalKey(),
    getSelectedModelLabel(),
    state.happyHorseDuration,
    state.generationCostEstimate,
    (sceneId) => {
      replaceSceneTargetId = sceneId;
      els.replaceSceneInput.click();
    },
    resetSceneOverride,
    removeExtraAsset,
    assignSceneAudio,
    assignScenePrompt,
    assignSceneDuration,
    (sceneId) => {
      referenceSceneTargetId = sceneId;
      els.sceneReferenceInput.click();
    },
    removeSceneReference
  );

  bindExtraAssetsDropZone();

  els.generationResults.innerHTML = '';
  if (state.lastHappyHorseJob) {
    renderGenerationResults(els.generationResults, state.lastHappyHorseJob.scenes, state.lastHappyHorseJob.videos);
  }
}

function bindExtraAssetsDropZone() {
  const drop = document.getElementById('extra-assets-drop');
  if (!drop || drop.dataset.bound === 'true') {
    return;
  }
  drop.dataset.bound = 'true';
  drop.addEventListener('click', () => els.extraAssetsInput.click());
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('dragover');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    if (e.dataTransfer?.files?.length) {
      handleExtraAssets(e.dataTransfer.files);
    }
  });
}

/** @param {FileList|File[]} files */
async function handleExtraAssets(files) {
  const list = Array.from(files);
  for (const file of list) {
    const type = await detectAssetType(file);
    assetIdCounter += 1;
    state.extraAssets.push({
      id: `asset-${assetIdCounter}`,
      name: file.name,
      type,
      blob: file,
      previewUrl: URL.createObjectURL(file),
    });
  }
  state.lastHappyHorseJob = null;
  scheduleGenerationCostEstimate(true);
  renderGenerationWorkspace();
  renderGenerateControls();
  renderExportControls();
  showStatus(`Added ${list.length} asset(s)`, 'success');
}

/** @param {string} sceneId @param {File} file */
function applySceneOverride(sceneId, file) {
  if (!file.type.startsWith('image/')) {
    showStatus('Scene replacements must be images', 'error');
    return;
  }
  if (state.sceneOverrides[sceneId]) {
    URL.revokeObjectURL(state.sceneOverrides[sceneId].previewUrl);
  }
  state.sceneOverrides[sceneId] = {
    name: file.name,
    blob: file,
    previewUrl: URL.createObjectURL(file),
  };
  state.lastHappyHorseJob = null;
  renderGenerationWorkspace();
  renderGenerateControls();
  renderExportControls();
  showStatus(`Replaced ${sceneId}`, 'success');
}

/** @param {string} sceneId */
function resetSceneOverride(sceneId) {
  if (state.sceneOverrides[sceneId]) {
    URL.revokeObjectURL(state.sceneOverrides[sceneId].previewUrl);
    delete state.sceneOverrides[sceneId];
    delete state.sceneAudioMap[sceneId];
    state.lastHappyHorseJob = null;
    renderGenerationWorkspace();
    renderGenerateControls();
    renderExportControls();
  }
}

/** @param {string} assetId */
function removeExtraAsset(assetId) {
  const index = state.extraAssets.findIndex((a) => a.id === assetId);
  if (index < 0) {
    return;
  }
  URL.revokeObjectURL(state.extraAssets[index].previewUrl);
  state.extraAssets.splice(index, 1);
  for (const [sceneId, mappedId] of Object.entries(state.sceneAudioMap)) {
    if (mappedId === assetId) {
      state.sceneAudioMap[sceneId] = null;
    }
  }
  state.lastHappyHorseJob = null;
  scheduleGenerationCostEstimate(true);
  renderGenerationWorkspace();
  renderGenerateControls();
  renderExportControls();
}

/** @param {boolean} [immediate] */
function scheduleGenerationCostEstimate(immediate = false) {
  if (costEstimateTimer) {
    clearTimeout(costEstimateTimer);
    costEstimateTimer = null;
  }

  if (!state.exportPackage || !hasFalKey() || state.phase !== 'generate') {
    state.generationCostEstimate = null;
    renderGenerateControls();
    return;
  }

  if (immediate) {
    void refreshGenerationCostEstimate();
    return;
  }

  costEstimateTimer = setTimeout(() => {
    costEstimateTimer = null;
    void refreshGenerationCostEstimate();
  }, 350);
}

async function refreshSceneAudioDurations() {
  if (!state.exportPackage) {
    return;
  }

  const audioById = new Map(
    state.extraAssets.filter((asset) => asset.type === 'audio').map((asset) => [asset.id, asset])
  );

  for (const scene of state.exportPackage.scenes) {
    const audioId = state.sceneAudioMap[scene.id];
    const audio = audioId ? audioById.get(audioId) : null;
    if (!audio) {
      state.sceneAudioDurationCache[scene.id] = null;
      continue;
    }
    state.sceneAudioDurationCache[scene.id] = await getAudioDurationSeconds(audio.blob);
  }
}

async function refreshGenerationCostEstimate() {
  if (!state.exportPackage || !hasFalKey()) {
    return;
  }

  const requestId = ++costEstimateRequestId;
  state.generationCostEstimate = {
    loading: true,
    error: null,
    perScene: {},
    total: 0,
    currency: 'USD',
  };
  renderGenerateControls();

  try {
    await refreshSceneAudioDurations();
    const estimate = await estimateGenerationCosts(getFalKey(), state.exportPackage.scenes, {
      modelId: state.selectedFalModel,
      sceneDurationMap: state.sceneDurationMap,
      globalDuration: state.happyHorseDuration,
      sceneAudioMap: state.sceneAudioMap,
      extraAssets: state.extraAssets,
      sceneReferenceMap: state.sceneReferenceMap,
    });

    if (requestId !== costEstimateRequestId) {
      return;
    }

    state.generationCostEstimate = {
      loading: false,
      error: null,
      perScene: estimate.perScene,
      total: estimate.total,
      currency: estimate.currency,
    };
  } catch (err) {
    if (requestId !== costEstimateRequestId) {
      return;
    }
    state.generationCostEstimate = {
      loading: false,
      error: err instanceof Error ? err.message : 'Could not estimate cost',
      perScene: {},
      total: 0,
      currency: 'USD',
    };
  }

  renderGenerateControls();
  renderGenerationWorkspace();
}

/** @param {string} sceneId @param {import('./sceneDuration.js').SceneDurationSetting} value */
function assignSceneDuration(sceneId, value) {
  if (value === 'auto') {
    state.sceneDurationMap[sceneId] = 'auto';
  } else {
    state.sceneDurationMap[sceneId] = value;
  }
  state.lastHappyHorseJob = null;
  scheduleGenerationCostEstimate(true);
  renderGenerationWorkspace();
  renderGenerateControls();
  renderExportControls();
}

/** @param {string} sceneId @param {string|null} assetId */
function assignSceneAudio(sceneId, assetId) {
  state.sceneAudioMap[sceneId] = assetId;
  state.lastHappyHorseJob = null;
  scheduleGenerationCostEstimate(true);
  renderGenerationWorkspace();
  renderGenerateControls();
  renderExportControls();
}

/** @param {string} sceneId @param {string} prompt */
function assignScenePrompt(sceneId, prompt) {
  state.scenePromptMap[sceneId] = prompt;
  state.lastHappyHorseJob = null;
  renderGenerateControls();
  renderExportControls();
}

/** @param {string} sceneId @param {FileList|File[]} files */
async function handleSceneReferenceFiles(sceneId, files) {
  const list = Array.from(files).filter((file) => file.type.startsWith('image/'));
  if (!list.length) {
    showStatus('Reference images must be PNG, JPG, or WebP', 'error');
    return;
  }

  if (!state.sceneReferenceMap[sceneId]) {
    state.sceneReferenceMap[sceneId] = [];
  }

  for (const file of list) {
    referenceIdCounter += 1;
    state.sceneReferenceMap[sceneId].push({
      id: `ref-${referenceIdCounter}`,
      name: file.name,
      blob: file,
      previewUrl: URL.createObjectURL(file),
    });
  }

  state.lastHappyHorseJob = null;
  scheduleGenerationCostEstimate(true);
  renderGenerationWorkspace();
  renderGenerateControls();
  renderExportControls();
  showStatus(`Added ${list.length} reference image(s) to ${sceneId}`, 'success');
}

/** @param {string} sceneId @param {string} refId */
function removeSceneReference(sceneId, refId) {
  const refs = state.sceneReferenceMap[sceneId];
  if (!refs) {
    return;
  }
  const index = refs.findIndex((ref) => ref.id === refId);
  if (index < 0) {
    return;
  }
  URL.revokeObjectURL(refs[index].previewUrl);
  refs.splice(index, 1);
  if (refs.length === 0) {
    delete state.sceneReferenceMap[sceneId];
  }
  state.lastHappyHorseJob = null;
  scheduleGenerationCostEstimate(true);
  renderGenerationWorkspace();
  renderGenerateControls();
  renderExportControls();
}

async function handleStartHappyHorse() {
  if (!state.exportPackage) {
    return;
  }

  const apiKey = getFalKey();
  if (!apiKey) {
    showStatus('Add your FAL API key in Step 4 settings', 'error');
    return;
  }

  if (!state.selectedFalModel) {
    showStatus('Choose an image-to-video model', 'error');
    return;
  }

  state.generationRunning = true;
  state.generationStatus = 'Preparing 16:9 first frames…';
  renderGenerationWorkspace();
  renderGenerateControls();
  showStatus(`Generating videos with ${getSelectedModelLabel()}…`, 'info');

  try {
    configureFal(apiKey);

    const { job, scenes, blobs, audioFiles } = await buildHappyHorseJob(
      state.exportPackage.scenes,
      state.sceneOverrides,
      state.sceneAudioMap,
      state.scenePromptMap,
      state.sceneReferenceMap,
      state.extraAssets,
      state.projectTitle,
      state.sceneDurationMap,
      state.happyHorseDuration,
      state.selectedFalModel
    );

    const videos = await generateAllSceneVideos(
      state.exportPackage.scenes,
      state.sceneOverrides,
      {
        modelId: state.selectedFalModel,
        scenePromptMap: state.scenePromptMap,
        sceneReferenceMap: state.sceneReferenceMap,
        sceneDurationMap: state.sceneDurationMap,
        sceneAudioMap: state.sceneAudioMap,
        extraAssets: state.extraAssets,
        globalDuration: state.happyHorseDuration,
        onProgress: (message) => {
          state.generationStatus = message;
          renderGenerationWorkspace();
          renderGenerateControls();
        },
      }
    );

    const scenesWithVideo = attachVideoResults(scenes, videos);
    const updatedJob = {
      ...job,
      scenes: scenesWithVideo,
      output: {
        ...job.output,
        withAudio: true,
        videosGenerated: videos.length,
      },
      fal: {
        model: state.selectedFalModel,
        defaultDuration: state.happyHorseDuration,
        sceneDurations: state.sceneDurationMap,
      },
    };

    state.lastHappyHorseJob = {
      job: updatedJob,
      scenes: scenesWithVideo,
      blobs,
      audioFiles,
      videos,
      extraAssets: state.extraAssets,
      sceneReferenceMap: state.sceneReferenceMap,
    };
    showStatus(`Done — ${videos.length} videos generated`, 'success');
  } catch (err) {
    showStatus(err instanceof Error ? err.message : 'Video generation failed', 'error');
  } finally {
    state.generationRunning = false;
    state.generationStatus = '';
    renderGenerationWorkspace();
    renderGenerateControls();
    renderExportControls();
  }
}

async function handleDownloadHappyHorse() {
  if (!state.exportPackage) {
    return;
  }

  els.downloadHappyHorseBtn.disabled = true;
  showStatus('Building video package…', 'info');

  try {
    if (!state.lastHappyHorseJob) {
      await handleStartHappyHorse();
    }
    if (!state.exportPackage || !state.lastHappyHorseJob) {
      return;
    }

    const zip = await buildHappyHorseZip(state.lastHappyHorseJob, state.projectTitle);
    const slug = slugifyProjectTitle(state.projectTitle);
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadBlob(zip, `${slug}-happy-horse-${timestamp}.zip`);
    showStatus('Downloaded video package', 'success');
  } catch (err) {
    showStatus(err instanceof Error ? err.message : 'Download failed', 'error');
  } finally {
    renderGenerateControls();
    renderExportControls();
  }
}

function renderExportWorkspace() {
  els.exportLoading.classList.toggle('hidden', !state.exportBuilding);
  els.exportReviewContent.classList.toggle('hidden', state.exportBuilding);

  if (state.exportBuilding || !state.exportPackage) {
    els.exportReviewContent.innerHTML = '';
    return;
  }

  renderExportReview(
    els.exportReviewContent,
    state.exportPackage,
    state.selectedSceneOrder,
    setSelectedSceneOrder
  );
}

/** @param {import('./state.js').QueuedImage} active */
function setupSectionPreview(active) {
  const key = `${active.id}:section`;
  if (previewKey !== key) {
    destroyPreviewController();
    previewController = createPreviewController(
      els.previewCanvas,
      active,
      (axis, lineIndex, value) => {
        active.settings = updateBoundaryLine(
          active.width,
          active.height,
          active.settings,
          axis,
          lineIndex,
          value
        );
        invalidateExportPackage();
        previewController?.render();
        renderThumbnails(els.thumbnailGrid, active);
        renderSpacingControls();
      }
    );
    previewKey = key;
  }
  previewController?.render();
}

/** @param {import('./state.js').QueuedImage} active */
function setupCropPreview(active) {
  const key = `${active.id}:crop:${state.activePanelIndex}`;
  if (previewKey !== key) {
    destroyPreviewController();
    previewController = createPanelCropController(
      els.previewCanvas,
      active,
      state.activePanelIndex,
      (edge, value) => {
        active.settings = updatePanelCropEdge(
          active.width,
          active.height,
          active.settings,
          state.activePanelIndex,
          edge,
          value
        );
        invalidateExportPackage();
        previewController?.render();
        renderThumbnails(els.thumbnailGrid, active, state.activePanelIndex);
      }
    );
    previewKey = key;
  }
  previewController?.render();
}

/** @param {string} message @param {'info'|'success'|'error'} type */
function showStatus(message, type) {
  state.statusMessage = message;
  state.statusType = type;
  els.status.textContent = message;
  els.status.className = `status ${type}`;
  els.status.classList.remove('hidden');

  if (type !== 'info') {
    window.setTimeout(() => {
      if (state.statusMessage === message) {
        els.status.classList.add('hidden');
      }
    }, 4000);
  }
}

export { state };

/** @typedef {{ top: number, bottom: number, left: number, right: number }} Margins */
/** @typedef {{ x: number, y: number }} Gutters */
/** @typedef {{ rows: number, cols: number }} GridLayout */
/** @typedef {{ x: number, y: number, width: number, height: number }} CropRect */
/** @typedef {{ top: number, bottom: number, left: number, right: number }} PanelCropInset */
/**
 * @typedef {Object} ImageSettings
 * @property {number} panelCount
 * @property {GridLayout} grid
 * @property {Margins} margins
 * @property {Gutters} gutters
 * @property {number[]|null} verticalBoundaries
 * @property {number[]|null} horizontalBoundaries
 * @property {(PanelCropInset|null)[]|null} panelCropOffsets
 */
/**
 * @typedef {Object} QueuedImage
 * @property {string} id
 * @property {string} name
 * @property {string} stem
 * @property {HTMLImageElement|ImageBitmap} image
 * @property {number} width
 * @property {number} height
 * @property {ImageSettings} settings
 */
/**
 * @typedef {Object} AppState
 * @property {QueuedImage[]} images
 * @property {number} activeIndex
 * @property {'section'|'crop'|'export'|'generate'} phase
 * @property {number} activePanelIndex
 * @property {number} selectedSceneOrder
 * @property {string} projectTitle
 * @property {import('./exportPackage.js').ExportManifest|null} exportManifest
 * @property {{ scenes: import('./exportPackage.js').SceneExport[], manifest: import('./exportPackage.js').ExportManifest }|null} exportPackage
 * @property {boolean} exportBuilding
 * @property {Record<string, { name: string, blob: Blob, previewUrl: string }>} sceneOverrides
 * @property {Array<{ id: string, name: string, type: 'image'|'audio', blob: Blob, previewUrl: string }>} extraAssets
 * @property {Record<string, string|null>} sceneAudioMap
 * @property {Record<string, string>} scenePromptMap
 * @property {Record<string, import('./sceneDuration.js').SceneDurationSetting>} sceneDurationMap
 * @property {Record<string, number|null>} sceneAudioDurationCache
 * @property {Record<string, Array<{ id: string, name: string, blob: Blob, previewUrl: string }>>} sceneReferenceMap
 * @property {{ loading: boolean, error: string|null, perScene: Record<string, { cost: number, currency: string, durationSeconds: number, modelId: string }>, total: number, currency: string }|null} generationCostEstimate
 * @property {string} selectedFalModel
 * @property {Array<{ endpoint_id: string, display_name: string, description: string, category: string, supports_refs: boolean }>} falModels
 * @property {boolean} falModelsLoading
 * @property {boolean} generationRunning
 * @property {string} generationStatus
 * @property {number} happyHorseDuration
 * @property {Object|null} lastHappyHorseJob
 * @property {string} statusMessage
 * @property {'info'|'success'|'error'} statusType
 */

/** @returns {Margins} */
export function defaultMargins() {
  return { top: 0, bottom: 0, left: 0, right: 0 };
}

/** @returns {Gutters} */
export function defaultGutters() {
  return { x: 0, y: 0 };
}

/** @param {number} panelCount @returns {GridLayout} */
export function defaultGridForPanelCount(panelCount) {
  const layouts = getLayoutOptions(panelCount);
  return layouts[0];
}

/** @param {number} panelCount @returns {GridLayout[]} */
export function getLayoutOptions(panelCount) {
  switch (panelCount) {
    case 4:
      return [{ rows: 2, cols: 2 }];
    case 6:
      return [
        { rows: 2, cols: 3 },
        { rows: 3, cols: 2 },
      ];
    case 8:
      return [
        { rows: 2, cols: 4 },
        { rows: 4, cols: 2 },
      ];
    case 12:
      return [
        { rows: 3, cols: 4 },
        { rows: 4, cols: 3 },
      ];
    default:
      return [{ rows: 2, cols: 2 }];
  }
}

/** @param {number} panelCount @returns {ImageSettings} */
export function createDefaultSettings(panelCount = 4) {
  return {
    panelCount,
    grid: defaultGridForPanelCount(panelCount),
    margins: defaultMargins(),
    gutters: defaultGutters(),
    verticalBoundaries: null,
    horizontalBoundaries: null,
    panelCropOffsets: null,
  };
}

/** @returns {AppState} */
export function createInitialState() {
  return {
    images: [],
    activeIndex: -1,
    phase: 'section',
    activePanelIndex: 0,
    selectedSceneOrder: 1,
    projectTitle: 'Untitled Short Film',
    exportManifest: null,
    exportPackage: null,
    exportBuilding: false,
    sceneOverrides: {},
    extraAssets: [],
    sceneAudioMap: {},
    scenePromptMap: {},
    sceneDurationMap: {},
    sceneAudioDurationCache: {},
    sceneReferenceMap: {},
    generationCostEstimate: null,
    selectedFalModel: 'alibaba/happy-horse/image-to-video',
    falModels: [],
    falModelsLoading: false,
    generationRunning: false,
    generationStatus: '',
    happyHorseDuration: 5,
    lastHappyHorseJob: null,
    statusMessage: '',
    statusType: 'info',
  };
}

/** @param {AppState} state @returns {QueuedImage|null} */
export function getActiveImage(state) {
  if (state.activeIndex < 0 || state.activeIndex >= state.images.length) {
    return null;
  }
  return state.images[state.activeIndex];
}

/** @param {string} filename @returns {string} */
export function stemFromFilename(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  return base.replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '') || 'storyboard';
}

let idCounter = 0;

/** @returns {string} */
export function nextId() {
  idCounter += 1;
  return `img-${idCounter}`;
}

export {};

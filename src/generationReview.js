import { DURATION_OPTIONS, describeSceneDuration, formatUsd } from './sceneDuration.js';

/**
 * @param {HTMLElement} container
 * @param {import('./exportPackage.js').SceneExport[]} scenes
 * @param {Record<string, import('./generation.js').SceneOverride>} overrides
 * @param {import('./generation.js').ExtraAsset[]} extraAssets
 * @param {Record<string, string|null>} sceneAudioMap
 * @param {Record<string, string>} scenePromptMap
 * @param {Record<string, import('./sceneDuration.js').SceneDurationSetting>} sceneDurationMap
 * @param {Record<string, import('./sceneReferences.js').SceneReferenceImage[]>} sceneReferenceMap
 * @param {Record<string, number|null>} sceneAudioDurationCache
 * @param {boolean} falKeyReady
 * @param {string} selectedModelLabel
 * @param {number} defaultDuration
 * @param {{ loading: boolean, error: string|null, perScene: Record<string, { cost: number, currency: string, durationSeconds: number, modelId: string }>, total: number, currency: string }|null} costEstimate
 * @param {(sceneId: string) => void} onReplaceScene
 * @param {(sceneId: string) => void} onResetScene
 * @param {(assetId: string) => void} onRemoveAsset
 * @param {(sceneId: string, assetId: string|null) => void} onAssignAudio
 * @param {(sceneId: string, prompt: string) => void} onAssignPrompt
 * @param {(sceneId: string, value: import('./sceneDuration.js').SceneDurationSetting) => void} onAssignDuration
 * @param {(sceneId: string) => void} onAddReference
 * @param {(sceneId: string, refId: string) => void} onRemoveReference
 */
export function renderGenerationReview(
  container,
  scenes,
  overrides,
  extraAssets,
  sceneAudioMap,
  scenePromptMap,
  sceneDurationMap,
  sceneReferenceMap,
  sceneAudioDurationCache,
  falKeyReady,
  selectedModelLabel,
  defaultDuration,
  costEstimate,
  onReplaceScene,
  onResetScene,
  onRemoveAsset,
  onAssignAudio,
  onAssignPrompt,
  onAssignDuration,
  onAddReference,
  onRemoveReference
) {
  container.innerHTML = '';

  const audioById = new Map(extraAssets.filter((asset) => asset.type === 'audio').map((asset) => [asset.id, asset]));

  const intro = document.createElement('div');
  intro.className = 'generation-intro';
  intro.innerHTML = `
    <h2>Before video generation</h2>
    <p>Animate each storyboard scene with fal.ai image-to-video models.</p>
    <ul class="generation-checklist">
      <li class="${falKeyReady ? 'ready' : 'missing'}">${falKeyReady ? 'FAL API key added' : 'Add your FAL API key in the sidebar'}</li>
      <li class="${selectedModelLabel ? 'ready' : 'missing'}">${selectedModelLabel ? `Model: ${selectedModelLabel}` : 'Choose an image-to-video model'}</li>
      <li class="ready">Set a prompt per scene below</li>
      <li class="ready">Optional: set clip length per scene (Auto uses audio or default)</li>
    </ul>
    <p class="hint">Replace storyboard images, add global extra assets, or attach scene-specific reference images before you start.</p>
  `;
  container.appendChild(intro);

  const extraSection = document.createElement('section');
  extraSection.className = 'generation-section';
  extraSection.innerHTML = `
    <h3>Global extra assets</h3>
    <p class="hint">Shared reference images or audio clips for the whole project.</p>
  `;

  const extraDrop = document.createElement('div');
  extraDrop.className = 'drop-zone generation-drop';
  extraDrop.id = 'extra-assets-drop';
  extraDrop.innerHTML = `
    <p>Drop extra assets here</p>
    <p class="hint">or click to browse</p>
  `;
  extraSection.appendChild(extraDrop);

  const extraList = document.createElement('ul');
  extraList.className = 'asset-list';
  extraList.id = 'extra-assets-list';

  if (extraAssets.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'hint asset-list-empty';
    empty.textContent = 'No extra assets yet';
    extraList.appendChild(empty);
  } else {
    for (const asset of extraAssets) {
      extraList.appendChild(createAssetListItem(asset, onRemoveAsset));
    }
  }

  extraSection.appendChild(extraList);
  container.appendChild(extraSection);

  const scenesSection = document.createElement('section');
  scenesSection.className = 'generation-section';
  scenesSection.innerHTML = `
    <h3>Storyboard scenes</h3>
    <p class="hint">Each scene needs a prompt. Set duration to Auto or pick seconds manually.</p>
  `;

  const sceneGrid = document.createElement('div');
  sceneGrid.className = 'generation-scene-grid';

  const audioAssets = extraAssets.filter((asset) => asset.type === 'audio');

  for (const scene of scenes) {
    const card = document.createElement('article');
    card.className = 'generation-scene-card';

    const img = document.createElement('img');
    img.src = overrides[scene.id]?.previewUrl ?? scene.previewUrl;
    img.alt = scene.id;

    const meta = document.createElement('div');
    meta.className = 'generation-scene-meta';
    meta.innerHTML = `
      <strong>${scene.id}</strong>
      <span>${overrides[scene.id] ? `Replaced · ${overrides[scene.id].name}` : scene.sourceSheet}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'generation-scene-actions';

    const replaceBtn = document.createElement('button');
    replaceBtn.type = 'button';
    replaceBtn.className = 'btn btn-secondary';
    replaceBtn.textContent = 'Replace';
    replaceBtn.addEventListener('click', () => onReplaceScene(scene.id));

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn btn-secondary';
    resetBtn.textContent = 'Reset';
    resetBtn.disabled = !overrides[scene.id];
    resetBtn.addEventListener('click', () => onResetScene(scene.id));

    actions.appendChild(replaceBtn);
    actions.appendChild(resetBtn);

    const promptLabel = document.createElement('label');
    promptLabel.className = 'scene-prompt-label';
    promptLabel.textContent = 'Animation prompt';

    const promptInput = document.createElement('textarea');
    promptInput.className = 'scene-prompt';
    promptInput.rows = 3;
    promptInput.placeholder = 'Describe how this scene should move and sound…';
    promptInput.value = scenePromptMap[scene.id] ?? '';
    promptInput.addEventListener('input', () => {
      onAssignPrompt(scene.id, promptInput.value);
    });

    promptLabel.appendChild(promptInput);
    meta.appendChild(promptLabel);

    const durationLabel = document.createElement('label');
    durationLabel.className = 'scene-duration-label';
    durationLabel.textContent = 'Clip duration';

    const durationSelect = document.createElement('select');
    durationSelect.className = 'scene-duration-select';

    const autoOption = document.createElement('option');
    autoOption.value = 'auto';
    autoOption.textContent = 'Auto';
    autoOption.selected = sceneDurationMap[scene.id] === undefined || sceneDurationMap[scene.id] === 'auto';
    durationSelect.appendChild(autoOption);

    for (const seconds of DURATION_OPTIONS) {
      const option = document.createElement('option');
      option.value = String(seconds);
      option.textContent = `${seconds}s`;
      option.selected = sceneDurationMap[scene.id] === seconds;
      durationSelect.appendChild(option);
    }

    durationSelect.addEventListener('change', () => {
      const value = durationSelect.value === 'auto' ? 'auto' : Number(durationSelect.value);
      onAssignDuration(scene.id, value);
    });

    const durationHint = document.createElement('span');
    durationHint.className = 'scene-duration-hint';
    durationHint.textContent = describeSceneDuration(
      scene.id,
      sceneDurationMap,
      defaultDuration,
      sceneAudioMap,
      audioById,
      sceneAudioDurationCache[scene.id] ?? null
    );

    durationLabel.appendChild(durationSelect);
    durationLabel.appendChild(durationHint);
    meta.appendChild(durationLabel);

    const sceneCost = costEstimate?.perScene?.[scene.id];
    const costLine = document.createElement('p');
    costLine.className = 'scene-cost-estimate';
    if (costEstimate?.loading) {
      costLine.textContent = 'Est. cost: …';
    } else if (costEstimate?.error) {
      costLine.textContent = 'Est. cost unavailable';
    } else if (sceneCost) {
      costLine.textContent = `Est. ${formatUsd(sceneCost.cost, sceneCost.currency)} · ${sceneCost.durationSeconds}s`;
    } else {
      costLine.textContent = 'Est. cost: —';
    }
    meta.appendChild(costLine);

    const refsBlock = document.createElement('div');
    refsBlock.className = 'scene-reference-block';
    refsBlock.innerHTML = '<span class="scene-reference-label">Reference images</span>';

    const refsList = document.createElement('div');
    refsList.className = 'scene-reference-list';
    const refs = sceneReferenceMap[scene.id] ?? [];

    if (refs.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hint scene-reference-empty';
      empty.textContent = 'No reference images';
      refsList.appendChild(empty);
    } else {
      for (const ref of refs) {
        refsList.appendChild(createReferenceThumb(ref, scene.id, onRemoveReference));
      }
    }

    const addRefBtn = document.createElement('button');
    addRefBtn.type = 'button';
    addRefBtn.className = 'btn btn-secondary scene-reference-add';
    addRefBtn.textContent = '+ Add reference';
    addRefBtn.addEventListener('click', () => onAddReference(scene.id));

    refsBlock.appendChild(refsList);
    refsBlock.appendChild(addRefBtn);
    meta.appendChild(refsBlock);

    if (audioAssets.length) {
      const audioLabel = document.createElement('label');
      audioLabel.className = 'audio-assign';
      audioLabel.textContent = 'Extra audio';

      const select = document.createElement('select');
      select.className = 'audio-select';
      const none = document.createElement('option');
      none.value = '';
      none.textContent = 'None';
      select.appendChild(none);

      for (const asset of audioAssets) {
        const opt = document.createElement('option');
        opt.value = asset.id;
        opt.textContent = asset.name;
        opt.selected = sceneAudioMap[scene.id] === asset.id;
        select.appendChild(opt);
      }

      select.addEventListener('change', () => {
        onAssignAudio(scene.id, select.value || null);
      });

      audioLabel.appendChild(select);
      meta.appendChild(audioLabel);
    }

    card.appendChild(img);
    card.appendChild(meta);
    card.appendChild(actions);
    sceneGrid.appendChild(card);
  }

  scenesSection.appendChild(sceneGrid);
  container.appendChild(scenesSection);
}

/**
 * @param {import('./sceneReferences.js').SceneReferenceImage} ref
 * @param {string} sceneId
 * @param {(sceneId: string, refId: string) => void} onRemove
 * @returns {HTMLElement}
 */
function createReferenceThumb(ref, sceneId, onRemove) {
  const item = document.createElement('div');
  item.className = 'scene-reference-item';

  const img = document.createElement('img');
  img.src = ref.previewUrl;
  img.alt = ref.name;
  img.title = ref.name;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-secondary scene-reference-remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => onRemove(sceneId, ref.id));

  item.appendChild(img);
  item.appendChild(removeBtn);
  return item;
}

/**
 * @param {import('./generation.js').ExtraAsset} asset
 * @param {(assetId: string) => void} onRemove
 * @returns {HTMLLIElement}
 */
function createAssetListItem(asset, onRemove) {
  const li = document.createElement('li');
  li.className = 'asset-list-item';

  const badge = document.createElement('span');
  badge.className = `asset-badge asset-badge-${asset.type}`;
  badge.textContent = asset.type;

  const name = document.createElement('span');
  name.className = 'asset-name';
  name.textContent = asset.name;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-secondary';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => onRemove(asset.id));

  li.appendChild(badge);
  li.appendChild(name);
  li.appendChild(removeBtn);
  return li;
}

/**
 * @param {HTMLElement} container
 * @param {Object[]} jobScenes
 * @param {import('./falVideo.js').SceneVideoResult[]} [videos]
 */
export function renderGenerationResults(container, jobScenes, videos = []) {
  const block = document.createElement('div');
  block.className = 'generation-results';
  block.innerHTML = `
    <h3>Videos ready</h3>
    <p class="hint">${videos.length || jobScenes.length} scenes generated via fal.ai</p>
  `;

  const list = document.createElement('ul');
  list.className = 'generation-results-list';

  for (const scene of jobScenes) {
    const li = document.createElement('li');
    const video = videos.find((entry) => entry.sceneId === scene.id);
    if (video?.videoUrl) {
      const link = document.createElement('a');
      link.href = video.videoUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const durationLabel = scene.duration ? ` · ${scene.duration}s` : '';
      link.textContent = `${scene.id} → preview video (${video.modelId}${durationLabel})`;
      li.appendChild(link);
    } else {
      li.textContent = `${scene.id} → ${scene.frame}${scene.audio ? ` + ${scene.audio}` : ''}`;
    }
    list.appendChild(li);
  }

  block.appendChild(list);
  container.appendChild(block);
}

/**
 * @param {HTMLElement} container
 * @param {{ scenes: import('./exportPackage.js').SceneExport[], manifest: import('./exportPackage.js').ExportManifest }} pkg
 * @param {number} selectedOrder
 * @param {(order: number) => void} onSelect
 */
export function renderExportReview(container, pkg, selectedOrder, onSelect) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'export-review-header';

  const title = document.createElement('h2');
  title.textContent = pkg.manifest.project.title;

  const meta = document.createElement('p');
  meta.className = 'hint';
  meta.textContent = `${pkg.scenes.length} scenes · ${pkg.manifest.project.sourceSheetCount} storyboard sheet(s) · ready for AI pipeline`;

  header.appendChild(title);
  header.appendChild(meta);
  container.appendChild(header);

  if (selectedOrder > 0) {
    const selected = pkg.scenes.find((s) => s.order === selectedOrder);
    if (selected) {
      const hero = document.createElement('div');
      hero.className = 'export-hero';

      const img = document.createElement('img');
      img.src = selected.previewUrl;
      img.alt = selected.id;

      const heroMeta = document.createElement('div');
      heroMeta.className = 'export-hero-meta';
      heroMeta.innerHTML = `
        <strong>${selected.id}</strong>
        <span>${selected.width} × ${selected.height}px</span>
        <span>From ${selected.sourceSheet} · panel ${selected.sourcePanel}</span>
      `;

      hero.appendChild(img);
      hero.appendChild(heroMeta);
      container.appendChild(hero);
    }
  }

  const stripLabel = document.createElement('h3');
  stripLabel.textContent = 'Story order';
  container.appendChild(stripLabel);

  const strip = document.createElement('div');
  strip.className = 'film-strip';

  for (const scene of pkg.scenes) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `film-strip-card${scene.order === selectedOrder ? ' active' : ''}`;

    const img = document.createElement('img');
    img.src = scene.previewUrl;
    img.alt = scene.id;

    const label = document.createElement('span');
    label.textContent = String(scene.order).padStart(2, '0');

    const source = document.createElement('small');
    source.textContent = scene.sourceSheet;

    card.appendChild(img);
    card.appendChild(label);
    card.appendChild(source);
    card.addEventListener('click', () => onSelect(scene.order));
    strip.appendChild(card);
  }

  container.appendChild(strip);

  const manifestBlock = document.createElement('div');
  manifestBlock.className = 'manifest-preview';
  manifestBlock.innerHTML = `
    <h3>AI manifest preview</h3>
    <p class="hint">Each scene includes empty shot, action, dialogue, and notes fields for your AI pipeline.</p>
    <pre>${escapeHtml(JSON.stringify(pkg.manifest, null, 2))}</pre>
  `;
  container.appendChild(manifestBlock);
}

/** @param {string} value @returns {string} */
function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

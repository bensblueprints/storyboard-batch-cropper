const LICENSE_STORAGE = 'storyboard-license-key';
const LICENSE_STATUS_STORAGE = 'storyboard-license-status';

export const PRODUCT_ID = 'storyboard-batch-cropper';

/** @returns {string} */
export function getLicenseApiUrl() {
  if (import.meta.env.VITE_LICENSE_API_URL?.trim()) {
    return import.meta.env.VITE_LICENSE_API_URL.trim();
  }
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:8787/api/v1';
  }
  return 'https://benjisaiempire.com/api/v1';
}

/** @returns {boolean} */
export function isLicenseBypassed() {
  return import.meta.env.VITE_LICENSE_BYPASS === 'true';
}

/** @returns {string} */
export function getStoredLicenseKey() {
  return localStorage.getItem(LICENSE_STORAGE)?.trim() || '';
}

/** @param {string} key */
export function saveLicenseKey(key) {
  const trimmed = key.trim();
  if (trimmed) {
    localStorage.setItem(LICENSE_STORAGE, trimmed);
  } else {
    localStorage.removeItem(LICENSE_STORAGE);
  }
}

/** @returns {Object|null} */
export function getStoredLicenseStatus() {
  const raw = localStorage.getItem(LICENSE_STATUS_STORAGE);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** @param {Object|null} status */
export function saveLicenseStatus(status) {
  if (status) {
    localStorage.setItem(LICENSE_STATUS_STORAGE, JSON.stringify(status));
  } else {
    localStorage.removeItem(LICENSE_STATUS_STORAGE);
  }
}

/**
 * @param {string} key
 * @returns {Promise<{ valid: boolean, type?: string, message?: string }>}
 */
export async function validateLicenseKey(key) {
  if (isLicenseBypassed()) {
    return { valid: true, type: 'dev-bypass' };
  }

  const trimmed = key.trim();
  if (!trimmed) {
    return { valid: false, message: 'Enter your license key' };
  }

  const response = await fetch(`${getLicenseApiUrl()}/licenses/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: trimmed, product: PRODUCT_ID }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return {
      valid: false,
      message: error.message || 'License validation failed',
    };
  }

  return response.json();
}

/**
 * @returns {Promise<boolean>}
 */
export async function ensureLicensedApp() {
  if (isLicenseBypassed()) {
    return true;
  }

  const existing = getStoredLicenseStatus();
  if (existing?.valid && getStoredLicenseKey()) {
    return true;
  }

  return new Promise((resolve) => {
    showLicenseModal(async (key) => {
      saveLicenseKey(key);
      const result = await validateLicenseKey(key);
      if (result.valid) {
        saveLicenseStatus(result);
        resolve(true);
        return true;
      }
      saveLicenseStatus(null);
      return false;
    }, resolve);
  });
}

/**
 * @param {(key: string) => Promise<boolean>} onSubmit
 * @param {(allowed: boolean) => void} onClose
 */
function showLicenseModal(onSubmit, onClose) {
  const overlay = document.createElement('div');
  overlay.className = 'license-overlay';
  overlay.innerHTML = `
    <div class="license-modal" role="dialog" aria-modal="true" aria-labelledby="license-title">
      <h2 id="license-title">Activate Storyboard Batch Cropper</h2>
      <p class="hint">
        Enter your license key from Benji's AI Empire. Program members and one-time purchasers ($9.99) both receive a key.
      </p>
      <label class="license-label" for="license-key-input">License key</label>
      <input id="license-key-input" type="text" placeholder="SB-XXXX-XXXX-XXXX" autocomplete="off" />
      <p id="license-error" class="license-error hidden"></p>
      <div class="license-actions">
        <button type="button" id="license-submit-btn" class="btn btn-primary">Activate</button>
        <a href="https://benjisaiempire.com/software/storyboard-batch-cropper" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
          Get license — $9.99
        </a>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = /** @type {HTMLInputElement} */ (overlay.querySelector('#license-key-input'));
  const errorEl = /** @type {HTMLElement} */ (overlay.querySelector('#license-error'));
  const submitBtn = /** @type {HTMLButtonElement} */ (overlay.querySelector('#license-submit-btn'));

  const stored = getStoredLicenseKey();
  if (stored) {
    input.value = stored;
  }

  async function submit() {
    errorEl.classList.add('hidden');
    submitBtn.disabled = true;
    const ok = await onSubmit(input.value);
    submitBtn.disabled = false;
    if (ok) {
      overlay.remove();
      return;
    }
    errorEl.textContent = 'Invalid or inactive license key.';
    errorEl.classList.remove('hidden');
  }

  submitBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      submit();
    }
  });
}

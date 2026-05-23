const FAL_KEY_STORAGE = 'storyboard-fal-key';

/** @returns {string} */
export function getFalKey() {
  const stored = localStorage.getItem(FAL_KEY_STORAGE)?.trim();
  if (stored) {
    return stored;
  }
  return import.meta.env.VITE_FAL_KEY?.trim() || '';
}

/** @param {string} key */
export function saveFalKey(key) {
  const trimmed = key.trim();
  if (trimmed) {
    localStorage.setItem(FAL_KEY_STORAGE, trimmed);
  } else {
    localStorage.removeItem(FAL_KEY_STORAGE);
  }
}

/** @returns {boolean} */
export function hasFalKey() {
  return Boolean(getFalKey());
}

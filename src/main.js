import { initUI } from './ui.js';
import { ensureLicensedApp } from './license.js';

async function boot() {
  await ensureLicensedApp();
  initUI();
}

boot();

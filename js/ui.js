/** ui.js — UI utilities: showScreen, showToast
 *  Separated from app.js to prevent circular imports.
 *  Both app.js, watches.js and setup.js import from here. */

import { state } from './state.js';

/* ── Screen routing ── */
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.removeAttribute('hidden');  // remove any stale hidden attributes
  });
  const el = document.getElementById(`screen-${id}`);
  if (el) {
    el.classList.add('active');
    el.removeAttribute('hidden');
  }
  state.ui.activeScreen = id;

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.screen === id);
  });
}

/* ── Toast system ── */
export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// Expose globally for onclick handlers in HTML
window.showScreen = showScreen;
window.showToast  = showToast;

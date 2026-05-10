/** settings.js — Settings screen rendering only
 *  All handlers (window._pw*) are registered in app.js after boot.
 *  This module only handles UI rendering: syncSettingsUI and renderApiPanel.
 */

import { state }                                from './state.js';
import { apiStatus, NOAA_CONFIG, noaaStaleness } from './noaa.js';
import { ageMinutes }                           from './utils.js';

export function initSettings() {
  syncSettingsUI();
  renderApiPanel();
}

export function syncSettingsUI() {
  const lc    = state.user.licenseClass ?? 'A';
  const pw    = state.user.txPowerW    ?? 100;
  const qrp   = state.user.qrpMode     ?? false;
  const theme = state.user.theme        ?? 'dark';
  const lang  = state.user.lang         ?? 'en';
  const grid  = state.user.grid         ?? '';
  const maxMap = { C: 25, B: 100, A: 1500 };
  const max    = maxMap[lc] ?? 1500;

  // License buttons
  document.querySelectorAll('[data-lic]').forEach(b => {
    const active = b.dataset.lic === lc;
    b.className = active ? 'btn btn--primary' : 'btn btn--secondary';
    b.style.cssText = 'width:100%;display:flex;justify-content:space-between;min-height:44px;padding:0 16px';
  });

  // Power slider
  const sl = document.getElementById('pwr-slider');
  if (sl) { sl.max = max; sl.value = Math.min(pw, max); }
  _updatePowerDisplay(Math.min(pw, max));

  // Slider labels
  const midEl = document.getElementById('pwr-mid');
  const maxEl = document.getElementById('pwr-max-label');
  if (midEl) midEl.textContent = lc === 'C' ? '15W' : lc === 'B' ? '50W' : '400W';
  if (maxEl) maxEl.textContent = max + 'W';

  // Checkboxes & selects
  const qrpEl   = document.getElementById('qrp-toggle');
  const themeEl = document.getElementById('theme-toggle');
  const langEl  = document.getElementById('lang-select');
  const gridEl  = document.getElementById('grid-input');
  if (qrpEl)   qrpEl.checked  = qrp;
  if (themeEl) themeEl.checked = theme === 'light';
  if (langEl)  langEl.value   = lang;
  if (gridEl)  gridEl.value   = grid;
}

export function renderApiPanel() {
  const panel = document.getElementById('api-test-panel');
  if (!panel) return;

  const kp    = state.propagation.kp;
  const sfi   = state.propagation.sfi;
  const age   = state.propagation.fetchedAt ? ageMinutes(state.propagation.fetchedAt) : null;
  const stale = noaaStaleness();

  const connOk   = state.connections.noaaOk;
  const connIcon = connOk === true ? '✅' : connOk === false ? '❌' : '○';
  const staleColor = stale === 'ok' ? 'var(--color-good-text)'
                   : stale === 'warn' ? 'var(--color-warn-text)'
                   : stale === 'stale' ? 'var(--color-bad-text)'
                   : 'var(--color-text-secondary)';

  const epRows = Object.entries(apiStatus).map(([key, st]) => {
    const labels = { kp: 'Kp index (1-min)', sfi: 'Solar Flux Index', scales: 'Storm scales' };
    const icon = st.ok === true ? '✅' : st.ok === false ? '❌' : '○';
    const col  = st.ok === true ? 'var(--color-good-text)'
               : st.ok === false ? 'var(--color-bad-text)'
               : 'var(--color-text-secondary)';
    const val  = st.value != null ? ` <strong>${typeof st.value === 'number' ? st.value.toFixed(key === 'kp' ? 2 : 0) : st.value}</strong>` : '';
    const lat  = st.latency_ms != null ? ` · ${st.latency_ms}ms` : '';
    const err  = st.error ? `<div style="font-size:10px;color:var(--color-bad-text);font-family:var(--font-mono);margin-top:2px">${st.error}</div>` : '';
    return `<div style="background:var(--color-bg-tertiary);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:10px 12px;margin-bottom:6px">
      <div style="display:flex;justify-content:space-between">
        <span style="color:${col}">${icon} ${labels[key] ?? key}</span>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--color-text-secondary)">${val}${lat}</span>
      </div>${err}</div>`;
  }).join('');

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div>
        <div style="font-weight:600">${connIcon} ${connOk === true ? 'NOAA connected' : connOk === false ? 'Not reachable' : 'Not tested'}</div>
        <div style="font-size:11px;font-family:var(--font-mono);color:${staleColor};margin-top:2px">
          ${age !== null ? `Kp ${kp?.toFixed(2) ?? '—'} · SFI ${sfi ?? '—'} · ${age}m ago` : 'No data — tap Test API'}
        </div>
      </div>
      <button onclick="window._pwTestAPI()"
        style="background:var(--color-accent);color:#fff;border:none;border-radius:8px;
               padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;min-height:44px">
        🔌 Test API
      </button>
    </div>
    ${epRows}`;
}

function _updatePowerDisplay(v) {
  v = parseInt(v) || 100;
  const disp = document.getElementById('pwr-display');
  const dbEl = document.getElementById('pwr-db');
  const hint = document.getElementById('pwr-hint');
  if (disp) disp.textContent = v + 'W';
  if (dbEl) {
    const db = v === 100 ? 0 : 10 * Math.log10(v / 100);
    dbEl.textContent = v === 100 ? '(ref 100W)' : `(${db > 0 ? '+' : ''}${db.toFixed(1)} dB vs 100W)`;
  }
  if (hint) {
    if (v <= 5)        hint.textContent = 'QRP ≤5W — POTA/SOTA. Only strong paths viable.';
    else if (v <= 25)  hint.textContent = 'Class C — significant penalty on marginal paths.';
    else if (v < 100)  hint.textContent = `${v}W — slight reduction vs 100W.`;
    else if (v === 100)hint.textContent = 'Reference power — no correction applied.';
    else               hint.textContent = `${v}W — reliability slightly boosted.`;
  }
}

// Expose for external update (called by handlers in app.js)
export { _updatePowerDisplay as updatePowerDisplay };

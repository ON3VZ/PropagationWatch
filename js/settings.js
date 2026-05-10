/** settings.js — Settings screen: all handlers, API test panel
 *
 *  All window._pw* handlers live here.
 *  No handlers in app.js or inline scripts.
 *  Imported by app.js as ES module.
 */

import { state, persistUser, subscribe, publish } from './state.js';
import { fetchNOAA, testAllEndpoints, apiStatus,
         ENDPOINTS, NOAA_CONFIG, noaaStaleness }  from './noaa.js';
import { showToast }                              from './ui.js';
import { ageMinutes, gridToLatLon }               from './utils.js';
import { setLang }                                from './i18n.js';

/* Expose globally — overrides the stub registered in index.html sync script */
window._pwInitSettings = function() { initSettings(); };

let _subscribed = false;
let _testing    = false;

/* ─────────────────────────────────────────────
   Public API
───────────────────────────────────────────── */

export function initSettings() {
  syncSettingsUI();
  renderApiPanel();
  if (!_subscribed) {
    subscribe('apiStatus',   renderApiPanel);
    subscribe('propagation', renderApiPanel);
    _subscribed = true;
  }
}

export function syncSettingsUI() {
  const lc    = state.user.licenseClass ?? 'A';
  const pw    = state.user.txPowerW    ?? 100;
  const qrp   = state.user.qrpMode     ?? false;
  const theme = state.user.theme        ?? 'dark';
  const lang  = state.user.lang         ?? 'en';
  const grid  = state.user.grid         ?? '';
  const maxMap = { C: 25, B: 100, A: 1500 };

  /* License buttons */
  document.querySelectorAll('[data-lic]').forEach(b => {
    const active = b.dataset.lic === lc;
    b.className          = active ? 'btn btn--primary' : 'btn btn--secondary';
    b.style.width        = '100%';
    b.style.display      = 'flex';
    b.style.justifyContent = 'space-between';
    b.style.minHeight    = '44px';
    b.style.padding      = '0 var(--space-4)';
  });

  /* Power slider */
  const max    = maxMap[lc] ?? 1500;
  const slider = document.getElementById('pwr-slider');
  if (slider) {
    slider.max   = max;
    slider.value = Math.min(pw, max);
    _updatePowerDisplay(Math.min(pw, max));
  }
  _updateSliderLabels(lc);

  /* Toggles */
  const qrpEl   = document.getElementById('qrp-toggle');
  const themeEl = document.getElementById('theme-toggle');
  const langEl  = document.getElementById('lang-select');
  const gridEl  = document.getElementById('grid-input');
  if (qrpEl)   qrpEl.checked  = qrp;
  if (themeEl) themeEl.checked = (theme === 'light');
  if (langEl)  langEl.value   = lang;
  if (gridEl)  gridEl.value   = grid;
}

/* ─────────────────────────────────────────────
   API test panel
───────────────────────────────────────────── */

function renderApiPanel() {
  const panel = document.getElementById('api-test-panel');
  if (!panel) return;

  const kp    = state.propagation.kp;
  const sfi   = state.propagation.sfi;
  const age   = state.propagation.fetchedAt ? ageMinutes(state.propagation.fetchedAt) : null;
  const stale = noaaStaleness();

  const connIcon  = state.connections.noaaOk === true  ? '✅'
                  : state.connections.noaaOk === false ? '❌' : '○';
  const staleColor = stale === 'ok'    ? 'var(--color-good-text)'
                   : stale === 'warn'  ? 'var(--color-warn-text)'
                   : stale === 'stale' ? 'var(--color-bad-text)'
                   : 'var(--color-text-secondary)';

  const epRows = Object.entries(ENDPOINTS).map(([key, ep]) => {
    const st   = apiStatus[key];
    const icon = st.ok === true ? '✅' : st.ok === false ? '❌' : '○';
    const col  = st.ok === true ? 'var(--color-good-text)'
               : st.ok === false ? 'var(--color-bad-text)'
               : 'var(--color-text-secondary)';
    const val  = st.value != null
      ? ` <strong>${typeof st.value === 'number' ? st.value.toFixed(key === 'kp' ? 2 : 0) : st.value}</strong>` : '';
    const lat  = st.latency_ms != null ? ` · ${st.latency_ms}ms` : '';
    const err  = st.error
      ? `<div style="font-size:10px;color:var(--color-bad-text);font-family:var(--font-mono);margin-top:2px;word-break:break-all">${st.error}</div>` : '';

    return `<div style="background:var(--color-bg-tertiary);border:1px solid var(--color-border);
                border-radius:var(--radius-md);padding:10px var(--space-3)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:var(--text-sm);color:${col}">${icon} ${ep.label}</span>
        <span style="font-size:11px;font-family:var(--font-mono);color:var(--color-text-secondary)">${val}${lat}</span>
      </div>
      ${err}
      <div style="font-size:10px;color:var(--color-text-muted);margin-top:3px;word-break:break-all;font-family:var(--font-mono)">${ep.url.replace('https://services.swpc.noaa.gov','')}</div>
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3)">
      <div>
        <div style="font-size:var(--text-sm);font-weight:var(--weight-bold)">
          ${connIcon} ${state.connections.noaaOk === true  ? 'NOAA connected'
                       : state.connections.noaaOk === false ? 'NOAA not reachable'
                       : 'Not yet tested'}
        </div>
        <div style="font-size:11px;font-family:var(--font-mono);color:${staleColor};margin-top:2px">
          ${age !== null ? `Kp <strong>${kp?.toFixed(2) ?? '—'}</strong> · SFI <strong>${sfi ?? '—'}</strong> · ${age}m ago` : 'No data — tap Test API'}
        </div>
      </div>
      <button onclick="window._pwTestAPI()"
        ${_testing ? 'disabled' : ''}
        style="background:${_testing ? 'var(--color-bg-elevated)' : 'var(--color-accent)'};
               color:${_testing ? 'var(--color-text-secondary)' : '#fff'};
               border:none;border-radius:var(--radius-md);padding:10px var(--space-4);
               font-size:var(--text-sm);font-weight:var(--weight-bold);cursor:pointer;
               min-height:44px;white-space:nowrap">
        ${_testing ? '⏳ Testing…' : '🔌 Test API'}
      </button>
    </div>
    <div style="display:flex;flex-direction:column;gap:var(--space-2)">${epRows}</div>
    <details style="margin-top:var(--space-3)">
      <summary style="font-size:var(--text-xs);color:var(--color-text-muted);cursor:pointer;padding:4px 0">
        ⚙ Advanced configuration
      </summary>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-top:var(--space-3)">
        <div class="field">
          <label class="field__label" style="font-size:11px">Timeout (sec)</label>
          <input class="field__input" id="cfg-timeout" type="number" min="3" max="30"
                 value="${NOAA_CONFIG.timeout_ms/1000}" style="font-family:var(--font-mono)"
                 onchange="window._pwSaveCfg()"/>
        </div>
        <div class="field">
          <label class="field__label" style="font-size:11px">Poll interval (min)</label>
          <input class="field__input" id="cfg-poll" type="number" min="1" max="60"
                 value="${NOAA_CONFIG.poll_interval}" style="font-family:var(--font-mono)"
                 onchange="window._pwSaveCfg()"/>
        </div>
        <div class="field">
          <label class="field__label" style="font-size:11px">Fallback SFI</label>
          <input class="field__input" id="cfg-fallback-sfi" type="number" min="60" max="300"
                 value="${NOAA_CONFIG.fallback_sfi}" style="font-family:var(--font-mono)"
                 onchange="window._pwSaveCfg()"/>
        </div>
        <div class="field">
          <label class="field__label" style="font-size:11px">Fallback Kp</label>
          <input class="field__input" id="cfg-fallback-kp" type="number" min="0" max="9" step="0.5"
                 value="${NOAA_CONFIG.fallback_kp}" style="font-family:var(--font-mono)"
                 onchange="window._pwSaveCfg()"/>
        </div>
      </div>
    </details>`;
}

/* ─────────────────────────────────────────────
   Internal helpers
───────────────────────────────────────────── */

function _updatePowerDisplay(v) {
  v = parseInt(v);
  const disp = document.getElementById('pwr-display');
  const dbEl = document.getElementById('pwr-db');
  const hint = document.getElementById('pwr-hint');
  if (disp) disp.textContent = v + 'W';
  if (dbEl) {
    const db = v === 100 ? 0 : 10 * Math.log10(v / 100);
    dbEl.textContent = v === 100 ? '(ref 100W)' : `(${db > 0 ? '+' : ''}${db.toFixed(1)} dB vs 100W)`;
  }
  if (hint) {
    if      (v <= 1)   hint.textContent = 'QRPp — experimental, extreme QRP.';
    else if (v <= 5)   hint.textContent = 'QRP ≤5W — POTA/SOTA. Only strong paths viable.';
    else if (v <= 25)  hint.textContent = 'Class C range — significant penalty on marginal paths.';
    else if (v < 100)  hint.textContent = `${v}W — slight reduction vs 100W reference.`;
    else if (v === 100)hint.textContent = 'Reference power — no correction applied.';
    else               hint.textContent = `${v}W — reliability slightly boosted vs 100W.`;
  }
}

function _updateSliderLabels(lc) {
  const maxMap = { C: 25, B: 100, A: 1500 };
  const midMap = { C: '15W', B: '50W', A: '400W' };
  const midEl = document.getElementById('pwr-mid');
  const maxEl = document.getElementById('pwr-max-label');
  if (midEl) midEl.textContent = midMap[lc] ?? '100W';
  if (maxEl) maxEl.textContent = (maxMap[lc] ?? 1500) + 'W';
}

/* ─────────────────────────────────────────────
   Window-exposed handlers — called from HTML onclick
───────────────────────────────────────────── */

window._pwSelectLicClass = function(cls) {
  const maxMap = { C: 25, B: 100, A: 1500 };
  const max    = maxMap[cls] ?? 1500;

  state.user.licenseClass = cls;
  state.user.txPowerW     = max;   // click on class → set to class maximum
  state.user.qrpMode      = false;

  document.querySelectorAll('[data-lic]').forEach(b => {
    const active = b.dataset.lic === cls;
    b.className            = active ? 'btn btn--primary' : 'btn btn--secondary';
    b.style.width          = '100%';
    b.style.display        = 'flex';
    b.style.justifyContent = 'space-between';
    b.style.minHeight      = '44px';
    b.style.padding        = '0 var(--space-4)';
  });

  const sl  = document.getElementById('pwr-slider');
  const tog = document.getElementById('qrp-toggle');
  if (sl)  { sl.max = max; sl.value = max; _updatePowerDisplay(max); }
  if (tog) tog.checked = false;
  _updateSliderLabels(cls);

  persistUser();
  if (window._pwEvaluate) { window._pwEvaluate(); }
  showToast(`Class ${cls} — ${max}W`, 'success');
};

window._pwUpdatePower = function(v) {
  v = parseInt(v);
  if (isNaN(v) || v < 1) return;
  state.user.txPowerW = v;
  if (v > 5 && state.user.qrpMode) {
    state.user.qrpMode = false;
    const tog = document.getElementById('qrp-toggle');
    if (tog) tog.checked = false;
  }
  _updatePowerDisplay(v);
  persistUser();
  if (window._pwEvaluate) { window._pwEvaluate(); }
};

window._pwToggleQRP = function(on) {
  const defMap = { C: 25, B: 100, A: 100 };
  state.user.qrpMode  = on;
  state.user.txPowerW = on ? 5 : (defMap[state.user.licenseClass ?? 'A']);
  const sl = document.getElementById('pwr-slider');
  if (sl) { sl.value = state.user.txPowerW; _updatePowerDisplay(state.user.txPowerW); }
  persistUser();
  if (window._pwEvaluate) { window._pwEvaluate(); }
};

window._pwToggleTheme = function(light) {
  state.user.theme = light ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.user.theme);
  persistUser();
};

window._pwChangeLang = function(lang) {
  state.user.lang = lang;
  setLang(lang);
  persistUser();
  showToast(`Language: ${lang === 'nl' ? 'Nederlands' : 'English'}`, 'info');
};

window._pwSaveLocation = function() {
  const val = document.getElementById('grid-input')?.value?.trim().toUpperCase();
  if (!val) { showToast('Enter a grid square (e.g. JO20ev)', 'warn'); return; }
  try {
    const { lat, lon } = gridToLatLon(val);
    if (isNaN(lat) || isNaN(lon)) throw new Error('Invalid grid');
    state.user.grid = val;
    state.user.lat  = lat;
    state.user.lon  = lon;
    persistUser();
    showToast(`Location saved — ${val} (${lat.toFixed(2)}°N ${lon.toFixed(2)}°E)`, 'success');
    if (window._pwEvaluate) window._pwEvaluate();
  } catch {
    showToast('Invalid grid square — use format JO20ev', 'error');
  }
};

window._pwTestAPI = async function() {
  if (_testing) return;
  _testing = true;
  renderApiPanel();
  try {
    await testAllEndpoints();
    const ok = apiStatus.kp.ok || apiStatus.sfi.ok;
    if (ok) {
      await fetchNOAA();
      showToast(`✅ NOAA OK — Kp ${state.propagation.kp?.toFixed(2) ?? '—'} · SFI ${state.propagation.sfi ?? '—'}`, 'success');
    } else {
      showToast('❌ All NOAA endpoints failed', 'error');
    }
  } catch(e) {
    showToast(`Error: ${e.message}`, 'error');
  } finally {
    _testing = false;
    renderApiPanel();
  }
};

window._pwSaveCfg = function() {
  const t   = parseFloat(document.getElementById('cfg-timeout')?.value);
  const p   = parseInt(document.getElementById('cfg-poll')?.value);
  const sfi = parseInt(document.getElementById('cfg-fallback-sfi')?.value);
  const kp  = parseFloat(document.getElementById('cfg-fallback-kp')?.value);
  if (!isNaN(t)   && t >= 3)   NOAA_CONFIG.timeout_ms    = t * 1000;
  if (!isNaN(p)   && p >= 1)   NOAA_CONFIG.poll_interval = p;
  if (!isNaN(sfi) && sfi > 0)  NOAA_CONFIG.fallback_sfi  = sfi;
  if (!isNaN(kp)  && kp >= 0)  NOAA_CONFIG.fallback_kp   = kp;
  try {
    localStorage.setItem('pw_noaa_config', JSON.stringify({
      timeout_ms: NOAA_CONFIG.timeout_ms, poll_interval: NOAA_CONFIG.poll_interval,
      fallback_sfi: NOAA_CONFIG.fallback_sfi, fallback_kp: NOAA_CONFIG.fallback_kp,
    }));
  } catch {}
  showToast('Config saved', 'success');
};

/** settings.js — Settings screen: power, location, display, API test panel */

import { state, persistUser, subscribe, publish } from './state.js';
import { fetchNOAA, testAllEndpoints, apiStatus,
         ENDPOINTS, NOAA_CONFIG, noaaStaleness }    from './noaa.js';
import { showToast }         from './ui.js';
import { ageMinutes, gridToLatLon } from './utils.js';
import { evaluateAllWatches } from './watches.js';
import { setLang }           from './i18n.js';

/* Expose globally so onclick handlers in HTML can call it */
window._pwInitSettings = initSettings;

let _subscribed = false;

export function initSettings() {
  syncSettingsUI();
  renderApiPanel();
  // Subscribe only once
  if (!_subscribed) {
    subscribe('apiStatus', renderApiPanel);
    subscribe('propagation', renderApiPanel);
    _subscribed = true;
  }
}

/* ─────────────────────────────────────────────
   Sync all UI elements to current state
───────────────────────────────────────────── */
export function syncSettingsUI() {
  const lc    = state.user.licenseClass ?? 'A';
  const pw    = state.user.txPowerW    ?? 100;
  const qrp   = state.user.qrpMode     ?? false;
  const theme = state.user.theme        ?? 'dark';
  const lang  = state.user.lang         ?? 'en';
  const grid  = state.user.grid         ?? '';

  /* License buttons */
  document.querySelectorAll('[data-lic]').forEach(btn => {
    const active = btn.dataset.lic === lc;
    btn.className = active ? 'btn btn--primary' : 'btn btn--secondary';
    btn.style.justifyContent = 'space-between';
    btn.style.minHeight      = '44px';
    btn.style.padding        = '0 var(--space-4)';
  });

  /* Power slider */
  const maxMap = { C: 25, B: 100, A: 1500 };
  const max    = maxMap[lc] ?? 1500;
  const slider = document.getElementById('pwr-slider');
  if (slider) {
    slider.max   = max;
    slider.value = Math.min(pw, max);
    updatePowerDisplay(Math.min(pw, max));
  }
  const midEl = document.getElementById('pwr-mid');
  const maxEl = document.getElementById('pwr-max-label');
  if (midEl) midEl.textContent = lc === 'C' ? '15W' : lc === 'B' ? '50W' : '100W';
  if (maxEl) maxEl.textContent = max + 'W';

  /* QRP toggle */
  const qrpEl = document.getElementById('qrp-toggle');
  if (qrpEl) qrpEl.checked = qrp;

  /* Theme */
  const themeEl = document.getElementById('theme-toggle');
  if (themeEl) themeEl.checked = theme === 'light';

  /* Language */
  const langEl = document.getElementById('lang-select');
  if (langEl) langEl.value = lang;

  /* Grid */
  const gridEl = document.getElementById('grid-input');
  if (gridEl) gridEl.value = grid;

  /* NOAA config inputs */
  const to  = document.getElementById('cfg-timeout');
  const pol = document.getElementById('cfg-poll');
  const fsfi = document.getElementById('cfg-fallback-sfi');
  const fkp  = document.getElementById('cfg-fallback-kp');
  if (to)   to.value   = NOAA_CONFIG.timeout_ms / 1000;
  if (pol)  pol.value  = NOAA_CONFIG.poll_interval;
  if (fsfi) fsfi.value = NOAA_CONFIG.fallback_sfi;
  if (fkp)  fkp.value  = NOAA_CONFIG.fallback_kp;
}

/* ─────────────────────────────────────────────
   API test panel
───────────────────────────────────────────── */
let _testing = false;

function renderApiPanel() {
  const panel = document.getElementById('api-test-panel');
  if (!panel) return;

  const age     = state.propagation.fetchedAt ? ageMinutes(state.propagation.fetchedAt) : null;
  const kp      = state.propagation.kp;
  const sfi     = state.propagation.sfi;
  const stale   = noaaStaleness();

  const connColor = state.connections.noaaOk === true  ? 'var(--color-good-text)'
                  : state.connections.noaaOk === false ? 'var(--color-bad-text)'
                  : 'var(--color-text-muted)';
  const connIcon  = state.connections.noaaOk === true  ? '✅'
                  : state.connections.noaaOk === false ? '❌'
                  : '○';
  const staleColor = stale === 'ok'    ? 'var(--color-good-text)'
                   : stale === 'warn'  ? 'var(--color-warn-text)'
                   : stale === 'stale' ? 'var(--color-bad-text)'
                   : 'var(--color-text-muted)';

  /* ── Endpoint rows ── */
  const epRows = Object.entries(ENDPOINTS).map(([key, ep]) => {
    const st   = apiStatus[key];
    const icon = st.ok === true ? '✅' : st.ok === false ? '❌' : '○';
    const col  = st.ok === true ? 'var(--color-good-text)'
               : st.ok === false ? 'var(--color-bad-text)'
               : 'var(--color-text-muted)';
    const val  = st.value != null
      ? ` <strong>${typeof st.value === 'number' ? st.value.toFixed(key === 'kp' ? 2 : 0) : st.value}</strong>`
      : '';
    const lat  = st.latency_ms != null ? ` · ${st.latency_ms}ms` : '';
    const err  = st.error
      ? `<div style="font-size:10px;color:var(--color-bad-text);font-family:var(--font-mono);
                     margin-top:2px;word-break:break-all">${st.error}</div>`
      : '';

    return `
      <div style="background:var(--color-bg-tertiary);border:1px solid var(--color-border);
                  border-radius:var(--radius-md);padding:10px var(--space-3)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:var(--text-sm);color:${col}">${icon} ${ep.label}</span>
          <span style="font-size:11px;font-family:var(--font-mono);
                       color:var(--color-text-secondary)">${val}${lat}</span>
        </div>
        ${err}
        <div style="font-size:10px;color:var(--color-text-muted);margin-top:3px;
                    word-break:break-all;font-family:var(--font-mono)">
          ${ep.url.replace('https://services.swpc.noaa.gov','')}
        </div>
      </div>`;
  }).join('');

  /* ── Config fields ── */
  const cfgFields = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);
                margin-top:var(--space-3)">
      <div class="field">
        <label class="field__label" style="font-size:11px">Timeout (sec)</label>
        <input class="field__input" id="cfg-timeout" type="number" min="3" max="30"
               value="${NOAA_CONFIG.timeout_ms / 1000}"
               style="font-family:var(--font-mono)"
               onchange="window._pwSaveCfg()"/>
      </div>
      <div class="field">
        <label class="field__label" style="font-size:11px">Poll interval (min)</label>
        <input class="field__input" id="cfg-poll" type="number" min="1" max="60"
               value="${NOAA_CONFIG.poll_interval}"
               style="font-family:var(--font-mono)"
               onchange="window._pwSaveCfg()"/>
      </div>
      <div class="field">
        <label class="field__label" style="font-size:11px">Fallback SFI</label>
        <input class="field__input" id="cfg-fallback-sfi" type="number" min="60" max="300"
               value="${NOAA_CONFIG.fallback_sfi}"
               style="font-family:var(--font-mono)"
               onchange="window._pwSaveCfg()"/>
      </div>
      <div class="field">
        <label class="field__label" style="font-size:11px">Fallback Kp</label>
        <input class="field__input" id="cfg-fallback-kp" type="number" min="0" max="9" step="0.5"
               value="${NOAA_CONFIG.fallback_kp}"
               style="font-family:var(--font-mono)"
               onchange="window._pwSaveCfg()"/>
      </div>
    </div>`;

  panel.innerHTML = `
    <!-- Status header -->
    <div style="display:flex;justify-content:space-between;align-items:center;
                margin-bottom:var(--space-3)">
      <div>
        <div style="font-size:var(--text-sm);font-weight:var(--weight-bold);
                    color:${connColor}">
          ${connIcon} ${state.connections.noaaOk === true  ? 'NOAA connected'
                       : state.connections.noaaOk === false ? 'NOAA not reachable'
                       : 'Not yet tested'}
        </div>
        ${age !== null ? `
        <div style="font-size:11px;font-family:var(--font-mono);
                    color:${staleColor};margin-top:2px">
          Kp <strong>${kp?.toFixed(2) ?? '—'}</strong>
          &nbsp;·&nbsp;SFI <strong>${sfi ?? '—'}</strong>
          &nbsp;·&nbsp;${age}m ago
        </div>` : `
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">
          No data yet — tap Test API
        </div>`}
      </div>

      <!-- Test button -->
      <button onclick="window._pwTestAPI()"
              ${_testing ? 'disabled' : ''}
              style="
                display:flex;align-items:center;gap:6px;
                background:${_testing ? 'var(--color-bg-tertiary)' : 'var(--color-accent)'};
                color:${_testing ? 'var(--color-text-muted)' : '#fff'};
                border:none;border-radius:var(--radius-md);
                padding:10px var(--space-4);font-size:var(--text-sm);
                font-weight:var(--weight-bold);cursor:pointer;
                min-height:44px;white-space:nowrap">
        ${_testing ? '⏳ Testing…' : '🔌 Test API'}
      </button>
    </div>

    <!-- Per-endpoint results -->
    <div style="display:flex;flex-direction:column;gap:var(--space-2)">
      ${epRows}
    </div>

    <!-- Config -->
    <details style="margin-top:var(--space-3)">
      <summary style="font-size:var(--text-xs);color:var(--color-text-muted);
                      cursor:pointer;user-select:none;padding:4px 0">
        ⚙ Advanced configuration
      </summary>
      ${cfgFields}
    </details>`;
}

/* ─────────────────────────────────────────────
   Window-exposed handlers
───────────────────────────────────────────── */

window._pwTestAPI = async function() {
  if (_testing) return;
  _testing = true;
  renderApiPanel();

  try {
    await testAllEndpoints();
    const ok = apiStatus.kp.ok || apiStatus.sfi.ok;
    if (ok) {
      await fetchNOAA();
      const kp  = state.propagation.kp?.toFixed(2) ?? '—';
      const sfi = state.propagation.sfi ?? '—';
      showToast(`✅ NOAA connected — Kp ${kp} · SFI ${sfi}`, 'success');
    } else {
      showToast('❌ All NOAA endpoints failed — see details below', 'error');
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
      timeout_ms: NOAA_CONFIG.timeout_ms,
      poll_interval: NOAA_CONFIG.poll_interval,
      fallback_sfi: NOAA_CONFIG.fallback_sfi,
      fallback_kp: NOAA_CONFIG.fallback_kp,
    }));
  } catch {}
  showToast('Configuration saved', 'success');
};

window._pwSelectLicClass = function(cls) {
  document.querySelectorAll('[data-lic]').forEach(b => {
    const active = b.dataset.lic === cls;
    b.className = active ? 'btn btn--primary' : 'btn btn--secondary';
    b.style.justifyContent = 'space-between';
    b.style.minHeight = '44px';
    b.style.padding   = '0 var(--space-4)';
  });
  const maxMap = { C: 25, B: 100, A: 1500 };
  const defMap = { C: 25, B: 100, A: 100  };
  const max    = maxMap[cls];
  state.user.licenseClass = cls;

  const sl = document.getElementById('pwr-slider');
  if (sl) {
    sl.max = max;
    const cur    = parseInt(sl.value);
    const newVal = cur > max ? defMap[cls] : cur;
    sl.value             = newVal;
    state.user.txPowerW  = newVal;
    updatePowerDisplay(newVal);
  }
  const midEl = document.getElementById('pwr-mid');
  const maxEl = document.getElementById('pwr-max-label');
  if (midEl) midEl.textContent = cls === 'C' ? '15W' : cls === 'B' ? '50W' : '100W';
  if (maxEl) maxEl.textContent = max + 'W';

  persistUser();
  evaluateAllWatches();
  publish('watches', state.watches);
};

window._pwUpdatePower = function(v) {
  v = parseInt(v);
  state.user.txPowerW = v;
  if (v > 5 && state.user.qrpMode) {
    state.user.qrpMode = false;
    const tog = document.getElementById('qrp-toggle');
    if (tog) tog.checked = false;
  }
  updatePowerDisplay(v);
  persistUser();
  evaluateAllWatches();
  publish('watches', state.watches);
};

window._pwToggleQRP = function(on) {
  state.user.qrpMode = on;
  if (on) {
    state.user.txPowerW = 5;
  } else {
    const defMap = { C: 25, B: 100, A: 100 };
    if (state.user.txPowerW <= 5)
      state.user.txPowerW = defMap[state.user.licenseClass ?? 'A'];
  }
  const sl = document.getElementById('pwr-slider');
  if (sl) { sl.value = state.user.txPowerW; updatePowerDisplay(state.user.txPowerW); }
  persistUser();
  evaluateAllWatches();
  publish('watches', state.watches);
};

window._pwToggleTheme = function(light) {
  state.user.theme = light ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.user.theme;
  persistUser();
};

window._pwChangeLang = function(lang) {
  state.user.lang = lang;
  setLang(lang);
  persistUser();
};

window._pwSaveLocation = function() {
  const val = document.getElementById('grid-input')?.value?.trim().toUpperCase();
  if (!val) { showToast('Enter a valid grid square (e.g. JO20ev)', 'warn'); return; }
  try {
    const { lat, lon } = gridToLatLon(val);
    state.user.grid = val;
    state.user.lat  = lat;
    state.user.lon  = lon;
    persistUser();
    showToast(`Location saved — ${val} (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`, 'success');
    evaluateAllWatches();
  } catch(e) {
    showToast('Invalid grid square format', 'error');
  }
};

/* Power display helper */
export function updatePowerDisplay(v) {
  v = parseInt(v);
  const disp = document.getElementById('pwr-display');
  const dbEl = document.getElementById('pwr-db');
  const hint = document.getElementById('pwr-hint');
  if (disp) disp.textContent = v + 'W';
  if (dbEl) {
    const db = v === 100 ? 0 : 10 * Math.log10(v / 100);
    dbEl.textContent = v === 100
      ? '(reference 100W)'
      : `(${db > 0 ? '+' : ''}${db.toFixed(1)} dB vs 100W)`;
  }
  if (hint) {
    if      (v <= 1)   hint.textContent = 'QRPp — extreme QRP, experimental.';
    else if (v <= 5)   hint.textContent = 'QRP (≤5W) — POTA/SOTA portable. Only strong paths recommended.';
    else if (v <= 25)  hint.textContent = 'Class C range — significant penalty on marginal paths.';
    else if (v < 100)  hint.textContent = `${v}W — slight reduction vs 100W on marginal paths.`;
    else if (v === 100)hint.textContent = 'Reference power — no correction applied.';
    else               hint.textContent = `${v}W — reliability scores slightly boosted.`;
  }
}

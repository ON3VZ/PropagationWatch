/** settings.js — Settings screen logic including API test panel */

import { state, persistUser } from './state.js';
import { fetchNOAA, testAllEndpoints, apiStatus, ENDPOINTS, NOAA_CONFIG, noaaStaleness }
  from './noaa.js';
import { subscribe, publish } from './state.js';
import { showToast } from './ui.js';
import { ageMinutes } from './utils.js';
import { gridToLatLon } from './utils.js';
import { evaluateAllWatches } from './watches.js';

let testInProgress = false;

/** Initialise the settings screen — called once on first show */
export function initSettings() {
  syncSettingsUI();
  renderApiPanel();
  subscribe('apiStatus', () => renderApiPanel());
}

/* ── Sync all settings UI to current state ── */
export function syncSettingsUI() {
  const pw    = state.user.txPowerW    ?? 100;
  const lc    = state.user.licenseClass ?? 'A';
  const qrp   = state.user.qrpMode     ?? false;
  const theme = state.user.theme        ?? 'dark';
  const lang  = state.user.lang         ?? 'en';
  const grid  = state.user.grid         ?? '';

  // License buttons
  document.querySelectorAll('[data-lic]').forEach(btn => {
    btn.classList.toggle('btn--primary',   btn.dataset.lic === lc);
    btn.classList.toggle('btn--secondary', btn.dataset.lic !== lc);
  });

  // Power slider + display
  const slider = document.getElementById('pwr-slider');
  const maxMap = { C: 25, B: 100, A: 1500 };
  if (slider) {
    slider.max   = maxMap[lc] ?? 1500;
    slider.value = Math.min(pw, maxMap[lc] ?? 1500);
    updatePowerDisplay(slider.value);
  }

  // QRP
  const qrpEl = document.getElementById('qrp-toggle');
  if (qrpEl) qrpEl.checked = qrp;

  // Theme
  const themeEl = document.getElementById('theme-toggle');
  if (themeEl) themeEl.checked = (theme === 'light');

  // Lang
  const langEl = document.getElementById('lang-select');
  if (langEl) langEl.value = lang;

  // Grid
  const gridEl = document.getElementById('grid-input');
  if (gridEl) gridEl.value = grid;

  // NOAA config
  const timeoutEl  = document.getElementById('cfg-timeout');
  const pollEl     = document.getElementById('cfg-poll');
  if (timeoutEl) timeoutEl.value = NOAA_CONFIG.timeout_ms / 1000;
  if (pollEl)    pollEl.value    = NOAA_CONFIG.poll_interval;
}

/* ── API test panel ── */
function renderApiPanel() {
  const panel = document.getElementById('api-test-panel');
  if (!panel) return;

  const staleness = noaaStaleness();
  const age       = state.propagation.fetchedAt
    ? ageMinutes(state.propagation.fetchedAt) : null;

  const staleColor = staleness === 'stale' ? 'var(--color-bad-text)'
    : staleness === 'warn' ? 'var(--color-warn-text)'
    : staleness === 'ok'   ? 'var(--color-good-text)'
    : 'var(--color-text-muted)';

  // Overall status
  const overallOk  = state.connections.noaaOk;
  const kp  = state.propagation.kp;
  const sfi = state.propagation.sfi;

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3)">
      <div>
        <div style="font-size:var(--text-sm);font-weight:var(--weight-bold)">
          ${overallOk === true  ? '✅ Connected' :
            overallOk === false ? '❌ No connection' :
            '⏳ Not yet tested'}
        </div>
        <div style="font-size:var(--text-xs);font-family:var(--font-mono);
                    color:${staleColor};margin-top:2px">
          ${age !== null
            ? `Kp ${kp?.toFixed(2) ?? '—'} · SFI ${sfi ?? '—'} · ${age}m ago`
            : 'No data — tap Test to fetch live'}
        </div>
      </div>
      <button class="btn btn--secondary" id="api-test-btn"
              style="font-size:var(--text-sm);min-height:40px"
              onclick="window._pwTestAPI()"
              ${testInProgress ? 'disabled' : ''}>
        ${testInProgress ? '⏳ Testing…' : '🔌 Test API'}
      </button>
    </div>`;

  // Per-endpoint results
  html += `<div style="display:flex;flex-direction:column;gap:var(--space-2)">`;
  for (const [key, ep] of Object.entries(ENDPOINTS)) {
    const st = apiStatus[key];
    const icon = st.ok === true  ? '✅'
               : st.ok === false ? '❌'
               : '○';
    const color = st.ok === true  ? 'var(--color-good-text)'
                : st.ok === false ? 'var(--color-bad-text)'
                : 'var(--color-text-muted)';
    const latency = st.latency_ms != null ? ` · ${st.latency_ms}ms` : '';
    const value   = st.value != null ? ` · ${typeof st.value === 'number' ? st.value.toFixed(key === 'kp' ? 2 : 0) : st.value}` : '';
    const errMsg  = st.error ? `<div style="font-size:var(--text-xs);color:var(--color-bad-text);
                                  margin-top:2px;font-family:var(--font-mono)">${st.error}</div>` : '';

    html += `
      <div style="background:var(--color-bg-tertiary);border:1px solid var(--color-border);
                  border-radius:var(--radius-md);padding:var(--space-2) var(--space-3)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:var(--text-sm);color:${color}">${icon} ${ep.label}</span>
          <span style="font-size:var(--text-xs);font-family:var(--font-mono);
                       color:var(--color-text-secondary)">${value}${latency}</span>
        </div>
        ${errMsg}
        <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:2px;
                    word-break:break-all">${ep.url.replace('https://','')}</div>
      </div>`;
  }
  html += `</div>`;

  // Debug log area (last fetch details)
  html += `
    <div style="margin-top:var(--space-3)">
      <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-bottom:var(--space-2)">
        Config
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2)">
        <div class="field">
          <label class="field__label" style="font-size:var(--text-xs)">Timeout (sec)</label>
          <input class="field__input" id="cfg-timeout" type="number"
                 min="3" max="30" step="1"
                 value="${NOAA_CONFIG.timeout_ms / 1000}"
                 style="font-family:var(--font-mono)"
                 onchange="window._pwSaveCfg()"/>
        </div>
        <div class="field">
          <label class="field__label" style="font-size:var(--text-xs)">Poll interval (min)</label>
          <input class="field__input" id="cfg-poll" type="number"
                 min="1" max="60" step="1"
                 value="${NOAA_CONFIG.poll_interval}"
                 style="font-family:var(--font-mono)"
                 onchange="window._pwSaveCfg()"/>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-top:var(--space-2)">
        <div class="field">
          <label class="field__label" style="font-size:var(--text-xs)">Fallback SFI</label>
          <input class="field__input" id="cfg-fallback-sfi" type="number"
                 min="60" max="300" step="5"
                 value="${NOAA_CONFIG.fallback_sfi}"
                 style="font-family:var(--font-mono)"
                 onchange="window._pwSaveCfg()"/>
        </div>
        <div class="field">
          <label class="field__label" style="font-size:var(--text-xs)">Fallback Kp</label>
          <input class="field__input" id="cfg-fallback-kp" type="number"
                 min="0" max="9" step="0.5"
                 value="${NOAA_CONFIG.fallback_kp}"
                 style="font-family:var(--font-mono)"
                 onchange="window._pwSaveCfg()"/>
        </div>
      </div>
    </div>`;

  panel.innerHTML = html;
}

/* ── Power display helper ── */
export function updatePowerDisplay(v) {
  v = parseInt(v);
  const disp = document.getElementById('pwr-display');
  const dbEl = document.getElementById('pwr-db');
  const hint = document.getElementById('pwr-hint');
  if (disp) disp.textContent = v + 'W';
  if (dbEl) {
    const db = v === 100 ? 0 : 10 * Math.log10(v / 100);
    dbEl.textContent = v === 100 ? '(reference 100W)' : `(${db.toFixed(1)} dB vs 100W)`;
  }
  if (hint) {
    if (v <= 5)         hint.textContent = 'QRP range — only high-reliability paths recommended.';
    else if (v <= 25)   hint.textContent = 'Class C range — significant reduction on marginal paths.';
    else if (v < 100)   hint.textContent = 'Moderate power — slight reduction on marginal paths.';
    else if (v === 100) hint.textContent = 'Reference power — no correction applied.';
    else                hint.textContent = 'High power — reliability scores boosted slightly.';
  }
}

/* ── Global handlers called from index.html ── */
window._pwTestAPI = async function() {
  if (testInProgress) return;
  testInProgress = true;
  renderApiPanel();
  try {
    await testAllEndpoints();
    // If successful, also update live state
    const kp  = apiStatus.kp.value;
    const sfi = apiStatus.sfi.value;
    if (kp !== null || sfi !== null) {
      await fetchNOAA();
      showToast(`API OK — Kp ${kp?.toFixed(2) ?? '—'} · SFI ${sfi ?? '—'}`, 'success');
    } else {
      showToast('API test failed — check results below', 'error');
    }
  } finally {
    testInProgress = false;
    renderApiPanel();
  }
};

window._pwSaveCfg = function() {
  const t   = parseFloat(document.getElementById('cfg-timeout')?.value);
  const p   = parseInt(document.getElementById('cfg-poll')?.value);
  const sfi = parseInt(document.getElementById('cfg-fallback-sfi')?.value);
  const kp  = parseFloat(document.getElementById('cfg-fallback-kp')?.value);
  if (!isNaN(t) && t >= 3)   NOAA_CONFIG.timeout_ms    = t * 1000;
  if (!isNaN(p) && p >= 1)   NOAA_CONFIG.poll_interval  = p;
  if (!isNaN(sfi) && sfi > 0) NOAA_CONFIG.fallback_sfi  = sfi;
  if (!isNaN(kp) && kp >= 0)  NOAA_CONFIG.fallback_kp   = kp;
  // Persist to localStorage
  save('noaa_config', { timeout_ms: NOAA_CONFIG.timeout_ms,
    poll_interval: NOAA_CONFIG.poll_interval,
    fallback_sfi: NOAA_CONFIG.fallback_sfi,
    fallback_kp: NOAA_CONFIG.fallback_kp });
  showToast('Configuration saved', 'success');
};

window._pwSelectLicClass = function(cls, btn) {
  document.querySelectorAll('[data-lic]').forEach(b => {
    b.classList.toggle('btn--primary',   b.dataset.lic === cls);
    b.classList.toggle('btn--secondary', b.dataset.lic !== cls);
  });
  const maxMap = { C: 25, B: 100, A: 1500 };
  const defMap = { C: 25, B: 75, A: 100 };
  state.user.licenseClass = cls;
  const sl = document.getElementById('pwr-slider');
  if (sl) {
    sl.max   = maxMap[cls];
    sl.value = Math.min(parseInt(sl.value), maxMap[cls]) || defMap[cls];
    updatePowerDisplay(sl.value);
  }
  persistUser();
};

window._pwUpdatePower = function(v) {
  v = parseInt(v);
  state.user.txPowerW = v;
  updatePowerDisplay(v);
  persistUser();
  evaluateAllWatches();
};

window._pwToggleQRP = function(on) {
  state.user.qrpMode  = on;
  if (on) state.user.txPowerW = 5;
  const sl = document.getElementById('pwr-slider');
  if (sl) { sl.value = state.user.txPowerW; updatePowerDisplay(state.user.txPowerW); }
  persistUser();
  evaluateAllWatches();
};

window._pwToggleTheme = function(light) {
  state.user.theme = light ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.user.theme;
  persistUser();
};

window._pwChangeLang = function(lang) {
  state.user.lang = lang;
  import('./i18n.js').then(m => m.setLang(lang));
  persistUser();
};

window._pwSaveLocation = function() {
  const val = document.getElementById('grid-input')?.value?.trim().toUpperCase();
  if (!val) return;
  const { lat, lon } = gridToLatLon(val);
  state.user.grid = val;
  state.user.lat  = lat;
  state.user.lon  = lon;
  persistUser();
  showToast(`Location saved — ${val}`, 'success');
  evaluateAllWatches();
};

function save(key, val) {
  try { localStorage.setItem('pw_' + key, JSON.stringify(val)); } catch {}
}

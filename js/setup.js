/** setup.js — Setup wizard logic */

import { state, persistUser } from './state.js';
import { gridToLatLon, prefixToEntity } from './utils.js';
import { requestPermission } from './notifications.js';
import { createWatch } from './watches.js';
import { t } from './i18n.js';
import { showScreen, showToast } from './ui.js';

let dxccData = [];
export function setDxccData(data) { dxccData = data; }

let currentStep = 1;
const TOTAL_STEPS = 4;

/* Suggestions from JO20 for Belgian operators */
export const SUGGESTIONS = [
  { entity:'W',   name:'North America',   grid:'FN41', lat:42.3,  lon:-71.1,  dist:'5.890 km', az:'290°' },
  { entity:'SM',  name:'Scandinavia',     grid:'JP90', lat:60.2,  lon:18.0,   dist:'1.540 km', az:'12°'  },
  { entity:'EA',  name:'South Europe',    grid:'IM99', lat:40.4,  lon:-3.7,   dist:'1.870 km', az:'208°' },
  { entity:'JA',  name:'Japan',           grid:'PM96', lat:36.2,  lon:138.3,  dist:'9.220 km', az:'47°'  },
  { entity:'VK',  name:'Australia',       grid:'QF22', lat:-33.9, lon:151.2,  dist:'16.800 km',az:'110°' },
  { entity:'ZL',  name:'New Zealand',     grid:'RF70', lat:-36.9, lon:174.8,  dist:'18.900 km',az:'120°' },
  { entity:'CU',  name:'Azores',          grid:'HM67', lat:37.7,  lon:-25.7,  dist:'2.500 km', az:'252°' },
  { entity:'VP8', name:'Falkland Islands',grid:'GD17', lat:-51.7, lon:-57.9,  dist:'12.847 km',az:'222°' },
];

export function initSetup() {
  currentStep = 1;
  renderStep();
}

function renderStep() {
  const container = document.getElementById('setup-content');
  if (!container) return;
  updateProgress();

  const renderers = { 1: renderStep1, 2: renderStep2, 3: renderStep3, 4: renderStep4 };
  container.innerHTML = '';
  (renderers[currentStep] ?? renderStep1)(container);
}

function updateProgress() {
  document.querySelectorAll('.setup-progress__dot').forEach((dot, i) => {
    dot.classList.toggle('setup-progress__dot--done',   i + 1 < currentStep);
    dot.classList.toggle('setup-progress__dot--active', i + 1 === currentStep);
  });
  const lbl = document.getElementById('setup-step-label');
  if (lbl) lbl.textContent = `Step ${currentStep} of ${TOTAL_STEPS}`;
}

function nextStep() { if (currentStep < TOTAL_STEPS) { currentStep++; renderStep(); } else finishSetup(); }
function prevStep() { if (currentStep > 1) { currentStep--; renderStep(); } }

/* Step 1 — Location */
function renderStep1(el) {
  el.innerHTML = `
    <div class="setup-title">${t('setupLocation')}</div>
    <div class="setup-subtitle">${t('setupLocSub')}</div>
    <div class="field">
      <label class="field__label">Callsign or grid square</label>
      <input class="field__input" id="s-location" placeholder="e.g. ON3VZ or JO20ev" autocomplete="off" autocapitalize="characters"/>
      <div class="setup-hint" id="s-location-hint"></div>
    </div>
    <div class="setup-actions">
      <button class="btn btn--primary" id="s-next1">Continue →</button>
    </div>`;

  document.getElementById('s-location').addEventListener('input', e => resolveLocation(e.target.value));
  document.getElementById('s-next1').addEventListener('click', () => {
    if (saveLocation()) nextStep();
  });
}

function resolveLocation(val) {
  const hint = document.getElementById('s-location-hint');
  if (!val) { hint.textContent = ''; return; }
  // Try grid square (2–6 chars, letter-digit-letter-digit pattern)
  if (/^[A-Ra-r]{2}\d{2}([a-xA-X]{2})?$/.test(val)) {
    const { lat, lon } = gridToLatLon(val);
    hint.textContent = `Grid: ${val.toUpperCase()} · ${lat.toFixed(2)}°N ${lon.toFixed(2)}°E`;
    return;
  }
  // Try callsign prefix
  const entity = prefixToEntity(val, dxccData);
  if (entity) hint.textContent = `${val.toUpperCase()} · ${entity.name} · ${entity.grid}`;
  else if (val.length > 1) hint.textContent = 'Prefix not recognised — try entering a grid square';
}

function saveLocation() {
  const val = document.getElementById('s-location')?.value?.trim();
  if (!val) return false;

  if (/^[A-Ra-r]{2}\d{2}([a-xA-X]{2})?$/.test(val)) {
    const { lat, lon } = gridToLatLon(val);
    Object.assign(state.user, { grid: val.toUpperCase(), lat, lon, callsign: null });
  } else {
    const entity = prefixToEntity(val, dxccData);
    const grid = entity?.grid ?? 'JO20';
    const { lat, lon } = gridToLatLon(grid);
    Object.assign(state.user, { callsign: val.toUpperCase(), grid, lat, lon });
  }
  persistUser();
  return true;
}

/* Step 2 — First watch (optional) */
function renderStep2(el) {
  el.innerHTML = `
    <div class="setup-title">${t('setupWhere')}</div>
    <div class="setup-subtitle">${t('setupChoose')}</div>
    <div class="suggestion-grid" id="sugg-grid"></div>
    <div class="field" style="margin-bottom:var(--space-3)">
      <label class="field__label">Or enter manually</label>
      <input class="field__input" id="s-dx" placeholder="e.g. VP8 or JA1ZZZ" autocomplete="off" autocapitalize="characters"/>
      <div class="setup-hint" id="s-dx-hint"></div>
    </div>
    <div class="field-grid">
      <div class="field"><label class="field__label">${t('setupBand')}</label>
        <select class="field__input" id="s-band">
          ${['40m','20m','17m','15m','10m','80m','6m'].map(b=>`<option>${b}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label class="field__label">${t('setupMode')}</label>
        <select class="field__input" id="s-mode">
          ${['FT8','CW','SSB','FT4','MSK144'].map(m=>`<option>${m}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="setup-actions">
      <button class="btn btn--primary" id="s-next2">${t('setupCreate')}</button>
      <button class="setup-skip" id="s-skip2">${t('setupSkip')}</button>
    </div>`;

  // Render suggestion buttons
  const grid = document.getElementById('sugg-grid');
  SUGGESTIONS.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'suggestion-btn';
    btn.innerHTML = `<div class="suggestion-btn__prefix">${s.entity}</div>
      <div class="suggestion-btn__name">${s.name}</div>
      <div class="suggestion-btn__dist">${s.dist} · ${s.az}</div>`;
    btn.addEventListener('click', () => selectSuggestion(s));
    grid.appendChild(btn);
  });

  document.getElementById('s-dx').addEventListener('input', e => resolveDX(e.target.value));
  document.getElementById('s-next2').addEventListener('click', () => { saveWatch(); nextStep(); });
  document.getElementById('s-skip2').addEventListener('click', nextStep);
}

let selectedSuggestion = null;
function selectSuggestion(s) {
  selectedSuggestion = s;
  document.getElementById('s-dx').value = s.entity;
  document.getElementById('s-dx-hint').textContent = `${s.name} · ${s.grid} · ${s.dist} · ${s.az}`;
}

function resolveDX(val) {
  const hint = document.getElementById('s-dx-hint');
  selectedSuggestion = null;
  if (!val) { hint.textContent = ''; return; }
  const entity = prefixToEntity(val, dxccData);
  if (entity) {
    hint.textContent = `${entity.name} · ${entity.grid} · ${entity.distKm ?? '?'} km`;
    selectedSuggestion = { entity: val.toUpperCase(), name: entity.name, grid: entity.grid, lat: entity.lat, lon: entity.lon };
  } else {
    hint.textContent = val.length > 1 ? 'Prefix not recognised — enter coordinates manually' : '';
  }
}

function saveWatch() {
  const target = selectedSuggestion;
  if (!target?.lat) return;
  createWatch({
    label:        target.entity,
    entity:       target.entity,
    name:         target.name,
    lat:          target.lat,
    lon:          target.lon,
    grid:         target.grid,
    band:         document.getElementById('s-band')?.value ?? '20m',
    mode:         document.getElementById('s-mode')?.value ?? 'FT8',
    thresholdPct: 60,
  });
}

/* Step 3 — Power / license */
function renderStep3(el) {
  el.innerHTML = `
    <div class="setup-title">Power & License</div>
    <div class="setup-subtitle">Set your transmit power. This affects the reliability calculation for all watches.</div>
    <div class="field" style="margin-bottom:var(--space-4)">
      <label class="field__label">License class</label>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-2)">
        ${['C','B','A'].map(c => `<button class="btn btn--secondary lic-btn" data-lic="${c}" onclick="selectLic(this,'${c}')">
          <span>Class ${c}</span><br><small style="font-family:var(--font-mono);font-size:10px">${c==='C'?'25W':c==='B'?'100W':'1500W'} max</small>
        </button>`).join('')}
      </div>
    </div>
    <div class="field">
      <label class="field__label">Transmit power: <span id="s-pwr-val" style="font-family:var(--font-mono)">${state.user.txPowerW}W</span></label>
      <input type="range" id="s-pwr" min="1" max="100" step="1" value="${state.user.txPowerW}"
             oninput="document.getElementById('s-pwr-val').textContent=this.value+'W'; state.user.txPowerW=parseInt(this.value)"/>
      <div class="field__hint" id="s-pwr-hint"></div>
    </div>
    <div class="setup-actions">
      <button class="btn btn--primary" id="s-next3">Continue →</button>
      <button class="setup-skip" id="s-skip3">${t('setupSkip')}</button>
    </div>`;
  document.getElementById('s-next3').addEventListener('click', () => {
    state.user.licenseClass = document.querySelector('.lic-btn.active')?.dataset.lic ?? 'A';
    persistUser(); nextStep();
  });
  document.getElementById('s-skip3').addEventListener('click', nextStep);
}

/* Step 4 — Notifications */
function renderStep4(el) {
  el.innerHTML = `
    <div class="setup-title">${t('setupNotif')}</div>
    <div class="setup-subtitle">${t('setupNotifSub')}</div>
    <div class="setup-actions">
      <button class="btn btn--primary" id="s-allow-notif">${t('setupAllow')}</button>
      <button class="setup-skip" id="s-skip4">${t('setupSkip')}</button>
    </div>`;
  document.getElementById('s-allow-notif').addEventListener('click', async () => {
    await requestPermission(); nextStep();
  });
  document.getElementById('s-skip4').addEventListener('click', nextStep);
}

function finishSetup() {
  state.user.configured = true;
  persistUser();
  showScreen('home');
}

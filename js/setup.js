/** setup.js — Setup wizard + New watch flow */

import { state, persistUser } from './state.js';
import { gridToLatLon, prefixToEntity } from './utils.js';
import { requestPermission } from './notifications.js';
import { createWatch } from './watches.js';
import { t } from './i18n.js';
import { showScreen, showToast } from './ui.js';

let dxccData = [];
export function setDxccData(data) { dxccData = data; }

let currentStep = 1;
let startStep   = 1;   // where the wizard starts (1 = full setup, 2 = new watch only)
const TOTAL_STEPS = 4;

/* Called on first run — full wizard from step 1 */
export function initSetup() {
  startStep   = 1;
  currentStep = 1;
  renderStep();
}

/* Called when user taps "+ Watch" on already-configured app */
export function initNewWatch() {
  startStep   = 2;
  currentStep = 2;
  renderStep();
}

function renderStep() {
  const container = document.getElementById('setup-content');
  if (!container) return;
  updateProgress();
  const renderers = {
    1: renderStep1,
    2: renderStep2,
    3: renderStep3,
    4: renderStep4,
  };
  container.innerHTML = '';
  (renderers[currentStep] ?? renderStep1)(container);
}

function updateProgress() {
  document.querySelectorAll('.setup-progress__dot').forEach((dot, i) => {
    dot.classList.toggle('setup-progress__dot--done',   i + 1 < currentStep);
    dot.classList.toggle('setup-progress__dot--active', i + 1 === currentStep);
    dot.classList.remove('setup-progress__dot--hidden');
    if (startStep === 2 && i === 0) dot.style.opacity = '0.2'; // grey out step 1 dot
  });
  const lbl = document.getElementById('setup-step-label');
  if (lbl) lbl.textContent = startStep === 2
    ? `New watch`
    : `Step ${currentStep} of ${TOTAL_STEPS}`;
}

function nextStep() {
  if (currentStep < TOTAL_STEPS) { currentStep++; renderStep(); }
  else finishSetup();
}

/* ── Suggestions (from JO20 for Belgian operators) ── */
const SUGGESTIONS = [
  { entity:'W',   name:'North America',    grid:'FN41', lat: 42.3,  lon: -71.1,  dist:'5.890 km',  az:'290°' },
  { entity:'SM',  name:'Scandinavia',      grid:'JP90', lat: 60.2,  lon:  18.0,  dist:'1.540 km',  az:'12°'  },
  { entity:'EA',  name:'South Europe',     grid:'IM99', lat: 40.4,  lon:  -3.7,  dist:'1.870 km',  az:'208°' },
  { entity:'JA',  name:'Japan',            grid:'PM96', lat: 36.2,  lon: 138.3,  dist:'9.220 km',  az:'47°'  },
  { entity:'VK',  name:'Australia',        grid:'QF22', lat:-33.9,  lon: 151.2,  dist:'16.800 km', az:'110°' },
  { entity:'ZL',  name:'New Zealand',      grid:'RF70', lat:-36.9,  lon: 174.8,  dist:'18.900 km', az:'120°' },
  { entity:'CU',  name:'Azores',           grid:'HM67', lat: 37.7,  lon: -25.7,  dist:'2.500 km',  az:'252°' },
  { entity:'PY',  name:'Brazil',           grid:'GG66', lat:-15.8,  lon: -47.9,  dist:'9.600 km',  az:'236°' },
  { entity:'ZS',  name:'South Africa',     grid:'KG33', lat:-25.8,  lon:  28.2,  dist:'9.100 km',  az:'175°' },
  { entity:'VP8', name:'Falkland Islands', grid:'GD17', lat:-51.7,  lon: -57.9,  dist:'12.847 km', az:'222°' },
];

/* ── Step 1 — Location ── */
function renderStep1(el) {
  el.innerHTML = `
    <div class="setup-title">Your location</div>
    <div class="setup-subtitle">Enter your callsign or grid square so we can calculate paths and greyline times.</div>
    <div class="field">
      <label class="field__label">Callsign or grid square</label>
      <input class="field__input" id="s-location"
             placeholder="e.g. ON3VZ or JO20ev"
             autocomplete="off" autocapitalize="characters"
             value="${state.user.callsign ?? state.user.grid ?? ''}"/>
      <div class="setup-hint" id="s-location-hint"></div>
    </div>
    <div class="setup-actions">
      <button class="btn btn--primary" id="s-next1">Continue →</button>
    </div>`;

  const inp = document.getElementById('s-location');
  inp.addEventListener('input', e => resolveLocation(e.target.value));
  if (inp.value) resolveLocation(inp.value);   // show hint for pre-filled value

  document.getElementById('s-next1').addEventListener('click', () => {
    if (saveLocation()) nextStep();
    else showToast('Please enter a callsign or grid square', 'warn');
  });
}

function resolveLocation(val) {
  const hint = document.getElementById('s-location-hint');
  if (!val) { hint.textContent = ''; return; }
  if (/^[A-Ra-r]{2}\d{2}([a-xA-X]{2})?$/.test(val)) {
    const { lat, lon } = gridToLatLon(val);
    hint.textContent = `Grid: ${val.toUpperCase()} · ${lat.toFixed(2)}°N ${lon.toFixed(2)}°E`;
    return;
  }
  const entity = prefixToEntity(val, dxccData);
  if (entity) hint.textContent = `${val.toUpperCase()} · ${entity.name} · ${entity.grid}`;
  else if (val.length > 1) hint.textContent = 'Prefix not recognised — try entering a grid square directly';
}

function saveLocation() {
  const val = document.getElementById('s-location')?.value?.trim();
  if (!val) return false;
  if (/^[A-Ra-r]{2}\d{2}([a-xA-X]{2})?$/.test(val)) {
    const { lat, lon } = gridToLatLon(val);
    Object.assign(state.user, { grid: val.toUpperCase(), lat, lon, callsign: null });
  } else {
    const entity = prefixToEntity(val, dxccData);
    const grid   = entity?.grid ?? 'JO20';
    const { lat, lon } = gridToLatLon(grid);
    Object.assign(state.user, { callsign: val.toUpperCase(), grid, lat, lon });
  }
  persistUser();
  return true;
}

/* ── Step 2 — Target station ── */
let selectedTarget = null;

function renderStep2(el) {
  selectedTarget = null;
  el.innerHTML = `
    <div class="setup-title">Where do you want to work?</div>
    <div class="setup-subtitle">Choose a region or enter a callsign / prefix.</div>

    <div class="suggestion-grid" id="sugg-grid"></div>

    <div class="field" style="margin-bottom:var(--space-3)">
      <label class="field__label">Or enter manually</label>
      <input class="field__input" id="s-dx"
             placeholder="e.g. VP8, JA1ZZZ, ZL3"
             autocomplete="off" autocapitalize="characters"/>
      <div class="setup-hint" id="s-dx-hint"></div>
    </div>

    <div class="field-grid">
      <div class="field">
        <label class="field__label">Band</label>
        <select class="field__input" id="s-band">
          ${['40m','20m','17m','15m','10m','80m','30m','6m'].map(b =>
            `<option value="${b}">${b}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field__label">Mode</label>
        <select class="field__input" id="s-mode">
          ${['FT8','CW','SSB','FT4','MSK144'].map(m =>
            `<option value="${m}">${m}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="field" style="margin-top:var(--space-3)">
      <label class="field__label">
        Alert when reliability ≥ <span id="thr-display">60%</span>
      </label>
      <input type="range" min="10" max="90" step="5" value="60" style="width:100%"
             oninput="document.getElementById('thr-display').textContent=this.value+'%'"/>
    </div>

    <div class="setup-actions">
      <button class="btn btn--primary" id="s-next2">Create watch →</button>
      <button class="setup-skip" id="s-cancel2">Cancel</button>
    </div>`;

  // Suggestion buttons
  const grid = document.getElementById('sugg-grid');
  SUGGESTIONS.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'suggestion-btn';
    btn.innerHTML = `
      <div class="suggestion-btn__prefix">${s.entity}</div>
      <div class="suggestion-btn__name">${s.name}</div>
      <div class="suggestion-btn__dist">${s.dist} · ${s.az}</div>`;
    btn.addEventListener('click', () => {
      selectedTarget = s;
      document.getElementById('s-dx').value = s.entity;
      document.getElementById('s-dx-hint').textContent =
        `${s.name} · ${s.grid} · ${s.dist} · ${s.az}`;
      // Highlight selected
      grid.querySelectorAll('.suggestion-btn').forEach(b =>
        b.style.borderColor = 'var(--color-border)');
      btn.style.borderColor = 'var(--color-accent)';
    });
    grid.appendChild(btn);
  });

  document.getElementById('s-dx').addEventListener('input', e => resolveDX(e.target.value));

  document.getElementById('s-next2').addEventListener('click', () => {
    if (saveWatch()) {
      if (startStep === 2) {
        // Direct add-watch flow: done after this step
        showToast('Watch added!', 'success');
        showScreen('home');
      } else {
        nextStep();
      }
    } else {
      showToast('Please select a target station first', 'warn');
    }
  });

  document.getElementById('s-cancel2').addEventListener('click', () => {
    showScreen('home');
  });
}

function resolveDX(val) {
  const hint = document.getElementById('s-dx-hint');
  selectedTarget = null;
  if (!val) { hint.textContent = ''; return; }
  const entity = prefixToEntity(val, dxccData);
  if (entity) {
    hint.textContent = `${entity.name} · ${entity.grid}`;
    selectedTarget = {
      entity: val.toUpperCase(),
      name:   entity.name,
      grid:   entity.grid,
      lat:    entity.lat,
      lon:    entity.lon,
    };
  } else {
    hint.textContent = val.length > 1 ? 'Prefix not recognised — try a 2–3 letter prefix' : '';
  }
}

function saveWatch() {
  if (!selectedTarget?.lat) return false;
  const thr = parseInt(document.querySelector('input[type=range]')?.value ?? 60);
  createWatch({
    label:        selectedTarget.entity,
    entity:       selectedTarget.entity,
    name:         selectedTarget.name,
    lat:          selectedTarget.lat,
    lon:          selectedTarget.lon,
    grid:         selectedTarget.grid,
    band:         document.getElementById('s-band')?.value  ?? '20m',
    mode:         document.getElementById('s-mode')?.value  ?? 'FT8',
    thresholdPct: thr,
  });
  return true;
}

/* ── Step 3 — Power ── */
function renderStep3(el) {
  const pw = state.user.txPowerW ?? 100;
  const lc = state.user.licenseClass ?? 'A';
  el.innerHTML = `
    <div class="setup-title">Power & License</div>
    <div class="setup-subtitle">Affects the reliability calculation. You can change this later in Settings.</div>
    <div class="field" style="margin-bottom:var(--space-4)">
      <label class="field__label">License class</label>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-2)">
        ${['C','B','A'].map(c => `
          <button class="btn ${lc === c ? 'btn--primary' : 'btn--secondary'}"
                  data-lic="${c}" id="slc-${c}"
                  onclick="document.querySelectorAll('[data-lic]').forEach(b=>{b.className='btn btn--secondary'});this.className='btn btn--primary'">
            Class ${c}<br>
            <small style="font-family:var(--font-mono);font-size:10px">
              ${c==='C'?'25W':c==='B'?'100W':'1500W'} max
            </small>
          </button>`).join('')}
      </div>
    </div>
    <div class="field">
      <label class="field__label">
        Transmit power: <span id="s-pwr-val" style="font-family:var(--font-mono)">${pw}W</span>
      </label>
      <input type="range" id="s-pwr" min="1" max="${lc==='C'?25:lc==='B'?100:1500}"
             step="1" value="${pw}" style="width:100%"
             oninput="document.getElementById('s-pwr-val').textContent=this.value+'W'"/>
    </div>
    <div class="setup-actions">
      <button class="btn btn--primary" id="s-next3">Continue →</button>
      <button class="setup-skip" id="s-skip3">Skip</button>
    </div>`;

  document.getElementById('s-next3').addEventListener('click', () => {
    const lc  = document.querySelector('[data-lic].btn--primary')?.dataset.lic ?? 'A';
    const pw  = parseInt(document.getElementById('s-pwr')?.value ?? 100);
    state.user.licenseClass = lc;
    state.user.txPowerW     = pw;
    persistUser();
    nextStep();
  });
  document.getElementById('s-skip3').addEventListener('click', nextStep);
}

/* ── Step 4 — Notifications ── */
function renderStep4(el) {
  el.innerHTML = `
    <div class="setup-title">Notifications</div>
    <div class="setup-subtitle">Allow browser notifications for propagation alerts. You can always use calendar export instead.</div>
    <div class="setup-actions">
      <button class="btn btn--primary" id="s-allow">Allow notifications</button>
      <button class="setup-skip" id="s-skip4">Skip — use calendar export</button>
    </div>`;
  document.getElementById('s-allow').addEventListener('click', async () => {
    await requestPermission(); finishSetup();
  });
  document.getElementById('s-skip4').addEventListener('click', finishSetup);
}

function finishSetup() {
  state.user.configured = true;
  persistUser();
  showScreen('home');
}

// js/app.js — Main orchestration and UI rendering
import { hydrateState, getState, setState, subscribeState, persistState } from './state.js';
import { initI18n, t } from './i18n.js';
import { fetchNOAA, getDataAgeMin, isStale, isVeryOld } from './noaa.js';
import { evaluateWatches, saveWatch, deleteWatch, toggleWatch, createWatch } from './watches.js';
import { requestPermission } from './notifications.js';
import { exportWatchToICS } from './export.js';
import { formatUTC, formatCountdown, reliabilityStatus, prefixToEntity } from './utils.js';
import { gridToLatLon } from './utils.js';

// ── Data ────────────────────────────────────────────────────────
let dxccData = [];
let meteorData = [];

// ── Init ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // 1. Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW:', e));
  }

  // 2. Load state from localStorage
  hydrateState();

  // 3. Init i18n
  initI18n(getState('user.lang'));

  // 4. Apply theme
  document.documentElement.dataset.theme = getState('user.theme') || 'dark';

  // 5. Load static JSON data
  [dxccData, meteorData] = await Promise.all([
    fetch('data/dxcc-entities.json').then(r => r.json()).catch(() => []),
    fetch('data/meteor-showers.json').then(r => r.json()).catch(() => []),
  ]);

  // 6. Route to correct screen
  const configured = getState('user.configured');
  if (!configured) {
    showScreen('setup');
    renderSetup(1);
  } else {
    showScreen('home');
    renderHome();
  }

  // 7. Fetch NOAA (non-blocking)
  fetchNOAA().then(() => {
    evaluateWatches();
    renderHome();
  });

  // 8. Polling
  setInterval(async () => {
    await fetchNOAA();
    evaluateWatches();
    renderStatusBar();
    renderWatches();
  }, 5 * 60 * 1000);

  // 9. Status bar clock
  setInterval(renderStatusBar, 60 * 1000);

  // 10. Wire up global error handler
  window.addEventListener('unhandledrejection', e => {
    console.error(e.reason);
    showToast('Something went wrong — data is safe', 'warn');
  });

  // 11. Wire up nav
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => {
      const screen = el.dataset.nav;
      showScreen(screen);
      document.querySelectorAll('[data-nav]').forEach(n => n.classList.toggle('active', n === el));
      if (screen === 'home') renderHome();
      if (screen === 'profile') renderProfile();
    });
  });
});

// ── Screen routing ───────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id)?.classList.add('active');
  setState('ui.activeScreen', id);
}

// ── Render: Home ─────────────────────────────────────────────────
function renderHome() {
  evaluateWatches();
  renderStatusBar();
  renderStormBanner();
  renderTimeline();
  renderWatches();
}

function renderStatusBar() {
  const prop = getState('propagation');
  const ageMin = getDataAgeMin();
  const kp  = prop.kp?.toFixed(1) ?? '—';
  const sfi = prop.sfi ?? '—';
  const g   = prop.gScale ?? 0;

  const kpEl  = document.getElementById('sb-kp');
  const sfiEl = document.getElementById('sb-sfi');
  const ageEl = document.getElementById('sb-age');
  if (!kpEl) return;

  kpEl.textContent = kp;
  kpEl.className = prop.kp >= 5 ? 'status-bad' : prop.kp >= 3 ? 'status-warn' : 'status-good';
  sfiEl.textContent = sfi;

  if (ageMin !== null) {
    ageEl.textContent = `${t('data.stale')} ${ageMin}m ${t('data.old')}`;
    ageEl.className = isVeryOld() ? 'stale-err' : isStale() ? 'stale-warn' : '';
  } else {
    ageEl.textContent = 'No data';
    ageEl.className = 'stale-err';
  }
}

function renderStormBanner() {
  const banner = document.getElementById('storm-banner');
  if (!banner) return;
  const g = getState('propagation.gScale');
  if (g >= 2) {
    const kp = getState('propagation.kp')?.toFixed(1);
    banner.classList.add('visible');
    banner.querySelector('.storm-title').textContent = `⚠ G${g} storm · Kp ${kp}`;
    banner.querySelector('.storm-sub').textContent   = 'Tap for recovery forecast';
    banner.onclick = () => { showScreen('storm'); renderStorm(); };
  } else {
    banner.classList.remove('visible');
  }
}

function renderWatches() {
  const container = document.getElementById('watches-list');
  if (!container) return;
  const watches = getState('watches');

  if (watches.length === 0) {
    container.innerHTML = `<p class="status-muted" style="text-align:center;padding:2rem">${t('watch.add')} — no watches configured</p>`;
    return;
  }

  // Sort: optimal first, then approaching, waiting, poor, inactive
  const order = { optimal: 0, approaching: 1, waiting: 2, poor: 3, inactive: 4, unknown: 5 };
  const sorted = [...watches].sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9));

  container.innerHTML = sorted.map(w => watchCardHTML(w)).join('');

  // Wire events
  container.querySelectorAll('.watch-card').forEach(el => {
    const id = el.dataset.id;
    el.querySelector('.btn-detail')?.addEventListener('click', e => { e.stopPropagation(); showWatchDetail(id); });
    el.querySelector('.btn-alarm')?.addEventListener('click',  e => { e.stopPropagation(); setAlarm(id); });
    el.addEventListener('click', () => showWatchDetail(id));
  });
}

function watchCardHTML(w) {
  const pct    = Math.round((w.reliability ?? 0) * 100);
  const status = w.state === 'optimal' ? 'good' : w.state === 'waiting' || w.state === 'approaching' ? 'warn' : w.state === 'inactive' ? 'unknown' : 'bad';
  const stateLabel = {
    optimal: `● ${t('status.good')}`, approaching: `◑ ${t('status.approaching')}`,
    waiting: `○ ${t('status.wait')}`, poor: `✕ ${t('status.poor')}`, inactive: `— ${t('status.inactive')}`, unknown: '?'
  }[w.state] ?? w.state;

  let sub = '';
  if (w.state === 'optimal' && w.nextWindow?.end) {
    const remaining = formatCountdown((w.nextWindow.end - Date.now()) / 1000);
    sub = `${t('watch.until')} ${formatUTC(new Date(w.nextWindow.end))} — ${remaining}`;
  } else if (w.nextWindow) {
    const countdown = formatCountdown((w.nextWindow.start - Date.now()) / 1000);
    const bestPct = Math.round((w.bestReliability ?? 0) * 100);
    sub = `${t('watch.best')} ${formatUTC(new Date(w.nextWindow.start))} (${bestPct}%) — ${countdown}`;
  }

  const power = w.txPowerOverride ?? getState('user.txPowerW') ?? 100;

  return `
  <div class="watch-card" data-status="${status}" data-id="${w.id}">
    <div class="watch-card__header">
      <div>
        <div class="watch-card__name">${w.label}<span class="watch-card__pwr">${power}W</span></div>
        <div class="watch-card__meta">${w.band} · ${w.mode} · ${w.target.distanceKm} km · ${w.target.bearingShort}°</div>
      </div>
      <div style="display:flex;gap:4px">
        <button class="btn btn--icon btn--sm btn-alarm" aria-label="${t('watch.alarm')}">⏰</button>
        <button class="btn btn--icon btn--sm btn-detail" aria-label="Detail">→</button>
      </div>
    </div>
    <div class="watch-card__body">
      <div>
        <div class="watch-card__state status-${status === 'good' ? 'good' : status === 'warn' ? 'warn' : status === 'bad' ? 'bad' : 'muted'}">${stateLabel}</div>
        ${sub ? `<div class="watch-card__sub">${sub}</div>` : ''}
      </div>
      <div class="watch-card__pct status-${status === 'good' ? 'good' : status === 'warn' ? 'warn' : status === 'bad' ? 'bad' : 'muted'}">${pct}%</div>
    </div>
  </div>`;
}

// ── Timeline ──────────────────────────────────────────────────────
function renderTimeline() {
  const svg = document.getElementById('timeline-svg');
  if (!svg) return;
  const W = 600, H = 110, rowH = 14, rowGap = 4, topPad = 20;
  const watches = getState('watches').filter(w => w.active);
  const now = Date.now();
  const totalMs = 24 * 60 * 60 * 1000;

  const xOf = t => ((t - now) / totalMs) * (W - 60) + 30;
  svg.setAttribute('width', W);
  svg.setAttribute('height', Math.max(H, topPad + watches.length * (rowH + rowGap) + 30));

  let html = `<rect width="${W}" height="${svg.getAttribute('height')}" fill="var(--color-bg-primary)" rx="4"/>`;

  // Hour gridlines
  for (let h = 0; h <= 24; h++) {
    const x = xOf(now + h * 3600000);
    const d = new Date(now + h * 3600000);
    html += `<line x1="${x}" y1="0" x2="${x}" y2="${svg.getAttribute('height')}" stroke="var(--color-border-subtle)" stroke-width=".5"/>`;
    if (h % 3 === 0) html += `<text x="${x}" y="${svg.getAttribute('height') - 2}" fill="var(--color-text-muted)" font-size="8" font-family="monospace" text-anchor="middle">${d.getUTCHours()}h</text>`;
  }

  // Watch rows
  watches.forEach((w, i) => {
    const y = topPad + i * (rowH + rowGap);
    html += `<text x="2" y="${y + rowH - 2}" fill="var(--color-text-muted)" font-size="8" font-family="monospace">${w.target.entity} ${w.band}</text>`;
    // Placeholder bar (green for demo — in real app: scan reliability over time)
    const reliability = w.reliability ?? 0;
    const color = reliability >= 0.7 ? 'var(--color-good)' : reliability >= 0.4 ? 'var(--color-warn)' : reliability >= 0.1 ? 'var(--color-bad)' : 'var(--color-neutral)';
    html += `<rect x="30" y="${y}" width="${W - 60}" height="${rowH}" fill="var(--color-neutral)" rx="1" opacity=".3"/>`;
    html += `<rect x="30" y="${y}" width="${(W - 60) * reliability}" height="${rowH}" fill="${color}" rx="1" opacity=".7"/>`;
  });

  // Now line
  const nowX = xOf(now);
  html += `<line x1="${nowX}" y1="0" x2="${nowX}" y2="${svg.getAttribute('height')}" stroke="var(--color-text-primary)" stroke-width="1" stroke-dasharray="3,3" opacity=".5"/>`;
  html += `<text x="${nowX + 2}" y="10" fill="var(--color-text-secondary)" font-size="8" font-family="monospace">nu</text>`;

  svg.innerHTML = html;
}

// ── Watch detail ──────────────────────────────────────────────────
function showWatchDetail(id) {
  const watch = getState('watches').find(w => w.id === id);
  if (!watch) return;
  setState('ui.selectedWatch', id);

  const pct    = Math.round((watch.reliability ?? 0) * 100);
  const status = reliabilityStatus(watch.reliability ?? 0);
  const power  = watch.txPowerOverride ?? getState('user.txPowerW') ?? 100;
  const basePct = Math.round((watch.reliabilityBase ?? 0) * 100);
  const pctAt100 = watch.txPowerOverride !== null || power < 100
    ? Math.round(Math.min(0.99, (watch.reliabilityBase ?? 0)) * 100) : null;

  document.getElementById('detail-title').textContent = `${watch.label} — ${watch.band} ${watch.mode}`;
  document.getElementById('detail-pct').textContent = pct + '%';
  document.getElementById('detail-pct').dataset.status = status;
  document.getElementById('detail-context').textContent = `${t('watch.reliability')} · ${power}W · ${watch.mode}`;

  const compare = document.getElementById('detail-compare');
  if (pctAt100 && power < 100) {
    compare.style.display = 'block';
    compare.textContent = `At 100W this would be ${pctAt100}% — ${pctAt100 - pct} pt difference`;
  } else {
    compare.style.display = 'none';
  }

  // Info table
  const prop = getState('propagation');
  document.getElementById('detail-sfi').textContent  = prop.sfi ?? '—';
  document.getElementById('detail-kp').textContent   = prop.kp?.toFixed(1) ?? '—';
  document.getElementById('detail-pwr').textContent  = `${power}W`;
  document.getElementById('detail-dist').textContent = watch.target.distanceKm + ' km';
  document.getElementById('detail-az').textContent   = watch.target.bearingShort + '°';
  document.getElementById('detail-grid').textContent = watch.target.grid;

  document.getElementById('btn-set-alarm').onclick = () => setAlarm(id);
  document.getElementById('btn-export-ics').onclick = () => {
    const start = watch.nextWindow?.start ? new Date(watch.nextWindow.start) : new Date();
    const end   = watch.nextWindow?.end   ? new Date(watch.nextWindow.end)   : new Date(start.getTime() + 3600000);
    exportWatchToICS(watch, start, end);
    showToast(t('toast.ics.export'), 'success');
  };

  showScreen('detail');
}

// ── Alarm ─────────────────────────────────────────────────────────
function setAlarm(id) {
  const watch = getState('watches').find(w => w.id === id);
  if (!watch || !watch.nextWindow) { showToast('No upcoming window found', 'warn'); return; }
  requestPermission().then(granted => {
    if (granted) {
      const { scheduleWatchAlarm } = window._notifications ?? {};
      showToast(`${t('toast.alarm.set')} — ${watch.label} ${watch.band} — ${formatUTC(new Date(watch.nextWindow.start))}`, 'success');
    } else {
      showToast('Notifications blocked — use .ics export instead', 'warn');
    }
  });
}

// ── Render: Storm ─────────────────────────────────────────────────
function renderStorm() {
  // Placeholder — full implementation in doc 09
  document.getElementById('storm-kp').textContent = getState('propagation.kp')?.toFixed(1) ?? '—';
}

// ── Render: Profile ───────────────────────────────────────────────
function renderProfile() {
  const user = getState('user');
  const licBtns = document.querySelectorAll('.lic-btn');
  licBtns.forEach(b => b.classList.toggle('active', b.dataset.class === user.licenseClass));
  document.getElementById('pwr-slider').value = user.txPowerW ?? 100;
  document.getElementById('pwr-val').textContent = (user.txPowerW ?? 100) + 'W';
  document.getElementById('qrp-toggle').checked = user.qrpMode ?? false;
}

// ── Render: Setup ─────────────────────────────────────────────────
let setupData = { callsign: '', grid: '', lat: null, lon: null };

function renderSetup(step) {
  document.getElementById('setup-step-num').textContent = step;
  document.querySelectorAll('.setup-progress__dot').forEach((d, i) => {
    d.classList.toggle('setup-progress__dot--done',   i < step - 1);
    d.classList.toggle('setup-progress__dot--active', i === step - 1);
  });
  document.querySelectorAll('.setup-step-panel').forEach((p, i) => {
    p.style.display = (i + 1 === step) ? 'block' : 'none';
  });
}

// ── Toast ─────────────────────────────────────────────────────────
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── Wire up profile screen events (called from HTML) ──────────────
window.PW = {
  setLicClass(cls) {
    const maxW = { A: 1500, B: 100, C: 25 };
    const sl = document.getElementById('pwr-slider');
    sl.max = maxW[cls];
    sl.value = Math.min(parseInt(sl.value), maxW[cls]);
    setState('user.licenseClass', cls);
    document.getElementById('pwr-val').textContent = sl.value + 'W';
    document.querySelectorAll('.lic-btn').forEach(b => b.classList.toggle('active', b.dataset.class === cls));
  },
  setPower(v) {
    setState('user.txPowerW', parseInt(v));
    document.getElementById('pwr-val').textContent = v + 'W';
  },
  setQRP(on) {
    if (on) { setState('user.txPowerW', 5); document.getElementById('pwr-slider').value = 5; document.getElementById('pwr-val').textContent = '5W'; }
    setState('user.qrpMode', on);
  },
  saveProfile() {
    persistState();
    evaluateWatches();
    showScreen('home');
    renderHome();
    showToast(t('toast.watch.saved'), 'success');
  },
  fillDX(prefix, name, grid, dist, bearing) {
    document.getElementById('setup-dx-input').value = prefix;
    document.getElementById('setup-dx-hint').textContent = `${name} · ${grid} · ${dist} · ${bearing}°`;
  },
  dxHint(v) {
    const entity = prefixToEntity(v, dxccData);
    const el = document.getElementById('setup-dx-hint');
    if (entity) el.textContent = `${entity.name} · ${entity.grid} · ${Math.round(entity._dist ?? 0)} km`;
    else el.textContent = v.length > 1 ? 'Prefix not recognised — coordinates can be entered manually' : '';
  },
  saveSetupLocation() {
    const val = document.getElementById('setup-loc-input').value.trim();
    if (!val) return;
    // Try as grid square
    const ll = gridToLatLon(val.replace(/[A-Za-z]{2}$/,'').toUpperCase() + val.slice(-2).toUpperCase());
    if (ll) {
      setState('user.grid', val.toUpperCase());
      setState('user.lat', ll.lat);
      setState('user.lon', ll.lon);
      renderSetup(2);
    } else {
      document.getElementById('setup-loc-hint').textContent = 'Invalid grid — try e.g. JO20ev';
    }
  },
  skipSetupDX() { setState('user.configured', true); persistState(); showScreen('home'); renderHome(); },
  saveSetupWatch() {
    const prefix = document.getElementById('setup-dx-input').value.trim().toUpperCase();
    const band   = document.getElementById('setup-band').value;
    const mode   = document.getElementById('setup-mode').value;
    const thr    = parseInt(document.getElementById('setup-threshold').value) / 100;
    const entity = prefixToEntity(prefix, dxccData);
    if (!entity) { showToast('Unknown prefix', 'warn'); return; }
    const watch = createWatch({ entity, band, mode, threshold: thr });
    saveWatch(watch);
    setState('user.configured', true);
    persistState();
    showScreen('home');
    renderHome();
    showToast(t('toast.watch.saved'), 'success');
  },
};

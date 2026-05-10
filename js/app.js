/** app.js — Initialisation, routing, orchestration */

import { state, loadPersistedState, subscribe, persistUser, persistWatches } from './state.js';
import { fetchNOAA, noaaStaleness }             from './noaa.js';
import { evaluateAllWatches, STATUS_COLOR, deleteWatch } from './watches.js';
import { initTimeline }                         from './timeline.js';
import { initSetup, initNewWatch, setDxccData }  from './setup.js';
import { watchWindowToICS, downloadICS }        from './export.js';
import { t, setLang }                           from './i18n.js';
import { showScreen, showToast }                from './ui.js';
import { initSettings, syncSettingsUI }          from './settings.js';
import { formatUTC, formatBothTimes, formatLocal, ageMinutes } from './utils.js';

/* ── Boot ── */
window.addEventListener('DOMContentLoaded', async () => {

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/PropagationWatch/sw.js')
      .catch(e => console.warn('SW:', e));
  }

  loadPersistedState();

  // Load saved NOAA config
  const savedCfg = JSON.parse(localStorage.getItem('pw_noaa_config') || 'null');
  if (savedCfg) {
    const { NOAA_CONFIG } = await import('./noaa.js');
    Object.assign(NOAA_CONFIG, savedCfg);
  }

  // Apply theme and language
  document.documentElement.dataset.theme = state.user.theme ?? 'dark';
  setLang(state.user.lang ?? 'en');

  // Init settings screen (safe — settings.js might not be fully loaded yet)
  initSettings();

  // Load static data
  const base = '/PropagationWatch';
  const [dxcc] = await Promise.all([
    fetch(`${base}/data/dxcc-entities.json`).then(r => r.json()).catch(() => []),
  ]);
  setDxccData(dxcc);

  // Route
  const action = new URLSearchParams(location.search).get('action');
  if (!state.user.configured) {
    showScreen('setup'); initSetup();
  } else if (action === 'new-watch') {
    showScreen('setup'); initNewWatch();
  } else {
    showScreen('home');
  }

  // Fetch live data
  await fetchNOAA();
  evaluateAllWatches();
  initTimeline();
  renderHome();

  subscribe('watches',     () => { renderWatchList(); renderStormBanner(); });
  subscribe('propagation', () => { renderStatusBar(); renderStormBanner(); });

  setInterval(fetchNOAA,          5 * 60 * 1000);
  setInterval(evaluateAllWatches, 5 * 60 * 1000);
  setInterval(() => {
    const el = document.getElementById('timeline-now');
    if (el) el.textContent = new Date().toUTCString().slice(17, 22) + ' UTC';
  }, 30000);
});

// syncSettingsUI is in settings.js

/* ── Home screen ── */
function renderHome() {
  renderStatusBar();
  renderWatchList();
  renderStormBanner();
  const el = document.getElementById('timeline-now');
  if (el) el.textContent = new Date().toUTCString().slice(17, 22) + ' UTC';
}

/* ── Status bar ── */
function renderStatusBar() {
  const bar = document.getElementById('status-bar');
  if (!bar) return;
  const { kp, sfi, gScale } = state.propagation;
  const age = state.propagation.fetchedAt ? ageMinutes(state.propagation.fetchedAt) : null;

  const kpColor = !kp || kp < 3 ? 'var(--color-good-text)'
    : kp < 5 ? 'var(--color-warn-text)'
    : 'var(--color-bad-text)';

  const staleness = noaaStaleness();
  const staleColor = staleness === 'stale' ? 'var(--color-bad-text)'
    : staleness === 'warn' ? 'var(--color-warn-text)'
    : 'var(--color-text-muted)';

  bar.innerHTML = `
    <span class="status-bar__item">
      <span class="status-bar__label">Kp</span>
      <span class="mono" style="color:${kpColor}">${kp != null ? kp.toFixed(1) : '—'}</span>
    </span>
    <span class="status-bar__item">
      <span class="status-bar__label">SFI</span>
      <span class="mono">${sfi ?? '—'}</span>
    </span>
    <span class="status-bar__item">
      <span style="font-size:var(--text-xs);color:${gScale > 0 ? 'var(--color-bad-text)':'var(--color-text-muted)'}">G${gScale ?? 0}</span>
    </span>
    <span class="status-bar__stale" style="color:${staleColor}">
      ${age != null ? `${age}m ago` : 'no data'}
    </span>
    <button class="btn btn--icon"
      style="width:32px;height:32px;min-height:unset;font-size:13px;margin-left:auto"
      title="Refresh" onclick="window._pwFetchNOAA && window._pwFetchNOAA()">↺</button>`;
}

/* ── Watch list ── */
function renderWatchList() {
  const list = document.getElementById('watch-list');
  if (!list) return;

  if (!state.watches.length) {
    list.innerHTML = `<div style="text-align:center;padding:var(--space-10) var(--space-4);color:var(--color-text-muted);font-size:var(--text-sm)">
      No watches yet — tap <strong>+ Watch</strong> to add one</div>`;
    return;
  }

  const ORDER = { OPTIMAL: 0, APPROACHING: 1, WAITING: 2, POOR: 3, INACTIVE: 4 };
  const sorted = [...state.watches].sort((a, b) => (ORDER[a.status] ?? 5) - (ORDER[b.status] ?? 5));

  list.innerHTML = sorted.map(watchCardHTML).join('');

  list.querySelectorAll('.watch-card').forEach(card => {
    card.addEventListener('click', () => {
      const w = state.watches.find(w => w.id === card.dataset.id);
      if (w) showWatchDetail(w);
    });
  });
}

function watchCardHTML(w) {
  const pct   = Math.round((w.reliability ?? 0) * 100);
  const color = STATUS_COLOR[w.status] ?? 'var(--color-neutral)';
  const pw    = w.txPowerOverride ?? state.user.txPowerW ?? 100;
  const nw    = w.nextWindow;

  let stateLabel = '';
  let windowLine = '';

  switch (w.status) {
    case 'OPTIMAL':
      stateLabel = '● GOOD WINDOW';
      windowLine = nw
        ? `Open now — until ~<strong>${formatUTC(nw.time)}</strong>`
        : 'Open now';
      break;
    case 'APPROACHING':
      stateLabel = '◑ OPENING SOON';
      windowLine = nw
        ? `Opens at <strong>${formatUTC(nw.time)}</strong>`
        : '';
      break;
    case 'WAITING':
      stateLabel = '○ WAITING';
      windowLine = nw
        ? `Next window: <strong>${formatUTC(nw.time)}</strong> · ${Math.round(nw.reliability * 100)}%`
        : 'Calculating...';
      break;
    case 'POOR':
      stateLabel = '✕ CLOSED';
      windowLine = nw && nw.reliability > 0.10
        ? `Best today: <strong>${formatUTC(nw.time)}</strong> · ${Math.round(nw.reliability * 100)}%`
        : 'No window expected today';
      break;
    default:
      stateLabel = 'INACTIVE';
      windowLine = '';
  }

  return `
  <div class="watch-card card--clickable" data-id="${w.id}" data-status="${w.status}"
       style="--status-color:${color}">
    <div class="watch-card__header">
      <div>
        <div class="watch-card__title">
          ${w.label}
          <span class="power-badge">${pw}W</span>
        </div>
        <div class="watch-card__meta mono">${w.band} · ${w.mode} · ${(w.distanceKm ?? 0).toLocaleString()} km · ${w.bearingShort ?? 0}°</div>
      </div>
      <div class="watch-card__actions">
        <button class="btn btn--icon" style="width:36px;height:36px;min-height:unset;font-size:16px"
                title="Set alarm"
                onclick="event.stopPropagation(); window._pwHandleAlarm && window._pwHandleAlarm('${w.id}')">⏰</button>
        <button class="btn btn--icon" style="width:36px;height:36px;min-height:unset;font-size:15px;color:var(--color-bad-text)"
                title="Delete watch"
                onclick="event.stopPropagation(); window._pwHandleDelete && window._pwHandleDelete('${w.id}')">🗑</button>
      </div>
    </div>
    <div class="watch-card__status">
      <div style="flex:1;min-width:0">
        <div class="watch-card__state">${stateLabel}</div>
        <div class="watch-card__sub" style="font-size:var(--text-sm);margin-top:3px;color:var(--color-text-secondary)">${windowLine}</div>
      </div>
      <div class="watch-card__pct" style="margin-left:var(--space-3);flex-shrink:0">${pct}%</div>
    </div>
  </div>`;
}

/* ── Storm banner ── */
function renderStormBanner() {
  const el = document.getElementById('storm-banner');
  if (!el) return;
  const { kp, gScale } = state.propagation;
  if (!kp || kp < 4) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `
    <div class="storm-banner__text">
      <div class="storm-banner__title">⚠ G${gScale} storm · Kp ${kp.toFixed(1)}</div>
      <div>HF bands affected — check band conditions</div>
    </div>
    <button class="btn btn--secondary" style="font-size:var(--text-xs);white-space:nowrap"
            onclick="showScreen('storm')">Details →</button>`;
}

/* ── Watch detail ── */
function showWatchDetail(watch) {
  state.ui.selectedWatch = watch;
  const screen = document.getElementById('screen-detail');
  if (!screen) return;

  const pct      = Math.round((watch.reliability ?? 0) * 100);
  const basePct  = Math.round((watch.reliabilityBase ?? watch.reliability ?? 0) * 100);
  const pw       = watch.txPowerOverride ?? state.user.txPowerW ?? 100;
  const color    = STATUS_COLOR[watch.status] ?? 'var(--color-neutral)';
  const diff     = basePct - pct;
  const nw       = watch.nextWindow;

  // Next window block — the key missing piece
  let nextWindowHTML = '';
  if (nw) {
    const nwPct  = Math.round(nw.reliability * 100);
    const nwColor = nwPct >= 60 ? 'var(--color-good)' : nwPct >= 30 ? 'var(--color-warn)' : 'var(--color-bad)';
    const nwBg    = nwPct >= 60 ? 'var(--color-good-bg)' : nwPct >= 30 ? 'var(--color-warn-bg)' : 'var(--color-bad-bg)';
    nextWindowHTML = `
    <div style="background:${nwBg};border:1px solid ${nwColor};border-radius:var(--radius-md);
                padding:var(--space-4);margin-top:var(--space-4)">
      <div style="font-size:var(--text-xs);color:var(--color-text-secondary);margin-bottom:var(--space-1)">
        ${watch.status === 'OPTIMAL' ? 'Current window ends ~' : 'Best window'}
      </div>
      <div style="font-size:var(--text-2xl);font-weight:var(--weight-bold);
                  font-family:var(--font-mono);color:${nwColor}">
        ${formatUTC(nw.time)}
      </div>
      <div style="font-size:var(--text-sm);font-family:var(--font-mono);
                  color:var(--color-text-secondary);margin-top:2px">
        ${formatLocal(nw.time, state.user.timezone)} local (${state.user.timezone})
      </div>
      <div style="font-size:var(--text-sm);color:var(--color-text-secondary);
                  font-family:var(--font-mono);margin-top:var(--space-1)">
        Expected reliability: ${nwPct}%
      </div>
      <button class="btn btn--secondary"
              style="margin-top:var(--space-3);width:100%;font-size:var(--text-sm)"
              onclick="window._pwHandleExport('${watch.id}')">
        📅 Export this window to calendar
      </button>
    </div>`;
  } else {
    nextWindowHTML = `
    <div style="background:var(--color-bg-tertiary);border:1px solid var(--color-border);
                border-radius:var(--radius-md);padding:var(--space-4);margin-top:var(--space-4);
                color:var(--color-text-muted);font-size:var(--text-sm);text-align:center">
      No suitable window found in the next 24h
    </div>`;
  }

  screen.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-5)">
      <button class="btn btn--icon" onclick="showScreen('home')"
              style="width:40px;height:40px;min-height:unset" title="Back">←</button>
      <span style="font-weight:var(--weight-bold);font-size:var(--text-md)">
        ${watch.label} — ${watch.band} ${watch.mode}
      </span>
    </div>

    <div style="font-size:var(--text-3xl);font-weight:var(--weight-bold);
                font-family:var(--font-mono);color:${color}">${pct}%</div>
    <div style="font-size:var(--text-sm);color:var(--color-text-secondary);margin-top:var(--space-1)">
      path reliability now
      <button class="info-btn" title="Calculation details">ⓘ</button>
    </div>
    <div style="font-size:var(--text-xs);font-family:var(--font-mono);
                color:var(--color-text-muted);margin-top:2px">
      at ${pw}W · Class ${state.user.licenseClass ?? 'A'} · ${watch.mode}
    </div>

    ${pw < 100 && diff > 0 ? `
    <div style="background:var(--color-bg-tertiary);border:1px solid var(--color-border);
                border-radius:var(--radius-md);padding:var(--space-3) var(--space-4);
                margin-top:var(--space-3);font-size:var(--text-xs);color:var(--color-text-secondary)">
      At 100W this would be <strong>${basePct}%</strong> — ${diff}pt difference on this path
    </div>` : ''}

    ${nextWindowHTML}

    <div class="card" style="margin-top:var(--space-4)">
      ${infoRow('SFI',      state.propagation.sfi ?? '—')}
      ${infoRow('Kp',       state.propagation.kp != null ? state.propagation.kp.toFixed(1) : '—')}
      ${infoRow('Power',    `${pw}W`)}
      ${infoRow('Distance', `${(watch.distanceKm ?? 0).toLocaleString()} km`)}
      ${infoRow('Bearing',  `${watch.bearingShort ?? 0}° / ${watch.bearingLong ?? 0}° (LP)`)}
      ${infoRow('Grid',     watch.grid || '—')}
    </div>

    <div class="btn-row btn-row--full" style="margin-top:var(--space-4)">
      <button class="btn btn--primary"
              onclick="window._pwHandleAlarm('${watch.id}')">⏰ Set alarm</button>
      <button class="btn btn--secondary"
              onclick="window._pwHandleExport('${watch.id}')">📅 Export .ics</button>
    </div>`;

  showScreen('detail');
}

function infoRow(label, value) {
  return `<div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;
    border-bottom:1px solid var(--color-border-subtle);font-size:var(--text-sm)">
    <span style="color:var(--color-text-secondary)">${label}</span>
    <span class="mono">${value}</span>
  </div>`;
}

/* ── Global handlers (called from inline onclick and other modules) ── */
window._pwHandleDelete = function(id) {
  const watch = state.watches.find(w => w.id === id);
  if (!watch) return;
  const deleted = deleteWatch(id);
  if (deleted) {
    showToast(`Watch "${deleted.label}" deleted`, 'info');
  }
};

window._pwHandleAlarm = function(id) {
  const watch = state.watches.find(w => w.id === id);
  if (!watch) return;
  const timeStr = watch.nextWindow
    ? formatBothTimes(watch.nextWindow.time, state.user.timezone)
    : 'when window opens';
  showToast(`Alarm set — ${watch.label} — ${timeStr}`, 'success');
};

window._pwHandleExport = function(id) {
  const watch = state.watches.find(w => w.id === id);
  if (!watch?.nextWindow) { showToast('No upcoming window found', 'warn'); return; }
  const ics = watchWindowToICS(watch, watch.nextWindow, state.user.timezone);
  downloadICS(ics, `${watch.label}-${watch.band}.ics`);
  showToast('Calendar file downloaded', 'success');
};

window._pwInitNewWatch = function() {
  showScreen('setup');
  initNewWatch();
};

window._pwFetchNOAA = function() {
  import('./noaa.js').then(m => m.fetchNOAA());
};

/* ── Settings handlers — write straight to state + persist ── */
// Settings handlers moved to settings.js
  if (hint) {
    if (v <= 5)        hint.textContent = 'QRP range — only high-reliability paths recommended.';
    else if (v <= 25)  hint.textContent = 'Class C range — significant reduction on marginal paths.';
    else if (v < 100)  hint.textContent = 'Moderate power — slight reduction on marginal paths.';
    else if (v === 100)hint.textContent = 'Reference power — no correction applied.';
    else               hint.textContent = 'High power — reliability scores are higher.';
  }
}

/* ── Global error handler ── */
window.addEventListener('unhandledrejection', e => {
  console.error('Unhandled:', e.reason);
  showToast('Something went wrong — data is safe', 'warn');
});

// Settings init is handled via window._pwInitSettings in nav onclick
});

window.addEventListener('online',  () => { state.connections.offline = false; window._pwFetchNOAA(); });
window.addEventListener('offline', () => { state.connections.offline = true; showToast('Offline — using cached data', 'warn'); });

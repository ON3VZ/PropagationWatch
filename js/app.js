/** app.js — Initialisation, routing, orchestration */

import { state, loadPersistedState, subscribe } from './state.js';
import { fetchNOAA, noaaStaleness }             from './noaa.js';
import { evaluateAllWatches, STATUS_COLOR }     from './watches.js';
import { initTimeline }                         from './timeline.js';
import { initSetup, setDxccData }              from './setup.js';
import { generateICS, watchWindowToICS, downloadICS } from './export.js';
import { t, setLang }                          from './i18n.js';
import { showScreen, showToast }               from './ui.js';
import { formatUTC, formatCountdown, ageMinutes } from './utils.js';

/* ── Boot ── */
window.addEventListener('DOMContentLoaded', async () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW:', e));
  }

  // Load persisted state
  loadPersistedState();

  // Apply theme and language
  document.documentElement.dataset.theme = state.user.theme;
  setLang(state.user.lang);

  // Load static data files
  const [dxcc, showers, bands] = await Promise.all([
    fetch('/data/dxcc-entities.json').then(r => r.json()).catch(() => []),
    fetch('/data/meteor-showers.json').then(r => r.json()).catch(() => []),
    fetch('/data/band-profiles.json').then(r => r.json()).catch(() => []),
  ]);
  setDxccData(dxcc);

  // Route to correct screen
  const action = new URLSearchParams(location.search).get('action');
  if (!state.user.configured) {
    showScreen('setup'); initSetup();
  } else if (action === 'new-watch') {
    showScreen('setup'); initSetup();
  } else {
    showScreen('home');
  }

  // Fetch live data
  await fetchNOAA();
  evaluateAllWatches();

  // Init timeline
  initTimeline();

  // Render main screens
  renderHome();
  subscribe('watches',     renderWatchList);
  subscribe('propagation', renderStatusBar);

  // Poll intervals
  setInterval(fetchNOAA,           5 * 60 * 1000);
  setInterval(evaluateAllWatches,  5 * 60 * 1000);

  // Handle deep links
  if (action === 'quick-check') showQuickCheck();
});

// showScreen is in ui.js

/* ── Home screen ── */
function renderHome() {
  renderStatusBar();
  renderWatchList();
  renderStormBanner();
}

/* ── Status bar ── */
function renderStatusBar() {
  const bar = document.getElementById('status-bar');
  if (!bar) return;
  const { kp, sfi, gScale } = state.propagation;
  const staleness = noaaStaleness();
  const age = state.propagation.fetchedAt ? ageMinutes(state.propagation.fetchedAt) : null;

  const kpColor = !kp ? 'var(--color-text-muted)'
    : kp < 3 ? 'var(--color-good-text)'
    : kp < 5 ? 'var(--color-warn-text)'
    : 'var(--color-bad-text)';

  bar.innerHTML = `
    <span class="status-bar__item">
      <span class="status-bar__label">Kp</span>
      <span class="mono" style="color:${kpColor}">${kp?.toFixed(1) ?? '—'}</span>
    </span>
    <span class="status-bar__item">
      <span class="status-bar__label">SFI</span>
      <span class="mono">${sfi ?? '—'}</span>
    </span>
    <span class="status-bar__item">
      <span style="font-size:var(--text-xs);color:${gScale > 0 ? 'var(--color-bad-text)' : 'var(--color-text-muted)'}">G${gScale}</span>
    </span>
    <span class="status-bar__stale" style="color:${staleness === 'stale' ? 'var(--color-bad-text)' : staleness === 'warn' ? 'var(--color-warn-text)' : 'var(--color-text-muted)'}">
      ${age !== null ? `${age}m ago` : 'no data'}
    </span>
    <button class="btn btn--icon" style="width:32px;height:32px;min-height:unset;font-size:13px" title="Refresh" onclick="import('./noaa.js').then(m=>m.fetchNOAA())">↺</button>
  `;
}

/* ── Watch list ── */
function renderWatchList() {
  const list = document.getElementById('watch-list');
  if (!list) return;

  if (!state.watches.length) {
    list.innerHTML = `<div style="text-align:center;padding:var(--space-10) var(--space-4);color:var(--color-text-muted);font-size:var(--text-sm)">${t('noWatches')}</div>`;
    return;
  }

  // Sort: OPTIMAL first, then APPROACHING, then WAITING, then POOR, then INACTIVE
  const ORDER = { OPTIMAL:0, APPROACHING:1, WAITING:2, POOR:3, INACTIVE:4 };
  const sorted = [...state.watches].sort((a,b) => (ORDER[a.status]??5) - (ORDER[b.status]??5));

  list.innerHTML = sorted.map(w => watchCardHTML(w)).join('');

  // Attach click handlers
  list.querySelectorAll('.watch-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const watch = state.watches.find(w => w.id === id);
      if (watch) showWatchDetail(watch);
    });
  });
}

function watchCardHTML(w) {
  const pct   = Math.round(w.reliability * 100);
  const color = STATUS_COLOR[w.status] ?? 'var(--color-neutral)';
  const pw    = w.txPowerOverride ?? state.user.txPowerW ?? 100;

  let stateLabel = '', subLabel = '';
  switch (w.status) {
    case 'OPTIMAL':
      stateLabel = `● ${t('statusGood')}`;
      subLabel   = w.nextWindow ? `${t('until')} ${formatUTC(w.nextWindow.time)}` : '';
      break;
    case 'APPROACHING':
      stateLabel = `◑ ${t('statusApproach')}`;
      subLabel   = '';
      break;
    case 'WAITING':
      stateLabel = `○ ${t('statusWaiting')}`;
      subLabel   = w.nextWindow
        ? `${t('bestAt')} ${formatUTC(w.nextWindow.time)} (${Math.round(w.nextWindow.reliability*100)}%)`
        : '';
      break;
    case 'POOR':
      stateLabel = `✕ ${t('statusPoor')}`;
      subLabel   = '';
      break;
    default:
      stateLabel = t('statusInactive');
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
        <div class="watch-card__meta mono">${w.band} · ${w.mode} · ${w.distanceKm.toLocaleString()} km · ${w.bearingShort}°</div>
      </div>
      <div class="watch-card__actions">
        <button class="btn btn--icon" style="width:36px;height:36px;min-height:unset;font-size:14px"
                title="${t('setAlarm')}" onclick="event.stopPropagation();handleAlarm('${w.id}')">⏰</button>
      </div>
    </div>
    <div class="watch-card__status">
      <div>
        <div class="watch-card__state">${stateLabel}</div>
        <div class="watch-card__sub mono">${subLabel}</div>
      </div>
      <div class="watch-card__pct">${pct}%</div>
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
      <div>20m–80m affected</div>
    </div>
    <button class="btn btn--secondary" style="font-size:var(--text-xs)" onclick="showScreen('storm')">Details →</button>`;
}

/* ── Watch detail ── */
function showWatchDetail(watch) {
  state.ui.selectedWatch = watch;
  const screen = document.getElementById('screen-detail');
  if (!screen) return;

  const pct     = Math.round(watch.reliability * 100);
  const basePct = Math.round((watch.reliabilityBase ?? watch.reliability) * 100);
  const pw      = watch.txPowerOverride ?? state.user.txPowerW ?? 100;
  const color   = STATUS_COLOR[watch.status] ?? 'var(--color-neutral)';
  const diff    = basePct - pct;

  screen.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-5)">
      <button class="btn btn--icon" onclick="showScreen('home')" style="width:40px;height:40px;min-height:unset" title="${t('back')}">←</button>
      <span style="font-weight:var(--weight-bold);font-size:var(--text-md)">${watch.label} — ${watch.band} ${watch.mode}</span>
    </div>
    <div style="font-size:var(--text-3xl);font-weight:var(--weight-bold);font-family:var(--font-mono);color:${color}">${pct}%</div>
    <div style="font-size:var(--text-sm);color:var(--color-text-secondary);margin-top:var(--space-1)">${t('reliability')} &nbsp;<button class="info-btn" title="Calculation details">ⓘ</button></div>
    <div style="font-size:var(--text-xs);font-family:var(--font-mono);color:var(--color-text-muted);margin-top:2px">at ${pw}W · Class ${state.user.licenseClass} · ${watch.mode}</div>
    ${pw < 100 && diff > 0 ? `
    <div style="background:var(--color-bg-tertiary);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:var(--space-3) var(--space-4);margin-top:var(--space-4);font-size:var(--text-xs);color:var(--color-text-secondary)">
      ${t('at100W', { n: basePct, d: diff })}
    </div>` : ''}
    <div class="card" style="margin-top:var(--space-4)">
      ${infoRow('SFI', state.propagation.sfi ?? '—')}
      ${infoRow('Kp', state.propagation.kp?.toFixed(1) ?? '—')}
      ${infoRow(t('power'), `${pw}W`)}
      ${infoRow(t('distance'), `${watch.distanceKm.toLocaleString()} km`)}
      ${infoRow(t('bearing'), `${watch.bearingShort}° / ${watch.bearingLong}° (LP)`)}
      ${infoRow('Grid', watch.grid || '—')}
    </div>
    <div class="btn-row btn-row--full" style="margin-top:var(--space-4)">
      <button class="btn btn--primary" onclick="handleAlarm('${watch.id}')">${t('setAlarm')}</button>
      <button class="btn btn--secondary" onclick="handleExport('${watch.id}')">${t('exportICS')}</button>
    </div>`;

  showScreen('detail');
}

function infoRow(label, value) {
  return `<div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--color-border-subtle);font-size:var(--text-sm)">
    <span style="color:var(--color-text-secondary)">${label}</span>
    <span class="mono">${value}</span>
  </div>`;
}

/* ── Alarm / export handlers ── */
window.handleAlarm = function(id) {
  const watch = state.watches.find(w => w.id === id);
  if (!watch) return;
  showToast(`${t('alarmSet', { label: watch.label, time: watch.nextWindow ? formatUTC(watch.nextWindow.time) : 'soon' })}`, 'success');
};

window.handleExport = function(id) {
  const watch = state.watches.find(w => w.id === id);
  if (!watch?.nextWindow) { showToast('No upcoming window found', 'warn'); return; }
  const ics = watchWindowToICS(watch, watch.nextWindow);
  downloadICS(ics, `${watch.label}-${watch.band}.ics`);
};

/* ── Quick check (no watch) ── */
function showQuickCheck() {
  // TODO in doc 09 — functional prototype
}

// showToast is in ui.js

/* ── Global error handler ── */
window.addEventListener('unhandledrejection', e => {
  console.error('Unhandled rejection:', e.reason);
  showToast('Something went wrong — data is saved', 'warn');
});

window.addEventListener('online',  () => { state.connections.offline = false; fetchNOAA(); });
window.addEventListener('offline', () => { state.connections.offline = true;  showToast('Offline — using cached data', 'warn'); });

/* Expose for inline onclick (bridge until full event delegation) */

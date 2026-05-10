/** watches.js — Watch CRUD, state machine, alarm pipeline */

import { state, persistWatches, persistAlarms, publish } from './state.js';
import { calcReliability, reliabilityToStatus } from './propagation.js';
import { getGreylineWindows, getSolarElevation } from './greyline.js';
import { calcDistance, calcBearing, formatUTC, formatCountdown } from './utils.js';
import { showToast }    from './ui.js';
import { scheduleNotification } from './notifications.js';
import { t } from './i18n.js';

const STATUS_COLOR = {
  OPTIMAL:    'var(--color-good)',
  APPROACHING:'var(--color-good)',
  WAITING:    'var(--color-warn)',
  POOR:       'var(--color-bad)',
  INACTIVE:   'var(--color-neutral)',
};

/** Create a new watch and persist it. */
export function createWatch(params) {
  const { lat: uLat, lon: uLon } = state.user;
  const dist    = calcDistance(uLat, uLon, params.lat, params.lon);
  const bearing = calcBearing(uLat, uLon, params.lat, params.lon);

  const watch = {
    id:              crypto.randomUUID(),
    label:           params.label ?? params.entity,
    entity:          params.entity,
    name:            params.name ?? params.entity,
    lat:             params.lat,
    lon:             params.lon,
    grid:            params.grid ?? '',
    distanceKm:      Math.round(dist),
    bearingShort:    Math.round(bearing),
    bearingLong:     Math.round((bearing + 180) % 360),
    band:            params.band  ?? '20m',
    mode:            params.mode  ?? 'FT8',
    thresholdPct:    params.thresholdPct ?? 60,
    txPowerOverride: params.txPowerOverride ?? null,
    alarm:           { browserNotify: true, icsExport: false, advanceMin: 15 },
    active:          true,
    createdAt:       new Date().toISOString(),
    lastAlarmAt:     null,
    // Computed — updated by evaluateWatch()
    status:          'WAITING',
    reliability:     0,
    nextWindow:      null,
  };

  state.watches.push(watch);
  persistWatches();
  publish('watches', state.watches);
  showToast(t('watchAdded'), 'success');
  return watch;
}

/** Delete a watch by id. Returns the deleted watch for undo. */
export function deleteWatch(id) {
  const idx = state.watches.findIndex(w => w.id === id);
  if (idx === -1) return null;
  const [deleted] = state.watches.splice(idx, 1);
  persistWatches();
  publish('watches', state.watches);
  return deleted;
}

/** Toggle active state. */
export function toggleWatch(id) {
  const w = state.watches.find(w => w.id === id);
  if (!w) return;
  w.active = !w.active;
  if (!w.active) w.status = 'INACTIVE';
  persistWatches();
  publish('watches', state.watches);
}

/**
 * Evaluate a single watch — compute current reliability + status.
 * @param {Object} watch
 * @param {Date}   [at] - time to evaluate (default: now)
 */
export function evaluateWatch(watch, at = new Date()) {
  if (!watch.active) { watch.status = 'INACTIVE'; return; }

  const { lat: uLat, lon: uLon } = state.user;
  const txElev = getSolarElevation(uLat, uLon, at);
  const rxElev = getSolarElevation(watch.lat, watch.lon, at);
  const pw     = watch.txPowerOverride ?? state.user.txPowerW ?? 100;

  const result = calcReliability({
    band:      watch.band,
    mode:      watch.mode,
    distKm:    watch.distanceKm,
    txSunElev: txElev,
    rxSunElev: rxElev,
    txPowerW:  pw,
  });

  watch.reliability = result.reliability;
  watch.reliabilityBase = result.base;
  watch.status = reliabilityToStatus(result.reliability, watch.thresholdPct / 100);

  // Find next optimal window (scan 24h in 15-min steps)
  watch.nextWindow = findNextWindow(watch);
}

/** Evaluate all active watches and trigger alarm pipeline. */
export function evaluateAllWatches() {
  const now = new Date();
  state.watches.forEach(w => {
    evaluateWatch(w, now);
    checkAlarm(w, now);
  });
  publish('watches', state.watches);
}

/** Find next window where reliability >= threshold within 24h.
 *  Returns the FIRST window meeting threshold, or the best moment if none found. */
function findNextWindow(watch) {
  const { lat: uLat, lon: uLon } = state.user;
  const pw        = watch.txPowerOverride ?? state.user.txPowerW ?? 100;
  const threshold = watch.thresholdPct / 100;
  const STEP      = 15 * 60 * 1000;   // 15-minute steps → 96 per 24h

  let firstAboveThreshold = null;
  let bestMoment          = null;
  let bestRel             = -1;

  for (let i = 1; i <= 96; i++) {
    const t2  = new Date(Date.now() + i * STEP);
    const txE = getSolarElevation(uLat, uLon, t2);
    const rxE = getSolarElevation(watch.lat, watch.lon, t2);
    const r   = calcReliability({
      band:      watch.band,
      mode:      watch.mode,
      distKm:    watch.distanceKm,
      txSunElev: txE,
      rxSunElev: rxE,
      txPowerW:  pw,
    });

    // Track first moment above threshold
    if (r.reliability >= threshold && !firstAboveThreshold) {
      firstAboveThreshold = { time: t2, reliability: r.reliability };
    }

    // Track global best
    if (r.reliability > bestRel) {
      bestRel    = r.reliability;
      bestMoment = { time: t2, reliability: r.reliability };
    }
  }

  // Prefer first threshold crossing, fall back to best moment
  return firstAboveThreshold ?? bestMoment;
}

/** Alarm pipeline — debounced, max 1 per 4h per watch. */
function checkAlarm(watch, now) {
  if (!watch.active) return;
  if (watch.status !== 'APPROACHING' && watch.status !== 'OPTIMAL') return;

  const DEBOUNCE_MS = 4 * 60 * 60 * 1000;
  if (watch.lastAlarmAt && (now - new Date(watch.lastAlarmAt)) < DEBOUNCE_MS) return;

  watch.lastAlarmAt = now.toISOString();
  persistWatches();

  scheduleNotification({
    title: `${watch.label} — ${watch.band} ${watch.mode}`,
    body:  `${Math.round(watch.reliability * 100)}% ${t('reliability')} — ${formatUTC(now)}`,
    tag:   `pw-${watch.id}`,
    url:   `/?watch=${watch.id}`,
  });
}

export { STATUS_COLOR };

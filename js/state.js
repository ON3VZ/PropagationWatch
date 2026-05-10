/** state.js — Central application state, single source of truth */

import { save, load } from './storage.js';

export const state = {
  user: {
    callsign:     null,
    grid:         null,
    lat:          null,
    lon:          null,
    lang:         'en',
    theme:        'dark',
    configured:   false,
    licenseClass: 'A',
    txPowerW:     100,
    qrpMode:      false,
    timezone:     Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Brussels',
  },
  propagation: {
    kp:          null,
    sfi:         null,
    gScale:      0,
    kpForecast:  [],
    fetchedAt:   null,
    stale:       false,
  },
  watches:     [],
  alarms:      [],
  ui: {
    activeScreen:   'home',
    selectedWatch:  null,
    timelineOffset: 0,
  },
  connections: {
    noaaOk:  false,
    mqttOk:  false,
    offline: !navigator.onLine,
  },
};

// Expose state globally so inline onclick handlers in index.html can access it
window._pwState = state;

/* ── Persistence ── */
export function persistUser()    { save('user',    state.user); }
export function persistWatches() { save('watches', state.watches); }
export function persistAlarms()  { save('alarms',  state.alarms); }

export function loadPersistedState() {
  const user    = load('user');
  const watches = load('watches', []);
  const alarms  = load('alarms', []);
  const noaa    = load('noaa_cache');

  if (user)  Object.assign(state.user, user);
  state.watches = watches;
  state.alarms  = alarms;

  if (noaa) {
    const age = ageMinutes(noaa.fetchedAt);
    Object.assign(state.propagation, {
      kp:         noaa.kp,
      sfi:        noaa.sfi,
      gScale:     noaa.gScale ?? 0,
      kpForecast: noaa.kpForecast ?? [],
      fetchedAt:  noaa.fetchedAt,
      stale:      age > 30,
    });
  }
}

function ageMinutes(iso) {
  if (!iso) return 999;
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

/* ── Simple pub/sub ── */
const subs = {};

export function subscribe(key, cb) {
  if (!subs[key]) subs[key] = [];
  subs[key].push(cb);
}

export function publish(key, value) {
  (subs[key] || []).forEach(cb => cb(value));
}

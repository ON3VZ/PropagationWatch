/** noaa.js — NOAA SWPC API client with caching */

import { state, publish } from './state.js';
import { save, load }     from './storage.js';
import { ageMinutes }     from './utils.js';

const BASE = 'https://services.swpc.noaa.gov/json';
const TTL_OK_MIN   =  30;
const TTL_WARN_MIN = 120;

export async function fetchNOAA() {
  try {
    const [kpRes, sfiRes, scalesRes] = await Promise.all([
      fetch(`${BASE}/planetary_k_index_1m.json`,                     { signal: AbortSignal.timeout(8000) }),
      fetch(`${BASE}/solar-cycle/observed-solar-cycle-indices.json`, { signal: AbortSignal.timeout(8000) }),
      fetch(`${BASE}/noaa-scales.json`,                               { signal: AbortSignal.timeout(8000) }),
    ]);

    const kpData     = await kpRes.json();
    const sfiData    = await sfiRes.json();
    const scalesData = await scalesRes.json();

    const kp  = parseFloat(kpData.at(-1)?.Kp   ?? 0);
    const sfi = parseFloat(sfiData.at(-1)?.flux ?? 70);
    const g   = parseInt(scalesData?.G?.Scale   ?? 0);

    const cache = { kp, sfi, gScale: g, kpForecast: [], fetchedAt: new Date().toISOString() };
    save('noaa_cache', cache);

    Object.assign(state.propagation, {
      kp, sfi, gScale: g, fetchedAt: cache.fetchedAt, stale: false,
    });
    state.connections.noaaOk = true;
    publish('propagation', state.propagation);
    console.log(`NOAA OK — Kp ${kp} SFI ${sfi}`);

  } catch (err) {
    console.warn('NOAA fetch failed:', err.message);
    state.connections.noaaOk = false;
    _useCache();
  }
}

function _useCache() {
  const cache = load('noaa_cache');
  if (!cache) {
    Object.assign(state.propagation, { kp: 0, sfi: 70, gScale: 0, stale: true, fetchedAt: null });
  } else {
    const age = ageMinutes(cache.fetchedAt);
    Object.assign(state.propagation, {
      kp: cache.kp, sfi: cache.sfi, gScale: cache.gScale ?? 0,
      fetchedAt: cache.fetchedAt, stale: age > TTL_OK_MIN,
    });
  }
  publish('propagation', state.propagation);
}

export function noaaStaleness() {
  const age = ageMinutes(state.propagation.fetchedAt);
  if (!state.propagation.fetchedAt) return 'none';
  if (age <= TTL_OK_MIN)   return 'ok';
  if (age <= TTL_WARN_MIN) return 'warn';
  return 'stale';
}

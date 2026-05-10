/** noaa.js — NOAA SWPC API client
 *
 *  Robust fetch with:
 *  - Configurable endpoints, timeout, poll interval
 *  - Promise.allSettled (partial failure OK)
 *  - Compatible timeout (no AbortSignal.timeout)
 *  - Per-endpoint status tracking for the API test UI
 *  - Detailed error logging
 *  - Retry on transient errors (max 3 attempts)
 */

import { state, publish } from './state.js';
import { save, load }     from './storage.js';
import { ageMinutes }     from './utils.js';

/* ── Configurable parameters (editable in Settings) ── */
export const NOAA_CONFIG = {
  timeout_ms:    10000,   // per-request timeout
  poll_interval: 5,       // minutes between auto-polls
  fallback_sfi:  70,      // used when no data available
  fallback_kp:   0,       // conservative (assume calm)
  max_retries:   2,       // retries on network error
  stale_warn:    30,      // minutes before orange indicator
  stale_error:   120,     // minutes before red indicator
};

/* ── Endpoints ── */
const BASE = 'https://services.swpc.noaa.gov';
export const ENDPOINTS = {
  kp: {
    url:   `${BASE}/json/planetary_k_index_1m.json`,
    label: 'Kp index (1-min)',
    parse: (data) => {
      if (!Array.isArray(data) || !data.length) throw new Error('Empty array');
      // Find last entry with valid Kp
      for (let i = data.length - 1; i >= 0; i--) {
        const v = parseFloat(data[i]?.Kp ?? data[i]?.kp);
        if (!isNaN(v)) return v;
      }
      throw new Error('No valid Kp found in response');
    },
  },
  sfi: {
    url:   `${BASE}/json/solar-cycle/observed-solar-cycle-indices.json`,
    label: 'Solar Flux Index',
    parse: (data) => {
      if (!Array.isArray(data) || !data.length) throw new Error('Empty array');
      // Last entry with valid flux
      for (let i = data.length - 1; i >= 0; i--) {
        const v = parseFloat(data[i]?.flux ?? data[i]?.sfi);
        if (!isNaN(v) && v > 0) return v;
      }
      throw new Error('No valid SFI found in response');
    },
  },
  scales: {
    url:   `${BASE}/json/noaa-scales.json`,
    label: 'Storm scales (G/S/R)',
    parse: (data) => {
      const g = parseInt(data?.G?.Scale ?? 0);
      return isNaN(g) ? 0 : g;
    },
  },
};

/* ── Per-endpoint status (shown in settings API test) ── */
export const apiStatus = {
  kp:     { ok: null, value: null, error: null, lastAttempt: null, latency_ms: null },
  sfi:    { ok: null, value: null, error: null, lastAttempt: null, latency_ms: null },
  scales: { ok: null, value: null, error: null, lastAttempt: null, latency_ms: null },
};

/* ── Fetch with compatible timeout (no AbortSignal.timeout) ── */
function fetchWithTimeout(url, ms = NOAA_CONFIG.timeout_ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    fetch(url, { cache: 'no-store' })
      .then(res => { clearTimeout(timer); resolve(res); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

/* ── Fetch one endpoint with retry ── */
async function fetchEndpoint(key, retries = NOAA_CONFIG.max_retries) {
  const ep = ENDPOINTS[key];
  const st = apiStatus[key];
  st.lastAttempt = new Date().toISOString();

  for (let attempt = 0; attempt <= retries; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetchWithTimeout(ep.url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data  = await res.json();
      const value = ep.parse(data);
      st.ok        = true;
      st.value     = value;
      st.error     = null;
      st.latency_ms = Date.now() - t0;
      return value;
    } catch (err) {
      st.ok    = false;
      st.error = err.message;
      st.latency_ms = Date.now() - t0;
      if (attempt < retries) {
        console.warn(`NOAA ${key} attempt ${attempt + 1} failed: ${err.message} — retrying`);
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
      } else {
        console.error(`NOAA ${key} failed after ${retries + 1} attempts: ${err.message}`);
      }
    }
  }
  return null;
}

/* ── Main fetch — all endpoints, partial failure OK ── */
export async function fetchNOAA() {
  console.log('NOAA fetch starting…');

  const [kp, sfi, gScale] = await Promise.all([
    fetchEndpoint('kp'),
    fetchEndpoint('sfi'),
    fetchEndpoint('scales'),
  ]);

  const anyOk = kp !== null || sfi !== null;

  if (anyOk) {
    const cache = {
      kp:         kp    ?? state.propagation.kp    ?? NOAA_CONFIG.fallback_kp,
      sfi:        sfi   ?? state.propagation.sfi   ?? NOAA_CONFIG.fallback_sfi,
      gScale:     gScale ?? state.propagation.gScale ?? 0,
      kpForecast: [],
      fetchedAt:  new Date().toISOString(),
    };
    save('noaa_cache', cache);
    Object.assign(state.propagation, { ...cache, stale: false });
    state.connections.noaaOk = true;
    console.log(`NOAA OK — Kp ${cache.kp?.toFixed(2)} SFI ${cache.sfi} G${cache.gScale}`);
  } else {
    state.connections.noaaOk = false;
    console.error('NOAA all endpoints failed — using cache/defaults');
    _useCache();
  }

  publish('propagation', state.propagation);
  publish('apiStatus', apiStatus);  // triggers settings UI update
  return { kp, sfi, gScale };
}

function _useCache() {
  const cache = load('noaa_cache');
  if (!cache) {
    Object.assign(state.propagation, {
      kp: NOAA_CONFIG.fallback_kp, sfi: NOAA_CONFIG.fallback_sfi,
      gScale: 0, stale: true, fetchedAt: null,
    });
  } else {
    const age = ageMinutes(cache.fetchedAt);
    Object.assign(state.propagation, {
      kp: cache.kp, sfi: cache.sfi, gScale: cache.gScale ?? 0,
      fetchedAt: cache.fetchedAt,
      stale: age > NOAA_CONFIG.stale_warn,
    });
  }
}

export function noaaStaleness() {
  const age = ageMinutes(state.propagation.fetchedAt);
  if (!state.propagation.fetchedAt) return 'none';
  if (age <= NOAA_CONFIG.stale_warn)  return 'ok';
  if (age <= NOAA_CONFIG.stale_error) return 'warn';
  return 'stale';
}

/**
 * Test all endpoints and return detailed results.
 * Used by the Settings API test button.
 * Bypasses cache, always hits the network.
 */
export async function testAllEndpoints() {
  publish('apiStatus', { testing: true });
  // Reset status
  Object.keys(apiStatus).forEach(k => {
    apiStatus[k] = { ok: null, value: null, error: null, lastAttempt: null, latency_ms: null };
  });

  // Test each endpoint independently with reduced retries
  const origRetries = NOAA_CONFIG.max_retries;
  NOAA_CONFIG.max_retries = 0; // no retries during test

  const results = {};
  for (const key of Object.keys(ENDPOINTS)) {
    results[key] = await fetchEndpoint(key);
    publish('apiStatus', apiStatus); // live update per endpoint
  }

  NOAA_CONFIG.max_retries = origRetries;
  publish('apiStatus', { testing: false, done: true });
  return results;
}

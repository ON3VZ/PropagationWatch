/** propagation.js — Reliability calculations (pure functions, no DOM) */

import { state } from './state.js';

/* ── Kp degradation matrix (doc 02 §A5.2 — to be validated) ── */
const KP_MATRIX = {
  '160m': [1.00,0.90,0.75,0.50,0.25,0.10,0.00,0.00,0.00,0.00],
  '80m':  [1.00,0.90,0.80,0.60,0.35,0.15,0.05,0.00,0.00,0.00],
  '40m':  [1.00,0.95,0.85,0.70,0.50,0.25,0.10,0.05,0.00,0.00],
  '30m':  [1.00,0.98,0.90,0.80,0.60,0.35,0.15,0.05,0.00,0.00],
  '20m':  [1.00,1.00,0.95,0.85,0.65,0.40,0.20,0.05,0.00,0.00],
  '17m':  [1.00,1.00,0.97,0.88,0.70,0.45,0.25,0.10,0.02,0.00],
  '15m':  [1.00,1.00,0.98,0.90,0.75,0.50,0.30,0.12,0.03,0.00],
  '12m':  [1.00,1.00,0.99,0.92,0.78,0.55,0.33,0.15,0.05,0.00],
  '10m':  [1.00,1.00,1.00,0.95,0.82,0.60,0.38,0.18,0.06,0.01],
  '6m':   [1.00,1.00,1.00,0.97,0.88,0.70,0.50,0.30,0.12,0.04],
};

/* Mode SNR margin (dB above decoding threshold at 100W on a good path) */
const MODE_MARGIN = {
  FT8:    20, FT4: 18, JT65: 22,
  CW:     13, SSB:  6, AM:    4,
  MSK144: 12,
};

/**
 * Estimate MUF for a given path.
 * @param {number} sfi     - Solar Flux Index
 * @param {number} distKm  - Path distance in km
 * @returns {number} Estimated MUF in MHz
 */
export function calcMUF(sfi, distKm) {
  const afstandFactor = Math.min(1, distKm / 4000);
  return (sfi * 0.12 + 2) * afstandFactor;
}

/**
 * D-layer absorption factor based on solar elevation.
 * 0° elevation = dawn/dusk (minimal absorption)
 * 90° elevation = noon (max absorption on low bands)
 * @param {number} elevDeg - Solar elevation in degrees
 * @returns {number} Factor 0.0–1.0 (1.0 = no absorption)
 */
export function calcDlayerFactor(elevDeg) {
  if (elevDeg <= 0) return 1.0;          // night — no D-layer
  if (elevDeg >= 60) return 0.0;         // high sun — full absorption
  return 1 - (elevDeg / 60);
}

/**
 * Kp degradation factor for a given band.
 */
export function calcKpDegradation(band, kp) {
  const row = KP_MATRIX[band] ?? KP_MATRIX['20m'];
  const idx = Math.min(9, Math.max(0, Math.floor(kp)));
  return row[idx];
}

/**
 * Power correction factor relative to 100W reference.
 * @param {number} txPowerW
 * @param {string} mode
 * @returns {number} Factor (0.1–1.2)
 */
export function calcPowerFactor(txPowerW, mode) {
  const dBdiff = 10 * Math.log10(txPowerW / 100);
  const margin = MODE_MARGIN[mode] ?? 10;
  return Math.max(0.1, Math.min(1.2, 1 + dBdiff / margin));
}

/**
 * Full reliability calculation for a watch at a given moment.
 * @param {Object} params
 * @param {string}  params.band
 * @param {string}  params.mode
 * @param {number}  params.distKm
 * @param {number}  params.txSunElev  - Solar elevation at TX site (degrees)
 * @param {number}  params.rxSunElev  - Solar elevation at RX site (degrees)
 * @param {number}  [params.txPowerW] - defaults to state.user.txPowerW
 * @returns {{ reliability: number, base: number, powerFactor: number, muf: number }}
 */
export function calcReliability({ band, mode, distKm, txSunElev, rxSunElev, txPowerW }) {
  const { kp, sfi } = state.propagation;
  const pw = txPowerW ?? state.user.txPowerW ?? 100;

  // Fallback to conservative defaults if no data
  const safeKp  = kp  ?? 0;
  const safeSfi = sfi ?? 70;

  const muf = calcMUF(safeSfi, distKm);

  // Band frequency midpoints (MHz)
  const BAND_FREQ = {
    '160m':1.85,'80m':3.65,'40m':7.1,'30m':10.12,
    '20m':14.2,'17m':18.1,'15m':21.2,'12m':24.9,'10m':28.5,'6m':50.1,
  };
  const freq = BAND_FREQ[band] ?? 14.2;

  // MUF check
  if (freq > muf * 1.10) return { reliability: 0, base: 0, powerFactor: 1, muf };
  let base = freq > muf * 0.95 ? 0.15 : Math.min(1, safeSfi / 150);

  // Degradation factors
  base *= calcKpDegradation(band, safeKp);
  base *= calcDlayerFactor(txSunElev);
  base *= calcDlayerFactor(rxSunElev);
  base  = Math.max(0, Math.min(0.99, base));

  const powerFactor = calcPowerFactor(pw, mode);
  const reliability = Math.max(0, Math.min(0.99, base * powerFactor));

  return { reliability, base, powerFactor, muf };
}

/**
 * Convert reliability (0–1) to status string.
 * @param {number} r
 * @param {number} threshold - watch alert threshold (0–1)
 */
export function reliabilityToStatus(r, threshold = 0.60) {
  if (r >= threshold)        return 'OPTIMAL';
  if (r >= threshold * 0.85) return 'APPROACHING';
  if (r >= 0.10)             return 'WAITING';
  return 'POOR';
}

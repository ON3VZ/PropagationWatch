/** propagation.js — Reliability calculations (pure functions, no DOM)
 *  v1.1 — fixes from doc 10 review:
 *    - calcMUF: foF2 × obliquity formula (replaces incorrect linear formula)
 *    - calcDlayerFactor: band-specific, no D-layer on 20m+
 */

import { state } from './state.js';

/* ── Kp degradation matrix (doc 02 §A5.2 — empirical, to be validated) ── */
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

/* Mode SNR margin in dB above decoding threshold at 100W on a good path */
const MODE_MARGIN = {
  FT8: 20, FT4: 18, JT65: 22,
  CW:  13, SSB:  6, AM:    4,
  MSK144: 12,
};

/* D-layer max absorption per low band at high solar elevation.
   20m and above: D-layer transparent → factor always 1.0           */
const D_LAYER_ABSORPTION = {
  '160m': 0.80,   // 80% reduction at noon
  '80m':  0.75,
  '40m':  0.55,
  '30m':  0.25,
  // 20m, 17m, 15m, 12m, 10m, 6m → not in map → factor = 1.0
};

/**
 * Estimate Maximum Usable Frequency for an HF path.
 *
 * Uses foF2 (critical F2-layer frequency) × obliquity factor.
 * foF2 correlates empirically with SFI (2 MHz at SFI=0, ~10 MHz at SFI=150).
 * Obliquity factor accounts for the geometry of F2 reflection:
 *   short paths (~1000 km): 2.5 — longer paths (>6000 km): up to 5.0
 *
 * Validated against known band conditions (doc 10 §A1).
 *
 * @param {number} sfi    - Solar Flux Index
 * @param {number} distKm - Path distance in km
 * @returns {number} Estimated MUF in MHz
 */
export function calcMUF(sfi, distKm) {
  const foF2      = 2 + (sfi / 150) * 8;
  const obliquity = 2.5 + Math.min(2.5, distKm / 3000);
  return foF2 * obliquity;
}

/**
 * D-layer absorption factor — band-specific.
 *
 * Only low bands (160m–30m) are affected by D-layer absorption.
 * 20m and above: D-layer transparent → returns 1.0.
 *
 * @param {string} band    - e.g. '40m', '20m'
 * @param {number} elevDeg - Solar elevation in degrees at the relevant site
 * @returns {number} 0.0–1.0 (1.0 = no absorption)
 */
export function calcDlayerFactor(band, elevDeg) {
  const maxAbs = D_LAYER_ABSORPTION[band];
  if (!maxAbs) return 1.0;               // 20m and above — no D-layer
  if (elevDeg <= 0)  return 1.0;         // night — no D-layer
  if (elevDeg >= 75) return 1 - maxAbs;  // high sun — max absorption
  return 1 - (elevDeg / 75) * maxAbs;
}

/**
 * Kp degradation factor for a given band.
 * @param {string} band
 * @param {number} kp  - Planetary K-index (0–9)
 * @returns {number} 0.0–1.0
 */
export function calcKpDegradation(band, kp) {
  const row = KP_MATRIX[band] ?? KP_MATRIX['20m'];
  const idx = Math.min(9, Math.max(0, Math.floor(kp)));
  return row[idx];
}

/**
 * Transmit power correction factor relative to 100W reference.
 * Based on dB difference and mode-specific SNR margin.
 *
 * @param {number} txPowerW - Transmit power in watts
 * @param {string} mode     - Operating mode (FT8, CW, SSB, …)
 * @returns {number} 0.1–1.2
 */
export function calcPowerFactor(txPowerW, mode) {
  const dBdiff = 10 * Math.log10(txPowerW / 100);
  const margin = MODE_MARGIN[mode] ?? 10;
  return Math.max(0.1, Math.min(1.2, 1 + dBdiff / margin));
}

/**
 * Full path reliability calculation for a watch at a given moment.
 *
 * Calculation order (doc 02 §A6.1 + power correction):
 * 1. Get live SFI + Kp from state (conservative fallback if unavailable)
 * 2. Estimate MUF via foF2 × obliquity
 * 3. If freq > MUF × 1.10 → reliability = 0 (above MUF)
 * 4. If freq > MUF × 0.95 → reliability = 0.15 (marginal)
 * 5. Base reliability from SFI
 * 6. × Kp degradation
 * 7. × D-layer factor TX (band-specific — 0 for 20m+)
 * 8. × D-layer factor RX (band-specific — 0 for 20m+)
 * 9. × Power correction factor
 *
 * @param {Object} params
 * @returns {{ reliability, base, powerFactor, muf }}
 */
export function calcReliability({ band, mode, distKm, txSunElev, rxSunElev, txPowerW }) {
  const { kp, sfi }  = state.propagation;
  const pw           = txPowerW ?? state.user.txPowerW ?? 100;
  const safeKp       = kp  ?? 0;
  const safeSfi      = sfi ?? 70;

  const muf  = calcMUF(safeSfi, distKm);
  const freq = BAND_FREQ[band] ?? 14.2;

  // MUF gate
  if (freq > muf * 1.10) return { reliability: 0, base: 0, powerFactor: 1, muf };
  if (freq > muf * 0.95) return { reliability: 0.15, base: 0.15, powerFactor: 1, muf };

  // Base from SFI — floor 0.05 prevents zero at low SFI
  let base = Math.max(0.05, Math.min(1, safeSfi / 150));

  // Apply degradation factors
  base *= calcKpDegradation(band, safeKp);
  base *= calcDlayerFactor(band, txSunElev);   // TX site
  base *= calcDlayerFactor(band, rxSunElev);   // RX site
  base  = Math.max(0, Math.min(0.99, base));

  // Power correction
  const powerFactor = calcPowerFactor(pw, mode);
  const reliability = Math.max(0, Math.min(0.99, base * powerFactor));

  return { reliability, base, powerFactor, muf };
}

/* Band frequency midpoints (MHz) */
const BAND_FREQ = {
  '160m': 1.85, '80m': 3.65, '40m': 7.1,  '30m': 10.12,
  '20m': 14.2,  '17m': 18.1, '15m': 21.2, '12m': 24.9,
  '10m': 28.5,  '6m':  50.1,
};

/**
 * Convert reliability (0–1) to watch status string.
 * APPROACHING = close to threshold, warn the user early.
 */
export function reliabilityToStatus(r, threshold = 0.60) {
  if (r >= threshold)          return 'OPTIMAL';
  if (r >= threshold * 0.80)   return 'APPROACHING';
  if (r >= 0.10)               return 'WAITING';
  return 'POOR';
}

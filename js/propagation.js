/** propagation.js — Path reliability calculations (pure functions, no DOM)
 *
 *  v1.2 — doc 10 review fixes:
 *  - calcMUF: foF2 × obliquity (replaces incorrect linear scaling)
 *  - calcDlayerFactor: sigmoid curve, band-specific, 20m+ unaffected
 *  - calcMultiHopFactor: multi-hop attenuation for low bands on long paths
 *  - calcKpDegradation: linear interpolation between integer Kp steps
 */

import { state } from './state.js';

/* ── Band frequency midpoints (MHz) ── */
export const BAND_FREQ = {
  '160m': 1.85, '80m': 3.65, '40m': 7.10, '30m': 10.12,
  '20m': 14.20, '17m': 18.10, '15m': 21.20, '12m': 24.90,
  '10m': 28.50, '6m': 50.10,
};

/* ── Kp degradation matrix
 *  Source: empirical calibration on NOAA Space Weather Scales (G1–G5)
 *  and published ionospheric storm studies. To be validated against RSGB/IPS.
 *  Values: fraction of undisturbed-conditions reliability per band per Kp. ── */
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

/* ── D-layer config per low band
 *  max: maximum absorption fraction at high solar elevation
 *  halfElev: solar elevation (°) at which absorption = max/2
 *  20m and above are NOT in this map → D-layer transparent ── */
const D_LAYER = {
  '160m': { max: 0.95, halfElev:  6 },
  '80m':  { max: 0.90, halfElev: 10 },
  '40m':  { max: 0.82, halfElev: 18 },
  '30m':  { max: 0.35, halfElev: 35 },
};

/* ── Mode SNR margin (dB above decoding threshold at 100W, good path) ── */
const MODE_MARGIN = {
  FT8: 20, FT4: 18, JT65: 22,
  CW:  13, SSB:  6, AM:    4,
  MSK144: 12,
};

/**
 * Estimate Maximum Usable Frequency for an HF path.
 *
 * foF2 (critical F2 frequency) correlates with SFI:
 *   ~2 MHz at SFI=0, ~10 MHz at SFI=150 (empirical)
 * Obliquity factor accounts for F2 geometry:
 *   short paths (1000 km): ~2.5 | long paths (>6000 km): ~5.0
 *
 * Validated: EA/20m OPEN at SFI=70+, 10m CLOSED at SFI<80. (doc 10 §A1)
 */
export function calcMUF(sfi, distKm) {
  const foF2      = 2 + (sfi / 150) * 8;
  const obliquity = 2.5 + Math.min(2.5, distKm / 3000);
  return foF2 * obliquity;
}

/**
 * D-layer absorption factor — band-specific, sigmoid curve.
 *
 * Only 160m/80m/40m/30m are affected. 20m and above: returns 1.0.
 * Sigmoid: smooth transition from 0 absorption at night to max at high sun.
 * Curve validated: 40m at TX elev=35° → factor≈0.35 (DX difficult); at night → 1.0
 */
export function calcDlayerFactor(band, elevDeg) {
  if (elevDeg <= 0) return 1.0;          // night — no D-layer
  const cfg = D_LAYER[band];
  if (!cfg) return 1.0;                  // 20m+ — D-layer transparent
  const t = elevDeg / cfg.halfElev;
  const absorption = cfg.max * (t * t) / (1 + t * t);
  return Math.max(0.03, 1 - absorption);
}

/**
 * Multi-hop attenuation for low bands on very long paths.
 *
 * 80m needs 3-4 hops for paths >7000km → significant ground-reflection loss.
 * 160m is practically limited to ~4000km paths even at night.
 * Applied as an exponential decay beyond the band's practical maximum distance.
 */
export function calcMultiHopFactor(band, distKm) {
  const limits = { '160m': 4000, '80m': 6000 }; // 40m reaches global at night
  const maxDist = limits[band];
  if (!maxDist || distKm <= maxDist) return 1.0;
  const excess = (distKm - maxDist) / 2000;
  return Math.max(0.05, Math.exp(-0.18 * excess));
}

/**
 * Kp degradation factor — linear interpolation between integer steps.
 * Kp 1.7 is between Kp1 and Kp2 → interpolated, not floored.
 */
export function calcKpDegradation(band, kp) {
  const row = KP_MATRIX[band] ?? KP_MATRIX['20m'];
  const lo = Math.min(9, Math.max(0, Math.floor(kp)));
  const hi = Math.min(9, lo + 1);
  const fr = kp - Math.floor(kp);
  return row[lo] * (1 - fr) + row[hi] * fr;
}

/**
 * Transmit power correction factor (dB-based, mode-specific SNR margin).
 * Reference: 100W. Returns 0.1–1.2.
 */
export function calcPowerFactor(txPowerW, mode) {
  if (!txPowerW || txPowerW <= 0) return 0.1;
  const dBdiff = 10 * Math.log10(txPowerW / 100);
  const margin = MODE_MARGIN[mode] ?? 10;
  return Math.max(0.1, Math.min(1.2, 1 + dBdiff / margin));
}

/**
 * Full path reliability — combines all factors.
 *
 * Steps (doc 02 §A6 + doc 10 review):
 * 1. MUF gate — above MUF: 0%, marginal: 15%
 * 2. Base from SFI
 * 3. × Kp degradation (interpolated)
 * 4. × D-layer TX (band-specific sigmoid)
 * 5. × D-layer RX (band-specific sigmoid)
 * 6. × Multi-hop factor (low bands, long paths)
 * 7. × Power correction
 *
 * @returns {{ reliability, base, powerFactor, muf }}
 */
export function calcReliability({ band, mode, distKm, txSunElev, rxSunElev, txPowerW }) {
  const { kp, sfi } = state.propagation;
  const pw       = txPowerW ?? state.user?.txPowerW ?? 100;
  const safeKp   = (kp  != null && !isNaN(kp))  ? kp  : 0;
  const safeSfi  = (sfi != null && !isNaN(sfi)) ? sfi : 70;
  const safeTxEl = isNaN(txSunElev) ? 0 : txSunElev;
  const safeRxEl = isNaN(rxSunElev) ? 0 : rxSunElev;

  const muf  = calcMUF(safeSfi, distKm);
  const freq = BAND_FREQ[band] ?? 14.2;

  // MUF gate
  if (freq > muf * 1.10) return { reliability: 0,    base: 0,    powerFactor: 1, muf };
  if (freq > muf * 0.95) return { reliability: 0.15, base: 0.15, powerFactor: 1, muf };

  let base = Math.max(0.05, Math.min(1, safeSfi / 150));
  base *= calcKpDegradation(band, safeKp);
  base *= calcDlayerFactor(band, safeTxEl);
  base *= calcDlayerFactor(band, safeRxEl);
  base *= calcMultiHopFactor(band, distKm);
  base  = Math.max(0, Math.min(0.99, base));

  const powerFactor = calcPowerFactor(pw, mode);
  const reliability = Math.max(0, Math.min(0.99, base * powerFactor));

  return { reliability, base, powerFactor, muf };
}

/**
 * Convert reliability to watch status.
 * APPROACHING fires early enough to give the user time to get to the rig.
 */
export function reliabilityToStatus(r, threshold = 0.60) {
  if (r >= threshold)        return 'OPTIMAL';
  if (r >= threshold * 0.75) return 'APPROACHING';
  if (r >= 0.10)             return 'WAITING';
  return 'POOR';
}

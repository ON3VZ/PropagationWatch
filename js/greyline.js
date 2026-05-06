/** greyline.js — Greyline and moon calculations via SunCalc */

import { state } from './state.js';

// SunCalc is loaded as a global via <script> in index.html
const SC = () => window.SunCalc;

/**
 * Get greyline windows (periods where both TX and RX are in greyline simultaneously).
 * Scans the next 48h in 5-minute steps.
 *
 * @param {number} txLat  @param {number} txLon
 * @param {number} rxLat  @param {number} rxLon
 * @param {Date}   from   - start of scan window
 * @returns {Array<{start:Date, end:Date, type:'sunrise'|'sunset'}>}
 */
export function getGreylineWindows(txLat, txLon, rxLat, rxLon, from = new Date()) {
  if (!SC()) return [];
  const GREYLINE_HALF = 20 * 60 * 1000; // ±20 minutes in ms
  const STEP = 5 * 60 * 1000;
  const HORIZON = 48 * 60 * 60 * 1000;
  const windows = [];
  let inWindow = false;
  let windowStart = null;

  for (let t = from.getTime(); t < from.getTime() + HORIZON; t += STEP) {
    const d = new Date(t);
    const txPos = SC().getPosition(d, txLat, txLon);
    const rxPos = SC().getPosition(d, rxLat, rxLon);

    const txElev = txPos.altitude * (180 / Math.PI);
    const rxElev = rxPos.altitude * (180 / Math.PI);

    // Both in greyline = elevation between -6° and +6°
    const txGrey = txElev >= -6 && txElev <= 6;
    const rxGrey = rxElev >= -6 && rxElev <= 6;
    const bothGrey = txGrey && rxGrey;

    if (bothGrey && !inWindow) {
      inWindow = true;
      windowStart = d;
    } else if (!bothGrey && inWindow) {
      inWindow = false;
      windows.push({ start: windowStart, end: new Date(t), durationMin: Math.round((t - windowStart.getTime()) / 60000) });
      if (windows.length >= 4) break; // max 4 windows
    }
  }
  return windows;
}

/**
 * Get solar elevation at a given location and time.
 * @returns {number} degrees
 */
export function getSolarElevation(lat, lon, date = new Date()) {
  if (!SC()) return -90;
  const pos = SC().getPosition(date, lat, lon);
  return pos.altitude * (180 / Math.PI);
}

/**
 * Get moon window for EME (elevation above minElev threshold).
 * @param {number} lat  @param {number} lon
 * @param {number} minElev - minimum moon elevation (default 5°)
 * @returns {{ rise:Date|null, set:Date|null, maxElev:number, illumination:number }}
 */
export function getMoonWindow(lat, lon, date = new Date(), minElev = 5) {
  if (!SC()) return { rise: null, set: null, maxElev: 0, illumination: 0 };
  const times = SC().getMoonTimes(date, lat, lon);
  const illum = SC().getMoonIllumination(date);
  return {
    rise:         times.rise ?? null,
    set:          times.set  ?? null,
    maxElev:      minElev,   // simplified — full calc in v2
    illumination: Math.round(illum.fraction * 100),
  };
}

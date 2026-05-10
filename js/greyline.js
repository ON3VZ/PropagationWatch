/** greyline.js — Greyline and astronomical calculations via SunCalc.js */

import { state } from './state.js';

const SC = () => window.SunCalc;

/**
 * Get solar elevation in degrees at a given location and time.
 * Returns -90 (night) if SunCalc is not loaded or coordinates are invalid.
 * @param {number} lat  @param {number} lon  @param {Date} date
 * @returns {number} degrees (-90 to +90)
 */
export function getSolarElevation(lat, lon, date = new Date()) {
  if (!SC() || lat == null || lon == null || isNaN(lat) || isNaN(lon)) return -90;
  try {
    const pos = SC().getPosition(date, lat, lon);
    const deg = pos.altitude * (180 / Math.PI);
    return isNaN(deg) ? -90 : deg;
  } catch {
    return -90;
  }
}

/**
 * Get greyline overlap windows for TX→RX path (next 48h, 5-min scan).
 * Greyline = both TX and RX have solar elevation between -6° and +6°.
 *
 * @param {number} txLat  @param {number} txLon
 * @param {number} rxLat  @param {number} rxLon
 * @param {Date}   from
 * @returns {Array<{start:Date, end:Date, durationMin:number}>}
 */
export function getGreylineWindows(txLat, txLon, rxLat, rxLon, from = new Date()) {
  if (!SC()) return [];
  const STEP_MS   = 5 * 60 * 1000;
  const HORIZON   = 48 * 3600 * 1000;
  const GL_LO = -6, GL_HI = 6;
  const windows = [];
  let inWindow = false;
  let windowStart = null;

  for (let t = from.getTime(); t < from.getTime() + HORIZON; t += STEP_MS) {
    const d   = new Date(t);
    const txEl = getSolarElevation(txLat, txLon, d);
    const rxEl = getSolarElevation(rxLat, rxLon, d);
    const both = txEl >= GL_LO && txEl <= GL_HI && rxEl >= GL_LO && rxEl <= GL_HI;

    if (both && !inWindow) {
      inWindow = true;
      windowStart = d;
    } else if (!both && inWindow) {
      inWindow = false;
      const dur = Math.round((t - windowStart.getTime()) / 60000);
      if (dur >= 5) { // minimum 5-min window to avoid noise
        windows.push({ start: windowStart, end: new Date(t), durationMin: dur });
      }
      if (windows.length >= 6) break;
    }
  }
  return windows;
}

/**
 * Get moon window for EME planning.
 * @param {number} lat  @param {number} lon  @param {Date} date
 * @param {number} minElev - minimum elevation threshold (default 5°)
 */
export function getMoonWindow(lat, lon, date = new Date(), minElev = 5) {
  if (!SC()) return { rise: null, set: null, illumination: 0 };
  try {
    const times = SC().getMoonTimes(date, lat, lon);
    const illum = SC().getMoonIllumination(date);
    return {
      rise:         times.rise ?? null,
      set:          times.set  ?? null,
      illumination: Math.round((illum?.fraction ?? 0) * 100),
    };
  } catch {
    return { rise: null, set: null, illumination: 0 };
  }
}

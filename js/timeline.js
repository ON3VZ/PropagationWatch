/** timeline.js — SVG 24-hour timeline rendering
 *  Computes actual reliability per 15-min block for each watch.
 */

import { state, subscribe } from './state.js';
import { calcReliability }  from './propagation.js';
import { getSolarElevation } from './greyline.js';

const BLOCKS   = 96;      // 24h × 4 per hour
const STEP_MS  = 15 * 60 * 1000;
const ROW_H    = 18;
const LABEL_W  = 42;
const AXIS_H   = 14;
const HEADER_H = 4;
const ROW_GAP  = 3;

/** Colour a reliability value as a CSS variable string */
function relColor(r) {
  if (r >= 0.70) return '#1D9E75';
  if (r >= 0.40) return '#EF9F27';
  if (r >= 0.10) return '#E24B4A';
  return '#313754';
}

/**
 * Compute 96-block reliability array for a watch.
 * Uses real SunCalc elevations for TX and RX locations.
 */
function computeWatchBlocks(watch, startMs) {
  const { lat: uLat, lon: uLon } = state.user;
  const pw = watch.txPowerOverride ?? state.user.txPowerW ?? 100;
  const blocks = [];
  for (let i = 0; i < BLOCKS; i++) {
    const t = new Date(startMs + i * STEP_MS);
    const txEl  = getSolarElevation(uLat, uLon, t);
    const rxEl  = getSolarElevation(watch.lat, watch.lon, t);
    const midEl = getSolarElevation(
      (uLat + watch.lat) / 2,
      (uLon + watch.lon) / 2,
      t
    );
    const r = calcReliability({
      band:       watch.band,
      mode:       watch.mode,
      distKm:     watch.distanceKm,
      txSunElev:  txEl,
      rxSunElev:  rxEl,
      midSunElev: midEl,
      txPowerW:   pw,
    });
    blocks.push(r.reliability);
  }
  return blocks;
}

export function renderTimeline() {
  const svg = document.getElementById('timeline-svg');
  if (!svg) return;

  const watches = state.watches.filter(w => w.active && w.lat);
  const W = Math.max(600, svg.parentElement?.clientWidth ?? 600);
  const numRows = Math.max(1, watches.length);
  const H = HEADER_H + numRows * (ROW_H + ROW_GAP) + AXIS_H + 8;

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('height', H);

  // Snap timeline to current hour
  const now   = new Date();
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  const startMs   = start.getTime();
  const xScale    = (W - LABEL_W) / (BLOCKS * STEP_MS);
  const xNow      = LABEL_W + (now - start) * xScale;

  let html = `<rect width="${W}" height="${H}" fill="var(--color-bg-primary)" rx="3"/>`;

  // Greyline highlight — amber vertical bands at greyline moments
  // (simplified: shade blocks where TX is in greyline ±6°)
  if (state.user.lat) {
    for (let i = 0; i < BLOCKS; i++) {
      const t  = new Date(startMs + i * STEP_MS);
      const el = getSolarElevation(state.user.lat, state.user.lon, t);
      if (el >= -6 && el <= 6) {
        const x = LABEL_W + i * STEP_MS * xScale;
        const w = STEP_MS * xScale;
        html += `<rect x="${x}" y="${HEADER_H}" width="${w}" height="${H - HEADER_H - AXIS_H}"
                  fill="#BA7517" opacity=".12"/>`;
      }
    }
  }

  // Hour grid lines
  for (let h = 0; h <= 24; h += 3) {
    const x   = LABEL_W + h * 3600000 * xScale;
    const utcH = (start.getUTCHours() + h) % 24;
    html += `<line x1="${x}" y1="${HEADER_H}" x2="${x}" y2="${H - AXIS_H}"
              stroke="var(--color-border-subtle)" stroke-width=".5"/>`;
    html += `<text x="${x}" y="${H - 1}" fill="var(--color-text-muted)"
              font-size="8" font-family="monospace" text-anchor="middle">${String(utcH).padStart(2,'0')}h</text>`;
  }

  // Watch rows
  watches.forEach((w, i) => {
    const y      = HEADER_H + i * (ROW_H + ROW_GAP);
    const blocks = computeWatchBlocks(w, startMs);

    // Band label
    html += `<text x="2" y="${y + ROW_H - 7}" fill="var(--color-text-secondary)"
              font-size="9" font-family="monospace" font-weight="600">${w.entity}</text>`;
    html += `<text x="2" y="${y + ROW_H - 1}" fill="var(--color-text-muted)"
              font-size="7" font-family="monospace">${w.band}</text>`;

    // Reliability blocks
    blocks.forEach((r, bi) => {
      const bx = LABEL_W + bi * STEP_MS * xScale;
      const bw = Math.max(1, STEP_MS * xScale - 0.5);
      html += `<rect x="${bx}" y="${y + 1}" width="${bw}" height="${ROW_H - 2}"
                fill="${relColor(r)}" opacity="${r < 0.05 ? '.25' : '.75'}" rx="1"/>`;
    });

    // Alarm markers
    state.alarms
      .filter(a => a.watchId === w.id && !a.triggered)
      .forEach(a => {
        const ax = LABEL_W + (new Date(a.windowStart) - start) * xScale;
        if (ax >= LABEL_W && ax <= W) {
          html += `<line x1="${ax}" y1="${y}" x2="${ax}" y2="${y + ROW_H}"
                    stroke="var(--color-warn)" stroke-width="1.5"/>`;
          html += `<polygon points="${ax},${y} ${ax+4},${y-4} ${ax-4},${y-4}"
                    fill="var(--color-warn)"/>`;
        }
      });
  });

  // "Now" line
  html += `<line x1="${xNow}" y1="${HEADER_H}" x2="${xNow}" y2="${H - AXIS_H}"
            stroke="var(--color-text-primary)" stroke-width="1.5" stroke-dasharray="3,3" opacity=".6"/>`;
  html += `<text x="${Math.min(xNow + 3, W - 24)}" y="${HEADER_H + 9}"
            fill="var(--color-text-muted)" font-size="8" font-family="monospace">now</text>`;

  // Legend
  html += `<text x="${W - 78}" y="${H - 1}" font-size="7" font-family="monospace">
    <tspan fill="#1D9E75">■</tspan><tspan fill="var(--color-text-muted)"> ≥70%  </tspan>
    <tspan fill="#EF9F27">■</tspan><tspan fill="var(--color-text-muted)"> ≥40%  </tspan>
    <tspan fill="#E24B4A">■</tspan><tspan fill="var(--color-text-muted)"> ≥10%</tspan>
  </text>`;

  svg.innerHTML = html;

  // Update "now" label
  const el = document.getElementById('timeline-now');
  if (el) el.textContent = now.toUTCString().slice(17, 22) + ' UTC';
}

export function initTimeline() {
  renderTimeline();
  subscribe('watches',     renderTimeline);
  subscribe('propagation', renderTimeline);
  // Redraw every 5 minutes (NOAA poll interval)
  setInterval(renderTimeline, 5 * 60 * 1000);
  // Advance now-line every minute
  setInterval(() => {
    const el = document.getElementById('timeline-now');
    if (el) el.textContent = new Date().toUTCString().slice(17, 22) + ' UTC';
  }, 60000);
}

/** timeline.js — SVG timeline rendering */

import { state }  from './state.js';
import { subscribe } from './state.js';
import { formatUTC } from './utils.js';

const HOURS   = 24;
const STEP_MIN = 15;

/**
 * Render the 24h SVG timeline into #timeline-svg.
 * Called on data update and every minute.
 */
export function renderTimeline() {
  const svg = document.getElementById('timeline-svg');
  if (!svg) return;

  const W = svg.clientWidth || 600;
  const ROW_H   = 20;
  const HEADER_H = 18;
  const AXIS_H   = 16;
  const watches  = state.watches.filter(w => w.active);
  const H = HEADER_H + watches.length * (ROW_H + 4) + AXIS_H + 24;

  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const now    = new Date();
  const start  = new Date(now); start.setMinutes(0,0,0);
  const totalMs = HOURS * 60 * 60 * 1000;
  const xScale  = (W - 40) / totalMs;
  const xNow    = 40 + (now - start) * xScale;

  let html = '';

  // Background
  html += `<rect width="${W}" height="${H}" fill="var(--color-bg-primary)" rx="4"/>`;

  // Hour grid
  for (let h = 0; h <= HOURS; h++) {
    const x = 40 + h * 3600000 * xScale;
    const utcH = (start.getUTCHours() + h) % 24;
    html += `<line x1="${x}" y1="${HEADER_H}" x2="${x}" y2="${H - AXIS_H}" stroke="var(--color-border-subtle)" stroke-width=".5"/>`;
    if (h % 3 === 0) {
      html += `<text x="${x}" y="${H - 2}" fill="var(--color-text-muted)" font-size="9" font-family="monospace" text-anchor="middle">${String(utcH).padStart(2,'0')}h</text>`;
    }
  }

  // Watch rows
  watches.forEach((w, i) => {
    const y = HEADER_H + i * (ROW_H + 4);
    const col = w.status === 'OPTIMAL' ? 'var(--color-good)'
              : w.status === 'WAITING'  ? 'var(--color-warn)'
              : 'var(--color-neutral)';

    // Label
    html += `<text x="2" y="${y + 13}" fill="var(--color-text-secondary)" font-size="8" font-family="monospace">${w.entity}</text>`;
    html += `<text x="2" y="${y + 21}" fill="var(--color-text-muted)" font-size="7" font-family="monospace">${w.band}</text>`;

    // Reliability bar — one block per 15-min step
    for (let s = 0; s < HOURS * 4; s++) {
      const tStep = new Date(start.getTime() + s * STEP_MIN * 60000);
      const rel   = w.reliability ?? 0; // simplified — full scan in v2
      const bCol  = rel >= 0.70 ? 'var(--color-good)'
                  : rel >= 0.40 ? 'var(--color-warn)'
                  : rel >= 0.10 ? 'var(--color-bad)'
                  : 'var(--color-neutral)';
      const bX = 40 + s * STEP_MIN * 60000 * xScale;
      const bW = STEP_MIN * 60000 * xScale - 1;
      html += `<rect x="${bX}" y="${y + 2}" width="${bW}" height="${ROW_H - 4}" fill="${bCol}" opacity=".7" rx="1"/>`;
    }
  });

  // Now line
  html += `<line x1="${xNow}" y1="${HEADER_H}" x2="${xNow}" y2="${H - AXIS_H}" stroke="var(--color-text-primary)" stroke-width="1.5" stroke-dasharray="3,3" opacity=".6"/>`;
  html += `<text x="${xNow + 3}" y="${HEADER_H + 10}" fill="var(--color-text-muted)" font-size="8" font-family="monospace">now</text>`;

  svg.innerHTML = html;
}

export function initTimeline() {
  subscribe('watches',     () => renderTimeline());
  subscribe('propagation', () => renderTimeline());
  renderTimeline();
  // Redraw every minute to advance the now-line
  setInterval(renderTimeline, 60000);
}

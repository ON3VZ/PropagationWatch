/** utils.js — shared helper functions */

const DEG = Math.PI / 180;

export function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*DEG) * Math.cos(lat2*DEG) * Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export function calcBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * DEG;
  const y = Math.sin(dLon) * Math.cos(lat2 * DEG);
  const x = Math.cos(lat1*DEG)*Math.sin(lat2*DEG) -
            Math.sin(lat1*DEG)*Math.cos(lat2*DEG)*Math.cos(dLon);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

export function gridToLatLon(grid) {
  const g = grid.toUpperCase();
  let lon = (g.charCodeAt(0) - 65) * 20 - 180;
  let lat = (g.charCodeAt(1) - 65) * 10 - 90;
  if (g.length >= 4) { lon += parseInt(g[2]) * 2; lat += parseInt(g[3]); }
  if (g.length >= 6) {
    lon += (g.charCodeAt(4) - 65) * (2/24);
    lat += (g.charCodeAt(5) - 65) * (1/24);
  }
  lon += g.length >= 6 ? 1/24 : g.length >= 4 ? 1 : 10;
  lat += g.length >= 6 ? 0.5/24 : g.length >= 4 ? 0.5 : 5;
  return { lat: Math.round(lat*1000)/1000, lon: Math.round(lon*1000)/1000 };
}

export function latLonToGrid(lat, lon) {
  const lo = lon + 180, la = lat + 90;
  const A = String.fromCharCode(65 + Math.floor(lo / 20));
  const B = String.fromCharCode(65 + Math.floor(la / 10));
  const C = String(Math.floor((lo % 20) / 2));
  const D = String(Math.floor(la % 10));
  const E = String.fromCharCode(65 + Math.floor(((lo % 2) / 2) * 24));
  const F = String.fromCharCode(65 + Math.floor((la % 1) * 24));
  return A + B + C + D + E + F;
}

/** Format UTC time as "21:17 UTC" */
export function formatUTC(date) {
  return date.toUTCString().slice(17, 22) + ' UTC';
}

/** Format local time in a given timezone as "23:17" */
export function formatLocal(date, tz) {
  try {
    return date.toLocaleTimeString('en-GB', {
      timeZone: tz || Intl.DateTimeFormat().resolvedOptions().timeZone,
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * Format both UTC and local time: "21:17 UTC / 23:17 lokaal"
 * Used in watch detail, alarm toast, ics summary
 */
export function formatBothTimes(date, tz) {
  const utc   = formatUTC(date);
  const local = formatLocal(date, tz);
  if (!local || local === utc.slice(0,5)) return utc;
  return `${utc} / ${local} local`;
}

export function formatCountdown(seconds) {
  if (seconds <= 0) return 'now';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

export function prefixToEntity(callsign, dxccData) {
  if (!dxccData?.length) return null;
  const upper = callsign.toUpperCase();
  for (let len = Math.min(4, upper.length); len >= 1; len--) {
    const pfx = upper.slice(0, len);
    const match = dxccData.find(e => e.prefix === pfx);
    if (match) return match;
  }
  return null;
}

export function ageMinutes(isoString) {
  if (!isoString) return 999;
  return Math.round((Date.now() - new Date(isoString).getTime()) / 60000);
}

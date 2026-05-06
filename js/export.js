/** export.js — .ics calendar export (RFC 5545) */

function fmt(date) {
  return date.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
}
function esc(s) {
  return String(s).replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
}

export function generateICS(events) {
  const lines = [
    'BEGIN:VCALENDAR','VERSION:2.0',
    'PRODID:-//Propagation Watch//EN',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH',
  ];
  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.id}@propagation-watch`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(ev.start)}`,
      `DTEND:${fmt(ev.end)}`,
      `SUMMARY:${esc(ev.title)}`,
      `DESCRIPTION:${esc(ev.description ?? '')}`,
      `LOCATION:${esc(ev.location ?? '')}`,
      'BEGIN:VALARM','TRIGGER:-PT15M','ACTION:DISPLAY',
      `DESCRIPTION:${esc(ev.title)} — 15 min`,
      'END:VALARM','END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(icsStr, filename = 'propagation-watch.ics') {
  const blob = new Blob([icsStr], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build an ICS event from a watch + window. */
export function watchWindowToICS(watch, window) {
  const end = new Date(window.time.getTime() + 60 * 60 * 1000); // 1h default duration
  return generateICS([{
    id:          `${watch.id}-${window.time.getTime()}`,
    start:       window.time,
    end,
    title:       `${watch.label} — ${watch.band} ${watch.mode}`,
    description: `Reliability: ${Math.round(window.reliability * 100)}%\nBearing: ${watch.bearingShort}°\nDistance: ${watch.distanceKm} km\nSource: Propagation Watch`,
    location:    `${watch.name} (${watch.grid})`,
  }]);
}

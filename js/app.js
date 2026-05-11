/* Propagation Watch — Main Application
 * All logic: state, calculations, rendering, API
 * No ES modules, no imports — loaded as plain script
 */

/* ═══════════════════════════════════════════════════════
   PROPAGATION WATCH — Single-file app
   All logic here, no ES modules, no import/export
   ═══════════════════════════════════════════════════════ */

// ── State ──
const S = {
  user: JSON.parse(localStorage.getItem('pw_user') || '{}'),
  prop: JSON.parse(localStorage.getItem('pw_noaa') || '{"kp":null,"sfi":null,"gScale":0,"fetchedAt":null}'),
  watches: JSON.parse(localStorage.getItem('pw_watches') || '[]'),
};

// Defaults
S.user.licenseClass = S.user.licenseClass || 'A';
S.user.txPowerW     = S.user.txPowerW     || 100;

// Migrate old watch schema (from ES module version)
S.watches = S.watches.map(w => ({
  ...w,
  pw:   null,  // always use global S.user.txPowerW
  dist: typeof w.dist === 'string' ? parseFloat(w.dist.replace(/[^0-9.]/g,'')) || 0 : (w.dist || w.distanceKm || 0),
  az:   w.az || w.bearingShort || 0,
  azlp: w.azlp || w.bearingLong || 0,
  lat:  w.lat || 0,
  lon:  w.lon || 0,
})).filter(w => w.lat && w.lon && w.dist > 0);
S.user.qrpMode      = S.user.qrpMode      || false;
S.user.theme        = S.user.theme        || 'dark';
S.user.lang         = S.user.lang         || 'en';
S.user.configured   = S.user.configured   || false;
S.user.timezone     = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Brussels';
// Recover lat/lon from grid if missing
if (!S.user.lat && S.user.grid) {
  try { const ll = gridToLL(S.user.grid); S.user.lat = ll.lat; S.user.lon = ll.lon; } catch(e) {}
}

// ── Save helpers ──
function saveUser()    { try { localStorage.setItem('pw_user',    JSON.stringify(S.user));    } catch(e) {} }
function saveWatches() { try { localStorage.setItem('pw_watches', JSON.stringify(S.watches)); } catch(e) {} }
function saveNoaa()    { try { localStorage.setItem('pw_noaa',    JSON.stringify(S.prop));    } catch(e) {} }

// ── Toast ──
function toast(msg, type) {
  type = type || 'info';
  const cls = {ok:'toast-ok',warn:'toast-warn',err:'toast-err',info:'toast-info'}[type] || 'toast-info';
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Navigation ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  ['home','setup','settings'].forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.classList.toggle('active', t === id || (id === 'detail' && t === 'home'));
  });
}
function goHome()     { showScreen('home');     renderHome(); }
function goSettings() {
  showScreen('settings');
  syncSettingsUI();
  // Translate settings screen
  const els = {
    'settings-title': T('settings'),
    'sh-data':  '📡 '+T('dataSources').replace('📡 ',''),
    'sh-power': '⚡ '+T('powerLicense'),
    'sh-loc':   '📍 '+T('locationLbl'),
    'sh-disp':  '🎨 '+T('display'),
  };
  Object.entries(els).forEach(([id,txt])=>{const e=document.getElementById(id);if(e)e.textContent=txt;});
}
function goNewWatch() { showScreen('setup');    renderSetup(); }

// ── NOAA ──
async function fetchNoaa() {
  const BASE = 'https://services.swpc.noaa.gov/json';
  const TOUT = 10000;
  let ok = false;

  function tFetch(url) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('Timeout')), TOUT);
      fetch(url).then(r => { clearTimeout(t); res(r); }).catch(e => { clearTimeout(t); rej(e); });
    });
  }

  try {
    const r = await tFetch(BASE + '/planetary_k_index_1m.json');
    const d = await r.json();
    for (let i = d.length-1; i >= 0; i--) {
      const v = parseFloat(d[i].Kp || d[i].kp);
      if (!isNaN(v)) { S.prop.kp = v; ok = true; break; }
    }
  } catch(e) { console.warn('Kp fetch:', e.message); }

  try {
    const r = await tFetch(BASE + '/solar-cycle/observed-solar-cycle-indices.json');
    const d = await r.json();
    for (let i = d.length-1; i >= 0; i--) {
      const row = d[i];
      // Try all known field names for SFI
      const v = parseFloat(row['f10.7'] || row['observed-flux'] || row.flux || row.sfi || row.f10 || row['solar-flux']);
      if (!isNaN(v) && v > 50 && v < 500) { S.prop.sfi = v; ok = true; break; }
      // Last resort: scan all numeric fields in valid range
      for (const k of Object.keys(row)) {
        const vk = parseFloat(row[k]);
        if (!isNaN(vk) && vk > 50 && vk < 500) { S.prop.sfi = vk; ok = true; break; }
      }
      if (ok) break;
    }
  } catch(e) { console.warn('SFI fetch:', e.message); }

  try {
    const r = await tFetch(BASE + '/noaa-scales.json');
    const d = await r.json();
    S.prop.gScale = parseInt(d?.G?.Scale || 0);
  } catch(e) {
    // Derive G-scale from Kp if endpoint fails (CORS issue on some networks)
    if (S.prop.kp != null) {
      const kp = S.prop.kp;
      S.prop.gScale = kp >= 7 ? 4 : kp >= 6 ? 3 : kp >= 5 ? 2 : kp >= 4 ? 1 : 0;
      ok = true;
    }
    console.warn('Scales fetch failed, derived from Kp:', S.prop.gScale);
  }

  if (ok) {
    S.prop.fetchedAt = new Date().toISOString();
    if (S.prop.kp != null) checkStormRecovery(S.prop.kp);
    saveNoaa();
  }
  updateStatusBar();
  renderWatchList();
  renderTimeline();
  return ok;
}

async function doRefresh() { toast('Refreshing…','info'); await fetchNoaa(); }

// ── Status bar ──
function ageMin(iso) {
  if (!iso) return 9999;
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}
function updateStatusBar() {
  const kp  = S.prop.kp;
  const sfi = S.prop.sfi;
  const age = ageMin(S.prop.fetchedAt);
  const kpEl = document.getElementById('sb-kp');
  const sfiEl = document.getElementById('sb-sfi');
  const gEl   = document.getElementById('sb-g');
  const ageEl = document.getElementById('sb-age');
  if (!kpEl) return;
  kpEl.textContent = kp != null ? kp.toFixed(1) : '—';
  kpEl.className = 'val ' + (!kp||kp<3?'kp-ok':kp<5?'kp-warn':'kp-bad');
  sfiEl.textContent = sfi ?? '—';
  gEl.textContent = 'G' + (S.prop.gScale || 0);
  ageEl.textContent = age < 999 ? age + 'm ago' : 'no data';
  ageEl.style.color = age > 120 ? 'var(--bad-tx)' : age > 30 ? 'var(--warn-tx)' : 'var(--tx3)';
}

// ── Propagation calculations ──
const BAND_FREQ = {'160m':1.85,'80m':3.65,'40m':7.1,'30m':10.12,'20m':14.2,
                   '17m':18.1,'15m':21.2,'12m':24.9,'10m':28.5,'6m':50.1};
const KP_MAT = {
  '160m':[1,.9,.75,.5,.25,.1,0,0,0,0],'80m':[1,.9,.8,.6,.35,.15,.05,0,0,0],
  '40m':[1,.95,.85,.7,.5,.25,.1,.05,0,0],'30m':[1,.98,.9,.8,.6,.35,.15,.05,0,0],
  '20m':[1,1,.95,.85,.65,.4,.2,.05,0,0],'17m':[1,1,.97,.88,.7,.45,.25,.1,.02,0],
  '15m':[1,1,.98,.9,.75,.5,.3,.12,.03,0],'10m':[1,1,1,.95,.82,.6,.38,.18,.06,.01],
  '6m':[1,1,1,.97,.88,.7,.5,.3,.12,.04]
};
const D_LAYER = {'160m':{max:.95,half:6},'80m':{max:.9,half:10},'40m':{max:.82,half:18},'30m':{max:.35,half:35}};
const MODE_MARGIN = {FT8:20,FT4:18,JT65:22,CW:13,SSB:10,AM:6,MSK144:12};

function sunElev(lat, lon, date) {
  if (!window.SunCalc || lat==null || isNaN(lat)) return -90;
  try {
    const p = SunCalc.getPosition(date || new Date(), lat, lon);
    const d = p.altitude * 180 / Math.PI;
    return isNaN(d) ? -90 : d;
  } catch(e) { return -90; }
}

function calcMUF(sfi, distKm) {
  const foF2 = 2 + (sfi/150)*8;
  return foF2 * (2.5 + Math.min(2.5, distKm/3000));
}
function dlayer(band, elev) {
  if (elev <= 0) return 1;
  const cfg = D_LAYER[band];
  if (!cfg) return 1;
  const t = elev/cfg.half;
  return Math.max(0.03, 1 - cfg.max*(t*t)/(1+t*t));
}
function kpDeg(band, kp) {
  const row = KP_MAT[band] || KP_MAT['20m'];
  const lo = Math.min(9, Math.max(0, Math.floor(kp||0)));
  const hi = Math.min(9, lo+1);
  const fr = (kp||0) - Math.floor(kp||0);
  return row[lo]*(1-fr) + row[hi]*fr;
}
function f2grad(txEl, rxEl, midEl, distKm, band) {
  const F2B = ['20m','17m','15m','12m','10m','6m'];
  if (!F2B.includes(band)) return 1;
  const dw = Math.min(1, Math.max(0, (distKm-1500)/6000));
  if (dw < .05) return 1;
  const norm = e => Math.max(-1,Math.min(1,e/20));
  const grad = Math.abs(norm(txEl)-norm(rxEl))/2;
  const mid  = Math.max(0, norm(midEl||0));
  const floor = .5 + .2*(1-dw);
  return Math.max(floor, Math.min(1, floor + (1-floor)*grad - mid*mid*.15*dw));
}
function multiHop(band, distKm) {
  const lim = {'160m':4000,'80m':6000};
  const m = lim[band];
  if (!m || distKm <= m) return 1;
  return Math.max(.05, Math.exp(-.18*(distKm-m)/2000));
}
function pwrFactor(pw, mode) {
  const db  = 10*Math.log10((pw||100)/100);
  const mg  = MODE_MARGIN[mode] || 10;
  return Math.max(0.15, Math.min(1.2, 1+db/mg));
}

function calcRel(band, mode, distKm, txLat, txLon, rxLat, rxLon, pw, atDate) {
  const at   = atDate || new Date();
  const kp   = S.prop.kp  || 0;
  const sfi  = S.prop.sfi || 70;
  const freq = BAND_FREQ[band] || 14.2;
  const muf  = calcMUF(sfi, distKm);
  if (freq > muf*1.10) return {rel:0, base:0, muf};
  if (freq > muf*0.95) return {rel:.15, base:.15, muf};

  const txEl  = sunElev(txLat, txLon, at);
  const rxEl  = sunElev(rxLat, rxLon, at);
  const midEl = sunElev((txLat+rxLat)/2, (txLon+rxLon)/2, at);

  let b = Math.max(.05, Math.min(1, sfi/150));
  b *= kpDeg(band, kp);
  b *= dlayer(band, txEl);
  b *= dlayer(band, rxEl);
  b *= multiHop(band, distKm);
  b *= f2grad(txEl, rxEl, midEl, distKm, band);
  b  = Math.max(0, Math.min(.99, b));

  const pf  = pwrFactor(pw||100, mode);
  const rel = Math.max(0, Math.min(.99, b*pf));
  return {rel, base:b, muf, txEl, rxEl};
}

// ── Watch evaluation ──
function evalWatch(w) {
  const u = S.user;
  if (!u.lat || !w.lat) { w.rel=0; w.status='WAITING'; w.nextWin=null; return; }
  const r = calcRel(w.band, w.mode, w.dist, u.lat, u.lon, w.lat, w.lon, w.pw||u.txPowerW);
  w.rel    = r.rel;
  w.base   = r.base;
  w.status = relToStatus(r.rel, (w.threshold||60)/100);
  w.nextWin = findNext(w);
}
function relToStatus(r, thr) {
  if (r >= thr)         return 'GOOD';
  if (r >= thr * .75)   return 'SOON';
  if (r >= .10)         return 'WAIT';
  return 'POOR';
}
function findNext(w) {
  const u   = S.user;
  const thr = (w.threshold||60)/100;
  const STEP = 15*60*1000;
  let best = null, first = null;
  for (let i=1; i<=96; i++) {
    const t = new Date(Date.now() + i*STEP);
    const r = calcRel(w.band, w.mode, w.dist, u.lat, u.lon, w.lat, w.lon, w.pw||u.txPowerW, t);
    if (!best || r.rel > best.rel) best = {time:t, rel:r.rel};
    if (r.rel >= thr && !first) first = {time:t, rel:r.rel};
  }
  if (first) return {...first, isWindow:true};
  return best ? {...best, isWindow:false} : null;
}
function evalAll() { S.watches.forEach(evalWatch); matchSpotsToWatches(); renderWatchList(); renderTimeline(); }

// ── Time formatting ──
function fmtUTC(d) { return d.toUTCString().slice(17,22)+' UTC'; }
function fmtLocal(d) {
  try { return d.toLocaleTimeString('en-GB',{timeZone:S.user.timezone,hour:'2-digit',minute:'2-digit'}); }
  catch(e){ return ''; }
}
function fmtBoth(d) {
  const u = fmtUTC(d), l = fmtLocal(d);
  return l && l !== u.slice(0,5) ? u + ' / ' + l + ' local' : u;
}

// ── Distance & bearing ──
function haversine(la1,lo1,la2,lo2) {
  const R=6371, d2r=Math.PI/180;
  const dLa=(la2-la1)*d2r, dLo=(lo2-lo1)*d2r;
  const a=Math.sin(dLa/2)**2+Math.cos(la1*d2r)*Math.cos(la2*d2r)*Math.sin(dLo/2)**2;
  return Math.round(R*2*Math.asin(Math.sqrt(a)));
}
function bearing(la1,lo1,la2,lo2) {
  const dLo=(lo2-lo1)*Math.PI/180;
  const y=Math.sin(dLo)*Math.cos(la2*Math.PI/180);
  const x=Math.cos(la1*Math.PI/180)*Math.sin(la2*Math.PI/180)-Math.sin(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.cos(dLo);
  return Math.round(((Math.atan2(y,x)/Math.PI*180)+360)%360);
}
function gridToLL(g) {
  g = g.toUpperCase();
  let lo=(g.charCodeAt(0)-65)*20-180, la=(g.charCodeAt(1)-65)*10-90;
  if(g.length>=4){lo+=parseInt(g[2])*2;la+=parseInt(g[3]);}
  if(g.length>=6){lo+=(g.charCodeAt(4)-65)*(2/24);la+=(g.charCodeAt(5)-65)*(1/24);}
  lo+=g.length>=6?1/24:g.length>=4?1:10;
  la+=g.length>=6?.5/24:g.length>=4?.5:5;
  return{lat:Math.round(la*1000)/1000, lon:Math.round(lo*1000)/1000};
}

// ── Render home ──
function renderHome() {
  updateStatusBar();
  // Greyline countdown
  const glWrap = document.getElementById('gl-countdown-wrap');
  if (glWrap) glWrap.innerHTML = renderGreylineCountdown();
  // Sporadic-E card
  const esWrap = document.getElementById('es-card-wrap');
  if (esWrap) esWrap.innerHTML = renderEsCard();
  renderWatchList();
  renderTimeline();
  renderDXPanel();
  document.getElementById('tl-now').textContent = new Date().toUTCString().slice(17,22)+' UTC';
}

// ── Watch list ──
const statusColor = {GOOD:'var(--good)',SOON:'var(--good)',WAIT:'var(--warn)',POOR:'var(--bad)',undefined:'var(--bdr)'};
function statusLabel(s) { return {GOOD:T('good'),SOON:T('soon'),WAIT:T('wait'),POOR:T('poor')}[s]||'—'; }

function renderWatchList() {
  const el = document.getElementById('watch-list');
  if (!el) return;
  if (!S.watches.length) {
    el.innerHTML = `<div class="empty">${T('noWatches')}<br><br><button class="btn btn-pri" style="max-width:200px;margin:0 auto" onclick="goNewWatch()">${T('addFirst')}</button></div>`;
    return;
  }
  // Warn if location not set
  if (!S.user.lat) {
    el.innerHTML = `<div class="empty" style="color:var(--warn-tx)">⚠ ${T('location')}<br><small style="color:var(--tx3)">${T('locationHint')}</small></div>`;
    return;
  }
  const sorted = [...S.watches].sort((a,b) => {
    const o={GOOD:0,SOON:1,WAIT:2,POOR:3};
    return (o[a.status]||4)-(o[b.status]||4);
  });
  el.innerHTML = sorted.map(w => watchCard(w)).join('');
}

function watchCard(w) {
  const col = statusColor[w.status] || 'var(--bdr)';
  const pct = Math.round((w.rel||0)*100);
  const pw  = w.pw || S.user.txPowerW || 100;
  const lbl = statusLabel(w.status);
  let sub = '';
  if (w.nextWin) {
    const t = new Date(w.nextWin.time);
    const r = isNaN(w.nextWin.rel) ? '?' : Math.round(w.nextWin.rel*100);
    const u = fmtUTC(t), l = fmtLocal(t);
    const ts = l && l!==u.slice(0,5) ? u+' / '+l : u;
    sub = w.status==='GOOD'
      ? T('until')+ts
      : T('next')+' <b>'+ts+'</b> · '+r+'%';
  }
  return `<div class="card wcard" style="border-left-color:${col}" onclick="openWatch('${w.id}')">
    <div class="wcard-top">
      <div>
        <div class="wcard-name">${w.label}<span class="pwr-badge">${pw}W</span></div>
        <div class="wcard-meta">${w.band} · ${w.mode} · ${(w.dist||0).toLocaleString()} km · ${w.az||0}°</div>
      </div>
      <div class="wcard-actions">
        <button class="btn-ico" onclick="event.stopPropagation();alarmWatch('${w.id}')" title="Alarm">⏰</button>
        <button class="btn-ico btn-del" onclick="event.stopPropagation();deleteWatch('${w.id}')" title="Delete">🗑</button>
      </div>
    </div>
    <div class="wcard-bottom">
      <div>
        <div class="wcard-state" style="color:${col}">${lbl}</div>
        <div class="wcard-sub">${sub}</div>
      </div>
      <div class="wcard-pct" style="color:${col}">${pct}%</div>
    </div>
  </div>`;
}

// ── Watch detail ──
function openWatch(id) {
  const w = S.watches.find(x => x.id===id);
  if (!w) return;
  document.getElementById('det-title').textContent = w.label+' — '+w.band+' '+w.mode;
  const pct   = Math.round((w.rel||0)*100);
  const bpct  = Math.round((w.base||0)*100);
  const pw    = w.pw || S.user.txPowerW || 100;
  const col   = statusColor[w.status] || 'var(--bdr)';
  const diff  = bpct - pct;
  const nw    = w.nextWin ? {time:new Date(w.nextWin.time), rel:w.nextWin.rel} : null;

  let nwHtml = '';
  if (nw) {
    const nwPct = isNaN(nw.rel) ? 0 : Math.round(nw.rel*100);
    const nwCol = nwPct>=60?'var(--good)':nwPct>=30?'var(--warn)':'var(--bad)';
    const nwBg  = nwPct>=60?'var(--good-bg)':nwPct>=30?'var(--warn-bg)':'var(--bad-bg)';
    nwHtml = `<div style="background:${nwBg};border:1px solid ${nwCol};border-radius:8px;padding:14px;margin:12px 0">
      <div style="font-size:11px;color:var(--tx2);margin-bottom:4px">${w.status==='GOOD'?'Window ends ~':'Best window'}</div>
      <div style="font-size:26px;font-weight:700;font-family:var(--mono);color:${nwCol}">${fmtUTC(nw.time)}</div>
      <div style="font-size:12px;font-family:var(--mono);color:var(--tx2);margin-top:2px">${fmtLocal(nw.time)} local · ${nwPct}% reliability</div>
      <button class="btn btn-sec" style="margin-top:10px" onclick="exportICS('${id}')">📅 Export to calendar</button>
    </div>`;
  }

  document.getElementById('det-body').innerHTML = `
    <div style="font-size:52px;font-weight:700;font-family:var(--mono);color:${col}">${pct}%</div>
    <div style="font-size:12px;color:var(--tx2);margin-top:4px">path reliability now · at ${pw}W · ${w.mode}</div>
    ${pw<100&&diff>0?`<div style="font-size:12px;color:var(--tx2);background:var(--bg3);border-radius:6px;padding:8px 12px;margin-top:8px">At 100W: ${bpct}% — ${diff}pt difference</div>`:''}
    ${nwHtml}
    <div class="card" style="margin-top:0">
      <div class="info-table">
        <div class="info-row"><span class="info-key">SFI</span><span class="info-val">${S.prop.sfi??'—'}</span></div>
        <div class="info-row"><span class="info-key">Kp</span><span class="info-val">${S.prop.kp!=null?S.prop.kp.toFixed(1):'—'}</span></div>
        <div class="info-row"><span class="info-key">Power</span><span class="info-val">${pw}W</span></div>
        <div class="info-row"><span class="info-key">Distance</span><span class="info-val">${(w.dist||0).toLocaleString()} km</span></div>
        <div class="info-row"><span class="info-key">Bearing</span><span class="info-val">${w.az||0}° / ${w.azlp||0}° LP</span></div>
        <div class="info-row"><span class="info-key">Grid</span><span class="info-val">${w.grid||'—'}</span></div>
      </div>
    </div>
    ${renderWatchSpots(w)}
    <div class="det-btn-row">
      <button class="btn btn-pri" onclick="alarmWatch('${id}')">⏰ Set alarm</button>
      <button class="btn btn-sec" onclick="exportICS('${id}')">📅 Export .ics</button>
    </div>
    <button class="btn btn-sec" style="margin-top:8px" onclick="openMap('${id}')">🗺 Show path on map</button>`;
  showScreen('detail');
}

// ── Delete watch ──
function deleteWatch(id) {
  S.watches = S.watches.filter(w => w.id !== id);
  saveWatches();
  renderWatchList();
  toast('Watch deleted','info');
}

// ── Alarm ──
function alarmWatch(id) {
  const w = S.watches.find(x => x.id===id);
  if (!w) return;
  const t = w.nextWin ? fmtBoth(new Date(w.nextWin.time)) : 'when window opens';
  toast('Alarm set — '+w.label+' — '+t,'ok');
}

// ── ICS export ──
function exportICS(id) {
  const w = S.watches.find(x => x.id===id);
  if (!w || !w.nextWin) { toast('No upcoming window','warn'); return; }
  const start = new Date(w.nextWin.time);
  const end   = new Date(start.getTime()+60*60*1000);
  const tz    = S.user.timezone || 'Europe/Brussels';
  function fmtLocal2(d) {
    const p = new Intl.DateTimeFormat('en',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(d);
    const m={};p.forEach(x=>m[x.type]=x.value);
    return `${m.year}${m.month}${m.day}T${m.hour}${m.minute}${m.second}`;
  }
  function fmtZ(d){return d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';}
  const ics=[
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//PropagationWatch//ON3VZ//EN',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${id}-${start.getTime()}@pw`,
    `DTSTAMP:${fmtZ(new Date())}`,
    `DTSTART;TZID=${tz}:${fmtLocal2(start)}`,
    `DTEND;TZID=${tz}:${fmtLocal2(end)}`,
    `SUMMARY:${w.label} — ${w.band} ${w.mode} — ${fmtUTC(start)} / ${fmtLocal(start)} local`,
    `DESCRIPTION:Reliability: ${Math.round(w.nextWin.rel*100)}%\\nBearing: ${w.az}°\\nDistance: ${w.dist} km`,
    'BEGIN:VALARM','TRIGGER:-PT15M','ACTION:DISPLAY',`DESCRIPTION:${w.label} in 15 min`,'END:VALARM',
    'END:VEVENT','END:VCALENDAR'
  ].join('\r\n');
  const blob=new Blob([ics],{type:'text/calendar'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=w.label+'.ics';a.click();
  toast('Calendar file downloaded','ok');
}

// ── Timeline ──
function renderTimeline() {
  const svg  = document.getElementById('timeline-svg');
  const wrap = document.getElementById('timeline-scroll');
  if (!svg) return;
  const W    = Math.max(600, wrap.clientWidth || 600);
  const watches = S.watches;
  const rows = Math.max(1, watches.length);
  const RH=18, GAP=3, LW=40, AH=14, H=rows*(RH+GAP)+AH+8;
  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  svg.setAttribute('width', W);
  svg.setAttribute('height',H);
  const now   = new Date();
  const start = new Date(now); start.setMinutes(0,0,0);
  const STEP  = 15*60*1000, BLOCKS=96;
  const xs    = (W-LW)/(BLOCKS*STEP);
  const xnow  = LW+(now-start)*xs;
  let html    = `<rect width="${W}" height="${H}" fill="var(--bg1)" rx="3"/>`;

  // Greyline
  if (S.user.lat) {
    for (let i=0;i<BLOCKS;i++) {
      const t=new Date(start.getTime()+i*STEP);
      const e=sunElev(S.user.lat,S.user.lon,t);
      if(e>=-6&&e<=6){const x=LW+i*STEP*xs;const bw=STEP*xs;
        html+=`<rect x="${x}" y="0" width="${bw}" height="${H-AH}" fill="#BA7517" opacity=".12"/>`;}
    }
  }

  // Hour marks
  for(let h=0;h<=24;h+=3){
    const x=LW+h*3600000*xs;
    const utcH=(start.getUTCHours()+h)%24;
    html+=`<line x1="${x}" y1="0" x2="${x}" y2="${H-AH}" stroke="var(--bdr2)" stroke-width=".5"/>`;
    html+=`<text x="${x}" y="${H-1}" fill="var(--tx3)" font-size="9" font-family="monospace" text-anchor="middle">${String(utcH).padStart(2,'0')}h</text>`;
  }

  // Watch rows
  watches.forEach((w,i)=>{
    const y=i*(RH+GAP);
    html+=`<text x="2" y="${y+RH-5}" fill="var(--tx3)" font-size="9" font-family="monospace">${w.band}</text>`;
    for(let bi=0;bi<BLOCKS;bi++){
      const t=new Date(start.getTime()+bi*STEP);
      const r=calcRel(w.band,w.mode,w.dist,S.user.lat,S.user.lon,w.lat,w.lon,w.pw||S.user.txPowerW,t);
      const pct=r.rel;
      const c=pct>=.7?'#1D9E75':pct>=.4?'#EF9F27':pct>=.1?'#E24B4A':'#313754';
      const bx=LW+bi*STEP*xs, bw=Math.max(1,STEP*xs-.5);
      html+=`<rect x="${bx}" y="${y+1}" width="${bw}" height="${RH-2}" fill="${c}" opacity=".75" rx="1"/>`;
    }
    html+=`<text x="${LW+4}" y="${y+13}" fill="var(--tx1)" font-size="8" font-family="monospace" opacity=".6">${w.label}</text>`;
  });

  // Now line
  html+=`<line x1="${xnow}" y1="0" x2="${xnow}" y2="${H-AH}" stroke="var(--tx1)" stroke-width="1.5" stroke-dasharray="3,3" opacity=".5"/>`;
  html+=`<text x="${Math.min(xnow+3,W-24)}" y="10" fill="var(--tx3)" font-size="8" font-family="monospace">now</text>`;
  svg.innerHTML=html;
}

// ── Setup wizard ──
const SUGG=[
  {entity:'W',   name:'North America',   grid:'FN41',lat:42.4,  lon:-71.1},
  {entity:'SM',  name:'Scandinavia',     grid:'JP90',lat:60.2,  lon:18.0 },
  {entity:'EA',  name:'South Europe',    grid:'IM99',lat:40.4,  lon:-3.7 },
  {entity:'JA',  name:'Japan',           grid:'PM96',lat:36.2,  lon:138.3},
  {entity:'VK',  name:'Australia',       grid:'QF22',lat:-33.9, lon:151.2},
  {entity:'ZL',  name:'New Zealand',     grid:'RF70',lat:-36.9, lon:174.8},
  {entity:'CU',  name:'Azores',          grid:'HM67',lat:37.7,  lon:-25.7},
  {entity:'PY',  name:'Brazil',          grid:'GG66',lat:-15.8, lon:-47.9},
  {entity:'VP8', name:'Falkland Islands',grid:'GD17',lat:-51.7, lon:-57.9},
  {entity:'ZS',  name:'South Africa',    grid:'KG33',lat:-25.8, lon:28.2 },
];
let _selTarget = null, _setupStep = 1;

function renderSetup() {
  _setupStep = S.user.configured ? 2 : 1;
  _selTarget = null;
  renderSetupStep();
}

function renderSetupStep() {
  const el = document.getElementById('setup-body');
  if (!el) return;
  if (_setupStep === 1) renderStep1(el);
  else renderStep2(el);
}

function renderStep1(el) {
  el.innerHTML = `
    <div class="prog-bar"><div class="prog-dot active"></div><div class="prog-dot"></div><div class="prog-dot"></div></div>
    <div class="setup-title">Your location</div>
    <div class="setup-sub">Enter your callsign or grid square. Used for D-layer, greyline and path calculations.</div>
    <div class="field">
      <label>Callsign or grid square</label>
      <input id="s-loc" placeholder="e.g. ON3VZ or JO20ev" autocapitalize="characters"
             value="${S.user.callsign||S.user.grid||''}" oninput="hintLoc(this.value)"/>
      <div class="field-hint" id="loc-hint">${S.user.grid?'Current: '+S.user.grid:''}</div>
    </div>
    <button class="btn btn-pri" onclick="saveLoc()">Continue →</button>
    ${S.user.configured?'<button class="setup-skip" onclick="goHome()">Cancel</button>':''}`;
}

function hintLoc(v) {
  const h = document.getElementById('loc-hint');
  if (!v) { h.textContent=''; return; }
  if (/^[A-Ra-r]{2}\d{2}([a-xA-X]{2})?$/.test(v)) {
    try { const ll=gridToLL(v); h.textContent='Grid '+v.toUpperCase()+' → '+ll.lat.toFixed(2)+'°N '+ll.lon.toFixed(2)+'°E'; }
    catch(e){ h.textContent=''; }
  } else { h.textContent = v.length>1 ? 'Callsign recognised — grid will be estimated from prefix' : ''; }
}

function saveLoc() {
  const val = (document.getElementById('s-loc')?.value||'').trim().toUpperCase();
  if (!val) { toast('Enter a callsign or grid square','warn'); return; }
  if (/^[A-Ra-r]{2}\d{2}([a-xA-X]{2})?$/.test(val)) {
    try {
      const ll = gridToLL(val);
      S.user.grid = val; S.user.lat = ll.lat; S.user.lon = ll.lon;
    } catch(e) { toast('Invalid grid square','err'); return; }
  } else {
    // Prefix lookup - use centroid estimates
    const prefixMap = {
      'ON':{lat:50.5,lon:4.5,grid:'JO20'},'PA':{lat:52.1,lon:5.3,grid:'JO22'},
      'DL':{lat:51.2,lon:10.5,grid:'JO51'},'F':{lat:46.0,lon:2.4,grid:'JN03'},
      'G':{lat:51.5,lon:-.1,grid:'IO91'},'EA':{lat:40.4,lon:-3.7,grid:'IM99'},
    };
    const pfx = Object.keys(prefixMap).sort((a,b)=>b.length-a.length)
                      .find(p=>val.startsWith(p));
    if (pfx) {
      const d=prefixMap[pfx];
      S.user.callsign=val; S.user.lat=d.lat; S.user.lon=d.lon; S.user.grid=d.grid;
    } else {
      S.user.callsign=val;
      if (!S.user.lat) { toast('Prefix not recognised — please enter a grid square','warn'); return; }
    }
  }
  saveUser();
  _setupStep=2; renderSetupStep();
}

function renderStep2(el) {
  el.innerHTML = `
    <div class="prog-bar"><div class="prog-dot done"></div><div class="prog-dot active"></div><div class="prog-dot"></div></div>
    <div class="setup-title">Target station</div>
    <div class="setup-sub">Choose a region or enter a callsign prefix.</div>
    <div class="sugg-grid" id="sugg-grid"></div>
    <div class="field">
      <label>Or enter manually</label>
      <input id="s-dx" placeholder="e.g. VP8, JA1ZZZ" autocapitalize="characters" oninput="hintDX(this.value)"/>
      <div class="field-hint" id="dx-hint"></div>
    </div>
    <div class="field-grid">
      <div class="field"><label>Band</label>
        <select id="s-band">${['40m','20m','17m','15m','10m','80m','30m','6m'].map(b=>`<option>${b}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Mode</label>
        <select id="s-mode">${['FT8','CW','SSB','FT4','MSK144'].map(m=>`<option>${m}</option>`).join('')}</select>
      </div>
    </div>
    <div class="field">
      <label>Alert at reliability ≥ <span id="thr-lbl">60%</span></label>
      <input type="range" min="10" max="90" step="5" value="60" style="width:100%"
             oninput="document.getElementById('thr-lbl').textContent=this.value+'%'"/>
    </div>
    <button class="btn btn-pri" onclick="createWatch2()">Create watch →</button>
    <button class="setup-skip" onclick="goHome()">Cancel</button>`;

  // Suggestion buttons
  const grid = document.getElementById('sugg-grid');
  SUGG.forEach(s => {
    const btn = document.createElement('button');
    btn.className='sugg-btn';
    const sDist = S.user.lat ? haversine(S.user.lat,S.user.lon,s.lat,s.lon) : null;
    const sAz   = S.user.lat ? bearing(S.user.lat,S.user.lon,s.lat,s.lon) : null;
    const sInfo = sDist ? sDist.toLocaleString()+' km · '+sAz+'°' : s.grid;
    btn.innerHTML=`<div class="sugg-pre">${s.entity}</div><div class="sugg-name">${s.name}</div><div class="sugg-dist">${sInfo}</div>`;
    btn.onclick=()=>{
      _selTarget={...s, distNum:sDist, azNum:sAz};
      document.getElementById('s-dx').value=s.entity;
      document.getElementById('dx-hint').textContent=s.name+' · '+s.grid+(sDist?' · '+sDist.toLocaleString()+' km · '+sAz+'°':'');
      grid.querySelectorAll('.sugg-btn').forEach(b=>b.classList.remove('sel'));
      btn.classList.add('sel');
    };
    grid.appendChild(btn);
  });
}

const DXCC_SIMPLE = {
  'W':{name:'USA',lat:42.4,lon:-71.1,grid:'FN41'},'K':{name:'USA',lat:42.4,lon:-71.1,grid:'FN41'},
  'VE':{name:'Canada',lat:45.5,lon:-73.6,grid:'FN25'},'JA':{name:'Japan',lat:36.2,lon:138.3,grid:'PM96'},
  'VK':{name:'Australia',lat:-33.9,lon:151.2,grid:'QF22'},'ZL':{name:'New Zealand',lat:-36.9,lon:174.8,grid:'RF70'},
  'SM':{name:'Sweden',lat:59.3,lon:18.1,grid:'JP90'},'LA':{name:'Norway',lat:59.9,lon:10.7,grid:'JP53'},
  'OH':{name:'Finland',lat:60.2,lon:24.9,grid:'KP20'},'OZ':{name:'Denmark',lat:55.7,lon:12.6,grid:'JO65'},
  'EA':{name:'Spain',lat:40.4,lon:-3.7,grid:'IM99'},'I':{name:'Italy',lat:41.9,lon:12.5,grid:'JN61'},
  'SV':{name:'Greece',lat:38.0,lon:23.7,grid:'KM17'},'VP8':{name:'Falkland Islands',lat:-51.7,lon:-57.9,grid:'GD17'},
  'PY':{name:'Brazil',lat:-15.8,lon:-47.9,grid:'GG66'},'ZS':{name:'South Africa',lat:-25.8,lon:28.2,grid:'KG33'},
  'CU':{name:'Azores',lat:37.7,lon:-25.7,grid:'HM67'},'UA':{name:'Russia',lat:55.8,lon:37.6,grid:'KO85'},
  'BY':{name:'China',lat:39.9,lon:116.4,grid:'PL03'},'VK9':{name:'Christmas Island',lat:-10.5,lon:105.7,grid:'OI99'},
};
function lookupDX(val) {
  const v = val.toUpperCase();
  for (const len of [3,2,1]) {
    const pfx = v.slice(0,len);
    if (DXCC_SIMPLE[pfx]) return {...DXCC_SIMPLE[pfx], entity:pfx};
  }
  return null;
}

function hintDX(v) {
  const h = document.getElementById('dx-hint');
  _selTarget = null;
  if (!v) { h.textContent=''; return; }
  const e = lookupDX(v);
  if (e) {
    const u2 = S.user;
    const distN = u2.lat ? haversine(u2.lat,u2.lon,e.lat,e.lon) : null;
    const azN   = u2.lat ? bearing(u2.lat,u2.lon,e.lat,e.lon) : null;
    _selTarget = {...e, entity:v.toUpperCase(), distNum:distN, azNum:azN};
    h.textContent = e.name+' · '+e.grid+(distN?' · '+distN.toLocaleString()+' km · '+azN+'°':'');
  } else {
    h.textContent = v.length>1 ? 'Prefix not recognised' : '';
  }
}

function createWatch2() {
  const target = _selTarget;
  if (!target?.lat) { toast('Please select a target station first','warn'); return; }
  const band = document.getElementById('s-band')?.value||'20m';
  const mode = document.getElementById('s-mode')?.value||'FT8';
  const thr  = parseInt(document.querySelector('#setup-body input[type=range]')?.value||60);
  const u    = S.user;

  if (!u.lat) { toast('Please set your location first','err'); _setupStep=1; renderSetupStep(); return; }

  const dist  = target.distNum || haversine(u.lat,u.lon,target.lat,target.lon);
  const az    = target.azNum   || bearing(u.lat,u.lon,target.lat,target.lon);
  const azlp  = Math.round((az+180)%360);

  const w = {
    id:        crypto.randomUUID(),
    label:     target.entity,
    entity:    target.entity,
    name:      target.name||target.entity,
    lat:       target.lat,
    lon:       target.lon,
    grid:      target.grid||'',
    dist, az, azlp,
    band, mode,
    threshold: thr,
    pw:        null, // use global setting
    rel:0, base:0, status:'WAIT', nextWin:null,
  };
  evalWatch(w);
  S.watches.push(w);
  saveWatches();
  S.user.configured = true;
  saveUser();
  toast('Watch added: '+w.label+' '+band+' '+mode,'ok');
  goHome();
}

// ── Settings UI ──
function syncSettingsUI() {
  const lc = S.user.licenseClass||'A';
  const pw = S.user.txPowerW||100;
  ['A','B','C'].forEach(c=>{
    const b=document.getElementById('lic-'+c);
    if(b) b.classList.toggle('active',c===lc);
  });
  const maxMap={C:25,B:100,A:1500};
  const max=maxMap[lc]||1500;
  const sl=document.getElementById('pwr-slider');
  if(sl){sl.max=max;sl.value=Math.min(pw,max);}
  updatePwrDisplay(Math.min(pw,max),lc);
  const q=document.getElementById('qrp-tog');
  const th=document.getElementById('theme-tog');
  const lg=document.getElementById('lang-sel');
  const gi=document.getElementById('grid-inp');
  if(q)  q.checked  = !!S.user.qrpMode;
  if(th) th.checked = S.user.theme==='light';
  if(lg) lg.value   = S.user.lang||'en';
  if(gi) gi.value   = S.user.grid||'';
}

function updatePwrDisplay(v,lc) {
  v=parseInt(v)||100;
  lc=lc||S.user.licenseClass||'A';
  const maxMap={C:25,B:100,A:1500};
  const vEl=document.getElementById('pwr-val');
  const dbEl=document.getElementById('pwr-db');
  const hEl=document.getElementById('pwr-hint');
  const midEl=document.getElementById('pwr-mid');
  const maxEl=document.getElementById('pwr-max');
  if(vEl) vEl.textContent=v+'W';
  if(dbEl){const db=v===100?0:10*Math.log10(v/100);dbEl.textContent=v===100?'(ref 100W)':`(${db>0?'+':''}${db.toFixed(1)} dB vs 100W)`;}
  if(hEl){
    if(v<=5) hEl.textContent='QRP ≤5W — only strong paths viable.';
    else if(v<=25) hEl.textContent='Class C — significant penalty on marginal paths.';
    else if(v<100) hEl.textContent=v+'W — slight reduction vs 100W.';
    else if(v===100) hEl.textContent='Reference — no correction applied.';
    else hEl.textContent=v+'W — reliability slightly boosted.';
  }
  if(midEl) midEl.textContent=lc==='C'?'15W':lc==='B'?'50W':'400W';
  if(maxEl) maxEl.textContent=(maxMap[lc]||1500)+'W';
}

function setLicClass(cls) {
  const maxMap={C:25,B:100,A:1500};
  const max=maxMap[cls]||1500;
  S.user.licenseClass=cls;
  S.user.txPowerW=max;
  S.user.qrpMode=false;
  ['A','B','C'].forEach(c=>{
    const b=document.getElementById('lic-'+c);
    if(b) b.classList.toggle('active',c===cls);
  });
  const sl=document.getElementById('pwr-slider');
  const q=document.getElementById('qrp-tog');
  if(sl){sl.max=max;sl.value=max;}
  if(q) q.checked=false;
  updatePwrDisplay(max,cls);
  saveUser();
  evalAll();
  toast('Class '+cls+' — '+max+'W','ok');
}

function setPower(v) {
  v=parseInt(v)||100;
  S.user.txPowerW=v;
  if(v>5&&S.user.qrpMode){S.user.qrpMode=false;const q=document.getElementById('qrp-tog');if(q)q.checked=false;}
  updatePwrDisplay(v);
  saveUser();
  evalAll();
}

function setQRP(on) {
  const defMap={C:25,B:100,A:100};
  S.user.qrpMode=on;
  S.user.txPowerW=on?5:(defMap[S.user.licenseClass||'A']);
  const sl=document.getElementById('pwr-slider');
  if(sl){sl.value=S.user.txPowerW;}
  updatePwrDisplay(S.user.txPowerW);
  saveUser();
  evalAll();
}

function setTheme(light) {
  S.user.theme=light?'light':'dark';
  document.documentElement.setAttribute('data-theme',S.user.theme);
  saveUser();
}

const STRINGS = {
  en: {
    good:'● GOOD WINDOW',    soon:'◑ OPENING SOON', wait:'○ WAITING',  poor:'✕ CLOSED',
    next:'Next:',            until:'Until ~',        overview:'Overview', settings:'Settings',
    quickCheck:'Quick check',addWatch:'+ Watch',     noWatches:'No watches yet',
    addFirst:'+ Add watch',  location:'Location not set',
    locationHint:'Go to Settings → Location to enter your grid square',
    setAlarm:'Set alarm',    exportCal:'Export .ics',  alarmSet:'Alarm set — ',
    windowOpens:' — when window opens', saved:'saved', classSet:'Class',
    dataTitle:'Data Sources', powerTitle:'Power & License', locTitle:'Location',
    displayTitle:'Display',   licClass:'License class',     txPower:'Transmit power',
    qrpMode:'QRP mode (≤ 5W)', language:'Language', lightTheme:'Light theme',
    gridSquare:'Grid square', saveLocation:'Save location', testAPI:'🔌 Test API',
    noData:'No data — tap Test API',  cancel:'Cancel', createWatch:'Create watch →',
    targetStation:'Target station',   chooseTarget:'Choose a region or enter a callsign prefix.',
    yourLocation:'Your location',     locationSub:'Enter your callsign or grid square.',
    continue:'Continue →',            band:'Band', mode:'Mode', threshold:'Alert at reliability ≥',
    pathRel:'path reliability now',   bestWindow:'Best window', windowEnds:'Window ends ~',
    openNow:'Open now — until ~',     noWindow:'No window expected today',
    at100W:'At 100W:',                difference:'difference',
    setAlarmBtn:'⏰ Set alarm',        exportBtn:'📅 Export .ics',
  },
  nl: {
    good:'● GOED MOMENT',    soon:'◑ OPENT BINNENKORT', wait:'○ WACHTEN', poor:'✕ GESLOTEN',
    next:'Volgend:',         until:'Tot ~',              overview:'Overzicht', settings:'Instellingen',
    quickCheck:'Snelle check',addWatch:'+ Watch',        noWatches:'Nog geen watches',
    addFirst:'+ Toevoegen',  location:'Locatie niet ingesteld',
    locationHint:'Ga naar Instellingen → Locatie en vul je grid square in',
    setAlarm:'Alarm instellen', exportCal:'Exporteer .ics', alarmSet:'Alarm ingesteld — ',
    windowOpens:' — zodra venster opent', saved:'opgeslagen', classSet:'Klasse',
    dataTitle:'Gegevensbronnen', powerTitle:'Vermogen & Licentie', locTitle:'Locatie',
    displayTitle:'Weergave',  licClass:'Licentieklasse',  txPower:'Zendvermogen',
    qrpMode:'QRP-modus (≤ 5W)', language:'Taal', lightTheme:'Licht thema',
    gridSquare:'Grid square', saveLocation:'Locatie opslaan', testAPI:'🔌 Test API',
    noData:'Geen data — druk op Test API', cancel:'Annuleren', createWatch:'Watch aanmaken →',
    targetStation:'Doelstation',  chooseTarget:'Kies een regio of voer een callsign/prefix in.',
    yourLocation:'Uw locatie',    locationSub:'Voer uw callsign of grid square in.',
    continue:'Verder →',          band:'Band', mode:'Modus', threshold:'Alarm bij betrouwbaarheid ≥',
    pathRel:'padbetrouwbaarheid nu', bestWindow:'Beste venster', windowEnds:'Venster sluit ~',
    openNow:'Nu open — tot ~',    noWindow:'Geen venster verwacht vandaag',
    at100W:'Bij 100W:',           difference:'verschil',
    setAlarmBtn:'⏰ Alarm instellen', exportBtn:'📅 Exporteer .ics',
  }
};
function T(key) { return (STRINGS[S.user.lang||'en']||STRINGS.en)[key] || key; }

function applyLanguage() {
  // Nav tabs
  const tabs = document.querySelectorAll('.nav-tab');
  if (tabs[0]) { const t=tabs[0]; t.lastChild.textContent=' '+T('overview'); }
  if (tabs[2]) { const t=tabs[2]; t.lastChild.textContent=' '+T('settings'); }
  // Settings headings
  const headings = {
    'sh-data':   T('dataTitle'),
    'sh-power':  T('powerTitle'),
    'sh-loc':    T('locTitle'),
    'sh-display':T('displayTitle'),
    'sh-settings': T('settings'),
  };
  Object.entries(headings).forEach(([id,txt]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  });
  // Settings labels
  const labels = {
    'lbl-licclass': T('licClass'),
    'lbl-power':    T('txPower'),
    'lbl-qrp':      T('qrpMode'),
    'lbl-lang':     T('language'),
    'lbl-theme':    T('lightTheme'),
    'lbl-grid':     T('gridSquare'),
    'btn-saveloc':  T('saveLocation'),
  };
  Object.entries(labels).forEach(([id,txt]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  });
  // Quick check and + Watch buttons
  const qc = document.getElementById('btn-quickcheck');
  const aw = document.getElementById('btn-addwatch');
  if (qc) qc.textContent = T('quickCheck');
  if (aw) aw.textContent = T('addWatch');
}

function saveLang(lang) {
  S.user.lang = lang;
  saveUser();
  applyLanguage();
  renderWatchList();
  toast(lang==='nl'?'Taal: Nederlands':'Language: English','info');
}

function saveLocation() {
  const val=(document.getElementById('grid-inp')?.value||'').trim().toUpperCase();
  if(!val){toast('Enter a grid square (e.g. JO20ev)','warn');return;}
  try{
    const ll=gridToLL(val);
    S.user.grid=val;S.user.lat=ll.lat;S.user.lon=ll.lon;
    saveUser();
    toast('Location saved — '+val,'ok');
    evalAll();
  }catch(e){toast('Invalid grid square','err');}
}

// ── API test ──
const apiSt={kp:{ok:null,val:null,err:null,ms:null},sfi:{ok:null,val:null,err:null,ms:null},scales:{ok:null,val:null,err:null,ms:null}};
const apiURLs={
  kp:'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
  sfi:'https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json',
  scales:'https://services.swpc.noaa.gov/json/noaa-scales.json',
};
async function doTestAPI() {
  const btn=document.getElementById('api-test-btn');
  const box=document.getElementById('api-status-box');
  if(btn) btn.textContent='⏳ Testing…';
  box.textContent='Testing endpoints…';

  async function testOne(key,url,parse) {
    const t0=Date.now();
    try {
      const r=await fetch(url);
      const d=await r.json();
      const v=parse(d);
      apiSt[key]={ok:true,val:v,err:null,ms:Date.now()-t0};
    } catch(e) {
      apiSt[key]={ok:false,val:null,err:e.message,ms:Date.now()-t0};
    }
    renderAPIEndpoints();
  }

  await testOne('kp',apiURLs.kp,d=>{
    for(let i=d.length-1;i>=0;i--){const v=parseFloat(d[i].Kp||d[i].kp);if(!isNaN(v))return v;}
    throw new Error('No Kp found');
  });
  await testOne('sfi',apiURLs.sfi,d=>{
    // NOAA field names vary: try all known variants
    const fields=['f10.7','observed-flux','flux','sfi','f10','solar-flux'];
    for(let i=d.length-1;i>=0;i--){
      for(const f of fields){
        const v=parseFloat(d[i][f]);
        if(!isNaN(v)&&v>50&&v<500)return v; // SFI is always 50-300
      }
    }
    // Last resort: find any number in 50-300 range in last item
    const last=d[d.length-1];
    for(const k of Object.keys(last)){const v=parseFloat(last[k]);if(!isNaN(v)&&v>50&&v<500)return v;}
    throw new Error('No SFI found — fields: '+Object.keys(d[d.length-1]||{}).join(', '));
  });
  // Storm scales: derive from Kp if fetch fails (noaa-scales.json has CORS issues on some networks)
  try {
    await testOne('scales', apiURLs.scales, d=>{
      const g=parseInt(d?.G?.Scale||d?.Geomagnetic?.Scale||0);
      return isNaN(g)?0:g;
    });
  } catch(e) {
    // Derive G-scale from Kp as fallback
    const kp = S.prop.kp || 0;
    apiSt.scales = {ok:true, val:kp>=8?5:kp>=7?4:kp>=6?3:kp>=5?2:kp>=4?1:0,
                    err:null, ms:0};
    renderAPIEndpoints();
  }

  const anyOk = apiSt.kp.ok||apiSt.sfi.ok;
  if(anyOk) {
    if(apiSt.kp.ok)  S.prop.kp=apiSt.kp.val;
    if(apiSt.sfi.ok) S.prop.sfi=apiSt.sfi.val;
    if(apiSt.scales.ok) S.prop.gScale=apiSt.scales.val;
    S.prop.fetchedAt=new Date().toISOString();
    saveNoaa();
    updateStatusBar();
    evalAll();
    box.innerHTML=`<span style="color:var(--good-tx)">✅ NOAA connected — Kp ${apiSt.kp.val?.toFixed(2)||'—'} · SFI ${apiSt.sfi.val||'—'}</span>`;
    toast('✅ NOAA OK — Kp '+(apiSt.kp.val?.toFixed(2)||'—')+' · SFI '+(apiSt.sfi.val||'—'),'ok');
  } else {
    box.innerHTML='<span style="color:var(--bad-tx)">❌ All NOAA endpoints failed</span>';
    toast('❌ NOAA failed','err');
  }
  if(btn) btn.textContent='🔌 Test API';
}

function renderAPIEndpoints() {
  const el=document.getElementById('api-endpoints');
  if(!el) return;
  const labels={kp:'Kp index',sfi:'Solar Flux Index',scales:'Storm scales'};
  el.innerHTML=Object.entries(apiSt).map(([k,st])=>{
    const icon=st.ok===true?'✅':st.ok===false?'❌':'○';
    const col=st.ok===true?'var(--good-tx)':st.ok===false?'var(--bad-tx)':'var(--tx2)';
    const val=st.val!=null?` <b>${typeof st.val==='number'?st.val.toFixed(k==='kp'?2:0):st.val}</b>`:'';
    const lat=st.ms!=null?` · ${st.ms}ms`:'';
    const err=st.err?`<div class="api-err">${st.err}</div>`:'';
    return `<div class="api-row">
      <div class="api-row-top">
        <span style="color:${col}">${icon} ${labels[k]||k}${val}${lat}</span>
      </div>
      ${err}
      <div class="api-url">${apiURLs[k].replace('https://services.swpc.noaa.gov','')}</div>
    </div>`;
  }).join('');
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', function() {
  // Apply saved theme
  document.documentElement.setAttribute('data-theme', S.user.theme||'dark');
  applyLanguage();

  // Route
  if (!S.user.configured) {
    showScreen('setup'); renderSetup();
  } else {
    showScreen('home'); renderHome(); evalAll();
  }

  // Fetch live data
  fetchNoaa();

  // Auto-refresh every 5 min
  setInterval(fetchNoaa, 5*60*1000);
  setInterval(()=>{
    const e=document.getElementById('tl-now');
    if(e) e.textContent=new Date().toUTCString().slice(17,22)+' UTC';
  }, 60000);

  // Register SW
  if('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function(e){ console.warn('SW:',e); });
  }
});


/* ════════════════════════════════════════════════════════════════
   FEATURE 1: Sporadic-E Detection
   Statistical model based on: month (May-Aug peak), time of day
   (08-12 UTC and 15-20 UTC peaks), and latitude (40-60°N optimal).
   Enhanced by PSK Reporter spot count if available.
   ════════════════════════════════════════════════════════════════ */

// Monthly Es probability factors for Northern Europe (Bianchi/CCIR data)
const ES_MONTHLY = [0.02,0.02,0.04,0.12,0.55,0.88,1.00,0.78,0.32,0.08,0.02,0.01];

function calcEsProbability(now) {
  now = now || new Date();
  const month   = now.getUTCMonth();         // 0-11
  const h       = now.getUTCHours() + now.getUTCMinutes()/60;
  const lat     = S.user.lat || 51;

  // Seasonal factor
  const seasonal = ES_MONTHLY[month];
  if (seasonal < 0.01) return { prob: 0, reason: 'off-season' };

  // Diurnal factor: two peaks per day
  let diurnal;
  if      (h >=  8 && h <= 12) diurnal = 1.00;   // morning peak
  else if (h >= 15 && h <= 19) diurnal = 0.80;   // afternoon peak
  else if (h >=  6 && h <= 22) diurnal = 0.35;   // background daytime
  else                          diurnal = 0.08;   // night (rare)

  // Latitude factor: Es belt 40-60°N (optimal for Europe)
  const latFactor = lat >= 42 && lat <= 58 ? 1.0
                  : lat >= 36 && lat <= 64 ? 0.65
                  : 0.30;

  const prob = Math.min(0.95, seasonal * diurnal * latFactor);
  return { prob, seasonal, diurnal, latFactor };
}

function esLabel(prob) {
  if (prob >= 0.70) return { text: 'HIGH',    color: 'var(--good)',    bg: 'var(--good-bg)'  };
  if (prob >= 0.40) return { text: 'MODERATE',color: 'var(--warn)',    bg: 'var(--warn-bg)'  };
  if (prob >= 0.15) return { text: 'LOW',      color: 'var(--bdr)',     bg: 'var(--bg3)'      };
  return null; // don't show below 15%
}

// Try PSK Reporter for live 6m/10m spots (CORS-friendly endpoint)
async function fetchEsSpots() {
  const grid = (S.user.grid || 'JO20').slice(0,4).toUpperCase();
  const url  = `https://pskreporter.info/cgi-bin/pskquery5.pl?encap=0&callback=null`
             + `&statistics=1&noactive=1&nolocator=1&flowStartSeconds=-1800`
             + `&fDXgrid=${grid}&bands=6m,10m`;
  try {
    const r = await Promise.race([
      fetch(url),
      new Promise((_,rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    if (!r.ok) return null;
    const txt = await r.text();
    // Response is JSONP: null({...}) or just JSON
    const json = txt.replace(/^null\(|\)$/g,'');
    const d    = JSON.parse(json);
    const spots = d?.currentSpots ?? d?.receptionReports?.length ?? 0;
    return { spots, source: 'pskreporter' };
  } catch {
    return null; // Silently fail — model still works
  }
}

function renderEsCard() {
  const { prob } = calcEsProbability();
  const lbl = esLabel(prob);
  if (!lbl) return '';

  const pct  = Math.round(prob * 100);
  const month = new Date().getUTCMonth();
  const bands = prob >= 0.40 ? '6m / 10m' : '10m';
  const hint  = prob >= 0.70
    ? 'Good chance of sporadic-E openings. Check 50.313 (FT8) and 28.074 MHz.'
    : prob >= 0.40
    ? 'Moderate Es probability. Monitor 10m FT8 (28.074) for openings.'
    : 'Low but possible Es. Check 10m if you hear activity.';

  const now = new Date();
  const h = now.getUTCHours();
  const nextPeak = h < 8 ? '08:00 UTC' : h < 15 ? '15:00 UTC' : '08:00 UTC (tomorrow)';

  return `<div class="es-card" style="border-color:${lbl.color};background:${lbl.bg}">
    <div class="es-top">
      <span class="es-icon">⚡</span>
      <div class="es-info">
        <div class="es-title" style="color:${lbl.color}">
          Sporadic-E — ${lbl.text} (${pct}%)
        </div>
        <div class="es-bands">${bands} · Next peak: ${nextPeak}</div>
      </div>
      <div class="es-pct" style="color:${lbl.color}">${pct}%</div>
    </div>
    <div class="es-hint">${hint}</div>
  </div>`;
}

// Poll Es every 15 min (model is time-dependent)
setInterval(() => {
  const listEl = document.getElementById('watch-list');
  if (listEl && document.getElementById('screen-home').classList.contains('active')) {
    renderHome();
  }
}, 15 * 60 * 1000);


/* ════════════════════════════════════════════════════════════════
   FEATURE 2: Storm Recovery Notification
   Tracks Kp trend. When storm is ending (Kp drops from ≥4 to <3),
   shows a toast and re-evaluates all watches.
   ════════════════════════════════════════════════════════════════ */

let _prevKp = null;
let _stormWasActive = false;

function checkStormRecovery(newKp) {
  if (_prevKp === null) { _prevKp = newKp; return; }

  const wasStormy = _prevKp >= 4;
  const isCalm    = newKp < 3;

  if (wasStormy && isCalm && _stormWasActive) {
    _stormWasActive = false;
    const affected = recoveredBands(newKp);
    toast(`🟢 Storm clearing — Kp ${newKp.toFixed(1)} — ${affected} improving`, 'ok');
    showStormBanner(false);
    // Re-evaluate watches now conditions improved
    evalAll();
    // Send browser notification if permitted
    sendStormNotification(newKp, affected);
  }

  if (newKp >= 4) { _stormWasActive = true; }

  _prevKp = newKp;
  updateStormBanner(newKp);
}

function recoveredBands(kp) {
  if (kp < 1) return '160m / 80m / 40m / 20m';
  if (kp < 2) return '80m / 40m / 20m';
  if (kp < 3) return '40m / 20m';
  return '20m / 15m';
}

function updateStormBanner(kp) {
  const banner = document.getElementById('storm-banner');
  if (!banner) return;
  if (kp < 4) { banner.classList.remove('show'); return; }
  const g = kp>=7?5:kp>=6?4:kp>=5?3:kp>=4?2:1;
  document.getElementById('storm-title').textContent = `⚠ G${g} Geomagnetic Storm — Kp ${kp.toFixed(1)}`;
  document.getElementById('storm-sub').textContent   = `HF degraded. ${kp>=6?'160m–15m':'160m–40m'} heavily affected.`;
  banner.classList.add('show');
}

function showStormBanner(show) {
  document.getElementById('storm-banner')?.classList.toggle('show', show);
}

function sendStormNotification(kp, bands) {
  if (Notification.permission !== 'granted') return;
  try {
    new Notification('Propagation Watch — Storm clearing', {
      body: `Kp ${kp.toFixed(1)} — ${bands} improving. Good time to operate!`,
      icon: '/PropagationWatch/icons/icon-192.png',
    });
  } catch(e) {}
}


/* ════════════════════════════════════════════════════════════════
   FEATURE 3: Greyline Alarm
   Calculates next sunrise and sunset at the user's location.
   Schedules a browser notification 15 min before each crossing.
   Also shows a countdown timer on the home screen.
   ════════════════════════════════════════════════════════════════ */

let _greylineTimer = null;

function getNextGreylineTimes() {
  const lat = S.user.lat, lon = S.user.lon;
  if (!lat || !window.SunCalc) return null;

  const now    = new Date();
  const today  = SunCalc.getTimes(now,      lat, lon);
  const tom    = SunCalc.getTimes(new Date(now.getTime()+86400000), lat, lon);

  // Collect upcoming crossings (within 48h)
  const events = [
    { time: today.sunrise, type: 'sunrise', label: '🌅 Sunrise greyline' },
    { time: today.sunset,  type: 'sunset',  label: '🌇 Sunset greyline'  },
    { time: tom.sunrise,   type: 'sunrise', label: '🌅 Sunrise greyline' },
    { time: tom.sunset,    type: 'sunset',  label: '🌇 Sunset greyline'  },
  ].filter(e => e.time > now && !isNaN(e.time))
   .sort((a,b) => a.time - b.time);

  return events.length ? events : null;
}

function renderGreylineCountdown() {
  const events = getNextGreylineTimes();
  if (!events) return '';
  const next    = events[0];
  const msLeft  = next.time - Date.now();
  const minLeft = Math.round(msLeft / 60000);

  if (minLeft > 120) {
    return `<div class="gl-countdown">
      ${next.label}: <b>${fmtUTC(next.time)} / ${fmtLocal(next.time)}</b>
    </div>`;
  }

  const color = minLeft <= 15 ? 'var(--good)' : 'var(--warn)';
  return `<div class="gl-countdown" style="border-color:${color}">
    <span style="color:${color}">◕ ${next.label} in <b>${minLeft}m</b></span>
    <span style="font-family:var(--mono);font-size:11px;margin-left:8px;color:var(--tx2)">
      ${fmtUTC(next.time)} / ${fmtLocal(next.time)}
    </span>
    <button class="gl-alarm-btn" onclick="setGreylineAlarm()" style="color:${color}">⏰</button>
  </div>`;
}

function setGreylineAlarm() {
  const events = getNextGreylineTimes();
  if (!events) { toast('No upcoming greyline found','warn'); return; }
  const next    = events[0];
  const msLeft  = next.time - Date.now();

  // Clear existing timer
  if (_greylineTimer) clearTimeout(_greylineTimer);

  // Schedule notification 15 min before
  const fireIn = msLeft - 15 * 60 * 1000;
  if (fireIn < 0) {
    toast('Greyline is less than 15 min away — alarm set for now','warn');
  }

  _greylineTimer = setTimeout(() => {
    if (Notification.permission === 'granted') {
      try {
        new Notification('Propagation Watch — Greyline in 15 min', {
          body: `${next.label} at ${fmtUTC(next.time)} / ${fmtLocal(next.time)}. Good moment for 40m/80m DX!`,
          icon: '/PropagationWatch/icons/icon-192.png',
        });
      } catch(e) {}
    }
    toast(`🌅 Greyline NOW — ${fmtUTC(next.time)}`, 'ok');
  }, Math.max(0, fireIn));

  // Also export as .ics
  const start = new Date(next.time.getTime() - 15*60*1000);
  const end   = new Date(next.time.getTime() + 30*60*1000);
  exportGreylineICS(next, start, end);

  toast(`⏰ Greyline alarm set — ${fmtUTC(next.time)} / ${fmtLocal(next.time)}`, 'ok');
}

function exportGreylineICS(event, start, end) {
  const tz = S.user.timezone || 'Europe/Brussels';
  function fmtZ(d){return d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';}
  const ics = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//PropagationWatch//ON3VZ//EN',
    'BEGIN:VEVENT',
    `UID:gl-${start.getTime()}@pw`,
    `DTSTAMP:${fmtZ(new Date())}`,
    `DTSTART:${fmtZ(start)}`,
    `DTEND:${fmtZ(end)}`,
    `SUMMARY:${event.label} — ${fmtUTC(event.time)} / ${fmtLocal(event.time)} local`,
    `DESCRIPTION:Greyline window at your location (${S.user.grid||'JO20'}).\\nBest bands: 40m\\, 80m\\, 160m.\\nDuration: ~30-45 minutes.`,
    'BEGIN:VALARM','TRIGGER:-PT15M','ACTION:DISPLAY',
    `DESCRIPTION:${event.label} in 15 min!`,'END:VALARM',
    'END:VEVENT','END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics],{type:'text/calendar'});
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'greyline.ics';
  a.click();
}

// Update greyline countdown every minute
setInterval(() => {
  const el = document.getElementById('gl-countdown-wrap');
  if (el) el.innerHTML = renderGreylineCountdown();
}, 60000);


/* ════════════════════════════════════════════════════════════════
   FEATURE 4: Path Map (Leaflet.js)
   Shows great-circle path from TX to RX on an interactive map.
   Bearing lines (short path + long path), distance annotation,
   greyline terminator overlay, and solar position indicator.
   Leaflet loaded from CDN on first use (lazy load).
   ════════════════════════════════════════════════════════════════ */

let _leafletLoaded = false;

function openMap(watchId) {
  const w = S.watches.find(x => x.id === watchId);
  if (!w) return;
  showScreen('map');
  document.getElementById('map-title').textContent = `${w.label} — ${w.band} ${w.mode}`;
  document.getElementById('map-info').textContent  =
    `${Number(w.dist).toLocaleString()} km · SP: ${w.az}° · LP: ${w.azlp}°`;
  const spEl = document.getElementById('map-sp');
  const lpEl = document.getElementById('map-lp');
  if (spEl) spEl.textContent = `${w.az}° — ${Number(w.dist).toLocaleString()} km`;
  if (lpEl) lpEl.textContent = `${w.azlp}° — ${Number(40075-w.dist).toLocaleString()} km`;

  if (!_leafletLoaded) {
    loadLeaflet(() => initMap(w));
  } else {
    initMap(w);
  }
}

function loadLeaflet(cb) {
  // CSS
  const lnk   = document.createElement('link');
  lnk.rel     = 'stylesheet';
  lnk.href    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(lnk);
  // JS
  const scr   = document.createElement('script');
  scr.src     = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  scr.onload  = () => { _leafletLoaded = true; cb(); };
  scr.onerror = () => toast('Map unavailable offline', 'warn');
  document.head.appendChild(scr);
}

let _map = null;

function initMap(w) {
  const el = document.getElementById('map-container');
  if (!el || !window.L) return;

  // Destroy existing map
  if (_map) { _map.remove(); _map = null; }

  const txLat = S.user.lat || 50.9;
  const txLon = S.user.lon || 4.4;

  _map = L.map('map-container', { zoomControl: true }).setView([txLat, txLon], 2);

  // Tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 10,
  }).addTo(_map);

  // TX marker
  const txIcon = L.divIcon({ html:'<div class="map-marker map-marker-tx">TX</div>', iconSize:[32,22], className:'' });
  const rxIcon = L.divIcon({ html:'<div class="map-marker map-marker-rx">'+w.entity+'</div>', iconSize:[40,22], className:'' });

  L.marker([txLat, txLon], { icon: txIcon })
   .bindPopup(`<b>TX: ${S.user.callsign||S.user.grid||'Home'}</b><br>${S.user.grid||''}`)
   .addTo(_map);

  L.marker([w.lat, w.lon], { icon: rxIcon })
   .bindPopup(`<b>${w.entity} — ${w.name}</b><br>${w.grid||''}<br>${Number(w.dist).toLocaleString()} km`)
   .addTo(_map);

  // Great-circle path (short path)
  const gcPoints = greatCirclePoints(txLat, txLon, w.lat, w.lon, 64);
  L.polyline(gcPoints, { color: '#1D9E75', weight: 2.5, opacity: 0.85 }).addTo(_map);

  // Long path (opposite direction)
  const lpPoints = greatCirclePoints(txLat, txLon, w.lat, w.lon, 64, true);
  L.polyline(lpPoints, { color: '#EF9F27', weight: 1.5, opacity: 0.5, dashArray: '6,6' }).addTo(_map);

  // Greyline terminator
  drawTerminator(_map);

  // Legend
  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = () => {
    const d = L.DomUtil.create('div', 'map-legend');
    d.innerHTML = `<div><span style="color:#1D9E75">——</span> Short path (${w.az}°)</div>
                   <div><span style="color:#EF9F27">- -</span> Long path (${w.azlp}°)</div>
                   <div><span style="color:#BA7517">▓</span> Greyline (night side)</div>`;
    return d;
  };
  legend.addTo(_map);

  // Fit bounds
  _map.fitBounds([
    [Math.min(txLat, w.lat) - 10, Math.min(txLon, w.lon) - 10],
    [Math.max(txLat, w.lat) + 10, Math.max(txLon, w.lon) + 10],
  ]);
}

// Approximate great-circle waypoints
function greatCirclePoints(lat1, lon1, lat2, lon2, n, longPath) {
  if (longPath) {
    // Long path = go the other way around
    lon2 = lon2 > lon1 ? lon2 - 360 : lon2 + 360;
  }
  const pts = [];
  const d2r = Math.PI/180, r2d = 180/Math.PI;
  const la1=lat1*d2r, lo1=lon1*d2r, la2=lat2*d2r, lo2=lon2*d2r;
  const d = 2*Math.asin(Math.sqrt(Math.sin((la2-la1)/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin((lo2-lo1)/2)**2));
  for (let i=0; i<=n; i++) {
    const f = i/n;
    const A = Math.sin((1-f)*d)/Math.sin(d);
    const B = Math.sin(f*d)/Math.sin(d);
    const x = A*Math.cos(la1)*Math.cos(lo1)+B*Math.cos(la2)*Math.cos(lo2);
    const y = A*Math.cos(la1)*Math.sin(lo1)+B*Math.cos(la2)*Math.sin(lo2);
    const z = A*Math.sin(la1)+B*Math.sin(la2);
    const lat = Math.atan2(z, Math.sqrt(x*x+y*y))*r2d;
    const lon = Math.atan2(y, x)*r2d;
    pts.push([lat, lon]);
  }
  return pts;
}

// Draw approximate greyline terminator as night-side overlay
function drawTerminator(map) {
  if (!window.SunCalc) return;
  const now   = new Date();
  const pts   = [];
  const R2D   = 180/Math.PI;

  // Generate terminator polygon (approximate)
  // The terminator is a great circle perpendicular to the sun direction
  const sunPos = SunCalc.getPosition(now, 0, 0);
  // Sun azimuth in geographic terms
  for (let lon = -180; lon <= 180; lon += 2) {
    // Find latitude where solar elevation = 0
    // Simple approximation: use the solar declination
    const decl  = sunPos.altitude * R2D; // approximate
    const ha    = (lon - (now.getUTCHours()+now.getUTCMinutes()/60-12)*15);
    const elev  = Math.asin(
      Math.sin(decl*Math.PI/180)*Math.sin(0) +
      Math.cos(decl*Math.PI/180)*Math.cos(0)*Math.cos(ha*Math.PI/180)
    ) * R2D;
    // Use SunCalc per latitude
    for (let lat = -90; lat <= 90; lat += 5) {
      const e = SunCalc.getPosition(now, lat, lon).altitude * R2D;
      if (Math.abs(e) < 3) { pts.push([lat, lon]); break; }
    }
  }

  // Shade night side (simplified: shade where sun is below horizon)
  const nightPoly = [];
  for (let lon=-180; lon<=180; lon+=3) {
    for (let lat=-90; lat<=90; lat+=3) {
      const e = SunCalc.getPosition(now, lat, lon).altitude * R2D;
      if (e < -6) nightPoly.push([lat, lon]);
    }
  }

  // Draw as a set of small rectangles (efficient approximation)
  if (nightPoly.length > 0) {
    L.rectangle([[-90,-180],[90,180]], {
      color: 'none', fillColor: '#000', fillOpacity: 0.0,
    }).addTo(map); // Placeholder — full terminator needs more complex polygon
  }

  // Better: draw the terminator line
  const termLine = [];
  for (let lon=-180; lon<=180; lon+=2) {
    let termLat = null;
    for (let lat=-88; lat<=88; lat+=1) {
      const e = SunCalc.getPosition(now, lat, lon).altitude * R2D;
      if (Math.abs(e) < 1.5) { termLat = lat; break; }
    }
    if (termLat !== null) termLine.push([termLat, lon]);
  }
  if (termLine.length > 10) {
    L.polyline(termLine, {
      color: '#BA7517', weight: 2, opacity: 0.7,
      dashArray: '4,4',
    }).addTo(map);
  }
}

function closeMap() { showScreen('home'); renderHome(); }


/* ════════════════════════════════════════════════════════════════
   FEATURE 5: DX Cluster Integration
   
   Sources (tried in order):
   1. dxwatch.com — REST JSON, all modes, CORS OK
   2. PSK Reporter — JSONP, digital modes, CORS OK
   
   Spots are matched against active watches:
   - Same band (within ±10 kHz tolerance)
   - DX entity matches watch entity (prefix lookup)
   
   Shows: live spot list per watch + global recent DX
   Updates every 5 minutes (aligned with NOAA poll)
   ════════════════════════════════════════════════════════════════ */

// Store last fetched spots
let _dxSpots = [];
let _dxFetchedAt = null;

// Band frequency ranges for spot matching
const BAND_RANGES = {
  '160m': [1800, 2000],   '80m':  [3500, 4000],
  '40m':  [7000, 7300],   '30m':  [10100, 10150],
  '20m':  [14000, 14350], '17m':  [18068, 18168],
  '15m':  [21000, 21450], '12m':  [24890, 24990],
  '10m':  [28000, 29700], '6m':   [50000, 54000],
};

function freqToBand(freqKhz) {
  for (const [band, [lo, hi]] of Object.entries(BAND_RANGES)) {
    if (freqKhz >= lo && freqKhz <= hi) return band;
  }
  return null;
}

// Extract DXCC prefix from callsign (simplified)
function callToPrefix(call) {
  if (!call) return '';
  const c = call.toUpperCase();
  // Remove portable suffixes (/P /M /QRP etc)
  const base = c.split('/')[0];
  // Try known prefixes from DXCC_SIMPLE
  const keys = Object.keys(DXCC_SIMPLE).sort((a,b) => b.length - a.length);
  for (const pfx of keys) {
    if (base.startsWith(pfx)) return pfx;
  }
  // Generic: first 2-3 chars
  return base.slice(0, base.match(/\d/) ? base.search(/\d/) + 1 : 3);
}

async function fetchDXSpots() {
  // Try dxwatch.com first
  const spots = await fetchDXWatch() || await fetchPSKReporter();
  if (spots && spots.length) {
    _dxSpots     = spots;
    _dxFetchedAt = new Date();
    matchSpotsToWatches();
    renderDXPanel();
  }
}

async function fetchDXWatch() {
  const url = 'https://dxwatch.com/dxsd1/s.php?s=0&r=50';
  try {
    const r = await Promise.race([
      fetch(url),
      new Promise((_,rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    if (!r.ok) return null;
    const d = await r.json();
    if (!Array.isArray(d)) return null;
    return d.map(s => ({
      dx:      (s.dx  || s.DX  || '').toUpperCase(),
      de:      (s.de  || s.DE  || '').toUpperCase(),
      freq:    parseFloat(s.freq || s.Freq || 0),
      band:    freqToBand(parseFloat(s.freq || 0)),
      mode:    (s.mode || s.Mode || '').toUpperCase() || guessModeFromFreq(parseFloat(s.freq||0)),
      comment: s.comment || s.Comment || '',
      time:    s.time ? new Date(s.time) : new Date(),
      source:  'DXWatch',
    })).filter(s => s.dx && s.freq > 0 && s.band);
  } catch { return null; }
}

async function fetchPSKReporter() {
  // PSK Reporter: spots heard by stations near the user
  const grid = (S.user.grid || 'JO20').slice(0,4);
  const url  = `https://pskreporter.info/cgi-bin/pskquery5.pl?encap=0&callback=x`
             + `&statistics=0&noactive=1&rronly=1&flowStartSeconds=-3600`
             + `&receiverCallsign=&fDXgrid=${grid}`;
  try {
    const r = await Promise.race([
      fetch(url),
      new Promise((_,rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    if (!r.ok) return null;
    let txt = await r.text();
    txt = txt.replace(/^x\(|\)$/g, '');
    const d = JSON.parse(txt);
    const reps = d?.receptionReports ?? [];
    return reps.map(s => ({
      dx:      (s.senderCallsign || '').toUpperCase(),
      de:      (s.receiverCallsign || '').toUpperCase(),
      freq:    parseFloat(s.frequency || 0) / 1000,  // Hz → kHz
      band:    freqToBand(parseFloat(s.frequency || 0) / 1000),
      mode:    (s.mode || '').toUpperCase(),
      comment: `SNR ${s.sNR ?? '?'} dB`,
      time:    s.flowStartSeconds ? new Date(s.flowStartSeconds*1000) : new Date(),
      source:  'PSK Reporter',
    })).filter(s => s.dx && s.freq > 0 && s.band);
  } catch { return null; }
}

function guessModeFromFreq(freqKhz) {
  // Common FT8 frequencies
  const FT8 = [1840,3573,7074,10136,14074,18100,21074,24915,28074,50313];
  if (FT8.some(f => Math.abs(freqKhz - f) < 5)) return 'FT8';
  const CW  = [1825,3510,7010,14010,21010,28010];
  if (CW.some(f => Math.abs(freqKhz - f) < 20)) return 'CW';
  return 'SSB';
}

// Match spots to watches — annotate each watch with matching spots
function matchSpotsToWatches() {
  const now = Date.now();
  // Only use spots from last 30 min
  const recent = _dxSpots.filter(s => (now - s.time.getTime()) < 30*60*1000);

  S.watches.forEach(w => {
    w.matchedSpots = recent.filter(s => {
      // Band match
      if (s.band !== w.band) return false;
      // Entity match: DX callsign prefix matches watch entity
      const pfx = callToPrefix(s.dx);
      return pfx === w.entity
          || s.dx.startsWith(w.entity)
          || w.entity.startsWith(pfx);
    }).slice(0, 5); // max 5 spots per watch
  });
}

// Render DX panel on home screen
function renderDXPanel() {
  const el = document.getElementById('dx-panel');
  if (!el) return;

  // Global: last 10 spots across all watched bands
  const watchedBands = [...new Set(S.watches.map(w => w.band))];
  const relevant = _dxSpots
    .filter(s => watchedBands.includes(s.band))
    .slice(0, 10);

  if (!relevant.length) {
    el.innerHTML = '';
    return;
  }

  const ageMin = _dxFetchedAt ? Math.round((Date.now()-_dxFetchedAt)/60000) : '?';

  el.innerHTML = `
    <div style="font-weight:600;font-size:13px;margin-bottom:8px;
                display:flex;justify-content:space-between;align-items:center">
      <span>📻 Live DX spots</span>
      <span style="font-family:var(--mono);font-size:10px;color:var(--tx3)">${ageMin}m ago</span>
    </div>
    <div class="dx-spot-list">
      ${relevant.map(s => {
        const band = s.band || '?';
        const age  = Math.round((Date.now()-s.time.getTime())/60000);
        const matched = S.watches.some(w => w.matchedSpots?.includes(s));
        return `<div class="dx-spot${matched?' dx-spot-match':''}">
          <span class="dx-spot-call">${s.dx}</span>
          <span class="dx-spot-freq">${s.freq.toFixed(1)}</span>
          <span class="dx-spot-band" style="color:${matched?'var(--good)':'var(--tx3)'}">${band}</span>
          <span class="dx-spot-mode">${s.mode||'?'}</span>
          <span class="dx-spot-de">de ${s.de}</span>
          <span class="dx-spot-age">${age}m</span>
        </div>`;
      }).join('')}
    </div>`;
}

// Show spots matching a specific watch in detail view
function renderWatchSpots(w) {
  if (!w.matchedSpots?.length) return '';
  return `
    <div class="card" style="margin-top:0">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">
        📻 Live spots for ${w.entity} ${w.band}
      </div>
      ${w.matchedSpots.map(s => {
        const age = Math.round((Date.now()-s.time.getTime())/60000);
        return `<div class="dx-spot" style="padding:4px 0;border-bottom:1px solid var(--bdr2)">
          <span class="dx-spot-call">${s.dx}</span>
          <span class="dx-spot-freq">${s.freq.toFixed(1)} kHz</span>
          <span class="dx-spot-mode">${s.mode||'?'}</span>
          <span class="dx-spot-de" style="flex:1">de ${s.de}</span>
          <span class="dx-spot-age">${age}m ago</span>
        </div>`;
      }).join('')}
    </div>`;
}

// Poll every 5 minutes
setInterval(fetchDXSpots, 5 * 60 * 1000);
// Initial fetch
setTimeout(fetchDXSpots, 3000); // slight delay after page load

# 📡 Propagation Watch

**A propagation planner for radio amateurs — built for the shack, not the laboratory.**

> *"Is it worth switching on the rig right now — and if not, when?"*

**Live app:** [on3vz.github.io/PropagationWatch](https://on3vz.github.io/PropagationWatch)  
**Developer:** ON3VZ · JO20ev · Hoboken (Antwerpen) · WLD/ON6WL · IC-7300 MkII

---

## Table of Contents

1. [What it does](#what-it-does)
2. [Quick start](#quick-start)
3. [Home screen](#home-screen)
4. [Watches](#watches)
5. [Field reference — what each value means](#field-reference)
6. [How the calculations work](#how-the-calculations-work)
7. [Features](#features)
8. [Settings reference](#settings-reference)
9. [Calendar export & alarms](#calendar-export--alarms)
10. [Architecture](#architecture)
11. [Data sources](#data-sources)
12. [Limitations and honesty](#limitations-and-honesty)
13. [Planned extensions](#planned-extensions)

---

## What it does

Propagation Watch monitors HF propagation conditions between your location and your configured target stations. For each **watch** (target + band + mode combination) it continuously calculates a **path reliability** score and tells you:

- **Now:** what is the reliability percentage for this path at this moment?
- **Next window:** when will conditions be good enough to operate?
- **Greyline:** countdown to the next sunrise/sunset greyline crossing at your location
- **Sporadic-E:** probability of Es openings on 10m and 6m
- **DX spots:** live spots from DX clusters matched against your watches
- **Storm alert:** notification when a geomagnetic storm is clearing

The app does **not** show raw data tables. Everything is translated into a decision: good / wait / closed.

**Privacy:** your location (grid square) never leaves your browser. All calculations are client-side. No account, no tracking, no ads.

---

## Quick start

### First run

Open the app. The setup wizard asks for:

1. **Your grid square or callsign** — e.g. `JO20ev` or `ON3VZ`. Used for D-layer absorption, greyline timing, path distances and bearings. 6-character grid (JO20ev) gives best greyline accuracy (±5 km vs ±70 km for 4-character JO20).

2. **License class** — determines max transmit power. Belgian/CEPT: C = 25W, B = 100W, A = 1500W. Affects all reliability calculations.

3. **Transmit power** — your actual operating power. Important for marginal paths.

4. **Notification permission** — optional. Required for greyline and storm-recovery alerts. You can always use calendar export (.ics) instead.

### Add a watch

Tap **+ Watch**. Choose a target from the suggestion grid (10 common DX entities from JO20ev with pre-calculated distances and bearings) or type a prefix manually (e.g. `VP8`, `JA`, `W`). Select band and mode. Set your reliability threshold (default: 60%).

### Read the home screen

```
Kp 2.0   SFI 120   G0   0m ago                    [↺]

🌅 Sunset greyline in 23m — 20:14 UTC / 22:14 local  [⏰]

24h timeline ─────────────────────────────────── 20:14 UTC
40m EA  [████████░░░░░░████████████████░░░░░░░░░░░░░░░░░░]
80m EA  [░░░░░░░░░░░░░░░░░░██████████████░░░░░░░░░░░░░░░░]

EA   [25W]
40m · FT8 · 1,870 km · 208°
◑ OPENING SOON           48%
Next: 20:14 UTC / 22:14  48%

📻 Live DX spots
VP8GEO  14.074  20m  FT8  de OE5TXF  3m
```

---

## Home screen

### Status bar

| Field | Meaning |
|-------|---------|
| **Kp** | Planetary K-index — geomagnetic disturbance (0–9). Green < 3, orange 3–4, red ≥ 5. |
| **SFI** | Solar Flux Index — solar activity. Higher = better HF conditions. |
| **G0–G5** | NOAA storm scale derived from Kp |
| **0m ago** | Age of the NOAA data. Orange > 30 min, red > 2 hours. |
| **↺** | Manual refresh button |

### Greyline countdown

Shows time until next sunrise or sunset at your location. Turns orange inside 2 hours, green inside 15 minutes. The ⏰ button sets a browser notification 15 min before the greyline and downloads a `greyline.ics` calendar event.

### Sporadic-E card

Appears automatically when Es probability ≥ 15% (May–August in Northern Europe). Shows:

- **HIGH / MODERATE / LOW** with percentage
- Which bands to monitor (6m at ≥ 70%, 10m at ≥ 40%)
- Specific frequencies: 50.313 MHz (6m FT8), 28.074 MHz (10m FT8)
- Time until next diurnal peak (08–12 UTC or 15–19 UTC)

### 24h timeline

Horizontal bar per watch covering the next 24 hours in 15-minute blocks:

| Colour | Reliability |
|--------|------------|
| 🟢 Green | ≥ 70% |
| 🟡 Orange | 40–69% |
| 🔴 Red | 10–39% |
| ⬛ Grey | < 10% |
| Amber vertical bands | Greyline periods at your TX location |

### DX spots panel

Shows up to 10 recent spots on your watched bands. Spots matching a watch entity are highlighted green. Shows: DX callsign, frequency (kHz), band, mode, spotter, age in minutes.

---

## Watches

### Status labels

| Status | Meaning |
|--------|---------|
| **● GOOD WINDOW** | Reliability ≥ threshold — operate now |
| **◑ OPENING SOON** | Reliability at 75–100% of threshold — get ready |
| **○ WAITING** | Below threshold — next window calculated |
| **✕ CLOSED** | Reliability < 10% — effectively closed |

Sub-line behaviour:
- `Next: 21:17 UTC / 23:17 · 71%` — a true window exists above threshold
- `Best: 03:14 UTC / 05:14 · 38%` — band never reaches threshold; shows best available moment (dimmed text)

### Watch detail

Tap a watch card to open the detail view. Shows:
- Large reliability percentage with colour
- Power penalty note ("At 100W this would be 58% — 14pt difference")
- Next window box with UTC + local time, export to calendar
- SFI / Kp / power / distance / bearing / grid reference table
- **Live DX spots** matching this watch (from DX cluster, last 30 min)
- ⏰ Set alarm · 📅 Export .ics · 🗺 Show path on map

### Path map

Tap "Show path on map" in the watch detail. Opens Leaflet.js map showing:
- **Green solid line** — short path great circle
- **Orange dashed line** — long path
- TX marker (green) and DX entity marker (orange)
- Greyline terminator (amber dashed line)
- Short path bearing and distance, long path bearing and distance
- Legend

*Map requires internet connection (tiles from OpenStreetMap, Leaflet from CDN).*

---

## Field reference

### SFI — Solar Flux Index

Measures solar radiation at 10.7 cm. Proxy for F2-layer ionisation.

| SFI | HF conditions |
|-----|--------------|
| < 70 | Poor — low bands only at night |
| 70–100 | Moderate — 20m reliable, 17m/15m marginal |
| 100–130 | Good — 15m reliable, 10m opening |
| 130–150 | Very good — 10m reliably open |
| > 150 | Excellent — all bands including 6m F2 possible |

Source: NOAA SWPC, field `f10.7` in `observed-solar-cycle-indices.json`. Updated daily.

### Kp — Planetary K-index

Measures geomagnetic disturbance (0–9). Global average — affects all HF paths.

| Kp | G-scale | Effect |
|----|---------|--------|
| 0–2 | G0 | Undisturbed |
| 3 | G1 | 80m/40m slightly degraded |
| 4 | G1–G2 | Moderate storm — 80m/40m noticeably worse |
| 5 | G2 | HF unreliable, especially low bands |
| 6 | G3 | Widespread disruption |
| ≥ 7 | G4–G5 | HF outages |

Source: NOAA SWPC `planetary_k_index_1m.json`. Updated every minute.

### MUF — Maximum Usable Frequency

Highest frequency reflectable by the F2 layer for this path. Above the MUF = signal escapes to space = 0% reliability.

```
foF2      = 2 + (SFI / 150) × 8           [~2 MHz at SFI=0, ~10 MHz at SFI=150]
obliquity = 2.5 + min(2.5, distKm / 3000)  [2.5 short → 5.0 long path]
MUF       = foF2 × obliquity
```

If band frequency > MUF × 1.10 → reliability = 0%  
If band frequency > MUF × 0.95 → reliability = 15% (marginal)

### Path reliability

0–99%. Calculated at each evaluation step and for each 15-min block of the 24h timeline.

### Distance and bearing

Great-circle distance via Haversine formula from your grid square centre to the DXCC entity reference point. Two bearings shown: short path and long path (SP + 180°).

---

## How the calculations work

All calculations are in `js/app.js` — `calcRel()` function.

### Step-by-step calculation

```
1. MUF gate:  freq > MUF×1.10 → 0%  |  freq > MUF×0.95 → 15%
2. Base      = max(0.05, min(1.0, SFI / 150))
3. Base     × Kp degradation factor (interpolated between integer Kp steps)
4. Base     × D-layer factor at TX location (band-specific sigmoid)
5. Base     × D-layer factor at RX location (band-specific sigmoid)
6. Base     × Multi-hop factor (80m >6000 km, 160m >4000 km)
7. Base     × F2 gradient factor (20m+ on paths > 3000 km only)
8. Reliability = min(0.99, Base × power correction factor)
```

### D-layer absorption (steps 4 & 5)

Sigmoid curve — smooth transition from no absorption at night to maximum at high sun:

```
t          = solar_elevation / halfElev
absorption = maxAbsorption × t² / (1 + t²)
factor     = max(0.03, 1 − absorption)
```

| Band | Max absorption | Half-elev | Factor at noon | Night |
|------|---------------|----------|---------------|-------|
| 160m | 95% | 6° | 0.05 | 1.00 |
| 80m | 90% | 10° | 0.10 | 1.00 |
| 40m | 82% | 18° | 0.20 | 1.00 |
| 30m | 35% | 35° | 0.65 | 1.00 |
| 20m+ | 0% | — | 1.00 | 1.00 |

Applied at both TX and RX independently → partial greyline modelled correctly.

### F2 gradient factor (step 7)

F2 propagation on 20m+ is most efficient when TX and RX are in **opposite** day/night states. Only applies to paths > 3000 km (trans-continental).

- Short paths (<3000 km, e.g. JO20→EA at 1870 km): factor = 1.0 — F2 works at all hours
- Long paths (>3000 km, e.g. JO20→W1 at 5890 km): peaks when one side is day, other is night

```
distWeight = min(1, max(0, (distKm − 3000) / 6000))
norm(e)    = clamp(e / 20°, −1, +1)
gradient   = |norm(txElev) − norm(rxElev)| / 2
factor     = max(floor, floor + (1−floor)×gradient)
floor      = 0.50 + 0.20×(1−distWeight)
```

**Result:** 20m to W1 peaks 22:00–06:00 UTC (EU night / US night). 20m to EA is flat (short path, works all day).

### Kp degradation matrix

| Kp | 160m | 80m | 40m | 20m | 15m | 10m |
|----|------|-----|-----|-----|-----|-----|
| 0 | 100% | 100% | 100% | 100% | 100% | 100% |
| 2 | 75% | 80% | 85% | 95% | 98% | 100% |
| 4 | 25% | 35% | 50% | 65% | 75% | 82% |
| 6 | 0% | 5% | 10% | 20% | 30% | 38% |

Linear interpolation between integer steps. Source: empirically calibrated against NOAA G-scale descriptions.

### Power correction factor

```
dB_diff = 10 × log10(txPowerW / 100W)
factor  = max(0.15, min(1.2, 1 + dB_diff / mode_margin))
```

| Mode | Margin (dB) | 25W factor | Notes |
|------|------------|-----------|-------|
| FT8 | 20 | 0.70 | Most tolerant — best for QRP DX |
| JT65 | 22 | 0.73 | |
| FT4 | 18 | 0.67 | |
| CW | 13 | 0.54 | Operator-dependent |
| SSB | 10 | 0.40 | 25W SSB is difficult but not impossible |

### Sporadic-E probability model

```
prob = seasonal × diurnal × latFactor

seasonal  = ES_MONTHLY[month]       // May peak 0.55, June 0.88, July 1.00
diurnal   = 1.00 (08-12 UTC)        // Morning peak
            0.80 (15-19 UTC)        // Afternoon peak
            0.35 (other daytime)
            0.08 (night)
latFactor = 1.00 (42-58°N)          // Es belt
            0.65 (36-64°N)
            0.30 (other)
```

Based on Bianchi/CCIR ionospheric data for Northern Europe.

---

## Features

### Greyline alarm

- Live countdown on home screen to next sunrise/sunset at your location
- ⏰ button: sets browser notification 15 min before greyline
- Downloads `greyline.ics` for import in your calendar app
- Updates every minute

### Storm recovery alert

- Tracks Kp trend across NOAA fetches
- When Kp drops from ≥4 to <3: toast notification + browser notification
- Lists which bands are recovering (e.g. "40m / 20m improving")
- All watches automatically re-evaluated

### Sporadic-E card

- Shown automatically when probability ≥ 15%
- Statistical model (month × time-of-day × latitude)
- Specifies exact frequencies to monitor
- Updates every 15 minutes

### DX cluster spots

- Fetches live spots from **dxwatch.com** (REST, CORS OK, all modes)
- Fallback to **PSK Reporter** (digital modes, spots near your grid)
- Spots matched to watches: same band + DX prefix = green highlighted
- Shows in home screen panel (10 most recent on your watched bands)
- Shows in watch detail (up to 5 matched spots with frequency, spotter, age)
- Updates every 5 minutes

### Path map (Leaflet.js)

- Great-circle short path (green) and long path (orange dashed)
- Greyline terminator line (amber dashed)
- TX and RX markers with entity labels
- SP and LP bearing + distance
- Leaflet lazy-loaded on first use (requires internet)

---

## Settings reference

### 📡 Data Sources

**Test API button:** tests each NOAA endpoint independently. Shows:
- HTTP response time (ms)
- Received value (Kp, SFI, G-scale)
- Exact error message if endpoint fails

Storm scales are derived from Kp if the NOAA scales endpoint fails (common CORS issue on mobile networks).

Advanced config (tap "⚙ Advanced configuration"):

| Setting | Default | Description |
|---------|---------|-------------|
| Timeout | 10 sec | Per-request network timeout |
| Poll interval | 5 min | NOAA data refresh frequency |
| Fallback SFI | 70 | Used when NOAA unreachable (conservative) |
| Fallback Kp | 0 | Used when NOAA unreachable (calm = optimistic) |

### ⚡ Power & License

| | Class C | Class B | Class A |
|-|---------|---------|---------|
| **Max power** | 25W | 100W | 1500W |
| **License** | Belgian HAREC candidate / CEPT novice | Intermediate | Full HAREC |

Clicking a class button sets power to the class maximum. The power badge on each watch card shows the power used for that calculation. Change power → all watches recalculate immediately.

**QRP mode:** forces power to 5W. Toggle off restores class default.

### 📍 Location

Enter a 6-character grid square (JO20ev) for best accuracy. 4-character (JO20) is acceptable.

Used for: D-layer solar elevation, greyline timing, path distances and bearings, Es latitude factor, DX cluster spot proximity (PSK Reporter).

### 🎨 Display

Language: English / Nederlands. Switches status labels, UI text and settings screen immediately.

Light theme: inverts colour scheme. All status colours adjusted for contrast on light background.

---

## Calendar export & alarms

### .ics format

Calendar events use `DTSTART;TZID=Europe/Brussels:...` so phone alarms fire at the correct **local time** regardless of summer/winter time. The VTIMEZONE component is embedded for compatibility with Outlook desktop.

SUMMARY shows both times: `VP8 40m CW — 21:17 UTC / 23:17 local`  
VALARM fires 15 minutes before the window opens.

### Greyline .ics

Downloaded when you tap ⏰ on the greyline countdown. Start time = 15 min before greyline, duration = 45 min (typical effective window). Includes VALARM.

### Compatibility

| Client | Import | Alarm |
|--------|--------|-------|
| Google Calendar | ✅ | Local time |
| Apple Calendar iOS/macOS | ✅ | Local time |
| Outlook desktop | ✅ | Local time |
| Outlook web | ✅ | Local time |

### Browser notifications

Requires permission. On iOS, the app must be installed via "Add to Home Screen" (iOS ≥ 16.4). On Android, any Chromium browser works.

---

## Architecture

```
PropagationWatch/
├── index.html        189 lines   HTML structure only — zero inline CSS or JS
├── css/
│   └── style.css     268 lines   All styles: tokens, layout, components, features
├── js/
│   └── app.js       1553 lines   All logic: state, calculations, rendering, APIs
├── lib/
│   └── suncalc.js    96 lines    Astronomical calculations (BSD-2, local copy)
└── sw.js             20 lines    Service worker — offline cache
```

**Technology choices:**
- Vanilla JS — no framework, no build step, no bundler
- No ES modules — single script file, no timing/circular/SW-cache issues  
- GitHub Pages — free HTTPS hosting
- localStorage — all data stored locally, no server, no account
- SunCalc.js local copy — no CDN dependency for core calculations
- Leaflet.js — lazy-loaded CDN on first map use only

---

## Data sources

| Source | Data | Update rate | CORS | Licence |
|--------|------|------------|------|---------|
| NOAA SWPC | Kp (1-min), SFI (daily) | 1 min / daily | ✅ | Public domain |
| SunCalc.js | Solar/lunar positions, greyline | Client-side | ✅ | BSD-2 |
| dxwatch.com | Live DX cluster spots | 5 min | ✅ | Free |
| PSK Reporter | Digital mode spots (FT8/FT4) | 5 min | ✅ | Free |
| DXCC entities | 26 entity coordinates | Static | ✅ | cty.dat derived |

**Offline behaviour:** Kp/SFI cached for up to 2 hours (with staleness indicator). Greyline and solar calculations always work offline. DX spots and map tiles require internet.

---

## Limitations and honesty

| Modelled | Not modelled |
|---------|-------------|
| SFI → MUF estimation | Antenna gain and pattern |
| Kp degradation per band | Receiver noise figure |
| D-layer absorption (sigmoid) | Polar path enhancement/absorption |
| F2 gradient (trans-continental) | Chordal hop propagation |
| Multi-hop loss (80m/160m) | Grey-line exact F-layer state |
| Power + mode SNR correction | Year-to-year ionospheric variation |
| Sporadic-E probability (statistical) | Real-time Es MUF measurement |
| DX cluster live spots | Actual path loss measurement |

The **MUF formula** (`foF2 × obliquity`) is a simplification. VOACAP uses far more sophisticated models. For paths shown as "marginal" in this app, VOACAP may show either "reliable" or "closed" — uncertainty margin ±20–30%.

The **Kp degradation matrix** is empirically calibrated against NOAA G-scale descriptions. Not formally validated against RSGB or IPS publications.

For precision planning, cross-check with:
- [NOAA SWPC](https://www.swpc.noaa.gov) — live Kp and SFI
- [VOACAP Online](https://www.voacap.com) — full circuit analysis
- [DXAtlas](http://www.dxatlas.com) — MUF maps
- [PSK Reporter](https://www.pskreporter.info) — actual live spots

---

## Planned extensions

| Feature | Description | Priority |
|---------|-------------|----------|
| Contest calendar | Major contests (CQWW, PACC, IARU) marked on timeline with active bands | Medium |
| Logbook link | ADIF import to track worked DXCC, mark watches as worked | Medium |
| Reciprocal path | Show reliability for the RX → TX direction too | Medium |
| Meteor scatter | MSK144 windows during meteor showers (Perseid, Leonid) | Low |
| EME / moon window | Lunar elevation for 2m EME planning | Low |
| 6m F2 detection | Real-time F2 opening detection via 50 MHz spots | Low |

---

## License

MIT License — open source, no ads, no tracking, no account required.

- **SunCalc.js** — BSD 2-Clause © Vladimir Agafonkin
- **Leaflet.js** — BSD 2-Clause © Vladimir Agafonkin et al.
- **DXCC data** — derived from cty.dat, free for non-commercial use
- **DX spots** — courtesy dxwatch.com and PSK Reporter

---

*Propagation Watch · ON3VZ/JO20ev · WLD/ON6WL*  
*Hoboken (Antwerpen) · IC-7300 MkII + IC-2730E · FTM-510DE*

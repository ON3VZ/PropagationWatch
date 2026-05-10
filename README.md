# 📡 Propagation Watch

**A propagation planner for radio amateurs — built for the shack, not the laboratory.**

> *"Is it worth switching on the rig right now — and if not, when?"*

Propagation Watch answers that one question. No raw data, no charts to interpret. Human language, countdowns, alarms, and calendar export.

**Live app:** [on3vz.github.io/PropagationWatch](https://on3vz.github.io/PropagationWatch)  
**Developer:** ON3VZ · JO20ev · Hoboken (Antwerpen) · WLD/ON6WL

---

## Table of Contents

1. [What it does](#what-it-does)
2. [Quick start](#quick-start)
3. [Watches explained](#watches-explained)
4. [Field reference](#field-reference)
5. [How the calculations work](#how-the-calculations-work)
6. [Data sources](#data-sources)
7. [Settings reference](#settings-reference)
8. [Calendar export & alarms](#calendar-export--alarms)
9. [Technical architecture](#technical-architecture)
10. [Limitations and honesty](#limitations-and-honesty)
11. [License](#license)

---

## What it does

The app monitors HF propagation conditions between your location and your configured target stations. For each **watch** (a target station + band + mode combination), it continuously calculates a **path reliability** score and tells you:

- **Now:** what is the current reliability percentage?
- **Next window:** when will conditions be best in the next 24 hours?
- **Alarm:** set a browser notification or export a calendar event (.ics) so your phone wakes you up at the right moment

The app does **not** show raw propagation data. Everything is translated into a decision: good / wait / closed.

---

## Quick start

### 1. First setup

Open the app for the first time. The setup wizard asks for:

- **Your grid square** — e.g. `JO20ev`. This is used to calculate solar elevation at your location (for D-layer and greyline), distances to target stations, and bearings. A 4-character grid (JO20) is sufficient; 6 characters (JO20ev) gives slightly more accurate greyline timing.
- **License class** — determines the maximum transmit power available to you. This affects path reliability calculations.
- **Transmit power** — your actual operating power. Important for marginal paths.
- **Notification permission** — optional. You can always use calendar export instead.

### 2. Add a watch

Tap **+ Watch** (bottom navigation). Choose a target region from the suggestion grid or type a callsign/prefix manually (e.g. `VP8`, `JA`, `W1`). Select band and mode. Set the reliability threshold for your alarm (default: 60%).

### 3. Read the overview screen

Each watch card shows:

```
VP8 Falkland                [⏰] [🗑]
40m · CW · 12,847 km · 222°

● GOOD WINDOW              84%
  Until ~22:15 UTC
```

Or when waiting:

```
JA1 Japan                   [⏰] [🗑]
20m · FT8 · 9,220 km · 47°

○ WAITING                  12%
  Next window: 01:30 UTC · 71%
```

### 4. Set an alarm

Tap ⏰ on any watch card, or open the watch detail and tap **Set alarm** / **Export to calendar**. The .ics file works in Outlook, Gmail, and Apple Calendar, and your phone's alarm will fire at the correct **local time**.

---

## Watches explained

A **watch** is a persistent monitor for a specific target station + band + mode combination.

| Field | Description |
|-------|-------------|
| **Target station** | Callsign prefix or DXCC entity (e.g. `VP8`, `JA`, `EA`) |
| **Band** | HF band: 160m, 80m, 40m, 30m, 20m, 17m, 15m, 12m, 10m, 6m |
| **Mode** | Operating mode: FT8, FT4, CW, SSB, JT65, MSK144 |
| **Threshold** | Minimum reliability % for an alarm (default 60%) |
| **Power** | Transmit power used for this watch (default: profile setting) |

### Watch statuses

| Status | Meaning |
|--------|---------|
| ● **GOOD WINDOW** | Reliability ≥ threshold — good time to operate |
| ◑ **OPENING SOON** | Reliability approaching threshold (within ~75%) |
| ○ **WAITING** | Below threshold — next good window calculated |
| ✕ **CLOSED** | Reliability < 10% — band effectively closed for this path |
| — **INACTIVE** | Watch manually deactivated |

### The 24-hour timeline

The main screen shows a horizontal timeline covering the next 24 hours. Each watch has a coloured bar:

- 🟢 **Green** ≥ 70% reliability
- 🟡 **Orange** 40–69%
- 🔴 **Red** 10–39%
- ⬛ **Grey** < 10% (effectively closed)
- **Amber vertical bands** = greyline periods at your TX location

The timeline is calculated in 15-minute steps using your actual location and the target station's location.

---

## Field reference

### SFI — Solar Flux Index

The Solar Flux Index measures the intensity of solar radiation at 10.7 cm wavelength. It is a proxy for the level of ionospheric ionisation.

| SFI | Conditions |
|-----|-----------|
| < 70 | Poor — low bands only reliable at night |
| 70–100 | Moderate — 20m open, 17m/15m marginal |
| 100–130 | Good — 15m reliable, 12m/10m opening |
| 130–150 | Very good — 10m reliably open |
| > 150 | Excellent — all bands including 6m (F2) possible |

**Source:** NOAA SWPC, measured daily. Updated once per day.  
**Location dependence:** None — SFI is a global measurement of solar output.

### Kp — Planetary K-index

The Kp index measures geomagnetic disturbance caused by solar wind. It runs from 0 (calm) to 9 (extreme storm). The NOAA G-scale is derived from Kp.

| Kp | G-scale | Effect on HF |
|----|---------|-------------|
| 0–2 | G0 | Undisturbed — full propagation |
| 3 | G0/G1 | Minor disturbance — low bands slightly affected |
| 4 | G1 | Minor storm — 80m/40m noticeably degraded |
| 5 | G2 | Moderate storm — HF unreliable, especially low bands |
| 6 | G3 | Strong storm — widespread HF disruption |
| 7+ | G4/G5 | Severe/extreme — HF outages likely |

**Source:** NOAA SWPC, updated every minute.  
**Location dependence:** None — Kp is a planetary-average index. It affects all HF paths equally (though polar paths are hit harder than equatorial ones — this is not modelled in the current version).

### MUF — Maximum Usable Frequency

The MUF is the highest frequency that can be reflected by the F2 layer for a given path. If your band frequency is above the MUF, the signal passes through the ionosphere and is lost to space.

The app estimates MUF using:

```
foF2      = 2 + (SFI / 150) × 8        [critical F2 frequency in MHz]
obliquity = 2.5 + min(2.5, distKm / 3000)  [geometry factor: 2.5 short → 5.0 long path]
MUF       = foF2 × obliquity
```

| SFI | foF2 | MUF (5,890 km path) |
|-----|------|---------------------|
| 70 | 5.7 MHz | 25.6 MHz |
| 100 | 7.3 MHz | 32.7 MHz |
| 142 | 9.6 MHz | 42.7 MHz |

If your band frequency is:
- **> MUF × 1.10** → reliability = 0% (above MUF)
- **> MUF × 0.95** → reliability = 15% (marginal)
- **≤ MUF × 0.95** → calculation continues

**Accuracy note:** This is an empirical approximation, not a VOACAP simulation. It gives correct directional results (10m closed at low SFI, 20m open at SFI > 70) but should not be used as a precision tool.

### Path reliability

The central output. A single number (0–100%) representing how reliable the path is likely to be **right now** for the configured band, mode, power and target.

**How it is calculated** (step by step):

```
1.  MUF check — if band freq > MUF: reliability = 0%, stop
2.  Marginal check — if band freq > 0.95 × MUF: reliability = 15%, stop
3.  Base = max(0.05, min(1.0, SFI / 150))
4.  Base × Kp degradation factor (interpolated from matrix)
5.  Base × D-layer factor at TX location
6.  Base × D-layer factor at RX location
7.  Base × Multi-hop factor (low bands, long paths)
8.  Base × Power correction factor
9.  Reliability = clamp(base, 0, 0.99)
```

Each factor is described in [How the calculations work](#how-the-calculations-work) below.

### Greyline

The greyline (terminator) is the boundary between day and night. As it sweeps across the earth twice daily, it creates a brief propagation enhancement on low bands:

- The D-layer (which absorbs low-band signals during daylight) is absent
- The F-layer is still fully ionised
- Long-distance paths on 40m, 80m and 160m that are normally blocked become usable

The app shows greyline windows when **both your location and the target location** are simultaneously in the greyline (±6° solar elevation). These moments are shown as amber bands on the timeline.

**Calculation:** SunCalc.js, scanned in 5-minute steps over 48 hours. Accuracy: < 2 minutes for latitudes up to ±65°.

### Bearing

Two bearings are shown for each watch:

- **Short path** — the direct great-circle route (e.g. 222° for Belgium → Falkland)
- **Long path (LP)** — the opposite direction (222° + 180° = 42°), which goes the long way around the Earth

On some paths and bands, the long path can be more reliable than the short path — particularly around greyline when one path is in daylight and the other is not. The app calculates both bearings but does not yet automatically determine which is better.

### Distance

Great-circle distance in km between your grid square centre and the DXCC entity reference point. Calculated using the Haversine formula. Used in the MUF calculation (obliquity factor) and to give you a sense of the path difficulty.

---

## How the calculations work

### D-layer absorption

The D-layer (60–90 km altitude) exists only during daylight and absorbs HF signals — primarily on low bands. The higher the sun, the stronger the absorption.

The app models D-layer absorption per band using a sigmoid (S-curve):

```
t           = solar_elevation_degrees / halfElev
absorption  = maxAbsorption × t² / (1 + t²)
factor      = max(0.03, 1 - absorption)
```

Band-specific parameters (validated against known propagation behaviour):

| Band | Max absorption | Half-elev | Factor at noon (75°) | Factor at night (0°) |
|------|---------------|---------|---------------------|---------------------|
| 160m | 95% | 6° | 0.05 | 1.00 |
| 80m | 90% | 10° | 0.10 | 1.00 |
| 40m | 82% | 18° | 0.20 | 1.00 |
| 30m | 35% | 35° | 0.65 | 1.00 |
| 20m+ | 0% | — | 1.00 | 1.00 |

**Key insight:** 20m and above are not significantly affected by D-layer absorption. An F2 path on 14 MHz works as well during the day as at night. Only low bands are D-layer-dependent.

The factor is applied **twice** — once for your TX location and once for the RX location. This correctly models the situation where one side is in daylight and the other is not (partial greyline — still some absorption).

### Kp degradation matrix

Geomagnetic storms affect low bands more severely than high bands. The app uses an empirically calibrated matrix:

| Kp | 160m | 80m | 40m | 30m | 20m | 15m | 10m |
|----|------|-----|-----|-----|-----|-----|-----|
| 0 | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| 1 | 90% | 90% | 95% | 98% | 100% | 100% | 100% |
| 2 | 75% | 80% | 85% | 90% | 95% | 98% | 100% |
| 3 | 50% | 60% | 70% | 80% | 85% | 90% | 95% |
| 4 | 25% | 35% | 50% | 60% | 65% | 75% | 82% |
| 5 | 10% | 15% | 25% | 35% | 40% | 50% | 60% |
| 6 | 0% | 5% | 10% | 15% | 20% | 30% | 38% |
| 7 | 0% | 0% | 5% | 5% | 5% | 12% | 18% |
| 8+ | 0% | 0% | 0% | 0% | 0% | 3% | 6% |

Values between integer Kp steps are linearly interpolated. So Kp 1.7 gives a value between the Kp 1 and Kp 2 rows.

**Status:** These values are empirically calibrated. They are consistent with NOAA G-scale descriptions but have not been formally validated against RSGB or IPS publications.

### Multi-hop attenuation (low bands, long paths)

On 80m and 160m, very long paths require multiple F2-layer reflections, each with ground-reflection losses. The app applies an exponential decay for paths beyond each band's practical maximum:

```
80m:  paths > 6,000 km → factor = max(0.05, exp(-0.18 × (dist - 6000) / 2000))
160m: paths > 4,000 km → factor = max(0.05, exp(-0.18 × (dist - 4000) / 2000))
```

Example: VP8 (12,847 km) on 80m at night: this factor reduces reliability from ~79% to ~42%, which correctly reflects the practical difficulty of this path.

### F2 ionospheric gradient factor (time-of-day variation)

This is the factor that makes the app answer "**when** is the path open from my location".

**The physics:** F2 propagation on 20m and above is most efficient when TX and RX are in *opposite* day/night states. One side energises the F2 layer with solar radiation while the other benefits from low noise and stable ionisation. This is why 20m from Belgium to the USA peaks around 22:00–06:00 UTC — Belgian evening/night, American afternoon/night.

**The factor:**

```
distWeight = min(1, max(0, (distKm - 1500) / 6000))
           = 0 for short paths, 1 for long paths

norm(elev) = clamp(elev / 20, -1, +1)
           = -1 deep night, 0 at terminator, +1 full daylight

endGradient = |norm(txElev) - norm(rxElev)| / 2   [0..1]
midPenalty  = max(0, norm(midElev))² × 0.2 × distWeight

factor = floor + (1 - floor) × endGradient - midPenalty
floor  = 0.4 + 0.2 × (1 - distWeight)
```

**Distance dependence:**

| Path length | distWeight | Effect |
|-------------|-----------|--------|
| < 1500 km (e.g. EA/Spain) | 0 | No gradient — F2 works in full daylight |
| 3000 km | 0.25 | Mild variation |
| 5890 km (W1/USA) | 0.73 | Strong variation |
| 9220 km (JA/Japan) | 1.00 | Maximum variation |

**Practical results from JO20ev on 20m FT8:**

| Target | Peak UTC | Min UTC | Reason |
|--------|---------|---------|--------|
| W1 North America | 22:00–06:00 | 10:00–18:00 | EU night / US night-afternoon boundary |
| JA Japan | 16:00–22:00 | 06:00–12:00 | EU afternoon / Japan night |
| EA Spain | Flat ~55% | — | Short path, F2 works all day |
| VP8 Falkland 40m | 21:00–04:00 | 09:00–17:00 | Greyline + D-layer model (not F2 gradient) |

**Only applied to 20m and above.** On 40m and lower, the D-layer model already provides the time-of-day variation. The F2 gradient returns 1.0 for those bands.

### Power correction factor


Transmit power affects the SNR margin at the receiving end. The correction is based on the dB difference from the 100W reference and the mode's SNR margin:

```
dB_diff = 10 × log10(txPowerW / 100)
factor  = max(0.1, min(1.2, 1 + dB_diff / mode_margin))
```

Mode SNR margins (dB above decoding threshold on a good path at 100W):

| Mode | Margin | Notes |
|------|--------|-------|
| FT8 | 20 dB | Most tolerant — best choice for low-power DX |
| FT4 | 18 dB | |
| JT65 | 22 dB | |
| CW | 13 dB | Operator-dependent |
| SSB | 6 dB | Most sensitive to power reduction |

**Practical implication:** At 25W (Class C), FT8 gives about 67% of the 100W reliability on a marginal path, while SSB gives only 54%. This is why FT8 is so effective for low-power DX.

---

## Data sources

| Source | What it provides | Update rate | CORS | Notes |
|--------|-----------------|-------------|------|-------|
| [NOAA SWPC](https://www.swpc.noaa.gov) | Kp index, SFI, storm scales | 1 min (Kp), daily (SFI) | ✅ | Free, public domain |
| [SunCalc.js](https://github.com/mourner/suncalc) | Solar/lunar positions, greyline | Client-side, no network | ✅ | BSD 2-Clause, local copy |
| DXCC entities | Target station coordinates | Static (bundled) | ✅ | 26 entities, from cty.dat |
| IMO meteor calendar | Shower dates and ZHR | Annual (bundled) | ✅ | International Meteor Organization |

**Privacy:** Your location (grid square) never leaves your browser. All calculations are client-side. No analytics, no tracking, no account required.

**Offline:** The app works offline using cached NOAA data (up to 2 hours old). Greyline and solar calculations always work offline. The NOAA staleness is shown in the status bar.

---

## Settings reference

### Data Sources

Shows the live status of each NOAA endpoint. The **🔌 Test API** button:
1. Tests each endpoint independently
2. Shows response time (ms) and the received value
3. Shows the exact error message if an endpoint fails
4. Updates live data if the test succeeds

**Advanced configuration:**

| Setting | Default | Description |
|---------|---------|-------------|
| Timeout | 10 sec | Per-request network timeout |
| Poll interval | 5 min | How often NOAA data is refreshed |
| Fallback SFI | 70 | Used when NOAA is unreachable (conservative) |
| Fallback Kp | 0 | Used when NOAA is unreachable (calm = optimistic) |

### Power & License

| Setting | Description |
|---------|-------------|
| **Class C** | Belgian/CEPT novice — max 25W. Clicking this sets power to 25W. |
| **Class B** | Intermediate license — max 100W. |
| **Class A** | Full HAREC license — max 1500W. |
| **Transmit power** | Your actual operating power. Affects reliability for all watches. |
| **QRP mode** | Forces power to 5W. Useful for POTA/SOTA portable operations. |

The power badge on each watch card shows the power used for that watch's calculation. If you change the power, all watch reliabilities are recalculated immediately.

### Location

Your grid square determines:
- Solar elevation at your TX site (for D-layer and greyline calculations)
- Distance and bearing to each watch target
- Greyline marking on the timeline

A 4-character grid (JO20) is accurate to ±70 km, which causes at most 2–3 minutes of greyline timing error. A 6-character grid (JO20ev) is accurate to ±5 km.

---

## Calendar export & alarms

### .ics file format

When you export a watch window to calendar, the generated .ics file uses:

```
DTSTART;TZID=Europe/Brussels:20260507T231700
DTEND;TZID=Europe/Brussels:20260508T001700
SUMMARY:VP8 Falkland — 40m CW — 21:17 UTC / 23:17 local
BEGIN:VALARM
TRIGGER:-PT15M    ← alarm fires 15 min before local start time
END:VALARM
```

The timezone is automatically detected from your browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`). The embedded `VTIMEZONE` component ensures the alarm fires at the correct local time regardless of summer/winter time transitions.

Both UTC and local time are shown in the SUMMARY line, so the calendar event is unambiguous even if you share it with someone in a different time zone.

### Compatibility tested

| Client | Import method | Alarm behaviour |
|--------|--------------|----------------|
| Google Calendar | Direct .ics import or link | ✅ Fires at local time |
| Apple Calendar (iOS/macOS) | Direct .ics import | ✅ Fires at local time |
| Outlook (desktop) | Direct .ics import | ✅ Fires at local time |
| Outlook (web) | Direct .ics import | ✅ Fires at local time |

### Browser notifications

If you grant notification permission, the app can alert you directly via the browser (or home screen if installed as PWA). The alarm fires `advance_minutes` (default: 15) before the window opens. Notifications require:
- Android: Chrome or any Chromium browser
- iOS: Safari, app must be installed via "Add to Home Screen", iOS ≥ 16.4

---

## Technical architecture

```
propagation-watch/
├── index.html            ← Single-page app
├── manifest.json         ← PWA manifest
├── sw.js                 ← Service worker (offline support)
├── css/
│   ├── tokens.css        ← All design tokens (colours, spacing, typography)
│   ├── components.css    ← UI components (BEM)
│   └── ...               ← Layout, timeline, setup
├── js/
│   ├── app.js            ← Boot, routing, orchestration
│   ├── state.js          ← Central app state (single source of truth)
│   ├── propagation.js    ← All reliability calculations (pure functions)
│   ├── greyline.js       ← SunCalc.js wrappers (solar/lunar positions)
│   ├── watches.js        ← Watch CRUD, state machine, alarm pipeline
│   ├── noaa.js           ← NOAA API client, caching, test function
│   ├── timeline.js       ← SVG timeline rendering (96 blocks × watch)
│   ├── settings.js       ← Settings screen and API test panel
│   ├── setup.js          ← Setup wizard
│   ├── export.js         ← .ics generation (RFC 5545, with VTIMEZONE)
│   ├── ui.js             ← showScreen(), showToast()
│   ├── storage.js        ← localStorage abstraction
│   ├── utils.js          ← Haversine, Maidenhead, time formatting
│   └── i18n.js           ← Translations (EN, NL)
├── lib/
│   └── suncalc.js        ← SunCalc v1.9 (local copy, no CDN)
└── data/
    ├── dxcc-entities.json   ← 26 DXCC entities with coordinates
    ├── band-profiles.json   ← Band properties and Class C restrictions
    └── meteor-showers.json  ← IMO annual meteor shower calendar
```

**Technology choices:**
- Vanilla JS (ES6 modules) — no framework, no build step
- GitHub Pages — free HTTPS hosting, automatic deployment via GitHub Actions
- localStorage — all user data stored locally, no server, no account
- SunCalc.js — client-side astronomical calculations, no API needed

---

## Limitations and honesty

This app is a **practical planning tool**, not a scientific propagation prediction system. The reliability scores are directional estimates, not exact probabilities. Here is what the model does and does not capture:

| What is modelled | What is NOT modelled |
|-----------------|---------------------|
| SFI effect on MUF | Antenna gain and pattern |
| Kp effect per band | Receiver noise figure |
| D-layer absorption (day/night) | Geomagnetic latitude (polar vs equatorial paths) |
| Multi-hop loss on low bands | Sporadic-E (no prediction, real-time detection only) |
| Power and mode SNR | Auroral propagation |
| Greyline enhancement | Grey-line exact F-layer state |
| Path distance (MUF obliquity) | Time-of-year ionospheric variability |

**The Kp degradation matrix** is empirically calibrated and consistent with NOAA G-scale descriptions. It has not been formally validated against published RSGB or IPS ionospheric storm data.

**The MUF formula** (`foF2 × obliquity`) is a simplification. VOACAP uses far more sophisticated models. For paths that show "marginal" in this app, VOACAP may show either "reliable" or "closed" — the margin of uncertainty is 20–30%.

When in doubt, cross-check with:
- [NOAA SWPC](https://www.swpc.noaa.gov) — live Kp and SFI
- [DXAtlas](http://www.dxatlas.com) — MUF maps
- [VOACAP Online](https://www.voacap.com) — full circuit analysis
- [PSK Reporter](https://www.pskreporter.info) — actual live spots

---

## License

MIT License — open source, no ads, no tracking, no account required.

SunCalc.js: BSD 2-Clause — © Vladimir Agafonkin  
DXCC entity data: derived from cty.dat (free for non-commercial use)  
IMO meteor shower calendar: public scientific data

---

*Propagation Watch · ON3VZ/JO20ev · WLD/ON6WL*  
*Built with vanilla JS, SunCalc.js, and NOAA SWPC data*

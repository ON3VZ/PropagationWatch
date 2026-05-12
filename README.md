# 📡 Propagation Watch

**A propagation planner for radio amateurs — built for the shack, not the laboratory.**

> *"Is it worth switching on the rig right now — and if not, when?"*

**Live app:** [on3vz.github.io/PropagationWatch](https://on3vz.github.io/PropagationWatch)  
**Developer:** ON3VZ · JO20ev · Hoboken (Antwerpen) · WLD/ON6WL · IC-7300 MkII

---

## Table of Contents

1. [What it does](#what-it-does)
2. [Quick start](#quick-start)
3. [Home screen explained](#home-screen-explained)
4. [Watches](#watches)
5. [Path map](#path-map)
6. [Settings](#settings)
7. [How the calculations work](#how-the-calculations-work)
8. [Data sources](#data-sources)
9. [Architecture](#architecture)
10. [Limitations](#limitations)

---

## What it does

Propagation Watch monitors HF propagation conditions between your location and configured target stations. For each **watch** it continuously calculates a **path reliability** score and tells you:

- **Now:** current reliability % for this path
- **Next window:** when conditions will be good enough (with both UTC and local time)
- **Greyline:** live countdown to next sunrise/sunset at your QTH
- **Sporadic-E:** statistical Es probability for 10m/6m
- **Storm alert:** browser notification when geomagnetic storm clears
- **DX spots:** live spots from PSK Reporter matched to your watches
- **Path map:** great-circle path with day/night overlay and 24h reliability graph

**Privacy:** your location never leaves your browser. All calculations are client-side. No account, no tracking.

---

## Quick start

### First run — setup wizard

1. **Grid square or callsign** — e.g. `JO20ev` or `ON3VZ`. Used for D-layer, greyline, path distances. 6-character grid (JO20ev) gives best accuracy (±5 km).

2. **License class** — C = 25W max (Belgian/CEPT novice), B = 100W, A = 1500W. Affects all reliability scores.

3. **Transmit power** — your actual operating power.

4. **Notification permission** — for greyline and storm-recovery alerts.

### Add a watch

Tap **+ Watch** → choose region → choose country → select band and mode → set reliability threshold (default 60%).

**Quick check:** same flow but shows result without saving. "Save as watch" button appears if you want to keep it.

### Read the cards

```
EA   [25W]
40m · FT8 · 1,870 km · 208°               [⏰] [🗑]
◑ OPENING SOON                              71%
Next: 20:14 UTC / 22:14 local · 71%
```

```
W    [25W]
20m · FT8 · 5,607 km · 292°               [⏰] [🗑]
○ WAITING                                   54%
Best: 06:22 UTC / 08:22 · 56%  (F2 evening path)
```

---

## Home screen explained

### Status bar

| Field | Meaning |
|-------|---------|
| **Kp** | Planetary K-index 0–9. Green < 3, orange 3–4, red ≥ 5 |
| **SFI** | Solar Flux Index. Higher = better HF conditions |
| **G0–G5** | Storm scale derived from Kp |
| **Nm ago** | Age of NOAA data. Orange > 30 min, red > 2h |

### Greyline countdown

Live countdown to next sunrise or sunset at your QTH. Orange within 2h, green within 15 min. ⏰ button sets notification 15 min before + downloads `greyline.ics`.

### Sporadic-E card

Shown when Es probability ≥ 15% (mainly May–August, Northern Europe). Shows: HIGH/MODERATE/LOW, which bands (6m/10m), exact frequencies to monitor, time to next diurnal peak.

### 24h timeline

Horizontal bar per watch, 15-min steps:

| Colour | Reliability |
|--------|------------|
| 🟢 Green | ≥ 70% |
| 🟡 Orange | 40–69% |
| 🔴 Red | 10–39% |
| ⬛ Grey | < 10% |
| Amber bands | Greyline at TX location |

### Watch statuses

| Status | Condition | When shown |
|--------|-----------|-----------|
| **● GOOD WINDOW** | rel ≥ threshold | Operate now |
| **◑ OPENING SOON** | rel ≥ 75% of threshold **AND** window < 2h away | Get ready |
| **○ WAITING** | below threshold, window exists | Next window shown in bold |
| **✕ CLOSED** | rel < 10% | Very poor conditions |

**Sub-line:** `Next: HH:MM UTC / HH:MM local · XX%` = true window above threshold coming.  
`Best: HH:MM UTC / HH:MM local · XX%` (dimmed) = band never reaches threshold; shows best available moment.

---

## Path map

Open from watch detail → "Show path on map".

- **Green solid line** — short path great circle, coloured by current reliability
- **Orange dashed line** — long path
- **Dark overlay** — night side (canvas-rendered, mathematically exact)
- **Amber line** — greyline terminator (exact solar elevation = 0°)
- **Amber dashed lines** — greyline ±6° zone

**24h reliability chart** — SVG bar chart below the map. 48 blocks = 30-min steps. Bar height = reliability %. Threshold shown as dashed line. "now" marker in white.

---

## Settings

### Data Sources

| Endpoint | Status | Notes |
|----------|--------|-------|
| Kp index | ✅ tested | NOAA SWPC, 1-min data |
| Solar Flux Index | ✅ tested | NOAA SWPC, daily |
| Storm scales (G) | ✅ derived | Calculated from Kp — endpoint CORS-blocked on mobile |
| DX Spots | 📻 background | PSK Reporter, auto-fetch every 5 min |

### Power & License

Clicking a class sets power to the class maximum. The **distance-aware power model** means 25W SSB is correctly scored:
- Europa (1870 km): minimal penalty → 25W SSB ≈ 71%
- Amerika (5607 km): moderate penalty → 25W SSB ≈ 48%
- Japan (9220 km): full penalty → 25W SSB ≈ 46%

**QRP mode** forces 5W. Toggle off restores class default.

### Location

6-character grid (JO20ev) recommended. Used for: D-layer solar elevation, greyline timing, path distances and bearings, Es latitude factor.

---

## How the calculations work

### Full reliability formula

```
1. MUF gate:  freq > MUF×1.10 → 0%  |  freq > MUF×0.95 → 15%
2. base      = max(0.05, SFI / 150)
3. base     × Kp degradation factor (interpolated)
4. base     × D-layer factor at TX  (band-specific sigmoid)
5. base     × D-layer factor at RX  (band-specific sigmoid)
6. base     × Multi-hop factor      (80m >6000km, 160m >4000km)
7. base     × F2 gradient factor    (20m+, paths >3000km only)
8. rel       = clamp(base × power factor, 0, 0.99)
```

### MUF — Maximum Usable Frequency

```
foF2      = 2 + (SFI / 150) × 8           [2 MHz at SFI=0, ~10 MHz at SFI=150]
obliquity = 2.5 + min(2.5, distKm / 3000)  [2.5 short → 5.0 long path]
MUF       = foF2 × obliquity
```

Validated: EA/20m open at SFI ≥ 70, 10m closed at SFI < 80.

### D-layer absorption (steps 4 & 5)

Sigmoid curve per band. **Only 160m–30m are affected. 20m and above: returns 1.0.**

```
t          = solar_elevation / halfElev
absorption = maxAbsorption × t² / (1 + t²)
factor     = max(0.03, 1 − absorption)
```

| Band | Max absorption | halfElev | At noon (75°) | At night |
|------|---------------|---------|--------------|---------|
| 160m | 95% | 6° | 0.05 | 1.00 |
| 80m | 90% | 10° | 0.10 | 1.00 |
| 40m | 82% | 18° | 0.20 | 1.00 |
| 30m | 35% | 35° | 0.65 | 1.00 |
| 20m+ | — | — | 1.00 | 1.00 |

Applied independently at TX and RX → partial greyline modelled correctly.

### Kp degradation matrix

Linear interpolation between integer Kp steps.

| Kp | 160m | 80m | 40m | 30m | 20m | 17m | 15m | 10m |
|----|------|-----|-----|-----|-----|-----|-----|-----|
| 0 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| 1 | 90% | 90% | 95% | 98% | 100% | 100% | 100% | 100% |
| 2 | 75% | 80% | 85% | 90% | 95% | 97% | 98% | 100% |
| 3 | 50% | 60% | 70% | 80% | 85% | 88% | 90% | 95% |
| 4 | 25% | 35% | 50% | 60% | 65% | 70% | 75% | 82% |
| 5 | 10% | 15% | 25% | 35% | 40% | 45% | 50% | 60% |
| 6 | 0% | 5% | 10% | 15% | 20% | 25% | 30% | 38% |
| 7+ | 0% | 0% | 5% | 5% | 5% | 10% | 12% | 18% |

Storm scales derived: Kp < 4 = G0, Kp = 4–5 = G1, Kp = 5–6 = G2, Kp = 6–7 = G3, Kp ≥ 7 = G4.

### Multi-hop factor (step 6)

Long paths on low bands require multiple F2-layer reflections with ground losses:

```
80m  >6000 km: factor = max(0.05, exp(−0.18 × (distKm − 6000) / 2000))
160m >4000 km: factor = max(0.05, exp(−0.18 × (distKm − 4000) / 2000))
```

Result: VP8 80m night (12847 km): 79% → 42% (realistic for a difficult path).

### F2 gradient factor (step 7)

**Only applies to 20m and above, only for paths > 3000 km.**

F2 propagation is most efficient when TX and RX are in opposite day/night states. Short paths (<3000 km) work at all hours — no gradient penalty.

```
distWeight = min(1, max(0, (distKm − 3000) / 6000))
if distWeight < 0.05: return 1.0   [no effect for short paths]

norm(e) = clamp(e / 20°, −1, +1)  [−1=deep night, 0=terminator, +1=full day]
gradient = |norm(txElev) − norm(rxElev)| / 2
floor    = 0.50 + 0.20 × (1 − distWeight)
factor   = max(floor, floor + (1−floor) × gradient)
```

**Results from JO20ev:**

| Path | Peak UTC | Trough UTC | Reason |
|------|---------|-----------|--------|
| W1/20m (5607 km) | 05–08 UTC | 11–17 UTC | EU morning / US night |
| JA/20m (9220 km) | 17–21 UTC | 07–12 UTC | EU afternoon / JP night |
| EA/20m (1870 km) | flat | flat | Short path, no gradient |

### Distance-aware power factor (step 8)

**Key insight:** On short paths, propagation reserves are large — 25W SSB is viable. On long paths, every dB counts.

```
db          = 10 × log10(txPowerW / 100)
modeMargin  = {FT8:20, FT4:18, JT65:22, CW:13, SSB:14, AM:8, MSK144:12} dB
rawFactor   = 1 + db / modeMargin
distWeight  = min(1, max(0, (distKm − 500) / 5500))  [0 at 500km, 1 at 6000km+]
factor      = max(0.15, min(1.2, 1.0 + (rawFactor − 1.0) × distWeight))
```

**25W SSB results:**

| Path | Distance | Factor | Reliability | Assessment |
|------|---------|--------|------------|-----------|
| DL/Germany | 500 km | 1.00 | ≈80% | No penalty — works fine |
| EA/Spain | 1870 km | 0.89 | ≈71% | Workable |
| W1/USA | 5607 km | 0.60 | ≈48% | Marginal |
| JA/Japan | 9220 km | 0.57 | ≈46% | Difficult |

When SSB + ≤25W + score < 60%: shows `FT8: ~XX%` hint on the watch card.

### Sporadic-E probability model

```
prob = seasonal × diurnal × latFactor

seasonal  = ES_MONTHLY[month]
           Jan=0.02 Feb=0.02 Mar=0.04 Apr=0.12 May=0.55
           Jun=0.88 Jul=1.00 Aug=0.78 Sep=0.32 Oct=0.08 Nov=0.02 Dec=0.01

diurnal   = 1.00  (08–12 UTC — morning peak)
            0.80  (15–19 UTC — afternoon peak)
            0.35  (other daytime)
            0.08  (night — rare)

latFactor = 1.00  (42–58°N — Es belt)
            0.65  (36–64°N)
            0.30  (other)
```

Based on Bianchi/CCIR Northern European ionospheric data.

Card shown when prob ≥ 15%. Specifies bands (6m ≥ 70%, 10m ≥ 40%) and exact FT8 frequencies.

### Greyline

Calculated via SunCalc.js — sunrise/sunset accurate to < 2 minutes for ±65° latitude. Greyline window = solar elevation between −6° and +6°. Shown as amber bands on timeline and on the map.

### Path map — day/night terminator

Mathematically exact terminator via solar declination:

```javascript
jd   = now / 86400000 + 2440587.5           // Julian date
n    = jd − 2451545.0                        // J2000 epoch
L    = (280.46 + 0.9856474×n) % 360         // mean longitude
g    = ((357.528 + 0.9856003×n) % 360) × D2R
lam  = (L + 1.915×sin(g) + 0.020×sin(2g)) × D2R
decl = asin(sin(23.439°) × sin(lam))        // declination

sunLon = −(utcH − 12) × 15                  // sub-solar longitude

// For each longitude lon:
ha     = (lon − sunLon) × D2R
termLat = atan(−cos(ha) / tan(decl))        // terminator latitude
```

Rendered as a canvas imageOverlay (one Leaflet layer, fast on mobile). Night polygon extends to the winter pole. Three greyline lines: exact terminator + ±6° zone.

---

## Data sources

| Source | Data | Update | Notes |
|--------|------|--------|-------|
| NOAA SWPC | Kp (1-min), SFI (daily) | Auto 5 min | Free, public domain |
| SunCalc.js | Solar/lunar, greyline | Client-side | BSD-2, local copy |
| PSK Reporter | DX spots near QTH | Auto 5 min | JSONP, all modes |
| DXCC entities | 41 entity coordinates | Static | 4 regional groups |

**Offline:** Kp/SFI cached up to 2h. Greyline always works offline. DX spots and map tiles require internet.

---

## Architecture

```
index.html     ~200 lines   HTML structure only — zero inline CSS/JS
css/style.css  ~300 lines   All styles: tokens, layout, components
js/app.js     ~1600 lines   All logic: state, calculations, rendering, APIs
lib/suncalc.js  96 lines    Astronomy (BSD-2, local copy)
sw.js           20 lines    Service worker, offline cache v33
```

**Technology:** vanilla JS (no framework, no build step), GitHub Pages, localStorage, SunCalc.js, Leaflet.js (lazy-loaded on first map use).

---

## Limitations

| Modelled | Not modelled |
|---------|-------------|
| SFI → MUF (foF2 × obliquity) | Antenna gain and pattern |
| Kp degradation per band | Receiver noise figure |
| D-layer absorption (sigmoid, band-specific) | Polar path enhancement |
| F2 gradient (trans-continental) | Chordal hop propagation |
| Multi-hop loss (80m/160m) | Year-to-year ionospheric variation |
| Distance-aware power model | Real-time Es MUF measurement |
| Sporadic-E probability (statistical) | Actual path loss measurement |
| Greyline (SunCalc.js, <2 min accuracy) | |

MUF formula is a simplification — VOACAP is more accurate. For precision planning: [VOACAP Online](https://www.voacap.com), [DXAtlas](http://www.dxatlas.com), [PSK Reporter](https://www.pskreporter.info).

---

*Propagation Watch · ON3VZ/JO20ev · WLD/ON6WL*  
*IC-7300 MkII + IC-2730E · FTM-510DE in Mazda CX-60*

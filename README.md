# Propagation Watch

Propagation planner for radio amateurs. ON3VZ/JO20ev.

## Stack
- Vanilla JS (ES6 modules) — no framework, no build step
- GitHub Pages hosting (free, static, HTTPS)
- PWA with service worker
- SunCalc.js for greyline/moon calculations (local copy)
- NOAA SWPC API for solar data (CORS-OK, free)
- PSK Reporter MQTT for Sporadic-E detection
- localStorage for all user data — no account needed

## Deploy to GitHub Pages

1. Fork or clone this repository
2. In GitHub → Settings → Pages → Source: `main` branch, `/ (root)`
3. The site is live at `https://yourusername.github.io/propagatie-watch/`

Service workers require HTTPS — GitHub Pages provides this automatically.

## File structure

```
propagatie-watch/
├── index.html          ← Single HTML page (SPA)
├── manifest.json       ← PWA manifest
├── sw.js               ← Service worker
├── css/                ← Design system (tokens-first)
├── js/                 ← ES6 modules (app.js orchestrates)
├── lib/suncalc.js      ← Local copy, never CDN
└── data/               ← Static JSON (DXCC, showers, bands)
```

## Development

No build step needed. Serve locally with any static server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080` — the app works immediately.

## License

MIT — open source, no ads, no tracking, no account required.

*ON3VZ/JO20ev · WLD/ON6WL*

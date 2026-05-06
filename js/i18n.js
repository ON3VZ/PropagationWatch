/** i18n.js — Translations: EN (default), NL, FR, ES, DE */

const STRINGS = {
  en: {
    appName:        'Propagation Watch',
    statusGood:     'GOOD WINDOW',
    statusWaiting:  'WAITING',
    statusPoor:     'CLOSED',
    statusInactive: 'INACTIVE',
    statusApproach: 'OPENING SOON',
    bestAt:         'Best at',
    until:          'Until',
    in:             'in',
    noWatches:      'No watches configured — tap + to add one',
    noData:         'No propagation data — connect to internet to start',
    dataStale:      'Data {n}m old',
    alarmSet:       'Alarm set — {label} — {time}',
    watchAdded:     'Watch added',
    watchDeleted:   'Watch deleted',
    undo:           'Undo',
    close:          'Close',
    back:           'Back',
    settings:       'Settings',
    overview:       'Overview',
    watches:        'Watches',
    newWatch:       'New watch',
    quickCheck:     'Quick check',
    setAlarm:       'Set alarm',
    exportICS:      'Export to calendar',
    reliability:    'path reliability',
    at100W:         'at 100W would be {n}% — {d}pt difference',
    setupWhere:     'Where do you want to go?',
    setupChoose:    'Choose a target or enter a callsign / prefix',
    setupBand:      'Band',
    setupMode:      'Mode',
    setupThreshold: 'Alert when reliability ≥',
    setupCreate:    'Create watch →',
    setupCancel:    'Cancel',
    setupLocation:  'Your location',
    setupLocSub:    'Enter your callsign or grid square',
    setupLocHint:   'Recognised: {call} · {country} · {grid}',
    setupNotif:     'Notifications',
    setupNotifSub:  'Allow browser notifications for alerts',
    setupAllow:     'Allow notifications',
    setupSkip:      'Skip',
    stormActive:    'Geomagnetic storm active',
    stormRecovery:  'Recovery expected at {time}',
    esDetected:     'Sporadic-E opening detected',
    esRegion:       '{from} → {to} · {band}',
    greyline:       'Greyline',
    shortPath:      'Short path',
    longPath:       'Long path',
    distance:       'Distance',
    bearing:        'Bearing',
    muf:            'MUF estimate',
    kpEffect:       'Kp degradation',
    dlayerTX:       'D-layer (TX)',
    dlayerRX:       'D-layer (RX)',
    greylineOverlap:'Greyline overlap',
    power:          'Power',
    licenseClass:   'License class',
    qrpMode:        'QRP mode',
    source:         'Source',
    updated:        'Updated',
  },
  nl: {
    appName:        'Propagatie Watch',
    statusGood:     'GOED MOMENT',
    statusWaiting:  'WACHT',
    statusPoor:     'GESLOTEN',
    statusInactive: 'INACTIEF',
    statusApproach: 'OPENT BINNENKORT',
    bestAt:         'Beste om',
    until:          'Tot',
    in:             'nog',
    noWatches:      'Geen watches geconfigureerd — tik + om er een toe te voegen',
    noData:         'Geen propagatiedata — verbind met internet om te starten',
    dataStale:      'Data {n}m oud',
    alarmSet:       'Alarm ingesteld — {label} — {time}',
    watchAdded:     'Watch toegevoegd',
    watchDeleted:   'Watch verwijderd',
    undo:           'Ongedaan maken',
    close:          'Sluiten',
    back:           'Terug',
    settings:       'Instellingen',
    overview:       'Overzicht',
    watches:        'Watches',
    newWatch:       'Nieuwe watch',
    quickCheck:     'Snelle check',
    setAlarm:       'Alarm instellen',
    exportICS:      'Exporteer naar kalender',
    reliability:    'padbetrouwbaarheid',
    at100W:         'bij 100W zou dit {n}% zijn — {d} pt verschil',
    setupWhere:     'Waar wilt u naartoe?',
    setupChoose:    'Kies een doelstation of voer een callsign/prefix in',
    setupBand:      'Band',
    setupMode:      'Modus',
    setupThreshold: 'Alarm bij betrouwbaarheid ≥',
    setupCreate:    'Watch aanmaken →',
    setupCancel:    'Annuleren',
    setupLocation:  'Uw locatie',
    setupLocSub:    'Voer uw callsign of grid square in',
    setupLocHint:   'Herkend: {call} · {country} · {grid}',
    setupNotif:     'Meldingen',
    setupNotifSub:  'Sta browsermeldingen toe voor alarmen',
    setupAllow:     'Meldingen toestaan',
    setupSkip:      'Sla over',
    stormActive:    'Geomagnetische storm actief',
    stormRecovery:  'Herstel verwacht om {time}',
    esDetected:     'Sporadic-E opening gedetecteerd',
    esRegion:       '{from} → {to} · {band}',
    greyline:       'Greyline',
    shortPath:      'Short path',
    longPath:       'Long path',
    distance:       'Afstand',
    bearing:        'Azimut',
    muf:            'MUF schatting',
    kpEffect:       'Kp-degradatie',
    dlayerTX:       'D-laag (TX)',
    dlayerRX:       'D-laag (RX)',
    greylineOverlap:'Greyline overlap',
    power:          'Vermogen',
    licenseClass:   'Licentieklasse',
    qrpMode:        'QRP-modus',
    source:         'Bron',
    updated:        'Bijgewerkt',
  },
};

// Detect browser language, fall back to EN
function detectLang() {
  const lang = navigator.language?.slice(0, 2).toLowerCase();
  return STRINGS[lang] ? lang : 'en';
}

let currentLang = detectLang();

/**
 * Translate a key, interpolating {placeholders}.
 * @param {string} key
 * @param {Object} [vars] — e.g. { n: 5, label: 'VP8' }
 * @returns {string}
 */
export function t(key, vars = {}) {
  const str = STRINGS[currentLang]?.[key] ?? STRINGS.en[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

export function setLang(lang) {
  if (STRINGS[lang]) currentLang = lang;
}

export function getLang() { return currentLang; }

export const SUPPORTED_LANGS = Object.keys(STRINGS);

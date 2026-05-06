/** storage.js — localStorage abstraction layer */

const NS = 'pw_';

export function save(key, value) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('Storage write failed:', key, e);
    return false;
  }
}

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

export function remove(key) {
  try { localStorage.removeItem(NS + key); } catch {}
}

export function clear() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(NS))
      .forEach(k => localStorage.removeItem(k));
  } catch {}
}

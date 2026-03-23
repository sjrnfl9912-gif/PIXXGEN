import { CACHE_KEY_SHIP, CACHE_KEY_PROD, CACHE_KEY_TS } from '../config.js';

export function saveCache(shipD, prodD) {
  try {
    localStorage.setItem(CACHE_KEY_SHIP, JSON.stringify(shipD));
    localStorage.setItem(CACHE_KEY_PROD, JSON.stringify(prodD));
    localStorage.setItem(CACHE_KEY_TS, Date.now().toString());
  } catch (e) {
    console.warn('Cache save failed:', e);
  }
}

export function loadCache() {
  try {
    const s = localStorage.getItem(CACHE_KEY_SHIP);
    const p = localStorage.getItem(CACHE_KEY_PROD);
    const ship = s ? JSON.parse(s) : [];
    const prod = p ? JSON.parse(p) : [];
    return { ship, prod };
  } catch (e) {
    console.warn('Cache load failed:', e);
    return { ship: [], prod: [] };
  }
}

export function clearCache() {
  localStorage.removeItem(CACHE_KEY_SHIP);
  localStorage.removeItem(CACHE_KEY_PROD);
  localStorage.removeItem(CACHE_KEY_TS);
}

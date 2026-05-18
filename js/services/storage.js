import { CACHE_KEY_SHIP, CACHE_KEY_PROD, CACHE_KEY_TFTM, CACHE_KEY_TS } from '../config.js';

export function saveCache(shipD, prodD) {
  try {
    localStorage.setItem(CACHE_KEY_SHIP, JSON.stringify(shipD));
    localStorage.setItem(CACHE_KEY_PROD, JSON.stringify(prodD));
    localStorage.setItem(CACHE_KEY_TS, Date.now().toString());
  } catch (e) {
    console.warn('Cache save failed:', e);
  }
}

// 셀 편집처럼 연속 호출되는 경로용 — 마지막 호출 기준 400ms 뒤 1회만 직렬화
let _cacheTimer = null;
export function saveCacheDebounced(shipD, prodD) {
  clearTimeout(_cacheTimer);
  _cacheTimer = setTimeout(() => saveCache(shipD, prodD), 400);
}

// tft_match는 세션 중 안 바뀌므로(폴더 동기화로만 갱신) DB 로드 후 1회만 캐시
export function saveTftmCache(tftmD) {
  try {
    localStorage.setItem(CACHE_KEY_TFTM, JSON.stringify(tftmD));
  } catch (e) {
    console.warn('TFT cache save failed:', e);
  }
}

export function loadCache() {
  try {
    const s = localStorage.getItem(CACHE_KEY_SHIP);
    const p = localStorage.getItem(CACHE_KEY_PROD);
    const t = localStorage.getItem(CACHE_KEY_TFTM);
    const ship = s ? JSON.parse(s) : [];
    const prod = p ? JSON.parse(p) : [];
    const tftm = t ? JSON.parse(t) : [];
    return { ship, prod, tftm };
  } catch (e) {
    console.warn('Cache load failed:', e);
    return { ship: [], prod: [], tftm: [] };
  }
}

export function clearCache() {
  localStorage.removeItem(CACHE_KEY_SHIP);
  localStorage.removeItem(CACHE_KEY_PROD);
  localStorage.removeItem(CACHE_KEY_TFTM);
  localStorage.removeItem(CACHE_KEY_TS);
}

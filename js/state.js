// ═══════════════════════════════════════
// CENTRALIZED STATE + EVENT BUS
// ═══════════════════════════════════════

// Event bus for inter-module communication
export const bus = new EventTarget();
export function emit(name, detail) { bus.dispatchEvent(new CustomEvent(name, { detail })); }
export function on(name, fn) { bus.addEventListener(name, e => fn(e.detail)); }

// ═══ APP STATE ═══
export const state = {
  // Data
  shipD: [],
  prodD: [],
  mergeD: [],
  tftmD: [],          // tft_match: { ship_date, tft_sn, detector_sn }
  tftMap: {},         // tft_sn → production row
  detTftMap: {},      // detector_sn → tft_sn (from tft_match)

  // UI
  curTab: 'ship',
  shipFilt: 'all',
  workerFilt: 'all',
  prodYearFilt: 'all',   // 생산관리대장 연도 필터 (completed_date 앞 4자리)

  // Filtered data (after search/filter, used by selection to map row index → data)
  shipFiltered: [],
  prodFiltered: [],
  mergeFiltered: [],
  tftmFiltered: [],

  // Selection
  sel: null,       // { td, inp, r, c, tb } - anchor cell
  range: null,     // { r1, c1, r2, c2 }
  editing: false,
  isDrag: false,

  // Clipboard
  internalClip: '',

  // Undo/Redo
  undoStack: [],
  redoStack: [],

  // Dirty tracking
  dirty: {
    updates: {},        // { "table:id": { table, id, fields: { field: val } } }
    inserts: { ship: [], prod: [] },
    deletes: { ship: [], prod: [] }
  },
  hasChanges: false,

  // Duplicates
  dupMode: { ship: false, prod: false },
  shipDups: {},
  prodDups: {},
  dupDirty: true,

  // Fill handle
  fillSt: null,
  fillTip: null,

  // Paste event tracking
  pasteHandled: false,

  // KPI
  kpiH: 0, // 0=전체, 1=상반기, 2=하반기

  // Reload lock (realtime 이벤트 무시용)
  isReloading: false,

  // 탭별 DOM 렌더 캐시 — 데이터 변경 없으면 재방문 시 재렌더 생략 (전환 빠르게)
  tabRendered: { ship: false, prod: false, merge: false, tftm: false, histneed: false },
};

// 현재 탭 제외 다른 탭들의 캐시 무효화 — 데이터가 바뀌어서 다른 탭이 stale일 때 호출
export function invalidateOtherTabs() {
  for (const k in state.tabRendered) if (k !== state.curTab) state.tabRendered[k] = false;
}
// 모든 탭 무효화 — 데이터 전체 교체(fullReload 등)
export function invalidateAllTabs() {
  for (const k in state.tabRendered) state.tabRendered[k] = false;
}

// ═══ TFT MAP ═══
export function rebuildTft() {
  state.tftMap = {};
  state.prodD.forEach(p => { if (p.tft_sn) state.tftMap[p.tft_sn] = p; });
}

// detector_sn → tft_sn (tft_match 데이터 기반). 통합취합본 조인에 사용.
export function rebuildDetTft() {
  state.detTftMap = {};
  state.tftmD.forEach(t => { if (t.detector_sn) state.detTftMap[t.detector_sn] = t.tft_sn; });
}

// ═══ DIRTY HELPERS ═══
export function markDirty() {
  if (!state.hasChanges) {
    state.hasChanges = true;
    const btn = document.getElementById('saveBtn');
    const status = document.getElementById('saveStatus');
    if (btn) btn.classList.add('dirty');
    if (status) { status.textContent = '저장 안 됨'; status.style.color = 'var(--wn)'; }
  }
}

export function trackUpdate(table, id, field, val) {
  const idStr = String(id);
  if (idStr.startsWith('new_')) {
    const key = table === 'shipment' ? 'ship' : 'prod';
    const ins = state.dirty.inserts[key].find(r => String(r._id) === idStr);
    if (ins) ins[field] = val;
    markDirty();
    return;
  }
  const k = table + ':' + id;
  if (!state.dirty.updates[k]) state.dirty.updates[k] = { table, id, fields: {} };
  state.dirty.updates[k].fields[field] = val;
  markDirty();
}

// ═══ UNDO HELPERS ═══
export function pushUndo(entries) {
  state.undoStack.push(entries);
  if (state.undoStack.length > 200) state.undoStack.shift();
  state.redoStack.length = 0;
}

// ═══ DUPLICATE HELPERS ═══
export function markDupDirty() { state.dupDirty = true; }

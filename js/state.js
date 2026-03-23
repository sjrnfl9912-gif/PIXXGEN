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
  tftMap: {},

  // UI
  curTab: 'ship',
  shipFilt: 'all',
  workerFilt: 'all',

  // Filtered data (after search/filter, used by selection to map row index → data)
  shipFiltered: [],
  prodFiltered: [],
  mergeFiltered: [],

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
};

// ═══ TFT MAP ═══
export function rebuildTft() {
  state.tftMap = {};
  state.prodD.forEach(p => { if (p.tft_sn) state.tftMap[p.tft_sn] = p; });
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

// ═══════════════════════════════════════
// CELL EDITING
// ═══════════════════════════════════════
import { state, pushUndo, trackUpdate, markDupDirty, rebuildTft } from '../state.js';
import { saveCache } from '../services/storage.js';

export function startEdit(inp, clear) {
  if (!inp || inp.classList.contains('vl')) return;
  state.editing = true;
  inp.readOnly = false; inp.classList.add('edit');
  inp.dataset.bk = inp.value;
  if (clear) inp.value = '';
  else inp.setSelectionRange(inp.value.length, inp.value.length);
  inp.focus();
}

export function endEdit() {
  if (!state.sel || !state.editing) return;
  const inp = state.sel.inp; if (!inp) return;
  state.editing = false; inp.readOnly = true; inp.classList.remove('edit');
  if (inp.value !== inp.dataset.o) {
    const ov = inp.dataset.bk || inp.dataset.o;
    const nv = inp.value.trim() || null;
    inp.dataset.o = inp.value;
    const rawId = inp.dataset.id, id = String(rawId).startsWith('new_') ? rawId : +rawId;
    const f = inp.dataset.f, t = inp.dataset.t;
    const arr = t === 's' ? state.shipD : t === 'p' ? state.prodD : state.mergeD;
    const row = arr.find(x => String(x._id) === String(id));
    if (row) row[f] = nv;
    pushUndo([{ id, t, f, ov, nv }]);
    const dbt = t === 's' ? 'shipment' : t === 'p' ? 'production' : t === 'm' ? 'shipment' : null;
    if (t === 'm') { const orig = state.shipD.find(x => String(x._id) === String(id)); if (orig) orig[f] = nv; }
    if (dbt) trackUpdate(dbt, id, f, nv);
    if (t === 'p') rebuildTft();
    markDupDirty();
    const td = inp.closest('td');
    if (td) { td.classList.add('chg'); setTimeout(() => td.classList.remove('chg'), 600); }
    saveCache(state.shipD, state.prodD);
  }
}

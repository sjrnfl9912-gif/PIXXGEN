// ═══════════════════════════════════════
// CELL EDITING — 편집 시에만 <input>을 임시 생성 (평소엔 텍스트 셀)
// ═══════════════════════════════════════
import { state, pushUndo, trackUpdate, markDupDirty, rebuildTft } from '../state.js';
import { saveCacheDebounced } from '../services/storage.js';
import { setCellText } from './cell.js';

// td(편집 가능 셀)에 input을 만들어 편집 시작. clear=true면 빈 칸으로 시작(첫 타이핑).
export function startEdit(td, clear) {
  if (!td || !td.dataset || !td.dataset.f) return;
  if (!state.sel || state.sel.td !== td) return;   // 반드시 선택된 셀에서만
  state.editing = true;
  const v = td.dataset.v || '';
  // 기존 텍스트 노드 제거 (.fh 등 자식 요소는 보존)
  for (const n of [...td.childNodes]) { if (n.nodeType === 3) n.remove(); }
  const inp = document.createElement('input');
  inp.className = 'c edit';
  inp.type = 'text';
  inp.value = clear ? '' : v;
  inp.dataset.bk = v;
  inp.dataset.o = v;
  td.insertBefore(inp, td.firstChild);
  state.sel.inp = inp;
  inp.focus();
  if (!clear) inp.setSelectionRange(inp.value.length, inp.value.length);
}

export function endEdit() {
  if (!state.editing || !state.sel) return;
  const inp = state.sel.inp;
  state.editing = false;
  if (!inp) return;
  const td = inp.closest('td') || state.sel.td;
  const nv = inp.value;
  const ov = td.dataset.v || '';
  // input 제거 + 텍스트 복원
  inp.remove();
  state.sel.inp = null;
  td.dataset.v = nv;
  setCellText(td, nv);
  if (!('ontouchstart' in window)) { try { td.tabIndex = -1; td.focus({ preventScroll: true }); } catch (e) {} }
  if (nv !== ov) {
    const t = td.dataset.t, f = td.dataset.f, rawId = td.dataset.id;
    const id = String(rawId).startsWith('new_') ? rawId : +rawId;
    const model = nv.trim() ? nv.trim() : null;
    const arr = t === 's' ? state.shipD : t === 'p' ? state.prodD : state.mergeD;
    const row = arr.find(x => String(x._id) === String(id));
    if (row) row[f] = model;
    pushUndo([{ id, t, f, ov, nv: model }]);
    const dbt = t === 's' ? 'shipment' : t === 'p' ? 'production' : null;
    if (dbt) trackUpdate(dbt, id, f, model);
    if (t === 'p') rebuildTft();
    markDupDirty();
    td.classList.add('chg'); setTimeout(() => td.classList.remove('chg'), 600);
    saveCacheDebounced(state.shipD, state.prodD);
  }
}

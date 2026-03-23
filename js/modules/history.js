// ═══════════════════════════════════════
// UNDO / REDO
// ═══════════════════════════════════════
import { state, trackUpdate, rebuildTft } from '../state.js';
import { renderAll } from './table.js';
import { saveCache } from '../services/storage.js';
import { toast } from '../services/ui.js';

function applyUndo(entries, undo) {
  entries.forEach(e => {
    const v = undo ? e.ov : e.nv;
    const arr = e.t === 's' ? state.shipD : e.t === 'p' ? state.prodD : state.mergeD;
    const row = arr.find(r => r._id === e.id);
    if (row) row[e.f] = v;
    const dbt = e.t === 's' ? 'shipment' : e.t === 'p' ? 'production' : null;
    if (dbt) trackUpdate(dbt, e.id, e.f, v);
  });
  rebuildTft(); renderAll(); saveCache(state.shipD, state.prodD);
}

export function undo() {
  if (!state.undoStack.length) return;
  const u = state.undoStack.pop();
  state.redoStack.push(u);
  applyUndo(u, true);
  toast('되돌리기', 'info');
}

export function redo() {
  if (!state.redoStack.length) return;
  const u = state.redoStack.pop();
  state.undoStack.push(u);
  applyUndo(u, false);
  toast('다시 실행', 'info');
}

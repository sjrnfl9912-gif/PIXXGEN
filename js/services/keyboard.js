// ═══════════════════════════════════════
// GLOBAL KEYBOARD HANDLER (Korean IME safe)
// ═══════════════════════════════════════
import { state } from '../state.js';
import { selCell, moveSel, selAllCells, clearSelection } from '../modules/selection.js';
import { startEdit, endEdit } from '../modules/editing.js';
import { doCopy, deleteRange, pasteGrid, fillDown, fillRight, initPasteHandler } from '../modules/clipboard.js';
import { deleteRows, saveAll } from '../modules/dirty.js';
import { undo, redo } from '../modules/history.js';

export function init() {
  initPasteHandler();

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'TEXTAREA' || e.target.closest?.('.sbox')) return;
    if (e.key === 'Escape' && document.getElementById('helpBg')?.classList.contains('show')) {
      document.getElementById('helpBg').classList.remove('show'); return;
    }
    if (e.key === 'Escape' && document.getElementById('changelogBg')?.classList.contains('show')) {
      document.getElementById('changelogBg').classList.remove('show'); return;
    }
    if (e.key === 'Escape' && document.getElementById('manualRunBg')?.classList.contains('show')) {
      document.getElementById('manualRunBg').classList.remove('show'); return;
    }
    if (e.key === 'Escape' && document.getElementById('modalBg')?.classList.contains('show')) {
      document.getElementById('modalBg').classList.remove('show'); return;
    }

    const kc = e.code || '', kk = e.key || '';

    // Global Ctrl shortcuts (no sel needed)
    if (e.ctrlKey && (kk === 's' || kc === 'KeyS')) { e.preventDefault(); saveAll(); return; }
    if (e.ctrlKey && (kk === 'z' || kc === 'KeyZ') && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && ((kk === 'y' || kc === 'KeyY') || ((kk === 'z' || kc === 'KeyZ') && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      if (state.curTab === 'ship' || state.curTab === 'prod') {
        import('../main.js').then(m => { if (m.addRow) m.addRow(state.curTab); }).catch(() => {});
      }
      return;
    }

    // Auto-recover sel from focused element (workaround for security programs blocking mousedown)
    if (!state.sel) {
      const fi = document.activeElement;
      const td = fi?.closest?.('td');
      if (td?.dataset?.f && td.closest('table.g tbody')) selCell(td);
    }
    if (!state.sel) return;

    // Ctrl shortcuts (work in both edit and non-edit mode)
    if (e.ctrlKey) {
      if (kk === 'c' || kc === 'KeyC') { e.preventDefault(); if (state.editing) endEdit(); doCopy(); return; }
      if (kk === 'x' || kc === 'KeyX') { e.preventDefault(); if (state.editing) endEdit(); doCopy(); deleteRange(); return; }
      if (kk === 'a' || kc === 'KeyA') { e.preventDefault(); if (state.editing) endEdit(); selAllCells(state.sel.tb.id); return; }
      if (kk === '-') { e.preventDefault(); if (state.editing) endEdit(); deleteRows(); return; }
      if (kk === 'd' || kc === 'KeyD') { e.preventDefault(); if (state.editing) endEdit(); fillDown(); return; }
      if (kk === 'r' || kc === 'KeyR') { e.preventDefault(); if (state.editing) endEdit(); fillRight(); return; }
      if (kk === 'v' || kc === 'KeyV') {
        // Let browser paste event fire naturally, fallback after 80ms
        state.pasteHandled = false;
        setTimeout(() => {
          if (!state.pasteHandled && state.internalClip) {
            if (state.editing) {
              const isM = /\t/.test(state.internalClip) || state.internalClip.split(/\r?\n/).filter(l => l).length > 1;
              if (!isM) return;
              endEdit();
            }
            pasteGrid(state.internalClip);
          }
        }, 80);
        return;
      }
      return;
    }

    // Edit mode keys
    if (state.editing) {
      if (e.key === 'Escape') { e.preventDefault(); if (state.sel.inp) state.sel.inp.value = state.sel.inp.dataset.bk || ''; endEdit(); }
      else if (e.key === 'Enter') { e.preventDefault(); endEdit(); moveSel(1, 0, false); }
      else if (e.key === 'Tab') { e.preventDefault(); endEdit(); moveSel(0, e.shiftKey ? -1 : 1, false); }
      return;
    }

    // View mode keys
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1, 0, e.shiftKey); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1, 0, e.shiftKey); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); moveSel(0, 1, e.shiftKey); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); moveSel(0, -1, e.shiftKey); }
    else if (e.key === 'Tab') { e.preventDefault(); moveSel(0, e.shiftKey ? -1 : 1, false); }
    else if (e.key === 'Enter') { e.preventDefault(); moveSel(1, 0, false); }
    else if (e.key === 'F2') { e.preventDefault(); if (state.sel.td) startEdit(state.sel.td, false); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteRange(); }
    else if (e.key === 'Escape') { clearSelection(); state.sel = null; }
    else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // 텍스트 셀엔 평소 input이 없으므로, 타이핑한 첫 글자를 직접 주입해야 유실 안 됨
      if (state.sel.td) { e.preventDefault(); startEdit(state.sel.td, true); if (state.sel.inp) { state.sel.inp.value = e.key; try { state.sel.inp.setSelectionRange(1, 1); } catch (x) {} } }
    }
  });
}

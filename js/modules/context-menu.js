// ═══════════════════════════════════════
// CONTEXT MENU (Right-click)
// ═══════════════════════════════════════
import { state } from '../state.js';
import { selCell } from './selection.js';
import { doCopy, pasteGrid, deleteRange } from './clipboard.js';
import { deleteRows } from './dirty.js';

export function init() {
  const ctx = document.getElementById('ctx');
  if (!ctx) return;

  // Show context menu on right-click inside table
  document.addEventListener('contextmenu', e => {
    const td = e.target.closest('td');
    if (!td || !td.closest('table.g tbody')) return;
    e.preventDefault();
    const inp = td.querySelector('input.c:not(.vl)');
    if (!state.sel || state.sel.td !== td) selCell(td, inp);
    ctx.style.left = e.clientX + 'px';
    ctx.style.top = e.clientY + 'px';
    ctx.classList.add('show');
  });

  // Hide on click elsewhere
  document.addEventListener('click', e => {
    if (!e.target.closest('.ctx')) ctx.classList.remove('show');
  });

  // Handle menu item clicks
  ctx.addEventListener('click', e => {
    const item = e.target.closest('[data-action]');
    if (!item) return;
    ctx.classList.remove('show');
    const action = item.dataset.action;
    if (action === 'copy') doCopy();
    else if (action === 'cut') { doCopy(); deleteRange(); }
    else if (action === 'paste') { if (state.internalClip) pasteGrid(state.internalClip); }
    else if (action === 'addrow') {
      if (state.curTab === 'ship' || state.curTab === 'prod') {
        import('../main.js').then(m => { if (m.addRow) m.addRow(state.curTab); }).catch(() => {});
      }
    }
    else if (action === 'delrow') deleteRows();
  });
}

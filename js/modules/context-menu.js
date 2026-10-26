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
    if (!state.sel || state.sel.td !== td) selCell(td);
    // 생산관리대장에서만 「이 제품 PCB 불량 등록」 표시
    const pcb = state.curTab === 'prod';
    ['ctxPcb', 'ctxPcbSep'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = pcb ? '' : 'none'; });
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
    else if (action === 'pcbdefect') {
      const id = state.sel?.td?.closest('tr')?.dataset.id;
      const row = state.prodD.find(r => String(r._id) === id);
      import('./pcb.js').then(m => m.openPcbGuide({ boards: row ? { 메인보드: row.main_board_sn || '', CPU: row.cpu_sn || '' } : null }));
    }
  });
}

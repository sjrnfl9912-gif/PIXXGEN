// ═══════════════════════════════════════
// SELECTION ENGINE
// ═══════════════════════════════════════
import { state } from '../state.js';
import { endEdit } from './editing.js';

// ── Helpers ──
export function cellPos(td) {
  const tr = td.closest('tr'), tb = tr.parentElement;
  return { r: [...tb.children].indexOf(tr), c: [...tr.children].indexOf(td), tb };
}
export function cellAt(tb, r, c) {
  const tr = tb.children[r]; if (!tr) return null;
  const td = tr.children[c]; if (!td) return null;
  return { td, inp: td.querySelector('input.c:not(.vl)') };
}

export function clearSelection() {
  document.querySelectorAll('td.sel,td.sel-r,th.sel,td.rn.sel').forEach(e => e.classList.remove('sel', 'sel-r'));
  document.querySelectorAll('.sel-box').forEach(e => e.remove());
}

export function selCell(td, inp) {
  clearSelection();
  endEditIfNeeded();
  const oldFh = document.querySelector('.fh'); if (oldFh) oldFh.remove();
  td.classList.add('sel');
  const { r, c, tb } = cellPos(td);
  state.sel = { td, inp, r, c, tb };
  state.range = { r1: r, c1: c, r2: r, c2: c };
  state.editing = false;
  if (inp && !inp.classList.contains('vl')) {
    const isMob = 'ontouchstart' in window;
    if (!isMob) inp.focus();
    inp.readOnly = true; inp.classList.remove('edit');
    const fh = document.createElement('div'); fh.className = 'fh'; fh.style.opacity = '1';
    td.appendChild(fh);
  }
}

export function paintRange() {
  if (!state.range || !state.sel) return;
  clearSelection();
  state.sel.td.classList.add('sel');
  const { tb } = state.sel;
  const r1 = Math.min(state.range.r1, state.range.r2), r2 = Math.max(state.range.r1, state.range.r2);
  const c1 = Math.min(state.range.c1, state.range.c2), c2 = Math.max(state.range.c1, state.range.c2);
  let tdTL = null, tdBR = null;
  for (let r = r1; r <= r2; r++) {
    const tr = tb.children[r]; if (!tr) continue;
    for (let c = c1; c <= c2; c++) {
      const td = tr.children[c]; if (!td) continue;
      td.classList.add('sel-r');
      if (r === r1 && c === c1) tdTL = td;
      if (r === r2 && c === c2) tdBR = td;
    }
  }
  if (tdTL && tdBR) {
    const tw = tb.closest('.tw');
    if (!tw) return;
    const cr = tw.getBoundingClientRect();
    const a = tdTL.getBoundingClientRect(), b = tdBR.getBoundingClientRect();
    const box = document.createElement('div'); box.className = 'sel-box';
    box.style.left = (a.left - cr.left + tw.scrollLeft) + 'px';
    box.style.top = (a.top - cr.top + tw.scrollTop) + 'px';
    box.style.width = (b.right - a.left) + 'px';
    box.style.height = (b.bottom - a.top) + 'px';
    tw.appendChild(box);
  }
}

export function moveSel(dr, dc, shift) {
  if (!state.sel) return;
  if (shift) {
    state.range.r2 = Math.max(0, Math.min(state.sel.tb.children.length - 1, state.range.r2 + dr));
    state.range.c2 = Math.max(0, state.range.c2 + dc);
    paintRange();
  } else {
    const c = cellAt(state.sel.tb, state.sel.r + dr, state.sel.c + dc);
    if (c) selCell(c.td, c.inp);
  }
}

export function getSelVals() {
  if (!state.sel || !state.range) return null;
  const { tb } = state.sel;
  const r1 = Math.min(state.range.r1, state.range.r2), r2 = Math.max(state.range.r1, state.range.r2);
  const c1 = Math.min(state.range.c1, state.range.c2), c2 = Math.max(state.range.c1, state.range.c2);
  const vals = [];
  for (let r = r1; r <= r2; r++) {
    const rv = []; const tr = tb.children[r];
    for (let c = c1; c <= c2; c++) { const inp = tr?.children[c]?.querySelector('input.c'); rv.push(inp ? inp.value : ''); }
    vals.push(rv);
  }
  return vals;
}

export function selWholeCol(tbId, c) {
  const tb = document.getElementById(tbId); if (!tb || !tb.children.length) return;
  clearSelection(); endEditIfNeeded();
  const td0 = tb.children[0].children[c], inp0 = td0?.querySelector('input.c:not(.vl)');
  state.sel = { td: td0, inp: inp0, r: 0, c, tb };
  state.range = { r1: 0, c1: c, r2: tb.children.length - 1, c2: c }; paintRange();
}

export function selWholeRow(tbId, r) {
  const tb = document.getElementById(tbId); if (!tb || !tb.children[r]) return;
  clearSelection(); endEditIfNeeded();
  const tr = tb.children[r], cols = tr.children.length;
  const td0 = tr.children[1] || tr.children[0], inp0 = td0?.querySelector('input.c:not(.vl)');
  state.sel = { td: td0, inp: inp0, r, c: 0, tb };
  state.range = { r1: r, c1: 0, r2: r, c2: cols - 1 }; paintRange();
  tr.children[0]?.classList.add('sel');
}

export function selAllCells(tbId) {
  const tb = document.getElementById(tbId); if (!tb || !tb.children.length) return;
  clearSelection(); endEditIfNeeded();
  const td0 = tb.children[0].children[0];
  state.sel = { td: td0, inp: null, r: 0, c: 0, tb };
  state.range = { r1: 0, c1: 0, r2: tb.children.length - 1, c2: tb.children[0].children.length - 1 }; paintRange();
}

// 셀 전환 시 현재 편집 중인 셀의 변경사항을 즉시(동기적으로) 저장
function endEditIfNeeded() {
  if (state.editing && state.sel) {
    endEdit();
  }
}

// ── Mouse Events ──
let rowDrag = null, colDrag = null;

export function init() {
  document.addEventListener('mousedown', e => {
    const ctx = document.getElementById('ctx'); if (ctx) ctx.classList.remove('show');
    const td = e.target.closest('td');
    if (!td || !td.closest('table.g tbody')) return;
    if (e.target.classList.contains('fh')) return;
    const inp = td.querySelector('input.c:not(.vl)');
    if (e.detail === 2) { if (inp) { selCell(td, inp); import('./editing.js').then(m => m.startEdit(inp, false)); } return; }
    if (e.shiftKey && state.sel) { const { r, c } = cellPos(td); state.range.r2 = r; state.range.c2 = c; paintRange(); state.isDrag = true; e.preventDefault(); return; }
    selCell(td, inp); state.isDrag = true; e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!state.isDrag || !state.sel) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const td = el?.closest('td');
    if (!td || !td.closest('table.g tbody')) return;
    const { r, c } = cellPos(td);
    if (r !== state.range.r2 || c !== state.range.c2) { state.range.r2 = r; state.range.c2 = c; paintRange(); }
  });

  document.addEventListener('mouseup', () => { state.isDrag = false; });

  // Click/focusin fallback (for environments where mousedown is intercepted)
  document.addEventListener('click', e => {
    if (state.sel) return;
    const td = e.target.closest('td');
    if (!td || !td.closest('table.g tbody')) return;
    selCell(td, td.querySelector('input.c:not(.vl)'));
  });

  document.addEventListener('focusin', e => {
    if (state.sel) return;
    const el = e.target;
    if (!el?.classList?.contains('c') || el.classList.contains('vl')) return;
    const td = el.closest('td');
    if (td?.closest('table.g tbody')) selCell(td, el);
  });

  // Row number click → select whole row
  document.addEventListener('mousedown', e => {
    const rn = e.target.closest('td.rn');
    if (!rn) return;
    e.preventDefault();
    const tbId = rn.dataset.tb;
    const ri = parseInt(rn.dataset.rowIdx);
    if (tbId && !isNaN(ri)) {
      selWholeRow(tbId, ri);
      rowDrag = { tbId, si: ri };
      const onM = ev => {
        if (!rowDrag) return;
        const tb = document.getElementById(rowDrag.tbId);
        [...tb.children].forEach((tr, i) => {
          const r = tr.getBoundingClientRect();
          if (ev.clientY >= r.top && ev.clientY <= r.bottom && i !== state.range.r2) {
            state.range.r1 = Math.min(rowDrag.si, i); state.range.r2 = Math.max(rowDrag.si, i);
            state.range.c1 = 0; state.range.c2 = tr.children.length - 1; paintRange();
          }
        });
      };
      const onU = () => { rowDrag = null; document.removeEventListener('mousemove', onM); document.removeEventListener('mouseup', onU); };
      document.addEventListener('mousemove', onM);
      document.addEventListener('mouseup', onU);
    }
  });

  // Column header click → select whole column
  document.addEventListener('mousedown', e => {
    const al = e.target.closest('th.al');
    if (!al) return;
    e.preventDefault();
    const tbId = al.dataset.tb;
    const ci = parseInt(al.dataset.colIdx);
    if (tbId && !isNaN(ci)) {
      selWholeCol(tbId, ci);
      colDrag = { tbId, si: ci };
      const onM = ev => {
        if (!colDrag) return;
        const table = document.getElementById(colDrag.tbId)?.closest('table');
        const ths = [...table.querySelector('thead tr:last-child').children];
        ths.forEach((th, i) => {
          const r = th.getBoundingClientRect();
          if (ev.clientX >= r.left && ev.clientX <= r.right) {
            const c1 = Math.min(colDrag.si, i), c2 = Math.max(colDrag.si, i);
            if (c1 !== state.range.c1 || c2 !== state.range.c2) { state.range.c1 = c1; state.range.c2 = c2; paintRange(); }
          }
        });
      };
      const onU = () => { colDrag = null; document.removeEventListener('mousemove', onM); document.removeEventListener('mouseup', onU); };
      document.addEventListener('mousemove', onM);
      document.addEventListener('mouseup', onU);
    }
  });

  // Corner click → select all
  document.addEventListener('click', e => {
    const corner = e.target.closest('th.corner');
    if (corner) selAllCells(corner.dataset.tb);
  });
}

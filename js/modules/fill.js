// ═══════════════════════════════════════
// FILL HANDLE (Drag to fill)
// ═══════════════════════════════════════
import { state, pushUndo, trackUpdate, markDupDirty, rebuildTft } from '../state.js';
import { saveCache } from '../services/storage.js';
import { toast } from '../services/ui.js';

function fillVal(v, off) {
  if (!v) return v;
  const dm = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dm) { const d = new Date(+dm[1], +dm[2] - 1, +dm[3]); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  const nm = v.match(/^(.*?)(-?)(\d+)$/);
  if (nm) { const pre = nm[1] + nm[2], n = parseInt(nm[3]), pad = nm[3].length; return pre + (nm[3][0] === '0' && pad > 1 ? String(n + off).padStart(pad, '0') : String(n + off)); }
  if (!isNaN(Number(v)) && v.trim()) return String(Number(v) + off);
  return v;
}

export function init() {
  // Fill handle is created dynamically in selection.js when a cell is selected
  // We listen for mousedown on .fh elements
  document.addEventListener('mousedown', e => {
    if (!e.target.classList.contains('fh')) return;
    e.preventDefault(); e.stopPropagation();
    const td = e.target.closest('td'), inp = td.querySelector('input.c'); if (!inp) return;
    const tr = td.closest('tr'), tb = tr.parentElement;
    state.fillSt = {
      inp, td, tb, rows: [...tb.children],
      ri: [...tb.children].indexOf(tr), ci: [...tr.children].indexOf(td),
      val: inp.value, curR: [...tb.children].indexOf(tr)
    };
    state.fillTip = document.createElement('div'); state.fillTip.className = 'fill-tip';
    document.body.appendChild(state.fillTip);
    document.addEventListener('mousemove', fillMove);
    document.addEventListener('mouseup', fillEnd);
  });
}

function fillMove(e) {
  if (!state.fillSt) return;
  const { rows, ci, ri, val } = state.fillSt;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect();
    if (e.clientY >= r.top && e.clientY <= r.bottom) { state.fillSt.curR = i; break; }
  }
  rows.forEach((row, i) => { const td = row.children[ci]; if (td) td.classList.toggle('fill-r', i > ri && i <= state.fillSt.curR); });
  const cnt = state.fillSt.curR - ri;
  if (cnt > 0) { state.fillTip.textContent = fillVal(val, cnt) + ' (' + cnt + '행)'; state.fillTip.style.display = 'block'; }
  else state.fillTip.style.display = 'none';
  state.fillTip.style.left = (e.clientX + 10) + 'px'; state.fillTip.style.top = (e.clientY - 6) + 'px';
}

function fillEnd() {
  if (!state.fillSt) return;
  document.removeEventListener('mousemove', fillMove);
  document.removeEventListener('mouseup', fillEnd);
  const { rows, ci, ri, curR, val } = state.fillSt, cnt = curR - ri, us = [];
  if (cnt > 0) {
    for (let i = 1; i <= cnt; i++) {
      const td = rows[ri + i]?.children[ci]; if (!td) break;
      const inp = td.querySelector('input.c:not(.vl)'); if (!inp) continue;
      const nv = fillVal(val, i), ov = inp.value; inp.value = nv; inp.dataset.o = nv;
      const rawId = inp.dataset.id, id = String(rawId).startsWith('new_') ? rawId : +rawId;
      const f = inp.dataset.f, t = inp.dataset.t;
      const arr = t === 's' ? state.shipD : t === 'p' ? state.prodD : state.mergeD;
      const row = arr.find(x => String(x._id) === String(id)); if (row) row[f] = nv || null;
      us.push({ id, t, f, ov, nv });
      td.classList.add('chg'); setTimeout(() => td.classList.remove('chg'), 600);
    }
    if (us.length) {
      pushUndo(us);
      us.forEach(u => { const dbt = u.t === 's' ? 'shipment' : u.t === 'p' ? 'production' : null; if (dbt) trackUpdate(dbt, u.id, u.f, u.nv); });
    }
    rebuildTft(); markDupDirty(); saveCache(state.shipD, state.prodD);
    toast(cnt + '셀 채우기', 'ok');
  }
  rows.forEach(row => { const td = row.children[ci]; if (td) td.classList.remove('fill-r'); });
  if (state.fillTip) { state.fillTip.remove(); state.fillTip = null; }
  state.fillSt = null;
}

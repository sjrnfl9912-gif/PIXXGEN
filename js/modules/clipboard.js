// ═══════════════════════════════════════
// CLIPBOARD (Copy/Cut/Paste)
// ═══════════════════════════════════════
import { state, pushUndo, trackUpdate, markDupDirty, rebuildTft } from '../state.js';
import { getSelVals } from './selection.js';
import { saveCache } from '../services/storage.js';
import { toast } from '../services/ui.js';

function escH(s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function doCopy() {
  const v = getSelVals(); if (!v) return;
  const tsv = v.map(r => r.join('\t')).join('\n');
  state.internalClip = tsv;
  try {
    const ta = document.createElement('textarea');
    ta.value = tsv; ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (state.sel?.inp) state.sel.inp.focus();
    toast('복사됨', 'info'); return;
  } catch (e) {}
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(tsv).then(() => toast('복사됨', 'info')).catch(() => toast('내부 복사됨', 'info'));
      return;
    }
  } catch (e) {}
  toast('내부 복사됨', 'info');
}

export function pasteGrid(text) {
  if (!state.sel) return;
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l);
  if (!lines.length) return;
  const grid = lines.map(l => l.split('\t'));
  const srcRows = grid.length, srcCols = Math.max(...grid.map(r => r.length));
  const { tb, r: sr, c: sc } = state.sel;
  let pr1 = sr, pc1 = sc, pr2 = sr + srcRows - 1, pc2 = sc + srcCols - 1;
  if (state.range) {
    const rr1 = Math.min(state.range.r1, state.range.r2), rr2 = Math.max(state.range.r1, state.range.r2);
    const rc1 = Math.min(state.range.c1, state.range.c2), rc2 = Math.max(state.range.c1, state.range.c2);
    const selR = rr2 - rr1 + 1, selC = rc2 - rc1 + 1;
    if (selR >= srcRows && selC >= srcCols && (selR > 1 || selC > 1)) { pr1 = rr1; pc1 = rc1; pr2 = rr2; pc2 = rc2; }
  }
  const us = []; let n = 0;
  for (let r = pr1; r <= pr2; r++) {
    const tr = tb.children[r]; if (!tr) break;
    const srcR = grid[(r - pr1) % srcRows];
    for (let c = pc1; c <= pc2; c++) {
      const td = tr.children[c]; if (!td) break;
      const inp = td.querySelector('input.c:not(.vl)'); if (!inp) continue;
      const nv = (srcR[(c - pc1) % srcCols] || '').trim(), ov = inp.value;
      inp.value = nv; inp.dataset.o = nv;
      const rawId = inp.dataset.id, id = String(rawId).startsWith('new_') ? rawId : +rawId;
      const f = inp.dataset.f, t = inp.dataset.t;
      const arr = t === 's' ? state.shipD : t === 'p' ? state.prodD : state.mergeD;
      const row = arr.find(x => String(x._id) === String(id)); if (row) row[f] = nv || null;
      us.push({ id, t, f, ov, nv: nv || null });
      td.classList.add('chg'); setTimeout(() => td.classList.remove('chg'), 600);
      n++;
    }
  }
  if (us.length) { pushUndo(us); batchTrack(us); }
  rebuildTft(); markDupDirty(); saveCache(state.shipD, state.prodD);
  toast(n + '셀 붙여넣기', 'ok');
}

export function deleteRange() {
  if (!state.sel || !state.range) return;
  const { tb } = state.sel;
  const r1 = Math.min(state.range.r1, state.range.r2), r2 = Math.max(state.range.r1, state.range.r2);
  const c1 = Math.min(state.range.c1, state.range.c2), c2 = Math.max(state.range.c1, state.range.c2);
  const us = []; let n = 0;
  for (let r = r1; r <= r2; r++) {
    const tr = tb.children[r]; if (!tr) continue;
    for (let c = c1; c <= c2; c++) {
      const inp = tr.children[c]?.querySelector('input.c:not(.vl)'); if (!inp || !inp.value) continue;
      const ov = inp.value; inp.value = ''; inp.dataset.o = '';
      const rawId = inp.dataset.id, id = String(rawId).startsWith('new_') ? rawId : +rawId;
      const f = inp.dataset.f, t = inp.dataset.t;
      const arr = t === 's' ? state.shipD : t === 'p' ? state.prodD : state.mergeD;
      const row = arr.find(x => String(x._id) === String(id)); if (row) row[f] = null;
      us.push({ id, t, f, ov, nv: null }); n++;
    }
  }
  if (us.length) { pushUndo(us); batchTrack(us); }
  rebuildTft(); markDupDirty(); saveCache(state.shipD, state.prodD);
  if (n) toast(n + '셀 삭제', 'info');
}

export function fillDown() {
  if (!state.sel || !state.range) return;
  const { tb } = state.sel;
  const r1 = Math.min(state.range.r1, state.range.r2), r2 = Math.max(state.range.r1, state.range.r2);
  const c1 = Math.min(state.range.c1, state.range.c2), c2 = Math.max(state.range.c1, state.range.c2);
  if (r1 === r2) return;
  const topTr = tb.children[r1]; if (!topTr) return;
  const srcVals = []; for (let c = c1; c <= c2; c++) { const inp = topTr.children[c]?.querySelector('input.c'); srcVals.push(inp ? inp.value : ''); }
  const us = []; let n = 0;
  for (let r = r1 + 1; r <= r2; r++) {
    const tr = tb.children[r]; if (!tr) continue;
    for (let c = c1; c <= c2; c++) {
      const inp = tr.children[c]?.querySelector('input.c:not(.vl)'); if (!inp) continue;
      const nv = srcVals[c - c1], ov = inp.value; if (nv === ov) continue;
      inp.value = nv; inp.dataset.o = nv;
      const rawId = inp.dataset.id, id = String(rawId).startsWith('new_') ? rawId : +rawId;
      const f = inp.dataset.f, t = inp.dataset.t;
      const arr = t === 's' ? state.shipD : t === 'p' ? state.prodD : state.mergeD;
      const row = arr.find(x => String(x._id) === String(id)); if (row) row[f] = nv || null;
      us.push({ id, t, f, ov, nv: nv || null }); const td_ = tr.children[c]; td_.classList.add('chg'); setTimeout(() => td_.classList.remove('chg'), 600); n++;
    }
  }
  if (us.length) { pushUndo(us); batchTrack(us); }
  rebuildTft(); markDupDirty(); saveCache(state.shipD, state.prodD);
  if (n) toast(n + '셀 아래로 채우기', 'ok');
}

export function fillRight() {
  if (!state.sel || !state.range) return;
  const { tb } = state.sel;
  const r1 = Math.min(state.range.r1, state.range.r2), r2 = Math.max(state.range.r1, state.range.r2);
  const c1 = Math.min(state.range.c1, state.range.c2), c2 = Math.max(state.range.c1, state.range.c2);
  if (c1 === c2) return;
  const us = []; let n = 0;
  for (let r = r1; r <= r2; r++) {
    const tr = tb.children[r]; if (!tr) continue;
    const srcInp = tr.children[c1]?.querySelector('input.c'); const srcV = srcInp ? srcInp.value : '';
    for (let c = c1 + 1; c <= c2; c++) {
      const inp = tr.children[c]?.querySelector('input.c:not(.vl)'); if (!inp) continue;
      const ov = inp.value; if (srcV === ov) continue;
      inp.value = srcV; inp.dataset.o = srcV;
      const rawId = inp.dataset.id, id = String(rawId).startsWith('new_') ? rawId : +rawId;
      const f = inp.dataset.f, t = inp.dataset.t;
      const arr = t === 's' ? state.shipD : t === 'p' ? state.prodD : state.mergeD;
      const row = arr.find(x => String(x._id) === String(id)); if (row) row[f] = srcV || null;
      us.push({ id, t, f, ov, nv: srcV || null }); const td_ = tr.children[c]; td_.classList.add('chg'); setTimeout(() => td_.classList.remove('chg'), 600); n++;
    }
  }
  if (us.length) { pushUndo(us); batchTrack(us); }
  rebuildTft(); markDupDirty(); saveCache(state.shipD, state.prodD);
  if (n) toast(n + '셀 오른쪽으로 채우기', 'ok');
}

function batchTrack(us) {
  us.forEach(u => {
    const dbt = u.t === 's' ? 'shipment' : u.t === 'p' ? 'production' : u.t === 'm' ? 'shipment' : null;
    if (u.t === 'm') { const orig = state.shipD.find(x => String(x._id) === String(u.id)); if (orig) orig[u.f] = u.nv; }
    if (dbt) trackUpdate(dbt, u.id, u.f, u.nv);
  });
}

// ── Paste Event Listener ──
export function initPasteHandler() {
  document.addEventListener('paste', function (e) {
    try {
      if (e.target.tagName === 'TEXTAREA') return;
      if (e.target.closest?.('.sbox')) return;
      if (!state.sel) return;
      state.pasteHandled = true;
      const cd = e.clipboardData || window.clipboardData;
      let html = '', t = '';
      try { html = cd ? cd.getData('text/html') : ''; } catch (x) { html = ''; }
      try { t = cd ? cd.getData('text/plain') || cd.getData('text') || '' : ''; } catch (x) { t = ''; }
      if (!html && !t) {
        e.preventDefault();
        if (state.editing) { state.editing = false; if (state.sel?.inp) { state.sel.inp.classList.remove('edit'); state.sel.inp.dataset.o = state.sel.inp.value; } }
        if (state.internalClip) pasteGrid(state.internalClip);
        return;
      }
      const isMulti = (html && /<tr[\s>]/i.test(html)) || /\t/.test(t) || (t.split(/\r?\n/).filter(l => l).length > 1);
      if (state.editing && !isMulti) return;
      e.preventDefault();
      if (state.editing) { state.editing = false; if (state.sel?.inp) { state.sel.inp.classList.remove('edit'); state.sel.inp.dataset.o = state.sel.inp.value; } }
      if (html) {
        try {
          const doc2 = new DOMParser().parseFromString(html, 'text/html');
          const rows = doc2.querySelectorAll('tr');
          if (rows.length) {
            const tsv = [];
            for (let i = 0; i < rows.length; i++) {
              const cells = rows[i].querySelectorAll('td,th'); const rv = [];
              for (let j = 0; j < cells.length; j++) rv.push((cells[j].innerText || cells[j].textContent || '').replace(/\r?\n/g, ' ').trim());
              tsv.push(rv.join('\t'));
            }
            const tsvStr = tsv.join('\n');
            if (tsvStr) { pasteGrid(tsvStr); return; }
          }
        } catch (x) {}
      }
      if (t) pasteGrid(t);
    } catch (err) {
      console.error('Paste error:', err);
      if (state.internalClip && state.sel) { try { e.preventDefault(); } catch (x) {} pasteGrid(state.internalClip); }
    }
  });
}

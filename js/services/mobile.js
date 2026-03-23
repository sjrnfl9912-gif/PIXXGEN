// ═══════════════════════════════════════
// MOBILE TOUCH + PROXY KEYBOARD
// ═══════════════════════════════════════
import { state } from '../state.js';
import { cellPos, selCell, clearSelection } from '../modules/selection.js';
import { startEdit, endEdit } from '../modules/editing.js';
import { moveSel } from '../modules/selection.js';

let lastTap = 0, lastTapTd = null;
let _ts = { x: 0, y: 0, td: null, inp: null, isDoubleTap: false };
let _mpTgt = null;

export function init() {
  // Touch events
  document.addEventListener('touchstart', e => {
    const td = e.target.closest('td');
    if (!td || !td.closest('table.g tbody')) return;
    if (e.target.classList.contains('fh')) return;
    const touch = e.touches[0];
    const inp = td.querySelector('input.c:not(.vl)');
    const now = Date.now();
    const isDoubleTap = now - lastTap < 350 && lastTapTd === td;
    lastTap = isDoubleTap ? 0 : now; lastTapTd = isDoubleTap ? null : td;
    _ts = { x: touch.clientX, y: touch.clientY, td, inp, isDoubleTap };
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!_ts.td) return;
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - _ts.x) > 4 || Math.abs(touch.clientY - _ts.y) > 4) {
      _ts.isDoubleTap = false; _ts.td = null;
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!_ts.td) return;
    if (_ts.isDoubleTap && _ts.inp && !_ts.inp.classList.contains('vl')) {
      if (!state.editing) {
        clearSelection(); endEdit();
        _ts.td.classList.add('sel');
        const { r, c, tb } = cellPos(_ts.td);
        state.sel = { td: _ts.td, inp: _ts.inp, r, c, tb };
        state.range = { r1: r, c1: c, r2: r, c2: c };
        _ts.inp.readOnly = false; _ts.inp.classList.add('edit');
        _ts.inp.dataset.bk = _ts.inp.value;
        state.editing = true;
        _mpEnter(_ts.td, _ts.inp);
      }
    } else {
      if (state.sel && state.sel.td === _ts.td && !state.editing && _ts.inp && !_ts.inp.classList.contains('vl')) {
        _ts.inp.readOnly = false; _ts.inp.classList.add('edit');
        _ts.inp.dataset.bk = _ts.inp.value;
        state.editing = true; _mpEnter(_ts.td, _ts.inp);
      } else {
        selCell(_ts.td, _ts.inp);
      }
    }
    _ts.td = null;
  });

  // Proxy keyboard for KakaoTalk webview
  const px = document.getElementById('mob-proxy'); if (!px) return;
  px.addEventListener('input', () => { if (_mpTgt) _mpTgt.value = px.value; });
  px.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); _mpSync(); endEdit(); _mpStop(); if (state.sel) moveSel(1, 0, false); }
    else if (e.key === 'Tab') { e.preventDefault(); _mpSync(); endEdit(); _mpStop(); if (state.sel) moveSel(0, e.shiftKey ? -1 : 1, false); }
    else if (e.key === 'Escape') { e.preventDefault(); if (_mpTgt) { _mpTgt.value = _mpTgt.dataset.bk || _mpTgt.dataset.o; _mpTgt.readOnly = true; _mpTgt.classList.remove('edit'); } state.editing = false; _mpStop(); }
  });
  px.addEventListener('blur', () => { if (!_mpTgt) return; setTimeout(() => { if (_mpTgt) { _mpSync(); endEdit(); _mpStop(); } }, 200); });
}

function _mpEnter(td, inp) {
  const px = document.getElementById('mob-proxy'); if (!px) return;
  _mpTgt = inp; px.value = inp.value;
  const r = td.getBoundingClientRect();
  px.style.left = Math.max(0, r.left) + 'px'; px.style.top = Math.max(0, r.top) + 'px';
  px.style.width = r.width + 'px'; px.style.pointerEvents = 'auto';
  px.focus(); px.setSelectionRange(px.value.length, px.value.length);
}
function _mpSync() { if (_mpTgt && document.getElementById('mob-proxy')) _mpTgt.value = document.getElementById('mob-proxy').value; }
function _mpStop() { _mpTgt = null; const px = document.getElementById('mob-proxy'); if (!px) return; px.style.pointerEvents = 'none'; px.style.left = '-600px'; }

export { _mpSync, _mpStop };

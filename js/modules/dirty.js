// ═══════════════════════════════════════
// DIRTY TRACKING + BATCH SAVE
// ═══════════════════════════════════════
import { getSupabase } from '../config.js';
import { state, rebuildTft, markDupDirty } from '../state.js';
import { renderAll } from './table.js';
import { saveCache } from '../services/storage.js';
import { toast } from '../services/ui.js';
import { dbFetchAll } from '../db.js';

let isSaving = false;

export async function saveAll() {
  // 중복 저장 방지
  if (isSaving) { toast('저장 진행 중...', 'info'); return; }
  const { endEdit } = await import('./editing.js');
  endEdit();
  if (!state.hasChanges) { toast('변경사항 없음', 'info'); return; }
  const sb = getSupabase(); if (!sb) { toast('DB 연결 실패', 'er'); return; }
  isSaving = true;
  const btn = document.getElementById('saveBtn');
  const status = document.getElementById('saveStatus');
  if (btn) { btn.disabled = true; btn.textContent = '💾 저장 중...'; }

  try {
    const errors = []; let updCnt = 0;

    // 1. Updates
    const updates = Object.values(state.dirty.updates);
    if (updates.length) {
      const results = await Promise.allSettled(updates.map(u => sb.from(u.table).update(u.fields).eq('id', u.id)));
      const failed = {};
      results.forEach((r, i) => {
        if (r.status === 'rejected' || r.value?.error) { const u = updates[i]; failed[u.table + ':' + u.id] = u; errors.push('수정 실패: ' + u.id); }
        else updCnt++;
      });
      state.dirty.updates = failed;
    } else state.dirty.updates = {};

    // 2. Deletes
    if (state.dirty.deletes.ship.length) {
      const { error } = await sb.from('shipment').delete().in('id', state.dirty.deletes.ship);
      if (error) errors.push('출하 삭제 실패'); else state.dirty.deletes.ship = [];
    }
    if (state.dirty.deletes.prod.length) {
      const { error } = await sb.from('production').delete().in('id', state.dirty.deletes.prod);
      if (error) errors.push('생산 삭제 실패'); else state.dirty.deletes.prod = [];
    }

    // 3. Inserts
    if (state.dirty.inserts.ship.length) {
      const localCopy = [...state.dirty.inserts.ship];
      const rows = localCopy.map(r => { const o = { ...r }; delete o._id; delete o._new; return o; });
      const { data, error } = await sb.from('shipment').insert(rows).select();
      if (error) { console.error('출하 추가 실패:', error); errors.push('출하 추가 실패: ' + (error.message || error.code || '')); }
      else {
        if (data) data.forEach((dbRow, i) => {
          const local = localCopy[i];
          if (local) {
            const idx = state.shipD.findIndex(r => r._id === local._id);
            if (idx >= 0) { state.shipD[idx] = { ...dbRow, _id: dbRow.id }; }
          }
        });
        state.dirty.inserts.ship = state.dirty.inserts.ship.filter(r => !localCopy.includes(r));
      }
    }
    if (state.dirty.inserts.prod.length) {
      const localCopy = [...state.dirty.inserts.prod];
      const rows = localCopy.map(r => { const o = { ...r }; delete o._id; delete o._new; return o; });
      const { data, error } = await sb.from('production').insert(rows).select();
      if (error) { console.error('생산 추가 실패:', error); errors.push('생산 추가 실패: ' + (error.message || error.code || '')); }
      else {
        if (data) data.forEach((dbRow, i) => {
          const local = localCopy[i];
          if (local) {
            const idx = state.prodD.findIndex(r => r._id === local._id);
            if (idx >= 0) { state.prodD[idx] = { ...dbRow, _id: dbRow.id }; }
          }
        });
        state.dirty.inserts.prod = state.dirty.inserts.prod.filter(r => !localCopy.includes(r));
      }
    }

    const stillDirty = Object.keys(state.dirty.updates).length || state.dirty.inserts.ship.length || state.dirty.inserts.prod.length || state.dirty.deletes.ship.length || state.dirty.deletes.prod.length;
    if (!stillDirty) {
      state.hasChanges = false;
      if (btn) btn.classList.remove('dirty');
      if (status) { status.textContent = '저장 완료'; status.style.color = 'var(--ok)'; }
    } else if (status) { status.textContent = '일부 실패 (' + errors.length + '건)'; status.style.color = 'var(--er)'; }

    saveCache(state.shipD, state.prodD); rebuildTft(); renderAll();
    if (errors.length) {
      toast('일부 저장 실패: ' + errors.join(', '), 'er');
    } else {
      toast('저장 완료 — DB 동기화 중...', 'ok');
      // 저장 성공 후 DB에서 최신 데이터 다시 로드 (데이터 정합성 보장)
      try {
        state.isReloading = true;
        const [sData, pData] = await Promise.all([dbFetchAll('shipment'), dbFetchAll('production')]);
        state.shipD = sData.map(r => ({ ...r, _id: r.id }));
        state.prodD = pData.map(r => ({ ...r, _id: r.id }));
        rebuildTft(); markDupDirty(); renderAll(); saveCache(state.shipD, state.prodD);
        toast('저장 및 동기화 완료', 'ok');
      } catch (re) {
        console.warn('저장 후 동기화 실패:', re);
      } finally {
        state.isReloading = false;
      }
    }
  } catch (e) {
    console.error(e); toast('저장 실패: ' + e.message, 'er');
  } finally {
    isSaving = false;
    if (btn) { btn.disabled = false; btn.textContent = '💾 저장'; }
  }
}

export function deleteRows() {
  if (!state.sel || !state.range) return;
  const { tb } = state.sel;
  const r1 = Math.min(state.range.r1, state.range.r2), r2 = Math.max(state.range.r1, state.range.r2);
  const cnt = r2 - r1 + 1;
  const { customConfirm } = import('../services/ui.js').then ? { customConfirm: null } : {};
  import('../services/ui.js').then(ui => {
    ui.customConfirm(cnt + '행을 삭제하시겠습니까?', () => {
      const tblKey = tb.id === 'b1' ? 's' : tb.id === 'b2' ? 'p' : 'm';
      const arr = tblKey === 's' ? state.shipD : tblKey === 'p' ? state.prodD : state.mergeD;
      const delKey = tblKey === 's' ? 'ship' : 'prod';
      for (let r = r1; r <= r2; r++) {
        const inp = tb.children[r]?.querySelector('input.c'); if (!inp) continue;
        const id = inp.dataset.id, isNew = String(id).startsWith('new_');
        if (isNew) { const idx = state.dirty.inserts[delKey].findIndex(r => r._id === id); if (idx >= 0) state.dirty.inserts[delKey].splice(idx, 1); }
        else { state.dirty.deletes[delKey].push(+id); const tbl = delKey === 'ship' ? 'shipment' : 'production'; delete state.dirty.updates[tbl + ':' + id]; }
        const i = arr.findIndex(r => String(r._id) === String(id)); if (i >= 0) arr.splice(i, 1);
      }
      import('./selection.js').then(sel => { sel.clearSelection(); });
      state.sel = null; state.range = null;
      import('../state.js').then(s => s.markDirty());
      rebuildTft(); markDupDirty(); renderAll(); saveCache(state.shipD, state.prodD);
      toast(cnt + '행 삭제 (저장 시 DB 반영)', 'info');
    });
  });
}

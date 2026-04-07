// ═══════════════════════════════════════
// SUPABASE REALTIME SYNC
// ═══════════════════════════════════════
import { getSupabase } from '../config.js';
import { state, markDupDirty } from '../state.js';
import { renderAll } from '../modules/table.js';
import { saveCache } from './storage.js';

// dirty(수정/삭제 예정) 상태인 행의 ID 집합 반환
function getDirtyIds(table) {
  const ids = new Set();
  // updates에서 해당 테이블의 dirty ID 수집
  Object.values(state.dirty.updates).forEach(u => {
    if (u.table === table) ids.add(u.id);
  });
  // deletes에서 해당 테이블의 dirty ID 수집
  const delKey = table === 'shipment' ? 'ship' : 'prod';
  state.dirty.deletes[delKey].forEach(id => ids.add(id));
  return ids;
}

function rtHandle(arr, table, p) {
  // DB 전체 리로드 중이면 realtime 이벤트 무시 (충돌 방지)
  if (state.isReloading) return;

  const dirtyIds = getDirtyIds(table);

  if (p.eventType === 'INSERT') {
    if (!arr.find(r => r._id === p.new.id)) { p.new._id = p.new.id; arr.push(p.new); }
  } else if (p.eventType === 'UPDATE') {
    // 로컬에서 수정 중인 행이면 realtime 업데이트 무시 (로컬 변경 보호)
    if (dirtyIds.has(p.new.id)) return;
    const i = arr.findIndex(r => r._id === p.new.id);
    if (i >= 0) { p.new._id = p.new.id; arr[i] = p.new; }
  } else if (p.eventType === 'DELETE') {
    // 로컬에서 삭제 예정인 행이면 무시
    if (dirtyIds.has(p.old.id)) return;
    const i = arr.findIndex(r => r._id === p.old.id);
    if (i >= 0) arr.splice(i, 1);
  }
  markDupDirty(); saveCache(state.shipD, state.prodD);
}

export function initRealtime() {
  const sb = getSupabase(); if (!sb) return;
  try {
    sb.channel('rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipment' }, p => { rtHandle(state.shipD, 'shipment', p); renderAll(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production' }, p => { rtHandle(state.prodD, 'production', p); import('../state.js').then(s => s.rebuildTft()); renderAll(); })
      .subscribe();
  } catch (e) {
    console.warn('Realtime subscription failed:', e);
  }
}

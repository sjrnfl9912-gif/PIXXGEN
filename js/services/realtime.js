// ═══════════════════════════════════════
// SUPABASE REALTIME SYNC
// ═══════════════════════════════════════
import { getSupabase } from '../config.js';
import { state, markDupDirty, invalidateAllTabs } from '../state.js';
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
  markDupDirty();
}

// 이벤트마다 표 전체를 다시 그리면 17:00 자동 업로드(수천 행 교체) 때 브라우저가 멈춤.
//  → 이벤트는 데이터에만 즉시 반영하고, 화면은 잠잠해진 뒤 한 번만 다시 그림.
let renderTimer = null, prodTouched = false;
function scheduleRender(isProd) {
  if (isProd) prodTouched = true;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    const doRender = () => { invalidateAllTabs(); renderAll(); saveCache(state.shipD, state.prodD); };
    if (prodTouched) { prodTouched = false; import('../state.js').then(s => { s.rebuildTft(); doRender(); }); }
    else doRender();
  }, 400);
}

export function initRealtime() {
  const sb = getSupabase(); if (!sb) return;
  try {
    sb.channel('rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipment' }, p => { rtHandle(state.shipD, 'shipment', p); scheduleRender(false); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production' }, p => { rtHandle(state.prodD, 'production', p); scheduleRender(true); })
      .subscribe();
  } catch (e) {
    console.warn('Realtime subscription failed:', e);
  }
}

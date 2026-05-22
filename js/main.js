// ═══════════════════════════════════════
// MAIN.JS - Application Orchestrator
// ═══════════════════════════════════════
import { SHIP_FIELDS, PROD_FIELDS } from './config.js';
import { state, rebuildTft, rebuildDetTft, markDirty, markDupDirty, invalidateOtherTabs, invalidateAllTabs } from './state.js';
import { dbFetchAll } from './db.js';
import { renderAll, renderShipmentTable, renderProductionTable, renderHistNeedTable, updateTabCounts, initHistNeed } from './modules/table.js';
import { saveCache, saveTftmCache, loadCache } from './services/storage.js';
import { toast, showLoading, customConfirm } from './services/ui.js';
import { init as initSelection } from './modules/selection.js';
import { init as initFill } from './modules/fill.js';
import { init as initContextMenu } from './modules/context-menu.js';
import { init as initKeyboard } from './services/keyboard.js';
import { init as initMobile } from './services/mobile.js';
import { initRealtime } from './services/realtime.js';
import { initKPI } from './modules/kpi.js';
import { backupJSON, restoreJSON, exportAll } from './modules/export.js';
import { buildMerge } from './modules/merge.js';
import { saveAll } from './modules/dirty.js';
import { initResize } from './modules/resize.js';

// ═══ ROW OPERATIONS ═══
export function addRow(type) {
  if (type === 'ship') {
    const n = state.shipD.reduce((m, r) => Math.max(m, r.row_no || 0), 0) + 1;
    const newRow = { _id: 'new_' + Date.now(), _new: true, row_no: n };
    SHIP_FIELDS.forEach(f => { if (!newRow[f]) newRow[f] = null; });
    state.shipD.push(newRow); state.dirty.inserts.ship.push(newRow);
    markDirty(); markDupDirty(); invalidateOtherTabs(); renderShipmentTable();
  } else {
    const w = state.workerFilt !== 'all' ? state.workerFilt : null;
    // 제작완료일은 오늘 날짜로 프리필 — 현재 연도 필터에 들어와서 새 행이 바로 보임.
    const todayStr = new Date().toISOString().slice(0, 10);
    const newRow = { _id: 'new_' + Date.now(), _new: true, worker: w, completed_date: todayStr };
    PROD_FIELDS.forEach(f => { if (!(f in newRow)) newRow[f] = null; });
    state.prodD.push(newRow); state.dirty.inserts.prod.push(newRow);
    markDirty(); markDupDirty(); rebuildTft(); invalidateOtherTabs(); renderProductionTable();
  }
  const tbId = type === 'ship' ? 'b1' : 'b2';
  setTimeout(() => { const tb = document.getElementById(tbId); const last = tb?.lastElementChild; if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
  saveCache(state.shipD, state.prodD);
  toast('행 추가됨 (저장 버튼으로 DB 반영)', 'info');
}

function cleanNull(type) {
  const arr = type === 'ship' ? state.shipD : state.prodD;
  const delKey = type === 'ship' ? 'ship' : 'prod';
  const keyF = type === 'ship' ? ['product_name', 'detector_sn', 'company', 'country'] : ['prod_no', 'tft_sn', 'cpu_sn', 'main_board_sn'];
  const nullRows = arr.filter(r => keyF.every(f => !r[f]));
  if (!nullRows.length) { toast('빈 행이 없습니다', 'info'); return; }
  customConfirm(nullRows.length + '개 빈 행을 삭제하시겠습니까?', () => {
    nullRows.forEach(r => {
      const isNew = String(r._id).startsWith('new_');
      if (isNew) { const idx = state.dirty.inserts[delKey].findIndex(x => x._id === r._id); if (idx >= 0) state.dirty.inserts[delKey].splice(idx, 1); }
      else { state.dirty.deletes[delKey].push(+r._id); const tbl = delKey === 'ship' ? 'shipment' : 'production'; delete state.dirty.updates[tbl + ':' + r._id]; }
      const i = arr.findIndex(x => x._id === r._id); if (i >= 0) arr.splice(i, 1);
    });
    markDirty(); if (type === 'prod') rebuildTft();
    markDupDirty(); invalidateOtherTabs(); renderAll(); saveCache(state.shipD, state.prodD);
    toast(nullRows.length + '개 빈 행 삭제 (저장 시 DB 반영)', 'info');
  });
}

// ═══ DB LOAD ═══
async function fullReload() {
  // 미저장 변경사항이 있으면 사용자에게 경고
  if (state.hasChanges) {
    const proceed = await new Promise(resolve => {
      customConfirm('저장하지 않은 변경사항이 있습니다. DB에서 다시 불러오면 변경사항이 사라집니다.\n계속하시겠습니까?', () => resolve(true), () => resolve(false));
    });
    if (!proceed) { toast('동기화 취소됨', 'info'); return; }
  }
  state.isReloading = true;
  toast('DB 전체 동기화 중...', 'info');
  try {
    const [sData, pData, tData, fiData] = await Promise.all([
      dbFetchAll('shipment'), dbFetchAll('production'), dbFetchAll('tft_match'),
      dbFetchAll('folder_issues').catch(() => [])    // 테이블 미생성 시 graceful
    ]);
    state.shipD = sData.map(r => ({ ...r, _id: r.id }));
    state.prodD = pData.map(r => ({ ...r, _id: r.id }));
    state.tftmD = tData;
    state.folderIssues = fiData || [];
    // dirty 상태 초기화 (DB 데이터로 완전 교체했으므로)
    state.dirty = { updates: {}, inserts: { ship: [], prod: [] }, deletes: { ship: [], prod: [] } };
    state.hasChanges = false;
    const btn = document.getElementById('saveBtn');
    const status = document.getElementById('saveStatus');
    if (btn) btn.classList.remove('dirty');
    if (status) { status.textContent = ''; status.style.color = ''; }
    rebuildTft(); rebuildDetTft(); markDupDirty(); invalidateAllTabs(); renderAll(); updateTabCounts();
    saveCache(state.shipD, state.prodD); saveTftmCache(state.tftmD);
    document.querySelector('.sync-dot').style.background = 'var(--ok)';
    toast('DB 동기화 완료 (출하 ' + state.shipD.length + ' / 생산 ' + state.prodD.length + ')', 'ok');
  } catch (e) {
    console.error(e); toast('DB 연결 실패', 'er');
    document.querySelector('.sync-dot').style.background = 'var(--er)';
  } finally {
    state.isReloading = false;
  }
}

// ═══ DEBOUNCE ═══
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ═══ TAB SWITCHING ═══
const TB_BY_TAB = { ship: 'b1', prod: 'b2', merge: 'b3', tftm: 'b4', histneed: 'b5' };

function switchTab(t, skipRender) {
  state.curTab = t;
  // 탭이 바뀌면 이전 탭의 선택/편집 상태는 무효 (사라질 DOM을 가리킴)
  state.sel = null; state.range = null; state.editing = false;
  document.querySelectorAll('.tab').forEach(e => e.classList.remove('on'));
  document.querySelector('.tab[data-tab="' + t + '"]')?.classList.add('on');
  document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
  document.getElementById('v-' + t)?.classList.add('active');
  // 다른 탭 DOM은 유지 — 재방문 시 재렌더 없이 즉시 표시. 데이터 변경 시 invalidateOtherTabs로 stale 표시됨.
  if (skipRender) return;
  // 이미 렌더된 적 있고 stale 아님 → 재렌더 생략 (탭 전환 즉시)
  if (state.tabRendered[t]) return;
  // 통합취합본은 탭 들어갈 때마다 자동 취합 (수동 버튼 없이 최신 상태)
  if (t === 'merge') buildMerge();
  else renderAll();
}

// ═══ PASTE FROM CLIPBOARD (toolbar button) ═══
function pasteFromClipboard(type) {
  if (state.curTab !== type) { toast('해당 탭에서 셀을 먼저 선택하세요', 'info'); return; }
  if (!state.sel) { toast('붙여넣을 셀을 먼저 클릭하세요', 'info'); return; }
  const apply = txt => {
    if (!txt) { toast('클립보드가 비어 있습니다', 'info'); return; }
    import('./modules/clipboard.js').then(c => c.pasteGrid(txt));
  };
  if (navigator.clipboard?.readText) {
    navigator.clipboard.readText()
      .then(apply)
      .catch(() => {
        if (state.internalClip) apply(state.internalClip);
        else toast('클립보드 접근 거부됨 — Ctrl+V를 사용하세요', 'info');
      });
  } else if (state.internalClip) {
    apply(state.internalClip);
  } else {
    toast('이 브라우저는 클립보드 읽기를 지원하지 않습니다 — Ctrl+V를 사용하세요', 'info');
  }
}

// ═══ INIT ═══
async function init() {
  // Tab navigation
  document.querySelectorAll('.tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Filters (ship)
  document.querySelectorAll('[data-filter][data-table="ship"]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-filter][data-table="ship"]').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      state.shipFilt = chip.dataset.filter;
      renderShipmentTable();
    });
  });

  // Filters (prod)
  document.querySelectorAll('[data-filter][data-table="prod"]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-filter][data-table="prod"]').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      state.workerFilt = chip.dataset.filter;
      renderProductionTable();
    });
  });

  // Year filter (prod) — 칩이 데이터 기준으로 동적 생성되므로 이벤트 위임
  document.getElementById('prodYearChips')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-yearfilter]');
    if (!chip) return;
    state.prodYearFilt = chip.dataset.yearfilter;
    document.querySelectorAll('#prodYearChips .chip').forEach(c => c.classList.toggle('on', c === chip));
    renderProductionTable();
  });

  // Search boxes
  const dR1 = debounce(() => renderShipmentTable(), 200);
  const dR2 = debounce(() => renderProductionTable(), 200);
  const dR3 = debounce(() => { import('./modules/table.js').then(t => t.renderAll()); }, 200);
  const dR4 = debounce(() => renderAll(), 200);
  const dR5 = debounce(() => renderHistNeedTable(), 200);   // 이력 필요 목록만 (큐·폼 포커스 보존)
  document.getElementById('q1')?.addEventListener('input', e => { e.target.parentElement.classList.toggle('has-val', !!e.target.value); dR1(); });
  document.getElementById('q2')?.addEventListener('input', e => { e.target.parentElement.classList.toggle('has-val', !!e.target.value); dR2(); });
  document.getElementById('q3')?.addEventListener('input', e => { e.target.parentElement.classList.toggle('has-val', !!e.target.value); dR3(); });
  document.getElementById('q4')?.addEventListener('input', e => { e.target.parentElement.classList.toggle('has-val', !!e.target.value); dR4(); });
  document.getElementById('q5')?.addEventListener('input', e => { e.target.parentElement.classList.toggle('has-val', !!e.target.value); dR5(); });

  // Clear buttons
  document.querySelectorAll('.s-clear').forEach(btn => {
    btn.addEventListener('click', () => { const inp = btn.parentElement.querySelector('input'); inp.value = ''; inp.parentElement.classList.remove('has-val'); renderAll(); });
  });

  // Toolbar toggle (mobile)
  document.querySelectorAll('.toolbar-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const ex = btn.closest('.toolbar')?.querySelector('.toolbar-extras');
      if (ex) { const open = ex.classList.toggle('open'); btn.textContent = open ? '필터 ▲' : '필터 ▼'; }
    });
  });

  // Duplicate toggle
  document.getElementById('dupChip1')?.addEventListener('click', () => { state.dupMode.ship = !state.dupMode.ship; document.getElementById('dupChip1').classList.toggle('on', state.dupMode.ship); renderShipmentTable(); });
  document.getElementById('dupChip2')?.addEventListener('click', () => { state.dupMode.prod = !state.dupMode.prod; document.getElementById('dupChip2').classList.toggle('on', state.dupMode.prod); renderProductionTable(); });

  // Main buttons
  document.getElementById('saveBtn')?.addEventListener('click', saveAll);
  document.getElementById('backupBtn')?.addEventListener('click', backupJSON);
  document.getElementById('restoreBtn')?.addEventListener('click', () => document.getElementById('restoreFile')?.click());
  document.getElementById('restoreFile')?.addEventListener('change', e => restoreJSON(e.target));
  document.getElementById('reloadBtn')?.addEventListener('click', fullReload);
  document.getElementById('exportBtn')?.addEventListener('click', exportAll);
  document.getElementById('buildMergeBtn')?.addEventListener('click', () => { switchTab('merge', true); buildMerge(); });

  // Modal buttons
  document.getElementById('modalCloseBtn')?.addEventListener('click', () => document.getElementById('modalBg')?.classList.remove('show'));
  document.getElementById('modalBg')?.addEventListener('click', e => { if (e.target === document.getElementById('modalBg')) document.getElementById('modalBg').classList.remove('show'); });

  // Help modal (사용 설명서)
  const helpBg = document.getElementById('helpBg');
  document.getElementById('helpBtn')?.addEventListener('click', () => helpBg?.classList.add('show'));
  document.getElementById('helpClose')?.addEventListener('click', () => helpBg?.classList.remove('show'));
  helpBg?.addEventListener('click', e => {
    if (e.target === helpBg) { helpBg.classList.remove('show'); return; }
    const cp = e.target.closest('.hg-copy');
    if (cp) {
      navigator.clipboard?.writeText(cp.dataset.path);
      toast('경로 복사됨 — 파일 탐색기 주소창에 붙여넣기(Ctrl+V)', 'ok');
    }
  });

  // TFT match button
  document.getElementById('tftMatchBtn')?.addEventListener('click', () => { /* TODO: TFT modal */ toast('TFT 매칭 모달 (준비 중)', 'info'); });

  // Paste buttons — 클립보드를 읽어 선택 셀부터 붙여넣기
  document.getElementById('pasteShipBtn')?.addEventListener('click', () => pasteFromClipboard('ship'));
  document.getElementById('pasteProdBtn')?.addEventListener('click', () => pasteFromClipboard('prod'));

  // Clean null buttons
  document.getElementById('cleanShipBtn')?.addEventListener('click', () => cleanNull('ship'));
  document.getElementById('cleanProdBtn')?.addEventListener('click', () => cleanNull('prod'));

  // Add row buttons
  document.querySelectorAll('.addrow[data-table]').forEach(btn => {
    btn.addEventListener('click', () => addRow(btn.dataset.table));
  });

  // Floating scroll-to-bottom button
  const fab = document.getElementById('fabBottom');
  if (fab) {
    fab.addEventListener('click', () => {
      const tw = document.querySelector('.tab-view.active .tw');
      if (tw) tw.scrollTo({ top: tw.scrollHeight, behavior: 'smooth' });
    });
    // Show/hide based on scroll position
    document.addEventListener('scroll', e => {
      const tw = e.target.closest?.('.tw');
      if (!tw) return;
      const nearBottom = tw.scrollHeight - tw.scrollTop - tw.clientHeight < 200;
      fab.classList.toggle('show', !nearBottom && tw.scrollHeight > tw.clientHeight + 300);
    }, true);
  }

  // Beforeunload warning
  window.addEventListener('beforeunload', e => { if (state.hasChanges) { e.preventDefault(); e.returnValue = ''; } });

  // ═══ INIT MODULES ═══
  initSelection();
  initFill();
  initContextMenu();
  initKeyboard();
  initMobile();
  initKPI();
  initHistNeed();

  // ═══ LOAD DATA ═══
  // Try cache first for instant display
  const { ship, prod, tftm } = loadCache();
  if (ship.length || prod.length || tftm.length) {
    state.shipD = ship; state.prodD = prod; state.tftmD = tftm;
    rebuildTft(); rebuildDetTft(); markDupDirty(); invalidateAllTabs(); renderAll(); updateTabCounts();
    toast('캐시 로드 (' + ship.length + '/' + prod.length + '건)', 'info');
    // 캐시로 화면이 이미 채워졌으니 로딩 오버레이 즉시 제거 (DB 동기화는 백그라운드 진행)
    showLoading(false);
    const ov = document.getElementById('loadingOverlay');
    if (ov) ov.remove();
  }

  // Then full DB sync (초기 로드 시에는 확인 없이 바로 동기화)
  state.isReloading = true;
  try {
    const [sData, pData, tData, fiData] = await Promise.all([
      dbFetchAll('shipment'), dbFetchAll('production'), dbFetchAll('tft_match'),
      dbFetchAll('folder_issues').catch(() => [])    // 테이블 미생성 시 graceful
    ]);
    state.shipD = sData.map(r => ({ ...r, _id: r.id }));
    state.prodD = pData.map(r => ({ ...r, _id: r.id }));
    state.tftmD = tData;
    state.folderIssues = fiData || [];
    state.dirty = { updates: {}, inserts: { ship: [], prod: [] }, deletes: { ship: [], prod: [] } };
    state.hasChanges = false;
    rebuildTft(); rebuildDetTft(); markDupDirty(); invalidateAllTabs(); renderAll(); updateTabCounts();
    saveCache(state.shipD, state.prodD); saveTftmCache(state.tftmD);
    document.querySelector('.sync-dot').style.background = 'var(--ok)';
    toast('DB 동기화 완료 (출하 ' + state.shipD.length + ' / 생산 ' + state.prodD.length + ')', 'ok');
  } catch (e) {
    console.error(e); toast('DB 연결 실패 - 캐시 데이터 사용 중', 'er');
    document.querySelector('.sync-dot').style.background = 'var(--er)';
  } finally {
    state.isReloading = false;
  }

  // Init realtime after data loaded
  initRealtime();

  // Post-render: init resize on visible tables
  setTimeout(() => { initResize('b1'); initResize('b2'); initResize('b3'); initResize('b4'); }, 100);

  // Hide loading
  showLoading(false);
  setTimeout(() => { const ov = document.getElementById('loadingOverlay'); if (ov) ov.remove(); }, 300);
}

document.addEventListener('DOMContentLoaded', init);

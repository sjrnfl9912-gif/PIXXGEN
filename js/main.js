// ═══════════════════════════════════════
// MAIN.JS - Application Orchestrator
// ═══════════════════════════════════════
import { SHIP_FIELDS, PROD_FIELDS } from './config.js';
import { state, rebuildTft, rebuildDetTft, markDirty, markDupDirty, invalidateOtherTabs, invalidateAllTabs } from './state.js';
import { dbFetchAll } from './db.js';
import { renderAll, renderShipmentTable, renderProductionTable, renderHistNeedTable, updateTabCounts, initHistNeed, initMergeEditClicks } from './modules/table.js';
import { initAuditQueue, loadRestockConf } from './modules/audit-ui.js';
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
import { jumpToEnd } from './modules/lazy.js';
import { initEditMode, requireEdit } from './services/editmode.js';
import { ensureViewAccess } from './services/viewgate.js';
import { initRunLog } from './services/runlog.js';
import { initPCB, renderPCB } from './modules/pcb.js';

// ═══ ROW OPERATIONS ═══
export function addRow(type) {
  if (!requireEdit()) return;
  if (type === 'ship') {
    const n = state.shipD.reduce((m, r) => Math.max(m, r.row_no || 0), 0) + 1;
    const newRow = { _id: 'new_' + Date.now(), _new: true, row_no: n };
    SHIP_FIELDS.forEach(f => { if (!newRow[f]) newRow[f] = null; });
    state.shipD.push(newRow); state.dirty.inserts.ship.push(newRow);
    markDirty(); markDupDirty(); invalidateOtherTabs(); renderShipmentTable();
  } else {
    const w = state.workerFilt !== 'all' ? state.workerFilt : null;
    // 신규 행 프리필 — 작업자(필터값) + 제작완료일(오늘) + 중판 TYPE 표준값(AL(1.5T))
    const todayStr = new Date().toISOString().slice(0, 10);
    const newRow = { _id: 'new_' + Date.now(), _new: true, worker: w, completed_date: todayStr, panel_type: 'AL(1.5T)' };
    PROD_FIELDS.forEach(f => { if (!(f in newRow)) newRow[f] = null; });
    state.prodD.push(newRow); state.dirty.inserts.prod.push(newRow);
    markDirty(); markDupDirty(); rebuildTft(); invalidateOtherTabs(); renderProductionTable();
  }
  const tbId = type === 'ship' ? 'b1' : 'b2';
  jumpToEnd(tbId);
  setTimeout(() => { const tb = document.getElementById(tbId); const last = tb?.lastElementChild; if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
  saveCache(state.shipD, state.prodD);
  toast('행 추가됨 (저장 버튼으로 DB 반영)', 'info');
}

function cleanNull(type) {
  if (!requireEdit()) return;
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
    loadServerTft();
    loadHistFlags();
    loadRestockConf();
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
  if (t === 'pcb') { renderPCB(); return; }   // PCB 불량은 자체 데이터·화면
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

// 서버 TFT 목록 (server_tft: 매일 TFT 매칭 때 서버 폴더 이름에서 수집) — 받으면 이력 필요 추정을 다시 계산
async function loadServerTft() {
  try {
    const rows = await dbFetchAll('server_tft', 'tft_sn', 'tft_sn,sources');
    state.serverTft = rows.length ? new Map(rows.map(r => [r.tft_sn, r.sources || ''])) : null;
  } catch (e) { state.serverTft = null; }   // 표가 아직 없으면 서버 확인 없이 동작 (안내 문구로 표시)
  renderHistNeedTable();
}

// 이력카드 없음 표시 (hist_flags) — 이력 필요 작업 목록에서 빼고 따로 모아 보여줌
async function loadHistFlags() {
  try {
    const rows = await dbFetchAll('hist_flags');
    state.histFlags = new Map(rows.map(r => [r.detector_sn, r]));
  } catch (e) { state.histFlags = null; }   // 표가 아직 없으면 표시 기능만 꺼짐
  renderHistNeedTable();
}

// ═══ INIT ═══
// ── 새 버전 감지 ──
// index.html의 main.js?v= 값이 지금 실행 중인 버전과 다르면 배포된 것.
const APP_VER = new URL(import.meta.url).searchParams.get('v') || '';
// 안쪽 모듈(js/modules/*.js 등)은 ?v가 없어 최대 10분 캐시됨 → 이미 받은 js/css를 새로 받아 둔 뒤 새로고침
// shortcut: 아직 한 번도 안 불러온 지연 로드 모듈은 못 비움, 그런 모듈이 바뀌면 여전히 Ctrl+F5 필요할 수 있음
async function hardReload() {
  const urls = performance.getEntriesByType('resource').map(e => e.name)
    .filter(u => u.startsWith(location.origin) && /\.(js|css)(\?|$)/.test(u));
  await Promise.allSettled(urls.map(u => fetch(u, { cache: 'reload' })));
  location.reload();
}
async function latestVer() {
  try {
    const html = await (await fetch('index.html', { cache: 'no-store' })).text();
    const v = (html.match(/main\.js\?v=([\w.-]+)/) || [])[1];
    const what = (html.slice(html.indexOf('class="cl-list"')).match(/<li><b>([^<]+)<\/b>/) || [])[1] || '';   // 업데이트 내역 맨 위 항목
    return v ? { v, what } : null;
  } catch (e) { return null; }
}
function showUpdateBar(what) {
  if (document.getElementById('updBar')) return;
  const bar = document.createElement('div');
  bar.id = 'updBar';
  bar.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:99999;background:#1d4ed8;color:#fff;padding:8px 14px;border-radius:0 0 10px 10px;font-size:13px;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center';
  bar.innerHTML = '🔄 새 버전이 올라왔어요' + (what ? ' <span style="opacity:.8;font-size:12px">— ' + what.replace(/[<>&]/g, '') + '</span>' : '')
    + ' <button style="background:#fff;color:#1d4ed8;border:0;border-radius:6px;padding:4px 10px;font-weight:700;cursor:pointer">지금 새로고침</button>';
  bar.querySelector('button').onclick = () => {
    if (state.hasChanges && !confirm('저장하지 않은 변경이 있습니다. 그래도 새로고침할까요?')) return;
    state.hasChanges = false;
    hardReload();
  };
  document.body.appendChild(bar);
}
// 반환값 true = 새로고침 중(초기화 중단)
async function initUpdateCheck() {
  // 새 main.js를 받았지만 지난번 버전이 남아 있으면 → 안쪽 모듈 캐시를 비우고 한 번 새로고침
  let prev = null;
  try { prev = localStorage.getItem('pixx_ver'); if (!prev || APP_VER > prev) localStorage.setItem('pixx_ver', APP_VER); } catch (e) {}
  // 더 새 버전일 때만(버전 = 날짜 문자열) — 캐시된 옛 index.html이 와도 무한 새로고침 안 되게
  if (prev && APP_VER > prev) { await hardReload(); return true; }
  const check = async () => { const l = await latestVer(); if (l && l.v !== APP_VER) showUpdateBar(l.what); };
  setInterval(check, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  return false;
}

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
  // 다중 검색: 엑셀 등에서 여러 줄(S/N 목록)을 붙여넣으면 줄바꿈·탭을 쉼표로 바꿔 넣음 → 하나라도 맞는 행 표시
  //   (입력창은 줄바꿈을 그냥 지워 붙여버리므로 직접 처리)
  ['q1', 'q2', 'q3', 'q4', 'hnScan'].forEach(id => document.getElementById(id)?.addEventListener('paste', e => {
    const t = e.clipboardData?.getData('text') || '';
    if (!/[\r\n\t]/.test(t.trim())) return;
    e.preventDefault();
    e.target.value = t.split(/[\r\n\t]+/).map(s => s.trim()).filter(Boolean).join(', ');
    e.target.dispatchEvent(new Event('input', { bubbles: true }));
  }));
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

  // 「⋯ 더보기」 메뉴 — 안의 버튼은 기존 id 그대로라 아래 핸들러가 그대로 동작
  const moreWrap = document.getElementById('moreWrap');
  const setMore = open => { moreWrap?.classList.toggle('open', open); document.getElementById('moreBtn')?.setAttribute('aria-expanded', open ? 'true' : 'false'); };
  document.getElementById('moreBtn')?.addEventListener('click', e => { e.stopPropagation(); setMore(!moreWrap.classList.contains('open')); });
  moreWrap?.querySelector('.more-menu')?.addEventListener('click', () => setMore(false));
  document.addEventListener('click', e => { if (!e.target.closest('#moreWrap')) setMore(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMore(false); });

  // Changelog modal (업데이트 내역)
  const clBg = document.getElementById('changelogBg');
  document.getElementById('changelogBtn')?.addEventListener('click', () => clBg?.classList.add('show'));
  document.getElementById('changelogClose')?.addEventListener('click', () => clBg?.classList.remove('show'));
  clBg?.addEventListener('click', e => { if (e.target === clBg) clBg.classList.remove('show'); });

  // Manual Run modal (⚡ 수동 실행)
  const mrBg = document.getElementById('manualRunBg');
  document.getElementById('manualRunBtn')?.addEventListener('click', () => mrBg?.classList.add('show'));
  document.getElementById('manualRunClose')?.addEventListener('click', () => mrBg?.classList.remove('show'));
  mrBg?.addEventListener('click', e => { if (e.target === mrBg) mrBg.classList.remove('show'); });
  document.getElementById('mrPathCopy')?.addEventListener('click', () => {
    const p = '\\\\SERVER03\\Fab_Sync\\1. 재고\\2026년 출하이력\\PIXXGEN 자동백업\\PIXXGEN-sync\\';
    navigator.clipboard?.writeText(p);
    toast('경로 복사됨 — 파일 탐색기 주소창에 붙여넣기(Ctrl+V)', 'ok');
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
      const tb = tw?.querySelector('tbody');
      if (tb?.id) jumpToEnd(tb.id);   // 끝 구간만 그려서 바로 이동 (전체 렌더 X)
      else if (tw) tw.scrollTo({ top: tw.scrollHeight, behavior: 'smooth' });
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

  // 새 버전 배포 감지 — 구버전 화면이면 상단 안내 + 한 번에 새로고침
  if (await initUpdateCheck()) return;

  // ═══ INIT MODULES ═══
  initSelection();
  initFill();
  initContextMenu();
  initKeyboard();
  initMobile();
  initKPI();
  initHistNeed();
  initMergeEditClicks();
  initAuditQueue();
  // 보기 잠금 — 로그인(보기 비밀번호) 전에는 캐시·DB 데이터를 띄우지 않음
  await ensureViewAccess();
  initEditMode();
  initRunLog();
  initPCB();   // 출하 데이터 로드와 별개로 진행 (기다리지 않음)

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
  loadServerTft();   // 오기입 추정 안전장치 — 화면을 막지 않게 뒤에서 받음
  loadHistFlags();
  loadRestockConf();

  // Post-render: init resize on visible tables
  setTimeout(() => { initResize('b1'); initResize('b2'); initResize('b3'); initResize('b4'); }, 100);

  // Hide loading
  showLoading(false);
  setTimeout(() => { const ov = document.getElementById('loadingOverlay'); if (ov) ov.remove(); }, 300);
}

document.addEventListener('DOMContentLoaded', init);

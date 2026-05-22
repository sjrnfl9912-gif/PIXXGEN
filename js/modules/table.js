// ═══════════════════════════════════════
// TABLE RENDERING (Full rewrite)
// ═══════════════════════════════════════
import { SHIP_FIELDS, SHIP_HEADS, PROD_FIELDS, PROD_HEADS, MERGE_HEADS, MERGE_VC_START, TFTM_FIELDS, TFTM_HEADS } from '../config.js';
import { state, markDupDirty, rebuildTft, invalidateOtherTabs } from '../state.js';
import { dbInsert, dbUpdate } from '../db.js';
import { toast } from '../services/ui.js';
import { saveCache } from '../services/storage.js';

function colL(n) { let s = ''; while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } return s; }
function esc(v) { if (v == null) return ''; return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function ci(id, t, f, v) { const s = esc(v); return '<input class="c" type="text" value="' + s + '" data-id="' + id + '" data-t="' + t + '" data-f="' + f + '" data-o="' + s + '" readonly>'; }

// S/N 셀 클릭 → 클립보드 복사 (파일 탐색기 등 다른 창에 붙여넣기용)
function legacyCopyText(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const r = document.execCommand('copy'); document.body.removeChild(ta); return r;
  } catch (e) { return false; }
}
function copyCellText(text) {
  text = String(text || '').trim();
  if (!text) return;
  const ok = () => toast('복사됨: ' + text, 'ok');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(ok).catch(() => { if (legacyCopyText(text)) ok(); });
  } else if (legacyCopyText(text)) { ok(); }
}
function vl(v, key) { if (!key) return '<span style="color:#ccc;font-size:9px">-</span>'; if (!v) return '<span style="color:#d97706;font-size:9px">매칭없음</span>'; return '<input class="c vl" value="' + esc(v) + '" readonly tabindex="-1">'; }

// Duplicate detection
const SHIP_SN_FIELDS = ['detector_sn', 'cbbox_sn'];
const PROD_SN_FIELDS = ['tft_sn', 'cpu_sn', 'main_board_sn', 'aed_sn'];

function findDups(arr, snFields) {
  const result = {};
  snFields.forEach(f => {
    const counts = {};
    arr.forEach(r => { const v = r[f]; if (v && String(v).trim()) counts[String(v).trim()] = (counts[String(v).trim()] || 0) + 1; });
    result[f] = new Set(Object.keys(counts).filter(k => counts[k] > 1));
  });
  return result;
}
function rowHasDup(row, dups, snFields) { return snFields.some(f => row[f] && dups[f] && dups[f].has(String(row[f]).trim())); }
function isDupCell(f, v, dups) { return v && dups[f] && dups[f].has(String(v).trim()); }

// 중복 S/N 행을 같은 S/N끼리 묶어 정렬하고, 각 그룹의 시작 위치를 표시.
//  - sorted     : 같은 S/N끼리 인접하도록 정렬된 행 배열
//  - groupStart : 새 그룹이 시작되는 정렬 인덱스 집합 (그룹 사이 구분선용)
function groupDupRows(rows, snFields, dups) {
  const keyOf = r => {
    for (const f of snFields) {
      const v = r[f];
      if (v && dups[f] && dups[f].has(String(v).trim())) return f + ' ' + String(v).trim();
    }
    return '~~~';
  };
  const sorted = rows.slice().sort((a, b) => {
    const ka = keyOf(a), kb = keyOf(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const groupStart = new Set();
  let i = 0;
  while (i < sorted.length) {
    groupStart.add(i);
    const k = keyOf(sorted[i]);
    let j = i + 1;
    while (j < sorted.length && keyOf(sorted[j]) === k) j++;
    i = j;
  }
  return { sorted, groupStart };
}

export function updateDupCounts() {
  if (!state.dupDirty) return;
  state.dupDirty = false;
  state.shipDups = findDups(state.shipD, SHIP_SN_FIELDS);
  state.prodDups = findDups(state.prodD, PROD_SN_FIELDS);
  const sCnt = state.shipD.filter(r => rowHasDup(r, state.shipDups, SHIP_SN_FIELDS)).length;
  const pCnt = state.prodD.filter(r => rowHasDup(r, state.prodDups, PROD_SN_FIELDS)).length;
  const dc1 = document.getElementById('dupCnt1'), dc2 = document.getElementById('dupCnt2');
  if (dc1) { dc1.textContent = sCnt; dc1.style.display = sCnt ? '' : 'none'; }
  if (dc2) { dc2.textContent = pCnt; dc2.style.display = pCnt ? '' : 'none'; }
}

// Header rendering
const _headCache = {};
function mkHead(thId, tbId, heads, vcStart) {
  const cacheKey = tbId + (vcStart ?? '');
  const th = document.getElementById(thId);
  if (_headCache[thId] === cacheKey && th && th.childElementCount) return;
  _headCache[thId] = cacheKey;
  if (!th) return;
  let h1 = '<tr><th class="corner" data-action="select-all" data-tb="' + tbId + '"></th>';
  for (let i = 0; i < heads.length; i++) h1 += '<th class="al" data-col-idx="' + (i + 1) + '" data-tb="' + tbId + '">' + colL(i) + '</th>';
  h1 += '</tr><tr><th style="width:30px;background:#2a3a52">\u3000</th>';
  for (let i = 0; i < heads.length; i++) {
    const vc = vcStart !== undefined && i >= vcStart;
    h1 += '<th' + (vc ? ' class="vc"' : '') + '>' + heads[i].replace(/\n/g, '<br>') + (vc ? '<span class="sub">← 자동</span>' : '') + '</th>';
  }
  th.innerHTML = h1 + '</tr>';
}

// ═══ RENDER FUNCTIONS ═══
export function renderShipmentTable() {
  updateDupCounts();
  const q = (document.getElementById('q1')?.value || '').toLowerCase();
  let d = state.shipD;
  if (state.shipFilt !== 'all') d = d.filter(r => r.product_name && r.product_name.toUpperCase().includes(state.shipFilt));
  if (q) d = d.filter(r => Object.values(r).some(v => v && String(v).toLowerCase().includes(q)));
  let groupInfo = null;
  if (state.dupMode.ship) {
    d = d.filter(r => rowHasDup(r, state.shipDups, SHIP_SN_FIELDS));
    groupInfo = groupDupRows(d, SHIP_SN_FIELDS, state.shipDups);
    d = groupInfo.sorted;
  }
  state.shipFiltered = d;
  const p1 = document.getElementById('p1'), cnt1 = document.getElementById('cnt1');
  if (p1) p1.textContent = d.length + '건';
  if (cnt1) cnt1.textContent = state.shipD.length;
  mkHead('th1', 'b1', SHIP_HEADS);
  const rows = [];
  for (let i = 0; i < d.length; i++) {
    const r = d[i];
    const trCls = (groupInfo && i > 0 && groupInfo.groupStart.has(i)) ? ' class="grp-start"' : '';
    const cells = ['<tr' + trCls + '><td class="rn" data-row-idx="' + i + '" data-tb="b1">' + (i + 1) + '</td>'];
    for (let j = 0; j < SHIP_FIELDS.length; j++) {
      const f = SHIP_FIELDS[j], dup = isDupCell(f, r[f], state.shipDups);
      cells.push('<td class="cw' + (dup ? ' dup-cell' : '') + '">' + ci(r._id, 's', f, r[f]) + '</td>');
    }
    cells.push('</tr>');
    rows.push(cells.join(''));
  }
  const b1 = document.getElementById('b1');
  if (b1) b1.innerHTML = rows.join('');
  state.tabRendered.ship = true;
}

// 완제품 제작완료일에서 연도(앞 4자리)를 뽑음. "2025", "2025-03-14" 모두 → "2025"
function prodYear(r) {
  const y = String(r.completed_date || '').trim().slice(0, 4);
  return /^\d{4}$/.test(y) ? y : '';
}

// 생산관리대장 연도 필터 칩을 데이터 기준으로 자동 생성 (연도 집합이 바뀔 때만 DOM 갱신)
function refreshProdYearChips() {
  const box = document.getElementById('prodYearChips');
  if (!box) return;
  const years = [...new Set(state.prodD.map(prodYear).filter(Boolean))].sort().reverse();
  const sig = years.join(',');
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  // 선택돼 있던 연도가 더 이상 존재하지 않으면 '전체'로 되돌림
  if (state.prodYearFilt !== 'all' && !years.includes(state.prodYearFilt)) state.prodYearFilt = 'all';
  let h = '<div class="chip' + (state.prodYearFilt === 'all' ? ' on' : '') + '" data-yearfilter="all">전체</div>';
  years.forEach(y => { h += '<div class="chip' + (state.prodYearFilt === y ? ' on' : '') + '" data-yearfilter="' + y + '">' + y + '</div>'; });
  box.innerHTML = h;
}

export function renderProductionTable() {
  updateDupCounts();
  refreshProdYearChips();
  const q = (document.getElementById('q2')?.value || '').toLowerCase();
  let d = state.prodD;
  if (state.workerFilt !== 'all') d = d.filter(r => r.worker === state.workerFilt);
  if (state.prodYearFilt !== 'all') d = d.filter(r => prodYear(r) === state.prodYearFilt);
  if (q) d = d.filter(r => Object.values(r).some(v => v && String(v).toLowerCase().includes(q)));
  let groupInfo = null;
  if (state.dupMode.prod) {
    d = d.filter(r => rowHasDup(r, state.prodDups, PROD_SN_FIELDS));
    groupInfo = groupDupRows(d, PROD_SN_FIELDS, state.prodDups);
    d = groupInfo.sorted;
  } else {
    // 완제품 제작완료일 기준 자동 정렬 (오래된 순, 날짜 없는 행은 맨 뒤)
    d = d.slice().sort((a, b) => {
      const x = a.completed_date || '', y = b.completed_date || '';
      if (!x && !y) return 0;
      if (!x) return 1;
      if (!y) return -1;
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }
  state.prodFiltered = d;
  const p2 = document.getElementById('p2'), cnt2 = document.getElementById('cnt2');
  if (p2) p2.textContent = d.length + '건';
  if (cnt2) cnt2.textContent = state.prodD.length;
  mkHead('th2', 'b2', PROD_HEADS);
  const rows = [];
  for (let i = 0; i < d.length; i++) {
    const r = d[i];
    const trCls = (groupInfo && i > 0 && groupInfo.groupStart.has(i)) ? ' class="grp-start"' : '';
    const cells = ['<tr' + trCls + '><td class="rn" data-row-idx="' + i + '" data-tb="b2">' + (i + 1) + '</td>'];
    for (let j = 0; j < PROD_FIELDS.length; j++) {
      const f = PROD_FIELDS[j], dup = isDupCell(f, r[f], state.prodDups);
      cells.push('<td class="cw' + (dup ? ' dup-cell' : '') + '">' + ci(r._id, 'p', f, r[f]) + '</td>');
    }
    cells.push('</tr>');
    rows.push(cells.join(''));
  }
  const b2 = document.getElementById('b2');
  if (b2) b2.innerHTML = rows.join('');
  state.tabRendered.prod = true;
}

const PROD_VL_FIELDS = ['tft_sn', 'scintillator', 'cpu_sn', 'main_board_sn', 'main_board_ver', 'panel_type', 'completed_date', 'detector_fw', 'micom_ver', 'bat_micom_ver', 'worker', 'aed_sn', 'note1', 'note2'];

// 가독성 — 긴 텍스트 잘림(툴팁) / 클릭 복사 대상 컬럼
const LONG_COLS = new Set(['product_name', 'company', 'manager_info', 'zview_sw', 'note1', 'note2']);
const COPY_COLS = new Set(['detector_sn', 'tft_sn']);

// 읽기 전용 셀 HTML 빌더
function readCell(field, value, baseClass) {
  if (value == null || value === '') {
    return '<td class="' + baseClass + '"></td>';
  }
  const s = esc(value);
  let cls = baseClass;
  let attrs = '';
  if (COPY_COLS.has(field)) {
    cls += ' mono copy';
    attrs = ' data-copy="' + s + '" title="클릭 복사"';
  } else if (LONG_COLS.has(field)) {
    cls += ' long';
    attrs = ' title="' + s + '"';
  }
  return '<td class="' + cls + '"' + attrs + '>' + s + '</td>';
}

export function renderMergeTable() {
  const q = (document.getElementById('q3')?.value || '').toLowerCase();
  let d = state.mergeD;
  if (q) {
    // 검사포장 자체 필드 + 조인된 TFT/생산 필드 모두에서 검색
    //  (TFT S/N·작업자·완제품 제작완료일 등 통합취합본 화면에 보이는 칸도 검색 대상)
    d = d.filter(r => {
      for (const v of Object.values(r)) {
        if (v && String(v).toLowerCase().includes(q)) return true;
      }
      const tftSn = state.detTftMap[r.detector_sn];
      if (tftSn && String(tftSn).toLowerCase().includes(q)) return true;
      const p = state.tftMap[tftSn];
      if (p) {
        for (let j = 0; j < PROD_VL_FIELDS.length; j++) {
          const v = p[PROD_VL_FIELDS[j]];
          if (v && String(v).toLowerCase().includes(q)) return true;
        }
      }
      return false;
    });
  }
  state.mergeFiltered = d;
  const p3 = document.getElementById('p3'), cnt3 = document.getElementById('cnt3');
  if (p3) p3.textContent = d.length + '건';
  if (cnt3) cnt3.textContent = state.mergeD.length;
  mkHead('th3', 'b3', MERGE_HEADS, MERGE_VC_START);
  const rows = [];
  for (let i = 0; i < d.length; i++) {
    const r = d[i];
    // 통합취합본 조인: 검사포장 디텍터 S/N → tft_match → TFT S/N → 생산
    const tftSn = state.detTftMap[r.detector_sn];
    const p = state.tftMap[tftSn] || {};
    const cells = ['<tr><td class="rn">' + (i + 1) + '</td>'];
    // 검사포장 컬럼 — 읽기 전용 텍스트로 렌더 (편집은 검사포장 탭에서)
    for (let j = 0; j < SHIP_FIELDS.length; j++) {
      cells.push(readCell(SHIP_FIELDS[j], r[SHIP_FIELDS[j]], 'cw'));
    }
    // 생산 컬럼 — 매칭 없으면 안내, 있으면 텍스트
    for (let j = 0; j < PROD_VL_FIELDS.length; j++) {
      const f = PROD_VL_FIELDS[j];
      if (!tftSn) { cells.push('<td class="v"><span class="vl-na">-</span></td>'); continue; }
      if (p[f] == null || p[f] === '') {
        // tft_sn 컬럼은 매칭은 됐으니 값이 비더라도 매칭없음으로만 표시할 필요는 없음
        cells.push('<td class="v"><span class="vl-miss">매칭없음</span></td>'); continue;
      }
      cells.push(readCell(f, p[f], 'v'));
    }
    cells.push('</tr>');
    rows.push(cells.join(''));
  }
  const b3 = document.getElementById('b3');
  if (b3) b3.innerHTML = rows.join('');
  state.tabRendered.merge = true;
}

// ═══ TFT 매칭 탭 (읽기 전용) ═══
export function renderTftmTable() {
  const q = (document.getElementById('q4')?.value || '').toLowerCase();
  let d = state.tftmD;
  if (q) d = d.filter(r => TFTM_FIELDS.some(f => r[f] && String(r[f]).toLowerCase().includes(q)));
  state.tftmFiltered = d;
  const p4 = document.getElementById('p4'), cnt4 = document.getElementById('cnt4');
  if (p4) p4.textContent = d.length + '건';
  if (cnt4) cnt4.textContent = state.tftmD.length;
  mkHead('th4', 'b4', TFTM_HEADS);
  const rows = [];
  for (let i = 0; i < d.length; i++) {
    const r = d[i];
    const cells = ['<tr><td class="rn">' + (i + 1) + '</td>'];
    // 읽기 전용 텍스트 렌더 (input 제거) + S/N 컬럼 클릭 복사
    for (let j = 0; j < TFTM_FIELDS.length; j++) {
      cells.push(readCell(TFTM_FIELDS[j], r[TFTM_FIELDS[j]], 'cw'));
    }
    cells.push('</tr>');
    rows.push(cells.join(''));
  }
  const b4 = document.getElementById('b4');
  if (b4) b4.innerHTML = rows.join('');
  renderFolderIssues();   // 폴더 오류 섹션도 같이 갱신 (TFT 매칭 탭 안에 있음)
  state.tabRendered.tftm = true;
}

// ═══ 이력 필요 탭 (스캔 큐 방식) ═══
// 무작위로 오는 이력카드를 S/N으로 스캔 → 작업 큐에 쌓고 → 차례로 생산이력 입력.

// 연동 안 된 출하건 목록 계산
//  no-prod : TFT는 찾았으나 생산기록 없음 (작성하면 바로 연동)
//  no-tft  : 디텍터 S/N이 tft_match에 없음 (출하완료 폴더도 확인 필요)
//  pending : no-tft 인데 예상출하일이 아직 안 지남 → 미출하, 작업 대상 아님 (따로 분리)
function histNeedList() {
  const today = new Date().toISOString().slice(0, 10);   // yyyy-MM-dd
  const out = [];
  for (const s of state.shipD) {
    const det = s.detector_sn;
    if (!det) continue;
    const tft = state.detTftMap[det];
    let status;
    if (!tft) status = 'no-tft';
    else if (!state.tftMap[tft]) status = 'no-prod';
    else continue;                       // 정상 연동 → 목록에서 제외
    const psd = String(s.planned_ship_date || '').trim();
    const pending = (status === 'no-tft') && psd && psd > today;   // 미출하 (예상출하일 미래)
    out.push({ ship: s, tft: tft || '', status, pending });
  }
  return out;
}

// ── 작업 큐 (스캔한 이력카드들) ──
let hnQueue = [];   // [{ det, tft, done }]
let hnSel = -1;     // 선택된 큐 인덱스
function hnQueueLoad() {
  try { hnQueue = JSON.parse(localStorage.getItem('hist_queue') || '[]'); }
  catch { hnQueue = []; }
  if (!Array.isArray(hnQueue)) hnQueue = [];
}
function hnQueueSave() {
  try { localStorage.setItem('hist_queue', JSON.stringify(hnQueue)); } catch (e) {}
}
const hnShipByDet = det => state.shipD.find(s => String(s.detector_sn || '').trim() === det) || {};

// S/N(디텍터 또는 TFT)으로 큐에 추가. 성공 시 그 항목 선택.
function hnAddToQueue(det, tft) {
  det = String(det || '').trim();
  if (!det) return;
  let qi = hnQueue.findIndex(q => q.det === det);
  if (qi < 0) {
    hnQueue.push({ det, tft: tft || '', done: false });
    qi = hnQueue.length - 1;
    hnQueueSave();
  } else if (hnQueue[qi].done) {
    toast('이미 작성 완료된 건입니다', 'info');
  }
  hnSel = qi;
}

// 스캔/입력한 S/N 처리
function hnScan(raw) {
  const sn = String(raw || '').trim();
  if (!sn) return false;
  const up = sn.toUpperCase();
  const hit = histNeedList().find(x =>
    String(x.ship.detector_sn || '').trim().toUpperCase() === up ||
    String(x.tft || '').trim().toUpperCase() === up);
  if (!hit) {
    const inShip = state.shipD.some(s => String(s.detector_sn || '').trim().toUpperCase() === up);
    toast(inShip ? '이미 생산이력이 연동된 출하건입니다' : 'S/N을 출하 목록에서 찾지 못했습니다: ' + sn,
      inShip ? 'info' : 'er');
    return false;
  }
  hnAddToQueue(hit.ship.detector_sn, hit.tft);
  return true;
}

// 작업 큐 칩 렌더링
function renderQueue() {
  const box = document.getElementById('hnQueue');
  const cntEl = document.getElementById('hnQueueCnt');
  const pending = hnQueue.filter(q => !q.done).length;
  const done = hnQueue.length - pending;
  if (cntEl) cntEl.textContent = pending + '건 대기' + (done ? ' · ' + done + '건 완료' : '');
  if (!box) return;
  if (!hnQueue.length) {
    box.innerHTML = '<span class="hn-q-empty">S/N을 입력하면 여기에 쌓입니다</span>';
    return;
  }
  box.innerHTML = hnQueue.map((q, i) => {
    const ship = hnShipByDet(q.det);
    const tip = q.done ? '클릭하면 수정' : '클릭하면 입력 폼 열기';
    return '<div class="hn-qchip' + (q.done ? ' done' : '') + (i === hnSel ? ' on' : '') + '" data-qi="' + i + '" title="' + tip + '">'
      + (q.done ? '✓ ' : '') + '<b>' + esc(ship.product_name || '?') + '</b> · ' + esc(q.det)
      + '<span class="hn-qx" data-qx="' + i + '" title="큐에서 제거">×</span></div>';
  }).join('');
}

// 선택된 큐 항목의 생산이력 입력 폼 렌더링
//  ※ 다른 사용자가 저장해서 DB 새로고침이 일어나면 이 함수가 다시 호출되며
//     innerHTML을 통째로 갈아끼우는데, 사용자가 입력 중이던 값이 함께 날아가지
//     않도록 같은 큐 항목(detector 동일)일 때는 입력값·포커스·캐럿을 스냅샷 후 복원.
function renderHnForm() {
  const area = document.getElementById('hnFormArea');
  if (!area) return;
  const q = (hnSel >= 0) ? hnQueue[hnSel] : null;
  if (!q) { area.innerHTML = ''; area.dataset.formDet = ''; return; }
  const ship = hnShipByDet(q.det);

  // 완료된 항목 — 수정 모드 (저장된 생산기록을 다시 편집 가능)
  const isEdit = !!q.done;
  let existingProd = null;
  if (isEdit) {
    existingProd = state.tftMap[q.tft] || null;
    if (!existingProd) {
      area.innerHTML = '<div class="hn-form hn-form-done">✓ ' + esc(ship.product_name || '')
        + ' / 디텍터 ' + esc(q.det) + ' — 생산이력 작성 완료<br>'
        + '<span style="font-size:11px;color:#666">생산기록을 찾을 수 없어 여기서 수정 불가 — 생산관리대장 탭에서 직접 수정</span></div>';
      area.dataset.formDet = '';
      return;
    }
  }

  // 같은 큐 항목을 다시 그리는 경우 입력 중이던 값/포커스 스냅샷
  const sameItem = area.dataset.formDet === q.det;
  const snap = {};
  let focusedField = null, caret = null;
  if (sameItem) {
    area.querySelectorAll('input[data-pf]').forEach(inp => { snap[inp.dataset.pf] = inp.value; });
    const act = document.activeElement;
    if (act?.dataset?.pf && area.contains(act)) {
      focusedField = act.dataset.pf;
      try { caret = act.selectionStart; } catch (e) {}
    }
  }

  // 프리필: 수정 모드면 저장된 값 그대로, 신규면 기본값(오늘 + 현재 작업자 필터)
  let prefill;
  if (isEdit) {
    prefill = {};
    for (const f of PROD_FIELDS) prefill[f] = existingProd[f] != null ? existingProd[f] : '';
  } else {
    const todayStr = new Date().toISOString().slice(0, 10);
    const workerPre = (state.workerFilt && state.workerFilt !== 'all') ? state.workerFilt : '';
    prefill = {
      tft_sn: q.tft,
      detector_fw: ship.detector_fw || '',
      worker: workerPre,
      completed_date: todayStr,
    };
  }

  let fields = '';
  for (let j = 0; j < PROD_FIELDS.length; j++) {
    const f = PROD_FIELDS[j], hh = PROD_HEADS[j].replace(/\n/g, ' ');
    const v = (f in snap) ? snap[f] : (prefill[f] || '');
    fields += '<label class="hn-fld"><span>' + esc(hh) + '</span>'
      + '<input data-pf="' + f + '" value="' + esc(v) + '"></label>';
  }

  const headIcon = isEdit ? '✏' : '📝';
  const headTag  = isEdit ? '<span class="hn-form-edit-tag">수정 모드</span>' : '';
  const saveTxt  = isEdit ? '💾 수정 저장' : '💾 저장하고 다음';
  const skipBtn  = isEdit ? '' : '<button class="hn-skip">건너뛰기 ▶</button>';

  area.innerHTML = '<div class="hn-form' + (isEdit ? ' hn-form-edit' : '') + '">'
    + '<div class="hn-form-h">' + headIcon + ' ' + esc(ship.product_name || '') + ' / 디텍터 ' + esc(q.det)
    + ' · TFT ' + esc(q.tft || '(없음 — 직접 입력)') + ' ' + headTag
    + '<span class="hn-form-pos">큐 ' + (hnSel + 1) + ' / ' + hnQueue.length + '</span></div>'
    + '<div class="hn-form-grid">' + fields + '</div>'
    + '<div class="hn-form-f">' + skipBtn
    + '<button class="hn-save">' + saveTxt + '</button></div>'
    + '</div>';
  area.dataset.formDet = q.det;
  // 포커스/캐럿 복원 — 입력 흐름을 깨지 않음. 첫 진입이면 첫 입력칸에 포커스.
  if (focusedField) {
    const fi = area.querySelector('input[data-pf="' + focusedField + '"]');
    if (fi) {
      fi.focus();
      if (caret != null) { try { fi.setSelectionRange(caret, caret); } catch (e) {} }
    }
  } else if (!sameItem) {
    const fi = area.querySelector('input[data-pf]');
    if (fi) fi.focus();
  }
}

// 폼 저장 → 신규는 insert, 완료(수정 모드)는 update
async function saveHnForm() {
  const area = document.getElementById('hnFormArea');
  const q = (hnSel >= 0) ? hnQueue[hnSel] : null;
  if (!area || !q) return;
  const obj = {};
  area.querySelectorAll('input[data-pf]').forEach(inp => {
    const v = inp.value.trim();
    obj[inp.dataset.pf] = v === '' ? null : v;
  });
  if (!obj.tft_sn) { toast('TFT S/N은 반드시 입력해야 합니다', 'er'); return; }
  if (!obj.worker) { toast('작업자를 반드시 입력해야 합니다 — 생산관리대장 필터에서 가려지지 않게', 'er'); return; }
  const btn = area.querySelector('.hn-save');

  // ── 수정 모드 (완료된 큐 항목 재편집) ──
  if (q.done) {
    const existing = state.tftMap[q.tft];
    if (!existing) { toast('수정할 생산기록을 찾지 못했습니다', 'er'); return; }
    // TFT 변경 시 다른 행과 충돌하면 차단
    if (obj.tft_sn !== existing.tft_sn && state.tftMap[obj.tft_sn]) {
      toast('새 TFT S/N(' + obj.tft_sn + ')은 이미 다른 생산기록에 사용 중', 'er'); return;
    }
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
    const id = existing.id != null ? existing.id : existing._id;
    const updated = await dbUpdate('production', id, obj);
    if (!updated) {
      toast('수정 실패 — 다시 시도해주세요', 'er');
      if (btn) { btn.disabled = false; btn.textContent = '💾 수정 저장'; }
      return;
    }
    const idx = state.prodD.findIndex(p => (p.id != null ? p.id : p._id) === id);
    if (idx >= 0) state.prodD[idx] = { ...updated, _id: updated.id };
    if (obj.tft_sn !== q.tft) q.tft = obj.tft_sn;
    rebuildTft();
    markDupDirty();
    invalidateOtherTabs();
    saveCache(state.shipD, state.prodD);
    hnQueueSave();
    toast('생산이력 수정 완료 — ' + obj.tft_sn, 'ok');
    renderHistNeed();
    return;
  }

  // ── 신규 저장 ──
  // 동시 작업 가드 — 그 사이 다른 사람이 같은 TFT 생산기록을 이미 만들었으면 중복 저장 방지
  if (state.tftMap[obj.tft_sn]) {
    toast('이미 생산기록이 있습니다 — 다른 사람이 먼저 작성한 것 같습니다', 'info');
    q.done = true; hnQueueSave();
    renderHistNeed();
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
  const row = await dbInsert('production', obj);
  if (!row) {
    toast('저장 실패 — 다시 시도해주세요', 'er');
    if (btn) { btn.disabled = false; btn.textContent = '💾 저장하고 다음'; }
    return;
  }
  state.prodD.push({ ...row, _id: row.id });
  rebuildTft();
  markDupDirty();
  invalidateOtherTabs();
  saveCache(state.shipD, state.prodD);
  q.done = true;
  hnQueueSave();
  toast('생산이력 추가 — ' + obj.tft_sn, 'ok');
  hnSel = hnQueue.findIndex(x => !x.done);   // 다음 미완료 큐로 이동
  renderHistNeed();
}

// 저장 없이 다음 미완료 큐로
function hnSkip() {
  let next = -1;
  for (let i = hnSel + 1; i < hnQueue.length; i++) if (!hnQueue[i].done) { next = i; break; }
  if (next < 0) next = hnQueue.findIndex(q => !q.done);
  hnSel = next;
  renderQueue();
  renderHnForm();
}

// 전체 이력 필요 목록 (하단 접이식 참고용) — 미출하(pending) 건은 제외
export function renderHistNeedTable() {
  // 통합 검색 — 상단 S/N 입력창 하나가 곧 「전체 이력 필요 목록」의 필터.
  const q = (document.getElementById('hnScan')?.value || '').trim().toLowerCase();
  const work = histNeedList().filter(x => !x.pending);   // 작업 대상만
  let list = work;
  if (q) list = list.filter(x => [x.ship.product_name, x.ship.detector_sn, x.tft, x.ship.company]
    .some(v => v && String(v).toLowerCase().includes(q)));
  state.histNeedList = list;
  const p5 = document.getElementById('p5'), cnt5 = document.getElementById('cnt5');
  if (p5) p5.textContent = list.length + '건';
  if (cnt5) cnt5.textContent = work.length;   // 탭 배지 = 작업 대상 수 (미출하 제외)

  const th5 = document.getElementById('th5');
  if (th5 && !th5.childElementCount) {
    th5.innerHTML = '<tr><th class="hn-th" style="width:36px">#</th>'
      + '<th class="hn-th">품명</th><th class="hn-th">디텍터 S/N</th><th class="hn-th">TFT S/N</th>'
      + '<th class="hn-th">예상 출하일</th><th class="hn-th">업체 &amp; 병원명</th>'
      + '<th class="hn-th" style="width:104px">상태</th><th class="hn-th" style="width:96px">작업</th></tr>';
  }
  const b5 = document.getElementById('b5');
  if (!b5) return;
  if (!list.length) {
    b5.innerHTML = '<tr><td colspan="8" class="hn-empty">연동 안 된 출하건이 없습니다 👍</td></tr>';
    return;
  }
  const rows = [];
  for (let i = 0; i < list.length; i++) {
    const x = list[i], s = x.ship;
    const badge = x.status === 'no-prod'
      ? '<span class="hn-badge hn-noprod">생산기록 없음</span>'
      : '<span class="hn-badge hn-notft">TFT매칭 없음</span>';
    rows.push('<tr>'
      + '<td class="hn-rn">' + (i + 1) + '</td>'
      + '<td class="hn-c">' + esc(s.product_name) + '</td>'
      + '<td class="hn-c hn-mono hn-copy" data-copy="' + esc(s.detector_sn) + '" title="클릭하면 S/N 복사">' + esc(s.detector_sn) + '</td>'
      + '<td class="hn-c hn-mono hn-copy" data-copy="' + esc(x.tft) + '" title="클릭하면 S/N 복사">' + esc(x.tft) + '</td>'
      + '<td class="hn-c">' + esc(s.planned_ship_date) + '</td>'
      + '<td class="hn-c">' + esc(s.company) + '</td>'
      + '<td class="hn-c">' + badge + '</td>'
      + '<td class="hn-c"><button class="hn-write" data-det="' + esc(s.detector_sn)
      + '" data-tft="' + esc(x.tft) + '">＋ 큐에</button></td>'
      + '</tr>');
  }
  b5.innerHTML = rows.join('');
}

// 출하 예정 목록 (미출하 — 예상출하일이 아직 안 지난 건, 작업 대상 아님)
function renderHistPending() {
  const list = histNeedList().filter(x => x.pending)
    .sort((a, b) => String(a.ship.planned_ship_date) < String(b.ship.planned_ship_date) ? -1 : 1);
  const p6 = document.getElementById('p6');
  if (p6) p6.textContent = list.length + '건';
  const th6 = document.getElementById('th6');
  if (th6 && !th6.childElementCount) {
    th6.innerHTML = '<tr><th class="hn-th" style="width:36px">#</th>'
      + '<th class="hn-th">품명</th><th class="hn-th">디텍터 S/N</th>'
      + '<th class="hn-th">예상 출하일</th><th class="hn-th">국가</th><th class="hn-th">업체 &amp; 병원명</th></tr>';
  }
  const b6 = document.getElementById('b6');
  if (!b6) return;
  if (!list.length) {
    b6.innerHTML = '<tr><td colspan="6" class="hn-empty">출하 예정 대기 건이 없습니다</td></tr>';
    return;
  }
  b6.innerHTML = list.map((x, i) => {
    const s = x.ship;
    return '<tr>'
      + '<td class="hn-rn">' + (i + 1) + '</td>'
      + '<td class="hn-c">' + esc(s.product_name) + '</td>'
      + '<td class="hn-c hn-mono hn-copy" data-copy="' + esc(s.detector_sn) + '" title="클릭하면 S/N 복사">' + esc(s.detector_sn) + '</td>'
      + '<td class="hn-c">' + esc(s.planned_ship_date) + '</td>'
      + '<td class="hn-c">' + esc(s.country) + '</td>'
      + '<td class="hn-c">' + esc(s.company) + '</td>'
      + '</tr>';
  }).join('');
}

// 검사포장 폴더 오류 — tft-sync가 인식 못한 폴더 목록 (검사포장팀 검토용)
//  spacing: 띄어쓰기 누락 (TFT+디텍터 붙음) — 폴더명만 수정하면 인식됨
//  review : 그 외 (디텍터 누락 / 오타 / 묶음 외 단독 등) — 수동 검토 필요
function renderFolderIssues() {
  const list = state.folderIssues || [];
  const p7 = document.getElementById('p7');
  if (p7) p7.textContent = list.length + '건';
  const sum = document.getElementById('fiSummary');
  if (sum) {
    const nSp = list.filter(x => x.issue_type === 'spacing').length;
    const nRv = list.length - nSp;
    sum.textContent = list.length ? ('띄어쓰기 누락 ' + nSp + ' · 검토 필요 ' + nRv) : '인식 못한 폴더 없음 👍';
  }
  const th7 = document.getElementById('th7');
  if (th7 && !th7.childElementCount) {
    th7.innerHTML = '<tr><th class="hn-th" style="width:36px">#</th>'
      + '<th class="hn-th" style="width:120px">분류</th>'
      + '<th class="hn-th">폴더명</th>'
      + '<th class="hn-th">권장 조치</th></tr>';
  }
  const b7 = document.getElementById('b7');
  if (!b7) return;
  if (!list.length) {
    b7.innerHTML = '<tr><td colspan="4" class="hn-empty">tft-sync가 모든 폴더를 정상 인식했습니다 👍</td></tr>';
    return;
  }
  // spacing 먼저(쉽게 고침), 그 다음 review
  const sorted = [...list].sort((a, b) => (a.issue_type === 'spacing' ? -1 : 1) - (b.issue_type === 'spacing' ? -1 : 1));
  b7.innerHTML = sorted.map((x, i) => {
    const isSp = x.issue_type === 'spacing';
    const badge = isSp
      ? '<span class="hn-badge" style="background:#fff5e1;color:#7a4a00">띄어쓰기 누락</span>'
      : '<span class="hn-badge" style="background:#fde7e7;color:#8a1f1f">검토 필요</span>';
    const action = isSp
      ? 'TFT와 디텍터 사이에 공백 추가'
      : '디텍터 S/N 추가 또는 폴더 정리';
    return '<tr>'
      + '<td class="hn-rn">' + (i + 1) + '</td>'
      + '<td class="hn-c">' + badge + '</td>'
      + '<td class="hn-c hn-mono hn-copy" data-copy="' + esc(x.folder_name) + '" title="클릭하면 폴더명 복사">' + esc(x.folder_name) + '</td>'
      + '<td class="hn-c" style="color:#666;font-size:11px">' + action + '</td>'
      + '</tr>';
  }).join('');
}

// 폴더 오류 전체를 카톡 공유용 텍스트로 클립보드 복사
function copyFolderIssuesText() {
  const list = state.folderIssues || [];
  if (!list.length) { toast('공유할 폴더 오류가 없습니다', 'info'); return; }
  const nSp = list.filter(x => x.issue_type === 'spacing').length;
  const nRv = list.length - nSp;
  const lines = ['[검사포장 폴더명 검토 요청]',
    '총 ' + list.length + '건 (띄어쓰기 누락 ' + nSp + ' · 검토 필요 ' + nRv + ')',
    ''];
  if (nSp > 0) {
    lines.push('▣ 띄어쓰기 누락 — TFT와 디텍터 사이에 공백만 넣으면 자동 인식됨:');
    list.filter(x => x.issue_type === 'spacing').forEach(x => lines.push('  • ' + x.folder_name));
    lines.push('');
  }
  if (nRv > 0) {
    lines.push('▣ 검토 필요 — 디텍터 누락/오타/묶음 외 단독 폴더:');
    list.filter(x => x.issue_type !== 'spacing').forEach(x => lines.push('  • ' + x.folder_name));
  }
  const text = lines.join('\n');
  copyCellText(text);  // 기존 클립보드 헬퍼 재사용
}

// 이력 필요 탭 전체 렌더 (목록 + 출하예정 + 큐 + 폼)
// 진단 바 — 입력 S/N의 실제 상태를 4분할 카드로 표시.
//  생산기록 / 출하완료 폴더 / 검사포장 / 종합 — 어느 시스템에 데이터가 있고 어디서 끊겼는지 한눈에.
//  「전체 이력 필요 목록에는 없는데 알고보니 오기입이라 아예 작성 안 됨」 케이스 방지가 목적.
function renderHnDiag() {
  const diag = document.getElementById('hnDiag');
  if (!diag) return;
  const raw = (document.getElementById('hnScan')?.value || '').trim();
  const q = raw.toLowerCase();
  const work = histNeedList().filter(x => !x.pending);

  // 빈 입력 — 1줄 컴팩트
  if (!q) {
    diag.className = 'hn-diag muted';
    diag.innerHTML = '<span class="hnd-ic">📋</span><b>전체 이력 필요 목록 ' + work.length + '건</b>'
      + '<span class="hnd-sep">·</span><span class="hnd-meta">S/N을 입력하면 실시간으로 좁아집니다</span>';
    return;
  }

  // 직접 부분 매칭
  const matches = work.filter(x => [x.ship.product_name, x.ship.detector_sn, x.tft, x.ship.company]
    .some(v => v && String(v).toLowerCase().includes(q)));
  const directProd = state.prodD.filter(p => p.tft_sn && String(p.tft_sn).toLowerCase().includes(q));
  const directTftm = state.tftmD.filter(t =>
    (t.tft_sn && String(t.tft_sn).toLowerCase().includes(q)) ||
    (t.detector_sn && String(t.detector_sn).toLowerCase().includes(q)));
  const directShip = state.shipD.filter(s => s.detector_sn && String(s.detector_sn).toLowerCase().includes(q));

  // S/N이 아닌 검색(품명·업체 등)으로 work만 매칭된 경우 — 1줄 안내로 처리
  if (matches.length > 0 && directProd.length === 0 && directTftm.length === 0 && directShip.length === 0) {
    diag.className = 'hn-diag warn';
    diag.innerHTML = '<span class="hnd-ic">📝</span><b>' + matches.length + '건 매칭 — 이력 작성 대상</b>'
      + '<span class="hnd-sep">·</span><span class="hnd-meta">아래 목록 참고 또는 S/N으로 좁히기</span>';
    return;
  }

  // 대표 TFT/디텍터 결정 — 검색어가 TFT든 디텍터든 시작점으로 사용 가능한 값 선택
  const reprTft = (directProd[0]?.tft_sn) || (directTftm[0]?.tft_sn) || '';
  const reprDet = (directTftm[0]?.detector_sn) || (directShip[0]?.detector_sn) || '';

  // 크로스 참조 — 대표값으로 다른 시스템도 조회 (검색 시작점이 한쪽이어도 다른 시스템 상태가 정확히 잡힘)
  let prodRow = directProd[0] || null;
  if (!prodRow && reprTft) prodRow = state.tftMap[reprTft] || null;
  let tftmRow = directTftm[0] || null;
  if (!tftmRow && reprDet) tftmRow = state.tftmD.find(t => t.detector_sn === reprDet) || null;
  if (!tftmRow && reprTft) tftmRow = state.tftmD.find(t => t.tft_sn === reprTft) || null;
  let shipRow = directShip[0] || null;
  if (!shipRow && reprDet) shipRow = state.shipD.find(s => s.detector_sn === reprDet) || null;

  const prodHas = !!prodRow;
  const tftmHas = !!tftmRow;
  const shipHas = !!shipRow;
  const sampleProd = prodRow;
  const sampleTftm = tftmRow;
  const sampleShip = shipRow;
  const matchedTft = prodRow?.tft_sn || tftmRow?.tft_sn || reprTft || '';
  const matchedDet = tftmRow?.detector_sn || shipRow?.detector_sn || reprDet || '';

  // 종합 판정
  let vTxt, vCls, vDetail;
  if (prodHas && tftmHas && shipHas) {
    vTxt = '✓ 완료된 출하건'; vCls = 'ok'; vDetail = '추가 작업 불필요';
  } else if (shipHas && tftmHas && !prodHas) {
    vTxt = '📝 이력 작성 필요'; vCls = 'warn';
    vDetail = '아래 「＋ 큐에」<br>버튼으로 작업 시작';
  } else if (shipHas && !tftmHas && !prodHas) {
    vTxt = '⚠ 폴더 미작성'; vCls = 'warn';
    vDetail = '출하완료 폴더 미작성<br>또는 출하 예정';
  } else if (!shipHas && tftmHas && !prodHas) {
    vTxt = '⚠ 검사포장 누락'; vCls = 'warn';
    vDetail = '폴더엔 있으나<br>검사포장 데이터 없음';
  } else if (prodHas && (!tftmHas || !shipHas)) {
    vTxt = '⚠ 부분 매칭'; vCls = 'warn';
    vDetail = '일부 시스템에만 존재<br>데이터 정합성 확인';
  } else {
    vTxt = '⚠ 오기입 의심'; vCls = 'no';
    vDetail = '이력카드 TFT 재확인<br>또는 디텍터로 검색';
  }

  // 4분할 카드 렌더
  diag.className = 'hn-diag hn-diag-cards';
  diag.innerHTML =
    '<div class="dcard ' + (prodHas ? 'ok' : 'no') + '">'
      + '<div class="dt"><span class="dot"></span>생산기록</div>'
      + '<div class="dv">' + (prodHas ? '있음 ✓' : '없음 ✗') + '</div>'
      + '<div class="dm">' + (prodHas
        ? '작업자 ' + esc(sampleProd.worker || '-') + '<br>완료 ' + esc(sampleProd.completed_date || '-')
        : 'production에<br>해당 TFT 없음') + '</div>'
    + '</div>'
    + '<div class="dcard ' + (tftmHas ? 'ok' : 'no') + '">'
      + '<div class="dt"><span class="dot"></span>출하완료 폴더</div>'
      + '<div class="dv">' + (tftmHas ? '있음 ✓' : '없음 ✗') + '</div>'
      + '<div class="dm">' + (tftmHas
        ? '디텍터 ' + esc(matchedDet || sampleTftm.detector_sn || '-') + '<br>TFT ' + esc(matchedTft || sampleTftm.tft_sn || '-')
        : 'tft_match에<br>해당 S/N 없음') + '</div>'
    + '</div>'
    + '<div class="dcard ' + (shipHas ? 'ok' : 'no') + '">'
      + '<div class="dt"><span class="dot"></span>검사포장</div>'
      + '<div class="dv">' + (shipHas ? '있음 ✓' : '없음 ✗') + '</div>'
      + '<div class="dm">' + (shipHas
        ? esc(sampleShip.product_name || '-') + '<br>' + esc(sampleShip.company || '-')
        : '출하건에<br>해당 디텍터 없음') + '</div>'
    + '</div>'
    + '<div class="dcard ' + vCls + '">'
      + '<div class="dt"><span class="dot"></span>종합</div>'
      + '<div class="dv">' + vTxt + '</div>'
      + '<div class="dm">' + vDetail + '</div>'
    + '</div>';
}

export function renderHistNeed() {
  renderHistNeedTable();
  renderHnDiag();
  renderHistPending();
  renderQueue();
  renderHnForm();
  state.tabRendered.histneed = true;
}

export function initHistNeed() {
  hnQueueLoad();

  // 검색 박스 — 타이핑/붙여넣기 즉시 하단 목록 + 진단 바 실시간 갱신.
  //  Enter는 큐에 추가하고 입력칸 비우는 「스캔」 동작 유지.
  const scan = document.getElementById('hnScan');
  if (scan) {
    scan.addEventListener('keydown', e => {
      e.stopPropagation();                     // 그리드 키보드 핸들러 간섭 방지
      if (e.key === 'Enter') {
        e.preventDefault();
        const ok = hnScan(scan.value);
        scan.value = '';
        renderHistNeed();                      // Enter 후엔 입력 비워졌으니 전체 목록·진단 리셋
        scan.focus();
      }
    });
    // 입력/붙여넣기 → 즉시 필터 + 진단
    scan.addEventListener('input', () => { renderHistNeedTable(); renderHnDiag(); });
    // 전역 paste 핸들러(그리드용)가 가로채지 못하게 정지 — 네이티브 붙여넣기 보장
    scan.addEventListener('paste', e => e.stopPropagation());
  }

  // 큐 비우기
  document.getElementById('hnQueueClear')?.addEventListener('click', () => {
    if (!hnQueue.length) return;
    hnQueue = []; hnSel = -1; hnQueueSave(); renderHistNeed();
  });

  // 큐 칩 — 클릭 선택 / × 제거
  document.getElementById('hnQueue')?.addEventListener('click', e => {
    const x = e.target.closest('.hn-qx');
    if (x) {
      hnQueue.splice(+x.dataset.qx, 1);
      hnSel = hnQueue.findIndex(q => !q.done);
      hnQueueSave(); renderHistNeed();
      return;
    }
    const chip = e.target.closest('.hn-qchip');
    if (chip) { hnSel = +chip.dataset.qi; renderQueue(); renderHnForm(); }
  });

  // 폼 영역 — 저장 / 건너뛰기, Tab 등 키보드는 그리드 핸들러로 전파 차단
  const area = document.getElementById('hnFormArea');
  if (area) {
    area.addEventListener('keydown', e => e.stopPropagation());
    area.addEventListener('click', e => {
      if (e.target.closest('.hn-save')) saveHnForm();
      else if (e.target.closest('.hn-skip')) hnSkip();
    });
  }

  // 하단 목록 — S/N 셀 클릭 복사 / [＋ 큐에] 버튼
  document.getElementById('b5')?.addEventListener('click', e => {
    const cp = e.target.closest('.hn-copy');
    if (cp) { copyCellText(cp.dataset.copy); return; }
    const w = e.target.closest('.hn-write');
    if (!w) return;
    hnAddToQueue(w.dataset.det, w.dataset.tft);
    renderHistNeed();
    document.getElementById('hnFormArea')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // 출하 예정 목록 — S/N 셀 클릭 복사
  document.getElementById('b6')?.addEventListener('click', e => {
    const cp = e.target.closest('.hn-copy');
    if (cp) copyCellText(cp.dataset.copy);
  });

  // 폴더 오류 — 폴더명 셀 클릭 복사 / 전체 복사 버튼
  document.getElementById('b7')?.addEventListener('click', e => {
    const cp = e.target.closest('.hn-copy');
    if (cp) copyCellText(cp.dataset.copy);
  });
  document.getElementById('fiCopyAll')?.addEventListener('click', copyFolderIssuesText);

  // 통합취합본·TFT 매칭 — 읽기 전용 셀에 .copy 클래스로 클릭 복사 (document 위임)
  document.addEventListener('click', e => {
    const cp = e.target.closest('td.copy');
    if (cp && cp.dataset.copy) copyCellText(cp.dataset.copy);
  });
}

// 모든 탭의 카운트 배지를 한 번에 갱신 (탭을 클릭하지 않아도 숫자가 보이도록)
export function updateTabCounts() {
  const set = (id, n) => { const e = document.getElementById(id); if (e) e.textContent = n; };
  set('cnt1', state.shipD.length);
  set('cnt2', state.prodD.length);
  set('cnt3', state.shipD.length);   // 통합취합본 = 검사포장 행 수만큼
  set('cnt4', state.tftmD.length);
  set('cnt5', histNeedList().filter(x => !x.pending).length);
}

export function renderAll() {
  if (state.curTab === 'ship') renderShipmentTable();
  else if (state.curTab === 'prod') renderProductionTable();
  else if (state.curTab === 'merge') renderMergeTable();
  else if (state.curTab === 'tftm') renderTftmTable();
  else if (state.curTab === 'histneed') renderHistNeed();
  else if (state.curTab === 'kpi') {
    import('./kpi.js').then(m => m.renderKPI()).catch(() => {});
  }
}

export { SHIP_SN_FIELDS, PROD_SN_FIELDS, rowHasDup };

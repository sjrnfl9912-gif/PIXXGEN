// ═══════════════════════════════════════
// TABLE RENDERING (Full rewrite)
// ═══════════════════════════════════════
import { SHIP_FIELDS, SHIP_HEADS, PROD_FIELDS, PROD_HEADS, MERGE_HEADS, MERGE_VC_START, TFTM_FIELDS, TFTM_HEADS } from '../config.js';
import { state, markDupDirty, rebuildTft } from '../state.js';
import { dbInsert } from '../db.js';
import { toast } from '../services/ui.js';
import { saveCache } from '../services/storage.js';

function colL(n) { let s = ''; while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } return s; }
function esc(v) { if (v == null) return ''; return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function ci(id, t, f, v) { const s = esc(v); return '<input class="c" type="text" value="' + s + '" data-id="' + id + '" data-t="' + t + '" data-f="' + f + '" data-o="' + s + '" readonly>'; }
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
}

const PROD_VL_FIELDS = ['tft_sn', 'scintillator', 'cpu_sn', 'main_board_sn', 'main_board_ver', 'panel_type', 'completed_date', 'detector_fw', 'micom_ver', 'bat_micom_ver', 'worker', 'aed_sn', 'note1', 'note2'];

export function renderMergeTable() {
  const q = (document.getElementById('q3')?.value || '').toLowerCase();
  let d = state.mergeD;
  if (q) d = d.filter(r => Object.values(r).some(v => v && String(v).toLowerCase().includes(q)));
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
    const cells = ['<tr><td class="rn" data-row-idx="' + i + '" data-tb="b3">' + (i + 1) + '</td>'];
    for (let j = 0; j < SHIP_FIELDS.length; j++) cells.push('<td class="cw">' + ci(r._id, 'm', SHIP_FIELDS[j], r[SHIP_FIELDS[j]]) + '</td>');
    for (let j = 0; j < PROD_VL_FIELDS.length; j++) cells.push('<td>' + vl(p[PROD_VL_FIELDS[j]], tftSn) + '</td>');
    cells.push('</tr>');
    rows.push(cells.join(''));
  }
  const b3 = document.getElementById('b3');
  if (b3) b3.innerHTML = rows.join('');
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
    const cells = ['<tr><td class="rn" data-row-idx="' + i + '" data-tb="b4">' + (i + 1) + '</td>'];
    for (let j = 0; j < TFTM_FIELDS.length; j++) {
      cells.push('<td class="cw"><input class="c vl" value="' + esc(r[TFTM_FIELDS[j]]) + '" readonly tabindex="-1"></td>');
    }
    cells.push('</tr>');
    rows.push(cells.join(''));
  }
  const b4 = document.getElementById('b4');
  if (b4) b4.innerHTML = rows.join('');
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
    box.innerHTML = '<span class="hn-q-empty">S/N을 스캔하면 여기에 쌓입니다</span>';
    return;
  }
  box.innerHTML = hnQueue.map((q, i) => {
    const ship = hnShipByDet(q.det);
    return '<div class="hn-qchip' + (q.done ? ' done' : '') + (i === hnSel ? ' on' : '') + '" data-qi="' + i + '">'
      + (q.done ? '✓ ' : '') + '<b>' + esc(ship.product_name || '?') + '</b> · ' + esc(q.det)
      + '<span class="hn-qx" data-qx="' + i + '" title="큐에서 제거">×</span></div>';
  }).join('');
}

// 선택된 큐 항목의 생산이력 입력 폼 렌더링
function renderHnForm() {
  const area = document.getElementById('hnFormArea');
  if (!area) return;
  const q = (hnSel >= 0) ? hnQueue[hnSel] : null;
  if (!q) { area.innerHTML = ''; return; }
  const ship = hnShipByDet(q.det);
  if (q.done) {
    area.innerHTML = '<div class="hn-form hn-form-done">✓ ' + esc(ship.product_name || '')
      + ' / 디텍터 ' + esc(q.det) + ' — 생산이력 작성 완료</div>';
    return;
  }
  const prefill = { tft_sn: q.tft, detector_fw: ship.detector_fw || '' };
  let fields = '';
  for (let j = 0; j < PROD_FIELDS.length; j++) {
    const f = PROD_FIELDS[j], hh = PROD_HEADS[j].replace(/\n/g, ' ');
    fields += '<label class="hn-fld"><span>' + esc(hh) + '</span>'
      + '<input data-pf="' + f + '" value="' + esc(prefill[f] || '') + '"></label>';
  }
  area.innerHTML = '<div class="hn-form">'
    + '<div class="hn-form-h">📝 ' + esc(ship.product_name || '') + ' / 디텍터 ' + esc(q.det)
    + ' · TFT ' + esc(q.tft || '(없음 — 직접 입력)')
    + '<span class="hn-form-pos">큐 ' + (hnSel + 1) + ' / ' + hnQueue.length + '</span></div>'
    + '<div class="hn-form-grid">' + fields + '</div>'
    + '<div class="hn-form-f"><button class="hn-skip">건너뛰기 ▶</button>'
    + '<button class="hn-save">💾 저장하고 다음</button></div>'
    + '</div>';
  const fi = area.querySelector('input[data-pf]');
  if (fi) fi.focus();
}

// 폼 저장 → production 테이블에 직접 추가
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
  const btn = area.querySelector('.hn-save');
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
  const q = (document.getElementById('q5')?.value || '').toLowerCase();
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
      + '<td class="hn-c hn-mono">' + esc(s.detector_sn) + '</td>'
      + '<td class="hn-c hn-mono">' + esc(x.tft) + '</td>'
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
      + '<td class="hn-c hn-mono">' + esc(s.detector_sn) + '</td>'
      + '<td class="hn-c">' + esc(s.planned_ship_date) + '</td>'
      + '<td class="hn-c">' + esc(s.country) + '</td>'
      + '<td class="hn-c">' + esc(s.company) + '</td>'
      + '</tr>';
  }).join('');
}

// 이력 필요 탭 전체 렌더 (목록 + 출하예정 + 큐 + 폼)
export function renderHistNeed() {
  renderHistNeedTable();
  renderHistPending();
  renderQueue();
  renderHnForm();
}

export function initHistNeed() {
  hnQueueLoad();

  // 스캔 박스 — Enter(또는 바코드 스캐너)로 큐에 추가
  const scan = document.getElementById('hnScan');
  if (scan) {
    scan.addEventListener('keydown', e => {
      e.stopPropagation();                     // 그리드 키보드 핸들러 간섭 방지
      if (e.key === 'Enter') {
        e.preventDefault();
        const ok = hnScan(scan.value);
        scan.value = '';
        if (ok) renderHistNeed();
        scan.focus();
      }
    });
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

  // 하단 목록의 [＋ 큐에] 버튼
  document.getElementById('b5')?.addEventListener('click', e => {
    const w = e.target.closest('.hn-write');
    if (!w) return;
    hnAddToQueue(w.dataset.det, w.dataset.tft);
    renderHistNeed();
    document.getElementById('hnFormArea')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
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

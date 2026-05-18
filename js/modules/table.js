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

// ═══ 이력 필요 탭 (생산기록 연동 안 된 출하건 + 인라인 작성) ═══
// 표시 컬럼 (검사포장 행에서 뽑음. _tft 는 tft_match 경유 TFT S/N)
const HN_COLS = [
  { f: 'product_name',      h: '품명' },
  { f: 'detector_sn',       h: '디텍터 S/N' },
  { f: '_tft',              h: 'TFT S/N' },
  { f: 'planned_ship_date', h: '예상 출하일' },
  { f: 'company',           h: '업체 & 병원명' },
];

// 연동 안 된 출하건 목록 계산
//  no-prod : TFT는 찾았으나 생산기록 없음 (작성하면 바로 연동)
//  no-tft  : 디텍터 S/N이 tft_match에 없음 (출하완료 폴더도 확인 필요)
function histNeedList() {
  const out = [];
  for (const s of state.shipD) {
    const det = s.detector_sn;
    if (!det) continue;
    const tft = state.detTftMap[det];
    let status;
    if (!tft) status = 'no-tft';
    else if (!state.tftMap[tft]) status = 'no-prod';
    else continue;                       // 정상 연동 → 목록에서 제외
    out.push({ ship: s, tft: tft || '', status });
  }
  return out;
}

export function renderHistNeedTable() {
  const q = (document.getElementById('q5')?.value || '').toLowerCase();
  let list = histNeedList();
  if (q) list = list.filter(x => [x.ship.product_name, x.ship.detector_sn, x.tft, x.ship.company]
    .some(v => v && String(v).toLowerCase().includes(q)));
  state.histNeedList = list;
  const p5 = document.getElementById('p5'), cnt5 = document.getElementById('cnt5');
  if (p5) p5.textContent = list.length + '건';
  if (cnt5) cnt5.textContent = list.length;

  const th5 = document.getElementById('th5');
  if (th5 && !th5.childElementCount) {
    th5.innerHTML = '<tr><th class="hn-th" style="width:36px">#</th>'
      + HN_COLS.map(c => '<th class="hn-th">' + c.h + '</th>').join('')
      + '<th class="hn-th" style="width:110px">상태</th>'
      + '<th class="hn-th" style="width:90px">이력</th></tr>';
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
    rows.push('<tr data-hn="' + i + '">'
      + '<td class="hn-rn">' + (i + 1) + '</td>'
      + '<td class="hn-c">' + esc(s.product_name) + '</td>'
      + '<td class="hn-c hn-mono">' + esc(s.detector_sn) + '</td>'
      + '<td class="hn-c hn-mono">' + esc(x.tft) + '</td>'
      + '<td class="hn-c">' + esc(s.planned_ship_date) + '</td>'
      + '<td class="hn-c">' + esc(s.company) + '</td>'
      + '<td class="hn-c">' + badge + '</td>'
      + '<td class="hn-c"><button class="hn-write" data-idx="' + i + '">✏ 작성</button></td>'
      + '</tr>');
  }
  b5.innerHTML = rows.join('');
}

// [작성] 클릭 → 해당 행 아래에 생산이력 입력 폼 펼침
function openHnForm(idx) {
  const x = state.histNeedList && state.histNeedList[idx];
  if (!x) return;
  const tr = document.querySelector('#b5 tr[data-hn="' + idx + '"]');
  if (!tr) return;
  // 이미 열려있으면 닫기 (토글)
  if (tr.nextElementSibling && tr.nextElementSibling.classList.contains('hn-formrow')) {
    tr.nextElementSibling.remove();
    return;
  }
  document.querySelectorAll('#b5 .hn-formrow').forEach(e => e.remove());
  const s = x.ship;
  const prefill = { tft_sn: x.tft, detector_fw: s.detector_fw || '' };
  let fields = '';
  for (let j = 0; j < PROD_FIELDS.length; j++) {
    const f = PROD_FIELDS[j], hh = PROD_HEADS[j].replace(/\n/g, ' ');
    fields += '<label class="hn-fld"><span>' + esc(hh) + '</span>'
      + '<input data-pf="' + f + '" value="' + esc(prefill[f] || '') + '"></label>';
  }
  const formTr = document.createElement('tr');
  formTr.className = 'hn-formrow';
  formTr.innerHTML = '<td colspan="8"><div class="hn-form">'
    + '<div class="hn-form-h">📝 ' + esc(s.product_name || '') + '  /  디텍터 ' + esc(s.detector_sn || '')
    + '  — 생산이력 작성</div>'
    + '<div class="hn-form-grid">' + fields + '</div>'
    + '<div class="hn-form-f"><button class="hn-cancel">취소</button>'
    + '<button class="hn-save" data-idx="' + idx + '">💾 생산관리대장에 추가</button></div>'
    + '</div></td>';
  tr.after(formTr);
  const first = formTr.querySelector('input[data-pf]');
  if (first) first.focus();
}

// 폼 저장 → production 테이블에 직접 추가
async function saveHnForm(idx, formTr) {
  if (!formTr) return;
  const obj = {};
  formTr.querySelectorAll('input[data-pf]').forEach(inp => {
    const v = inp.value.trim();
    obj[inp.dataset.pf] = v === '' ? null : v;
  });
  if (!obj.tft_sn) { toast('TFT S/N은 반드시 입력해야 합니다', 'er'); return; }
  const saveBtn = formTr.querySelector('.hn-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }
  const row = await dbInsert('production', obj);
  if (!row) {
    toast('저장 실패 — 다시 시도해주세요', 'er');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 생산관리대장에 추가'; }
    return;
  }
  state.prodD.push({ ...row, _id: row.id });
  rebuildTft();
  markDupDirty();
  saveCache(state.shipD, state.prodD);
  toast('생산이력 추가 완료 — ' + obj.tft_sn, 'ok');
  renderHistNeedTable();   // 방금 채운 건은 목록에서 사라짐
}

export function initHistNeed() {
  const b5 = document.getElementById('b5');
  if (!b5) return;
  b5.addEventListener('click', e => {
    const w = e.target.closest('.hn-write');
    if (w) { openHnForm(+w.dataset.idx); return; }
    const c = e.target.closest('.hn-cancel');
    if (c) { const fr = c.closest('.hn-formrow'); if (fr) fr.remove(); return; }
    const sv = e.target.closest('.hn-save');
    if (sv) { saveHnForm(+sv.dataset.idx, sv.closest('.hn-formrow')); return; }
  });
}

export function renderAll() {
  if (state.curTab === 'ship') renderShipmentTable();
  else if (state.curTab === 'prod') renderProductionTable();
  else if (state.curTab === 'merge') renderMergeTable();
  else if (state.curTab === 'tftm') renderTftmTable();
  else if (state.curTab === 'histneed') renderHistNeedTable();
  else if (state.curTab === 'kpi') {
    import('./kpi.js').then(m => m.renderKPI()).catch(() => {});
  }
}

export { SHIP_SN_FIELDS, PROD_SN_FIELDS, rowHasDup };

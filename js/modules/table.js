// ═══════════════════════════════════════
// TABLE RENDERING (Full rewrite)
// ═══════════════════════════════════════
import { SHIP_FIELDS, SHIP_HEADS, PROD_FIELDS, PROD_HEADS, MERGE_HEADS, MERGE_VC_START } from '../config.js';
import { state, markDupDirty } from '../state.js';

function colL(n) { let s = ''; while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } return s; }
function esc(v) { if (v == null) return ''; return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function ci(id, t, f, v) { const s = esc(v); return '<input class="c" type="text" value="' + s + '" data-id="' + id + '" data-t="' + t + '" data-f="' + f + '" data-o="' + s + '" readonly>'; }
function vl(v, key) { if (!key) return '<span style="color:#ccc;font-size:9px">-</span>'; if (!v) return '<span style="color:#d97706;font-size:9px">매칭없음</span>'; return '<input class="c vl" value="' + esc(v) + '" readonly tabindex="-1">'; }

// Duplicate detection
const SHIP_SN_FIELDS = ['detector_sn', 'cbbox_sn', 'tft_sn'];
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
  if (state.dupMode.ship) d = d.filter(r => rowHasDup(r, state.shipDups, SHIP_SN_FIELDS));
  state.shipFiltered = d;
  const p1 = document.getElementById('p1'), cnt1 = document.getElementById('cnt1');
  if (p1) p1.textContent = d.length + '건';
  if (cnt1) cnt1.textContent = state.shipD.length;
  mkHead('th1', 'b1', SHIP_HEADS);
  const rows = [];
  for (let i = 0; i < d.length; i++) {
    const r = d[i];
    const cells = ['<tr><td class="rn" data-row-idx="' + i + '" data-tb="b1">' + (i + 1) + '</td>'];
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

export function renderProductionTable() {
  updateDupCounts();
  const q = (document.getElementById('q2')?.value || '').toLowerCase();
  let d = state.prodD;
  if (state.workerFilt !== 'all') d = d.filter(r => r.worker === state.workerFilt);
  if (q) d = d.filter(r => Object.values(r).some(v => v && String(v).toLowerCase().includes(q)));
  if (state.dupMode.prod) d = d.filter(r => rowHasDup(r, state.prodDups, PROD_SN_FIELDS));
  state.prodFiltered = d;
  const p2 = document.getElementById('p2'), cnt2 = document.getElementById('cnt2');
  if (p2) p2.textContent = d.length + '건';
  if (cnt2) cnt2.textContent = state.prodD.length;
  mkHead('th2', 'b2', PROD_HEADS);
  const rows = [];
  for (let i = 0; i < d.length; i++) {
    const r = d[i];
    const cells = ['<tr><td class="rn" data-row-idx="' + i + '" data-tb="b2">' + (i + 1) + '</td>'];
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
    const r = d[i], p = state.tftMap[r.tft_sn] || {};
    const cells = ['<tr><td class="rn" data-row-idx="' + i + '" data-tb="b3">' + (i + 1) + '</td>'];
    for (let j = 0; j < SHIP_FIELDS.length; j++) cells.push('<td class="cw">' + ci(r._id, 'm', SHIP_FIELDS[j], r[SHIP_FIELDS[j]]) + '</td>');
    for (let j = 0; j < PROD_VL_FIELDS.length; j++) cells.push('<td>' + vl(p[PROD_VL_FIELDS[j]], r.tft_sn) + '</td>');
    cells.push('</tr>');
    rows.push(cells.join(''));
  }
  const b3 = document.getElementById('b3');
  if (b3) b3.innerHTML = rows.join('');
}

export function renderAll() {
  if (state.curTab === 'ship') renderShipmentTable();
  else if (state.curTab === 'prod') renderProductionTable();
  else if (state.curTab === 'merge') renderMergeTable();
  else if (state.curTab === 'kpi') {
    import('./kpi.js').then(m => m.renderKPI()).catch(() => {});
  }
}

export { SHIP_SN_FIELDS, PROD_SN_FIELDS, rowHasDup };

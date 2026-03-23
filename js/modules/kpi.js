// ═══════════════════════════════════════
// KPI DASHBOARD (Half-year + Monthly)
// ═══════════════════════════════════════
import { state } from '../state.js';

function wdRange(s, e) { let c = 0; const d = new Date(s.getTime()); while (d <= e) { const w = d.getDay(); if (w && w < 6) c++; d.setDate(d.getDate() + 1); } return c; }
function mRange(yr, m) { return { s: new Date(yr, m - 1, 1), e: new Date(yr, m, 0) }; }
function hRange(yr, h) { if (!h) return { s: new Date(yr, 0, 1), e: new Date(yr, 11, 31) }; return h === 1 ? { s: new Date(yr, 0, 1), e: new Date(yr, 5, 30) } : { s: new Date(yr, 6, 1), e: new Date(yr, 11, 31) }; }

export function initKPI() {
  [0, 1, 2].forEach(i => {
    const el = document.getElementById('kpiH' + i);
    if (el) el.addEventListener('click', () => { state.kpiH = i; [0, 1, 2].forEach(j => { const e2 = document.getElementById('kpiH' + j); if (e2) e2.classList.toggle('on', j === i); }); renderKPI(); });
  });
  const ySel = document.getElementById('kpiYear');
  if (ySel) ySel.addEventListener('change', () => renderKPI());
}

export function renderKPI() {
  const wrap = document.getElementById('kpiWrap'); if (!wrap) return;
  const yrs = [...new Set(state.prodD.filter(r => r.completed_date).map(r => new Date(r.completed_date).getFullYear()).filter(y => !isNaN(y)))].sort((a, b) => b - a);
  const ySel = document.getElementById('kpiYear'); if (!ySel) return;
  if (ySel.options.length !== yrs.length) ySel.innerHTML = yrs.map(y => `<option value="${y}">${y}년</option>`).join('');
  const yr = parseInt(ySel.value) || yrs[0];
  if (!yr) { wrap.innerHTML = '<div class="kpi-empty">생산 데이터가 없습니다</div>'; return; }
  const today = new Date();
  const months = state.kpiH === 1 ? [1,2,3,4,5,6] : state.kpiH === 2 ? [7,8,9,10,11,12] : [1,2,3,4,5,6,7,8,9,10,11,12];
  const mWd = {}; months.forEach(m => { const { s, e } = mRange(yr, m); mWd[m] = s > today ? 0 : wdRange(s, e > today ? today : e); });
  const { s: hs, e: he } = hRange(yr, state.kpiH);
  const totalWd = hs > today ? 0 : wdRange(hs, he > today ? today : he);
  const h1Wd = (() => { const { s, e } = hRange(yr, 1); return s > today ? 0 : wdRange(s, e > today ? today : e); })();
  const h2Wd = (() => { const { s, e } = hRange(yr, 2); return s > today ? 0 : wdRange(s, e > today ? today : e); })();
  const data = state.prodD.filter(r => { if (!r.completed_date) return false; const d = new Date(r.completed_date); if (isNaN(d) || d.getFullYear() !== yr) return false; if (state.kpiH === 1) return d.getMonth() < 6; if (state.kpiH === 2) return d.getMonth() >= 6; return true; });
  const workers = [...new Set(data.map(r => r.worker).filter(Boolean))].sort();
  const stats = {}, mTot = {}, workerDates = {};
  workers.forEach(w => { stats[w] = {}; workerDates[w] = {}; });
  months.forEach(m => mTot[m] = 0);
  const hStat = {}, hTot = { 1: 0, 2: 0 }, hDates = {};
  workers.forEach(w => { hStat[w] = { 1: 0, 2: 0 }; hDates[w] = { 1: new Set(), 2: new Set() }; });
  data.forEach(r => { if (!r.worker) return; const d = new Date(r.completed_date), m = d.getMonth() + 1, half = m <= 6 ? 1 : 2; if (!stats[r.worker]) stats[r.worker] = {}; if (!workerDates[r.worker]) workerDates[r.worker] = {}; stats[r.worker][m] = (stats[r.worker][m] || 0) + 1; mTot[m] = (mTot[m] || 0) + 1; if (!workerDates[r.worker][m]) workerDates[r.worker][m] = new Set(); workerDates[r.worker][m].add(r.completed_date.slice(0, 10)); if (!hStat[r.worker]) hStat[r.worker] = { 1: 0, 2: 0 }; hStat[r.worker][half]++; hTot[half]++; if (!hDates[r.worker]) hDates[r.worker] = { 1: new Set(), 2: new Set() }; hDates[r.worker][half].add(r.completed_date.slice(0, 10)); });
  const wTot = {}, wTotDays = {};
  workers.forEach(w => { wTot[w] = months.reduce((s, m) => s + (stats[w][m] || 0), 0); wTotDays[w] = months.reduce((s, m) => s + (workerDates[w][m] ? workerDates[w][m].size : 0), 0); });
  const totalCnt = Object.values(wTot).reduce((s, v) => s + v, 0);
  const maxWt = Math.max(...Object.values(wTot), 1);
  const el = document.getElementById('kpiTotal'); if (el) el.textContent = totalCnt + '건';
  const hLabel = { 0: '전체', 1: '상반기', 2: '하반기' };
  const mLabel = { 1: '1월', 2: '2월', 3: '3월', 4: '4월', 5: '5월', 6: '6월', 7: '7월', 8: '8월', 9: '9월', 10: '10월', 11: '11월', 12: '12월' };

  let h = '<div class="kpi-cards">';
  h += `<div class="kpi-card hi"><div class="kc-lbl">총 생산대수</div><div class="kc-val">${totalCnt}<span>대</span></div><div class="kc-sub">${yr}년 ${hLabel[state.kpiH]}</div></div>`;
  h += `<div class="kpi-card"><div class="kc-lbl">워킹데이</div><div class="kc-val">${totalWd}<span>일</span></div><div class="kc-sub">주말 제외 영업일</div></div>`;
  h += `<div class="kpi-card ok2"><div class="kc-lbl">일평균 생산</div><div class="kc-val">${totalWd ? (totalCnt / totalWd).toFixed(2) : '-'}<span>대/일</span></div><div class="kc-sub">전체 평균</div></div>`;
  h += `<div class="kpi-card"><div class="kc-lbl">작업자</div><div class="kc-val">${workers.length}<span>명</span></div><div class="kc-sub">유효 데이터 기준</div></div>`;
  if (!state.kpiH) {
    h += `<div class="kpi-card"><div class="kc-lbl">상반기</div><div class="kc-val">${hTot[1]}<span>대</span></div><div class="kc-sub">${h1Wd}영업일 · ${h1Wd ? (hTot[1] / h1Wd).toFixed(2) : '-'}대/일</div></div>`;
    h += `<div class="kpi-card"><div class="kc-lbl">하반기</div><div class="kc-val">${hTot[2]}<span>대</span></div><div class="kc-sub">${h2Wd}영업일 · ${h2Wd ? (hTot[2] / h2Wd).toFixed(2) : '-'}대/일</div></div>`;
  }
  h += '</div>';

  // Half-year table
  if (!state.kpiH) {
    h += '<div class="kpi-sec"><div class="kpi-sec-h">📊 반기별 작업자 생산 현황</div><table class="kt"><thead><tr>';
    h += '<th class="tl" style="min-width:80px">작업자</th>';
    h += `<th>상반기 (1~6월)<br><span style="font-size:8px;font-weight:400;opacity:.7">${h1Wd}영업일</span></th>`;
    h += `<th>하반기 (7~12월)<br><span style="font-size:8px;font-weight:400;opacity:.7">${h2Wd}영업일</span></th>`;
    h += '<th style="background:#1a3352">연간 합계</th></tr></thead><tbody>';
    workers.forEach(w => { h += `<tr><td class="wn">${w}</td>`; [1, 2].forEach(hf => { const c = hStat[w][hf] || 0, wd = hDates[w][hf] ? hDates[w][hf].size : 0; h += `<td><div class="kn">${c}대</div><div class="ka">${wd && c ? (c / wd).toFixed(2) : '-'}대/일</div><div style="font-size:8px;opacity:.55;margin-top:1px">실작업 ${wd}일</div></td>`; }); const c = wTot[w], wd = wTotDays[w]; h += `<td class="tc"><div class="kn">${c}대</div><div class="ka">${wd && c ? (c / wd).toFixed(2) : '-'}대/일</div><div style="font-size:8px;opacity:.55;margin-top:1px">실작업 ${wd}일</div></td></tr>`; });
    h += '<tr class="tr"><td class="wn" style="background:var(--hd);color:var(--ht)">합계</td>';
    [1, 2].forEach(hf => { const c = hTot[hf], wd = hf === 1 ? h1Wd : h2Wd; h += `<td><div class="kn">${c}대</div><div class="ka">${wd && c ? (c / wd).toFixed(2) : '-'}대/일</div></td>`; });
    h += `<td><div class="kn">${totalCnt}대</div><div class="ka">${totalWd && totalCnt ? (totalCnt / totalWd).toFixed(2) : '-'}대/일</div></td></tr></tbody></table></div>`;
  }

  // Monthly table
  h += '<div class="kpi-sec"><div class="kpi-sec-h">📋 월별 작업자 생산 현황</div><div style="overflow-x:auto"><table class="kt"><thead><tr>';
  h += '<th class="tl" style="min-width:70px;position:sticky;left:0;z-index:2;background:#2a3a52">작업자</th>';
  months.forEach(m => h += `<th style="min-width:58px">${mLabel[m]}<br><span style="font-size:7px;font-weight:400;opacity:.6">${mWd[m]}일</span></th>`);
  h += `<th style="background:#1a3352;min-width:65px">${hLabel[state.kpiH]} 합계</th></tr></thead><tbody>`;
  workers.forEach(w => { h += `<tr><td class="wn" style="position:sticky;left:0;z-index:1">${w}</td>`; months.forEach(m => { const c = stats[w][m] || 0, wd = workerDates[w][m] ? workerDates[w][m].size : 0; const bg = c === 0 ? '' : 'background:rgba(59,109,224,' + Math.min(c / 8, .25).toFixed(2) + ')'; h += `<td style="${bg}"><div class="kn">${c}</div><div class="ka">${wd && c ? (c / wd).toFixed(1) : '-'}/일</div></td>`; }); const c = wTot[w], wd = wTotDays[w]; h += `<td class="tc"><div class="kn">${c}대</div><div class="ka">${wd && c ? (c / wd).toFixed(2) : '-'}대/일</div></td></tr>`; });
  h += '<tr class="tr"><td class="wn" style="background:var(--hd);color:var(--ht);position:sticky;left:0;z-index:1">합계</td>';
  months.forEach(m => { const c = mTot[m] || 0, wd = mWd[m]; h += `<td><div class="kn">${c}</div><div class="ka">${wd && c ? (c / wd).toFixed(1) : '-'}/일</div></td>`; });
  h += `<td><div class="kn">${totalCnt}</div><div class="ka">${totalWd && totalCnt ? (totalCnt / totalWd).toFixed(2) : '-'}/일</div></td></tr></tbody></table></div></div>`;

  // Monthly bar chart
  if (months.length > 1) {
    const maxM = Math.max(...months.map(m => mTot[m] || 0), 1);
    h += '<div class="kpi-sec"><div class="kpi-sec-h">📈 월별 생산 추이</div><div class="kpi-bars">';
    months.forEach(m => { const c = mTot[m] || 0, pct = Math.round(c / maxM * 100), wd = mWd[m]; h += `<div class="kpi-br"><div class="kpi-bn">${mLabel[m]}</div><div class="kpi-b"><div class="kpi-bf" style="width:${pct}%"></div></div><div class="kpi-bv">${c}대 <span style="color:var(--ts);font-weight:400">(${wd && c ? (c / wd).toFixed(2) : '-'}대/일)</span></div></div>`; });
    h += '</div></div>';
  }

  // Worker ranking
  if (workers.length) {
    h += '<div class="kpi-sec"><div class="kpi-sec-h">🏆 작업자별 생산 순위</div><div class="kpi-bars">';
    [...workers].sort((a, b) => wTot[b] - wTot[a]).forEach(w => { const c = wTot[w], wd = wTotDays[w], pct = Math.round(c / maxWt * 100); h += `<div class="kpi-br"><div class="kpi-bn">${w}</div><div class="kpi-b"><div class="kpi-bf" style="width:${pct}%"></div></div><div class="kpi-bv">${c}대 <span style="color:var(--ts);font-weight:400">(${wd && c ? (c / wd).toFixed(2) : '-'}대/일, ${wd}일 작업)</span></div></div>`; });
    h += '</div></div>';
  }
  wrap.innerHTML = h;
}

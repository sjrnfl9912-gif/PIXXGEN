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
  const wrap = document.getElementById('kpiWrap');
  if (wrap) wrap.addEventListener('click', e => {
    const nav = e.target.closest('[data-kw]');
    if (nav) { const v = nav.dataset.kw; state.kpiWeek = v === 'now' ? ymd(monOf(new Date())) : ymd(addDays(new Date(state.kpiWeek), +v * 7)); state.kpiCell = null; renderWeek(); return; }
    const row = e.target.closest('[data-kwk]');
    if (row) { state.kpiWeek = row.dataset.kwk; state.kpiCell = null; renderWeek(); document.getElementById('kpiWeek')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const cell = e.target.closest('[data-kc]');
    if (cell) { state.kpiCell = state.kpiCell === cell.dataset.kc ? null : cell.dataset.kc; renderWeek(); }
  });
}

// ── 주간 생산 일정 ──
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monOf = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
const isoWeek = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + 3 - (x.getDay() + 6) % 7); const y1 = new Date(x.getFullYear(), 0, 4); return 1 + Math.round(((x - y1) / 864e5 - 3 + (y1.getDay() + 6) % 7) / 7); };
const NO_MODEL = '모델 미기재';
const modelOf = r => (r.model_name || '').trim() || NO_MODEL;
const PAL = ['#3b6de0', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d', '#b45309'];
function modelColor(m) { if (m === NO_MODEL) return '#94a3b8'; let h = 0; for (const c of m) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PAL[h % PAL.length]; }
const chip = (m, n) => `<span class="kw-m" style="--mc:${modelColor(m)}" title="${esc(m)}">${esc(m)} <b>${n}</b></span>`;
function countBy(rows, f) { const o = new Map(); rows.forEach(r => { const k = f(r); o.set(k, (o.get(k) || 0) + 1); }); return [...o].sort((a, b) => b[1] - a[1]); }

function renderWeek() {
  const box = document.getElementById('kpiWeek'); if (!box) return;
  if (!state.kpiWeek) state.kpiWeek = ymd(monOf(new Date()));
  const mon = new Date(state.kpiWeek + 'T00:00:00');
  const days = [...Array(7)].map((_, i) => ymd(addDays(mon, i)));
  const rows = state.prodD.filter(r => r.completed_date && days.includes(r.completed_date.slice(0, 10)));
  // 주말은 그 주에 작업이 있을 때만 표시
  const shown = days.filter((d, i) => i < 5 || rows.some(r => r.completed_date.startsWith(d)));
  const workers = [...new Set(rows.map(r => r.worker || '(작업자 없음)'))].sort();
  const wk = r => r.worker || '(작업자 없음)';
  const DN = ['월', '화', '수', '목', '금', '토', '일'], today = ymd(new Date());

  let h = `<div class="kpi-sec-h">🗓 주간 생산 일정 <span class="kw-nav">`
    + `<button data-kw="-1">◀</button><b>${mon.getFullYear()}년 ${isoWeek(mon)}주차 · ${days[0].slice(5).replace('-', '/')} ~ ${days[6].slice(5).replace('-', '/')}</b>`
    + `<button data-kw="1">▶</button><button data-kw="now">이번 주</button></span><span class="kw-tot">${rows.length}대</span></div>`;
  if (!rows.length) { box.innerHTML = h + '<div class="kpi-empty">이 주에는 생산 기록이 없습니다</div>'; return; }

  h += '<div style="overflow-x:auto"><table class="kt kw"><thead><tr><th class="tl">작업자</th>';
  shown.forEach(d => { const i = days.indexOf(d); h += `<th class="${d === today ? 'kw-today' : ''}">${DN[i]} ${d.slice(5).replace('-', '/')}</th>`; });
  h += '<th style="background:#1a3352">주 합계</th></tr></thead><tbody>';
  const cellHtml = (list, key) => {
    if (!list.length) return '<td class="kw-c kw-0">·</td>';
    return `<td class="kw-c${state.kpiCell === key ? ' kw-sel' : ''}" data-kc="${esc(key)}"><div class="kw-n">${list.length}대</div>`
      + countBy(list, modelOf).map(([m, n]) => chip(m, n)).join('') + '</td>';
  };
  workers.forEach(w => {
    const mine = rows.filter(r => wk(r) === w);
    h += `<tr><td class="wn">${esc(w)}</td>`;
    shown.forEach(d => { h += cellHtml(mine.filter(r => r.completed_date.startsWith(d)), w + '|' + d); });
    h += cellHtml(mine, w + '|*').replace('kw-c', 'kw-c tc') + '</tr>';
  });
  h += '<tr class="tr"><td class="wn" style="background:var(--hd);color:var(--ht)">합계</td>';
  shown.forEach(d => { h += cellHtml(rows.filter(r => r.completed_date.startsWith(d)), '*|' + d); });
  h += cellHtml(rows, '*|*') + '</tr></tbody></table></div>';

  // 클릭한 칸의 상세(생산번호·TFT 등)
  if (state.kpiCell) {
    const [cw, cd] = state.kpiCell.split('|');
    const sel = rows.filter(r => (cw === '*' || wk(r) === cw) && (cd === '*' || r.completed_date.startsWith(cd)))
      .sort((a, b) => a.completed_date.localeCompare(b.completed_date) || wk(a).localeCompare(wk(b)));
    h += `<div class="kw-det"><div class="kw-det-h">${cw === '*' ? '전체' : esc(cw)} · ${cd === '*' ? '이번 주' : cd} — ${sel.length}대 <button data-kc="${esc(state.kpiCell)}">닫기 ✕</button></div>`
      + '<table class="kt"><thead><tr><th>완료일</th><th>작업자</th><th class="tl">모델명</th><th>생산번호</th><th>TFT S/N</th><th>CPU S/N</th><th>F/W</th></tr></thead><tbody>'
      + sel.map(r => `<tr><td>${esc(r.completed_date.slice(0, 10))}</td><td>${esc(wk(r))}</td><td class="tl">${chip(modelOf(r), '').replace(' <b></b>', '')}</td><td>${esc(r.prod_no || '-')}</td><td class="kw-mono">${esc(r.tft_sn || '-')}</td><td class="kw-mono">${esc(r.cpu_sn || '-')}</td><td>${esc(r.detector_fw || '-')}</td></tr>`).join('')
      + '</tbody></table></div>';
  }
  box.innerHTML = h;
}

// 선택 기간(연도·반기)의 주별 요약 — 행을 누르면 위 주간 일정으로 이동
function weekSummaryHtml(data, workers) {
  const byWeek = new Map();
  data.forEach(r => { const k = ymd(monOf(new Date(r.completed_date.slice(0, 10) + 'T00:00:00'))); if (!byWeek.has(k)) byWeek.set(k, []); byWeek.get(k).push(r); });
  if (!byWeek.size) return '';
  const weeks = [...byWeek.keys()].sort().reverse();
  const max = Math.max(...[...byWeek.values()].map(v => v.length), 1);
  let h = '<div class="kpi-sec"><div class="kpi-sec-h">📅 주별 생산 요약 <span style="font-weight:400;opacity:.7">— 행을 누르면 그 주 일정으로</span></div><div style="overflow-x:auto"><table class="kt kw-sum"><thead><tr><th class="tl">주차</th><th>기간</th><th>합계</th>';
  workers.forEach(w => h += `<th>${esc(w)}</th>`);
  h += '<th class="tl">모델 구성</th></tr></thead><tbody>';
  weeks.forEach(k => {
    const list = byWeek.get(k), m = new Date(k + 'T00:00:00');
    h += `<tr data-kwk="${k}"${state.kpiWeek === k ? ' class="kw-cur"' : ''}><td class="tl">${isoWeek(m)}주</td><td>${k.slice(5).replace('-', '/')} ~ ${ymd(addDays(m, 6)).slice(5).replace('-', '/')}</td>`
      + `<td class="kw-bar" style="--p:${Math.round(list.length / max * 100)}%"><b>${list.length}</b></td>`;
    workers.forEach(w => { const n = list.filter(r => r.worker === w).length; h += `<td>${n || '<span style="opacity:.3">-</span>'}</td>`; });
    h += `<td class="tl">${countBy(list, modelOf).map(([mm, n]) => chip(mm, n)).join('')}</td></tr>`;
  });
  return h + '</tbody></table></div></div>';
}

export function renderKPI() {
  const wrap = document.getElementById('kpiWrap'); if (!wrap) return;
  const yrs = [...new Set(state.prodD.filter(r => r.completed_date).map(r => new Date(r.completed_date).getFullYear()).filter(y => !isNaN(y)))].sort((a, b) => b - a);
  const ySel = document.getElementById('kpiYear'); if (!ySel) return;
  // 연도 집합이 바뀌면(개수가 같아도) 옵션 갱신 — 기존 선택값은 유효하면 유지
  const curOpts = [...ySel.options].map(o => o.value).join(',');
  if (curOpts !== yrs.join(',')) {
    const prev = ySel.value;
    ySel.innerHTML = yrs.map(y => `<option value="${y}">${y}년</option>`).join('');
    if (yrs.map(String).includes(prev)) ySel.value = prev;
  }
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

  h += '<div class="kpi-sec" id="kpiWeek"></div>';
  h += weekSummaryHtml(data, workers);

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
  renderWeek();
}

// ═══════════════════════════════════════
// PCB 불량 — 등록 안내(라벨 번호 발급) · 검색 · 통계 · 주간보고 메일 미리보기 · 설정
//   등록·상태 변경 = 로그인(보기 계정 포함) / 설정·삭제 = 편집 모드
//   사진은 Google Drive(Apps Script 업로드 창구)에 저장, DB엔 파일 ID만
// ═══════════════════════════════════════
import { getSupabase } from '../config.js';
import { state } from '../state.js';
import { toast, customConfirm } from '../services/ui.js';
import { requireEdit } from '../services/editmode.js';
import { DAYS, ymd, md, toDate, weekStart, nextSends, reportData, lastPlanned, emailSubject, buildReportEmail } from './pcb-report.js';

const STATUSES = ['등록', '연구소 확인', '수리중', '수리완료', '폐기'];
const TONE = { '등록': 'new', '연구소 확인': 'check', '수리중': 'fix', '수리완료': 'done', '폐기': 'scrap' };
const DEFAULTS = { cats: [], people: [], label: { prefix: '', date: 'YYMMDD', sep: '-', digits: 2 }, drive: { url: '' }, report: { day: '금', time: '17:00', period: 'this', photo: 'thumb', holidayMode: 'skip', to: [], cc: [], holidays: [], repeatWeeks: 3, overdueDays: 7 }, archive: { on: true, dir: '', name: '' } };
const P = { rows: [], set: structuredClone(DEFAULTS), draft: null, token: '', ready: false, missing: false, sub: 'home', q: '', fCat: '', open: null, openSet: 'report' };

const sb = () => getSupabase();
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const thumb = (id, w = 400) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;
const dstr = d => `${ymd(d).slice(5).replace('-', '/')}(${DAYS[d.getDay()]})`;
// 등록 창 「버전 · S/N」 칸 안내 (듀얼배터리보드는 시리얼 없음)
const PART_PH = { '메인보드': '예: V1.3 / MB40388', '듀얼배터리보드': '예: V2.1 (S/N 없음)', 'CPU': '예: CPU30412' };
const isOpenStatus = r => r.status === '등록' || r.status === '연구소 확인';
// 발송 일정용: 설정의 회사 휴무일 + 자동 공휴일(발송 PC가 구글 '대한민국의 휴일'에서 받아 저장)
const withHolidays = R => ({ ...R, holidays: [...new Set([...(R.holidays || []), ...(P.set.holidays_auto?.dates || [])])] });

// ═══ 데이터 ═══
async function loadAll() {
  const c = sb(); if (!c) return;
  const [d, s, k] = await Promise.all([
    c.from('pcb_defects').select('*').order('found_date', { ascending: false }).order('label', { ascending: false }),
    c.from('pcb_settings').select('key,value'),
    c.from('pcb_secrets').select('value').eq('key', 'drive_token').maybeSingle(),
  ]);
  if (d.error) { P.missing = /pcb_defects/.test(d.error.message || '') || d.error.code === '42P01'; console.error(d.error); return; }
  P.rows = d.data || [];
  (s.data || []).forEach(x => { P.set[x.key] = Array.isArray(x.value) ? x.value : { ...(DEFAULTS[x.key] || {}), ...x.value }; });
  P.token = k.data?.value || '';
  P.ready = true;
  updateCount();
}
function updateCount() {
  const el = $('cntPcb'); if (el) el.textContent = P.rows.filter(r => r.status === '등록' || r.incomplete).length;
}
function upsertRow(rec) {
  const i = P.rows.findIndex(r => r.id === rec.id);
  if (i >= 0) P.rows[i] = rec; else P.rows.unshift(rec);
  updateCount();
}

// ═══ 탭 화면 ═══
export function renderPCB() {
  const wrap = $('pcbWrap'); if (!wrap) return;
  if (P.missing) { wrap.innerHTML = '<div class="pcb-empty">PCB 불량 DB가 아직 준비되지 않았어요 — 관리자가 설정 SQL(06_PCB불량.sql)을 실행해야 합니다.</div>'; return; }
  if (!P.ready) { wrap.innerHTML = '<div class="pcb-empty">불러오는 중…</div>'; loadAll().then(() => P.ready && renderPCB()); return; }
  document.querySelectorAll('#v-pcb .pcb-sub').forEach(b => b.classList.toggle('on', b.dataset.sub === P.sub));
  ({ home: renderHome, stats: renderStats, mail: renderMail, set: renderSet })[P.sub](wrap);
}

function tag(r) {
  return r.incomplete ? '<span class="pcb-st t-inc">내용 미입력</span>' : `<span class="pcb-st t-${TONE[r.status] || 'new'}">${esc(r.status)}</span>`;
}

function search() {
  const q = P.q.trim().toLowerCase();
  return P.rows.filter(r => (!P.fCat || r.cat === P.fCat) &&
    (!q || [r.label, r.part_sn, r.cat, r.note, ...(r.symptoms || [])].some(v => String(v || '').toLowerCase().includes(q))));
}

function renderHome(wrap) {
  if (!wrap.querySelector('.pcb-search')) {
    wrap.innerHTML = `<div class="pcb-card pcb-search">
        <h2>PCB에 붙은 라벨 번호를 입력하세요</h2>
        <div class="pcb-sbox"><input id="pcbQ" placeholder="예: 261020-01" autocomplete="off"></div>
        <div class="pcb-hint">버전 · S/N · 불량 내용으로도 찾을 수 있어요</div>
        <div class="pcb-cats" id="pcbCats"></div></div>
      <div class="pcb-card pcb-list"><table><thead><tr><th style="width:110px">라벨 번호</th><th>구분 · 불량 내용</th><th style="width:130px">등록</th><th style="width:90px">상태</th></tr></thead><tbody id="pcbFeed"></tbody></table></div>`;
    const q = $('pcbQ'); q.value = P.q;
    q.addEventListener('input', () => { P.q = q.value; renderFeed(); });
    q.addEventListener('keydown', e => e.stopPropagation());   // 그리드 단축키로 새지 않게
  }
  $('pcbCats').innerHTML = ['', ...P.set.cats.map(c => c.name)].map(c => `<button class="chip ${P.fCat === c ? 'on' : ''}" data-fcat="${esc(c)}">${esc(c) || '전체'}</button>`).join('');
  renderFeed();
}

function renderFeed() {
  const rs = search().slice(0, 300);
  let html = '', wk = '';
  rs.forEach(r => {
    const w = weekStart(toDate(r.found_date)), k = ymd(w);
    if (k !== wk) { wk = k; html += `<tr class="pcb-wk"><td colspan="4">${w.getMonth() + 1}월 ${w.getDate()}일 주 · ${rs.filter(x => ymd(weekStart(toDate(x.found_date))) === k).length}건</td></tr>`; }
    const sym = r.incomplete ? '<span class="pcb-muted">불량 내용을 아직 안 적었어요</span>' : `<b>${esc((r.symptoms || []).join(', '))}</b>`;
    html += `<tr class="pcb-it ${P.open === r.id ? 'open' : ''}" data-open="${r.id}"><td class="pcb-lab">${esc(r.label)}</td><td>${esc(r.cat)} — ${sym}${(r.photos || []).length ? ' 📷' : ''}</td>
      <td class="pcb-muted">${esc(String(r.found_date).slice(5))} · ${esc(r.reporter || '-')}</td><td>${tag(r)}</td></tr>`;
    if (P.open === r.id) html += `<tr class="pcb-exp"><td colspan="4">${detail(r)}</td></tr>`;
  });
  $('pcbFeed').innerHTML = html || '<tr><td colspan="4" class="pcb-empty">결과 없음</td></tr>';
}

function detail(r) {
  const ed = state.editMode;
  if (r.incomplete) return ed
    ? `라벨은 붙였지만 불량 내용이 비어 있어요. <button class="btn btn-pr" data-resume="${r.id}">불량 내용 적기</button> <button class="btn" data-del="${r.id}">삭제</button>`
    : '라벨은 붙였지만 불량 내용을 아직 안 적었어요.';
  const ph = r.photos || [];
  const pics = ph.length ? `<div class="pcb-pics">${ph.map(p => `<a href="https://drive.google.com/file/d/${encodeURIComponent(p.id)}/view" target="_blank" rel="noopener"><img src="${thumb(p.id, 600)}" alt="불량 사진" loading="lazy"></a>`).join('')}</div>` : '<div class="pcb-nopic">사진 없음</div>';
  const kv = `<dl class="pcb-kv"><dt>구분</dt><dd>${esc(r.cat)}</dd><dt>불량</dt><dd><b>${esc((r.symptoms || []).join(', '))}</b></dd>${r.note ? `<dt>내용</dt><dd>${esc(r.note)}</dd>` : ''}
    <dt>버전·S/N</dt><dd class="pcb-mono">${esc(r.part_sn || '-')}</dd><dt>등록</dt><dd>${esc(r.found_date)} · ${esc(r.reporter || '-')}</dd>
    ${ed ? '' : `<dt>상태</dt><dd>${tag(r)}</dd>${r.lab_note ? `<dt>연구소</dt><dd>${esc(r.lab_note)}</dd>` : ''}`}</dl>`;
  if (!ed) return `<div class="pcb-expgrid">${pics}<div>${kv}</div></div>`;
  return `<div class="pcb-expgrid">${pics}<div>${kv}
    <div class="pcb-stsel">${STATUSES.map(s => `<button class="chip ${r.status === s ? 'on' : ''}" data-status="${esc(s)}" data-id="${r.id}">${s}</button>`).join('')}</div>
    <textarea class="pcb-labnote" rows="2" placeholder="연구소 원인 · 조치" data-labnote="${r.id}">${esc(r.lab_note || '')}</textarea>
    <div class="pcb-row-btns"><button class="btn" data-savelab="${r.id}">메모 저장</button>
      <button class="btn" data-resume="${r.id}">내용·사진 수정</button><button class="btn" data-del="${r.id}">삭제</button></div></div></div>`;
}

async function updateRow(id, patch) {
  const { data, error } = await sb().from('pcb_defects').update(patch).eq('id', id).select().single();
  if (error) { toast('저장 실패: ' + error.message, 'er'); return null; }
  upsertRow(data); return data;
}

// ═══ 통계 (주간 보고 메일과 분리) ═══
function findRepeats(lastWs, weeksNeed) {
  const g = {};
  P.rows.forEach(r => (r.symptoms || []).forEach(s => (g[`${r.cat} · ${s}`] ??= []).push(r)));
  return Object.entries(g).map(([text, rs]) => {
    const wks = new Set(rs.map(r => ymd(weekStart(toDate(r.found_date)))));
    let n = 0; for (const s = new Date(lastWs); wks.has(ymd(s)); s.setDate(s.getDate() - 7)) n++;
    return { text, weeks: n, count: rs.length };
  }).filter(x => x.weeks >= weeksNeed).sort((a, b) => b.weeks - a.weeks);
}

function renderStats(wrap) {
  const R = P.set.report, today = new Date(), thisWs = weekStart(today);
  const lastWs = new Date(thisWs); lastWs.setDate(lastWs.getDate() - 7);
  const inWeek = (r, s) => { const d = toDate(r.found_date); return d >= s && d < new Date(s.getTime() + 7 * 864e5); };
  const weeks = [];
  for (let i = 7; i >= 0; i--) { const s = new Date(thisWs); s.setDate(s.getDate() - 7 * i); weeks.push({ label: `${s.getMonth() + 1}/${s.getDate()}주`, count: P.rows.filter(r => inWeek(r, s)).length }); }
  const recent = P.rows.filter(r => toDate(r.found_date) >= new Date(thisWs.getTime() - 7 * 7 * 864e5));
  const open = P.rows.filter(isOpenStatus), overdue = open.filter(r => (today - toDate(r.found_date)) / 864e5 >= (R.overdueDays || 7));
  const repeats = findRepeats(thisWs, R.repeatWeeks || 3).concat(findRepeats(lastWs, R.repeatWeeks || 3)).filter((x, i, a) => a.findIndex(y => y.text === x.text) === i);
  const cnt = {}; recent.forEach(r => (r.symptoms || []).forEach(s => { const k = `${r.cat} · ${s}`; cnt[k] = (cnt[k] || 0) + 1; }));
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const cats = P.set.cats.map(c => ({ name: c.name, n: recent.filter(r => r.cat === c.name).length }));
  const mx = a => Math.max(1, ...a);
  const wmax = mx(weeks.map(w => w.count)), tmax = mx(top.map(t => t[1])), cmax = mx(cats.map(c => c.n));
  wrap.innerHTML = `<div class="pcb-stat">
    <div class="pcb-kpis">
      <div class="pcb-card pcb-kpi"><small>이번 주</small><b>${weeks[7].count}건</b><em>${md(thisWs)}~</em></div>
      <div class="pcb-card pcb-kpi"><small>지난주</small><b>${weeks[6].count}건</b><em>그 전주 ${weeks[5].count}건</em></div>
      <div class="pcb-card pcb-kpi"><small>최근 8주</small><b>${recent.length}건</b><em>주 평균 ${(recent.length / 8).toFixed(1)}건</em></div>
      <div class="pcb-card pcb-kpi"><small>처리 대기</small><b>${open.length}건</b><em>등록 · 연구소 확인</em></div>
      <div class="pcb-card pcb-kpi"><small>${R.overdueDays || 7}일 넘게 미확인</small><b class="pcb-warnc">${overdue.length}건</b><em>연구소 확인 필요</em></div></div>
    <div class="pcb-g">
      <div class="pcb-card pcb-pn"><h4>주별 불량 건수 (최근 8주)</h4><div class="pcb-vb">${weeks.map((w, i) => `<div class="${i === 7 ? 'cur' : ''}"><span class="tip">${w.label} · ${w.count}건</span><i style="height:${w.count / wmax * 100}%"></i></div>`).join('')}</div>
        <div class="pcb-xl">${weeks.map(w => `<span>${w.label}</span>`).join('')}</div></div>
      <div class="pcb-card pcb-pn"><h4>주의</h4>
        ${repeats.map(r => `<div class="pcb-warn r">⚠ 반복 불량 · ${esc(r.text)} — ${r.weeks}주 연속 (누적 ${r.count}건)</div>`).join('') || '<div class="pcb-warn n">반복 불량 없음</div>'}
        ${overdue.length ? `<div class="pcb-warn y">⏱ ${R.overdueDays || 7}일 넘게 미확인: ${overdue.map(r => `<a data-goto="${esc(r.label)}">${esc(r.label)}</a>`).join(', ')}</div>` : ''}</div></div>
    <div class="pcb-g half">
      <div class="pcb-card pcb-pn"><h4>구분별 (최근 8주)</h4>${cats.map(c => `<div class="pcb-hb"><span>${esc(c.name)}</span><i style="width:${c.n / cmax * 100}%"></i><span>${c.n}</span></div>`).join('')}</div>
      <div class="pcb-card pcb-pn"><h4>많이 나온 불량 (최근 8주)</h4>${top.map(([k, v]) => `<div class="pcb-hb"><span>${esc(k)}</span><i style="width:${v / tmax * 100}%"></i><span>${v}</span></div>`).join('') || '<div class="pcb-muted">없음</div>'}</div></div></div>`;
}

// ═══ 주간보고 메일 미리보기 ═══
function renderMail(wrap) {
  const R = withHolidays(P.set.report), p = reportData(P.rows, R, P.set.cats, lastPlanned(R)), S = P.set.report_state;
  const html = buildReportEmail(p, R, { webUrl: location.origin + location.pathname, photoSrc: (r, ph) => thumb(ph.id, 200) });
  const ppl = a => (a || []).map(x => `${esc(x.name)} &lt;${esc(x.email)}&gt;`).join('<br>') || '<span class="pcb-warnc">아직 없음 — 설정에서 추가</span>';
  const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
  wrap.innerHTML = `<div class="pcb-mail"><iframe id="pcbMailFrame" title="주간보고 메일 미리보기"></iframe>
    <div class="pcb-card pcb-side">
      <h4>보고 기간</h4><div class="r"><b>${p.week}</b> (${md(p.from)}~${md(p.to)}) · 불량 <b>${p.rows.length}건</b><br><small>미리보기 = ${dstr(p.planned)} ${esc(R.time)} 발송분</small></div>
      <h4>보내는 계정</h4><div class="r">${R.from ? `<b>${esc(R.from)}</b> (다우오피스)` : '<span class="pcb-warnc">아직 없음</span>'}</div>
      <h4>받는 사람</h4><div class="r">${ppl(R.to)}</div><h4>참조</h4><div class="r">${ppl(R.cc)}</div>
      <h4>제목</h4><div class="r"><b>${esc(emailSubject(p, R))}</b></div>
      <h4>마지막 발송</h4><div class="r">${S?.sent_at ? `<b>${esc(S.sent_at.replace('T', ' ').slice(0, 16))}</b> · ${esc(S.week)} ${S.count}건 → ${S.rcpts}명` : '아직 없음'}</div>
      <h4>다음 발송 · 매주 ${esc(R.day)} ${esc(R.time)}</h4>${schedHtml(nextSends(R, tmr, 5), R)}
      <div class="pcb-btns"><button class="btn" id="pcbCopyHtml">〈/〉 HTML 코드 복사</button>
        <button class="btn" data-sub="set">⚙ 받는 사람 · 일정 설정</button></div>
      <div class="pcb-note">발송 PC가 정해진 시간에 다우오피스 메일로 자동 발송하고, 같은 내용을 엑셀(사진 포함)로 공유폴더에 저장합니다.</div></div></div>`;
  $('pcbMailFrame').srcdoc = html;
  $('pcbCopyHtml').onclick = () => { navigator.clipboard?.writeText(html); toast('메일 HTML 코드를 복사했어요', 'ok'); };
}
function schedHtml(list, R) {
  return `<ul class="pcb-sched">${list.map(x => x.send
    ? `<li><span>${dstr(x.send)} ${esc(R.time)}</span>${ymd(x.send) !== ymd(x.planned) ? `<span class="mv">${dstr(x.planned)} 공휴일 → 미룸</span>` : ''}</li>`
    : `<li class="sk"><span>${dstr(x.planned)}</span><span>공휴일 건너뜀</span></li>`).join('')}</ul>`;
}

// ═══ 설정 (편집 모드에서 저장) ═══
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
function setPath(o, p, v) { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k] ??= {}, o)[last] = v; }

function renderSet(wrap) {
  P.draft ??= structuredClone(P.set);
  const D = P.draft, R = withHolidays(D.report), A = D.archive;
  const ro = !state.editMode;
  const sec = (k, t, sum, body) => `<details ${P.openSet === k ? 'open' : ''} data-sec="${k}"><summary><b>${t}</b><small>${esc(sum)}</small></summary><div class="sc">${body}
      <div class="pcb-savebar"><button class="btn btn-pr" data-save="${k}" ${ro ? 'disabled' : ''}>저장</button>${ro ? '<span class="pcb-note">수정하려면 상단 「보기 모드」 스위치를 켜세요</span>' : ''}</div></div></details>`;
  const choice = (path, opts) => `<div class="pcb-tags">${opts.map(([v, n]) => `<button class="chip ${getPath(D, path) === v ? 'on' : ''}" data-set="${path}" data-val='${esc(JSON.stringify(v))}'>${n}</button>`).join('')}</div>`;
  const inp = (path, ph = '', type = 'text', style = '') => `<input type="${type}" data-path="${path}" value="${esc(getPath(D, path) ?? '')}" placeholder="${esc(ph)}" style="${style}">`;
  const area = (path, rows) => `<textarea rows="${rows}" data-path="${path}">${esc(getPath(D, path) ?? '')}</textarea>`;
  const tags = (path, ph = '＋ 입력 후 Enter') => `<div class="pcb-tags">${(getPath(D, path) || []).map((v, i) => `<span class="pcb-tag">${esc(v)}<button data-rm="${path}" data-i="${i}">×</button></span>`).join('')}<input class="pcb-addtag" data-add="${path}" placeholder="${esc(ph)}"></div>`;
  const people = path => (getPath(D, path) || []).map((x, i) => `<div class="pcb-mrow"><input data-path="${path}.${i}.name" value="${esc(x.name)}" placeholder="이름"><input type="email" data-path="${path}.${i}.email" value="${esc(x.email)}" placeholder="메일 주소"><button class="btn" data-rm="${path}" data-i="${i}">×</button></div>`).join('')
    + `<button class="btn" data-addperson="${path}">＋ 추가</button>`;
  const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
  const pv = reportData(P.rows, R, D.cats, lastPlanned(R));
  wrap.innerHTML = `<div class="pcb-card pcb-sett">
  ${sec('report', '✉ 주간보고 메일', `${R.day} ${R.time} · 받는 사람 ${(R.to || []).length}명 · 참조 ${(R.cc || []).length}명`, `
    <span class="lb">보내는 계정 (다우오피스 메일)</span>${inp('report.from', '예: hongsb@pixxgen.com', 'email')}
    <div class="pcb-secure">🔒 메일 비밀번호는 웹에 저장하지 않습니다 — 발송 PC에만 암호화해 보관</div>
    <span class="lb">받는 사람</span>${people('report.to')}
    <span class="lb">참조 (CC)</span>${people('report.cc')}
    <span class="lb">제목</span>${inp('report.subject')}<div class="pcb-note">{주차} {기간} {건수} {보내는사람} 자동 치환 — 예: ${esc(emailSubject(pv, R))}</div>
    <span class="lb">보내는 사람 이름</span>${inp('report.sender', '', 'text', 'max-width:200px')}
    <span class="lb">인사말</span>${area('report.greeting', 2)}
    <span class="lb">맺음말</span>${area('report.closing', 4)}
    <span class="lb">서명</span>${area('report.signature', 2)}
    <div class="pcb-g2"><div><span class="lb">발송 요일</span>${choice('report.day', ['월', '화', '수', '목', '금'].map(d => [d, d]))}</div>
      <div><span class="lb">발송 시간</span>${inp('report.time', '', 'time', 'max-width:130px')}</div></div>
    <span class="lb">보고 범위</span>${choice('report.period', [['this', '이번 주 (월요일 ~ 발송일)'], ['last', '지난주 (월 ~ 금)']])}
    <div class="pcb-note">금요일 발송이면 '이번 주', 월요일 발송이면 '지난주'가 맞습니다.</div>
    <span class="lb">불량 사진</span>${choice('report.photo', [['thumb', '본문에 작은 사진 (추천)'], ['link', '사진 보기 링크만'], ['attach', '첨부파일로']])}
    <span class="lb">발송일이 공휴일(빨간날)이면</span>${choice('report.holidayMode', [['skip', '그 주는 보내지 않기'], ['next', '다음 근무일에 보내기']])}
    <span class="lb">회사 휴무일 (공휴일 말고 추가로 쉬는 날)</span>${tags('report.holidays', 'YYYY-MM-DD 입력 후 Enter')}
    <div class="pcb-note">공휴일·대체공휴일·선거일은 구글 '대한민국의 휴일' 캘린더에서 자동으로 반영됩니다${P.set.holidays_auto?.fetched_at ? ` (마지막 확인 ${esc(P.set.holidays_auto.fetched_at.slice(0, 10))})` : ' (발송 PC가 처음 실행되면 채워짐)'}. 주말은 자동 제외.</div>
    <span class="lb">앞으로 발송 일정</span>${schedHtml(nextSends(R, tmr, 8), R)}`)}
  ${sec('archive', '📗 엑셀 보관', A.on ? (A.name || '') : '저장 안 함', `
    ${choice('archive.on', [[true, '메일 보낼 때 엑셀도 저장 (사진 포함)'], [false, '저장 안 함']])}
    <span class="lb">저장 위치</span>${inp('archive.dir')}
    <span class="lb">파일 이름</span>${inp('archive.name')}<div class="pcb-note">{연도} {주차} 자동 치환 · 한 주에 한 파일</div>`)}
  ${sec('drive', '📷 사진 저장 (Google Drive)', P.token ? '연결됨' : '토큰 미입력', `
    <div class="pcb-note" style="margin-top:0">사진은 Google Drive 「PCB불량사진」 폴더에 저장되고(파일명 = 라벨 번호), DB에는 파일 ID만 남습니다. 올릴 때 긴 변 1000px로 자동 축소.</div>
    <span class="lb">업로드 창구 주소 (Apps Script 웹 앱)</span>${inp('drive.url', 'https://script.google.com/macros/s/.../exec')}
    <span class="lb">업로드 토큰</span><input type="password" id="pcbToken" placeholder="${P.token ? '● 설정됨 — 바꿀 때만 입력' : 'drive-upload/Token.gs 의 값'}" ${ro ? 'disabled' : ''}>
    <div class="pcb-note">토큰은 로그인한 사람만 읽을 수 있는 곳에 저장됩니다.</div>`)}
  ${sec('cats', '관리 구분 · 자주 쓰는 불량', D.cats.map(c => c.name).join(', '), D.cats.map((c, i) => `<div class="pcb-catbox">
      <div class="pcb-r3"><input data-path="cats.${i}.name" value="${esc(c.name)}"><input data-path="cats.${i}.sub" value="${esc(c.sub || '')}" placeholder="설명 (예: 따로 구매)"><button class="btn" data-rm="cats" data-i="${i}">삭제</button></div>
      <span class="lb">등록 화면 버튼으로 나오는 불량 내용</span>${tags(`cats.${i}.quick`)}</div>`).join('') + '<button class="btn" data-addcat="1">＋ 구분 추가</button>')}
  ${sec('people', '등록자', D.people.join(', '), tags('people'))}
  ${sec('label', '라벨 번호', '', `
    <span class="lb">앞 글자 (영문·숫자, 비우면 없음)</span>${inp('label.prefix', '없음', 'text', 'max-width:200px')}
    <span class="lb">날짜</span>${choice('label.date', [['YYMMDD', 'YYMMDD (매일 순번 새로)'], ['YYYYMMDD', 'YYYYMMDD'], ['YYMM', 'YYMM (매월 순번 새로)']])}
    <span class="lb">순번</span>${choice('label.digits', [[2, '2자리'], [3, '3자리']])}
    <div class="pcb-note">번호는 등록 화면에서 구분을 고르는 순간 DB가 발급합니다 (동시에 등록해도 겹치지 않음).</div>`)}
  ${sec('stats', '📊 통계 경고 기준', `반복 ${R.repeatWeeks}주 · 미확인 ${R.overdueDays}일`, `<div class="pcb-g2">
    <div><span class="lb">반복 불량 (같은 구분·불량 N주 연속)</span>${inp('report.repeatWeeks', '', 'number', 'max-width:90px')}</div>
    <div><span class="lb">연구소 미확인 (등록 후 N일)</span>${inp('report.overdueDays', '', 'number', 'max-width:90px')}</div></div>
    <div class="pcb-note">통계 화면에만 표시 (메일에는 안 들어감).</div>`)}</div>`;
}

const SAVE_KEY = { report: 'report', stats: 'report', archive: 'archive', drive: 'drive', cats: 'cats', people: 'people', label: 'label' };
async function saveSection(sec) {
  if (!requireEdit()) return;
  const key = SAVE_KEY[sec], c = sb();
  const { error } = await c.from('pcb_settings').upsert({ key, value: P.draft[key], updated_at: new Date().toISOString() });
  if (error) { toast('설정 저장 실패: ' + error.message, 'er'); return; }
  P.set[key] = structuredClone(P.draft[key]);
  if (sec === 'drive') {
    const t = $('pcbToken')?.value.trim();
    if (t) {
      const r = await c.from('pcb_secrets').upsert({ key: 'drive_token', value: t });
      if (r.error) { toast('토큰 저장 실패: ' + r.error.message, 'er'); return; }
      P.token = t;
    }
  }
  toast('설정 저장됨', 'ok'); renderPCB();
}

// ═══ 등록 (편집 모드) — 탭 아래 바로 등록 줄에서 구분 선택 → 오른쪽 서랍에서 내용 입력 → 「등록」 때 번호 발급 ═══
//   잘못 눌러도 등록 전에는 아무것도 안 남음. 번호는 등록 순간 DB가 잠금 후 발급(동시에 눌러도 안 겹침).
let G = null;   // { cat, rec, part, by, sym, note, photos(새 dataURL), boards, busy, done }
const lastBy = () => { try { return localStorage.getItem('pcb_by'); } catch (e) { return null; } };

function renderStrip() {
  const el = $('pcbStrip'); if (!el) return;
  const n = P.rows.filter(r => String(r.found_date) === ymd(new Date())).length;
  el.innerHTML = `<span class="t">🔴 PCB 불량 등록</span>${P.set.cats.map((c, i) => `<button class="pcb-sc" data-scat="${i}">${esc(c.name)}</button>`).join('')}
    <span class="sp"></span><span class="recent">${P.lastLabel ? `방금 <b>${esc(P.lastLabel)}</b> 등록 · ` : ''}오늘 ${n}건</span>`;
}

export async function openPcbGuide(opts = {}) {
  if (!requireEdit()) return;
  if (!P.ready) await loadAll();
  if (P.missing) { toast('PCB 불량 DB가 아직 준비되지 않았어요', 'er'); return; }
  G = { cat: null, rec: null, part: '', by: lastBy() || P.set.people[0] || '', sym: [], note: '', photos: [], boards: opts.boards || null };
  if (opts.resume) {
    const r = P.rows.find(x => x.id === opts.resume);
    Object.assign(G, { rec: r, cat: r.cat, part: r.part_sn || '', by: r.reporter || G.by, sym: [...(r.symptoms || [])], note: r.note || '' });
  } else if (opts.cat) setCat(opts.cat);
  $('pcbGuideBg').classList.add('show'); $('pcbGuide').classList.add('show');
  renderGuide();
}
function setCat(cat) {
  if (G.cat !== cat) G.sym = [];   // 구분마다 불량 버튼 목록이 다름
  G.cat = cat; G.part = G.boards?.[cat] ?? G.part;
}
function closeGuide() {
  if (G?.busy) return;
  $('pcbGuideBg').classList.remove('show'); $('pcbGuide').classList.remove('show'); G = null;
  renderStrip(); if (state.curTab === 'pcb') renderPCB();
}
const showErr = m => { const e = $('pgErr'); if (e) { e.textContent = m; e.style.display = 'block'; } };
// 다시 그리기 전에 입력 중인 값 보존
function grab() {
  if (!G) return;
  if ($('pgNote')) G.note = $('pgNote').value;
  if ($('pgPart')) G.part = $('pgPart').value.trim();
  if ($('pgBy')) G.by = $('pgBy').value;
}

function renderGuide() {
  const s = G, box = $('pcbGuide');
  if (s.done) {   // 등록 끝 → 라벨에 쓸 번호를 크게, 확인을 받고 닫음
    box.innerHTML = `<div class="pd-head"><small>${esc(s.rec.cat)} · 등록 완료</small><div class="pd-q">라벨에 이 번호를 쓰세요</div></div>
      <div class="pd-body pd-labelstep">
        <div class="pd-bignum">${esc(s.rec.label)}</div>
        <ol class="pd-do"><li>라벨프린터에 <b>${esc(s.rec.label)}</b> 입력</li><li>출력해서 불량품에 붙이기</li><li>불량품은 불량 보관함에</li></ol>
      </div>
      <div class="pd-foot"><button class="pg-go" data-g="labelok">✓ 라벨 붙였어요 — 확인</button></div>`;
    return;
  }
  if (!s.cat) {   // 구분 고르기 (생산관리대장 우클릭으로 들어온 경우)
    box.innerHTML = `<div class="pd-head"><small>PCB 불량 등록</small><div class="pd-q">무엇이 불량인가요?</div><div class="pd-tip">고른 뒤 불량 내용을 적고 「등록」을 누르면 라벨 번호가 나옵니다</div></div>
      <div class="pd-body"><div class="pd-cats">${P.set.cats.map((c, i) => `<button data-gcat="${i}">${esc(c.name)}</button>`).join('')}</div>
        ${s.boards ? '<div class="pcb-note">생산관리대장의 버전·S/N을 가져옵니다</div>' : ''}</div>
      <div class="pd-foot"><button class="btn" data-g="close">취소</button></div>`;
    return;
  }
  const cat = P.set.cats.find(c => c.name === s.cat) || { quick: [] };
  const old = s.rec?.photos || [], canPhoto = P.set.drive?.url && P.token;
  const head = s.rec
    ? `<div class="pd-head"><small>${esc(s.rec.cat)} · 라벨 번호</small><div class="pd-num">${esc(s.rec.label)}</div></div>`
    : `<div class="pd-head"><small>PCB 불량 등록</small><div class="pd-q">불량 내용을 적고 「등록」</div><div class="pd-tip">등록을 누르면 라벨 번호가 나옵니다 · 취소하면 아무것도 안 남아요</div></div>`;
  box.innerHTML = `${head}
    <div class="pd-body">
      ${s.rec ? '' : `<label class="pd-l">구분 (잘못 골랐으면 바꾸세요)</label>
        <div class="pd-seg">${P.set.cats.map((c, i) => `<button data-gcat="${i}" class="${c.name === s.cat ? 'on' : ''}" ${s.busy ? 'disabled' : ''}>${esc(c.name)}</button>`).join('')}</div>`}
      <label class="pd-l">어떤 불량인가요? (여러 개)</label>
      <div class="pg-chips">${cat.quick.map(q => `<button data-gq="${esc(q)}" class="${s.sym.includes(q) ? 'on' : ''}">${esc(q)}</button>`).join('')}</div>
      <textarea id="pgNote" rows="2" placeholder="내용 메모 (선택)">${esc(s.note)}</textarea>
      <div class="pd-2"><div><label class="pd-l">${s.cat === '듀얼배터리보드' ? '보드 버전' : '버전 · S/N'} (선택)</label><input id="pgPart" value="${esc(s.part)}" placeholder="${PART_PH[s.cat] || '버전 / S/N'}"></div>
        <div><label class="pd-l">등록자</label><select id="pgBy">${P.set.people.map(p => `<option ${p === s.by ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div></div>
      <label class="pd-l">사진 (선택)</label>
      ${canPhoto ? `<div class="pg-photo">${old.map(p => `<img src="${thumb(p.id, 200)}" alt="등록된 사진">`).join('')}${s.photos.map(p => `<img src="${p}" alt="새 사진">`).join('')}
        <label class="add">📷 사진 추가<input type="file" accept="image/*" capture="environment" id="pgFile" multiple hidden></label></div>`
        : '<div class="pcb-note">사진 업로드가 아직 설정되지 않았어요 (설정 › 사진 저장)</div>'}
      <div class="pg-warn" id="pgErr"></div>
    </div>
    <div class="pd-foot"><button class="btn" data-g="close" ${s.busy ? 'disabled' : ''}>${s.rec ? '닫기' : '취소'}</button>
      <button class="pg-go" data-g="save" ${s.busy ? 'disabled' : ''}>${s.busy || (s.rec ? '저장 ✓' : '등록 → 라벨 번호 받기')}</button></div>`;
  $('pgFile')?.addEventListener('change', e => [...e.target.files].forEach(addPhoto));
}

// 사진은 긴 변 1000px JPEG로 줄여서 올림 (폰 사진 그대로면 수 MB)
function addPhoto(file) {
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    if (!G) return;
    grab(); G.photos.push(c.toDataURL('image/jpeg', 0.7)); renderGuide();
  };
  img.src = URL.createObjectURL(file);
}

async function uploadPhoto(label, n, dataUrl) {
  const res = await fetch(P.set.drive.url, { method: 'POST', body: JSON.stringify({ token: P.token, label, n, data: dataUrl.split(',')[1] }) });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error);
  return { id: j.id, name: j.name };
}

async function save() {
  const s = G; grab();
  if (!s.sym.length && !s.note.trim()) return showErr('불량 내용을 하나 고르거나 적어주세요');
  const isNew = !s.rec;
  if (isNew) {   // 여기서 처음으로 번호 발급
    try { localStorage.setItem('pcb_by', s.by); } catch (e) { /* 저장 막힌 브라우저면 매번 선택 */ }
    s.busy = '번호 발급 중…'; renderGuide();
    const { data, error } = await sb().rpc('pcb_issue_label', { p_cat: s.cat, p_part: s.part, p_reporter: s.by });
    if (error) { s.busy = false; renderGuide(); return showErr('등록 실패: ' + error.message); }
    s.rec = data; upsertRow(data);
  }
  const photos = [...(s.rec.photos || [])];
  let failed = 0;
  for (let i = 0; i < s.photos.length; i++) {
    s.busy = `사진 올리는 중 ${i + 1}/${s.photos.length}…`; renderGuide();
    try { photos.push(await uploadPhoto(s.rec.label, photos.length + 1, s.photos[i])); } catch (e) { failed++; console.error(e); }
  }
  s.busy = '저장 중…'; renderGuide();
  const patch = { symptoms: s.sym.length ? s.sym : ['기타'], note: s.note.trim() || null, photos, part_sn: s.part || null, incomplete: false };
  if (s.by && s.by !== s.rec.reporter) patch.reporter = s.by;
  const rec = await updateRow(s.rec.id, patch);
  s.busy = false;
  if (!rec) return renderGuide();   // 번호는 이미 발급됨 → 다시 누르면 내용만 저장
  s.photos = [];
  if (failed) toast(`사진 ${failed}장은 올리지 못했어요 — 목록에서 「내용·사진 수정」으로 다시 올려주세요`, 'er');
  P.lastLabel = rec.label; s.rec = rec;
  if (isNew) { s.done = true; return renderGuide(); }
  toast(`${rec.label} 저장됨`, 'ok'); closeGuide();
}

// ═══ 메일 링크(#pcb?q=라벨)로 들어오면 바로 검색 ═══
function handleHash() {
  const m = location.hash.match(/^#pcb(?:\?q=([^&]+))?/);
  if (!m) return;
  P.sub = 'home'; P.q = m[1] ? decodeURIComponent(m[1]) : '';
  const hit = P.rows.find(r => r.label === P.q); if (hit) P.open = hit.id;
  document.querySelector('.tab[data-tab="pcb"]')?.click();
}

// ═══ 초기화 ═══
export async function initPCB() {
  const v = $('v-pcb'), bg = $('pcbGuideBg');
  if (!v || !bg) return;
  $('pcbStrip')?.addEventListener('click', e => { const b = e.target.closest('[data-scat]'); if (b) openPcbGuide({ cat: P.set.cats[+b.dataset.scat].name }); });

  v.addEventListener('click', async e => {
    const t = e.target.closest('[data-sub],[data-fcat],[data-open],[data-status],[data-savelab],[data-resume],[data-del],[data-goto],[data-set],[data-rm],[data-addperson],[data-addcat],[data-save]');
    if (!t || t.closest('.pcb-exp textarea')) return;
    const d = t.dataset;
    if (d.sub) { P.sub = d.sub; P.draft = null; return renderPCB(); }
    if (d.fcat !== undefined) { P.fCat = d.fcat; return renderHome($('pcbWrap')); }
    if (d.goto) { P.sub = 'home'; P.q = d.goto; const h = P.rows.find(r => r.label === d.goto); P.open = h?.id ?? null; $('pcbWrap').innerHTML = ''; return renderPCB(); }
    if (d.open) { if (t.closest('.pcb-exp')) return; P.open = P.open === +d.open ? null : +d.open; return renderFeed(); }
    if (d.status) { await updateRow(+d.id, { status: d.status }); return renderFeed(); }
    if (d.savelab) { const ta = v.querySelector(`[data-labnote="${d.savelab}"]`); if (await updateRow(+d.savelab, { lab_note: ta.value.trim() || null })) toast('메모 저장됨', 'ok'); return; }
    if (d.resume) return openPcbGuide({ resume: +d.resume });
    if (d.del) {
      if (!requireEdit()) return;
      const r = P.rows.find(x => x.id === +d.del);
      return customConfirm(`${r.label} 기록을 삭제할까요? (사진 파일은 Drive에 남습니다)`, async () => {
        const { error } = await sb().from('pcb_defects').delete().eq('id', r.id);
        if (error) return toast('삭제 실패: ' + error.message, 'er');
        P.rows = P.rows.filter(x => x.id !== r.id); updateCount(); renderFeed(); toast('삭제됨', 'info');
      });
    }
    // 설정 화면
    const D = P.draft; if (!D) return;
    const keepOpen = () => { P.openSet = t.closest('details')?.dataset.sec || P.openSet; renderSet($('pcbWrap')); };
    if (d.set) { setPath(D, d.set, JSON.parse(d.val)); return keepOpen(); }
    if (d.rm) { getPath(D, d.rm).splice(+d.i, 1); return keepOpen(); }
    if (d.addperson) { if (!getPath(D, d.addperson)) setPath(D, d.addperson, []); getPath(D, d.addperson).push({ name: '', email: '' }); return keepOpen(); }
    if (d.addcat) { D.cats.push({ name: '새 구분', sub: '', quick: [] }); return keepOpen(); }
    if (d.save) return saveSection(d.save);
  });
  v.addEventListener('change', e => {
    const t = e.target; if (!P.draft || !t.dataset.path) return;
    setPath(P.draft, t.dataset.path, t.type === 'number' ? +t.value : t.value);
  });
  v.addEventListener('keydown', e => {
    e.stopPropagation();   // 그리드 단축키로 새지 않게
    const t = e.target;
    if (e.key === 'Enter' && t.dataset.add && t.value.trim() && !e.isComposing) {
      e.preventDefault();
      const arr = getPath(P.draft, t.dataset.add); arr.push(t.value.trim());
      P.openSet = t.closest('details')?.dataset.sec || P.openSet; renderSet($('pcbWrap'));
      v.querySelector(`[data-add="${t.dataset.add}"]`)?.focus();
    }
  });
  v.addEventListener('toggle', e => { if (e.target.open) P.openSet = e.target.dataset.sec; }, true);

  // 등록 서랍
  const box = $('pcbGuide');
  box.addEventListener('click', e => {
    if (!G) return;
    const t = e.target.closest('[data-g],[data-gcat],[data-gq]'); if (!t) return;
    if (t.dataset.gcat !== undefined) { grab(); setCat(P.set.cats[+t.dataset.gcat].name); return renderGuide(); }
    if (t.dataset.gq !== undefined) { grab(); const q = t.dataset.gq; G.sym = G.sym.includes(q) ? G.sym.filter(x => x !== q) : [...G.sym, q]; return renderGuide(); }
    if (t.dataset.g === 'close') return closeGuide();
    if (t.dataset.g === 'labelok') { toast(`${G.rec.label} 등록 완료 — 불량품은 불량 보관함에 넣어주세요`, 'ok'); return closeGuide(); }
    if (t.dataset.g === 'save') return save();
  });
  box.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeGuide(); });
  bg.addEventListener('click', closeGuide);

  // 보기 ↔ 편집 모드가 바뀌면 목록 버튼을 다시 그림 (editmode.js가 body.edit-mode 토글, 등록 줄은 CSS로 숨김)
  let mode = state.editMode;
  new MutationObserver(() => {
    if (state.editMode === mode) return;
    mode = state.editMode;
    if (!mode && G) { G.busy = false; closeGuide(); }
    if (state.curTab === 'pcb') renderPCB();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  await loadAll();
  renderStrip();
  if (state.curTab === 'pcb') renderPCB();
  handleHash();
  window.addEventListener('hashchange', handleHash);
}

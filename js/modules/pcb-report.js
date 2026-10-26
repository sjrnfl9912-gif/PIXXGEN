// ═══════════════════════════════════════
// PCB 불량 주간 보고 — 기간 계산 · 발송 일정(공휴일) · 메일 HTML
//   화면(DOM) 의존 없음 → 웹 미리보기와 PC 발송 프로그램이 같이 씀.
//   rows: pcb_defects 행, s: pcb_settings 의 report 값, cats: 관리 구분 목록
// ═══════════════════════════════════════
export const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const md = d => `${d.getMonth() + 1}/${d.getDate()}`;
export const toDate = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const weekStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

// 그 주 목요일이 속한 달 기준 주차 (예: 10월 4주차)
export function weekLabel(from) {
  const thu = new Date(from); thu.setDate(thu.getDate() + 3);
  return `${thu.getMonth() + 1}월 ${Math.ceil(thu.getDate() / 7)}주차`;
}

export const isOff = (d, s) => d.getDay() === 0 || d.getDay() === 6 || (s.holidays || []).includes(ymd(d));

// 앞으로의 발송 일정. 주말·공휴일이면 다음 근무일(next) 또는 건너뜀(skip → send=null)
export function nextSends(s, from, n = 10) {
  const out = [], d = new Date(from); d.setHours(0, 0, 0, 0);
  while (d.getDay() !== DAYS.indexOf(s.day)) d.setDate(d.getDate() + 1);
  for (; out.length < n; d.setDate(d.getDate() + 7)) {
    const send = new Date(d);
    if (isOff(send, s)) {
      if (s.holidayMode === 'skip') { out.push({ planned: new Date(d), send: null }); continue; }
      while (isOff(send, s)) send.setDate(send.getDate() + 1);
    }
    out.push({ planned: new Date(d), send });
  }
  return out;
}

// 보고 대상: planned(원래 발송 예정일)이 속한 주. 공휴일로 미뤄져도 원래 주를 보고.
export function reportData(rows, s, cats, planned) {
  let from = weekStart(planned), to = new Date(planned);
  if (s.period === 'last') { from.setDate(from.getDate() - 7); to = new Date(from); to.setDate(to.getDate() + 4); }
  const end = new Date(to); end.setDate(end.getDate() + 1);
  const list = rows.filter(r => { const d = toDate(r.found_date); return d >= from && d < end; })
    .sort((a, b) => String(a.found_date).localeCompare(String(b.found_date)) || a.label.localeCompare(b.label));
  return {
    planned, from, to, rows: list, week: weekLabel(from),
    byCat: cats.map(c => ({ name: c.name, count: list.filter(r => r.cat === c.name).length })),
  };
}
// 미리보기용: 오늘 이전(포함) 가장 최근 발송 요일
export function lastPlanned(s, today = new Date()) {
  const d = new Date(today); d.setHours(0, 0, 0, 0);
  while (d.getDay() !== DAYS.indexOf(s.day)) d.setDate(d.getDate() - 1);
  return d;
}

export function fillVars(t, p, s) {
  return String(t || '').replaceAll('{보내는사람}', s.sender || '').replaceAll('{주차}', p.week)
    .replaceAll('{기간}', `${md(p.from)}~${md(p.to)}`).replaceAll('{건수}', p.rows.length);
}
export const emailSubject = (p, s) => fillVars(s.subject, p, s);

// 메일 HTML — 메일 프로그램 호환을 위해 표 + 인라인 스타일만.
//   opt.webUrl: 라벨 링크 기준 주소 / opt.photoSrc(r, photo): 썸네일 src (미리보기=Drive 썸네일, 발송=cid:)
const C = { hd: '#1a365d', pr: '#3b6de0', pl: '#e8eeff', tx: '#1a1d26', ts: '#6b7280', bd: '#d8dce6', bg: '#eef1f5', ra: '#f6f8fb', er: '#dc2626' };
const FONT = "'Malgun Gothic','맑은 고딕','Noto Sans KR',sans-serif";
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function buildReportEmail(p, s, opt) {
  const para = t => esc(fillVars(t, p, s)).replace(/\n/g, '<br>');
  const url = l => `${opt.webUrl}#pcb?q=${encodeURIComponent(l)}`;
  const th = (t, w = '') => `<td style="padding:7px 8px;font-size:11px;font-weight:bold;color:${C.ts};background:${C.ra};border-bottom:1px solid ${C.bd};${w}">${t}</td>`;
  const td = (t, extra = '') => `<td style="padding:8px;font-size:13px;color:${C.tx};border-bottom:1px solid #eef0f4;vertical-align:middle;${extra}">${t}</td>`;
  const photo = r => {
    const ph = r.photos || [];
    if (!ph.length) return `<span style="color:${C.ts}">-</span>`;
    if (s.photo === 'link') return `<a href="${url(r.label)}" style="color:${C.pr};font-size:12px">사진 보기</a>`;
    if (s.photo === 'attach') return `<span style="font-size:12px;color:${C.ts}">첨부 ${ph.length}장</span>`;
    return `<a href="${url(r.label)}"><img src="${esc(opt.photoSrc(r, ph[0]))}" width="72" height="54" alt="불량 사진" style="display:block;width:72px;height:54px;object-fit:cover;border:1px solid ${C.bd};border-radius:4px"></a>`;
  };
  const total = p.rows.length;
  const cell = (label, n, strong) => `<td align="center" style="padding:14px 8px;border-left:1px solid ${C.bd}">
      <div style="font-size:12px;color:${C.ts}">${label}</div><div style="font-size:${strong ? 30 : 22}px;font-weight:bold;color:${strong && n ? C.er : C.tx};font-family:Consolas,monospace">${n}<span style="font-size:13px;font-weight:normal;color:${C.ts}"> 건</span></div></td>`;
  const attachCount = s.photo === 'attach' ? p.rows.reduce((a, r) => a + (r.photos || []).length, 0) : 0;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(emailSubject(p, s))}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#ffffff;border:1px solid ${C.bd};font-family:${FONT}">
  <tr><td bgcolor="${C.hd}" style="padding:12px 24px;background:linear-gradient(135deg,#0f172a,${C.hd});color:#e2e8f0;font-size:12px">📦 통합 출하 관리 시스템 · PCB 불량 보고</td></tr>
  <tr><td style="padding:24px 24px 6px;font-size:14px;line-height:1.8;color:${C.tx}">${para(s.greeting)}</td></tr>
  <tr><td style="padding:14px 24px 4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.bd};border-radius:6px"><tr>
      <td align="center" style="padding:14px 8px;background:${C.pl}"><div style="font-size:12px;color:${C.pr};font-weight:bold">${esc(p.week)}</div><div style="font-size:11px;color:${C.ts}">${md(p.from)} ~ ${md(p.to)}</div></td>
      ${cell('총 불량', total, true)}
      ${p.byCat.map(c => cell(esc(c.name), c.count)).join('')}
    </tr></table></td></tr>
  <tr><td style="padding:18px 24px 6px;font-size:13px;font-weight:bold;color:${C.tx}">불량 상세 (${total}건)</td></tr>
  <tr><td style="padding:0 24px">${total ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>${th('No', 'width:28px')}${th('라벨 번호')}${th('발견일')}${th('구분')}${th('불량 내용')}${th('사진')}</tr>
    ${p.rows.map((r, i) => `<tr>${td(i + 1, `color:${C.ts}`)}${td(`<a href="${url(r.label)}" style="color:${C.pr};text-decoration:none;font-family:Consolas,monospace;font-weight:bold">${esc(r.label)}</a>`, 'white-space:nowrap')}
      ${td(md(toDate(r.found_date)), 'white-space:nowrap')}${td(esc(r.cat), 'white-space:nowrap')}
      ${td(r.incomplete ? `<span style="color:${C.er}">내용 미입력</span>` : esc((r.symptoms || []).join(', ')) + (r.note ? `<div style="font-size:12px;color:${C.ts}">${esc(r.note)}</div>` : ''))}
      ${td(photo(r))}</tr>`).join('')}
  </table>` : `<div style="padding:18px;text-align:center;font-size:14px;color:${C.ts};border:1px solid ${C.bd};border-radius:6px">금주 PCB 불량 발생 건은 없습니다.</div>`}</td></tr>
  ${attachCount ? `<tr><td style="padding:8px 24px 0;font-size:12px;color:${C.ts}">📎 불량 사진 ${attachCount}장을 첨부했습니다 (파일명 = 라벨 번호).</td></tr>` : ''}
  <tr><td style="padding:22px 24px 6px;font-size:14px;line-height:1.8;color:${C.tx}">${para(s.closing)}</td></tr>
  ${String(s.signature || '').trim() ? `<tr><td style="padding:10px 24px 24px;font-size:13px;line-height:1.7;color:${C.tx}"><div style="border-top:1px solid #eef0f4;padding-top:12px">${para(s.signature)}</div></td></tr>` : '<tr><td style="height:14px"></td></tr>'}
  <tr><td style="padding:10px 24px;background:${C.ra};font-size:11px;color:${C.ts};border-top:1px solid ${C.bd}">이 메일은 PIXXGEN 통합 출하 관리 시스템에서 자동 발송되었습니다.</td></tr>
</table></td></tr></table></body></html>`;
}

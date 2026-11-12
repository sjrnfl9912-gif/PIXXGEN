// ═══ 열 제목 ▾ 메뉴 — 정렬(오름/내림) + 값 필터 (엑셀 자동 필터처럼) ═══
//  표 4개 공용: b1 검사포장 출하 · b2 생산관리대장 · b3 통합취합본 · b4 TFT 매칭
//  상태는 이 브라우저 탭 메모리에만 (새로고침하면 처음 상태)
import { renderShipmentTable, renderProductionTable, renderMergeTable, renderTftmTable } from './table.js';

const RENDER = { b1: renderShipmentTable, b2: renderProductionTable, b3: renderMergeTable, b4: renderTftmTable };
const views = {};   // tb → { sort: {f, dir}|null, filt: { f: Set(허용 값) }, src, get }
const vOf = tb => (views[tb] ||= { sort: null, filt: {}, src: [], get: (r, f) => r[f] });
const str = v => (v == null ? '' : String(v).trim());
// 숫자 부분은 숫자로 비교 — 26K99 < 26K100, K95 < K100
const coll = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
export function cmpVal(x, y) {
  if (!x && !y) return 0;
  if (!x) return 1;   // 빈칸은 항상 맨 뒤
  if (!y) return -1;
  return coll.compare(x, y);
}

// 표에 적용 — rows: 검색·칩 필터까지 거친 행, get(row, f): 칸 값, canSort: 중복 묶음 보기 등에선 false
export function applyColView(tb, rows, get, canSort = true) {
  const v = vOf(tb);
  v.src = rows; v.get = get;
  let d = rows;
  for (const [f, allow] of Object.entries(v.filt)) d = d.filter(r => allow.has(str(get(r, f))));
  if (canSort && v.sort) {
    const { f, dir } = v.sort;
    d = d.map(r => [str(get(r, f)), r]).sort((a, b) => (!a[0] || !b[0] ? cmpVal(a[0], b[0]) : dir * cmpVal(a[0], b[0]))).map(x => x[1]);
  }
  return d;
}
export const hasColSort = tb => !!views[tb]?.sort;
// 정렬·필터가 바뀌면 달라지는 값 — 헤더 다시 그리기·스크롤 맨 위로 판단용
export function colViewKey(tb) {
  const v = views[tb];
  return v ? JSON.stringify([v.sort, Object.entries(v.filt).map(([f, s]) => [f, s.size])]) : '';
}
// 헤더 칸 오른쪽 ▾ — 정렬 중이면 ▲/▼, 필터 중이면 강조
export function headMark(tb, f) {
  const v = views[tb], s = v?.sort?.f === f ? (v.sort.dir > 0 ? '▲' : '▼') : '', fl = !!v?.filt[f];
  return '<span class="cv-btn' + (s || fl ? ' on' : '') + (fl ? ' filt' : '') + '" data-cv-tb="' + tb + '" data-cv-f="' + f + '" title="정렬·필터'
    + (fl ? ' (필터 중)' : '') + '">' + (s || '▾') + '</span>';
}

// ── 메뉴 ──
let menu = null;
function closeMenu() { if (menu) { menu.remove(); menu = null; } }
const esc = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const LIMIT = 400;   // 값 목록은 이만큼만 그림 (S/N 칸은 값이 수천 개) — 나머지는 검색으로

function openMenu(btn) {
  closeMenu();
  const tb = btn.dataset.cvTb, f = btn.dataset.cvF, v = vOf(tb);
  // 값 목록 = 다른 열 필터까지 거친 행의 이 열 값 (엑셀과 같음)
  let rows = v.src;
  for (const [g, allow] of Object.entries(v.filt)) if (g !== f) rows = rows.filter(r => allow.has(str(v.get(r, g))));
  const cnt = new Map();
  for (const r of rows) { const x = str(v.get(r, f)); cnt.set(x, (cnt.get(x) || 0) + 1); }
  const vals = [...cnt.keys()].sort(cmpVal);
  const cur = v.filt[f];
  const chk = new Map(vals.map(x => [x, cur ? cur.has(x) : true]));
  const sorted = v.sort?.f === f;

  menu = document.createElement('div');
  menu.className = 'cv-menu';
  menu.innerHTML = '<button data-cv="asc"' + (sorted && v.sort.dir > 0 ? ' class="on"' : '') + '>↑ 오름차순 정렬</button>'
    + '<button data-cv="desc"' + (sorted && v.sort.dir < 0 ? ' class="on"' : '') + '>↓ 내림차순 정렬</button>'
    + (v.sort ? '<button data-cv="unsort">정렬 해제' + (tb === 'b2' ? ' (제작완료일 순으로)' : '') + '</button>' : '')
    + '<div class="cv-sep"></div>'
    + '<input class="cv-q" placeholder="값 검색 (' + vals.length + '개)">'
    + '<label class="cv-all"><input type="checkbox" data-cv-all> (모두 선택)</label>'
    + '<div class="cv-list"></div>'
    + '<div class="cv-foot"><button data-cv="clear"' + (cur ? '' : ' disabled') + '>필터 해제</button><button class="pr" data-cv="ok">적용</button></div>';
  document.body.appendChild(menu);
  const r = btn.getBoundingClientRect();
  menu.style.top = Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8) + 'px';
  menu.style.left = Math.max(8, Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8)) + 'px';

  const q = menu.querySelector('.cv-q'), list = menu.querySelector('.cv-list'), all = menu.querySelector('[data-cv-all]');
  const shown = () => { const t = q.value.trim().toLowerCase(); return t ? vals.filter(x => x.toLowerCase().includes(t)) : vals; };
  const draw = () => {
    const s = shown();
    list.innerHTML = s.slice(0, LIMIT).map((x, i) => '<label><input type="checkbox" data-i="' + vals.indexOf(x) + '"' + (chk.get(x) ? ' checked' : '') + '><span>'
      + (x ? esc(x) : '<i>(빈칸)</i>') + '</span><small>' + cnt.get(x) + '</small></label>').join('')
      + (s.length > LIMIT ? '<div class="cv-more">…외 ' + (s.length - LIMIT) + '개 — 검색으로 좁혀 주세요</div>' : '')
      + (s.length ? '' : '<div class="cv-more">맞는 값 없음</div>');
    all.checked = s.length > 0 && s.every(x => chk.get(x));
  };
  draw();
  q.addEventListener('input', () => {
    // 검색하면 엑셀처럼 검색된 값만 고른 상태로
    if (q.value.trim()) { const s = new Set(shown()); vals.forEach(x => chk.set(x, s.has(x))); }
    else vals.forEach(x => chk.set(x, cur ? cur.has(x) : true));
    draw();
  });
  list.addEventListener('change', e => { const i = e.target.dataset.i; if (i != null) { chk.set(vals[+i], e.target.checked); draw(); } });
  all.addEventListener('change', () => { shown().forEach(x => chk.set(x, all.checked)); draw(); });
  menu.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeMenu(); if (e.key === 'Enter') menu.querySelector('[data-cv="ok"]').click(); });
  menu.addEventListener('mousedown', e => e.stopPropagation());
  menu.addEventListener('click', e => {
    const act = e.target.closest('[data-cv]')?.dataset.cv; if (!act) return;
    if (act === 'asc' || act === 'desc') v.sort = { f, dir: act === 'asc' ? 1 : -1 };
    else if (act === 'unsort') v.sort = null;
    else if (act === 'clear') delete v.filt[f];
    else if (act === 'ok') {
      const allow = new Set(vals.filter(x => chk.get(x)));
      if (allow.size === vals.length) delete v.filt[f]; else v.filt[f] = allow;
    }
    closeMenu();
    RENDER[tb]();
  });
  q.focus();
}

export function initColView() {
  // 표 단축키·범위 선택이 먼저 잡지 않게 mousedown 단계에서 막음
  document.addEventListener('mousedown', e => {
    if (e.target.closest('.cv-btn')) { e.stopPropagation(); e.preventDefault(); return; }
    if (menu && !menu.contains(e.target)) closeMenu();
  }, true);
  document.addEventListener('click', e => {
    const b = e.target.closest('.cv-btn'); if (!b) return;
    e.stopPropagation();
    openMenu(b);
  }, true);
  window.addEventListener('resize', closeMenu);
}

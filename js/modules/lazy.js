// ═══════════════════════════════════════
// LAZY ROWS — 대용량 표 점진 렌더
//   5천 행을 한 번에 innerHTML로 넣으면 레이아웃·스타일 계산만 1~2초(탭 전환 멈춤).
//   행 HTML 문자열은 전부 만들어 두되, DOM에는 연속 구간 [start, end)만 넣는다.
//   스크롤이 바닥/천장에 가까워지면 STEP행씩 이어 붙인다.
//   선택·채우기·붙여넣기는 tb.children 인덱스 기준이라 구간이 연속이면 그대로 동작.
//   (위로 붙일 때만 인덱스가 밀리므로 state.sel/range를 같이 보정)
// ═══════════════════════════════════════
import { state } from '../state.js';

const FIRST = 200;   // 처음 그리는 행 수
const STEP = 400;    // 스크롤 시 추가로 붙이는 행 수
const EDGE = 600;    // 바닥/천장까지 남은 px가 이보다 작으면 추가 렌더

const views = {};    // tbId -> { rows: string[], start, end }

function twOf(tb) { return tb.closest('.tw'); }

// 행 HTML 배열을 tbody에 연결.
//   key = 검색어·필터 조합. 같으면(저장·실시간 갱신 등) 직전 구간(스크롤 위치) 유지,
//   다르면 목록 자체가 바뀐 것이므로 맨 위부터 다시.
export function mountRows(tbId, rows, key = '') {
  const tb = document.getElementById(tbId); if (!tb) return;
  const prev = views[tbId];
  const n = rows.length;
  let start = 0, end = Math.min(FIRST, n);
  if (prev && prev.key === key) {
    end = Math.min(n, Math.max(prev.end, FIRST));
    start = Math.max(0, Math.min(prev.start, end - FIRST));
  } else {
    const tw = twOf(tb); if (tw) tw.scrollTop = 0;
  }
  views[tbId] = { rows, start, end, key };
  tb.innerHTML = rows.slice(start, end).join('');
  watch(tb);
}

export function hasMoreBelow(tbId) { const v = views[tbId]; return !!v && v.end < v.rows.length; }

// 아래로 n행 추가
export function renderMore(tbId, n = STEP) {
  const v = views[tbId]; const tb = document.getElementById(tbId);
  if (!v || !tb || v.end >= v.rows.length) return 0;
  const to = Math.min(v.rows.length, v.end + n);
  tb.insertAdjacentHTML('beforeend', v.rows.slice(v.end, to).join(''));
  const added = to - v.end; v.end = to;
  return added;
}

// 위로 n행 추가 — 스크롤 위치·선택 인덱스 보정
function renderAbove(tbId, n = STEP) {
  const v = views[tbId]; const tb = document.getElementById(tbId);
  if (!v || !tb || v.start <= 0) return 0;
  const from = Math.max(0, v.start - n);
  const tw = twOf(tb);
  const h0 = tw ? tw.scrollHeight : 0;
  tb.insertAdjacentHTML('afterbegin', v.rows.slice(from, v.start).join(''));
  const added = v.start - from; v.start = from;
  if (tw) tw.scrollTop += tw.scrollHeight - h0;
  if (state.sel && state.sel.tb === tb) {
    state.sel.r += added;
    if (state.range) { state.range.r1 += added; state.range.r2 += added; }
  }
  return added;
}

// tbody 행 수가 최소 count가 되도록 아래로 확장 (붙여넣기·키보드 이동용)
export function ensureRows(tb, count) {
  const v = views[tb.id]; if (!v) return;
  const need = count - tb.children.length;
  if (need > 0) renderMore(tb.id, need);
}

// 전체 행 렌더 (전체 선택·열 선택처럼 모든 행이 필요한 동작 직전)
export function ensureAll(tbId) {
  const v = views[tbId]; const tb = document.getElementById(tbId);
  if (!v || !tb || (v.start === 0 && v.end === v.rows.length)) return;
  if (v.start > 0) renderAbove(tbId, v.start);
  renderMore(tbId, v.rows.length - v.end);
}

// 맨 아래로 — 끝 구간만 새로 그리고 스크롤 (전체를 그리지 않음)
export function jumpToEnd(tbId) {
  const v = views[tbId]; const tb = document.getElementById(tbId);
  if (!tb) return;
  if (v && v.end < v.rows.length) {
    if (state.sel && state.sel.tb === tb) { state.sel = null; state.range = null; state.editing = false; }
    v.end = v.rows.length; v.start = Math.max(0, v.end - FIRST);
    tb.innerHTML = v.rows.slice(v.start, v.end).join('');
  }
  const tw = twOf(tb);
  if (tw) tw.scrollTop = tw.scrollHeight;
}

// 스크롤 감시 (tbody마다 한 번만 등록)
function watch(tb) {
  const tw = twOf(tb);
  if (!tw || tw.dataset.lazy) return;
  tw.dataset.lazy = tb.id;
  let busy = false;
  tw.addEventListener('scroll', () => {
    if (busy) return;
    busy = true;
    requestAnimationFrame(() => {
      busy = false;
      if (tw.scrollHeight - tw.scrollTop - tw.clientHeight < EDGE) renderMore(tb.id);
      else if (tw.scrollTop < EDGE / 2) renderAbove(tb.id);
    });
  }, { passive: true });
}

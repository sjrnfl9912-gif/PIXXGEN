// ═══════════════════════════════════════
// CELL VALUE MODEL — input 없는 텍스트 셀 (대용량 표 성능)
//   편집 가능 셀(ship/prod)을 셀마다 <input>으로 그리면 4천행 × 15열 ≈ 6만 input이
//   동기 생성되어 탭 전환 시 멈춤·메모리 폭증으로 팅김. → 평소엔 텍스트로 렌더하고
//   값은 data-v 속성에 보관, 클릭/편집할 때만 <input>을 임시 생성한다.
// ═══════════════════════════════════════
import { state } from '../state.js';
import { normField } from './date.js';

export function escAttr(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 검색어 → 검색 단어들. 쉼표가 있으면 여러 개(다중 검색: 하나라도 맞으면 표시), 없으면 통째로 하나. q는 소문자.
//   여러 줄을 붙여넣으면 검색창이 줄바꿈을 쉼표로 바꿔 줌 (main.js 붙여넣기 처리)
export function qTerms(q) {
  if (!q) return [];
  return q.includes(',') ? [...new Set(q.split(',').map(s => s.trim()).filter(Boolean))] : [q];
}
// 값이 검색 단어 중 하나라도 포함하나
export const matchQ = (v, terms) => v != null && v !== '' && terms.some(t => String(v).toLowerCase().includes(t));

// 검색어와 일치하는 부분을 <mark>로 (대소문자 무시, 여러 번·여러 단어 모두). q는 소문자.
export function hlText(v, q) {
  const str = v == null ? '' : String(v);
  const terms = qTerms(q);
  if (!terms.length) return escAttr(str);
  const lo = str.toLowerCase();
  let i = 0, out = '';
  while (i < str.length) {
    let k = -1, len = 0;
    for (const t of terms) { const j = lo.indexOf(t, i); if (j >= 0 && (k < 0 || j < k || (j === k && t.length > len))) { k = j; len = t.length; } }
    if (k < 0) break;
    out += escAttr(str.slice(i, k)) + '<mark class="hl">' + escAttr(str.slice(k, k + len)) + '</mark>';
    i = k + len;
  }
  return out + escAttr(str.slice(i));
}

// 편집 가능 데이터 셀 HTML (input 없음). 표시 텍스트 = data-v = 원본값. q: 검색어(소문자) 있으면 일치 부분 표시
export function cellHtml(id, t, f, v, extraCls, q) {
  const s = escAttr(v);
  return '<td class="cw' + (extraCls ? ' ' + extraCls : '') + '" data-id="' + escAttr(id)
    + '" data-t="' + t + '" data-f="' + f + '" data-v="' + s + '">' + (q ? hlText(v, q) : s) + '</td>';
}

// 셀 원본값 (편집 가능 셀이 아니면 빈 문자열)
export function cellValue(td) { return td && td.dataset ? (td.dataset.v || '') : ''; }

// 편집 가능 셀 여부 — data-f 보유 = ship/prod 데이터 셀 (rn·읽기전용 셀은 false)
export function isEditableCell(td) { return !!(td && td.dataset && td.dataset.f); }

// 표시 텍스트만 교체 (.fh 등 자식 요소는 보존, 검색 표시 <mark>는 지움)
export function setCellText(td, s) {
  const str = s == null ? '' : String(s);
  for (const n of [...td.childNodes]) if (n.nodeType === 3 || n.nodeName === 'MARK') n.remove();
  td.insertBefore(document.createTextNode(str), td.firstChild);
}

// 값을 모델+DOM에 반영하고 undo 엔트리 반환 ({id, t, f, ov, nv}).
//   paste/fill/delete 공용. dirty 추적·undo push는 호출측이 담당한다.
export function commitCellValue(td, nv) {
  const t = td.dataset.t, f = td.dataset.f, rawId = td.dataset.id;
  const id = String(rawId).startsWith('new_') ? rawId : +rawId;
  const ov = td.dataset.v || '';
  const val = nv == null ? '' : normField(f, String(nv));   // 붙여넣기·채우기도 날짜 형식 통일
  td.dataset.v = val;
  setCellText(td, val);
  const arr = t === 's' ? state.shipD : t === 'p' ? state.prodD : state.mergeD;
  const row = arr.find(x => String(x._id) === String(id));
  const model = val.trim() ? val.trim() : null;
  if (row) row[f] = model;
  td.classList.add('chg'); setTimeout(() => td.classList.remove('chg'), 600);
  return { id, t, f, ov, nv: model };
}

// 모델명 입력 목록 — 생산관리대장에 이미 입력된 모델명만 (출하 품명과 이름이 다를 수 있어 섞지 않음).
//   편집 칸을 열 때마다 최신으로 갱신. 목록에 없으면 직접 입력.
export function refreshModelOpts() {
  let dl = document.getElementById('modelOpts');
  if (!dl) { dl = document.createElement('datalist'); dl.id = 'modelOpts'; document.body.appendChild(dl); }
  const set = new Set();
  for (const r of state.prodD || []) { const v = (r.model_name || '').trim(); if (v) set.add(v); }
  const list = [...set].sort();
  const key = list.join('|');
  if (dl.dataset.key === key) return;
  dl.dataset.key = key;
  dl.innerHTML = list.map(v => '<option value="' + escAttr(v) + '">').join('');
}

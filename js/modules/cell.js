// ═══════════════════════════════════════
// CELL VALUE MODEL — input 없는 텍스트 셀 (대용량 표 성능)
//   편집 가능 셀(ship/prod)을 셀마다 <input>으로 그리면 4천행 × 15열 ≈ 6만 input이
//   동기 생성되어 탭 전환 시 멈춤·메모리 폭증으로 팅김. → 평소엔 텍스트로 렌더하고
//   값은 data-v 속성에 보관, 클릭/편집할 때만 <input>을 임시 생성한다.
// ═══════════════════════════════════════
import { state } from '../state.js';

export function escAttr(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 편집 가능 데이터 셀 HTML (input 없음). 표시 텍스트 = data-v = 원본값.
export function cellHtml(id, t, f, v, extraCls) {
  const s = escAttr(v);
  return '<td class="cw' + (extraCls ? ' ' + extraCls : '') + '" data-id="' + escAttr(id)
    + '" data-t="' + t + '" data-f="' + f + '" data-v="' + s + '">' + s + '</td>';
}

// 셀 원본값 (편집 가능 셀이 아니면 빈 문자열)
export function cellValue(td) { return td && td.dataset ? (td.dataset.v || '') : ''; }

// 편집 가능 셀 여부 — data-f 보유 = ship/prod 데이터 셀 (rn·읽기전용 셀은 false)
export function isEditableCell(td) { return !!(td && td.dataset && td.dataset.f); }

// 표시 텍스트만 교체 (.fh 등 자식 요소는 보존)
export function setCellText(td, s) {
  const str = s == null ? '' : String(s);
  for (const n of td.childNodes) {
    if (n.nodeType === 3) { n.nodeValue = str; return; }
  }
  td.insertBefore(document.createTextNode(str), td.firstChild);
}

// 값을 모델+DOM에 반영하고 undo 엔트리 반환 ({id, t, f, ov, nv}).
//   paste/fill/delete 공용. dirty 추적·undo push는 호출측이 담당한다.
export function commitCellValue(td, nv) {
  const t = td.dataset.t, f = td.dataset.f, rawId = td.dataset.id;
  const id = String(rawId).startsWith('new_') ? rawId : +rawId;
  const ov = td.dataset.v || '';
  const val = nv == null ? '' : String(nv);
  td.dataset.v = val;
  setCellText(td, val);
  const arr = t === 's' ? state.shipD : t === 'p' ? state.prodD : state.mergeD;
  const row = arr.find(x => String(x._id) === String(id));
  const model = val.trim() ? val.trim() : null;
  if (row) row[f] = model;
  td.classList.add('chg'); setTimeout(() => td.classList.remove('chg'), 600);
  return { id, t, f, ov, nv: model };
}

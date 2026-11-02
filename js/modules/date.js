// 날짜 입력 정리 — 260530 / 20260530 / 2026.05.30 / 26-5-30 등 → 2026-05-30
//   알아볼 수 없거나 없는 날짜(13월, 2월 30일 등)는 입력값 그대로 둠
export const DATE_FIELDS = new Set(['completed_date']);

export function normDate(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{2}|\d{4})(\d{2})(\d{2})$/)                       // 260530, 20260530
       || s.match(/^(\d{2}|\d{4})\s*[.\-/\s]\s*(\d{1,2})\s*[.\-/\s]\s*(\d{1,2})\.?$/);   // 2026.05.30, 26-5-30
  if (!m) return s;
  const y = m[1].length === 2 ? 2000 + +m[1] : +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return s;
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

// 날짜 칸이면 정리, 아니면 그대로
export const normField = (f, v) => (DATE_FIELDS.has(f) ? normDate(v) : v);

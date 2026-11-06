// ═══ 이력 점검 — 통합취합본(출하 + 생산 조인)에서 중복 S/N·이상한 값 찾기 ═══
//  생산 출하 대장에는 RMA가 섞이지 않으므로 같은 S/N이 두 유닛에 있으면 오기입.
//  예외: 재입고(같은 제품을 새 디텍터 S/N으로 다시 출하) — 출하 폴더에 「재입고」가 적혀 있으면 정상 연결로 봄.

const NONE = new Set(['', '-', 'X', 'NA', '없음', '없음.']);
const norm = v => (v == null ? '' : String(v).trim());

export const AUDIT_FIELDS = ['tft_sn', 'scintillator', 'cpu_sn', 'main_board_sn', 'main_board_ver', 'aed_sn'];
const DUP_PROD_FIELDS = ['cpu_sn', 'main_board_sn', 'aed_sn'];
const LABEL = { detector_sn: '디텍터', tft_sn: 'TFT', cpu_sn: 'CPU', main_board_sn: 'BOARD', aed_sn: 'AED' };

// 형식 규칙 — 2026-11-05 대장 5,400여 건 분포 기준 (드물게 나온 모양만 걸림)
const FMT = {
  cpu_sn: /^(C\d{4}-\d+[A-Z]?|PCU\d{10})$/,
  main_board_sn: /^(M\d{6}A?-\d+[A-Z]?|(OP|PI|PR)\d{6}-\d+|PI\d{8}|P\d{7}-\d+|A\dMB\d{9})$/,
  main_board_ver: /^\d+\.\d+$/,
  aed_sn: /^(A\d{4}-\d+|PD\d{10})$/,
};

// 값 하나가 이상하면 이유, 정상이면 ''
export function oddReason(f, v) {
  v = norm(v);
  if (NONE.has(v.toUpperCase()) || NONE.has(v)) return '';
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(v)) return '한글 섞임';
  if (v.includes('?')) return '? 표시 (확인 못 한 값)';
  if (/[.`'",]$/.test(v)) return '끝에 불필요한 문자';
  if (f === 'tft_sn' && v.length !== 12) return v.length + '자리 (TFT는 12자리)';
  if (f === 'main_board_sn' && FMT.main_board_ver.test(v)) return 'BOARD S/N 칸에 VER 값';
  if (f === 'main_board_ver' && FMT.main_board_sn.test(v)) return 'VER 칸에 BOARD S/N';
  if (FMT[f] && !FMT[f].test(v)) return '형식이 다름';
  return '';
}

// ships: 출하 행들, detTft: 디텍터→TFT, tftMap: TFT→생산 행, prods: 생산 행 전체, restock: 재입고 표시된 디텍터 Set
// 반환: Map(출하 _id → [{ f, kind: 'dup'|'odd'|'ok', msg, key }])  — key: 같은 문제끼리 묶는 값
export function auditMerge(ships, detTft, tftMap, prods, restock = new Set()) {
  const out = new Map();
  const put = (id, x) => { if (!out.has(id)) out.set(id, []); out.get(id).push(x); };
  const by = (rows, keyOf) => {
    const m = new Map();
    for (const r of rows) { const k = keyOf(r); if (k) (m.get(k) || m.set(k, []).get(k)).push(r); }
    return m;
  };

  // 디텍터 S/N 중복 (출하 대장 자체)
  const byDet = by(ships, s => norm(s.detector_sn));
  // TFT 중복 — 서로 다른 디텍터가 같은 TFT(= 같은 생산기록)를 가리킴
  const byTft = by(ships, s => norm(detTft[s.detector_sn]));
  // CPU·보드·AED 중복 — 생산 대장 안에서 서로 다른 기록끼리 (미출하 재고분 포함)
  const prodIdx = {};
  for (const f of DUP_PROD_FIELDS) prodIdx[f] = by(prods, p => { const v = norm(p[f]); return NONE.has(v.toUpperCase()) ? '' : v; });

  for (const s of ships) {
    const det = norm(s.detector_sn);
    const sameDet = byDet.get(det);
    if (det && sameDet.length > 1) put(s._id, { f: 'detector_sn', kind: 'dup', key: 'detector_sn|' + det, msg: '디텍터 S/N 중복 — 출하 대장에 ' + sameDet.length + '번' });

    const t = norm(detTft[s.detector_sn]);
    if (!t) continue;
    const others = byTft.get(t).filter(o => norm(o.detector_sn) !== det);
    if (others.length) {
      const ok = [s, ...others].some(o => restock.has(norm(o.detector_sn)));
      put(s._id, {
        f: 'tft_sn', kind: ok ? 'ok' : 'dup', key: 'tft_sn|' + t,
        msg: (ok ? '재입고 연결 — ' : 'TFT 중복 — ') + '같은 TFT 디텍터 ' + others.map(o => o.detector_sn).join(', '),
      });
    }

    const p = tftMap[t];
    if (!p) continue;
    for (const f of DUP_PROD_FIELDS) {
      const v = norm(p[f]);
      const same = v && (prodIdx[f].get(v) || []).filter(o => o !== p);
      if (same && same.length) put(s._id, {
        f, kind: 'dup', key: f + '|' + v,
        msg: LABEL[f] + ' 중복 — 다른 생산기록 ' + same.map(o => 'TFT ' + (o.tft_sn || '없음') + (o.completed_date ? ' (' + o.completed_date + ')' : '')).join(', '),
      });
    }
    for (const f of AUDIT_FIELDS) {
      const why = oddReason(f, p[f]);
      if (why) put(s._id, { f, kind: 'odd', key: 'odd|' + f, msg: why });
    }
  }
  return out;
}

// ═══ 이력 점검 — 통합취합본(출하 + 생산 조인)에서 중복 S/N·이상한 값 찾기 ═══
//  생산 출하 대장에는 RMA가 섞이지 않으므로 같은 S/N이 두 유닛에 있으면 오기입.
//  예외: 재입고(같은 제품을 새 디텍터 S/N으로 다시 출하) — 출하 폴더에 「재입고」가 적혀 있으면 정상 연결로 봄.

const NONE = new Set(['', '-', 'X', 'NA', '없음', '없음.', '추정불가']);
const norm = v => (v == null ? '' : String(v).trim());

export const AUDIT_FIELDS = ['tft_sn', 'scintillator', 'cpu_sn', 'main_board_sn', 'main_board_ver', 'aed_sn'];
const DUP_PROD_FIELDS = ['scintillator', 'cpu_sn', 'main_board_sn', 'aed_sn'];
const LABEL = { detector_sn: '디텍터', tft_sn: 'TFT', scintillator: 'Scint', cpu_sn: 'CPU', main_board_sn: 'BOARD', aed_sn: 'AED', prod_no: '생산번호' };
// 중복 검사할 값 ('' = 안 함). 신틸레이터 TR+숫자는 번호를 돌려 씀(1,314개 번호를 4,187대가 나눠 씀) → 단독 중복 X
const dupVal = (f, v) => {
  v = norm(v);
  if (NONE.has(v.toUpperCase())) return '';
  if (f === 'scintillator' && (/^TR\d+$/.test(v) || !/\d/.test(v))) return '';
  return v;
};
// 행 복사 — 완료일이 같고 아래 칸 중 2개 이상 같음 = 한 행을 복사해 TFT만 바꿔 적은 것 (TR 신틸레이터도 여기선 씀)
const COPY_F = ['scintillator', 'cpu_sn', 'main_board_sn', 'aed_sn', 'prod_no'];
const pidOf = p => String(p.id != null ? p.id : p._id);

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
  if (f === 'scintillator' && !v) return '미기입 — 모르면 「추정불가」로 적기';   // 빈칸은 안 적은 건지 없는 건지 구분 안 됨
  if (NONE.has(v.toUpperCase()) || NONE.has(v)) return '';
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(v)) return '한글 섞임';
  if (v.includes('?')) return '? 표시 (확인 못 한 값)';
  if (/[.`'",]$/.test(v)) return '끝에 불필요한 문자';
  if (f === 'scintillator' && !/\d/.test(v)) return '번호 없음';
  if (f === 'tft_sn' && v.length !== 12) return v.length + '자리 (TFT는 12자리)';
  if (f === 'main_board_sn' && FMT.main_board_ver.test(v)) return 'BOARD S/N 칸에 VER 값';
  if (f === 'main_board_ver' && FMT.main_board_sn.test(v)) return 'VER 칸에 BOARD S/N';
  if (FMT[f] && !FMT[f].test(v)) return '형식이 다름';
  return '';
}

// 생산 행 → [{ o: 짝 행, fs: [같은 칸] }]
function copyPairs(prods) {
  const cnt = new Map();   // p → Map(o → Set(f))
  for (const f of COPY_F) {
    const m = new Map();
    for (const p of prods) {
      const v = norm(p[f]), d = norm(p.completed_date);
      if (!d || NONE.has(v.toUpperCase()) || (f === 'prod_no' && !/\d/.test(v))) continue;   // 생산번호 「SB」 같은 공용값 제외
      const k = d + '|' + v;
      (m.get(k) || m.set(k, []).get(k)).push(p);
    }
    for (const a of m.values()) for (const p of a) for (const o of a) if (o !== p) {
      if (!cnt.has(p)) cnt.set(p, new Map());
      const fs = cnt.get(p); (fs.get(o) || fs.set(o, new Set()).get(o)).add(f);
    }
  }
  const out = new Map();
  for (const [p, m] of cnt) { const xs = [...m].filter(([, fs]) => fs.size >= 2).map(([o, fs]) => ({ o, fs: [...fs] })); if (xs.length) out.set(p, xs); }
  return out;
}

// ships: 출하 행들, detTft: 디텍터→TFT, tftMap: TFT→생산 행, prods: 생산 행 전체, restock: 재입고 표시된 디텍터 Set,
// detDate: 디텍터→출하 폴더 날짜(실제 출하일)
// 반환: Map(출하 _id → [{ f, kind: 'dup'|'odd'|'ok', msg, key }])  — key: 같은 문제끼리 묶는 값
export function auditMerge(ships, detTft, tftMap, prods, restock = new Set(), detDate = {}) {
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
  for (const f of DUP_PROD_FIELDS) prodIdx[f] = by(prods, p => dupVal(f, p[f]));
  const copies = copyPairs(prods);

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
    const cps = copies.get(p) || [], mates = new Set(cps.map(c => c.o));
    if (cps.length) {
      const key = 'copy|' + [p, ...mates].map(pidOf).sort().join('-');
      const fs = [...new Set(cps.flatMap(c => c.fs))].sort((a, b) => COPY_F.indexOf(a) - COPY_F.indexOf(b));
      const msg = '행 복사 의심 — TFT ' + [...mates].map(o => o.tft_sn || '없음').join(', ') + ' 기록과 ' + fs.map(f => LABEL[f]).join('·') + ' 같음 (완료일도 같음)';
      for (const f of fs) put(s._id, { f, kind: 'dup', key, msg });
    }
    for (const f of DUP_PROD_FIELDS) {
      const v = dupVal(f, p[f]);
      const same = v && (prodIdx[f].get(v) || []).filter(o => o !== p && !mates.has(o));   // 복사 짝은 위에서 한 건으로
      if (same && same.length) put(s._id, {
        f, kind: 'dup', key: f + '|' + v,
        msg: LABEL[f] + ' 중복 — 다른 생산기록 ' + same.map(o => 'TFT ' + (o.tft_sn || '없음') + (o.completed_date ? ' (' + o.completed_date + ')' : '')).join(', '),
      });
    }
    const done = norm(p.completed_date), shipped = norm(detDate[s.detector_sn]);
    if (/^\d{4}-\d\d-\d\d$/.test(done) && shipped && done > shipped)
      put(s._id, { f: 'completed_date', kind: 'odd', key: 'odd|completed_date', msg: '완료일 ' + done + '이 출하 폴더 날짜 ' + shipped + '보다 늦음 — 다른 유닛 기록일 수 있음' });
    for (const f of AUDIT_FIELDS) {
      const why = oddReason(f, p[f]);
      if (why) put(s._id, { f, kind: 'odd', key: 'odd|' + f, msg: why });
    }
  }
  return out;
}

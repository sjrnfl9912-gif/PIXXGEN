// TFT 오기입 추정 — 글자 1~2개 빠짐·추가·바뀜·자리바뀜 거리 (Damerau-Levenshtein)
//   cap을 넘으면 계산을 멈추고 cap+1 반환 (수천 건 비교용)
export function snDist(a, b, cap = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let p2 = null, p1 = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const c = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(p1[j] + 1, c[j - 1] + 1, p1[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
      c.push(v); if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    p2 = p1; p1 = c;
  }
  return Math.min(p1[b.length], cap + 1);
}

// 무엇이 틀렸는지 한 줄 설명 (수정 이력·담당자 안내용). before = 틀린 값, after = 고친 값
const LOOK = { 'O0': '영문 O → 숫자 0', '0O': '숫자 0 → 영문 O', 'I1': '영문 I → 숫자 1', '1I': '숫자 1 → 영문 I' };
export function describeFix(before, after) {
  let i = 0, j = 0;
  while (i < before.length && i < after.length && before[i] === after[i]) i++;
  while (j < before.length - i && j < after.length - i && before[before.length - 1 - j] === after[after.length - 1 - j]) j++;
  const b = before.slice(i, before.length - j), a = after.slice(i, after.length - j);
  if (!b && a) return a + ' ' + (a.length === 1 ? '하나' : a.length + '글자') + ' 빠짐';
  if (b && !a) return b + ' ' + (b.length === 1 ? '하나' : b.length + '글자') + ' 더 씀';
  if (b.length === 1 && a.length === 1) return LOOK[b + a] || b + ' → ' + a;
  if (b.length === 2 && a.length === 2 && b[0] === a[1] && b[1] === a[0]) return b + ' 순서 바뀜';
  return b + ' → ' + a;
}

// 출하 폴더 TFT(대장에 없음) 각각에 대해, 어느 출하와도 안 묶인 대장 TFT 중 가장 가까운 것 하나.
//   서로 유일한 짝일 때만 제안 (비슷한 번호가 여럿이면 추정하지 않음)
//   folderTfts: 대장에 없는 폴더 TFT 목록 / ledgerTfts: 어느 폴더와도 안 묶인 대장 TFT 목록
//   targets: 제안이 필요한 폴더 TFT만 (기본 전체). 역방향 유일성 검사는 항상 folderTfts 전체와 비교
export function suggestPairs(folderTfts, ledgerTfts, cap = 2, targets = folderTfts) {
  const best = (a, pool) => {
    let m = cap + 1, hits = [];
    for (const b of pool) {
      const d = snDist(a, b, cap);
      if (d < m) { m = d; hits = [b]; } else if (d === m && d <= cap) hits.push(b);
    }
    return m <= cap ? { d: m, hits } : null;
  };
  const out = new Map();
  for (const f of targets) {
    const r = best(f, ledgerTfts);
    if (!r || r.hits.length !== 1) continue;
    const back = best(r.hits[0], folderTfts);
    if (back && back.hits.length === 1 && back.hits[0] === f) out.set(f, { ledger: r.hits[0], dist: r.d });
  }
  return out;
}

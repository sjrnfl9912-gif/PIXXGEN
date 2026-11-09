// ═══ 통합취합본 이력 점검 — 계산 캐시 · 수정 이력 기록 · 🔍 점검 큐 화면 ═══
//  표 강조/⚠ 칩/유닛 모달은 table.js, 판정 규칙은 audit.js
import { state, rebuildTft, markDupDirty, invalidateOtherTabs } from '../state.js';
import { auditMerge } from './audit.js';
import { dbUpdate, dbInsert, dbDelete, dbFetchAll } from '../db.js';
import { toast, customConfirm } from '../services/ui.js';
import { saveCache } from '../services/storage.js';
import { normField } from './date.js';
import { requireEdit } from '../services/editmode.js';
import { renderMergeTable, copyCellText } from './table.js';

const esc = v => (v == null ? '' : String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
const norm = v => (v == null ? '' : String(v).trim());

export const FLABEL = {
  model_name: '모델명', tft_sn: 'TFT', scintillator: 'Scintillator', cpu_sn: 'CPU', main_board_sn: 'BOARD S/N', main_board_ver: 'BOARD VER',
  panel_type: '중판', completed_date: '제작완료일', detector_fw: 'F/W', micom_ver: 'MICOM', bat_micom_ver: 'BAT MICOM', worker: '작업자',
  aed_sn: 'AED', note1: '비고1', note2: '비고', detector_sn: '디텍터', prod_no: '생산번호',
};

// 출하 _id → 문제 목록. 데이터가 바뀌면(markDupDirty) 다시 계산 — 6천 건에 20ms 안팎
let cache = null;
export function getAudit() {
  if (cache && !state.auditDirty) return cache;
  state.auditDirty = false;
  const restock = new Set(state.tftmD.filter(t => norm(t.note).includes('재입고')).map(t => t.detector_sn));
  for (const r of state.restockConf?.values() || []) for (const d of norm(r.dets).split(',')) if (d) restock.add(d);   // 웹에서 「재입고 맞음」 확인한 건
  cache =auditMerge(state.shipD, state.detTftMap, state.tftMap, state.prodD, restock, shipDates());
  return cache;
}
// 디텍터 → 출하 폴더 날짜 (실제 출하일; 출하 대장 예상출하일은 밀리는 경우가 많아 안 씀)
function shipDates() { const m = {}; for (const t of state.tftmD) if (t.detector_sn && t.ship_date) m[t.detector_sn] = t.ship_date; return m; }
// 「재입고 맞음」 확인 기록 (restock_confirm, 15번 SQL) — TFT → 행. 표가 없으면 null → 버튼 숨김
export async function loadRestockConf() {
  try { state.restockConf = new Map((await dbFetchAll('restock_confirm')).map(r => [r.tft_sn, r])); }
  catch (e) { state.restockConf = null; }
  state.auditDirty = true;
  if (state.mergeD?.length) renderMergeTable();
}
export const hasProblem = xs => !!xs && xs.some(x => x.kind !== 'ok');
export function auditCount() { let n = 0; for (const xs of getAudit().values()) if (hasProblem(xs)) n++; return n; }

// 생산 칸 수정 → 수정 이력(fix_log)에 칸마다 한 줄. before = 고치기 전 생산 행(복사본)
export async function logFixes(before, det, product, changes, issues, reason) {
  let ok = 0;
  for (const [f, after] of Object.entries(changes)) {
    const why = (issues || []).filter(x => x.f === f).map(x => x.msg).join(' / ');
    const row = await dbInsert('fix_log', {
      kind: '이력 수정', prod_id: before.id != null ? before.id : before._id, prod_no: before.prod_no || null, worker: before.worker || null,
      completed_date: before.completed_date || null, product: product || before.model_name || null, detector_sn: det || null,
      before_val: before[f] == null ? '' : String(before[f]), after_val: after == null ? '' : String(after),
      what: (FLABEL[f] || f) + (why ? ': ' + why : ''), reason: reason || null,
    });
    if (row) ok++;
  }
  return ok;
}

// ── 🔍 점검 큐 ──
//  중복은 같은 값끼리 한 건(관련 유닛·생산기록 카드를 나란히), 형식 이상은 유닛 한 칸이 한 건
let qOpen = false, qSel = 0;
const CHECK_KEY = 'audit_check';
let checked = new Set();
try { checked = new Set(JSON.parse(localStorage.getItem(CHECK_KEY) || '[]')); } catch (e) {}
const saveChecked = () => { try { localStorage.setItem(CHECK_KEY, JSON.stringify([...checked])); } catch (e) {} };

function groups() {
  const audit = getAudit(), out = [], byKey = new Map();
  for (const s of state.shipD) {
    for (const x of audit.get(s._id) || []) {
      if (x.kind === 'odd') { out.push({ key: x.key + '|' + s._id, kind: 'odd', f: x.f, fs: new Set([x.f]), ships: [s], msg: x.msg }); continue; }
      let g = byKey.get(x.key);
      if (!g) { g = { key: x.key, kind: x.kind, f: x.f, fs: new Set(), copy: x.key.startsWith('copy|'), ships: [], msg: x.msg }; byKey.set(x.key, g); out.push(g); }
      g.fs.add(x.f);
      if (!g.ships.includes(s)) g.ships.push(s);
    }
  }
  const rank = { dup: 0, odd: 1, ok: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}
const prodOf = s => state.tftMap[state.detTftMap[s.detector_sn]] || null;
const pid = p => (p.id != null ? p.id : p._id);
// 같은 값을 가진 다른 생산기록 — 2026 출하 대장에 없는 것(재고·이전 연도 출하)까지
function peersOf(g) {
  const have = new Set(g.ships.map(prodOf).filter(Boolean));
  if (g.copy) { const ids = new Set(g.key.slice(5).split('-')); return state.prodD.filter(p => ids.has(String(pid(p))) && !have.has(p)); }
  if (g.kind !== 'dup' || !['scintillator', 'cpu_sn', 'main_board_sn', 'aed_sn'].includes(g.f)) return [];
  const v = gVal(g);
  return state.prodD.filter(p => norm(p[g.f]) === v && !have.has(p));
}
const gVal = g => g.key.split('|').slice(1).join('|');
// 목록·제목·카톡에 쓰는 이름
const gName = g => (g.copy ? '행 복사' : FLABEL[g.f]);
const gShow = (g, p0) => (g.copy ? [...g.fs].map(f => FLABEL[f]).join('·') + ' 같음' : g.kind === 'odd' ? (p0 ? p0[g.f] : '') : gVal(g));
const detsOfTft = t => state.tftmD.filter(x => x.tft_sn === t).map(x => x.detector_sn);

const CARD_F = ['tft_sn', 'scintillator', 'cpu_sn', 'main_board_sn', 'main_board_ver', 'aed_sn', 'worker', 'completed_date', 'prod_no'];
const EDIT_F = new Set(['scintillator', 'cpu_sn', 'main_board_sn', 'main_board_ver', 'aed_sn']);
function card(head, sub, p, g, det) {
  const lock = !p || (g.f === 'tft_sn' || g.f === 'detector_sn');   // TFT·디텍터 문제는 출하 폴더/엑셀에서 고침
  const kv = CARD_F.map(f => {
    const v = p ? p[f] : '', hit = g.fs.has(f) ? (g.kind === 'odd' ? ' odd' : g.kind === 'ok' ? ' okv' : ' hit') : '';
    const ro = lock || !EDIT_F.has(f) || !p;
    return '<span>' + FLABEL[f] + '</span><input class="' + hit.trim() + '" value="' + esc(v) + '"'
      + (ro ? ' readonly tabindex="-1"' : ' data-pid="' + esc(pid(p)) + '" data-f="' + f + '" data-det="' + esc(det || '') + '"') + '>'
      + '<button class="aq-cp" data-aq="copy" title="복사" tabindex="-1">⧉</button>';
  }).join('');
  const go = p && p.tft_sn ? '<button class="aq-go" data-aq="goprod" data-tft="' + esc(p.tft_sn) + '" title="생산관리대장에서 이 TFT로 검색">생산관리대장 ↗</button>' : '';
  return '<div class="aq-card"><div class="aq-ch">' + go + head + '<small>' + sub + '</small></div>'
    + (p ? '<div class="aq-kv">' + kv + '</div>' : '<div class="aq-none">생산기록 없음 (TFT 매칭 없음)</div>') + '</div>';
}
// 행 복사 — 어느 쪽이 복사된 건지 단서: 완료일 > 실제 출하일, 출하 기록 없는 TFT
function copyHint(g) {
  const dates = shipDates(), clues = [];
  for (const s of g.ships) {
    const p = prodOf(s), d = dates[s.detector_sn];
    if (p && d && norm(p.completed_date) > d) clues.push('디텍터 <b>' + esc(s.detector_sn) + '</b>는 ' + esc(d) + ' 출하인데 완료일이 ' + esc(p.completed_date) + ' → <b>이쪽이 복사된 기록</b>(실제 부품 값 아님)');
  }
  for (const p of peersOf(g)) if (!detsOfTft(p.tft_sn).length)
    clues.push('TFT <b>' + esc(p.tft_sn || '없음') + '</b>는 출하 기록이 없음 → 같은 유닛을 TFT 오타로 한 번 더 입력한 행일 수 있음');
  return 'TFT만 다르고 <b>' + [...g.fs].map(f => FLABEL[f]).join('·') + '</b>가 같은 날 같은 값 → 한 행을 복사해 TFT만 바꿔 적은 것으로 보입니다. 한쪽은 실제 부품 값이 아니니 <b>실물 확인</b> 후 틀린 쪽 칸을 고치세요.'
    + (clues.length ? '<br>· ' + clues.join('<br>· ') : '');
}
const confOf = g => (g.f === 'tft_sn' ? state.restockConf?.get(gVal(g)) || null : null);
const RS_KINDS = ['재입고 후 재출하', '데모·대여 회수 후 재출하', '기타'];
// 출하 순서(출하 폴더 날짜, 없으면 예상출하일)로 정렬
function shipOrder(g) {
  const dates = shipDates(), dOf = s => dates[s.detector_sn] || s.planned_ship_date || '';
  return [...g.ships].sort((a, b) => (dOf(a) < dOf(b) ? -1 : dOf(a) > dOf(b) ? 1 : 0)).map(s => ({ s, d: dOf(s) }));
}
// 재입고 확인 창 — 이전 출하 → 재출하 순서 + 구분 + 메모 + 확인자
function openRestockModal(g) {
  if (!g || !requireEdit()) return;
  const xs = shipOrder(g);
  let who = ''; try { who = localStorage.getItem('audit_who') || ''; } catch (e) {}
  const node = (x, i) => '<div class="rs-node"><div class="rs-lb">' + (i === 0 ? '이전 출하' : '재출하' + (xs.length > 2 ? ' ' + i : '')) + '</div><div class="rs-d">' + esc(x.s.detector_sn) + '</div><div class="rs-m">'
    + [norm(x.s.mgmt_no) && '관리번호 ' + esc(x.s.mgmt_no), esc(x.d), esc(norm(x.s.company).slice(0, 30)), esc(x.s.country || '')].filter(Boolean).join(' · ') + '</div></div>';
  const bg = document.createElement('div');
  bg.className = 'rs-bg';
  bg.innerHTML = '<div class="rs"><h3>재입고로 확인</h3><div class="rs-sub">TFT <b>' + esc(gVal(g)) + '</b> — 같은 제품을 재입고 후 새 디텍터 S/N으로 다시 출하한 건이면 두 이력 모두 맞음</div>'
    + '<div class="rs-tl">' + xs.map(node).join('<div class="rs-arrow">재입고 → 재출하</div>') + '</div>'
    + '<div class="rs-opt">' + RS_KINDS.map((k, i) => '<label><input type="radio" name="rsKind" value="' + k + '"' + (i ? '' : ' checked') + '>' + k + '</label>').join('') + '</div>'
    + '<input class="rs-in" id="rsMemo" placeholder="메모 (선택) — 예: 국내영업 반납분, 재검사 후 폴란드 출하">'
    + '<div class="rs-who">확인자 <input class="rs-in" id="rsWho" value="' + esc(who) + '" placeholder="이름"></div>'
    + '<div class="rs-foot"><button class="btn" data-rs="no">취소</button><button class="btn rs-ok" data-rs="ok">✅ 재입고로 확인</button></div></div>';
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  bg.addEventListener('click', async e => {
    const act = e.target.dataset?.rs;
    if (e.target === bg || act === 'no') { close(); return; }
    if (act !== 'ok') return;
    const by = bg.querySelector('#rsWho').value.trim();
    if (!by) { toast('확인자 이름을 적어주세요', 'info'); bg.querySelector('#rsWho').focus(); return; }
    try { localStorage.setItem('audit_who', by); } catch (err) {}
    e.target.disabled = true;
    const row = await dbInsert('restock_confirm', {
      tft_sn: gVal(g), dets: xs.map(x => x.s.detector_sn).join(','), kind: bg.querySelector('input[name=rsKind]:checked').value,
      memo: bg.querySelector('#rsMemo').value.trim() || null, confirmed_by: by,
    });
    if (!row) { toast('저장 실패 — 다시 시도해주세요', 'er'); e.target.disabled = false; return; }
    state.restockConf.set(row.tft_sn, row);
    close(); state.auditDirty = true; renderMergeTable();
    toast('재입고로 확인 — ' + row.dets.replace(/,/g, ' → '), 'ok');
  });
  bg.querySelector('#rsMemo').focus();
}
function unconfirmRestock(g) {
  const c = g && confOf(g);
  if (!c || !requireEdit()) return;
  customConfirm('TFT ' + c.tft_sn + ' 재입고 확인을 취소할까요? 다시 TFT 중복으로 표시됩니다.', async () => {
    if (!(await dbDelete('restock_confirm', [c.id]))) { toast('취소 실패 — 다시 시도해주세요', 'er'); return; }
    state.restockConf.delete(c.tft_sn); state.auditDirty = true; renderMergeTable();
    toast('재입고 확인 취소', 'ok');
  });
}
function hint(g) {
  if (g.copy) return copyHint(g);
  if (g.kind === 'ok') return confOf(g) ? '재입고로 확인한 건 — 두 이력 모두 맞음 (같은 제품을 새 디텍터 S/N으로 다시 출하).'
    : '재입고(같은 제품을 새 디텍터 S/N으로 다시 출하) — 출하 폴더에 「재입고」가 적혀 있어 정상 연결로 봅니다. 확인만 하고 넘기면 됩니다.';
  if (g.f === 'tft_sn') return 'TFT는 출하완료 폴더 이름에서 매일 다시 만들어집니다 → 여기서는 못 고칩니다. <b>오기입이면</b> 실물 TFT 라벨 확인 후 출하 폴더명을 고치고, <b>재입고 후 재출하한 같은 제품이면</b> 「✅ 재입고 맞음」으로 확인하세요.';
  if (g.f === 'detector_sn') return '출하 대장(엑셀)에 같은 디텍터 S/N이 두 번 있습니다 → 통합 출하 이력 엑셀에서 고칩니다.';
  if (g.kind === 'dup' && g.f === 'scintillator') return '서로 다른 생산기록에 같은 <b>Scintillator</b> 번호가 적혀 있습니다 (TR 번호는 돌려 쓰므로 검사 안 함). 실물 라벨을 보고 틀린 쪽을 고치세요.';
  if (g.f === 'completed_date') return '제작완료일이 실제 출하(출하 폴더 날짜)보다 늦습니다 → 다른 유닛 기록을 잘못 연결했거나 날짜 오기입. 생산번호·옆 기록을 보고 확인하세요.';
  if (g.kind === 'dup') return '서로 다른 생산기록에 같은 <b>' + FLABEL[g.f] + '</b>가 적혀 있습니다. CPU·보드는 같은 날 조립하면 번호가 함께 올라가니 <b>옆 칸 번호·완료일</b>을 보고 틀린 쪽을 고치세요. 모르겠으면 「🔍 실물 확인」.';
  return '형식이 이상한 값: <b>' + esc(g.msg) + '</b> — 실물 라벨을 보고 고치세요.';
}

export function isAuditQueueOpen() { return qOpen; }
export function toggleAuditQueue(force) {
  qOpen = force ?? !qOpen;
  document.getElementById('auditQ').hidden = !qOpen;
  document.querySelector('#v-merge .tw').hidden = qOpen;
  document.getElementById('auditQBtn')?.classList.toggle('on', qOpen);
  if (qOpen) renderAuditQueue(); else renderMergeTable();
}

export function renderAuditQueue() {
  if (!qOpen) return;
  const gs = groups();
  if (qSel >= gs.length) qSel = Math.max(0, gs.length - 1);
  const nCheck = gs.filter(g => checked.has(g.key)).length;
  document.getElementById('aqProg').textContent = '남은 ' + gs.filter(g => g.kind !== 'ok').length + '건 · 실물 확인 ' + nCheck + '건';
  const TYPE = [['dup', '중복 — 다른 유닛과 같은 S/N'], ['odd', '형식 이상'], ['ok', '재입고 연결 (정상)']];
  let h = '';
  for (const [t, l] of TYPE) {
    const list = gs.filter(g => g.kind === t); if (!list.length) continue;
    h += '<div class="aq-gh">' + l + ' · ' + list.length + '</div>';
    for (const g of list) {
      const i = gs.indexOf(g), p0 = prodOf(g.ships[0]);
      h += '<div class="aq-i' + (i === qSel ? ' sel' : '') + '" data-i="' + i + '"><div><b>' + gName(g) + '</b> <span class="mono">' + esc(gShow(g, p0)) + '</span><br><small>'
        + esc(g.ships.map(s => s.detector_sn).join(' · ')) + '</small></div>' + (checked.has(g.key) ? '<span title="실물 확인 요청함">🔍</span>' : '') + '</div>';
    }
  }
  document.getElementById('aqList').innerHTML = h || '<div class="aq-empty">문제 없음 🎉</div>';
  const g = gs[qSel], right = document.getElementById('aqRight');
  if (!g) { right.innerHTML = '<div class="aq-empty">중복·이상 이력이 없습니다.</div>'; return; }
  // TFT 중복이면 두 디텍터 카드가 같은 생산기록을 보여줌 — 그 경우 수정은 막혀 있음
  const cards = g.ships.map(s => {
    const p = prodOf(s);
    return card(esc(s.detector_sn) + (norm(s.mgmt_no) ? ' <span class="aq-mg">관리번호 ' + esc(s.mgmt_no) + '</span>' : ''), esc(s.product_name) + ' · ' + esc(norm(s.company).slice(0, 28)) + ' · 예상출하 ' + esc(s.planned_ship_date || '-'), p, g, s.detector_sn);
  }).concat(peersOf(g).map(p => {
    const dets = detsOfTft(p.tft_sn);
    return card('TFT ' + esc(p.tft_sn || '없음') + ' 생산기록', dets.length ? '출하 폴더 디텍터 ' + esc(dets.join(', ')) + ' (2026 출하 대장 밖)' : '출하 기록 없음 — 재고이거나 이전 연도', p, g, dets[0]);
  }));
  const editable = g.f !== 'tft_sn' && g.f !== 'detector_sn' && g.kind !== 'ok';
  const conf = confOf(g), canRestock = g.f === 'tft_sn' && g.kind === 'dup' && state.restockConf;
  const done = conf ? '<div class="aq-done">✅ ' + esc(conf.kind) + ' · ' + esc(conf.confirmed_by || '') + ' · ' + esc(String(conf.confirmed_at || '').slice(0, 10))
    + (conf.memo ? ' · ' + esc(conf.memo) : '') + ' · ' + esc(norm(conf.dets).replace(/,/g, ' → ')) + '<a data-aq="unrestock">확인 취소</a></div>' : '';
  right.innerHTML = '<div class="aq-t">' + (g.copy ? '행 복사 의심' : FLABEL[g.f] + ' ' + (g.kind === 'odd' ? '형식 이상' : g.kind === 'ok' ? '재입고 연결' : '중복')) + '</div>'
    + '<div class="aq-sub">' + esc(g.msg) + '</div><div class="aq-hint">' + hint(g) + '</div><div class="aq-cmp">' + cards.join('') + '</div>' + done
    + '<div class="aq-act">' + (canRestock ? '<button class="btn rs-ok" data-aq="restock">✅ 재입고 맞음…</button>' : '') + (editable ? '<input id="aqReason" placeholder="수정 사유 (수정 이력에 남음) — 예: 실물 라벨 확인, 같은 날 연번">'
      + '<button class="btn btn-pr" data-aq="save">💾 저장하고 다음</button>' : '')
    + '<button class="btn" data-aq="check">' + (checked.has(g.key) ? '🔍 실물 확인 취소' : '🔍 실물 확인으로') + '</button>'
    + '<button class="btn" data-aq="next">다음 ▶</button></div>';
  right.querySelectorAll('input[data-f]').forEach(inp => inp.addEventListener('input', () => inp.classList.toggle('chg', inp.value !== inp.defaultValue)));
}

async function saveCurrent(g) {
  const changed = [...document.querySelectorAll('#aqRight input[data-f]')].filter(i => i.value.trim() !== i.defaultValue);
  if (!changed.length) { toast('바뀐 칸이 없습니다', 'info'); return false; }
  if (!requireEdit()) return false;
  const reason = document.getElementById('aqReason')?.value.trim() || '';
  const byPid = new Map();
  for (const i of changed) {
    if (!byPid.has(i.dataset.pid)) byPid.set(i.dataset.pid, { det: i.dataset.det, ch: {} });
    const v = normField(i.dataset.f, i.value.trim());
    byPid.get(i.dataset.pid).ch[i.dataset.f] = v === '' ? null : v;
  }
  const audit = getAudit();
  let nField = 0, nLog = 0;
  for (const [id, { det, ch }] of byPid) {
    const idx = state.prodD.findIndex(p => String(pid(p)) === id);
    if (idx < 0) continue;
    const before = { ...state.prodD[idx] };
    const updated = await dbUpdate('production', before.id != null ? before.id : before._id, ch);
    if (!updated) { toast('저장 실패 — 다시 시도해주세요', 'er'); return false; }
    Object.assign(state.prodD[idx], updated, { _id: updated.id });
    nField += Object.keys(ch).length;
    const ship = state.shipD.find(s => s.detector_sn === det);
    nLog += await logFixes(before, det, ship?.product_name, ch, ship ? audit.get(ship._id) : [], reason);
  }
  rebuildTft(); markDupDirty(); invalidateOtherTabs(); saveCache(state.shipD, state.prodD);
  toast('저장 완료 — ' + nField + '칸' + (nLog === nField ? ' · 수정 이력에 기록' : ' · ⚠ 수정 이력 일부 저장 실패'), nLog === nField ? 'ok' : 'er');
  return true;
}

// 실물 확인 요청한 건 → 작업자별 카톡 문구
function checkKakao() {
  const gs = groups().filter(g => checked.has(g.key));
  if (!gs.length) { toast('「🔍 실물 확인으로」 넘긴 건이 없습니다', 'info'); return; }
  const byW = {};
  for (const g of gs) {
    const ps = g.ships.map(prodOf).filter(Boolean).concat(peersOf(g));
    const w = [...new Set(ps.map(p => p.worker || '작업자 없음'))].join('·') || '작업자 없음';
    const p0 = ps[0] || {};
    (byW[w] ||= []).push('- 디텍터 ' + g.ships.map(s => s.detector_sn).join(', ') + (p0.completed_date ? ' / 완료 ' + p0.completed_date : '')
      + ' : ' + (g.copy ? '' : gName(g) + ' ' + gShow(g, p0) + ' — ') + g.msg);
  }
  const txt = '[생산 이력 실물 확인 요청] ' + new Date().toLocaleDateString('sv-SE')
    + '\n생산관리대장 값이 다른 기록과 겹치거나 형식이 이상합니다. 실물 라벨 확인 후 맞는 값 알려주세요.\n'
    + Object.entries(byW).map(([w, ls]) => '\n■ ' + w + ' (' + ls.length + '건)\n' + ls.join('\n')).join('\n');
  copyCellText(txt);
}

// 생산관리대장 탭으로 가서 그 TFT로 검색 — 통합취합본 탭은 그대로라 돌아오면 점검 큐 그대로
function goProd(tft) {
  const q = document.getElementById('q2');
  q.value = tft; q.dispatchEvent(new Event('input'));
  document.querySelector('.tab[data-tab="prod"]').click();
}

export function initAuditQueue() {
  document.getElementById('dupChip3')?.addEventListener('click', e => {
    state.auditMode = !state.auditMode;
    e.currentTarget.classList.toggle('on', state.auditMode);
    if (qOpen) toggleAuditQueue(false); else renderMergeTable();
  });
  document.getElementById('auditQBtn')?.addEventListener('click', () => toggleAuditQueue());
  document.getElementById('aqKakao')?.addEventListener('click', checkKakao);
  document.getElementById('aqList')?.addEventListener('click', e => {
    const t = e.target.closest('.aq-i'); if (!t) return;
    qSel = +t.dataset.i; renderAuditQueue();
  });
  document.getElementById('aqRight')?.addEventListener('click', async e => {
    const b = e.target.closest('[data-aq]'); if (!b) return;
    if (b.dataset.aq === 'copy') { copyCellText(b.previousElementSibling.value); return; }   // 고치던 값이면 고친 값으로
    if (b.dataset.aq === 'goprod') { goProd(b.dataset.tft); return; }
    if (b.dataset.aq === 'restock') { openRestockModal(groups()[qSel]); return; }
    if (b.dataset.aq === 'unrestock') { unconfirmRestock(groups()[qSel]); return; }
    const gs = groups(), g = gs[qSel]; if (!g) return;
    if (b.dataset.aq === 'save') {
      b.disabled = true;
      const ok = await saveCurrent(g);
      b.disabled = false;
      if (!ok) return;
      checked.delete(g.key); saveChecked();
      // 고쳐서 문제가 사라지면 목록에서 빠지므로 같은 번호 = 다음 건
      const still = groups().some(x => x.key === g.key);
      if (still) qSel++;
    } else if (b.dataset.aq === 'check') {
      if (checked.has(g.key)) checked.delete(g.key); else { checked.add(g.key); qSel++; }
      saveChecked();
    } else qSel++;
    renderAuditQueue();
  });
}

// ═══════════════════════════════════════
// EDIT MODE — 보기는 누구나, 수정·저장은 팀 공용 비밀번호
//   스위치 ON = Supabase 팀 계정 로그인, OFF = 로그아웃.
//   DB 쓰기 권한은 RLS가 로그인 세션에만 허용하므로, 여기 잠금은 UX용 1차 방어.
// ═══════════════════════════════════════
import { getSupabase, TEAM_EMAIL } from '../config.js?v=20261002';
import { state } from '../state.js';
import { toast, customConfirm } from './ui.js';

state.editMode = false;

function applyUi() {
  document.body.classList.toggle('edit-mode', state.editMode);
  const lbl = document.getElementById('editModeLbl');
  if (lbl) lbl.textContent = state.editMode ? '편집 모드' : '보기 모드';
  const sw = document.getElementById('editModeSw');
  if (sw) sw.setAttribute('aria-checked', state.editMode ? 'true' : 'false');
}

// 편집이 필요한 동작 직전에 호출. 보기 모드면 안내하고 false.
let lastWarn = 0;
export function requireEdit() {
  if (state.editMode) return true;
  const now = Date.now();
  if (now - lastWarn > 1500) {
    lastWarn = now;
    toast('보기 모드예요 — 상단 「보기 모드」 스위치를 켜고 비밀번호를 입력하세요', 'info');
    const sw = document.getElementById('editModeSw');
    if (sw) { sw.classList.remove('nudge'); void sw.offsetWidth; sw.classList.add('nudge'); }
  }
  return false;
}

function openPwModal() {
  const bg = document.getElementById('editPwBg');
  const inp = document.getElementById('editPwInput');
  const err = document.getElementById('editPwErr');
  if (!bg || !inp) return;
  inp.value = ''; err.textContent = '';
  bg.classList.add('show');
  setTimeout(() => inp.focus(), 30);
}
function closePwModal() { document.getElementById('editPwBg')?.classList.remove('show'); }

async function submitPw() {
  const inp = document.getElementById('editPwInput');
  const err = document.getElementById('editPwErr');
  const btn = document.getElementById('editPwOk');
  const pw = inp.value;
  if (!pw) { err.textContent = '비밀번호를 입력하세요'; return; }
  const sb = getSupabase(); if (!sb) { err.textContent = 'DB 연결 실패'; return; }
  btn.disabled = true; err.textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: TEAM_EMAIL, password: pw });
  btn.disabled = false;
  if (error) {
    err.textContent = /invalid/i.test(error.message) ? '비밀번호가 틀렸어요' : '로그인 실패: ' + error.message;
    inp.select();
    return;
  }
  state.editMode = true; applyUi(); closePwModal();
  toast('편집 모드 ON — 다 쓰면 스위치를 꺼주세요', 'ok');
}

async function turnOff() {
  const sb = getSupabase();
  const doOff = async () => {
    if (state.editing) { const { endEdit } = await import('../modules/editing.js'); endEdit(); }
    try { await sb?.auth.signOut(); } catch (e) { /* 네트워크 실패해도 로컬 세션은 정리됨 */ }
    state.editMode = false; applyUi();
    toast('보기 모드로 돌아왔어요', 'info');
  };
  if (state.hasChanges) {
    customConfirm('저장하지 않은 변경사항이 있어요.\n저장하지 않고 보기 모드로 바꿀까요? (변경은 화면에 남지만 DB에는 반영되지 않아요)', doOff);
  } else doOff();
}

export async function initEditMode() {
  const sb = getSupabase();
  applyUi();
  document.getElementById('editModeSw')?.addEventListener('click', () => { state.editMode ? turnOff() : openPwModal(); });
  document.getElementById('editPwOk')?.addEventListener('click', submitPw);
  document.getElementById('editPwCancel')?.addEventListener('click', closePwModal);
  document.getElementById('editPwInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submitPw(); }
    if (e.key === 'Escape') closePwModal();
    e.stopPropagation();   // 그리드 단축키로 새지 않게
  });
  document.getElementById('editPwBg')?.addEventListener('click', e => { if (e.target.id === 'editPwBg') closePwModal(); });
  if (!sb) return;
  // 스위치를 끄지 않고 닫았으면 세션이 남아 있음 → 편집 모드로 복귀
  const { data } = await sb.auth.getSession();
  state.editMode = !!data?.session; applyUi();
  sb.auth.onAuthStateChange((_ev, session) => { state.editMode = !!session; applyUi(); });
}

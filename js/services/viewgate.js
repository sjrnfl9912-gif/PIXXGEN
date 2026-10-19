// ═══════════════════════════════════════
// VIEW GATE — 조회도 팀 인원만. 처음 한 번 보기 비밀번호(숫자)를 입력하면 이 브라우저에서 유지.
//   보기 계정으로 로그인해야 DB가 데이터를 내줌(RLS: authenticated만 select).
//   편집 모드를 끄면 편집 계정에서 로그아웃 → 저장해 둔 보기 계정으로 다시 로그인.
// ═══════════════════════════════════════
import { getSupabase } from '../config.js';

const VIEW_EMAIL = 'viewer@pixxgen.internal';
const PW_KEY = 'pixx_view_pw';
const toPw = pin => 'pixxgen-view-' + pin;   // Supabase 최소 길이(6자) 충족용

function savedPw() { try { return localStorage.getItem(PW_KEY); } catch (e) { return null; } }
function savePw(pw) { try { localStorage.setItem(PW_KEY, pw); } catch (e) {} }
function clearPw() { try { localStorage.removeItem(PW_KEY); } catch (e) {} }

async function signInViewer(pw) {
  const sb = getSupabase();
  if (!sb) return { error: new Error('DB 연결 실패') };
  return sb.auth.signInWithPassword({ email: VIEW_EMAIL, password: pw });
}

// 데이터를 불러오기 전에 호출. 로그인 세션이 생길 때까지 기다림.
export async function ensureViewAccess() {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  if (data?.session) return;
  const pw = savedPw();
  if (pw) {
    const { error } = await signInViewer(pw);
    if (!error) return;
    clearPw();   // 비밀번호가 바뀐 경우 → 다시 입력받음
  }
  await askPin();
}

function askPin() {
  return new Promise(resolve => {
    const bg = document.getElementById('viewGateBg');
    const inp = document.getElementById('viewGateInput');
    const err = document.getElementById('viewGateErr');
    const btn = document.getElementById('viewGateOk');
    bg.classList.add('show');
    setTimeout(() => inp.focus(), 30);
    const submit = async () => {
      const pin = inp.value.trim();
      if (!pin) { err.textContent = '비밀번호를 입력하세요'; return; }
      btn.disabled = true; err.textContent = '';
      const { error } = await signInViewer(toPw(pin));
      btn.disabled = false;
      if (error) {
        err.textContent = /invalid/i.test(error.message) ? '비밀번호가 틀렸어요' : '로그인 실패: ' + error.message;
        inp.select();
        return;
      }
      savePw(toPw(pin));
      bg.classList.remove('show');
      resolve();
    };
    btn.addEventListener('click', submit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } e.stopPropagation(); });
  });
}

// 편집 모드 OFF 후 보기 계정으로 복귀. 저장된 비밀번호가 없으면 새로고침(입력 화면).
export async function backToViewer() {
  const pw = savedPw();
  if (pw) {
    const { error } = await signInViewer(pw);
    if (!error) return true;
    clearPw();
  }
  location.reload();
  return false;
}

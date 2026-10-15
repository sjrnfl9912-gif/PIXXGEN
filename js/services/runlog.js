// ═══════════════════════════════════════
// RUN LOG — 매일 자동 실행(17:00 업로드 · 17:10 TFT 매칭 · 17:30 백업 · 17:45 AI 점검) 결과 표시
//   PC 스크립트가 run_log 테이블에 남긴 기록을 읽어 상단 점 색 + 서랍 표로 보여줌.
// ═══════════════════════════════════════
import { getSupabase, SNAPSHOT_PATH } from '../config.js?v=20261002';
import { toast } from './ui.js';

const JOBS = [
  { key: 'upload', label: '17:00 엑셀 업로드', due: '17:05' },
  { key: 'tft-sync', label: '17:10 TFT 매칭', due: '17:20' },
  { key: 'backup', label: '17:30 서버 백업', due: '17:40' },
  { key: 'ai-check', label: '17:45 AI 점검', due: '17:55', ai: true },
];

const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function load() {
  const sb = getSupabase(); if (!sb) return null;
  const since = new Date(); since.setDate(since.getDate() - 10);
  const { data, error } = await sb.from('run_log').select('job,trigger,started_at,ok,rows,message')
    .gte('started_at', since.toISOString()).order('started_at', { ascending: true });
  if (error) return null;
  return data || [];
}

// 날짜·작업별 마지막 실행 1건
function byDay(list) {
  const m = {};
  list.forEach(r => {
    const d = new Date(r.started_at);
    const k = ymd(d);
    (m[k] = m[k] || {})[r.job] = { ...r, at: d };
  });
  return m;
}

function todayStatus(m) {
  const today = m[ymd(new Date())] || {};
  const now = hm(new Date());
  let anyFail = false, allOk = true, overdue = false;
  JOBS.filter(j => !j.ai).forEach(j => {
    const r = today[j.key];
    if (r && !r.ok) anyFail = true;
    if (!r || !r.ok) allOk = false;
    if (!r && now >= j.due) overdue = true;
  });
  if (anyFail) return { cls: 'bad', text: '오늘 자동 실행 실패' };
  const ai = today['ai-check'];
  if (allOk && ai && !ai.ok) return { cls: 'warn', text: 'AI 점검: 확인 필요' };
  if (allOk) return { cls: 'ok', text: '오늘 자동 실행 정상' };
  if (overdue) return { cls: 'warn', text: '오늘 실행 기록 없음' };
  return { cls: 'idle', text: '오늘 실행 전' };
}

function cell(r, j) {
  if (!r) return '<td class="rl-none">-</td>';
  const tip = esc((r.trigger === 'manual' ? '[수동] ' : '') + hm(r.at) + ' · ' + (r.message || ''));
  if (j.ai) return r.ok ? '<td class="rl-ok" title="' + tip + '">✓ 정상</td>' : '<td class="rl-warn" title="' + tip + '">⚠ 확인</td>';
  if (!r.ok) return '<td class="rl-bad" title="' + tip + '">✕ 실패</td>';
  return '<td class="rl-ok" title="' + tip + '">✓' + (r.rows != null ? ' ' + Number(r.rows).toLocaleString() : '') + '</td>';
}

function renderDrawer(m) {
  const body = document.getElementById('runLogBody'); if (!body) return;
  if (!m) { body.innerHTML = '<p class="rl-note">실행 기록을 불러오지 못했어요 (기록 테이블 준비 전이거나 연결 실패).</p>'; return; }
  const days = Object.keys(m).sort().reverse().slice(0, 7);
  let h = '<table class="rl-tbl"><tr><th>날짜</th>' + JOBS.map(j => '<th>' + j.label + '</th>').join('') + '</tr>';
  if (!days.length) h += '<tr><td colspan="' + (JOBS.length + 1) + '" class="rl-none">아직 기록이 없어요</td></tr>';
  days.forEach(d => { h += '<tr><td>' + d.slice(5) + '</td>' + JOBS.map(j => cell(m[d][j.key], j)).join('') + '</tr>'; });
  h += '</table>';
  // 가장 최근 AI 점검 판정 한 줄
  const lastAi = days.map(d => m[d]['ai-check']).find(Boolean);
  if (lastAi) {
    h += '<div class="rl-ai ' + (lastAi.ok ? 'ok' : 'warn') + '"><b>🤖 AI 점검 (' + ymd(lastAi.at).slice(5) + ')</b><span>'
      + esc(lastAi.message || '') + '</span></div>';
  }
  h += '<p class="rl-note">✕·⚠에 마우스를 올리면 이유가 보여요. 실패하면 자동 실행 PC에 윈도우 알림이 떠요.</p>';
  body.innerHTML = h;
}

function renderDot(m) {
  const btn = document.getElementById('runLogBtn'); if (!btn) return;
  const st = m ? todayStatus(m) : { cls: 'idle', text: '실행 기록' };
  btn.dataset.st = st.cls;
  btn.title = st.text;
}

async function refresh() {
  const list = await load();
  const m = list ? byDay(list) : null;
  renderDot(m);
  renderDrawer(m);
}

export function initRunLog() {
  const drawer = document.getElementById('runLogDrawer');
  document.getElementById('runLogBtn')?.addEventListener('click', () => { drawer?.classList.add('show'); refresh(); });
  document.getElementById('runLogClose')?.addEventListener('click', () => drawer?.classList.remove('show'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer?.classList.contains('show')) drawer.classList.remove('show'); });
  const pathEl = document.getElementById('runLogSnapPath');
  if (pathEl) pathEl.textContent = SNAPSHOT_PATH;
  document.getElementById('runLogSnapCopy')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(SNAPSHOT_PATH).then(() => toast('복사됨: ' + SNAPSHOT_PATH, 'ok')).catch(() => toast('복사 실패', 'er'));
  });
  refresh();
  setInterval(refresh, 5 * 60 * 1000);   // 5분마다 상태 점 갱신
}

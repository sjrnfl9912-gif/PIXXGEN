import { oddReason, auditMerge } from './audit.js';

describe('이상값 규칙', () => {
  test.each([
    ['cpu_sn', 'C2601-185', ''], ['cpu_sn', 'PCU2208010908', ''], ['main_board_sn', 'M172506A-415', ''],
    ['main_board_sn', 'OP142509-11', ''], ['main_board_sn', 'A7MB211101733', ''], ['main_board_ver', '4.751', ''],
    ['aed_sn', 'PD1023040083', ''], ['tft_sn', 'Q55180H9NAAA', ''], ['cpu_sn', 'X', ''],
    ['cpu_sn', 'ㅊ2504-87', '한글 섞임'], ['main_board_sn', 'M172601A-085?', '? 표시 (확인 못 한 값)'],
    ['main_board_sn', 'M172506A-392.', '끝에 불필요한 문자'], ['cpu_sn', 'C2507-11`', '끝에 불필요한 문자'],
    ['tft_sn', 'Q55180KAAAA', '11자리 (TFT는 12자리)'], ['main_board_sn', '4.751', 'BOARD S/N 칸에 VER 값'],
    ['main_board_ver', 'M142506A-044', 'VER 칸에 BOARD S/N'], ['main_board_sn', 'MN142511A-0310', '형식이 다름'],
    ['main_board_sn', 'M1412511A-0626', '형식이 다름'], ['cpu_sn', 'PCU22080101997', '형식이 다름'],
    ['scintillator', '', '미기입 — 모르면 「추정불가」로 적기'], ['scintillator', '추정불가', ''], ['scintillator', '없음', ''], ['cpu_sn', '', ''],
  ])('%s %s', (f, v, why) => expect(oddReason(f, v)).toBe(why));
});

describe('통합취합본 중복', () => {
  const P1 = { tft_sn: 'CJ5180H7FAAA', scintillator: 'TR0001', main_board_sn: 'M172506A-001' }, P2 = { tft_sn: 'CJ51A0K0BAAA', scintillator: 'TR0002', main_board_sn: 'M172506A-001' };
  const ships = [{ _id: 1, detector_sn: 'D1' }, { _id: 2, detector_sn: 'D2' }, { _id: 3, detector_sn: 'D3' }];
  const detTft = { D1: 'CJ5180H7FAAA', D2: 'CJ5180H7FAAA', D3: 'CJ51A0K0BAAA' };
  const tftMap = { CJ5180H7FAAA: P1, CJ51A0K0BAAA: P2 };

  test('같은 TFT 두 디텍터 + 다른 생산기록끼리 같은 보드', () => {
    const r = auditMerge(ships, detTft, tftMap, [P1, P2]);
    expect(r.get(1).map(x => x.f + x.kind)).toEqual(['tft_sndup', 'main_board_sndup']);
    expect(r.get(3).map(x => x.f)).toEqual(['main_board_sn']);    // TFT는 혼자라 중복 아님
  });
  test('재입고 표시가 있으면 TFT는 정상 연결', () => {
    const r = auditMerge(ships, detTft, tftMap, [P1, P2], new Set(['D2']));
    expect(r.get(1)[0].kind).toBe('ok');
  });
  test('같은 생산기록을 두 디텍터가 가리켜도 보드 중복으로 이중 집계 안 함', () => {
    const r = auditMerge(ships.slice(0, 2), detTft, tftMap, [P1]);
    expect(r.get(1).map(x => x.f)).toEqual(['tft_sn']);
  });
});

describe('신틸레이터 · 행 복사 · 완료일', () => {
  const mk = (id, tft, o) => ({ id, tft_sn: tft, completed_date: '2026-01-24', ...o });
  test('TR 신틸레이터는 단독 중복 아님, 그 외 형식은 중복', () => {
    const A = mk(1, 'Q55180J2CAAA', { scintillator: 'TR0558', completed_date: '2026-01-01' }), B = mk(2, 'Q55180J2VAAA', { scintillator: 'TR0558' });
    const C = mk(3, 'CJ5180H7FAAA', { scintillator: '24E21J3B', completed_date: '2026-01-01' }), D = mk(4, 'CJ51A0K0BAAA', { scintillator: '24E21J3B' });
    const ships = [{ _id: 1, detector_sn: 'D1' }, { _id: 3, detector_sn: 'D3' }];
    const r = auditMerge(ships, { D1: A.tft_sn, D3: C.tft_sn }, { [A.tft_sn]: A, [C.tft_sn]: C }, [A, B, C, D]);
    expect(r.get(1)).toBe(undefined);
    expect(r.get(3).map(x => x.f + x.kind)).toEqual(['scintillatordup']);
  });
  test('같은 날 Scint·CPU·BOARD·생산번호 같음 = 행 복사 한 건 (칸별 중복으로 따로 안 셈)', () => {
    const o = { scintillator: 'TR0558', cpu_sn: 'C2601-282', main_board_sn: 'M142511A-0688', prod_no: '26D82' };
    const A = mk(10, 'Q55180J2CAAA', o), B = mk(11, 'Q55180J2VAAA', o);
    const ships = [{ _id: 1, detector_sn: 'K420261A0' }, { _id: 2, detector_sn: 'K422263A5' }];
    const r = auditMerge(ships, { K420261A0: A.tft_sn, K422263A5: B.tft_sn }, { [A.tft_sn]: A, [B.tft_sn]: B }, [A, B], new Set(),
      { K420261A0: '2026-01-12', K422263A5: '2026-01-29' });
    expect(r.get(1).map(x => x.key + ' ' + x.f)).toEqual(['copy|10-11 scintillator', 'copy|10-11 cpu_sn', 'copy|10-11 main_board_sn', 'copy|10-11 prod_no', 'odd|completed_date completed_date']);
    expect(r.get(2).map(x => x.f)).toEqual(['scintillator', 'cpu_sn', 'main_board_sn', 'prod_no']);   // 출하가 완료일 뒤 → 날짜 문제 없음
  });
  test('완료일이 다르면 행 복사 아님 (CPU 중복만)', () => {
    const A = mk(1, 'Q55180J2CAAA', { scintillator: 'TR0001', cpu_sn: 'C2601-1', main_board_sn: 'M142511A-1', completed_date: '2025-12-16' }), B = mk(2, 'Q55180J2VAAA', { cpu_sn: 'C2601-1', main_board_sn: 'M142511A-1' });
    const r = auditMerge([{ _id: 1, detector_sn: 'D1' }], { D1: A.tft_sn }, { [A.tft_sn]: A }, [A, B]);
    expect(r.get(1).map(x => x.f)).toEqual(['cpu_sn', 'main_board_sn']);
  });
  test.each([['scintillator', 'DRZ-PLUS', '번호 없음'], ['scintillator', 'DRZ-PLUS 224050', '']])('%s %s', (f, v, why) => expect(oddReason(f, v)).toBe(why));
});

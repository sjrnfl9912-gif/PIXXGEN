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
  ])('%s %s', (f, v, why) => expect(oddReason(f, v)).toBe(why));
});

describe('통합취합본 중복', () => {
  const P1 = { tft_sn: 'CJ5180H7FAAA', main_board_sn: 'M172506A-001' }, P2 = { tft_sn: 'CJ51A0K0BAAA', main_board_sn: 'M172506A-001' };
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

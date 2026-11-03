import { normDate, normField } from './date.js';

describe('날짜 입력 정리', () => {
  test.each([
    ['260530', '2026-05-30'], ['20260530', '2026-05-30'], ['2026.05.30', '2026-05-30'], ['2026-05.30', '2026-05-30'],
    ['2026-05-30', '2026-05-30'], ['26/5/30', '2026-05-30'], ['2026. 5. 30.', '2026-05-30'], [' 260101 ', '2026-01-01'],
  ])('%s → %s', (a, b) => expect(normDate(a)).toBe(b));

  test.each(['', '2025', '261330', '260230', 'abc', '2026-05'])('알 수 없는 값은 그대로: %s', bad => expect(normDate(bad)).toBe(bad));

  test('날짜 칸만 정리', () => {
    expect(normField('worker', '260530')).toBe('260530');
    expect(normField('completed_date', '260530')).toBe('2026-05-30');
  });

  test('작업자 다른 이름 → 대표 이름', () => {
    expect(normField('worker', '이형섭')).toBe('이다니엘');
    expect(normField('worker', ' 이형섭 ')).toBe('이다니엘');
    expect(normField('worker', '김남식')).toBe('김남식');
  });
});

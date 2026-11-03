import { snDist, suggestPairs } from './fuzzy.js';

describe('TFT 오기입 추정', () => {
  test('거리', () => {
    expect(snDist('CF415179AAAA', 'CF415179AAA')).toBe(1);      // 한 글자 빠짐
    expect(snDist('T237T338NE02', 'T237T388NE02')).toBe(1);     // 한 글자 바뀜
    expect(snDist('AB12', 'BA12')).toBe(1);                     // 자리 바뀜
    expect(snDist('CJ5170S4DAAA', 'QJ4150P7HAAA')).toBe(3);     // 많이 다름 → cap+1
  });
  test('서로 유일한 짝만 제안', () => {
    const m = suggestPairs(['CF415179AAAA', 'T23AQ448NK02', 'CF4121N5BAAA', 'CF4121N5DAAA'],
                           ['CF415179AAA', 'T23AQ448K02', 'CF4121N5FAAA']);
    expect(m.get('CF415179AAAA')).toEqual({ ledger: 'CF415179AAA', dist: 1 });
    expect(m.get('T23AQ448NK02')).toEqual({ ledger: 'T23AQ448K02', dist: 1 });
    expect(m.has('CF4121N5BAAA')).toBe(false);   // 대장 CF4121N5FAAA에 폴더 두 개가 똑같이 가까움 → 추정 안 함
  });
});

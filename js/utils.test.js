import { searchData, filterData, detectDuplicates } from '../utils.js';

describe('Utils Functions', () => {
  const mockData = [
    { id: 1, company: 'PIXX', mgmt_no: 'A001', detector_sn: 'SN001' },
    { id: 2, company: 'PRUDENT', mgmt_no: 'A002', detector_sn: 'SN002' },
    { id: 3, company: 'PIXX', mgmt_no: 'A003', detector_sn: 'SN001' }, // 중복
  ];

  test('searchData로 회사명 검색', () => {
    const result = searchData(mockData, 'PIXX', ['company']);
    expect(result).toHaveLength(2);
    expect(result[0].company).toBe('PIXX');
  });

  test('searchData로 S/N 검색', () => {
    const result = searchData(mockData, 'SN001', ['detector_sn']);
    expect(result).toHaveLength(2);
  });

  test('filterData로 필터링', () => {
    const result = filterData(mockData, 'PIXX', 'company');
    expect(result).toHaveLength(2);
  });

  test('detectDuplicates로 중복 감지', () => {
    const result = detectDuplicates(mockData, 'detector_sn');
    expect(result).toHaveLength(2); // SN001 2개
  });

  test('searchData - 빈 쿼리는 전체 반환', () => {
    const result = searchData(mockData, '', ['company']);
    expect(result).toHaveLength(3);
  });

  test('filterData - "all"은 전체 반환', () => {
    const result = filterData(mockData, 'all', 'company');
    expect(result).toHaveLength(3);
  });
});

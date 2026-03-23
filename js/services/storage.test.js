import { saveCache, loadCache, clearCache } from '../services/storage.js';

describe('Storage Service', () => {
  const mockShipData = [
    { _id: 'ship_1', mgmt_no: 'A001', product_name: '상품1' },
  ];
  const mockProdData = [
    { _id: 'prod_1', prod_no: 'P001', tft_sn: 'TFT001' },
  ];

  afterEach(() => {
    clearCache();
  });

  test('saveCache - 데이터 저장', () => {
    saveCache(mockShipData, mockProdData);
    const stored = localStorage.getItem('cache_shipment');
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored)).toHaveLength(1);
  });

  test('loadCache - 데이터 로드', () => {
    saveCache(mockShipData, mockProdData);
    const { ship, prod } = loadCache();
    expect(ship).toHaveLength(1);
    expect(prod).toHaveLength(1);
  });

  test('loadCache - 빈 캐시 처리', () => {
    clearCache();
    const { ship, prod } = loadCache();
    expect(ship).toHaveLength(0);
    expect(prod).toHaveLength(0);
  });

  test('clearCache - 모든 데이터 삭제', () => {
    saveCache(mockShipData, mockProdData);
    clearCache();
    const { ship, prod } = loadCache();
    expect(ship).toHaveLength(0);
    expect(prod).toHaveLength(0);
  });
});

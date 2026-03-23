import { getSupabase } from '../config.js';
import { SHIP_FIELDS, PROD_FIELDS } from '../config.js';
import { saveCache } from '../services/storage.js';
import { showLoading, toast } from '../services/ui.js';

export async function loadAllData() {
  try {
    showLoading(true);
    
    const supabase = getSupabase();
    if (!supabase) {
      console.error('Supabase 클라이언트 없음');
      toast('Supabase 연결 실패', 'er');
      showLoading(false);
      return { shipD: [], prodD: [] };
    }

    console.log('DB에서 데이터 로드 중...');

    // 타임아웃 설정 (20초)
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('DB 연결 타임아웃')), 20000)
    );

    // 페이지네이션: 한 번에 1000개씩 로드
    const loadAllPages = async (table) => {
      let allData = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const start = page * 1000;
        const end = start + 999;
        const { data, error } = await table.select('*').range(start, end);
        
        if (error) throw error;
        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allData = allData.concat(data);
          page++;
        }
      }
      return allData;
    };

    const [shipmentData, productionData] = await Promise.race([
      Promise.all([
        loadAllPages(supabase.from('shipment')),
        loadAllPages(supabase.from('production'))
      ]),
      timeout
    ]);

    console.log('Shipment:', shipmentData.length, 'rows');
    console.log('Production:', productionData.length, 'rows');

    const shipD = shipmentData.map((r) => ({
      _id: `ship_${r.id}`,
      _new: false,
      ...r,
    }));

    const prodD = productionData.map((r) => ({
      _id: `prod_${r.id}`,
      _new: false,
      ...r,
    }));

    console.log(`✅ DB 로드 완료: 출하 ${shipD.length}건, 생산 ${prodD.length}건`);
    saveCache(shipD, prodD);
    showLoading(false);
    return { shipD, prodD };
  } catch (error) {
    console.error('DB 로드 실패:', error);
    toast('데이터 로드 실패: ' + error.message, 'er');
    showLoading(false);
    return { shipD: [], prodD: [] };
  }
}

export function createNewRow(type) {
  const id = `new_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const fields = type === 'ship' ? SHIP_FIELDS : PROD_FIELDS;
  const row = { _id: id, _new: true };
  fields.forEach((f) => {
    row[f] = '';
  });
  return row;
}

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

    // 타임아웃 설정 (10초)
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('DB 연결 타임아웃')), 10000)
    );

    const shipmentPromise = supabase.from('shipment').select('*').limit(1000);
    const productionPromise = supabase.from('production').select('*').limit(1000);

    const [shipmentRes, productionRes] = await Promise.race([
      Promise.all([shipmentPromise, productionPromise]),
      timeout
    ]);

    console.log('Shipment:', shipmentRes.data?.length, 'rows');
    console.log('Production:', productionRes.data?.length, 'rows');

    const shipmentData = shipmentRes.data || [];
    const productionData = productionRes.data || [];

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

import { dbFetchAll } from '../db.js';
import { SHIP_FIELDS, PROD_FIELDS } from '../config.js';
import { saveCache } from './storage.js';
import { showLoading, toast } from './ui.js';

export async function loadAllData() {
  try {
    showLoading(true);
    const [shipmentData, productionData] = await Promise.all([
      dbFetchAll('shipment'),
      dbFetchAll('production'),
    ]);

    // Add metadata
    const shipD = shipmentData.map((r, i) => ({
      _id: `ship_${r.id}`,
      _new: false,
      ...r,
    }));

    const prodD = productionData.map((r, i) => ({
      _id: `prod_${r.id}`,
      _new: false,
      ...r,
    }));

    saveCache(shipD, prodD);
    showLoading(false);
    return { shipD, prodD };
  } catch (error) {
    console.error('Failed to load data:', error);
    showLoading(false);
    toast('데이터 로드 실패: ' + error.message, 'er');
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

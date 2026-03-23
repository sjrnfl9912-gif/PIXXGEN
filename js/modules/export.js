// ═══════════════════════════════════════
// EXPORT (Backup JSON + Excel)
// ═══════════════════════════════════════
import { SHIP_FIELDS, SHIP_HEADS, PROD_FIELDS, PROD_HEADS } from '../config.js';
import { state } from '../state.js';
import { toast } from '../services/ui.js';

export function backupJSON() {
  const data = {
    version: 1,
    date: new Date().toISOString(),
    shipment: state.shipD.map(r => { const o = { ...r }; delete o._id; delete o._new; return o; }),
    production: state.prodD.map(r => { const o = { ...r }; delete o._id; delete o._new; return o; })
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download = '출하관리_백업_' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + '.json';
  a.click(); URL.revokeObjectURL(a.href);
  toast('백업 파일 다운로드 (출하 ' + state.shipD.length + ' / 생산 ' + state.prodD.length + ')', 'ok');
}

export function restoreJSON(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.shipment || !data.production) throw new Error('잘못된 백업 파일');
      import('../services/ui.js').then(ui => {
        ui.customConfirm('백업 복원 (' + data.date + ')\n출하 ' + data.shipment.length + '건 / 생산 ' + data.production.length + '건\n현재 데이터를 덮어씁니다.', () => {
          state.shipD = data.shipment.map((r, i) => ({ ...r, _id: 'restore_' + i }));
          state.prodD = data.production.map((r, i) => ({ ...r, _id: 'restore_prod_' + i }));
          import('../state.js').then(s => s.rebuildTft());
          import('./table.js').then(t => t.renderAll());
          import('../services/storage.js').then(st => st.saveCache(state.shipD, state.prodD));
          toast('복원 완료', 'ok');
        });
      });
    } catch (err) { toast('복원 실패: ' + err.message, 'er'); }
  };
  reader.readAsText(file);
  input.value = '';
}

export function exportAll() {
  if (typeof XLSX === 'undefined') { toast('XLSX 라이브러리 로드 실패', 'er'); return; }
  const wb = XLSX.utils.book_new();
  // Shipment sheet
  const s1 = XLSX.utils.aoa_to_sheet([SHIP_HEADS.map(h => h.replace(/\n/g, ' ')), ...state.shipD.map(r => SHIP_FIELDS.map(f => r[f]))]);
  s1['!cols'] = SHIP_HEADS.map(() => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(wb, s1, '검사포장 출하이력');
  // Production sheet
  const s2 = XLSX.utils.aoa_to_sheet([PROD_HEADS.map(h => h.replace(/\n/g, ' ')), ...state.prodD.map(r => PROD_FIELDS.map(f => r[f]))]);
  s2['!cols'] = PROD_HEADS.map(() => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(wb, s2, '생산관리대장');
  // Merge sheet
  const mh = [...SHIP_HEADS, 'TFT S/N(생산)', 'Scintillator', 'CPU S/N', 'BOARD S/N', 'BOARD VER', '중판', '제작완료일', 'F/W(생산)', 'MICOM', 'BAT MICOM', '작업자', 'AED S/N', '비고1', '비고'].map(h => h.replace(/\n/g, ' '));
  const PROD_VL_FIELDS = ['tft_sn', 'scintillator', 'cpu_sn', 'main_board_sn', 'main_board_ver', 'panel_type', 'completed_date', 'detector_fw', 'micom_ver', 'bat_micom_ver', 'worker', 'aed_sn', 'note1', 'note2'];
  const mr = state.mergeD.map(r => { const p = state.tftMap[r.tft_sn] || {}; return [...SHIP_FIELDS.map(f => r[f]), ...PROD_VL_FIELDS.map(f => p[f])]; });
  const s3 = XLSX.utils.aoa_to_sheet([mh, ...mr]); s3['!cols'] = mh.map(() => ({ wch: 14 }));
  XLSX.utils.book_append_sheet(wb, s3, '통합취합본');
  const d = new Date();
  XLSX.writeFile(wb, '출하관리_' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.xlsx');
  toast('엑셀 다운로드 완료', 'ok');
}

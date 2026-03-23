import { showLoading, toast } from '../services/ui.js';

export function backupJSON(shipD, prodD) {
  const data = {
    version: 1,
    date: new Date().toISOString(),
    shipment: shipD.map((r) => {
      const o = { ...r };
      delete o._id;
      delete o._new;
      return o;
    }),
    production: prodD.map((r) => {
      const o = { ...r };
      delete o._id;
      delete o._new;
      return o;
    }),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download =
    '출하관리_백업_' +
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') +
    '_' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('백업 파일 다운로드 (출하 ' + shipD.length + ' / 생산 ' + prodD.length + ')', 'ok');
}

export function exportToExcel(data, filename) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename);
  toast('엑셀 파일 다운로드 완료', 'ok');
}

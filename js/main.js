import { loadAllData, createNewRow } from './modules/data.js';
import { renderShipmentTable, renderProductionTable } from './modules/table.js';
import { backupJSON, exportToExcel } from './modules/export.js';
import { loadCache, saveCache } from './services/storage.js';
import { toast, customConfirm, debounce, getElement, showLoading } from './services/ui.js';
import { debounceSearch, detectDuplicates, filterData, searchData } from './utils.js';

// ═══ STATE ═══
let shipD = [],
  prodD = [],
  mergeD = [];
let curTab = 'ship',
  shipFilt = 'all',
  workerFilt = 'all';
let shipShownDup = false,
  prodShownDup = false;

// ═══ GITHUB PAGES 감지 ═══
const isGitHubPages = window.location.hostname.includes('github.io');

// ═══ EVENT SETUP ═══
async function init() {
  try {
    if (isGitHubPages) {
      // GitHub Pages: 더미 데이터 사용
      console.log('🌐 GitHub Pages 감지: 더미 데이터 사용');
      shipD = [
        { _id: 'dummy_1', mgmt_no: 'A001', product_name: 'PRUDENT_O_171TW', mfg_date: '2026-01-02', planned_ship_date: '2026-01-12', warranty: '1년', country: 'India', usage_type: '의료', company: 'PRUDENT', detector_sn: 'SN001', cbbox_sn: 'CB001', cbbox_ver: 'V1.0', detector_fw: 'FW1.2', manager_info: '홍길동', zview_sw: 'SW1.0', tft_sn: 'TFT001' },
        { _id: 'dummy_2', mgmt_no: 'A002', product_name: 'PIXX_O_171TW', mfg_date: '2026-01-03', planned_ship_date: '2026-01-13', warranty: '2년', country: 'Korea', usage_type: '산업', company: 'PIXX', detector_sn: 'SN002', cbbox_sn: 'CB002', cbbox_ver: 'V1.1', detector_fw: 'FW1.3', manager_info: '김영희', zview_sw: 'SW1.1', tft_sn: 'TFT002' }
      ];
      prodD = [
        { _id: 'dummy_3', prod_no: 'P001', tft_sn: 'TFT001', scintillator: 'CsI', cpu_sn: 'CPU001', main_board_sn: 'MB001', main_board_ver: 'V1', panel_type: 'A', completed_date: '2026-01-02', detector_fw: 'FW1.2', micom_ver: 'V1.0', bat_micom_ver: 'V0.9', worker: '홍승범', aed_sn: 'AED001', note1: '', note2: '' },
        { _id: 'dummy_4', prod_no: 'P002', tft_sn: 'TFT002', scintillator: 'Gd2O2S', cpu_sn: 'CPU002', main_board_sn: 'MB002', main_board_ver: 'V1.1', panel_type: 'B', completed_date: '2026-01-03', detector_fw: 'FW1.3', micom_ver: 'V1.1', bat_micom_ver: 'V1.0', worker: '김남식', aed_sn: 'AED002', note1: '테스트', note2: '' }
      ];
    } else {
      // 로컬: 실제 DB 연동
      console.log('💻 로컬 환경 감지: DB 연동');
      const { shipD: s, prodD: p } = await loadAllData();
      shipD = s;
      prodD = p;
    }
  } catch (error) {
    console.error('데이터 로드 실패:', error);
    toast('데이터 로드 실패', 'er');
  }

  // Tab navigation
  document.querySelectorAll('.tab[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('on'));
      document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));
      tab.classList.add('on');
      document.getElementById('v-' + tab.dataset.tab).classList.add('active');
      curTab = tab.dataset.tab;
      renderAll();
    });
  });

  // Filter buttons
  document.querySelectorAll('[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll(`[data-filter][data-table="${chip.dataset.table}"]`).forEach((c) => c.classList.remove('on'));
      chip.classList.add('on');
      if (chip.dataset.table === 'ship') {
        shipFilt = chip.dataset.filter;
      } else {
        workerFilt = chip.dataset.filter;
      }
      renderAll();
    });
  });

  // Search boxes
  const dR1 = debounceSearch(() => renderAll(), 200);
  const dR2 = debounceSearch(() => renderAll(), 200);
  const dR3 = debounceSearch(() => renderAll(), 200);

  getElement('q1').addEventListener('input', (e) => {
    getElement('sb1').classList.toggle('has-val', !!e.target.value);
    dR1();
  });

  getElement('q2').addEventListener('input', (e) => {
    getElement('sb2').classList.toggle('has-val', !!e.target.value);
    dR2();
  });

  getElement('q3').addEventListener('input', (e) => {
    getElement('sb3').classList.toggle('has-val', !!e.target.value);
    dR3();
  });

  // Clear buttons
  document.querySelectorAll('.s-clear').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      input.value = '';
      input.parentElement.classList.remove('has-val');
      renderAll();
    });
  });

  // Main buttons
  getElement('saveBtn').addEventListener('click', () => toast('저장 기능 준비 중', 'info'));
  getElement('backupBtn').addEventListener('click', () => backupJSON(shipD, prodD));
  getElement('reloadBtn').addEventListener('click', init);
  getElement('exportBtn').addEventListener('click', () => {
    const data = curTab === 'ship' ? shipD : curTab === 'prod' ? prodD : mergeD;
    exportToExcel(data, `${curTab}_export.xlsx`);
  });

  getElement('restoreBtn').addEventListener('click', () => {
    getElement('restoreFile').click();
  });

  // Add row buttons
  document.querySelectorAll('[data-table]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.table;
      const arr = type === 'ship' ? shipD : prodD;
      arr.push(createNewRow(type));
      saveCache(shipD, prodD);
      renderAll();
      toast('새 행이 추가되었습니다', 'info');
    });
  });

  showLoading(false);
  renderAll();
  toast(isGitHubPages ? 'GitHub Pages 준비 완료' : 'DB 연동 완료', 'ok');
}

function renderAll() {
  const q1 = getElement('q1').value;
  const q2 = getElement('q2').value;
  const q3 = getElement('q3').value;

  const shipFiltered = filterData(shipD, shipFilt, 'company');
  const shipSearched = searchData(shipFiltered, q1, ['mgmt_no', 'product_name', 'detector_sn']);

  const prodFiltered = filterData(prodD, workerFilt, 'worker');
  const prodSearched = searchData(prodFiltered, q2, ['prod_no', 'tft_sn', 'cpu_sn']);

  renderShipmentTable(shipSearched);
  renderProductionTable(prodSearched);

  getElement('cnt1').textContent = shipSearched.length;
  getElement('cnt2').textContent = prodSearched.length;
  getElement('p1').textContent = shipSearched.length + '건';
  getElement('p2').textContent = prodSearched.length + '건';
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

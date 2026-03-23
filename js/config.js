// Supabase 라이브러리는 HTML의 <script> 태그에서 전역으로 로드됨
// window.supabase를 직접 사용합니다

export const SB_URL = 'https://arfytjlszyztmeycoeqk.supabase.co';
export const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyZnl0amxzenl6dG1leWNvZXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MjU2NDMsImV4cCI6MjA4OTMwMTY0M30.dkhBveG0eP3Tggl6kSwKYZf_waXbcJ5MMVGFoq44kb8';

// supabase 전역 객체를 export (HTML 로드 완료 후 사용)
export const getSupabase = () => {
  if (!window.supabase) {
    console.error('Supabase 라이브러리가 로드되지 않았습니다');
    return null;
  }
  // 처음 한 번만 초기화
  if (!window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);
  }
  return window.supabaseClient;
};

export const supabase = getSupabase();

// Table schemas
export const SHIP_FIELDS = ['row_no', 'mgmt_no', 'product_name', 'mfg_date', 'planned_ship_date', 'warranty', 'country', 'usage_type', 'company', 'detector_sn', 'cbbox_sn', 'cbbox_ver', 'detector_fw', 'manager_info', 'zview_sw', 'tft_sn'];
export const SHIP_HEADS = ['NO', '관리\n번호', '품명', '제조\n년월일', '예상\n출하일', 'Warranty', '국가', '구분', '업체 &\n병원명', '디텍터\nS/N', 'CB BOX\nS/N', 'CB BOX\nVER.', 'DETECTOR\nF/W', 'MANAGER', 'ZVIEW\nS/W', 'TFT\nS/N'];

export const PROD_FIELDS = ['prod_no', 'tft_sn', 'scintillator', 'cpu_sn', 'main_board_sn', 'main_board_ver', 'panel_type', 'completed_date', 'detector_fw', 'micom_ver', 'bat_micom_ver', 'worker', 'aed_sn', 'note1', 'note2'];
export const PROD_HEADS = ['생산번호', 'TFT\nS/N', 'Scintillator\nTYPE', 'CPU\nS/N', 'MAIN BOARD\nS/N', 'MAIN BOARD\nVER', '중판\nTYPE', '완제품\n제작완료일', 'DETECTOR\nF/W', 'MICOM\nVER.', 'BAT MICOM\nVER.', '작업자', 'AED\nS/N', '비고 1', '비고'];

export const MERGE_HEADS = [...SHIP_HEADS, 'TFT S/N\n(생산)', 'Scintillator\nTYPE', 'CPU\nS/N', 'BOARD\nS/N', 'BOARD\nVER', '중판\nTYPE', '제작\n완료일', 'F/W\n(생산)', 'MICOM\nVER.', 'BAT MICOM\nVER.', '작업자', 'AED\nS/N', '비고 1', '비고'];
export const MERGE_VC_START = 16;

export const CACHE_KEY_SHIP = 'cache_shipment';
export const CACHE_KEY_PROD = 'cache_production';
export const CACHE_KEY_TS = 'cache_timestamp';

// ═══════════════════════════════════════
// MERGE (Shipment + Production via TFT S/N)
// ═══════════════════════════════════════
import { state, rebuildTft, rebuildDetTft } from '../state.js';
import { renderAll } from './table.js';
import { toast } from '../services/ui.js';

export function buildMerge() {
  rebuildTft();
  rebuildDetTft();
  // shipD를 그대로 참조 — 출하 데이터를 한 벌 더 복사하지 않음.
  // merge 탭의 출하 필드 편집은 동일 객체라 출하 탭에도 그대로 반영됨.
  state.mergeD = state.shipD;
  renderAll();
  toast('취합본 생성 (' + state.mergeD.length + '건)', 'ok');
}

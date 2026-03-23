// ═══════════════════════════════════════
// MERGE (Shipment + Production via TFT S/N)
// ═══════════════════════════════════════
import { state, rebuildTft } from '../state.js';
import { renderAll } from './table.js';
import { toast } from '../services/ui.js';

export function buildMerge() {
  rebuildTft();
  state.mergeD = state.shipD.map(r => ({ ...r }));
  renderAll();
  toast('취합본 생성 (' + state.mergeD.length + '건)', 'ok');
}

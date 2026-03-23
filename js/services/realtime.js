// ═══════════════════════════════════════
// SUPABASE REALTIME SYNC
// ═══════════════════════════════════════
import { getSupabase } from '../config.js';
import { state, markDupDirty } from '../state.js';
import { renderAll } from '../modules/table.js';
import { saveCache } from './storage.js';

function rtHandle(arr, p) {
  if (p.eventType === 'INSERT') { if (!arr.find(r => r._id === p.new.id)) { p.new._id = p.new.id; arr.push(p.new); } }
  else if (p.eventType === 'UPDATE') { const i = arr.findIndex(r => r._id === p.new.id); if (i >= 0) { p.new._id = p.new.id; arr[i] = p.new; } }
  else if (p.eventType === 'DELETE') { const i = arr.findIndex(r => r._id === p.old.id); if (i >= 0) arr.splice(i, 1); }
  markDupDirty(); saveCache(state.shipD, state.prodD);
}

export function initRealtime() {
  const sb = getSupabase(); if (!sb) return;
  try {
    sb.channel('rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipment' }, p => { rtHandle(state.shipD, p); renderAll(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production' }, p => { rtHandle(state.prodD, p); import('../state.js').then(s => s.rebuildTft()); renderAll(); })
      .subscribe();
  } catch (e) {
    console.warn('Realtime subscription failed:', e);
  }
}

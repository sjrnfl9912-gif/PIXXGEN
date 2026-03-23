import { supabase } from './config.js';

export async function dbInsert(table, data) {
  const { data: row, error } = await supabase.from(table).insert(data).select().single();
  if (error) {
    console.error(`Insert failed on ${table}:`, error);
    return null;
  }
  return row;
}

export async function dbBulkInsert(table, arr) {
  if (arr.length === 0) return [];
  const { data: rows, error } = await supabase.from(table).insert(arr).select();
  if (error) {
    console.error(`Bulk insert failed on ${table}:`, error);
    return [];
  }
  return rows || [];
}

export async function dbUpdate(table, id, data) {
  const { data: row, error } = await supabase
    .from(table)
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error(`Update failed on ${table}:`, error);
    return null;
  }
  return row;
}

export async function dbBulkUpdate(table, updates) {
  if (updates.length === 0) return [];
  const results = [];
  for (const { id, data } of updates) {
    const result = await dbUpdate(table, id, data);
    if (result) results.push(result);
  }
  return results;
}

export async function dbDelete(table, ids) {
  const { error } = await supabase.from(table).delete().in('id', ids);
  if (error) {
    console.error(`Delete failed on ${table}:`, error);
    return false;
  }
  return true;
}

export async function dbFetchAll(table) {
  let all = [],
    from = 0,
    size = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id')
      .range(from, from + size - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    all = all.concat(data);
    if (data.length < size) break;
    from += size;
  }
  return all;
}

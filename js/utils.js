// ═══ Utilities ═══
export function debounceSearch(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

export function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function detectDuplicates(data, field) {
  const seen = {};
  const dups = [];
  data.forEach((row) => {
    const val = row[field];
    if (val) {
      if (seen[val]) {
        seen[val].push(row);
      } else {
        seen[val] = [row];
      }
    }
  });
  Object.values(seen).forEach((group) => {
    if (group.length > 1) {
      dups.push(...group);
    }
  });
  return dups;
}

export function filterData(data, filterValue, filterField) {
  if (filterValue === 'all') return data;
  return data.filter((row) => row[filterField] === filterValue);
}

export function searchData(data, query, searchFields) {
  if (!query) return data;
  const q = query.toLowerCase();
  return data.filter((row) => searchFields.some((field) => String(row[field] || '').toLowerCase().includes(q)));
}

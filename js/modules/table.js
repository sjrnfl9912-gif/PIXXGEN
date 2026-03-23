import { SHIP_FIELDS, PROD_FIELDS, SHIP_HEADS, PROD_HEADS, MERGE_HEADS, MERGE_VC_START } from '../config.js';

export function renderTable(tableId, headId, bodyId, data, fields, heads) {
  const thead = document.getElementById(headId);
  const tbody = document.getElementById(bodyId);

  // Clear
  thead.innerHTML = '';
  tbody.innerHTML = '';

  // Header
  const headerRow = document.createElement('tr');
  heads.forEach((h) => {
    const th = document.createElement('th');
    th.className = 'al';
    th.innerHTML = h.replace(/\n/g, '<br>');
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  // Body
  data.forEach((row, i) => {
    const tr = document.createElement('tr');
    fields.forEach((field) => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.className = 'c';
      input.type = 'text';
      input.value = row[field] || '';
      input.dataset.field = field;
      input.dataset.rowId = row._id;
      td.appendChild(input);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

export function renderShipmentTable(data) {
  renderTable('t1', 'th1', 'b1', data, SHIP_FIELDS, SHIP_HEADS);
}

export function renderProductionTable(data) {
  renderTable('t2', 'th2', 'b2', data, PROD_FIELDS, PROD_HEADS);
}

export function renderMergeTable(mergedData) {
  const thead = document.getElementById('th3');
  const tbody = document.getElementById('b3');

  thead.innerHTML = '';
  tbody.innerHTML = '';

  const headerRow = document.createElement('tr');
  MERGE_HEADS.forEach((h) => {
    const th = document.createElement('th');
    th.className = 'al';
    th.innerHTML = h.replace(/\n/g, '<br>');
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  mergedData.forEach((row) => {
    const tr = document.createElement('tr');
    Object.values(row).forEach((value) => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.className = 'c vl';
      input.readOnly = true;
      input.type = 'text';
      input.value = value || '';
      td.appendChild(input);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

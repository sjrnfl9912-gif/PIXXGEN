// ═══════════════════════════════════════
// COLUMN RESIZE
// ═══════════════════════════════════════

export function initResize(tbId) {
  const tb = document.getElementById(tbId); if (!tb) return;
  const table = tb.closest('table'); if (!table) return;
  table.querySelectorAll('thead tr:last-child th').forEach(th => {
    if (th.querySelector('.resizer')) return;
    const r = document.createElement('div'); r.className = 'resizer';
    th.style.position = 'relative'; th.appendChild(r);

    // Double-click to auto-fit
    r.addEventListener('dblclick', e => {
      e.stopPropagation();
      const idx = [...th.parentElement.children].indexOf(th);
      const canvas = document.createElement('canvas'), ctx2 = canvas.getContext('2d');
      ctx2.font = '10.5px "Noto Sans KR"';
      let mw = ctx2.measureText(th.innerText).width + 16;
      table.querySelectorAll('tbody tr').forEach(tr => {
        const td = tr.children[idx]; if (!td) return;
        const inp = td.querySelector('input');
        const w = ctx2.measureText(inp ? inp.value : td.innerText || '').width + 20;
        if (w > mw) mw = w;
      });
      const nw = Math.max(30, Math.min(400, Math.ceil(mw)));
      th.style.width = th.style.minWidth = th.style.maxWidth = nw + 'px';
      table.querySelectorAll('tbody tr').forEach(tr => {
        const td = tr.children[idx]; if (td) td.style.width = td.style.minWidth = td.style.maxWidth = nw + 'px';
      });
    });

    // Drag to resize
    let sx, sw;
    r.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      sx = e.pageX; sw = th.offsetWidth; r.classList.add('on');
      const idx = [...th.parentElement.children].indexOf(th);
      const onM = e2 => {
        const nw = Math.max(30, sw + (e2.pageX - sx));
        th.style.width = th.style.minWidth = th.style.maxWidth = nw + 'px';
        table.querySelectorAll('tbody tr').forEach(tr => {
          const td = tr.children[idx]; if (td) td.style.width = td.style.minWidth = td.style.maxWidth = nw + 'px';
        });
      };
      const onU = () => { r.classList.remove('on'); document.removeEventListener('mousemove', onM); document.removeEventListener('mouseup', onU); };
      document.addEventListener('mousemove', onM);
      document.addEventListener('mouseup', onU);
    });
  });
}

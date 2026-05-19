// ══════════════════════════════════════════════════════════════════════
// ESTADÍSTICA — reportes cruzados (porteado del RESUMEN/ESTADISTICA del Excel)
// Sub-tabs: Por escuela · Histórico · Inventario (pendiente) · Costos (pendiente)
// ══════════════════════════════════════════════════════════════════════

let estSubActual = 'escuela';

function initEstadistica() {
  switchSubEst(estSubActual || 'escuela');
}

function switchSubEst(sub) {
  estSubActual = sub;
  const subs = ['escuela', 'historico', 'inventario', 'costos'];
  subs.forEach(s => {
    const btn = document.getElementById('est-sub-' + s);
    if (btn) {
      btn.classList.toggle('btn-primary', s === sub);
      btn.classList.toggle('btn-ghost', s !== sub);
    }
    const view = document.getElementById('est-sub-' + s + '-view');
    if (view) view.style.display = (s === sub) ? '' : 'none';
  });

  if (sub === 'escuela' && typeof initResumenEscuela === 'function') {
    initResumenEscuela();
  } else if (sub === 'historico' && typeof initHistorico === 'function') {
    initHistorico();
  } else if (sub === 'inventario' && typeof initInventario === 'function') {
    initInventario();
  } else if (sub === 'costos' && typeof initCostos === 'function') {
    initCostos();
  }
}

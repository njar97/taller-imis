// ══════════════════════════════════════════════════════════════════════
// ESTADÍSTICA — reportes cruzados (porteado del RESUMEN/ESTADISTICA del Excel)
// Reingeniería v32: "Por talla" es el reporte central (abre por defecto).
// El resto (Por escuela · Histórico · Costos · Yardaje · Contratos) vive en
// el cajón "Más reportes ▾". Inventario se eliminó (redundante con Por talla)
// y Tallas críticas se fusionó en Por talla como el toggle "🔥 Solo críticas".
// ══════════════════════════════════════════════════════════════════════

let estSubActual = 'tallas';

// Etiquetas para el resumen del cajón "Más reportes"
const EST_SUB_LABELS = {
  escuela:   '🏫 Por escuela',
  historico: '📈 Histórico',
  costos:    '💰 Costos',
  yardaje:   '📐 Yardaje',
  contratos: '📑 Contratos',
};

function initEstadistica() {
  switchSubEst(estSubActual || 'tallas');
}

function switchSubEst(sub) {
  estSubActual = sub;
  const subs = ['tallas', 'escuela', 'historico', 'costos', 'yardaje', 'contratos'];
  subs.forEach(s => {
    const view = document.getElementById('est-sub-' + s + '-view');
    if (view) view.style.display = (s === sub) ? '' : 'none';
  });

  // El botón "Por talla" se marca activo solo cuando es el reporte visible.
  const btnTallas = document.getElementById('est-nav-tallas');
  if (btnTallas) {
    btnTallas.classList.toggle('btn-primary', sub === 'tallas');
    btnTallas.classList.toggle('btn-ghost', sub !== 'tallas');
  }

  // Cajón "Más reportes": cerrar al elegir y reflejar el reporte activo en el
  // summary (ej. "📂 Histórico ▾") para que se vea qué hay seleccionado.
  const det = document.getElementById('est-mas-reportes');
  const sum = document.getElementById('est-mas-reportes-summary');
  if (det) det.open = false;
  if (sum) {
    sum.innerHTML = (sub !== 'tallas' && EST_SUB_LABELS[sub])
      ? `📂 ${EST_SUB_LABELS[sub]} ▾`
      : '📂 Más reportes ▾';
  }

  if (sub === 'tallas' && typeof initTallasResumen === 'function') {
    initTallasResumen();
  } else if (sub === 'escuela' && typeof initResumenEscuela === 'function') {
    initResumenEscuela();
  } else if (sub === 'historico' && typeof initHistorico === 'function') {
    initHistorico();
  } else if (sub === 'costos' && typeof initCostos === 'function') {
    initCostos();
  } else if (sub === 'yardaje' && typeof initYardaje === 'function') {
    initYardaje();
  } else if (sub === 'contratos' && typeof initContratos === 'function') {
    initContratos();
  }
}

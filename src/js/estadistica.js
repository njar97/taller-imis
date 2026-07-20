// ══════════════════════════════════════════════════════════════════════
// ESTADÍSTICA — reportes cruzados (porteado del RESUMEN/ESTADISTICA del Excel)
// Reingeniería v32: solo 2 reportes.
//   · 📊 Por talla  — central, abre por defecto (con toggle 🔥 Solo críticas).
//   · 📋 Por escuela — fusión de Tallaje + Contrato + Tela/Yardaje.
// Inventario y Tallas críticas se fusionaron en Por talla.
// Histórico y Costos se movieron a la pestaña Config.
// ══════════════════════════════════════════════════════════════════════

let estSubActual = 'tallas';

function initEstadistica() {
  switchSubEst(estSubActual || 'tallas');
}

function switchSubEst(sub) {
  estSubActual = sub;
  const subs = ['tallas', 'escuela', 'pronostico'];
  subs.forEach(s => {
    const view = document.getElementById('est-sub-' + s + '-view');
    if (view) view.style.display = (s === sub) ? '' : 'none';
    const btn = document.getElementById('est-nav-' + s);
    if (btn) {
      btn.classList.toggle('btn-primary', s === sub);
      btn.classList.toggle('btn-ghost', s !== sub);
    }
  });

  if (sub === 'tallas' && typeof initTallasResumen === 'function') {
    initTallasResumen();
  } else if (sub === 'escuela' && typeof initEstEscuela === 'function') {
    initEstEscuela();
  } else if (sub === 'pronostico' && typeof initPronostico === 'function') {
    initPronostico();
  }
}

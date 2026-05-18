// ══════════════════════════════════════════════════════════════════════
// CORTE — tab unificado de Nuevo (Trazo/Tendido/Bulto) + Historial
// ══════════════════════════════════════════════════════════════════════

let corteSubActual = 'nuevo';

function initCorte() {
  // Si veníamos de otra sub-tab, dejarla. Si es la primera entrada, 'nuevo'.
  switchSubCorte(corteSubActual || 'nuevo');
}

function switchSubCorte(sub) {
  corteSubActual = sub;
  const subs = ['nuevo', 'trazos', 'tendidos', 'bultos'];
  subs.forEach(s => {
    const btn = document.getElementById('corte-sub-' + s);
    if (btn) {
      btn.classList.toggle('btn-primary', s === sub);
      btn.classList.toggle('btn-ghost', s !== sub);
    }
  });

  const nuevoView = document.getElementById('corte-sub-nuevo-view');
  const listaView = document.getElementById('corte-sub-lista-view');
  if (!nuevoView || !listaView) return;

  if (sub === 'nuevo') {
    nuevoView.style.display = '';
    listaView.style.display = 'none';
    return;
  }

  // sub ∈ {trazos, tendidos, bultos}
  nuevoView.style.display = 'none';
  listaView.style.display = '';

  const titulos = { trazos: '✂️ Trazos', tendidos: '📋 Tendidos', bultos: '📦 Bultos' };
  const tipos   = { trazos: 'trazo',     tendidos: 'tendido',     bultos: 'bulto' };
  const tit = document.getElementById('corte-lista-titulo');
  if (tit) tit.textContent = titulos[sub] || '';

  // Reutilizamos historial.js: renderea dentro de #historial-content.
  // Como ese div vive en otra view, lo puenteamos creando el div temporal.
  const cont = document.getElementById('corte-lista-content');
  if (cont) {
    cont.innerHTML = '<div id="historial-content"><div class="loading">Cargando...</div></div>';
  }
  if (typeof cargarHistorial === 'function') cargarHistorial(tipos[sub]);
}

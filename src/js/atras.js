// ══════════════════════════════════════════════════════════════════════
// BOTÓN ATRÁS DEL CELULAR
// Sin esto, atrás sacaba de la app. Ahora, en orden:
//   1. si hay una ventana (.modal) abierta, la cierra;
//   2. si no, vuelve a la pantalla anterior;
//   3. si no hay anterior y no está en Inicio, va a Inicio;
//   4. en Inicio, sale de la app.
// Se deja siempre una entrada «trampa» en el historial para atrapar el atrás.
// ══════════════════════════════════════════════════════════════════════
const _atras = { armado: false, volviendo: false, pila: [] };
const _VISTAS_IRA = ['trazo', 'tendido', 'bulto'];

function _atrasVistaActiva() {
  const v = document.querySelector('.view.active');
  return v ? v.id.replace(/^view-/, '') : null;
}

function _atrasArmar() {
  if (_atras.armado) return;
  try { window.history.pushState({ atras: 1 }, ''); _atras.armado = true; } catch (e) { /* sin historial */ }
}

function _atrasRecordar(destino) {
  if (_atras.volviendo) return;
  const actual = _atrasVistaActiva();
  if (!actual || actual === destino) return;
  _atras.pila.push(actual);
  if (_atras.pila.length > 30) _atras.pila.shift();
}

// Envolver la navegación para recordar de dónde se vino.
const _atrasSwitchTabOrig = switchTab;
switchTab = function (tab, el) {
  _atrasRecordar(tab);
  return _atrasSwitchTabOrig(tab, el);
};
const _atrasIrAOrig = irA;
irA = function (seccion) {
  _atrasRecordar(seccion);
  return _atrasIrAOrig(seccion);
};

function _atrasIr(vista) {
  _atras.volviendo = true;
  try {
    if (_VISTAS_IRA.includes(vista)) { irA(vista); return; }
    const tab = [...document.querySelectorAll('.nav-tab')]
      .find(t => (t.getAttribute('onclick') || '').includes("'" + vista + "'"));
    switchTab(vista, tab || null);
  } finally {
    _atras.volviendo = false;
  }
}

function _atrasModalAbierto() {
  const abiertos = [...document.querySelectorAll('.modal')]
    .filter(m => getComputedStyle(m).display !== 'none');
  return abiertos.length ? abiertos[abiertos.length - 1] : null;
}

function _atrasCerrarModal(m) {
  if (m.id && _modalState.has(m.id)) { closeModal(m.id); return; }
  // El ✕ de cada ventana está en su encabezado y llama a su propia función
  // de cierre (que a veces limpia el formulario): se le da clic.
  const btn = m.querySelector('.modal-header button');
  if (btn) btn.click();
  else m.style.display = 'none';
}

window.addEventListener('popstate', () => {
  _atras.armado = false;
  const m = _atrasModalAbierto();
  if (m) { _atrasCerrarModal(m); _atrasArmar(); return; }
  const actual = _atrasVistaActiva();
  while (_atras.pila.length) {
    const v = _atras.pila.pop();
    if (v !== actual && document.getElementById('view-' + v)) { _atrasIr(v); _atrasArmar(); return; }
  }
  if (actual && actual !== 'inicio') { _atrasIr('inicio'); _atrasArmar(); return; }
  window.history.back(); // en Inicio y sin nada abierto: salir
});

// Chrome salta las entradas que se agregan sin que el usuario haya tocado la
// página, así que también se arma (si hace falta) con cada toque.
document.addEventListener('click', _atrasArmar, true);
_atrasArmar();

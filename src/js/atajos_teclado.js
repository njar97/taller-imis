// ══════════════════════════════════════════════════════════════════════
// ATAJOS DE TECLADO GLOBALES
// - Esc: cierra el modal activo (busca el botón X o el botón "Cancelar")
// - Ctrl/Cmd+Enter: dispara el botón primario (.btn-success / .btn-primary)
//   del footer del modal activo. No se dispara con Enter solo para no
//   interferir con inputs (el usuario suele tipear y presionar Enter).
// - Ctrl/Cmd+K: foco rápido al buscador global del header
// ══════════════════════════════════════════════════════════════════════

function _atajosModalActivo() {
  const modals = document.querySelectorAll('.modal');
  // Recorrer de último a primero (el más recientemente abierto suele estar
  // último en el DOM o tiene mayor z-index implícito)
  for (let i = modals.length - 1; i >= 0; i--) {
    const m = modals[i];
    const disp = m.style.display;
    if (disp && disp !== 'none') return m;
  }
  return null;
}

function _atajosCerrarModal(m) {
  // Preferir el botón X del header (suele tener onclick="cerrar...")
  const btnX = m.querySelector('.modal-header .btn-ghost.btn-sm[onclick]');
  if (btnX) { btnX.click(); return; }
  // Fallback: botón Cancelar del footer
  const btnCancel = [...m.querySelectorAll('.modal-footer button')]
    .find(b => /cancelar|cerrar|ahora no/i.test(b.textContent || ''));
  if (btnCancel) { btnCancel.click(); return; }
  // Último recurso: ocultar el modal directamente
  m.style.display = 'none';
}

function _atajosConfirmarModal(m) {
  const btn = m.querySelector('.modal-footer .btn-success:not([disabled])')
    || m.querySelector('.modal-footer .btn-primary:not([disabled])')
    || m.querySelector('.modal-footer .btn-warning:not([disabled])');
  if (btn) btn.click();
}

document.addEventListener('keydown', (ev) => {
  // Si el buscador global está abierto, dejarle el Esc (cierra su dropdown)
  const buscRes = document.getElementById('buscador-results');
  const buscAbierto = buscRes && buscRes.style.display !== 'none';

  if (ev.key === 'Escape') {
    if (buscAbierto) return;  // delegado a busqueda_global
    const m = _atajosModalActivo();
    if (m) {
      _atajosCerrarModal(m);
      ev.preventDefault();
    }
    return;
  }

  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
    const m = _atajosModalActivo();
    if (m) {
      _atajosConfirmarModal(m);
      ev.preventDefault();
    }
    return;
  }

  // Ctrl/Cmd+K: foco al buscador global
  if (ev.key === 'k' && (ev.ctrlKey || ev.metaKey)) {
    const input = document.getElementById('buscador-input');
    if (input) {
      input.focus();
      input.select();
      ev.preventDefault();
    }
  }
});

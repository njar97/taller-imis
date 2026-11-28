// ════════════════════════════════════════════════════
// Antes aquí vivía el globito rojo de 📦 Bodega («N escuelas esperan
// empaque»): nadie lo veía y consultaba la base cada minuto. Se quitó.
// Queda solo el aviso de «cambió lo empacado», que usan Bodega y Empaque
// para no mostrar datos guardados de hace un rato.
// ════════════════════════════════════════════════════
function refrescarBadgeEsperando() {
  if (typeof invalidarCache === 'function') {
    invalidarCache('pool');
    invalidarCache('pedido');
    invalidarCache('bodega');
  }
}

// Plan de producción: pedido, bodega aprovechable y piezas por hacer.
const PLAN_PRENDAS = {  // cod_prenda → nombre para mostrar (en este orden)
  C: 'Camisa blanca',
  B: 'Blusa blanca',
  P: 'Pantalón azul',
  F: 'Falda azul',
  CC: 'Camisa celeste',
  S: 'Short azul',
  FCE: 'Falda elástico',
  PB: 'Pantalón beige',
  FB: 'Falda beige',
};

function planEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function planNum(n) {
  return (Number(n) || 0).toLocaleString('es-SV');
}
function planTotales(filas) {
  return filas.reduce((total, fila) => {
    for (const campo of Object.keys(total)) total[campo] += Number(fila[campo]) || 0;
    return total;
  }, { pedido: 0, de_bodega: 0, bodega_corto: 0, falta_hacer: 0 });
}
function planFecha(fecha) {
  // Leer la fecha sin convertir zona horaria: evita mostrar el día anterior.
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha || ''));
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return partes && meses[Number(partes[2]) - 1]
    ? `${partes[3]}-${meses[Number(partes[2]) - 1]}` : '—';
}

async function initPlanProduccion() {
  const cont = document.getElementById('prod-sub-plan-view');
  if (!cont) return;
  cont.innerHTML = '<div class="text-muted">Cargando plan...</div>';
  const actualizar = '<button class="btn btn-ghost" onclick="initPlanProduccion()">🔄 Actualizar</button>';
  try {
    const [filas, config] = await Promise.all([
      supaFetch('vw_plan_produccion', 'GET', null, '?order=cod_prenda,talla_2026'),
      supaFetch('plan_produccion_config', 'GET', null, '?clave=eq.tolerancia_largo_cm'),
    ]);
    const valor = config[0]?.valor;
    const tolerancia = Number(valor);
    if (valor == null || valor === '' || !Number.isFinite(tolerancia)) {
      throw new Error('No se encontró la tolerancia de largo del plan.');
    }
    const total = planTotales(filas);
    const grupos = new Map();
    for (const fila of filas) {
      if (!grupos.has(fila.cod_prenda)) grupos.set(fila.cod_prenda, []);
      grupos.get(fila.cod_prenda).push(fila);
    }
    const orden = Object.keys(PLAN_PRENDAS);
    const codigos = [...grupos.keys()].sort((a, b) => {
      const ia = orden.indexOf(a), ib = orden.indexOf(b);
      return (ia < 0 ? orden.length : ia) - (ib < 0 ? orden.length : ib);
    });
    cont.innerHTML = `
      <div class="card" style="font-size:18px">
        <div>Pedido <strong>${planNum(total.pedido)}</strong> · De bodega <strong>${planNum(total.de_bodega)}</strong></div>
        <div style="font-size:28px;font-weight:700;color:var(--azul);margin-top:8px">Falta hacer ${planNum(total.falta_hacer)}</div>
      </div>
      <div style="margin-bottom:12px">${actualizar}</div>
      ${codigos.map(codigo => planPrendaHtml(codigo, grupos.get(codigo))).join('')}
      ${filas.length ? '' : '<div class="alert alert-info">Sin prendas que mostrar.</div>'}
      <p class="text-muted" style="font-size:12px">Cortos = pantalones de bodega con largo menor al de la talla 2026 (se acepta hasta ${planNum(tolerancia)} cm menos). Tallas viejas pasadas a 2026 por la cintura.</p>`;
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${planEsc(e.message)}</div>${actualizar}`;
  }
}

function planPrendaHtml(codigo, filas) {
  const total = planTotales(filas);
  const tallas = [...filas].sort((a, b) => String(a.talla_2026).localeCompare(String(b.talla_2026), 'es', { numeric: true }));
  const sinContar = filas.some(f => f.contado === false);
  const fechas = [...new Set(filas.filter(f => f.contado === true).map(f => f.ultimo_conteo))].sort();
  const celda = 'padding:8px 2px;text-align:right;overflow-wrap:anywhere';
  function filaHtml(fila, titulo, esTotal = false) {
    return `<tr style="border-top:1px solid var(--border-light);${esTotal ? 'font-weight:700' : ''}">
      <th scope="row" style="padding:8px 2px;text-align:left;overflow-wrap:anywhere">${planEsc(titulo)}</th>
      <td style="${celda}">${planNum(fila.pedido)}</td>
      <td style="${celda}">${planNum(fila.de_bodega)}</td>
      <td style="${celda};${Number(fila.bodega_corto) > 0 ? 'color:#b45309;font-weight:700' : ''}">${Number(fila.bodega_corto) > 0 ? planNum(fila.bodega_corto) : '—'}</td>
      <td style="${celda};color:var(--azul);font-weight:700">${planNum(fila.falta_hacer)}</td>
    </tr>`;
  }
  return `<div class="card" style="padding:12px">
    <div class="card-title" style="justify-content:space-between;flex-wrap:wrap;font-size:18px">
      <span>${planEsc(PLAN_PRENDAS[codigo] || filas[0].nombre_prenda || codigo)}</span>
      <span style="font-size:24px">${planNum(total.falta_hacer)} <span style="font-size:12px">falta hacer</span></span>
    </div>
    ${sinContar ? '<div style="color:#b45309;background:var(--ambar-claro);padding:6px;border-radius:6px;margin-bottom:8px;font-size:12px">⚠ Bodega sin contar este año — no se restó</div>' : ''}
    ${fechas.map(fecha => `<div style="color:var(--success-text);background:var(--verde-claro);padding:6px;border-radius:6px;margin-bottom:8px;font-size:12px">✓ Bodega contada el ${planFecha(fecha)}</div>`).join('')}
    <table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:18px">
      <thead style="font-size:12px"><tr>
        <th scope="col" style="padding:8px 2px;text-align:left">Talla</th>
        <th scope="col" style="${celda}">Pedido</th>
        <th scope="col" style="${celda}">De bodega</th>
        <th scope="col" style="${celda}">Cortos</th>
        <th scope="col" style="${celda};color:var(--azul)">Falta hacer</th>
      </tr></thead>
      <tbody>${tallas.map(fila => filaHtml(fila, fila.talla_2026)).join('')}</tbody>
      <tfoot>${filaHtml(total, 'Total', true)}</tfoot>
    </table>
  </div>`;
}

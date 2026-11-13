// ══════════════════════════════════════════════════════════════════════
// NAV BADGES — indicadores en los tabs del nav
// Actualiza el badge "X escuelas esperan empaque" sobre el tab Bodega.
// Una escuela "espera" si tiene al menos una pieza por empacar y en
// bodega hay con qué empacarla.
//
// Temporada por cantidades (2026): por escuela × prenda × talla 2026,
//   falta = pedido − entregado − empacado (escuela_acaparado), y "hay
//   con qué" = el plan de producción toma piezas de bodega para esa
//   prenda y talla (vw_plan_produccion.de_bodega > 0: mismas tallas
//   equivalentes, largo que alcanza y bodega contada).
// Temporada con alumnos (2025): pieza pendiente del alumno con pool de
//   su escuela o stock libre (lógica de siempre, filtrada por temporada).
// Helpers de temporada/pedido: dashboard.js.
// ══════════════════════════════════════════════════════════════════════

let _navBadgesCache = { ultimoCalculo: 0 };

async function actualizarBadgeEscuelasEsperando() {
  // Throttle: no más de 1 vez cada 5s para evitar carga
  const ahora = Date.now();
  if (ahora - _navBadgesCache.ultimoCalculo < 5000) return;
  _navBadgesCache.ultimoCalculo = ahora;

  const badge = document.getElementById('nav-badge-bodega');
  if (!badge) return;

  try {
    const temp = temporadaActivaDe(await temporadasLista());
    const ped = temp ? await pedidoDeTemporada(temp.id) : { pedido: [] };
    const porPedido = ped.pedido.length > 0;
    const esperan = porPedido
      ? await _escuelasEsperanPorPedido(ped.pedido)
      : await _escuelasEsperanPorAlumnos(temp && temp.id);

    const n = esperan.size;
    if (n === 0) {
      badge.style.display = 'none';
    } else {
      badge.textContent = n;
      badge.style.display = '';
      badge.title = porPedido
        ? `${n} escuela(s) tienen piezas por empacar que ya hay en bodega`
        : `${n} escuela(s) tienen alumnos pendientes con stock o pool disponible para empacar`;
    }
  } catch(e) {
    console.warn('Badge esperando:', e.message);
  }
}

// Temporada por cantidades: escuelas con algo por empacar que bodega cubre
async function _escuelasEsperanPorPedido(pedido) {
  const [acaparado, equiv, plan] = await Promise.all([
    acaparadoTodo(),
    tallaEquivalencias(),
    cachedFetch('badge-plan',
      () => supaFetch('vw_plan_produccion', 'GET', null, '?select=cod_prenda,talla_2026,de_bodega'),
      { ttl: 30_000, group: 'bodega' }),
  ]);
  const hayEnBodega = new Set(plan
    .filter(f => (Number(f.de_bodega) || 0) > 0)
    .map(f => f.cod_prenda + '|' + f.talla_2026));
  const esperan = new Set();
  for (const l of avancePedidoTemporada(pedido, acaparado, equiv)) {
    if (l.pend > 0 && hayEnBodega.has(l.cod + '|' + l.talla)) esperan.add(l.escuela_id);
  }
  return esperan;
}

// Temporada con alumnos (2025): pieza pendiente + pool de su escuela o stock libre
async function _escuelasEsperanPorAlumnos(temporadaId) {
  const filtroTemp = temporadaId ? `&temporada_id=eq.${temporadaId}` : '';
  const [alumnos, stock, pool] = await Promise.all([
    cachedFetch('badge-alumnos-' + (temporadaId || 'todas'),
      () => supaFetchAll('alumno', `?activo=eq.true${filtroTemp}&select=escuela_id,prenda_top,talla_top_key,estado_top,prenda_bottom,talla_bottom_key,estado_bottom`),
      { ttl: 60_000, group: 'alumnos' }),
    cachedFetch('badge-stock',
      () => supaFetchAll('vw_bodega_stock', '?select=nombre_prenda,cod_prenda,talla_key,stock_actual'),
      { ttl: 30_000, group: 'bodega' }),
    acaparadoTodo(),
  ]);

  // Indexar stock libre por prenda|talla
  const stockMap = new Map();
  for (const s of stock) {
    const p = s.nombre_prenda
      || (typeof prendaCanon === 'function' ? prendaCanon(s.cod_prenda) : s.cod_prenda);
    if (!p || !s.talla_key) continue;
    stockMap.set(p + '|' + s.talla_key, Number(s.stock_actual) || 0);
  }
  // Pool por escuela y total acaparado por prenda|talla (para descontar
  // del stock libre lo reservado por otras escuelas)
  const poolEsc = new Map();        // esc|prenda|talla → disp
  const acapTotal = new Map();      // prenda|talla → total disp
  for (const p of pool) {
    const d = Math.max(0, (Number(p.cantidad_acaparada)||0) - (Number(p.cantidad_consumida)||0));
    if (d <= 0) continue;
    poolEsc.set(p.escuela_id + '|' + p.nombre_prenda + '|' + p.talla_key,
      (poolEsc.get(p.escuela_id + '|' + p.nombre_prenda + '|' + p.talla_key) || 0) + d);
    acapTotal.set(p.nombre_prenda + '|' + p.talla_key,
      (acapTotal.get(p.nombre_prenda + '|' + p.talla_key) || 0) + d);
  }

  const esperan = new Set();
  const evalPieza = (escId, prenda, talla, estado) => {
    if (!escId || !prenda || !talla) return;
    if (estado === 'empacado' || estado === 'entregado') return;
    if (esperan.has(escId)) return;  // ya marcada
    // ¿Pool de la escuela?
    const kPool = escId + '|' + prenda + '|' + talla;
    if ((poolEsc.get(kPool) || 0) > 0) { esperan.add(escId); return; }
    // ¿Stock libre? = stock total - lo acaparado por todas las escuelas
    const kStock = prenda + '|' + talla;
    const stockTotal = stockMap.get(kStock) || 0;
    const acap = acapTotal.get(kStock) || 0;
    const libre = stockTotal - acap;
    if (libre > 0) esperan.add(escId);
  };

  for (const a of alumnos) {
    evalPieza(a.escuela_id, a.prenda_top, a.talla_top_key, a.estado_top);
    evalPieza(a.escuela_id, a.prenda_bottom, a.talla_bottom_key, a.estado_bottom);
  }
  return esperan;
}

// Helper: forzar refresh (skip throttle) — llamar después de empacar/acaparar/entregar
function refrescarBadgeEsperando() {
  _navBadgesCache.ultimoCalculo = 0;
  // Lo empacado / entregado cambió: no usar lo guardado de hace un rato
  if (typeof invalidarCache === 'function') {
    invalidarCache('pool');
    invalidarCache('pedido');
    invalidarCache('bodega');
  }
  actualizarBadgeEscuelasEsperando();
}

// Auto-actualizar cada 60s mientras la app esté activa
setInterval(() => actualizarBadgeEscuelasEsperando(), 60000);

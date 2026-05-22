// ══════════════════════════════════════════════════════════════════════
// NAV BADGES — indicadores en los tabs del nav
// Actualiza el badge "X escuelas esperan empaque" sobre el tab Bodega.
// Una escuela "espera" si tiene al menos una pieza pendiente y hay
// suministro disponible (pool de su escuela o stock libre) que pueda
// cubrirla.
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
    const [alumnos, stock, pool] = await Promise.all([
      supaFetchAll('alumno', '?activo=eq.true&select=escuela_id,prenda_top,talla_top_key,estado_top,prenda_bottom,talla_bottom_key,estado_bottom&limit=10000'),
      supaFetchAll('vw_bodega_stock', '?select=nombre_prenda,cod_prenda,talla_key,stock_actual'),
      supaFetchAll('escuela_acaparado', '?select=escuela_id,nombre_prenda,talla_key,cantidad_acaparada,cantidad_consumida'),
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

    const n = esperan.size;
    if (n === 0) {
      badge.style.display = 'none';
    } else {
      badge.textContent = n;
      badge.style.display = '';
      badge.title = `${n} escuela(s) tienen alumnos pendientes con stock o pool disponible para empacar`;
    }
  } catch(e) {
    console.warn('Badge esperando:', e.message);
  }
}

// Helper: forzar refresh (skip throttle) — llamar después de empacar/acaparar
function refrescarBadgeEsperando() {
  _navBadgesCache.ultimoCalculo = 0;
  actualizarBadgeEscuelasEsperando();
}

// Auto-actualizar cada 60s mientras la app esté activa
setInterval(() => actualizarBadgeEscuelasEsperando(), 60000);

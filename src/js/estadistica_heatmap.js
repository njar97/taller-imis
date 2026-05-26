// ══════════════════════════════════════════════════════════════════════
// ESTADÍSTICA — HEATMAP DE TALLAS CRÍTICAS
// Matriz prenda × talla coloreada por nivel de criticidad. Rojo intenso =
// falta mucho; amarillo = al límite; verde = sobra. Sirve para detectar
// de un vistazo qué tallas hay que producir / acaparar más.
// ══════════════════════════════════════════════════════════════════════

let heatmapCache = {
  temporadaId: null,
  alumnos: null, stock: null, pool: null, bultos: null,
};

async function initHeatmapCritico() {
  const root = document.getElementById('est-heatmap-contenido');
  if (!root) return;

  // Stale-while-revalidate: pinta del cache local mientras refresca.
  const tieneCache = (typeof tiCacheGet === 'function') && tiCacheGet('estadistica_heatmap_v1');
  if (!tieneCache) root.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando datos...</div>';

  try {
    await tiSWR('estadistica_heatmap_v1', async () => {
      if (!heatmapCache.temporadaId) {
        const t = (await supaFetch('temporada', 'GET', null,
          '?estado=eq.activa&select=id&order=anio.desc&limit=1'))[0]
          || (await supaFetch('temporada', 'GET', null, '?select=id&order=anio.desc&limit=1'))[0];
        if (!t) throw new Error('No hay temporada cargada');
        heatmapCache.temporadaId = t.id;
      }
      const [alumnos, stock, pool, bultos] = await Promise.all([
        supaFetchAll('alumno',
          `?temporada_id=eq.${heatmapCache.temporadaId}&activo=eq.true&select=prenda_top,talla_top_key,estado_top,prenda_bottom,talla_bottom_key,estado_bottom&limit=10000`),
        supaFetchAll('vw_bodega_stock', '?select=nombre_prenda,cod_prenda,talla_key,stock_actual'),
        supaFetchAll('escuela_acaparado', '?select=nombre_prenda,talla_key,cantidad_acaparada,cantidad_consumida'),
        supaFetchAll('vw_produccion_estado',
          '?estado_manual=neq.terminado&select=cod_prenda,talla_key_salida,cantidad_original,total_etapas,etapas_hechas'),
      ]);
      return { alumnos, stock, pool, bultos, temporadaId: heatmapCache.temporadaId };
    }, (data) => {
      heatmapCache.alumnos = data.alumnos;
      heatmapCache.stock = data.stock;
      heatmapCache.pool = data.pool;
      heatmapCache.bultos = data.bultos;
      heatmapCache.temporadaId = data.temporadaId;
      renderHeatmapCritico();
    }, { ttl: 60 * 60 * 1000 });  // 1h — datos de estadística cambian lento
  } catch (e) {
    root.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function renderHeatmapCritico() {
  const root = document.getElementById('est-heatmap-contenido');
  if (!root) return;
  const c = heatmapCache;

  // Calcular para cada (prenda, talla): demanda, suministro, balance
  const cells = new Map();  // "prenda|talla" → {prenda, talla, dem, sup, bal}
  const bump = (prenda, talla, field, n=1) => {
    if (!prenda || !talla) return;
    const k = prenda + '|' + talla;
    if (!cells.has(k)) cells.set(k, { prenda, talla, dem: 0, sup: 0 });
    cells.get(k)[field] += n;
  };
  // Demanda
  for (const a of (c.alumnos || [])) {
    if (a.prenda_top && a.talla_top_key
        && a.estado_top !== 'empacado' && a.estado_top !== 'entregado') {
      bump(a.prenda_top, a.talla_top_key, 'dem');
    }
    if (a.prenda_bottom && a.talla_bottom_key
        && a.estado_bottom !== 'empacado' && a.estado_bottom !== 'entregado') {
      bump(a.prenda_bottom, a.talla_bottom_key, 'dem');
    }
  }
  // Suministro: stock libre + pool + bultos pendientes (corte + producción)
  for (const s of (c.stock || [])) {
    const p = s.nombre_prenda || (typeof prendaCanon === 'function' ? prendaCanon(s.cod_prenda) : s.cod_prenda);
    if (!p || !s.talla_key) continue;
    bump(p, s.talla_key, 'sup', Number(s.stock_actual) || 0);
  }
  for (const p of (c.pool || [])) {
    const d = Math.max(0, (Number(p.cantidad_acaparada)||0) - (Number(p.cantidad_consumida)||0));
    if (d <= 0) continue;
    bump(p.nombre_prenda, p.talla_key, 'sup', d);
  }
  for (const b of (c.bultos || [])) {
    if (!b.cod_prenda || !b.talla_key_salida) continue;
    const nombre = (typeof prendaCanon === 'function') ? prendaCanon(b.cod_prenda) : b.cod_prenda;
    bump(nombre, b.talla_key_salida, 'sup', Number(b.cantidad_original) || 0);
  }
  // Balance
  for (const cell of cells.values()) cell.bal = cell.sup - cell.dem;

  // Listas prendas + tallas (ordenadas)
  const prendas = [...new Set([...cells.values()].map(c => c.prenda))].sort();
  const tallas = [...new Set([...cells.values()].map(c => c.talla))]
    .sort((a,b) => a.localeCompare(b, 'es', { numeric: true }));

  // Indexar cells por k
  const cellByK = new Map();
  for (const cell of cells.values()) cellByK.set(cell.prenda + '|' + cell.talla, cell);

  // Color de la celda según balance: rojo intenso si bal muy negativo,
  // amarillo cerca de 0, verde si positivo. Intensidad escalada al max abs.
  let maxAbs = 0;
  for (const cell of cells.values()) {
    if (cell.dem === 0) continue;
    maxAbs = Math.max(maxAbs, Math.abs(cell.bal));
  }
  if (maxAbs === 0) maxAbs = 1;
  const color = (bal, dem) => {
    if (dem === 0 && bal === 0) return { bg: '#fafafa', text: '#ccc', val: '' };
    if (dem === 0) return { bg: '#E0F4E5', text: '#2a6', val: '+' + bal };
    // Normalizar -1 .. 1 (0 = balanceado)
    const t = Math.max(-1, Math.min(1, bal / maxAbs));
    if (t < -0.1) {
      // rojo (más intenso a más negativo)
      const intensity = Math.min(1, Math.abs(t));
      const r = 255, g = Math.round(220 - intensity * 140), b = Math.round(220 - intensity * 140);
      return { bg: `rgb(${r},${g},${b})`, text: intensity > 0.5 ? '#600' : '#900', val: bal };
    }
    if (t > 0.1) {
      // verde claro
      const intensity = Math.min(1, t);
      const r = Math.round(240 - intensity * 80), g = 250, b = Math.round(240 - intensity * 80);
      return { bg: `rgb(${r},${g},${b})`, text: '#2a6', val: '+' + bal };
    }
    // amarillo
    return { bg: '#FFF7CC', text: '#a82', val: bal > 0 ? '+' + bal : bal };
  };

  const filas = prendas.map(p => `
    <tr>
      <td style="position:sticky;left:0;background:#f5f7fa;padding:6px 10px;font-weight:700;font-size:12px;border-right:1px solid #ddd;white-space:nowrap;z-index:1">${p}</td>
      ${tallas.map(t => {
        const cell = cellByK.get(p + '|' + t);
        if (!cell) return '<td style="background:#fafafa;color:#ddd;text-align:center;font-size:10px">·</td>';
        const c = color(cell.bal, cell.dem);
        const title = `${p} ${t}\nDemanda: ${cell.dem}\nSuministro: ${cell.sup}\nBalance: ${cell.bal>=0?'+':''}${cell.bal}`;
        return `<td style="background:${c.bg};color:${c.text};text-align:center;font-size:11px;font-weight:700;padding:4px;min-width:38px;cursor:default" title="${title}">${c.val}</td>`;
      }).join('')}
    </tr>
  `).join('');

  // KPIs: criticas (bal < 0), en límite (bal 0..pocas), sobrante
  let nCriticas = 0, nLimite = 0, nSobrante = 0, totalFalta = 0;
  for (const cell of cells.values()) {
    if (cell.dem === 0 && cell.sup === 0) continue;
    if (cell.bal < 0) { nCriticas++; totalFalta += (-cell.bal); }
    else if (cell.bal === 0 || cell.bal <= 2) nLimite++;
    else nSobrante++;
  }

  root.innerHTML = `
    <div class="card" style="padding:10px;margin-bottom:10px">
      <div style="font-weight:600;margin-bottom:6px">🔥 Heatmap de tallas críticas</div>
      <div style="font-size:12px;color:#666">
        Color rojo: faltante (demanda > suministro). Verde: sobrante.
        Amarillo: balanceado o muy ajustado. Suministro = corte + producción + bodega + pool.
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;margin-bottom:10px">
      <div class="card" style="padding:8px;text-align:center;border-top:3px solid #c44">
        <div style="font-size:10px;color:#666">Tallas críticas</div>
        <div style="font-size:20px;font-weight:700;color:#c44">${nCriticas}</div>
        <div style="font-size:10px;color:#888">${totalFalta} pieza(s) faltan</div>
      </div>
      <div class="card" style="padding:8px;text-align:center;border-top:3px solid #a82">
        <div style="font-size:10px;color:#666">Al límite</div>
        <div style="font-size:20px;font-weight:700;color:#a82">${nLimite}</div>
      </div>
      <div class="card" style="padding:8px;text-align:center;border-top:3px solid #2a6">
        <div style="font-size:10px;color:#666">Sobrantes</div>
        <div style="font-size:20px;font-weight:700;color:#2a6">${nSobrante}</div>
      </div>
      <div class="card" style="padding:8px;text-align:center">
        <div style="font-size:10px;color:#666">Combinaciones</div>
        <div style="font-size:20px;font-weight:700">${cells.size}</div>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr>
              <th style="position:sticky;left:0;background:#eef1f5;padding:6px 10px;text-align:left;border-right:1px solid #ddd;font-size:11px;z-index:2">Prenda</th>
              ${tallas.map(t => `<th style="background:#eef1f5;padding:6px 4px;font-family:monospace;font-size:11px;text-align:center;min-width:38px">${t}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    </div>
    <div style="text-align:center;color:#888;font-size:11px;margin-top:8px">
      Hover sobre una celda para ver el desglose. Tallas que no aplican a esa prenda aparecen vacías (·).
    </div>
  `;
}

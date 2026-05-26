// ══════════════════════════════════════════════════════════════════════
// ESTADÍSTICA — RESUMEN POR TALLA
// Tabla pivote: filas (prenda × talla) con totales por escuela + cruce con
// Corte (no implementado todavía), Producción (bultos pendientes), Bodega
// (stock libre), Pool (acaparado disponible). Click en fila expande detalle
// por escuela. Opcionalmente puede mostrar escuelas como columnas (pivot).
// ══════════════════════════════════════════════════════════════════════

let tallasResumenCache = {
  temporadaId: null,
  alumnos: [],
  escuelas: {},
  bultosPendientes: [],
  stock: [],
  pool: [],
  filtros: {
    prendas: [],      // multi-select de nombres canónicos. Vacío = todas
    talla: '',        // string single
    escuelas: [],     // multi
    ocultarCubiertas: false,  // si true, no muestra filas con balance >= 0
    escuelasEnColumnas: true,   // default ON — pivot por escuela apenas se abre el tab
    incluirCorte: true,
    incluirProd: true,
    incluirBodega: true,
    incluirPool: true,
  },
  expandidos: new Set(),  // claves "prenda|talla"
};

async function initTallasResumen() {
  const root = document.getElementById('est-tallas-contenido');
  if (!root) return;
  root.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando datos...</div>';

  try {
    if (!tallasResumenCache.temporadaId) {
      const t = (await supaFetch('temporada', 'GET', null,
        '?estado=eq.activa&select=id&order=anio.desc&limit=1'))[0]
        || (await supaFetch('temporada', 'GET', null, '?select=id&order=anio.desc&limit=1'))[0];
      if (!t) throw new Error('No hay temporada cargada');
      tallasResumenCache.temporadaId = t.id;
    }

    const [escuelas, alumnos, bultosPend, stock, pool] = await Promise.all([
      supaFetchAll('escuela', '?activa=eq.true&select=id,alias,nombre,codigo_cde&order=alias.asc'),
      supaFetchAll('alumno',
        `?temporada_id=eq.${tallasResumenCache.temporadaId}&activo=eq.true&select=escuela_id,prenda_top,talla_top_key,estado_top,prenda_bottom,talla_bottom_key,estado_bottom&limit=10000`),
      supaFetchAll('vw_produccion_estado',
        '?estado_manual=neq.terminado&select=cod_prenda,talla_key_salida,cantidad_original,estado_manual,total_etapas,etapas_hechas'),
      supaFetchAll('vw_bodega_stock',
        '?select=nombre_prenda,cod_prenda,talla_key,stock_actual'),
      supaFetchAll('escuela_acaparado',
        '?select=escuela_id,nombre_prenda,talla_key,cantidad_acaparada,cantidad_consumida'),
    ]);

    const escMap = {};
    for (const e of escuelas) escMap[e.id] = e;
    tallasResumenCache.escuelas = escMap;
    tallasResumenCache.alumnos = alumnos;
    tallasResumenCache.bultosPendientes = bultosPend;
    tallasResumenCache.stock = stock;
    tallasResumenCache.pool = pool;

    renderTallasResumen();
  } catch (e) {
    root.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function onTallasFiltro(field, val) {
  tallasResumenCache.filtros[field] = val;
  renderTallasResumen();
}
function togglePrendaTallas(p) {
  const arr = tallasResumenCache.filtros.prendas;
  const i = arr.indexOf(p);
  if (i >= 0) arr.splice(i, 1); else arr.push(p);
  renderTallasResumen();
}
function limpiarPrendasTallas() {
  tallasResumenCache.filtros.prendas = [];
  renderTallasResumen();
}
function toggleExpandTalla(k) {
  const set = tallasResumenCache.expandidos;
  if (set.has(k)) set.delete(k); else set.add(k);
  renderTallasResumen();
}

function renderTallasResumen() {
  const root = document.getElementById('est-tallas-contenido');
  if (!root) return;
  const c = tallasResumenCache;
  const f = c.filtros;

  // ─── Demanda por (prenda, talla, escuela) ─────────────────────────
  const demanda = new Map();  // "prenda|talla" → { total, porEsc: Map<eid, n> }
  const bump = (prenda, talla, escId) => {
    if (!prenda || !talla) return;
    const k = prenda + '|' + talla;
    if (!demanda.has(k)) demanda.set(k, { total: 0, porEsc: new Map() });
    const d = demanda.get(k);
    d.total++;
    d.porEsc.set(escId, (d.porEsc.get(escId) || 0) + 1);
  };
  for (const a of c.alumnos) {
    if (a.prenda_top && a.talla_top_key
        && a.estado_top !== 'empacado' && a.estado_top !== 'entregado') {
      bump(a.prenda_top, a.talla_top_key, a.escuela_id);
    }
    if (a.prenda_bottom && a.talla_bottom_key
        && a.estado_bottom !== 'empacado' && a.estado_bottom !== 'entregado') {
      bump(a.prenda_bottom, a.talla_bottom_key, a.escuela_id);
    }
  }

  // ─── Suministro por (prenda, talla) ───────────────────────────────
  // Split: "en corte" = bultos pendientes sin etapas iniciadas
  //        "en producción" = bultos en proceso (etapas iniciadas, no terminadas)
  // Si Fase 2 OFF (sin etapas), todos los pendientes cuentan como corte.
  const enCorte = new Map();
  const enProd = new Map();
  for (const b of c.bultosPendientes) {
    if (!b.cod_prenda || !b.talla_key_salida) continue;
    const nombre = (typeof prendaCanon === 'function') ? prendaCanon(b.cod_prenda) : b.cod_prenda;
    const k = nombre + '|' + b.talla_key_salida;
    const cant = Number(b.cantidad_original) || 0;
    const enProceso = (Number(b.total_etapas)||0) > 0 && (Number(b.etapas_hechas)||0) > 0;
    if (enProceso) enProd.set(k, (enProd.get(k) || 0) + cant);
    else enCorte.set(k, (enCorte.get(k) || 0) + cant);
  }
  const enBodega = new Map();
  for (const s of c.stock) {
    // nombre_prenda en bodega_movimiento ya viene canónico; si está vacío, usar cod_prenda
    const p = s.nombre_prenda || (typeof prendaCanon === 'function' ? prendaCanon(s.cod_prenda) : s.cod_prenda);
    if (!p || !s.talla_key) continue;
    enBodega.set(p + '|' + s.talla_key, Number(s.stock_actual) || 0);
  }
  const poolTotal = new Map();
  const poolPorEsc = new Map();
  for (const p of c.pool) {
    const k = p.nombre_prenda + '|' + p.talla_key;
    const disp = Math.max(0, (Number(p.cantidad_acaparada)||0) - (Number(p.cantidad_consumida)||0));
    if (disp <= 0) continue;
    poolTotal.set(k, (poolTotal.get(k) || 0) + disp);
    if (!poolPorEsc.has(k)) poolPorEsc.set(k, new Map());
    const m = poolPorEsc.get(k);
    m.set(p.escuela_id, (m.get(p.escuela_id) || 0) + disp);
  }

  const allKeys = new Set([
    ...demanda.keys(), ...enCorte.keys(), ...enProd.keys(), ...enBodega.keys(), ...poolTotal.keys(),
  ]);
  const prendasUnicas = [...new Set([...allKeys].map(k => k.split('|')[0]))].sort();
  const tallasUnicas = [...new Set([...allKeys].map(k => k.split('|')[1]))]
    .sort((a,b) => a.localeCompare(b, 'es', { numeric: true }));
  const escuelasArr = Object.values(c.escuelas).sort((a,b) =>
    (a.alias || a.nombre).localeCompare(b.alias || b.nombre, 'es'));

  // Filtrar filas
  const prendasFiltradas = new Set(f.prendas || []);
  let rows = [];
  for (const k of allKeys) {
    const [prenda, talla] = k.split('|');
    if (prendasFiltradas.size > 0 && !prendasFiltradas.has(prenda)) continue;
    if (f.talla && talla !== f.talla) continue;
    const dem = demanda.get(k) || { total: 0, porEsc: new Map() };
    if (f.escuelas && f.escuelas.length > 0) {
      const matchEsc = f.escuelas.some(eid => (dem.porEsc.get(eid) || 0) > 0);
      if (!matchEsc) continue;
    }
    const corte = enCorte.get(k) || 0;
    const prod = enProd.get(k) || 0;
    const stockLibre = enBodega.get(k) || 0;
    const pTotal = poolTotal.get(k) || 0;
    const suministro = (f.incluirCorte ? corte : 0)
                     + (f.incluirProd ? prod : 0)
                     + (f.incluirBodega ? stockLibre : 0)
                     + (f.incluirPool ? pTotal : 0);
    const balance = suministro - dem.total;
    if (f.ocultarCubiertas && balance >= 0) continue;
    rows.push({
      key: k, prenda, talla,
      demanda: dem.total, porEsc: dem.porEsc,
      corte, prod, stockLibre, pool: pTotal, poolPorEsc: poolPorEsc.get(k) || new Map(),
      balance,
    });
  }
  rows.sort((a, b) =>
    a.prenda.localeCompare(b.prenda) || a.talla.localeCompare(b.talla, 'es', { numeric: true })
  );

  const tot = rows.reduce((s, r) => ({
    demanda: s.demanda + r.demanda,
    corte: s.corte + r.corte,
    prod: s.prod + r.prod,
    stockLibre: s.stockLibre + r.stockLibre,
    pool: s.pool + r.pool,
    balance: s.balance + r.balance,
  }), { demanda: 0, corte: 0, prod: 0, stockLibre: 0, pool: 0, balance: 0 });

  // Persistir último cómputo para exportar PDF sin recomputar (se actualiza
  // en cada render). exportarTallasPDF() lo lee.
  c._ultimoReporte = { rows, tot, escuelasCols: null, generadoEn: new Date() };

  // Escuelas a mostrar como columnas:
  // - Si hay filtro de escuelas activo, usar esas.
  // - Sino, autodetectar todas las que tengan demanda > 0 en las filas visibles.
  const escEnCols = !!f.escuelasEnColumnas;
  let escuelasCols = [];
  if (escEnCols) {
    if (f.escuelas && f.escuelas.length > 0) {
      escuelasCols = f.escuelas.map(eid => c.escuelas[eid]).filter(Boolean);
    } else {
      const auto = new Set();
      for (const r of rows) for (const eid of r.porEsc.keys()) auto.add(eid);
      escuelasCols = [...auto]
        .map(eid => c.escuelas[eid]).filter(Boolean)
        .sort((a,b) => (a.alias || a.nombre).localeCompare(b.alias || b.nombre, 'es'));
    }
  }
  if (c._ultimoReporte) c._ultimoReporte.escuelasCols = escuelasCols;

  // ─── UI ───────────────────────────────────────────────────────────
  const escuelasSel = new Set(f.escuelas || []);
  const escChips = (f.escuelas || []).map(eid => {
    const e = c.escuelas[eid]; if (!e) return '';
    return `<span class="btn btn-sm btn-primary" style="cursor:default">
      🏫 ${e.alias || e.nombre}
      <span style="margin-left:4px;cursor:pointer" onclick="quitarTallasEsc('${eid}')">✕</span>
    </span>`;
  }).join('');
  const escDisp = escuelasArr.filter(e => !escuelasSel.has(e.id));

  // Chips multi-prenda
  const chipsPrendas = prendasUnicas.map(p => {
    const sel = prendasFiltradas.has(p);
    return `<button class="btn btn-sm ${sel?'btn-primary':'btn-ghost'}"
      onclick="togglePrendaTallas('${p.replace(/'/g,"\\'")}')"
      style="font-weight:${sel?'700':'normal'}">${p}</button>`;
  }).join('');

  root.innerHTML = `
    <!-- Filtros -->
    <div class="card" style="padding:10px;margin-bottom:10px">
      <!-- Multi-select prendas -->
      <div style="font-size:11px;font-weight:600;color:#666;margin-bottom:4px">PRENDAS (multi)</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
        ${chipsPrendas}
        ${prendasFiltradas.size > 0
          ? `<button class="btn btn-ghost btn-sm" onclick="limpiarPrendasTallas()" style="font-size:11px">✕ Limpiar</button>`
          : `<span style="font-size:11px;color:#888">Ninguna seleccionada = todas</span>`}
      </div>

      <!-- Talla single + opciones -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-bottom:8px">
        <div class="field" style="margin:0">
          <label>Talla</label>
          <select onchange="onTallasFiltro('talla', this.value)">
            <option value="">Todas</option>
            ${tallasUnicas.map(t => `<option value="${t}" ${f.talla===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="margin:0">
          <label style="display:flex;gap:6px;align-items:center;font-weight:normal">
            <input type="checkbox" ${f.ocultarCubiertas?'checked':''}
                   onchange="onTallasFiltro('ocultarCubiertas', this.checked)">
            Ocultar cubiertas (balance ≥ 0)
          </label>
        </div>
        <div class="field" style="margin:0">
          <label style="display:flex;gap:6px;align-items:center;font-weight:normal">
            <input type="checkbox" ${f.escuelasEnColumnas?'checked':''}
                   onchange="onTallasFiltro('escuelasEnColumnas', this.checked)">
            Escuelas como columnas
          </label>
          <div style="font-size:10px;color:#888;margin-top:2px">${(f.escuelas||[]).length>0?'Solo las elegidas abajo':'Todas las que tengan demanda'}</div>
        </div>
        <div style="text-align:right;display:flex;gap:6px;justify-content:flex-end;align-items:flex-start;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="exportarTallasPDF()" title="Descargar el reporte actual (con los filtros aplicados) en PDF">📥 PDF</button>
          <button class="btn btn-ghost btn-sm" onclick="initTallasResumen()">🔄 Refrescar</button>
        </div>
      </div>

      <!-- Escuelas multi -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
        ${escChips}
        ${escDisp.length > 0 ? `
          <select onchange="if(this.value){agregarTallasEsc(this.value); this.value='';}" style="padding:4px 6px;font-size:12px">
            <option value="">+ Filtrar por escuela…</option>
            ${escDisp.map(e => `<option value="${e.id}">${e.alias || e.nombre}</option>`).join('')}
          </select>
        ` : ''}
      </div>

      <!-- Toggles de suministro -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:12px;border-top:1px dashed #ddd;padding-top:6px">
        <label style="display:flex;gap:4px;align-items:center;cursor:pointer">
          <input type="checkbox" ${f.incluirCorte?'checked':''} onchange="onTallasFiltro('incluirCorte', this.checked)">
          ✂️ Corte
        </label>
        <label style="display:flex;gap:4px;align-items:center;cursor:pointer">
          <input type="checkbox" ${f.incluirProd?'checked':''} onchange="onTallasFiltro('incluirProd', this.checked)">
          🏭 Producción
        </label>
        <label style="display:flex;gap:4px;align-items:center;cursor:pointer">
          <input type="checkbox" ${f.incluirBodega?'checked':''} onchange="onTallasFiltro('incluirBodega', this.checked)">
          📦 Bodega
        </label>
        <label style="display:flex;gap:4px;align-items:center;cursor:pointer">
          <input type="checkbox" ${f.incluirPool?'checked':''} onchange="onTallasFiltro('incluirPool', this.checked)">
          📥 Pool acaparado
        </label>
      </div>
    </div>

    <!-- KPIs totales -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:6px;margin-bottom:10px">
      <div class="card" style="padding:8px;text-align:center">
        <div style="font-size:10px;color:#666">Demanda total</div>
        <div style="font-size:20px;font-weight:700">${tot.demanda.toLocaleString()}</div>
      </div>
      <div class="card" style="padding:8px;text-align:center">
        <div style="font-size:10px;color:#666">En producción</div>
        <div style="font-size:20px;font-weight:700;color:#4a8">${tot.prod.toLocaleString()}</div>
      </div>
      <div class="card" style="padding:8px;text-align:center">
        <div style="font-size:10px;color:#666">En bodega</div>
        <div style="font-size:20px;font-weight:700;color:var(--azul)">${tot.stockLibre.toLocaleString()}</div>
      </div>
      <div class="card" style="padding:8px;text-align:center">
        <div style="font-size:10px;color:#666">Pool</div>
        <div style="font-size:20px;font-weight:700;color:#a82">${tot.pool.toLocaleString()}</div>
      </div>
      <div class="card" style="padding:8px;text-align:center">
        <div style="font-size:10px;color:#666">Balance</div>
        <div style="font-size:20px;font-weight:700;color:${tot.balance<0?'var(--rojo)':'var(--verde)'}">${tot.balance>=0?'+':''}${tot.balance.toLocaleString()}</div>
      </div>
    </div>

    <!-- Tabla principal -->
    <div class="card" style="padding:0;overflow:hidden">
      <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">
        📊 Detalle por talla
        ${escEnCols ? `<span style="font-size:11px;color:#666;font-weight:normal;margin-left:6px">(escuelas en columnas)</span>` : ''}
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:780px">
          <thead>
            <tr style="background:#FAFAFA">
              <th style="padding:6px 8px;text-align:left;width:32px"></th>
              <th style="padding:6px 8px;text-align:left">Prenda</th>
              <th style="padding:6px 8px;text-align:left">Talla</th>
              <th style="padding:6px 8px;text-align:right">Necesidad</th>
              ${escuelasCols.map(e => `<th style="padding:6px 8px;text-align:right;font-size:11px" title="${e.nombre||''}">🏫 ${e.alias || e.nombre}</th>`).join('')}
              ${f.incluirCorte ? `<th style="padding:6px 8px;text-align:right" title="Bultos cortados sin etapas iniciadas">✂️ Corte</th>` : ''}
              ${f.incluirProd ? `<th style="padding:6px 8px;text-align:right">🏭 Producción</th>` : ''}
              ${f.incluirBodega ? `<th style="padding:6px 8px;text-align:right">📦 Bodega</th>` : ''}
              ${f.incluirPool ? `<th style="padding:6px 8px;text-align:right">📥 Pool</th>` : ''}
              <th style="padding:6px 8px;text-align:right">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 ? `
              <tr><td colspan="${9 + escuelasCols.length}" style="padding:20px;text-align:center;color:#888">Sin resultados con los filtros aplicados.</td></tr>
            ` : rows.map(r => {
              const exp = c.expandidos.has(r.key);
              const balanceColor = r.balance < 0 ? 'var(--rojo)' : 'var(--verde)';
              const trMain = `
                <tr style="border-top:1px solid #EEE;cursor:pointer" onclick="toggleExpandTalla('${r.key.replace(/'/g,"\\'")}')">
                  <td style="padding:5px 8px;text-align:center">${exp?'▼':'▶'}</td>
                  <td style="padding:5px 8px;font-weight:600">${r.prenda}</td>
                  <td style="padding:5px 8px;font-family:monospace;font-weight:600">${r.talla}</td>
                  <td style="padding:5px 8px;text-align:right;font-weight:700">${r.demanda}</td>
                  ${escuelasCols.map(e => {
                    const n = r.porEsc.get(e.id) || 0;
                    return `<td style="padding:5px 8px;text-align:right;color:${n>0?'#444':'#ccc'}">${n||'·'}</td>`;
                  }).join('')}
                  ${f.incluirCorte ? `<td style="padding:5px 8px;text-align:right;color:#888">${r.corte || '—'}</td>` : ''}
                  ${f.incluirProd ? `<td style="padding:5px 8px;text-align:right;color:#4a8">${r.prod || 0}</td>` : ''}
                  ${f.incluirBodega ? `<td style="padding:5px 8px;text-align:right;color:var(--azul)">${r.stockLibre || 0}</td>` : ''}
                  ${f.incluirPool ? `<td style="padding:5px 8px;text-align:right;color:#a82">${r.pool || 0}</td>` : ''}
                  <td style="padding:5px 8px;text-align:right;font-weight:700;color:${balanceColor}">${r.balance>=0?'+':''}${r.balance}</td>
                </tr>
              `;
              if (!exp) return trMain;
              // Detalle por escuela (solo cuando NO está en modo columnas, para no duplicar)
              if (escEnCols) return trMain;
              const filasEsc = [...r.porEsc.entries()]
                .sort((a,b) => b[1] - a[1])
                .map(([eid, n]) => {
                  const e = c.escuelas[eid];
                  if (!e) return '';
                  const poolEsc = (r.poolPorEsc.get(eid) || 0);
                  return `
                    <tr style="background:#FAFCFF;border-top:1px solid #f0f0f0">
                      <td></td>
                      <td colspan="2" style="padding:4px 8px 4px 24px;font-size:11px;color:#555">
                        🏫 ${e.alias || e.nombre}
                      </td>
                      <td style="padding:4px 8px;text-align:right;font-size:11px">${n}</td>
                      ${f.incluirCorte ? `<td></td>` : ''}
                      ${f.incluirProd ? `<td></td>` : ''}
                      ${f.incluirBodega ? `<td></td>` : ''}
                      ${f.incluirPool ? `<td style="padding:4px 8px;text-align:right;font-size:11px;color:#a82">${poolEsc || ''}</td>` : ''}
                      <td style="padding:4px 8px;text-align:right;font-size:11px;color:${poolEsc>=n?'var(--verde)':'#888'}">${poolEsc>=n?'cubierto':''}</td>
                    </tr>
                  `;
                }).join('');
              return trMain + filasEsc;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div style="text-align:center;margin-top:8px;color:#888;font-size:11px">
      ${rows.length} fila(s). ${escEnCols
        ? 'Escuelas mostradas como columnas (necesidad por escuela).'
        : 'Tocá una fila para desglosar por escuela.'}
    </div>
  `;
}

function agregarTallasEsc(eid) {
  const arr = tallasResumenCache.filtros.escuelas || [];
  if (!arr.includes(eid)) arr.push(eid);
  tallasResumenCache.filtros.escuelas = arr;
  renderTallasResumen();
}
function quitarTallasEsc(eid) {
  tallasResumenCache.filtros.escuelas =
    (tallasResumenCache.filtros.escuelas || []).filter(id => id !== eid);
  // Si vacía y estaba en modo columnas, apagar
  if (tallasResumenCache.filtros.escuelas.length === 0) {
    tallasResumenCache.filtros.escuelasEnColumnas = false;
  }
  renderTallasResumen();
}

// ─── Exportar reporte por talla a PDF ────────────────────────────────
// V5: usa la API nativa de impresión del browser via iframe oculto, en
// vez de html2pdf/html2canvas (que daban blanco en Chrome Android por
// issues de layout off-screen). Al hacer print() en el iframe, Android
// abre el dialog "Imprimir o guardar como PDF" — el usuario elige PDF
// y queda guardado. Funciona en Chrome móvil/desktop, Safari iOS, etc.
async function exportarTallasPDF() {
  const c = tallasResumenCache;
  const f = c.filtros;
  if (!c._ultimoReporte || !Array.isArray(c._ultimoReporte.rows)) {
    renderTallasResumen();
    if (!c._ultimoReporte) { alert('No hay datos para exportar.'); return; }
  }
  const { rows, tot, escuelasCols, generadoEn } = c._ultimoReporte;
  if (rows.length === 0) {
    alert('Sin filas para exportar con los filtros actuales. Ajustá los filtros y volvé a intentar.');
    return;
  }

  const esc = escuelasCols || [];
  const showEsc = !!f.escuelasEnColumnas && esc.length > 0;
  const fecha = (generadoEn instanceof Date ? generadoEn : new Date());
  const fmtFecha = fecha.toLocaleString('es-SV', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const fileFecha = fecha.toISOString().slice(0, 16).replace(/[:T]/g, '-');

  // Filtros activos como texto legible
  const filtroPartes = [];
  if (f.prendas && f.prendas.length > 0) filtroPartes.push(`Prendas: <strong>${f.prendas.join(', ')}</strong>`);
  else filtroPartes.push('Prendas: todas');
  if (f.talla) filtroPartes.push(`Talla: <strong>${f.talla}</strong>`);
  if (f.escuelas && f.escuelas.length > 0) {
    const nombres = f.escuelas.map(eid => (c.escuelas[eid] || {}).alias || (c.escuelas[eid] || {}).nombre).filter(Boolean).join(', ');
    filtroPartes.push(`Escuelas: <strong>${nombres}</strong>`);
  }
  if (f.ocultarCubiertas) filtroPartes.push('<em>(ocultando cubiertas)</em>');
  const incluyendo = [
    f.incluirCorte  ? 'Corte'      : null,
    f.incluirProd   ? 'Producción' : null,
    f.incluirBodega ? 'Bodega'     : null,
    f.incluirPool   ? 'Pool'       : null,
  ].filter(Boolean).join(' + ');
  filtroPartes.push(`Incluye: <strong>${incluyendo || '(ninguno)'}</strong>`);

  // KPIs cards
  const kpi = (label, val, color) =>
    `<td style="border:1px solid #DDD;padding:6px 8px;text-align:center;background:#F8FBFF">
       <div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.5px">${label}</div>
       <div style="font-size:16px;font-weight:700;color:${color}">${val}</div>
     </td>`;

  const kpisRow = `
    <table style="width:100%;border-collapse:collapse;margin:8px 0 12px 0">
      <tr>
        ${kpi('Demanda total', tot.demanda.toLocaleString(), '#222')}
        ${f.incluirCorte  ? kpi('En corte',      (tot.corte||0).toLocaleString(),       '#888') : ''}
        ${f.incluirProd   ? kpi('En producción', tot.prod.toLocaleString(),              '#2a8f4a') : ''}
        ${f.incluirBodega ? kpi('En bodega',     tot.stockLibre.toLocaleString(),        '#1F4E79') : ''}
        ${f.incluirPool   ? kpi('Pool acaparado',tot.pool.toLocaleString(),              '#a82') : ''}
        ${kpi('Balance', (tot.balance >= 0 ? '+' : '') + tot.balance.toLocaleString(), tot.balance < 0 ? '#C00' : '#2a8f4a')}
      </tr>
    </table>`;

  // Agrupar rows por prenda (cada prenda en una página separada).
  // Excepción: FALDA y FALDA C.E van JUNTAS en una misma página, mezcladas
  // y ordenadas por talla + largo, con la columna Prenda visible.
  const numSuministro = (f.incluirCorte?1:0) + (f.incluirProd?1:0) + (f.incluirBodega?1:0) + (f.incluirPool?1:0);
  const FALDA_VARIANTS = new Set(['FALDA', 'FALDA C.E', 'FALDA CE', 'FALDA-C.E']);
  const groupMap = new Map();
  const groupOrder = [];
  for (const r of rows) {
    const key = FALDA_VARIANTS.has(r.prenda) ? '__FALDA_COMBI__' : r.prenda;
    if (!groupMap.has(key)) { groupMap.set(key, []); groupOrder.push(key); }
    groupMap.get(key).push(r);
  }

  // Parser de talla para orden por número + largo. Tallas tipo: B8, B8-3L,
  // B10+5L, F12, etc. Sufijo de largo: '' < -3L < -5L < +5L.
  function parseTallaParts(t) {
    const m = String(t || '').match(/^([A-Z]*)(\d+)(.*)$/);
    if (!m) return { num: 9999, sufijoOrden: 99, sufijoStr: String(t||'') };
    const sufijo = m[3] || '';
    const sufijoOrden = sufijo === '' ? 0
      : sufijo === '-3L' ? 1 : sufijo === '-5L' ? 2 : sufijo === '+5L' ? 3 : 99;
    return { num: parseInt(m[2], 10) || 0, sufijoOrden, sufijoStr: sufijo };
  }
  function cmpTalla(a, b) {
    const ta = parseTallaParts(a.talla), tb = parseTallaParts(b.talla);
    if (ta.num !== tb.num) return ta.num - tb.num;
    if (ta.sufijoOrden !== tb.sufijoOrden) return ta.sufijoOrden - tb.sufijoOrden;
    if (ta.sufijoStr !== tb.sufijoStr) return ta.sufijoStr.localeCompare(tb.sufijoStr);
    return (a.prenda || '').localeCompare(b.prenda || '');
  }
  for (const grp of groupMap.values()) grp.sort(cmpTalla);

  // Estilos compartidos. Headers TODOS verticales (consistencia visual y
  // así caben columnas angostas con texto completo). Usa position:absolute
  // + transform:rotate(-90deg), patrón que sí renderiza en print Android.
  const thVert = 'background:#1F4E79;color:white;padding:0;height:130px;border:1px solid #1F4E79;position:relative;vertical-align:middle;text-align:center';
  const thVertInner = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-90deg);transform-origin:center center;white-space:nowrap;font-size:12pt;font-weight:600;width:120px;text-align:center;line-height:1';
  const thEscInner = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-90deg);transform-origin:center center;white-space:nowrap;font-size:11pt;font-weight:600;width:120px;text-align:center;line-height:1';
  const tdS = 'padding:5px 6px;border:1px solid #E5E5E5;font-size:12pt;text-align:right;font-family:Arial,sans-serif';
  const tdL = tdS + ';text-align:left';
  const tdEsc = 'padding:5px 2px;border:1px solid #E5E5E5;font-size:10pt;text-align:center;font-family:Arial,sans-serif';

  function buildTablaGrupo(grupoKey, groupRows, isFirst) {
    const isCombi = grupoKey === '__FALDA_COMBI__';
    const nombrePrenda = isCombi ? 'FALDA + FALDA C.E' : grupoKey;
    const subtitulo = isCombi
      ? `<h2 style="margin:14px 0 8px;font-size:18pt;color:#1F4E79;font-weight:700">👗 FALDA + FALDA C.E <span style="font-size:11pt;font-weight:400;color:#666">(mezcladas, ordenadas por talla y largo)</span></h2>`
      : `<h2 style="margin:14px 0 8px;font-size:18pt;color:#1F4E79;font-weight:700">👕 ${nombrePrenda}</h2>`;

    // Anchos: cuando NO hay columna Prenda, redistribuir su espacio
    // a Talla. En combi (FALDA), sí hay columna Prenda.
    const wPrenda = isCombi ? 10 : 0;
    const wTalla = isCombi ? 6 : 12;
    const wNec = 7, wSum = 6, wBal = 8;
    const fijoTotal = wPrenda + wTalla + wNec + (numSuministro * wSum) + wBal;
    const escW = (showEsc && esc.length > 0) ? ((100 - fijoTotal) / esc.length) : 0;

    const cg = `<colgroup>
      ${isCombi ? `<col style="width:${wPrenda}%">` : ''}
      <col style="width:${wTalla}%">
      <col style="width:${wNec}%">
      ${showEsc ? esc.map(() => `<col style="width:${escW.toFixed(3)}%">`).join('') : ''}
      ${f.incluirCorte  ? `<col style="width:${wSum}%">` : ''}
      ${f.incluirProd   ? `<col style="width:${wSum}%">` : ''}
      ${f.incluirBodega ? `<col style="width:${wSum}%">` : ''}
      ${f.incluirPool   ? `<col style="width:${wSum}%">` : ''}
      <col style="width:${wBal}%">
    </colgroup>`;

    const hdr = `
      ${isCombi ? `<th style="${thVert}"><div style="${thVertInner}">Prenda</div></th>` : ''}
      <th style="${thVert}"><div style="${thVertInner}">Talla</div></th>
      <th style="${thVert}"><div style="${thVertInner}">Necesidad</div></th>
      ${showEsc ? esc.map(e => `<th style="${thVert}" title="${(e.nombre||'').replace(/"/g,'&quot;')}"><div style="${thEscInner}">🏫 ${e.alias || e.nombre}</div></th>`).join('') : ''}
      ${f.incluirCorte  ? `<th style="${thVert}"><div style="${thVertInner}">✂️ Corte</div></th>` : ''}
      ${f.incluirProd   ? `<th style="${thVert}"><div style="${thVertInner}">🏭 Prod.</div></th>` : ''}
      ${f.incluirBodega ? `<th style="${thVert}"><div style="${thVertInner}">📦 Bodega</div></th>` : ''}
      ${f.incluirPool   ? `<th style="${thVert}"><div style="${thVertInner}">📥 Pool</div></th>` : ''}
      <th style="${thVert}"><div style="${thVertInner}">Balance</div></th>`;

    const dr = groupRows.map((r, i) => {
      const bg = i % 2 === 0 ? 'background:white' : 'background:#FAFAFA';
      const balColor = r.balance < 0 ? '#C00' : '#2a8f4a';
      return `<tr style="${bg}">
        ${isCombi ? `<td style="${tdL};font-weight:600">${r.prenda}</td>` : ''}
        <td style="${tdL};font-family:monospace;font-weight:700">${r.talla}</td>
        <td style="${tdS};font-weight:700">${r.demanda}</td>
        ${showEsc ? esc.map(e => {
          const n = r.porEsc.get(e.id) || 0;
          return `<td style="${tdEsc};color:${n>0?'#222':'#CCC'}">${n||'·'}</td>`;
        }).join('') : ''}
        ${f.incluirCorte  ? `<td style="${tdS};color:#888">${r.corte || '—'}</td>` : ''}
        ${f.incluirProd   ? `<td style="${tdS};color:#2a8f4a">${r.prod || 0}</td>` : ''}
        ${f.incluirBodega ? `<td style="${tdS};color:#1F4E79">${r.stockLibre || 0}</td>` : ''}
        ${f.incluirPool   ? `<td style="${tdS};color:#a82">${r.pool || 0}</td>` : ''}
        <td style="${tdS};font-weight:700;color:${balColor}">${r.balance>=0?'+':''}${r.balance}</td>
      </tr>`;
    }).join('');

    // Totales del grupo (no globales)
    const gTot = groupRows.reduce((s, r) => ({
      demanda: s.demanda + r.demanda, corte: s.corte + r.corte, prod: s.prod + r.prod,
      stockLibre: s.stockLibre + r.stockLibre, pool: s.pool + r.pool, balance: s.balance + r.balance,
    }), { demanda: 0, corte: 0, prod: 0, stockLibre: 0, pool: 0, balance: 0 });

    const tr = `<tr style="background:#E8F0FE;font-weight:700">
      <td style="${tdL};font-weight:700" colspan="${isCombi ? 2 : 1}">TOTAL ${nombrePrenda}</td>
      <td style="${tdS};font-weight:700">${gTot.demanda}</td>
      ${showEsc ? esc.map(e => {
        const sum = groupRows.reduce((s, r) => s + (r.porEsc.get(e.id) || 0), 0);
        return `<td style="${tdEsc};font-weight:700">${sum||'·'}</td>`;
      }).join('') : ''}
      ${f.incluirCorte  ? `<td style="${tdS};font-weight:700">${gTot.corte}</td>` : ''}
      ${f.incluirProd   ? `<td style="${tdS};font-weight:700">${gTot.prod}</td>` : ''}
      ${f.incluirBodega ? `<td style="${tdS};font-weight:700">${gTot.stockLibre}</td>` : ''}
      ${f.incluirPool   ? `<td style="${tdS};font-weight:700">${gTot.pool}</td>` : ''}
      <td style="${tdS};font-weight:700;color:${gTot.balance<0?'#C00':'#2a8f4a'}">${gTot.balance>=0?'+':''}${gTot.balance}</td>
    </tr>`;

    const pageBreak = isFirst ? '' : '<div style="page-break-before:always"></div>';
    return `${pageBreak}${subtitulo}<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;table-layout:fixed">${cg}<thead><tr>${hdr}</tr></thead><tbody>${dr}${tr}</tbody></table>`;
  }

  const tablasHtml = groupOrder.map((key, idx) =>
    buildTablaGrupo(key, groupMap.get(key), idx === 0)
  ).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;color:#222;padding:6px">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1F4E79;padding-bottom:6px;margin-bottom:8px">
        <div>
          <div style="font-size:18px;font-weight:700;color:#1F4E79">📊 Reporte por talla — Taller IMIS</div>
          <div style="font-size:11px;color:#666;margin-top:2px">Estado de demanda vs suministro (corte, producción, bodega, pool)</div>
        </div>
        <div style="text-align:right;font-size:10px;color:#666">
          <div>Generado: <strong>${fmtFecha}</strong></div>
          <div>${rows.length} fila(s) · ${showEsc ? esc.length + ' escuela(s) en columnas' : 'sin desglose por escuela'}</div>
        </div>
      </div>
      <div style="font-size:10px;color:#444;line-height:1.5;margin-bottom:4px">
        ${filtroPartes.join(' &nbsp;·&nbsp; ')}
      </div>
      ${kpisRow}
      ${tablasHtml}
      <div style="margin-top:10px;font-size:9px;color:#888;text-align:center">
        Generado desde Taller IMIS · <strong>Necesidad</strong> = piezas pendientes (no empacadas/entregadas) ·
        <strong>Balance</strong> = (corte + producción + bodega + pool) − necesidad
      </div>
    </div>`;

  console.log('[tallas PDF] v5 — iframe + window.print() nativo. rows:', rows.length, 'esc:', esc.length);

  // Construir documento HTML completo con @page para tamaño Letter landscape
  // y márgenes consistentes. El browser maneja paginación + render nativo.
  const docHtml = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<title>tallas-resumen-${fileFecha}</title>
<style>
  @page { size: letter landscape; margin: 0.4in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #222; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { padding: 6px; }
  table { border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  h2 { page-break-after: avoid; }
  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>${html}</body>
</html>`;

  // Iframe oculto en flujo del documento. Algunos browsers móviles no
  // permiten window.open() sin gesto explícito — el iframe sí carga
  // siempre porque viene del mismo origin sin popup.
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  // Sentinel para evitar reentradas si el usuario tap dos veces el botón.
  if (window._tallasPdfPending) {
    console.warn('[tallas PDF] ya hay una impresión en curso, ignorando');
    document.body.removeChild(iframe);
    return;
  }
  window._tallasPdfPending = true;

  try {
    const idoc = iframe.contentDocument || iframe.contentWindow.document;
    idoc.open();
    idoc.write(docHtml);
    idoc.close();

    // Esperar a que el contenido se layoutee + fuentes se carguen.
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      // Si ya está cargado (sincrónico tras write+close), igual esperar 1 tick
      if (iframe.contentDocument.readyState === 'complete') {
        setTimeout(finish, 200);
      } else {
        iframe.addEventListener('load', () => setTimeout(finish, 200), { once: true });
        setTimeout(finish, 1500);  // safety net
      }
    });

    // Disparar diálogo de impresión del browser.
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    console.log('[tallas PDF] print() disparado');
  } catch (e) {
    console.error('[tallas PDF] error:', e);
    alert('Error al abrir la vista de impresión: ' + (e && e.message || e));
  } finally {
    // Esperar antes de remover el iframe — algunos browsers cancelan la
    // impresión si se quita el iframe antes de que el usuario interactúe.
    setTimeout(() => {
      window._tallasPdfPending = false;
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 30000);
  }
}

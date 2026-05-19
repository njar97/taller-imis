// ══════════════════════════════════════════════════════════════════════
// INVENTARIO — demanda (alumnos) vs stock (bodega) por prenda × talla
// Equivalente a la pivote ESTADISTICA del Excel.
// ══════════════════════════════════════════════════════════════════════

let invCache = {
  temporadaId: null,
  escuelas: null,
  alumnos: null,        // [{escuela_id, prenda_top, talla_top_key, prenda_bottom, talla_bottom_key}]
  stock: null,          // [{nombre_prenda, talla_key, stock_actual, reservado_empaque}]
  filtros: { escuela: '', prenda: '', soloConDemanda: true },
};

async function initInventario() {
  const root = document.getElementById('est-sub-inventario-view');
  if (!root) return;
  root.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando inventario...</div>';

  try {
    if (!invCache.temporadaId) {
      const t = (await supaFetch('temporada', 'GET', null,
        '?estado=eq.activa&select=id,anio&order=anio.desc&limit=1'))[0]
        || (await supaFetch('temporada', 'GET', null,
        '?select=id,anio&order=anio.desc&limit=1'))[0];
      if (!t) throw new Error('No hay temporada cargada');
      invCache.temporadaId = t.id;
    }

    if (!invCache.escuelas) {
      invCache.escuelas = await supaFetchAll('escuela',
        '?activa=eq.true&select=id,alias,codigo_cde,nombre&order=alias.asc');
    }

    // Demanda: alumnos activos de la temporada
    invCache.alumnos = await supaFetchAll('alumno',
      `?temporada_id=eq.${invCache.temporadaId}&activo=eq.true` +
      '&select=escuela_id,prenda_top,talla_top_key,prenda_bottom,talla_bottom_key');

    // Stock actual desde la vista
    invCache.stock = await supaFetchAll('vw_bodega_stock',
      '?select=nombre_prenda,talla_key,stock_actual,reservado_empaque');

    renderInventario();
  } catch (e) {
    root.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function onInvFiltro(field, val) {
  invCache.filtros[field] = val;
  renderInventario();
}

function renderInventario() {
  const root = document.getElementById('est-sub-inventario-view');
  if (!root) return;
  const f = invCache.filtros;
  const escuelas = invCache.escuelas || [];

  // ─── Computar demanda por (prenda, talla) + cobertura de tallaje ───
  const demanda = new Map(); // key = "PRENDA||TALLA" → count
  let alumnosFiltrados = 0;
  let topConTalla = 0, botConTalla = 0;
  for (const a of (invCache.alumnos || [])) {
    if (f.escuela && a.escuela_id !== f.escuela) continue;
    alumnosFiltrados++;
    if (a.prenda_top && a.talla_top_key) {
      topConTalla++;
      const k = a.prenda_top + '||' + a.talla_top_key;
      demanda.set(k, (demanda.get(k) || 0) + 1);
    }
    if (a.prenda_bottom && a.talla_bottom_key) {
      botConTalla++;
      const k = a.prenda_bottom + '||' + a.talla_bottom_key;
      demanda.set(k, (demanda.get(k) || 0) + 1);
    }
  }
  const piezasPosibles = alumnosFiltrados * 2;
  const piezasConocidas = topConTalla + botConTalla;
  const piezasSinTallar = Math.max(0, piezasPosibles - piezasConocidas);
  const pctTallaje = piezasPosibles > 0 ? Math.round((piezasConocidas / piezasPosibles) * 100) : 0;

  // ─── Indexar stock ────────────────────────────────────────────────
  const stockIdx = new Map(); // key = "PRENDA||TALLA" → {stock, reservado}
  for (const s of (invCache.stock || [])) {
    const k = (s.nombre_prenda || '') + '||' + (s.talla_key || '');
    stockIdx.set(k, {
      stock: s.stock_actual || 0,
      reservado: s.reservado_empaque || 0,
    });
  }

  // ─── Combinar — todas las keys que aparezcan en cualquier lado ────
  const allKeys = new Set([...demanda.keys(), ...stockIdx.keys()]);
  const rows = [];
  for (const k of allKeys) {
    const [prenda, talla] = k.split('||');
    if (f.prenda && prenda !== f.prenda) continue;
    const dem = demanda.get(k) || 0;
    if (f.soloConDemanda && dem === 0) continue;
    const st = stockIdx.get(k) || { stock: 0, reservado: 0 };
    const disponible = Math.max(0, st.stock - st.reservado);
    const falta = Math.max(0, dem - disponible);
    rows.push({ prenda, talla, dem, stock: st.stock, reservado: st.reservado, disponible, falta });
  }

  // Orden: prenda asc, talla asc (lex)
  rows.sort((a, b) =>
    a.prenda.localeCompare(b.prenda) || a.talla.localeCompare(b.talla, undefined, { numeric: true })
  );

  // Totales por prenda
  const totPorPrenda = new Map();
  rows.forEach(r => {
    const t = totPorPrenda.get(r.prenda) || { dem: 0, stock: 0, falta: 0 };
    t.dem += r.dem; t.stock += r.stock; t.falta += r.falta;
    totPorPrenda.set(r.prenda, t);
  });

  // ─── Listas para selectores ──────────────────────────────────────
  const prendas = [...new Set(rows.map(r => r.prenda))].sort();

  const totalDem = rows.reduce((s, r) => s + r.dem, 0);
  const totalStock = rows.reduce((s, r) => s + r.stock, 0);
  const totalFalta = rows.reduce((s, r) => s + r.falta, 0);

  root.innerHTML = `
    <!-- Banner cobertura de tallaje -->
    <div class="alert ${pctTallaje >= 80 ? 'alert-info' : 'alert-warn'}" style="margin-bottom:10px;font-size:12px">
      <strong>Cobertura de tallaje:</strong>
      ${alumnosFiltrados.toLocaleString()} alumnos × 2 = ${piezasPosibles.toLocaleString()} piezas posibles ·
      <strong style="color:var(--verde)">${piezasConocidas.toLocaleString()} con talla cargada</strong> (${pctTallaje}%) ·
      <strong style="color:var(--naranja)">${piezasSinTallar.toLocaleString()} pendientes de tallar</strong>
      <div style="font-size:11px;color:#666;margin-top:4px">
        El detalle de abajo solo muestra las piezas con prenda+talla conocida. Los alumnos sin tallar no generan demanda hasta que se complete la medición.
      </div>
    </div>

    <!-- Filtros -->
    <div class="card" style="padding:10px;margin-bottom:10px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;align-items:end">
        <div class="field" style="margin:0">
          <label>Escuela</label>
          <select onchange="onInvFiltro('escuela', this.value)">
            <option value="">Todas las escuelas</option>
            ${escuelas.map(e => `<option value="${e.id}" ${f.escuela === e.id ? 'selected' : ''}>${e.alias || e.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="margin:0">
          <label>Prenda</label>
          <select onchange="onInvFiltro('prenda', this.value)">
            <option value="">Todas</option>
            ${prendas.map(p => `<option value="${p}" ${f.prenda === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="margin:0">
          <label style="display:flex;gap:6px;align-items:center;font-weight:normal">
            <input type="checkbox" ${f.soloConDemanda ? 'checked' : ''} onchange="onInvFiltro('soloConDemanda', this.checked)">
            Solo tallas con demanda
          </label>
        </div>
        <div style="text-align:right">
          <button class="btn btn-ghost btn-sm" onclick="initInventario()">🔄 Refrescar</button>
        </div>
      </div>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:10px">
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Piezas demandadas</div>
        <div style="font-size:22px;font-weight:700;color:#333">${totalDem.toLocaleString()}</div>
      </div>
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Piezas en stock</div>
        <div style="font-size:22px;font-weight:700;color:var(--verde)">${totalStock.toLocaleString()}</div>
      </div>
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Faltante por producir</div>
        <div style="font-size:22px;font-weight:700;color:var(--naranja)">${totalFalta.toLocaleString()}</div>
      </div>
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Combinaciones</div>
        <div style="font-size:22px;font-weight:700;color:#333">${rows.length.toLocaleString()}</div>
      </div>
    </div>

    <!-- Resumen por prenda -->
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">
      <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">📦 Resumen por prenda</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#FAFAFA">
            <th style="padding:6px 8px;text-align:left">Prenda</th>
            <th style="padding:6px 8px;text-align:right">Demanda</th>
            <th style="padding:6px 8px;text-align:right">Stock</th>
            <th style="padding:6px 8px;text-align:right">Falta</th>
          </tr>
        </thead>
        <tbody>
          ${[...totPorPrenda.entries()].sort((a,b)=>b[1].dem-a[1].dem).map(([p,t]) => `
            <tr style="border-top:1px solid #EEE;cursor:pointer" onclick="onInvFiltro('prenda','${p}')">
              <td style="padding:6px 8px;font-weight:600">${p}</td>
              <td style="padding:6px 8px;text-align:right">${t.dem.toLocaleString()}</td>
              <td style="padding:6px 8px;text-align:right;color:var(--verde)">${t.stock.toLocaleString()}</td>
              <td style="padding:6px 8px;text-align:right;color:${t.falta>0?'var(--naranja)':'#888'};font-weight:${t.falta>0?'700':'normal'}">${t.falta.toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Tabla detalle prenda × talla -->
    <div class="card" style="padding:0;overflow:hidden">
      <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">📋 Detalle por talla ${f.prenda ? `· ${f.prenda}` : ''}</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:520px">
          <thead>
            <tr style="background:#FAFAFA">
              <th style="padding:6px 8px;text-align:left">Prenda</th>
              <th style="padding:6px 8px;text-align:left">Talla</th>
              <th style="padding:6px 8px;text-align:right">Demanda</th>
              <th style="padding:6px 8px;text-align:right">Stock</th>
              <th style="padding:6px 8px;text-align:right">Reservado</th>
              <th style="padding:6px 8px;text-align:right">Disponible</th>
              <th style="padding:6px 8px;text-align:right">Falta</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 ? `
              <tr><td colspan="7" style="padding:20px;text-align:center;color:#888">Sin resultados con los filtros aplicados.</td></tr>
            ` : rows.map(r => `
              <tr style="border-top:1px solid #EEE">
                <td style="padding:5px 8px">${r.prenda}</td>
                <td style="padding:5px 8px;font-family:monospace;font-weight:600">${r.talla}</td>
                <td style="padding:5px 8px;text-align:right;font-weight:600">${r.dem}</td>
                <td style="padding:5px 8px;text-align:right;color:${r.stock>0?'var(--verde)':'#888'}">${r.stock}</td>
                <td style="padding:5px 8px;text-align:right;color:#888">${r.reservado}</td>
                <td style="padding:5px 8px;text-align:right">${r.disponible}</td>
                <td style="padding:5px 8px;text-align:right;color:${r.falta>0?'var(--naranja)':'#888'};font-weight:${r.falta>0?'700':'normal'}">${r.falta}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div style="text-align:center;margin-top:8px;color:#888;font-size:11px">
      Mostrando ${rows.length} combinación(es). Tocá una prenda del resumen para filtrar.
    </div>
  `;
}

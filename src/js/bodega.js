// ══════════════════════════════════════════════════════════════════════
// BODEGA (v22)
// Stock actual de prendas, movimientos, entradas manuales
// ══════════════════════════════════════════════════════════════════════

let bodegaCache = {
  stock: [],
  movimientos: [],
  filtroPrenda: null,
  filtroTallaVacia: false,
  vistaActual: 'stock', // 'stock' | 'movimientos' | 'vs_demanda'
};

async function initBodega() {
  renderBodegaTabs();
  await cargarBodegaStock();
}

function renderBodegaTabs() {
  const cont = document.getElementById('bodega-tabs');
  if (!cont) return;
  cont.innerHTML = `
    <div class="sub-tabs">
      <div class="sub-tab ${bodegaCache.vistaActual==='stock'?'active':''}" onclick="cambiarVistaBodega('stock')">📦 Stock</div>
      <div class="sub-tab ${bodegaCache.vistaActual==='vs_demanda'?'active':''}" onclick="cambiarVistaBodega('vs_demanda')">📊 Stock vs Demanda</div>
      <div class="sub-tab ${bodegaCache.vistaActual==='movimientos'?'active':''}" onclick="cambiarVistaBodega('movimientos')">🔄 Movimientos</div>
    </div>
  `;
}

async function cambiarVistaBodega(v) {
  bodegaCache.vistaActual = v;
  renderBodegaTabs();
  if (v === 'stock') await cargarBodegaStock();
  else if (v === 'vs_demanda') await cargarBodegaVsDemanda();
  else if (v === 'movimientos') await cargarMovimientos();
}

async function cargarBodegaStock() {
  const cont = document.getElementById('bodega-contenido');
  if (cont) cont.innerHTML = '<div class="text-muted">Cargando stock...</div>';
  // Cualquier carga de stock invalida caches dependientes (las acciones
  // que llaman a cargarBodegaStock ya cambiaron el estado).
  if (typeof invalidarCache === 'function') {
    invalidarCache('bodega');
    invalidarCache('pool');
    invalidarCache('alumnos');
  }
  try {
    await tiSWR('bodega_stock_v1', async () => {
      const [stock, pool] = await Promise.all([
        supaFetch('vw_bodega_stock', 'GET', null, '?order=nombre_prenda,talla_key&limit=1000'),
        supaFetchAll('escuela_acaparado', '?select=escuela_id,nombre_prenda,talla_key,cantidad_acaparada,cantidad_consumida'),
      ]);
      return { stock, pool };
    }, (data /*, fromCache */) => {
      bodegaCache.stock = data.stock;
      bodegaCache.pool = data.pool;
      bodegaCache.poolTotal = (data.pool || []).reduce(
        (s, p) => s + Math.max(0, (Number(p.cantidad_acaparada)||0) - (Number(p.cantidad_consumida)||0)), 0);
      renderStock();
      if (typeof refrescarBadgeEsperando === 'function') refrescarBadgeEsperando();
    }, { ttl: 60 * 1000 });  // 60s — stock cambia rápido por acciones del user
  } catch(e) {
    if (cont) cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function renderStock() {
  const cont = document.getElementById('bodega-contenido');
  let stock = bodegaCache.stock;
  
  if (bodegaCache.filtroPrenda) stock = stock.filter(s => s.nombre_prenda === bodegaCache.filtroPrenda);
  if (!bodegaCache.filtroTallaVacia) stock = stock.filter(s => (s.stock_actual||0) !== 0 || (s.total_entrado||0) > 0);
  
  // Agrupar por prenda
  const grupos = {};
  for (const s of stock) {
    const p = s.nombre_prenda || s.cod_prenda;
    if (!grupos[p]) grupos[p] = [];
    grupos[p].push(s);
  }
  
  const prendas = Object.keys(grupos).sort();
  const filtroBar = `
    <div style="background:white;padding:8px;border-radius:8px;margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <label style="font-size:12px">Prenda:</label>
      <select onchange="bodegaCache.filtroPrenda = this.value || null; renderStock()" style="padding:4px 8px">
        <option value="">Todas</option>
        ${prendas.map(p => `<option value="${p}" ${p===bodegaCache.filtroPrenda?'selected':''}>${p}</option>`).join('')}
      </select>
      <label style="font-size:12px;display:flex;align-items:center;gap:4px">
        <input type="checkbox" ${bodegaCache.filtroTallaVacia?'checked':''} 
               onchange="bodegaCache.filtroTallaVacia = this.checked; renderStock()">
        Mostrar vacíos
      </label>
      <button class="btn btn-success btn-sm" onclick="abrirEntradaManual()">📥 + Entrada</button>
      <button class="btn btn-ghost btn-sm" onclick="abrirConteoModal()" title="Carga rápida de stock físico (baseline)">📊 Conteo inicial</button>
      <button class="btn btn-warning btn-sm" onclick="abrirAcapararModal()" title="Bloquear cantidad para una escuela (sin alumnos)">📥 Acaparar</button>
      <button class="btn btn-primary btn-sm" onclick="abrirEmpacarSelector()">📦 Empacar a alumnos</button>
      ${(bodegaCache.poolTotal || 0) > 0
        ? `<button class="btn btn-warning btn-sm" onclick="abrirEmpacarAcaparadosModal()" title="Asignar piezas del pool acaparado a alumnos">📥 Empacar acaparados (${bodegaCache.poolTotal})</button>`
        : ''}
      <button class="btn btn-success btn-sm" onclick="abrirEntregaModal()" title="Marcar todos los empacados de una escuela como entregados">🚚 Marcar entrega</button>
      <button class="btn btn-ghost btn-sm" onclick="abrirSalidaModal()" title="Salida genérica (sin alumnos)">↗ Salida rápida</button>
      <button class="btn btn-ghost btn-sm" onclick="cargarBodegaStock()">🔄 Refrescar</button>
    </div>
  `;
  
  if (stock.length === 0) {
    cont.innerHTML = filtroBar + '<div class="alert alert-info">No hay movimientos de bodega aún. Cuando termines bultos o agregues entradas manuales, aparecerá stock.</div>';
    return;
  }
  
  const html = Object.entries(grupos).map(([prenda, items]) => {
    const totStock = items.reduce((a,s)=>a+(s.stock_actual||0),0);
    const totReserv = items.reduce((a,s)=>a+(s.reservado_empaque||0),0);
    return `
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:8px">
      <div style="background:#F5F7FA;padding:8px 12px;font-weight:600;display:flex;justify-content:space-between">
        <span>${prenda}</span>
        <span style="font-size:13px">Stock: <strong>${totStock.toLocaleString()}</strong> · Reservado: <strong>${totReserv}</strong></span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#FAFAFA">
            <th style="padding:6px 8px;text-align:left">Talla</th>
            <th style="padding:6px 8px;text-align:right">Entrado</th>
            <th style="padding:6px 8px;text-align:right">Salido</th>
            <th style="padding:6px 8px;text-align:right">Reservado</th>
            <th style="padding:6px 8px;text-align:right">Stock</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(s => `
            <tr style="border-top:1px solid #EEE">
              <td style="padding:4px 8px;font-family:monospace;font-weight:600">${s.talla_key}</td>
              <td style="padding:4px 8px;text-align:right;color:#0a7">${s.total_entrado||0}</td>
              <td style="padding:4px 8px;text-align:right;color:#c44">${s.total_salido||0}</td>
              <td style="padding:4px 8px;text-align:right;color:#888">${s.reservado_empaque||0}</td>
              <td style="padding:4px 8px;text-align:right;font-weight:700;color:${(s.stock_actual||0)>0?'var(--azul)':'#999'}">${s.stock_actual||0}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
  }).join('');
  
  cont.innerHTML = filtroBar + html;
}

async function cargarBodegaVsDemanda() {
  const cont = document.getElementById('bodega-contenido');
  cont.innerHTML = '<div class="text-muted">Calculando demanda vs stock...</div>';
  try {
    const data = await supaFetch('vw_bodega_vs_demanda', 'GET', null, '?order=faltante.desc&limit=500');
    renderVsDemanda(data);
  } catch(e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function renderVsDemanda(data) {
  const cont = document.getElementById('bodega-contenido');
  if (!data || data.length === 0) {
    cont.innerHTML = '<div class="alert alert-info">Sin datos. Carga alumnos para ver la demanda vs stock.</div>';
    return;
  }
  
  const totFaltante = data.reduce((a,d) => a + (d.faltante||0), 0);
  const totDemanda = data.reduce((a,d) => a + (d.demandada||0), 0);
  const totStock = data.reduce((a,d) => a + (d.stock_disponible||0), 0);
  
  cont.innerHTML = `
    <div class="card" style="padding:10px;margin-bottom:10px">
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px">
        <div>Demanda total: <strong>${totDemanda.toLocaleString()}</strong></div>
        <div style="color:var(--azul)">Stock disponible: <strong>${totStock.toLocaleString()}</strong></div>
        <div style="color:var(--naranja)">Faltan producir: <strong>${totFaltante.toLocaleString()}</strong></div>
      </div>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">📊 Por talla</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#FAFAFA">
            <th style="padding:6px 8px;text-align:left">Prenda</th>
            <th style="padding:6px 8px;text-align:left">Talla</th>
            <th style="padding:6px 8px;text-align:right">Demanda</th>
            <th style="padding:6px 8px;text-align:right">Empacado</th>
            <th style="padding:6px 8px;text-align:right">Stock</th>
            <th style="padding:6px 8px;text-align:right">Faltan</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(d => {
            const falt = d.faltante||0;
            const color = falt > 0 ? 'var(--naranja)' : 'var(--verde)';
            return `
              <tr style="border-top:1px solid #EEE">
                <td style="padding:4px 8px">${d.prenda||'?'}</td>
                <td style="padding:4px 8px;font-family:monospace;font-weight:600">${d.talla_key}</td>
                <td style="padding:4px 8px;text-align:right">${d.demandada||0}</td>
                <td style="padding:4px 8px;text-align:right;color:#666">${d.empacados||0}</td>
                <td style="padding:4px 8px;text-align:right;color:var(--azul);font-weight:600">${d.stock_disponible||0}</td>
                <td style="padding:4px 8px;text-align:right;color:${color};font-weight:700">${falt}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function cargarMovimientos() {
  const cont = document.getElementById('bodega-contenido');
  cont.innerHTML = '<div class="text-muted">Cargando movimientos...</div>';
  try {
    const movs = await supaFetch('bodega_movimiento', 'GET', null, '?order=creado_en.desc&limit=200');
    renderMovimientos(movs);
  } catch(e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function renderMovimientos(movs) {
  const cont = document.getElementById('bodega-contenido');
  if (!movs || movs.length === 0) {
    cont.innerHTML = `
      <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-success btn-sm" onclick="abrirEntradaManual()">📥 + Entrada</button>
        <button class="btn btn-primary btn-sm" onclick="abrirAsignarModal()">🎯 Asignar / Empacar / Entregar</button>
        <button class="btn btn-ghost btn-sm" onclick="abrirSalidaModal()" title="Salida genérica (sin alumnos)">🚚 Salida rápida</button>
      </div>
      <div class="alert alert-info">Sin movimientos registrados.</div>`;
    return;
  }
  
  const tipoIcon = {
    ENTRADA_PRODUCCION: '🏭 +',
    ENTRADA_MANUAL: '📥 +',
    SALIDA_EMPAQUE: '📦 -',
    SALIDA_ENTREGA: '🚚 -',
    AJUSTE_INVENTARIO: '⚖',
    DEFECTO: '✗',
  };
  const tipoColor = {
    ENTRADA_PRODUCCION: '#0a7',
    ENTRADA_MANUAL: '#0a7',
    SALIDA_EMPAQUE: '#888',
    SALIDA_ENTREGA: '#c44',
    AJUSTE_INVENTARIO: '#f80',
    DEFECTO: '#c44',
  };
  
  cont.innerHTML = `
    <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-success btn-sm" onclick="abrirEntradaManual()">📥 + Entrada</button>
      <button class="btn btn-primary btn-sm" onclick="abrirSalidaModal()">🚚 Salida a escuela</button>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#F5F7FA">
            <th style="padding:6px 8px;text-align:left">Fecha</th>
            <th style="padding:6px 8px;text-align:left">Tipo</th>
            <th style="padding:6px 8px;text-align:left">Prenda/Talla</th>
            <th style="padding:6px 8px;text-align:right">Cant.</th>
            <th style="padding:6px 8px;text-align:left">Notas</th>
          </tr>
        </thead>
        <tbody>
          ${movs.map(m => `
            <tr style="border-top:1px solid #EEE">
              <td style="padding:4px 8px;color:#666;font-size:11px">${new Date(m.creado_en).toLocaleString('es-SV',{dateStyle:'short',timeStyle:'short'})}</td>
              <td style="padding:4px 8px;color:${tipoColor[m.tipo]}">${tipoIcon[m.tipo]||''} ${m.tipo.replace('_',' ')}</td>
              <td style="padding:4px 8px"><strong>${m.nombre_prenda||m.cod_prenda}</strong> · ${m.talla_key}</td>
              <td style="padding:4px 8px;text-align:right;font-weight:700">${m.cantidad}</td>
              <td style="padding:4px 8px;font-size:11px;color:#666">${m.observaciones||''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ─── Modal: entrada manual ─────────────────────────────────────────
function abrirEntradaManual() {
  const modal = document.getElementById('bodega-entrada-modal');
  if (!modal) return;
  document.getElementById('ent-prenda').value = '';
  document.getElementById('ent-talla').value = '';
  document.getElementById('ent-cantidad').value = '';
  document.getElementById('ent-obs').value = '';
  document.getElementById('ent-tipo').value = 'ENTRADA_MANUAL';
  modal.style.display = 'flex';
}

function cerrarEntradaManual() {
  document.getElementById('bodega-entrada-modal').style.display = 'none';
}

async function guardarEntradaManual() {
  const prenda = document.getElementById('ent-prenda').value.trim();
  const talla = document.getElementById('ent-talla').value.trim();
  const cantidad = parseInt(document.getElementById('ent-cantidad').value);
  const obs = document.getElementById('ent-obs').value.trim() || null;
  const tipo = document.getElementById('ent-tipo').value;
  
  if (!prenda || !talla || !cantidad || cantidad <= 0) {
    alert('Completá prenda, talla y cantidad > 0'); return;
  }
  
  // Derivar cod_prenda (1ras letras mayus)
  const codPrenda = ({
    'CAMISA':'C','BLUSA':'B','CAMISA_CELESTE':'CC','PANTALON':'P','PANTALON_BEIGE':'PB',
    'FALDA':'F','FALDA_BEIGE':'FB','FALDA_C.E':'FCE','SHORT':'S'
  })[prenda.toUpperCase()] || prenda.slice(0,3).toUpperCase();
  
  try {
    await supaFetch('bodega_movimiento', 'POST', {
      tipo, cod_prenda: codPrenda, nombre_prenda: prenda.toUpperCase(), talla_key: talla,
      cantidad, observaciones: obs
    });
    cerrarEntradaManual();
    await cargarBodegaStock();
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// EMPACAR ACAPARADOS — consumir pool con flujo manual o auto
// ═══════════════════════════════════════════════════════════════════
let empAcaCache = { entries: null, escuelas: null };

async function abrirEmpacarAcaparadosModal() {
  const modal = document.getElementById('bodega-empacar-acaparados-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.getElementById('emp-aca-resumen').innerHTML = '<div class="text-muted" style="font-size:12px">Cargando pool...</div>';

  try {
    const [pool, escuelas] = await Promise.all([
      supaFetchAll('escuela_acaparado', '?select=id,escuela_id,nombre_prenda,talla_key,cantidad_acaparada,cantidad_consumida'),
      empAcaCache.escuelas
        ? Promise.resolve(empAcaCache.escuelas)
        : supaFetchAll('escuela', '?activa=eq.true&select=id,alias,nombre&order=alias'),
    ]);
    empAcaCache.escuelas = escuelas;
    const escMap = {};
    for (const e of escuelas) escMap[e.id] = e.alias || e.nombre;

    // Solo entries con disponible > 0
    const entries = pool.map(p => ({
      escuela_id: p.escuela_id,
      escuela: escMap[p.escuela_id] || '(?)',
      prenda: p.nombre_prenda,
      talla: p.talla_key,
      disp: Math.max(0, (Number(p.cantidad_acaparada)||0) - (Number(p.cantidad_consumida)||0)),
    })).filter(e => e.disp > 0);
    empAcaCache.entries = entries;

    if (entries.length === 0) {
      document.getElementById('emp-aca-resumen').innerHTML =
        '<div class="alert alert-info">No hay piezas acaparadas pendientes de asignar.</div>';
      document.getElementById('emp-aca-btn-auto').disabled = true;
      document.getElementById('emp-aca-btn-manual').disabled = true;
      return;
    }
    document.getElementById('emp-aca-btn-auto').disabled = false;
    document.getElementById('emp-aca-btn-manual').disabled = false;

    // Agrupar por escuela para presentación
    const porEsc = {};
    for (const e of entries) {
      if (!porEsc[e.escuela_id]) porEsc[e.escuela_id] = { nombre: e.escuela, filas: [], total: 0 };
      porEsc[e.escuela_id].filas.push(e);
      porEsc[e.escuela_id].total += e.disp;
    }
    const total = entries.reduce((s, e) => s + e.disp, 0);
    const grupos = Object.values(porEsc).sort((a,b) => b.total - a.total);

    document.getElementById('emp-aca-resumen').innerHTML = `
      <div style="font-size:13px;margin-bottom:8px"><strong>${total} pieza${total===1?'':'s'}</strong> en pool · ${grupos.length} escuela(s)</div>
      ${grupos.map(g => `
        <div style="border:1px solid #E0E4EA;border-radius:6px;margin-bottom:6px;overflow:hidden">
          <div style="background:#FFF9E6;padding:6px 10px;font-size:13px;font-weight:700;display:flex;justify-content:space-between">
            <span>🏫 ${escapeHtmlAca(g.nombre)}</span>
            <span style="color:#666">${g.total} pieza${g.total===1?'':'s'}</span>
          </div>
          <div style="padding:4px 10px;display:flex;flex-wrap:wrap;gap:4px">
            ${g.filas.map(f => `
              <span style="background:white;border:1px solid #FFD24D;padding:2px 8px;border-radius:4px;font-size:11px">
                <strong>${escapeHtmlAca(f.prenda)}</strong> ${escapeHtmlAca(f.talla)}: ${f.disp}
              </span>
            `).join('')}
          </div>
        </div>
      `).join('')}
    `;
  } catch(e) {
    document.getElementById('emp-aca-resumen').innerHTML =
      `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function cerrarEmpacarAcaparadosModal() {
  document.getElementById('bodega-empacar-acaparados-modal').style.display = 'none';
}

// → Salta al tab Registro filtrado a los alumnos que matchean entries del pool.
async function empacarAcaparadosManual() {
  const entries = empAcaCache.entries || [];
  if (entries.length === 0) return alert('No hay pool para empacar');
  const completarParejas = !!document.getElementById('emp-aca-completar-parejas')?.checked;
  cerrarEmpacarAcaparadosModal();

  const prendas = [...new Set(entries.map(e => e.prenda))];
  const escIds = [...new Set(entries.map(e => e.escuela_id))];

  if (typeof alumnosGlobalCache !== 'undefined') {
    alumnosGlobalCache.modoEmpaque = true;
    alumnosGlobalCache.empCombos = [];
    alumnosGlobalCache.empPrendas = prendas;
    alumnosGlobalCache.empPoolEntries = entries.map(e => ({
      escuela_id: e.escuela_id, prenda: e.prenda, talla: e.talla,
    }));
    alumnosGlobalCache.empMarcadosTop = new Set();
    alumnosGlobalCache.empMarcadosBot = new Set();
    alumnosGlobalCache.empCompletarParejas = completarParejas;
    alumnosGlobalCache.busqueda = '';
    alumnosGlobalCache.filtroEscuela = '';
    alumnosGlobalCache.filtroEscuelas = escIds.length === 1 ? [escIds[0]] : escIds;
    alumnosGlobalCache.filtroEstado = '';
    if (typeof cargarSupplyEmpaque === 'function') cargarSupplyEmpaque();
  }
  if (typeof switchTab === 'function') switchTab('registro');
  setTimeout(() => {
    if (typeof alumnosGlobalCache !== 'undefined' && alumnosGlobalCache.cargado) {
      renderAlumnosGlobal();
    } else if (typeof initAlumnosGlobal === 'function') {
      initAlumnosGlobal();
    }
  }, 50);
}

// Asignación automática: por cada entry del pool, agarra los primeros N
// alumnos que coincidan (escuela + prenda + talla, no empacado/entregado)
// y los empaca con la lógica habitual (consume pool primero).
async function empacarAcaparadosAuto() {
  const entries = empAcaCache.entries || [];
  if (entries.length === 0) return alert('No hay pool para empacar');

  // Confirmación clara
  const total = entries.reduce((s, e) => s + e.disp, 0);
  if (!confirm(`¿Asignar automáticamente ${total} pieza(s) del pool a alumnos?\n\nSe van a tomar los primeros alumnos pendientes que coincidan con cada entrada del pool, y se marcan como empacados.\n\nNo se puede deshacer en bloque (sí desde el audit log si hace falta).`)) return;

  const btn = document.getElementById('emp-aca-btn-auto');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Asignando...'; }

  try {
    // 1) Cargar alumnos lite de las escuelas involucradas
    const escIds = [...new Set(entries.map(e => e.escuela_id))];
    const alumnos = await supaFetchAll('alumno',
      `?activo=eq.true&escuela_id=in.(${escIds.join(',')})&select=id,nombre,escuela_id,prenda_top,talla_top_key,estado_top,prenda_bottom,talla_bottom_key,estado_bottom&limit=10000`);

    // 2) Por cada entry, seleccionar alumnos a empacar
    // Cada alumno puede contar para top y para bottom — los tratamos como
    // "candidatos" por pieza, marcando el alumno una sola vez.
    const seleccionados = new Map();  // alumno_id → alumno (objeto)
    // Para evitar over-asignar, mantenemos contadores por entry
    const sortedEntries = entries.slice().sort((a,b) => b.disp - a.disp);
    for (const e of sortedEntries) {
      let restante = e.disp;
      for (const a of alumnos) {
        if (restante <= 0) break;
        if (a.escuela_id !== e.escuela_id) continue;
        const topMatch = a.prenda_top === e.prenda && a.talla_top_key === e.talla
          && a.estado_top !== 'empacado' && a.estado_top !== 'entregado';
        const botMatch = a.prenda_bottom === e.prenda && a.talla_bottom_key === e.talla
          && a.estado_bottom !== 'empacado' && a.estado_bottom !== 'entregado';
        if (!topMatch && !botMatch) continue;
        // Asegurar que un alumno no se cuente dos veces para la misma entry
        // (caso extremo prenda_top == prenda_bottom). Si ya está seleccionado para esta entry, skipear.
        // Lo simplificamos: usamos un set por entry-pieza.
        // Pero la lógica de empacar de empacarAlumnosDesdeRegistro ya maneja pool por pieza,
        // así que basta con incluir al alumno y la función decide qué piezas empacar.
        seleccionados.set(a.id, a);
        // Decrementar 1 por pieza que matchea (si matchea ambas piezas, decremento solo 1 que es lo más común)
        restante--;
      }
    }

    if (seleccionados.size === 0) {
      alert('⚠ No se encontraron alumnos pendientes que coincidan con el pool. Verificá que tengas alumnos en estas escuelas con esas tallas.');
      return;
    }

    // 3) Empacar usando la lógica habitual (pool-first)
    const prendasSet = new Set(entries.map(e => e.prenda));
    const completarParejas = !!document.getElementById('emp-aca-completar-parejas')?.checked;
    const r = await empacarAlumnosDesdeRegistro([...seleccionados.values()], prendasSet, { completarParejas });
    if (r.errores && r.errores.length > 0) {
      alert('❌ Hubo problemas:\n\n' + r.errores.join('\n'));
      return;
    }

    cerrarEmpacarAcaparadosModal();
    await cargarBodegaStock();
    const pareja = r.piezasPareja ? `\n${r.piezasPareja} pieza(s) extras por "completar pareja".` : '';
    alert(`✓ Auto-marcado: ${r.actualizados} alumno(s).\n${r.piezasPool} pieza(s) del pool · ${r.piezasStock} del stock libre.${pareja}`);
  } catch(e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Auto marcar todos'; }
  }
}

// ═══════════════════════════════════════════════════════════════════
// CONTEO INICIAL — carga rápida de stock físico (baseline)
// ═══════════════════════════════════════════════════════════════════
// Lista filas editables (prenda + talla + físico). Por cada fila con
// cantidad ingresada genera un AJUSTE_INVENTARIO con la diferencia
// necesaria para que el stock_actual quede en el valor físico contado.
// ═══════════════════════════════════════════════════════════════════
let conteoCache = { stockMap: {}, filas: [] };

async function abrirConteoModal() {
  const modal = document.getElementById('bodega-conteo-modal');
  if (!modal) return;
  conteoCache.filas = [];
  modal.style.display = 'flex';
  try {
    const stock = await supaFetchAll('vw_bodega_stock',
      '?select=nombre_prenda,cod_prenda,talla_key,stock_actual');
    const map = {};
    for (const s of stock) {
      const p = s.nombre_prenda || s.cod_prenda;
      map[p + '|' + s.talla_key] = { prenda: p, talla: s.talla_key, stockApp: Number(s.stock_actual)||0 };
    }
    conteoCache.stockMap = map;
    // Pre-cargar todas las combinaciones que ya aparecen en stock (incluso si stock=0)
    conteoCache.filas = Object.values(map)
      .sort((a,b) => a.prenda.localeCompare(b.prenda) || a.talla.localeCompare(b.talla, 'es', { numeric: true }))
      .map(s => ({ prenda: s.prenda, talla: s.talla, stockApp: s.stockApp, fisico: '' }));
    renderConteoTabla();
  } catch(e) { alert('Error: '+e.message); }
}
function cerrarConteoModal() { document.getElementById('bodega-conteo-modal').style.display = 'none'; }

async function conteoCargarSugeridos() {
  // Combinaciones (prenda, talla) que aparecen en alumnos pendientes y no
  // están todavía en las filas. Las agrega arriba.
  try {
    const alumnos = await supaFetchAll('alumno',
      '?activo=eq.true&select=prenda_top,talla_top_key,estado_top,prenda_bottom,talla_bottom_key,estado_bottom&limit=10000');
    const necesita = new Set();
    for (const a of alumnos) {
      if (a.prenda_top && a.talla_top_key) necesita.add(a.prenda_top + '|' + a.talla_top_key);
      if (a.prenda_bottom && a.talla_bottom_key) necesita.add(a.prenda_bottom + '|' + a.talla_bottom_key);
    }
    const yaPresentes = new Set(conteoCache.filas.map(f => f.prenda + '|' + f.talla));
    let added = 0;
    for (const k of necesita) {
      if (yaPresentes.has(k)) continue;
      const [p, t] = k.split('|');
      const existing = conteoCache.stockMap[k];
      conteoCache.filas.push({ prenda: p, talla: t, stockApp: existing ? existing.stockApp : 0, fisico: '' });
      added++;
    }
    // Re-ordenar
    conteoCache.filas.sort((a,b) =>
      a.prenda.localeCompare(b.prenda) || a.talla.localeCompare(b.talla, 'es', { numeric: true }));
    renderConteoTabla();
    if (added === 0) alert('Ya están todas las combinaciones con demanda.');
  } catch(e) { alert('Error: '+e.message); }
}

function conteoAgregarFila() {
  conteoCache.filas.push({ prenda: '', talla: '', stockApp: 0, fisico: '', nueva: true });
  renderConteoTabla();
  // Focus en la nueva fila
  setTimeout(() => {
    const tbody = document.getElementById('conteo-tbody');
    const last = tbody && tbody.lastElementChild;
    const input = last && last.querySelector('input[data-col="prenda"]');
    if (input) input.focus();
  }, 50);
}

function renderConteoTabla() {
  const tbody = document.getElementById('conteo-tbody');
  if (!tbody) return;
  const filas = conteoCache.filas;
  tbody.innerHTML = filas.map((f, i) => {
    const fisicoNum = parseInt(f.fisico, 10);
    const delta = (!isNaN(fisicoNum)) ? (fisicoNum - (f.stockApp || 0)) : null;
    const deltaTxt = delta == null ? '<span style="color:#aaa">—</span>'
      : (delta === 0 ? '<span style="color:#888">0</span>'
        : `<span style="color:${delta>0?'var(--verde)':'var(--rojo)'};font-weight:700">${delta>0?'+':''}${delta}</span>`);
    const disabled = f.nueva ? '' : 'readonly style="background:#f6f8fa;color:#666;border:none;width:100%"';
    return `
      <tr style="border-top:1px solid #EEE">
        <td style="padding:4px 8px">
          ${f.nueva
            ? `<input type="text" value="${f.prenda||''}" data-col="prenda" oninput="conteoSetFila(${i},'prenda',this.value)" placeholder="ej: CAMISA" style="width:100%;padding:2px 4px">`
            : `<span>${escapeHtmlAca(f.prenda)}</span>`}
        </td>
        <td style="padding:4px 8px">
          ${f.nueva
            ? `<input type="text" value="${f.talla||''}" data-col="talla" oninput="conteoSetFila(${i},'talla',this.value)" placeholder="ej: C14" style="width:100%;padding:2px 4px">`
            : `<span style="font-family:monospace">${escapeHtmlAca(f.talla)}</span>`}
        </td>
        <td style="padding:4px 8px;text-align:right;color:#666">${f.stockApp || 0}</td>
        <td style="padding:4px 8px;text-align:right">
          <input type="number" value="${f.fisico}" min="0" data-col="fisico"
                 oninput="conteoSetFila(${i},'fisico',this.value)"
                 style="width:70px;padding:2px 4px;text-align:right">
        </td>
        <td style="padding:4px 8px;text-align:right">${deltaTxt}</td>
        <td style="padding:4px 8px;text-align:center">
          <button class="btn-mini" onclick="conteoQuitarFila(${i})" title="Quitar fila">✕</button>
        </td>
      </tr>
    `;
  }).join('');
  const conCambio = filas.filter(f => {
    const n = parseInt(f.fisico, 10);
    return !isNaN(n) && n !== (f.stockApp || 0);
  }).length;
  document.getElementById('conteo-meta').textContent =
    `${filas.length} fila(s) · ${conCambio} con cambio a aplicar`;
}

function conteoSetFila(idx, col, val) {
  if (!conteoCache.filas[idx]) return;
  conteoCache.filas[idx][col] = val;
  if (col === 'fisico') renderConteoTabla();
}
function conteoQuitarFila(idx) {
  conteoCache.filas.splice(idx, 1);
  renderConteoTabla();
}

async function aplicarConteoInicial() {
  const filas = (conteoCache.filas || []).map(f => {
    const n = parseInt(f.fisico, 10);
    if (isNaN(n)) return null;
    const stockApp = f.stockApp || 0;
    if (n === stockApp) return null;
    if (!f.prenda || !f.talla) return null;
    return {
      prenda: (f.prenda || '').trim().toUpperCase(),
      talla: (f.talla || '').trim().toUpperCase(),
      delta: n - stockApp,
      fisico: n,
    };
  }).filter(Boolean);

  if (filas.length === 0) {
    alert('No hay filas con cambio. Ingresá la cantidad física donde corresponda.');
    return;
  }

  if (!confirm(`¿Aplicar conteo a ${filas.length} fila(s)?\n\nSe crea 1 AJUSTE_INVENTARIO por fila con la diferencia necesaria para llegar al valor físico.\nNo se puede deshacer en bloque (sí por audit log).`)) return;

  const btn = document.getElementById('conteo-btn-aplicar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Aplicando...'; }

  try {
    const today = new Date().toISOString().slice(0,10);
    const movs = filas.map(f => ({
      tipo: 'AJUSTE_INVENTARIO',
      cod_prenda: _codPrenda(f.prenda),
      nombre_prenda: f.prenda,
      talla_key: f.talla,
      cantidad: f.delta,  // puede ser negativo
      fecha: today,
      observaciones: `Conteo inicial — físico ${f.fisico}`,
    }));
    await supaFetch('bodega_movimiento', 'POST', movs);
    cerrarConteoModal();
    await cargarBodegaStock();
    alert(`✓ Conteo aplicado: ${filas.length} ajuste(s) registrado(s) en bodega.`);
  } catch(e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Aplicar conteo'; }
  }
}

// ═══════════════════════════════════════════════════════════════════
// SELECTOR DE EMPAQUE → tab Registro
// ═══════════════════════════════════════════════════════════════════
// Modal previo: elegir prendas + (opcional) escuela.
// Luego salta al tab Registro con esos filtros y modo empaque activo.
// ═══════════════════════════════════════════════════════════════════
let empSelCache = {
  escuelas: null, pool: null, alumnos: null,
  combosMarcados: new Set(),   // claves "nivel|sexo|prenda_top|prenda_bottom"
};

const _NIVEL_LBL = { PARV: 'Parvularia', BASICA: 'Básica', BACH: 'Bachillerato', OTRO: 'Otro' };
const _SEXO_LBL  = { F: '♀ Niñas', M: '♂ Niños' };

async function abrirEmpacarSelector() {
  const modal = document.getElementById('bodega-empacar-selector-modal');
  if (!modal) return;
  empSelCache.combosMarcados = new Set();
  document.getElementById('emp-sel-pool-info').style.display = 'none';
  modal.style.display = 'flex';
  try {
    const [escuelas, alumnos, pool] = await Promise.all([
      empSelCache.escuelas
        ? Promise.resolve(empSelCache.escuelas)
        : supaFetchAll('escuela', '?activa=eq.true&select=id,alias,nombre&order=alias'),
      supaFetchAll('alumno', '?activo=eq.true&select=escuela_id,nivel,sexo,prenda_top,talla_top_key,estado_top,prenda_bottom,talla_bottom_key,estado_bottom&limit=10000'),
      supaFetchAll('escuela_acaparado', '?select=escuela_id,nombre_prenda,talla_key,cantidad_acaparada,cantidad_consumida'),
    ]);
    empSelCache.escuelas = escuelas;
    empSelCache.alumnos = alumnos;
    empSelCache.pool = pool;

    const selE = document.getElementById('emp-sel-escuela');
    selE.innerHTML = '<option value="">— Todas las escuelas —</option>' +
      escuelas.map(e => `<option value="${e.id}">${e.alias || e.nombre}</option>`).join('');

    // Si vino un hint desde el badge de Producción, preseleccionar combos
    // cuya prenda (top o bottom) matchee con el hint.prenda.
    if (window._empSelHint) {
      const hint = window._empSelHint;
      window._empSelHint = null;
      for (const a of alumnos) {
        if (!a.nivel || !a.sexo || (!a.prenda_top && !a.prenda_bottom)) continue;
        if (a.prenda_top !== hint.prenda && a.prenda_bottom !== hint.prenda) continue;
        const k = `${a.nivel}|${a.sexo}|${a.prenda_top || ''}|${a.prenda_bottom || ''}`;
        empSelCache.combosMarcados.add(k);
      }
    }

    renderEmpSelCombos();
    refrescarPoolEmpSelector();
  } catch(e) { alert('Error: '+e.message); }
}
function cerrarEmpacarSelector() { document.getElementById('bodega-empacar-selector-modal').style.display = 'none'; }

// Calcula y renderiza las combinaciones disponibles según la escuela elegida.
// Una combinación = nivel × sexo × prenda_top × prenda_bottom (con conteo de
// pendientes para esa combo).
function renderEmpSelCombos() {
  const escId = document.getElementById('emp-sel-escuela').value;
  const cont = document.getElementById('emp-sel-combos');
  const alumnos = empSelCache.alumnos || [];
  const filtrados = escId ? alumnos.filter(a => a.escuela_id === escId) : alumnos;

  const grupos = {};
  for (const a of filtrados) {
    if (!a.nivel || !a.sexo) continue;
    if (!a.prenda_top && !a.prenda_bottom) continue;
    const k = `${a.nivel}|${a.sexo}|${a.prenda_top || ''}|${a.prenda_bottom || ''}`;
    if (!grupos[k]) grupos[k] = {
      key: k, nivel: a.nivel, sexo: a.sexo,
      prenda_top: a.prenda_top || null, prenda_bottom: a.prenda_bottom || null,
      total: 0, pendientes: 0,
    };
    grupos[k].total++;
    const pendTop = a.talla_top_key && a.prenda_top
      && a.estado_top !== 'empacado' && a.estado_top !== 'entregado';
    const pendBot = a.talla_bottom_key && a.prenda_bottom
      && a.estado_bottom !== 'empacado' && a.estado_bottom !== 'entregado';
    if (pendTop || pendBot) grupos[k].pendientes++;
  }

  const lista = Object.values(grupos)
    .filter(g => g.pendientes > 0)
    .sort((a,b) => b.pendientes - a.pendientes || a.nivel.localeCompare(b.nivel) || a.sexo.localeCompare(b.sexo));

  if (lista.length === 0) {
    cont.innerHTML = '<div class="text-muted" style="font-size:12px;padding:8px">No hay combinaciones con piezas pendientes' + (escId ? ' para esta escuela' : '') + '.</div>';
    return;
  }

  cont.innerHTML = lista.map(g => {
    const nivLbl = _NIVEL_LBL[g.nivel] || g.nivel;
    const sxLbl = _SEXO_LBL[g.sexo] || g.sexo;
    const piezas = [g.prenda_top, g.prenda_bottom].filter(Boolean).join(' + ');
    const marcado = empSelCache.combosMarcados.has(g.key);
    const border = marcado ? 'var(--azul,#1565C0)' : '#E0E4EA';
    const bg = marcado ? '#E8F0FA' : 'white';
    return `
      <div onclick="toggleEmpSelComboKey('${g.key}')"
           style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:2px solid ${border};background:${bg};border-radius:8px;cursor:pointer;user-select:none;text-align:left;transition:background .12s,border-color .12s">
        <input type="checkbox" ${marcado?'checked':''} tabindex="-1"
               style="pointer-events:none;width:18px;height:18px;flex:0 0 auto;margin:0">
        <div style="flex:1 1 0;min-width:0">
          <div style="font-weight:700;font-size:13px;line-height:1.2">${nivLbl} · ${sxLbl}</div>
          <div style="font-size:11px;color:#666;margin-top:3px;white-space:normal;word-break:break-word">${piezas}</div>
        </div>
        <div style="font-size:11px;background:${marcado?'rgba(21,101,192,0.15)':'rgba(0,0,0,0.08)'};color:${marcado?'var(--azul,#1565C0)':'#444'};padding:3px 8px;border-radius:6px;flex:0 0 auto;font-weight:700;white-space:nowrap">
          ${g.pendientes} pend
        </div>
      </div>
    `;
  }).join('');
}

function toggleEmpSelComboKey(k) {
  if (empSelCache.combosMarcados.has(k)) empSelCache.combosMarcados.delete(k);
  else empSelCache.combosMarcados.add(k);
  renderEmpSelCombos();
  refrescarPoolEmpSelector();
}

// Muestra/actualiza el resumen "qué tenés acaparado para esta escuela × estas prendas"
function refrescarPoolEmpSelector() {
  const info = document.getElementById('emp-sel-pool-info');
  const escId = document.getElementById('emp-sel-escuela').value;
  // Derivar prendas de los combos marcados
  const prendasSet = new Set();
  for (const k of empSelCache.combosMarcados || []) {
    const [, , pt, pb] = k.split('|');
    if (pt) prendasSet.add(pt);
    if (pb) prendasSet.add(pb);
  }
  const prendas = [...prendasSet];
  const pool = empSelCache.pool || [];

  if (!escId || prendas.length === 0) {
    info.style.display = 'none';
    return;
  }
  // Filtrar pool para esta escuela y prendas elegidas
  const setP = new Set(prendas);
  const rows = pool
    .filter(r => r.escuela_id === escId && setP.has(r.nombre_prenda))
    .map(r => ({
      prenda: r.nombre_prenda,
      talla: r.talla_key,
      disp: (Number(r.cantidad_acaparada)||0) - (Number(r.cantidad_consumida)||0),
    }))
    .filter(r => r.disp > 0)
    .sort((a,b) => a.prenda.localeCompare(b.prenda) || a.talla.localeCompare(b.talla, 'es', { numeric: true }));

  if (rows.length === 0) {
    info.style.display = '';
    info.innerHTML = `
      <strong>ℹ Sin pool acaparado</strong> para esta escuela en las prendas elegidas.
      Al empacar se va a descontar directamente del stock libre de bodega.
    `;
    return;
  }
  const total = rows.reduce((s, r) => s + r.disp, 0);
  info.style.display = '';
  info.innerHTML = `
    <strong>📥 Pool acaparado disponible</strong> (${total} pieza${total===1?'':'s'} — se consume primero al empacar):
    <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
      ${rows.map(r => `<span style="background:white;border:1px solid #FFD24D;padding:2px 6px;border-radius:4px;font-size:11px"><strong>${r.prenda}</strong> ${r.talla}: ${r.disp}</span>`).join('')}
    </div>
    <div style="font-size:11px;color:#666;margin-top:4px">
      Si necesitás más de lo que hay acaparado, la diferencia sale del stock libre. Si no querés usar el pool, primero podés "Salida rápida" del stock.
    </div>
  `;
}

function confirmarEmpacarSelector() {
  const claves = [...empSelCache.combosMarcados];
  if (claves.length === 0) return alert('Elegí al menos una combinación');
  // Reconstruir combos desde las claves
  const combos = claves.map(k => {
    const [nivel, sexo, prenda_top, prenda_bottom] = k.split('|');
    return { nivel, sexo, prenda_top: prenda_top || null, prenda_bottom: prenda_bottom || null };
  });
  const prendas = [...new Set(combos.flatMap(c => [c.prenda_top, c.prenda_bottom]).filter(Boolean))];
  const escId = document.getElementById('emp-sel-escuela').value || '';
  const completarParejas = !!document.getElementById('emp-sel-completar-parejas')?.checked;
  cerrarEmpacarSelector();
  if (typeof alumnosGlobalCache !== 'undefined') {
    alumnosGlobalCache.modoEmpaque = true;
    alumnosGlobalCache.empCombos = combos;
    alumnosGlobalCache.empPrendas = prendas;
    alumnosGlobalCache.empPoolEntries = [];
    alumnosGlobalCache.empMarcadosTop = new Set();
    alumnosGlobalCache.empMarcadosBot = new Set();
    alumnosGlobalCache.empCompletarParejas = completarParejas;
    alumnosGlobalCache.busqueda = '';
    alumnosGlobalCache.filtroEscuela = '';
    alumnosGlobalCache.filtroEscuelas = escId ? [escId] : [];
    alumnosGlobalCache.filtroEstado = '';
    if (typeof cargarSupplyEmpaque === 'function') cargarSupplyEmpaque();
  }
  if (typeof switchTab === 'function') switchTab('registro');
  setTimeout(() => {
    if (typeof alumnosGlobalCache !== 'undefined' && alumnosGlobalCache.cargado) {
      renderAlumnosGlobal();
    } else if (typeof initAlumnosGlobal === 'function') {
      initAlumnosGlobal();
    }
  }, 50);
}

// ─── Empaque pool-aware reusable desde tabla Registro ──────────────
// Recibe alumnos (objetos completos con prenda_top/talla_top_key/etc),
// y un Set de nombres de prenda permitidos a empacar.
// Por cada pieza elegible (prenda en el set, talla presente, estado no empacado/entregado):
//   1) Consume del pool escuela_acaparado si hay disponibilidad
//   2) Si no, crea SALIDA_EMPAQUE (descuenta stock)
// Actualiza estado_top/estado_bottom = 'empacado'.
// Retorna { actualizados, piezasPool, piezasStock, errores: [] }.
async function empacarAlumnosDesdeRegistro(alumnos, prendasSet, opts = {}) {
  const { completarParejas = false, planExterno = null, tallasAlt = null } = opts;
  // tallasAlt: Map<"alumnoId|top"|"alumnoId|bottom", "TALLA_KEY">. Si una entrada
  // está presente, se empaca con esa talla en lugar de la pedida del alumno
  // (caso pantalón largo). Stock y SALIDA_EMPAQUE descuentan la talla USADA.
  // talla_empacada_top/bot se persiste solo si difiere de la pedida.
  const getTalla = (a, pieza) => {
    if (tallasAlt) {
      const alt = tallasAlt.get(a.id + '|' + pieza);
      if (alt) return alt;
    }
    return pieza === 'top' ? a.talla_top_key : a.talla_bottom_key;
  };
  if (!alumnos || alumnos.length === 0) throw new Error('Sin alumnos para empacar');
  // Si viene un planExterno (Map<alumno_id, {top:bool, bottom:bool}>) NO
  // necesitamos prendasSet — el plan ya dice exactamente qué empacar.
  if (!planExterno && (!prendasSet || prendasSet.size === 0))
    throw new Error('Sin prendas seleccionadas');

  // 1) Cargar pool por escuelas afectadas
  const pool = {};
  const escIds = [...new Set(alumnos.map(a => a.escuela_id).filter(Boolean))];
  if (escIds.length) {
    const rows = await supaFetchAll('escuela_acaparado',
      `?escuela_id=in.(${escIds.join(',')})&select=id,escuela_id,nombre_prenda,talla_key,cantidad_acaparada,cantidad_consumida`);
    for (const r of rows) {
      const disp = (Number(r.cantidad_acaparada) || 0) - (Number(r.cantidad_consumida) || 0);
      if (disp <= 0) continue;
      const k = r.escuela_id + '|' + r.nombre_prenda + '|' + r.talla_key;
      if (!pool[k]) pool[k] = { rows: [], disponible: 0 };
      pool[k].rows.push({ id: r.id, libres: disp });
      pool[k].disponible += disp;
    }
  }

  // 2) Cargar stock actual
  const stockRows = await supaFetchAll('vw_bodega_stock', '?select=nombre_prenda,cod_prenda,talla_key,stock_actual');
  const stockMap = {};
  for (const s of stockRows) {
    stockMap[(s.nombre_prenda || s.cod_prenda) + '|' + s.talla_key] = Number(s.stock_actual) || 0;
  }

  // 3) Pre-computar plan por alumno: qué pieza top/bottom va a empacarse.
  //    Si completarParejas: si una pieza del alumno se va a empacar y la
  //    otra pieza está pendiente + tiene stock disponible (pool o libre),
  //    también se empaca aunque su prenda no esté en prendasSet.
  const piezaPendiente = (prenda, talla, estado) =>
    !!prenda && !!talla && estado !== 'empacado' && estado !== 'entregado';

  let planByAlumno;
  if (planExterno) {
    // Filtrar a piezas que sigan pendientes (por si el estado cambió desde la UI)
    planByAlumno = new Map();
    for (const a of alumnos) {
      const ext = planExterno.get(a.id);
      if (!ext) continue;
      const top = ext.top && piezaPendiente(a.prenda_top, a.talla_top_key, a.estado_top);
      const bottom = ext.bottom && piezaPendiente(a.prenda_bottom, a.talla_bottom_key, a.estado_bottom);
      if (top || bottom) planByAlumno.set(a.id, { top, bottom });
    }
  } else {
    planByAlumno = new Map();
    for (const a of alumnos) {
      const topElig = piezaPendiente(a.prenda_top, a.talla_top_key, a.estado_top)
        && prendasSet.has(a.prenda_top);
      const botElig = piezaPendiente(a.prenda_bottom, a.talla_bottom_key, a.estado_bottom)
        && prendasSet.has(a.prenda_bottom);
      if (!topElig && !botElig) continue;
      let top = topElig, bottom = botElig;
      if (completarParejas) {
        if (top && !bottom && piezaPendiente(a.prenda_bottom, a.talla_bottom_key, a.estado_bottom)) {
          bottom = true;
        }
        if (bottom && !top && piezaPendiente(a.prenda_top, a.talla_top_key, a.estado_top)) {
          top = true;
        }
      }
      planByAlumno.set(a.id, { top, bottom });
    }
  }

  // Validación pool+stock simulada
  const consumoStock = {};
  const poolSim = {};
  for (const k of Object.keys(pool)) poolSim[k] = pool[k].disponible;
  for (const a of alumnos) {
    const plan = planByAlumno.get(a.id);
    if (!plan) continue;
    const tryConsume = (prenda, talla) => {
      const kPool = a.escuela_id + '|' + prenda + '|' + talla;
      if ((poolSim[kPool] || 0) > 0) { poolSim[kPool]--; return; }
      const kStock = prenda + '|' + talla;
      consumoStock[kStock] = (consumoStock[kStock] || 0) + 1;
    };
    if (plan.top)    tryConsume(a.prenda_top, getTalla(a, 'top'));
    if (plan.bottom) tryConsume(a.prenda_bottom, getTalla(a, 'bottom'));
  }
  // Para "completar parejas", si la pieza extra no tiene pool ni stock, no
  // forzamos error: simplemente la dejamos pendiente. Filtramos los planes
  // que no caben en stock libre quitando esas piezas opcionales primero.
  const errores = [];
  // Con planExterno, todo es obligatorio (el usuario eligió pieza por pieza).
  // Sin planExterno, lo que está en prendasSet es obligatorio; las parejas
  // opcionales se "skipean" si no caben.
  const esObligatoria = (prenda) => planExterno || (prendasSet && prendasSet.has(prenda));
  for (const [k, n] of Object.entries(consumoStock)) {
    const disp = stockMap[k] || 0;
    if (n > disp) {
      const [p, t] = k.split('|');
      if (esObligatoria(p)) {
        errores.push(`${p} ${t}: querés ${n} de stock libre pero hay ${disp}`);
      } else {
        // Pareja opcional sin stock → skipear esa pieza extra
        for (const a of alumnos) {
          const plan = planByAlumno.get(a.id);
          if (!plan) continue;
          if (plan.top && !prendasSet.has(a.prenda_top)
              && a.prenda_top === p && a.talla_top_key === t) plan.top = false;
          if (plan.bottom && !prendasSet.has(a.prenda_bottom)
              && a.prenda_bottom === p && a.talla_bottom_key === t) plan.bottom = false;
        }
      }
    }
  }
  if (errores.length > 0) {
    return { actualizados: 0, piezasPool: 0, piezasStock: 0, errores };
  }

  // 4) Aplicar
  const movs = [];
  const poolDelta = {};
  let piezasPool = 0, piezasStock = 0, actualizados = 0, piezasPareja = 0;

  const consumirDelPool = (escId, prenda, talla) => {
    const k = escId + '|' + prenda + '|' + talla;
    const entry = pool[k];
    if (!entry || entry.disponible <= 0) return false;
    for (const r of entry.rows) {
      if (r.libres > 0) {
        r.libres--;
        entry.disponible--;
        poolDelta[r.id] = (poolDelta[r.id] || 0) + 1;
        return true;
      }
    }
    return false;
  };

  for (const a of alumnos) {
    const plan = planByAlumno.get(a.id);
    if (!plan) continue;
    const update = { actualizado_en: new Date().toISOString() };
    let toca = false;
    const procesar = (prenda, talla, esTop, esPareja) => {
      if (!prenda || !talla) return;
      const tallaPedida = esTop ? a.talla_top_key : a.talla_bottom_key;
      const esAlterna = !!tallaPedida && talla !== tallaPedida;
      if (esTop) {
        update.estado_top = 'empacado';
        update.talla_empacada_top = esAlterna ? talla : null;
      } else {
        update.estado_bottom = 'empacado';
        update.talla_empacada_bot = esAlterna ? talla : null;
      }
      toca = true;
      if (consumirDelPool(a.escuela_id, prenda, talla)) {
        piezasPool++;
      } else {
        movs.push({
          tipo: 'SALIDA_EMPAQUE',
          cod_prenda: _codPrenda(prenda),
          nombre_prenda: prenda,
          talla_key: talla,
          cantidad: 1,
          alumno_id: a.id,
          escuela_id: a.escuela_id,
          fecha: new Date().toISOString().slice(0,10),
          observaciones: `Empacado para ${a.nombre}${esPareja ? ' (pareja)' : ''}${esAlterna ? ` [alterna ${talla}≠${tallaPedida}]` : ''}`,
        });
        piezasStock++;
      }
      if (esPareja) piezasPareja++;
    };
    if (plan.top) procesar(a.prenda_top, getTalla(a, 'top'), true,
      !planExterno && prendasSet && !prendasSet.has(a.prenda_top));
    if (plan.bottom) procesar(a.prenda_bottom, getTalla(a, 'bottom'), false,
      !planExterno && prendasSet && !prendasSet.has(a.prenda_bottom));
    if (toca) {
      await supaUpdate('alumno', a.id, update);
      actualizados++;
    }
  }

  if (movs.length > 0) {
    await supaFetch('bodega_movimiento', 'POST', movs);
  }
  if (Object.keys(poolDelta).length > 0) {
    await _consumePoolBatch(poolDelta);
  }

  return { actualizados, piezasPool, piezasStock, piezasPareja, errores: [] };
}

// ─── DESEMPACAR pieza individual ──────────────────────────────────────
// Revierte el empaque de una pieza de un alumno (top o bottom).
// Heurística:
//   - Busca un SALIDA_EMPAQUE con alumno_id+prenda+talla → si existe, vino
//     de stock. Compensa con ENTRADA_MANUAL (vuelve 1 al stock).
//   - Si no existe → vino del pool. Decrementa cantidad_consumida en una
//     fila de escuela_acaparado matching (la primera con consumida > 0).
// Pone estado_(top|bottom) = 'pendiente' y actualizado_en = now.
async function desempacarPieza(alumnoId, pieza /* 'top' | 'bottom' */) {
  if (pieza !== 'top' && pieza !== 'bottom') throw new Error('Pieza inválida');
  // 1) Cargar alumno
  const rows = await supaFetch('alumno', 'GET', null, `?id=eq.${alumnoId}&limit=1`);
  if (!rows || rows.length === 0) throw new Error('Alumno no encontrado');
  const a = rows[0];
  const prenda = pieza === 'top' ? a.prenda_top : a.prenda_bottom;
  const tallaPedida = pieza === 'top' ? a.talla_top_key : a.talla_bottom_key;
  const tallaAlterna = pieza === 'top' ? a.talla_empacada_top : a.talla_empacada_bot;
  // Talla a devolver: si hubo alterna registrada, esa; sino la pedida.
  // El movimiento SALIDA_EMPAQUE tiene la talla USADA, igual cross-check abajo.
  const tallaPersistida = tallaAlterna || tallaPedida;
  const estado = pieza === 'top' ? a.estado_top : a.estado_bottom;
  if (estado !== 'empacado' && estado !== 'entregado') {
    throw new Error('La pieza no está empacada ni entregada');
  }
  if (!prenda) throw new Error('Falta prenda en el alumno');
  const cod = _codPrenda(prenda);

  // 2) Buscar SALIDA_EMPAQUE para este alumno+prenda SIN filtrar por talla.
  // La talla del movimiento es la REAL que se sacó del stock — puede diferir
  // de talla_pedida si se empacó con talla alterna (pantalón largo, etc).
  const movs = await supaFetch('bodega_movimiento', 'GET', null,
    `?alumno_id=eq.${alumnoId}&cod_prenda=eq.${cod}&tipo=eq.SALIDA_EMPAQUE&order=creado_en.desc&limit=1`);
  const vinoDeStock = movs && movs.length > 0;
  // Talla a devolver: prioridad al movimiento real (más confiable).
  const tallaDevolver = vinoDeStock ? movs[0].talla_key : (tallaPersistida || tallaPedida);
  if (!tallaDevolver) throw new Error('No se pudo determinar la talla a devolver');

  if (vinoDeStock) {
    // Compensar con ENTRADA_MANUAL (suma 1 al stock de la talla que se sacó)
    await supaFetch('bodega_movimiento', 'POST', {
      tipo: 'ENTRADA_MANUAL', cod_prenda: cod, nombre_prenda: prenda,
      talla_key: tallaDevolver, cantidad: 1,
      alumno_id: alumnoId, escuela_id: a.escuela_id,
      fecha: new Date().toISOString().slice(0,10),
      observaciones: `Desempacado de ${a.nombre}${tallaDevolver !== tallaPedida ? ` [talla usada ${tallaDevolver}, pedida ${tallaPedida}]` : ''}`,
    });
  } else {
    // Vino del pool → buscar una fila con consumida > 0 y bajar 1
    const poolRows = await supaFetch('escuela_acaparado', 'GET', null,
      `?escuela_id=eq.${a.escuela_id}&nombre_prenda=eq.${encodeURIComponent(prenda)}&talla_key=eq.${encodeURIComponent(tallaDevolver)}&cantidad_consumida=gt.0&order=cantidad_consumida.desc&limit=1`);
    if (poolRows && poolRows.length > 0) {
      await _consumePoolBatch({ [poolRows[0].id]: -1 });
    } else {
      // Caso raro: no se encuentra origen. Compensar con ENTRADA_MANUAL
      // para no perder la unidad físicamente.
      await supaFetch('bodega_movimiento', 'POST', {
        tipo: 'ENTRADA_MANUAL', cod_prenda: cod, nombre_prenda: prenda,
        talla_key: tallaDevolver, cantidad: 1,
        alumno_id: alumnoId, escuela_id: a.escuela_id,
        fecha: new Date().toISOString().slice(0,10),
        observaciones: `Desempacado de ${a.nombre} (sin origen claro)`,
      });
    }
  }

  // 3) Estado → pendiente + limpiar talla_empacada (vuelve al estado "se empacaría con la talla pedida")
  const update = { actualizado_en: new Date().toISOString() };
  if (pieza === 'top') {
    update.estado_top = 'pendiente';
    update.talla_empacada_top = null;
  } else {
    update.estado_bottom = 'pendiente';
    update.talla_empacada_bot = null;
  }
  await supaUpdate('alumno', alumnoId, update);

  return { ok: true, vinoDeStock, tallaDevuelta: tallaDevolver, eraAlterna: tallaDevolver !== tallaPedida };
}

// Helper: incrementa cantidad_consumida del pool en batch via RPC dedicada
// (SECURITY DEFINER, callable por operador). Reemplaza el uso de exec_sql.
async function _consumePoolBatch(poolDelta) {
  const consumos = Object.entries(poolDelta).map(([id, delta]) => ({ id, delta }));
  const tok = (supaSession && supaSession.access_token) || SUPA_KEY;
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/consume_pool_batch`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':`Bearer ${tok}` },
    body: JSON.stringify({ p_consumos: consumos }),
  });
  if (!res.ok) throw new Error('Error actualizando pool: ' + await res.text());
}

// Helper: PATCH bulk sobre alumno con filtros (PostgREST). Devuelve 204.
async function _bulkPatchAlumno(filterParams, data) {
  const tok = (typeof authToken === 'function' ? authToken() : null) || SUPA_KEY;
  const res = await fetch(`${SUPA_URL}/rest/v1/alumno${filterParams}`, {
    method: 'PATCH',
    headers: { 'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':`Bearer ${tok}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Error en bulk patch: ' + await res.text());
}

// ═══════════════════════════════════════════════════════════════════
// MODAL: ACAPARAR (pool por escuela+prenda+talla, sin alumnos)
// ═══════════════════════════════════════════════════════════════════
// Descuenta stock_actual de bodega + crea registro en escuela_acaparado
// con cantidad_acaparada. Después al empacar individualmente, el pool
// se va consumiendo (cantidad_consumida++).
// ════════════════════════════════════════════════════════════════════
let acapararCache = { escuelas: null, stock: null, alumnos: null, acaparadoAjeno: null };

async function abrirAcapararModal() {
  const modal = document.getElementById('bodega-acaparar-modal');
  if (!modal) return;
  // Reset
  ['aca-escuela','aca-prenda','aca-cantidad','aca-obs'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('aca-talla').innerHTML = '<option value="">— Elegí prenda primero —</option>';
  document.getElementById('aca-stock-info').style.display = 'none';
  document.getElementById('aca-demanda-info').style.display = 'none';
  modal.style.display = 'flex';
  try {
    const [escuelas, stock, alumnos, acaDisp] = await Promise.all([
      acapararCache.escuelas
        ? Promise.resolve(acapararCache.escuelas)
        : supaFetchAll('escuela', '?activa=eq.true&select=id,alias,nombre,codigo_cde&order=alias'),
      supaFetchAll('vw_bodega_stock', '?stock_actual=gt.0&select=cod_prenda,nombre_prenda,talla_key,stock_actual'),
      supaFetchAll('alumno', '?activo=eq.true&select=id,escuela_id,prenda_top,talla_top_key,estado_top,prenda_bottom,talla_bottom_key,estado_bottom&limit=10000'),
      supaFetchAll('escuela_acaparado', '?select=escuela_id,nombre_prenda,talla_key,cantidad_acaparada,cantidad_consumida'),
    ]);
    acapararCache.escuelas = escuelas;
    acapararCache.stock = stock;
    acapararCache.alumnos = alumnos;
    acapararCache.acaparadoAjeno = acaDisp;

    const selE = document.getElementById('aca-escuela');
    selE.innerHTML = '<option value="">— Elegí escuela —</option>' +
      escuelas.map(e => `<option value="${e.id}">${e.alias || e.nombre}${e.codigo_cde ? ' · '+e.codigo_cde : ''}</option>`).join('');

    const prendas = [...new Set(stock.map(s => s.nombre_prenda || s.cod_prenda))].sort();
    const selP = document.getElementById('aca-prenda');
    selP.innerHTML = '<option value="">— Elegí prenda —</option>' +
      prendas.map(p => `<option value="${p}">${p}</option>`).join('');
  } catch (e) { alert('Error: ' + e.message); }
}
function cerrarAcapararModal() { document.getElementById('bodega-acaparar-modal').style.display = 'none'; }

function onAcapararPrendaCambio() {
  const prenda = document.getElementById('aca-prenda').value;
  const selT = document.getElementById('aca-talla');
  if (!prenda) { selT.innerHTML = '<option value="">— Elegí prenda primero —</option>'; return; }
  const tallas = (acapararCache.stock || [])
    .filter(s => (s.nombre_prenda || s.cod_prenda) === prenda)
    .sort((a,b) => (a.talla_key||'').localeCompare(b.talla_key||'', 'es', { numeric: true }));
  selT.innerHTML = '<option value="">— Elegí talla —</option>' +
    tallas.map(s => `<option value="${s.talla_key}">${s.talla_key} (stock ${s.stock_actual})</option>`).join('');
  onAcapararTallaCambio();
}
function onAcapararTallaCambio() {
  const prenda = document.getElementById('aca-prenda').value;
  const talla = document.getElementById('aca-talla').value;
  const info = document.getElementById('aca-stock-info');
  const demandaBox = document.getElementById('aca-demanda-info');
  const demandaLista = document.getElementById('aca-demanda-lista');
  if (!prenda || !talla) { info.style.display = 'none'; demandaBox.style.display = 'none'; return; }

  // Stock libre global
  const row = (acapararCache.stock || []).find(s =>
    (s.nombre_prenda || s.cod_prenda) === prenda && s.talla_key === talla);
  const stock = row ? (row.stock_actual || 0) : 0;
  // Acaparado disponible (sin consumir) total por todas las escuelas
  const acapPorEsc = {};
  for (const a of (acapararCache.acaparadoAjeno || [])) {
    if (a.nombre_prenda !== prenda || a.talla_key !== talla) continue;
    const disp = (Number(a.cantidad_acaparada) || 0) - (Number(a.cantidad_consumida) || 0);
    if (disp <= 0) continue;
    acapPorEsc[a.escuela_id] = (acapPorEsc[a.escuela_id] || 0) + disp;
  }
  const acapTotal = Object.values(acapPorEsc).reduce((s, n) => s + n, 0);
  const libre = Math.max(0, stock - acapTotal);
  info.style.display = '';
  info.innerHTML = `
    <strong>${prenda} ${talla}</strong>:
    Stock <strong>${stock}</strong>
    · Acaparado total <strong>${acapTotal}</strong>
    · <span style="color:var(--verde);font-weight:700">Libre para acaparar: ${libre}</span>
  `;
  document.getElementById('aca-cantidad').max = libre;

  // Demanda pendiente por escuela
  const necesitaPorEsc = {};
  for (const a of (acapararCache.alumnos || [])) {
    if (!a.escuela_id) continue;
    if (a.prenda_top === prenda && a.talla_top_key === talla
        && a.estado_top !== 'empacado' && a.estado_top !== 'entregado') {
      necesitaPorEsc[a.escuela_id] = (necesitaPorEsc[a.escuela_id] || 0) + 1;
    }
    if (a.prenda_bottom === prenda && a.talla_bottom_key === talla
        && a.estado_bottom !== 'empacado' && a.estado_bottom !== 'entregado') {
      necesitaPorEsc[a.escuela_id] = (necesitaPorEsc[a.escuela_id] || 0) + 1;
    }
  }

  const escById = {};
  for (const e of (acapararCache.escuelas || [])) escById[e.id] = e;

  const escSelId = document.getElementById('aca-escuela').value || '';
  let filas = Object.keys(necesitaPorEsc)
    .map(eid => {
      const esc = escById[eid] || { alias: '(?)', nombre: '' };
      const necesita = necesitaPorEsc[eid] || 0;
      const acaparado = acapPorEsc[eid] || 0;
      const falta = Math.max(0, necesita - acaparado);
      return { eid, alias: esc.alias || esc.nombre || '(?)', necesita, acaparado, falta };
    })
    .filter(f => f.necesita > 0)
    .sort((a,b) => b.falta - a.falta || b.necesita - a.necesita);

  // Si hay una escuela seleccionada, solo mostrar esa fila (queda más limpio)
  if (escSelId) filas = filas.filter(f => f.eid === escSelId);

  if (filas.length === 0) {
    demandaBox.style.display = 'none';
    return;
  }
  demandaBox.style.display = '';
  demandaLista.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#f5f7fa">
          <th style="text-align:left;padding:4px 6px">Escuela</th>
          <th style="text-align:right;padding:4px 6px" title="Cantidad de alumnos pendientes con esa prenda+talla">Pendientes</th>
          <th style="text-align:right;padding:4px 6px" title="Ya acaparado en el pool para esa escuela">Acaparado</th>
          <th style="text-align:right;padding:4px 6px" title="Cuánto te falta acaparar = Pendientes − Acaparado">Necesita</th>
        </tr>
      </thead>
      <tbody>
        ${filas.map(f => `
          <tr style="cursor:pointer;border-top:1px solid #eee"
              onclick="seleccionarEscuelaAcaparar('${f.eid}', ${f.falta})"
              onmouseover="this.style.background='#fff8d6'"
              onmouseout="this.style.background=''">
            <td style="padding:4px 6px">${escapeHtmlAca(f.alias)}</td>
            <td style="padding:4px 6px;text-align:right;color:#666">${f.necesita}</td>
            <td style="padding:4px 6px;text-align:right;color:#666">${f.acaparado}</td>
            <td style="padding:4px 6px;text-align:right;font-weight:700;color:${f.falta>0?'var(--rojo)':'var(--verde)'}">${f.falta}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function escapeHtmlAca(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function seleccionarEscuelaAcaparar(eid, falta) {
  const selE = document.getElementById('aca-escuela');
  if (selE) selE.value = eid;
  const inputC = document.getElementById('aca-cantidad');
  if (inputC && falta > 0) {
    const max = Number(inputC.max) || Infinity;
    inputC.value = Math.min(falta, max);
    inputC.focus();
  }
}

async function guardarAcaparar() {
  const escId = document.getElementById('aca-escuela').value;
  const prenda = document.getElementById('aca-prenda').value;
  const talla = document.getElementById('aca-talla').value;
  const cant = parseInt(document.getElementById('aca-cantidad').value, 10);
  const obs = document.getElementById('aca-obs').value.trim() || null;
  if (!escId) return alert('Elegí escuela');
  if (!prenda) return alert('Elegí prenda');
  if (!talla) return alert('Elegí talla');
  if (!cant || cant <= 0) return alert('Cantidad inválida');

  // Validar disponibilidad
  const row = (acapararCache.stock || []).find(s =>
    (s.nombre_prenda || s.cod_prenda) === prenda && s.talla_key === talla);
  const stock = row ? (row.stock_actual || 0) : 0;
  const acapTotal = (acapararCache.acaparadoAjeno || [])
    .filter(a => a.nombre_prenda === prenda && a.talla_key === talla)
    .reduce((s, a) => s + (Number(a.disponible) || 0), 0);
  const libre = Math.max(0, stock - acapTotal);
  if (cant > libre) return alert(`Solo hay ${libre} libres para acaparar (${prenda} ${talla}).`);

  const cod = _codPrenda(prenda);
  const btn = document.getElementById('aca-btn-guardar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }

  try {
    // 1) Crear movimiento de bodega que descuenta stock (sin alumno_id, escuela_id set)
    const movs = await supaFetch('bodega_movimiento', 'POST', {
      tipo: 'SALIDA_EMPAQUE',
      cod_prenda: cod, nombre_prenda: prenda, talla_key: talla,
      cantidad: cant, escuela_id: escId,
      fecha: new Date().toISOString().slice(0,10),
      observaciones: 'Acaparado para escuela' + (obs ? ' · '+obs : ''),
    });
    const movId = Array.isArray(movs) ? movs[0]?.id : movs?.id;

    // 2) Crear registro en escuela_acaparado
    await supaFetch('escuela_acaparado', 'POST', {
      escuela_id: escId,
      cod_prenda: cod, nombre_prenda: prenda, talla_key: talla,
      cantidad_acaparada: cant,
      cantidad_consumida: 0,
      movimiento_bodega_id: movId,
      observaciones: obs,
    });

    cerrarAcapararModal();
    if (bodegaCache.vistaActual === 'stock') await cargarBodegaStock();
    else if (bodegaCache.vistaActual === 'movimientos') await cargarMovimientos();
    else if (bodegaCache.vistaActual === 'vs_demanda') await cargarBodegaVsDemanda();
    acapararCache.stock = null;
    alert(`✓ Acaparado ${cant} ${prenda} ${talla} para esta escuela.`);
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📥 Acaparar'; }
  }
}

// ═══════════════════════════════════════════════════════════════════
// MODAL: ENTREGA MASIVA POR ESCUELA
// ═══════════════════════════════════════════════════════════════════
let entregaCache = { escuelas: null };

async function abrirEntregaModal() {
  const modal = document.getElementById('bodega-entrega-modal');
  if (!modal) return;
  document.getElementById('ent-escuela').value = '';
  document.getElementById('ent-fecha').value = new Date().toISOString().slice(0,10);
  document.getElementById('ent-receptor').value = '';
  document.getElementById('ent-obs').value = '';
  document.getElementById('ent-resumen').style.display = 'none';
  modal.style.display = 'flex';
  try {
    if (!entregaCache.escuelas) {
      entregaCache.escuelas = await supaFetchAll('escuela',
        '?activa=eq.true&select=id,alias,nombre&order=alias');
    }
    const sel = document.getElementById('ent-escuela');
    sel.innerHTML = '<option value="">— Elegí escuela —</option>' +
      entregaCache.escuelas.map(e => `<option value="${e.id}">${e.alias || e.nombre}</option>`).join('');
  } catch(e) { alert('Error: '+e.message); }
}
function cerrarEntregaModal() { document.getElementById('bodega-entrega-modal').style.display = 'none'; }

async function onEntregaEscuelaCambio() {
  const escId = document.getElementById('ent-escuela').value;
  const info = document.getElementById('ent-resumen');
  if (!escId) { info.style.display = 'none'; return; }
  try {
    const empacados = await supaFetch('alumno', 'GET', null,
      `?escuela_id=eq.${escId}&or=(estado_top.eq.empacado,estado_bottom.eq.empacado)&select=id,estado_top,estado_bottom&limit=10000`);
    let n = 0;
    for (const a of empacados) {
      if (a.estado_top === 'empacado') n++;
      if (a.estado_bottom === 'empacado') n++;
    }
    info.style.display = '';
    info.innerHTML = n === 0
      ? '<span style="color:#c44">⚠ No hay piezas empacadas pendientes de entrega para esta escuela.</span>'
      : `📦 <strong>${empacados.length} alumno(s)</strong> con <strong>${n} pieza(s)</strong> empacadas. Al confirmar se marcan como entregadas con la fecha indicada.`;
  } catch (e) { info.innerHTML = 'Error: ' + e.message; info.style.display=''; }
}

async function guardarEntrega() {
  const escId = document.getElementById('ent-escuela').value;
  const fecha = document.getElementById('ent-fecha').value;
  const receptor = document.getElementById('ent-receptor').value.trim() || null;
  const obs = document.getElementById('ent-obs').value.trim() || null;
  if (!escId) return alert('Elegí escuela');
  if (!fecha) return alert('Elegí fecha');

  const btn = document.getElementById('ent-btn-guardar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Aplicando...'; }
  try {
    // Contar empacados antes
    const empacados = await supaFetch('alumno', 'GET', null,
      `?escuela_id=eq.${escId}&or=(estado_top.eq.empacado,estado_bottom.eq.empacado)&select=id,estado_top,estado_bottom&limit=10000`);
    let n = 0;
    for (const a of empacados) {
      if (a.estado_top === 'empacado') n++;
      if (a.estado_bottom === 'empacado') n++;
    }
    if (n === 0) {
      alert('No hay piezas empacadas pendientes para entregar.');
      return;
    }

    // UPDATE bulk vía PATCH PostgREST (filtra por columna y aplica el cambio)
    // — más portable y respeta RLS y audit triggers, sin pasar por exec_sql.
    const nowIso = new Date().toISOString();
    await _bulkPatchAlumno(`?escuela_id=eq.${escId}&estado_top=eq.empacado`,
      { estado_top: 'entregado', actualizado_en: nowIso });
    await _bulkPatchAlumno(`?escuela_id=eq.${escId}&estado_bottom=eq.empacado`,
      { estado_bottom: 'entregado', actualizado_en: nowIso });

    // Crear registro de entrega
    await supaFetch('entrega_escuela', 'POST', {
      escuela_id: escId, fecha, cantidad_piezas: n,
      receptor, observaciones: obs,
    });

    cerrarEntregaModal();
    if (bodegaCache.vistaActual === 'stock') await cargarBodegaStock();
    else if (bodegaCache.vistaActual === 'movimientos') await cargarMovimientos();
    alert(`✓ ${n} pieza(s) marcadas como entregadas a la escuela el ${fecha}.`);
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🚚 Marcar entregado'; }
  }
}

// ═══════════════════════════════════════════════════════════════════
// MODAL: ASIGNAR PIEZAS A ALUMNOS (acaparar / empacar / entregar)
// ═══════════════════════════════════════════════════════════════════
// El user describe 3 acciones reales en el taller:
// - Acaparar: bloquear stock para una escuela rápido, sin tocar bodega
// - Empacar: meter la pieza en la bolsa del alumno (descuenta bodega)
// - Entregar: la bolsa sale a la escuela (registra SALIDA_ENTREGA)
//
// Cada una transiciona alumno.estado_top y/o estado_bottom según corresponda.
// ════════════════════════════════════════════════════════════════════
let asignarCache = {
  accion: null,           // 'reservado' | 'empacado' | 'entregado'
  escuelas: [],
  alumnos: [],
  stock: [],              // [{nombre_prenda, talla_key, stock_actual, ...}]
  prendas: [],
  tallas: [],
  filtrados: [],          // los que matchean los filtros actuales
  marcados: new Set(),    // ids de alumnos seleccionados
};

const ASIGNAR_INFO = {
  reservado: 'Acaparar: no toca stock físico. Útil cuando el control de bodega NO es preciso y querés bloquear piezas para esta escuela. Si tu stock está bien controlado, saltá esto y empacá directo.',
  empacado:  'Empacar: las piezas salen físicamente de bodega a la bolsa del alumno. Descuenta stock real.',
  entregado: 'Entregar: la bolsa sale del taller hacia la escuela.',
};

async function abrirAsignarModal() {
  const modal = document.getElementById('bodega-asignar-modal');
  if (!modal) return;
  // Reset
  asignarCache = { accion: null, escuelas: [], alumnos: [], prendas: [], tallas: [], filtrados: [], marcados: new Set() };
  document.getElementById('asi-act-info').textContent = '';
  ['asi-act-reservar','asi-act-empacar','asi-act-entregar'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.className = 'btn btn-sm btn-ghost';
  });
  modal.style.display = 'flex';

  try {
    // Cargar escuelas activas + alumnos + stock actual
    const [escuelas, alumnos, stock] = await Promise.all([
      supaFetchAll('escuela', '?activa=eq.true&select=id,alias,nombre&order=alias'),
      supaFetchAll('alumno', '?activo=eq.true&select=id,nombre,grado,escuela_id,prenda_top,talla_top_key,estado_top,prenda_bottom,talla_bottom_key,estado_bottom&limit=10000'),
      supaFetchAll('vw_bodega_stock', '?select=nombre_prenda,cod_prenda,talla_key,stock_actual,stock_disponible,reservado_empaque'),
    ]);
    asignarCache.escuelas = escuelas;
    asignarCache.alumnos = alumnos;
    asignarCache.stock = stock;

    // Popular select de escuelas
    const sel = document.getElementById('asi-escuelas');
    sel.innerHTML = escuelas.map(e =>
      `<option value="${e.id}">${e.alias || e.nombre}</option>`).join('');
    sel.onchange = () => { asignarRefrescar(); };

    // Prenda y talla cambian dinámicamente según los alumnos del filtro
    asignarRefrescarPrendasTallas();
    document.getElementById('asi-prenda').onchange = () => { asignarRefrescarTallas(); asignarFiltrosCambio(); };
    document.getElementById('asi-talla').onchange = asignarFiltrosCambio;

    asignarRefrescar();
  } catch (e) {
    alert('Error cargando: ' + e.message);
  }
}

function cerrarAsignarModal() {
  document.getElementById('bodega-asignar-modal').style.display = 'none';
}

function asignarSetAccion(accion) {
  asignarCache.accion = accion;
  document.getElementById('asi-act-info').textContent = ASIGNAR_INFO[accion] || '';
  ['reservado','empacado','entregado'].forEach(a => {
    const b = document.getElementById('asi-act-' + (a==='reservado'?'reservar':a==='empacado'?'empacar':'entregar'));
    if (b) b.className = 'btn btn-sm ' + (a === accion ? 'btn-primary' : 'btn-ghost');
  });
  asignarRefrescar();
}

function asignarRefrescarPrendasTallas() {
  const prendas = new Set();
  for (const a of asignarCache.alumnos) {
    if (a.prenda_top) prendas.add(a.prenda_top);
    if (a.prenda_bottom) prendas.add(a.prenda_bottom);
  }
  const lista = [...prendas].sort();
  const selP = document.getElementById('asi-prenda');
  selP.innerHTML = '<option value="">— Todas —</option>' +
    lista.map(p => `<option value="${p}">${p}</option>`).join('');
  asignarRefrescarTallas();
}

function asignarRefrescarTallas() {
  const prenda = document.getElementById('asi-prenda').value;
  const tallas = new Set();
  for (const a of asignarCache.alumnos) {
    if (!prenda || a.prenda_top === prenda)    { if (a.talla_top_key)    tallas.add(a.talla_top_key); }
    if (!prenda || a.prenda_bottom === prenda) { if (a.talla_bottom_key) tallas.add(a.talla_bottom_key); }
  }
  const lista = [...tallas].sort();
  const selT = document.getElementById('asi-talla');
  selT.innerHTML = '<option value="">— Todas —</option>' +
    lista.map(t => `<option value="${t}">${t}</option>`).join('');
}

function asignarFiltrosCambio() { asignarRefrescar(); }

// Calcula la lista de alumnos elegibles según filtros y acción seleccionada.
// Un alumno es "elegible" para una acción si su estado actual es anterior:
// - acaparar (reservado): estado actual = pendiente
// - empacar  (empacado):  estado actual = pendiente o reservado
// - entregar (entregado): estado actual = empacado
function asignarRefrescar() {
  const cont = document.getElementById('asi-lista');
  const resumen = document.getElementById('asi-resumen');
  const sel = document.getElementById('asi-escuelas');
  const escSel = Array.from(sel.selectedOptions).map(o => o.value);
  const prenda = document.getElementById('asi-prenda').value;
  const talla = document.getElementById('asi-talla').value;
  const accion = asignarCache.accion;

  if (!accion) {
    cont.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Elegí una acción arriba</div>';
    resumen.innerHTML = '';
    return;
  }
  if (escSel.length === 0) {
    cont.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Elegí al menos una escuela</div>';
    resumen.innerHTML = '';
    return;
  }

  const escSet = new Set(escSel);
  const escName = (id) => {
    const e = asignarCache.escuelas.find(x => x.id === id);
    return e ? (e.alias || e.nombre) : id.slice(0,6);
  };

  // Filtrar alumnos: en escuelas seleccionadas + matchean prenda/talla + tienen estado elegible para esta acción
  const filtros = asignarCache.alumnos.filter(a => {
    if (!escSet.has(a.escuela_id)) return false;
    // Para cada alumno verificamos si su top y/o bottom califica
    const matchTop = (!prenda || a.prenda_top === prenda) && (!talla || a.talla_top_key === talla);
    const matchBot = (!prenda || a.prenda_bottom === prenda) && (!talla || a.talla_bottom_key === talla);
    if (!matchTop && !matchBot) return false;
    const eligible = (estado) => {
      if (accion === 'reservado') return estado === 'pendiente' || !estado;
      if (accion === 'empacado')  return estado === 'pendiente' || !estado || estado === 'reservado';
      if (accion === 'entregado') return estado === 'empacado' || estado === 'reservado';
      return false;
    };
    const topElig = matchTop && a.talla_top_key && eligible(a.estado_top);
    const botElig = matchBot && a.talla_bottom_key && eligible(a.estado_bottom);
    a._topElig = topElig;
    a._botElig = botElig;
    return topElig || botElig;
  });
  asignarCache.filtrados = filtros;
  asignarCache.marcados = new Set(filtros.map(a => a.id)); // marcar todos por default

  // Resumen base
  let resumenHtml = `
    <strong>${filtros.length}</strong> alumno(s) elegibles ·
    Acción: <strong>${accion.toUpperCase()}</strong> ·
    Escuelas: <strong>${escSel.map(escName).join(', ')}</strong>
    ${prenda ? `· Prenda: <strong>${prenda}</strong>` : ''}
    ${talla ? `· Talla: <strong>${talla}</strong>` : ''}
  `;

  // Si la acción es Empacar, mostrar desglose: stock libre + acaparado por escuela
  // = disponibilidad efectiva. La prioridad es consumir el acaparado primero.
  if (accion === 'empacado') {
    const disp = _calcularDisponibilidad(escSel, prenda, talla);
    if (disp.total > 0 || disp.acaparado > 0 || disp.stockLibre > 0) {
      const detEsc = Object.entries(disp.acaparadoPorEsc)
        .filter(([_, n]) => n > 0)
        .map(([eid, n]) => `${escName(eid)} <strong>${n}</strong>`).join(' · ');
      resumenHtml += `
        <div style="margin-top:6px;padding:8px 10px;background:#FFF8E6;border-left:3px solid #f80;border-radius:3px;font-size:11px;line-height:1.5">
          📊 <strong>Disponibilidad${prenda||talla?' ('+(prenda||'')+' '+(talla||'')+')':''}</strong>:<br>
          🔒 Acaparado: <strong>${disp.acaparado}</strong>${detEsc?` (${detEsc})`:''} — se consume primero<br>
          📦 Stock libre en bodega: <strong>${disp.stockLibre}</strong>${disp.stockLibre>0?' — disponible para cualquier escuela':''}<br>
          ➕ <strong>Total empacable para estas escuelas: ${disp.total}</strong>
        </div>
      `;
    }
  } else if (accion === 'entregado') {
    // Avisar si hay alumnos en estado reservado/pendiente (entregar directo = más rápido pero sin pasar por empacar)
    const directos = filtros.filter(a =>
      (a._topElig && (a.estado_top === 'reservado' || a.estado_top === 'pendiente' || !a.estado_top)) ||
      (a._botElig && (a.estado_bottom === 'reservado' || a.estado_bottom === 'pendiente' || !a.estado_bottom))
    );
    if (directos.length > 0) {
      resumenHtml += `
        <div style="margin-top:6px;padding:6px 8px;background:#E8F4FD;border-left:3px solid #0066cc;border-radius:3px;font-size:11px">
          ℹ️ ${directos.length} alumno(s) saltearán "empacar" → entrega directa (descuenta bodega + registra entrega).
        </div>
      `;
    }
  }

  resumen.innerHTML = resumenHtml;

  if (filtros.length === 0) {
    cont.innerHTML = '<div class="alert alert-info" style="margin:10px">Sin alumnos elegibles. Probá cambiar filtros o acción.</div>';
    return;
  }

  // Para empacar/entregar: simular el consumo de stock fila por fila
  // para que cada alumno muestre si hay stock suficiente (🟢) o no (🔴).
  // El acaparado del propio alumno (estado='reservado') cuenta como reserva ya hecha.
  const consumoStock = {};  // key "prenda|talla" → cuántas ya se "consumieron" arriba
  const stockDe = (prenda, talla) => {
    const row = asignarCache.stock.find(s =>
      ((s.nombre_prenda || s.cod_prenda) === prenda) && s.talla_key === talla);
    return row ? (Number(row.stock_actual) || 0) : 0;
  };

  cont.innerHTML = filtros.map(a => {
    const esc = escName(a.escuela_id);

    // Determinar disponibilidad para cada pieza
    const evalPieza = (prenda, talla, estadoActual, elig) => {
      if (!elig) return { ok: true, icon: '', note: 'no aplica' };
      // Si la acción es Acaparar: no requiere stock físico (no descuenta bodega)
      if (accion === 'reservado') return { ok: true, icon: '🟢', note: '' };
      // Si ya está empacado o entregado y solo cambia a entregado, no consume stock nuevo
      if ((accion === 'entregado') && estadoActual === 'empacado') return { ok: true, icon: '🟢', note: 'ya empacado' };
      // Si ya estaba reservado, el acaparado lo cubre — no consume stock libre
      if (estadoActual === 'reservado') return { ok: true, icon: '🔒', note: 'acaparado' };
      // Si es pendiente y la acción es empacar/entregar: necesita stock físico
      const key = prenda + '|' + talla;
      const consumido = consumoStock[key] || 0;
      const disponible = stockDe(prenda, talla) - consumido;
      if (disponible >= 1) {
        consumoStock[key] = consumido + 1;  // simular consumo
        return { ok: true, icon: '🟢', note: '' };
      }
      return { ok: false, icon: '🔴', note: 'sin stock' };
    };

    const evTop = a.talla_top_key ? evalPieza(a.prenda_top, a.talla_top_key, a.estado_top, a._topElig) : null;
    const evBot = a.talla_bottom_key ? evalPieza(a.prenda_bottom, a.talla_bottom_key, a.estado_bottom, a._botElig) : null;

    const renderPieza = (ev, talla, estado, sinTexto) => {
      if (!talla) return `<small style="color:#aaa">${sinTexto}</small>`;
      return `${ev.icon} <code>${talla}</code> <small style="color:${ev.ok?'#666':'#c44'}">(${estadoLabel(estado)}${ev.note?' · '+ev.note:''})</small>`;
    };

    // Si NINGUNA de las dos piezas está OK para esta acción, dejamos el checkbox deshabilitado
    const algunaOk = (evTop && evTop.ok && a._topElig) || (evBot && evBot.ok && a._botElig);
    const isReady = algunaOk;
    if (!isReady) asignarCache.marcados.delete(a.id);

    return `
      <label style="display:flex;gap:6px;padding:4px 6px;border-bottom:1px solid #F0F0F0;align-items:center;cursor:pointer;font-size:12px;${isReady?'':'opacity:0.6'}">
        <input type="checkbox" ${isReady?'checked':'disabled'} onchange="asignarToggle('${a.id}', this.checked)">
        <span style="flex:1"><strong>${a.nombre}</strong> · ${esc} · ${a.grado || '?'}</span>
        <span>${renderPieza(evTop, a.talla_top_key, a.estado_top, 'sin top')} / ${renderPieza(evBot, a.talla_bottom_key, a.estado_bottom, 'sin bot')}</span>
      </label>
    `;
  }).join('');

  // Si después del consumo simulado hay alumnos sin stock, mostrar aviso
  const sinStock = filtros.filter(a => {
    const okTop = !a._topElig || !a.talla_top_key || a.estado_top === 'reservado' || a.estado_top === 'empacado';
    const okBot = !a._botElig || !a.talla_bottom_key || a.estado_bottom === 'reservado' || a.estado_bottom === 'empacado';
    return !okTop || !okBot;
  });
  if (accion === 'empacado' && sinStock.length > 0) {
    // Solo informativo, los rojos ya están marcados visualmente
  }
}

function asignarToggle(alumnoId, marcado) {
  if (marcado) asignarCache.marcados.add(alumnoId);
  else asignarCache.marcados.delete(alumnoId);
}
function asignarMarcarTodos(b) {
  asignarCache.marcados = b ? new Set(asignarCache.filtrados.map(a => a.id)) : new Set();
  // Actualizar checkboxes
  document.querySelectorAll('#asi-lista input[type=checkbox]').forEach(cb => cb.checked = b);
}

function estadoLabel(e) {
  if (!e || e === 'pendiente') return '⏳pendiente';
  if (e === 'reservado') return '🔒reservado';
  if (e === 'empacado') return '📦empacado';
  if (e === 'entregado') return '🚚entregado';
  return e;
}

// Construye los UPDATEs y movimientos necesarios y los aplica
async function aplicarAsignar() {
  const accion = asignarCache.accion;
  if (!accion) return alert('Elegí una acción');
  const ids = [...asignarCache.marcados];
  if (ids.length === 0) return alert('Marcá al menos un alumno');

  const alumnos = asignarCache.filtrados.filter(a => ids.includes(a.id));

  // Pre-cargar pool acaparado por escuelas afectadas (sólo si vamos a empacar)
  // pool = mapa "escuela|prenda|talla" → { id, disponible }
  // Cuando se empaca un alumno y hay pool disponible, en vez de descontar stock
  // se incrementa cantidad_consumida del pool.
  const pool = {};
  if (accion === 'empacado') {
    try {
      const escIds = [...new Set(alumnos.map(a => a.escuela_id).filter(Boolean))];
      if (escIds.length) {
        const rows = await supaFetchAll('escuela_acaparado',
          `?escuela_id=in.(${escIds.join(',')})&select=id,escuela_id,nombre_prenda,talla_key,cantidad_acaparada,cantidad_consumida`);
        for (const r of rows) {
          const k = r.escuela_id + '|' + r.nombre_prenda + '|' + r.talla_key;
          const disp = (Number(r.cantidad_acaparada) || 0) - (Number(r.cantidad_consumida) || 0);
          if (disp <= 0) continue;
          // Si hay varios registros para la misma combinación, agruparlos
          if (!pool[k]) pool[k] = { rows: [], disponible: 0 };
          pool[k].rows.push({ id: r.id, libres: disp });
          pool[k].disponible += disp;
        }
      }
    } catch (e) { console.warn('No se pudo cargar pool acaparado:', e); }
  }

  // VALIDACIÓN DE STOCK: para Empacar/Entregar, simular consumo y bloquear
  // si alguna combinación prenda+talla excede el stock disponible (pool + libre).
  // Acaparar no requiere validación porque no toca stock físico.
  if (accion !== 'reservado') {
    const consumoStock = {};  // "prenda|talla" → piezas que DEBEN salir del stock (no pool)
    // Simular: cada pieza intenta primero consumir pool de su escuela
    const poolSim = {};
    for (const k of Object.keys(pool)) poolSim[k] = pool[k].disponible;
    for (const a of alumnos) {
      const tryConsume = (prenda, talla, estado, elig) => {
        if (!elig || !talla) return;
        if (estado === 'empacado') return;
        if (accion === 'empacado') {
          const kPool = a.escuela_id + '|' + prenda + '|' + talla;
          if ((poolSim[kPool] || 0) > 0) { poolSim[kPool]--; return; }
        }
        const kStock = prenda + '|' + talla;
        consumoStock[kStock] = (consumoStock[kStock] || 0) + 1;
      };
      if (a._topElig) tryConsume(a.prenda_top, a.talla_top_key, a.estado_top, true);
      if (a._botElig) tryConsume(a.prenda_bottom, a.talla_bottom_key, a.estado_bottom, true);
    }
    const errores = [];
    for (const [k, n] of Object.entries(consumoStock)) {
      const [prenda, talla] = k.split('|');
      const row = asignarCache.stock.find(s =>
        ((s.nombre_prenda || s.cod_prenda) === prenda) && s.talla_key === talla);
      const disp = row ? (Number(row.stock_actual) || 0) : 0;
      if (n > disp) {
        errores.push(`${prenda} ${talla}: querés ${n} de bodega libre pero solo hay ${disp}`);
      }
    }
    if (errores.length > 0) {
      alert(
        '❌ No hay stock suficiente en bodega para algunas piezas.\n\n' +
        errores.join('\n') +
        '\n\nOpciones:\n' +
        '  • Registrá entrada en bodega primero\n' +
        '  • Acaparar primero para reservar piezas para esta escuela\n' +
        '  • Desmarcá los alumnos sin stock y aplicá los demás'
      );
      return;
    }
  }

  const btn = document.getElementById('asi-btn-aplicar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Aplicando...'; }

  try {
    let totalTopUpdated = 0, totalBotUpdated = 0, pieasDesdePool = 0;
    const movs = [];
    // Track de consumos del pool a aplicar al final: rowId → delta de cantidad_consumida
    const poolDelta = {};

    // Intenta consumir 1 unidad del pool para escuela+prenda+talla. Retorna true si pudo.
    const consumirDelPool = (escId, prenda, talla) => {
      const k = escId + '|' + prenda + '|' + talla;
      const entry = pool[k];
      if (!entry || entry.disponible <= 0) return false;
      // Buscar el primer row con libres > 0
      for (const r of entry.rows) {
        if (r.libres > 0) {
          r.libres--;
          entry.disponible--;
          poolDelta[r.id] = (poolDelta[r.id] || 0) + 1;
          return true;
        }
      }
      return false;
    };

    // Procesar cada alumno: actualizar estados y juntar movimientos
    for (const a of alumnos) {
      const update = { actualizado_en: new Date().toISOString() };
      if (a._topElig) {
        update.estado_top = accion;
        if (accion === 'empacado') {
          if (consumirDelPool(a.escuela_id, a.prenda_top, a.talla_top_key)) {
            pieasDesdePool++;
          } else {
            movs.push({
              tipo: 'SALIDA_EMPAQUE',
              cod_prenda: _codPrenda(a.prenda_top),
              nombre_prenda: a.prenda_top,
              talla_key: a.talla_top_key,
              cantidad: 1,
              alumno_id: a.id,
              escuela_id: a.escuela_id,
              fecha: new Date().toISOString().slice(0,10),
              observaciones: `Empacado para ${a.nombre}`,
            });
          }
        } else if (accion === 'entregado' && a.estado_top !== 'entregado'
                   && (a.estado_top === 'reservado' || !a.estado_top || a.estado_top === 'pendiente')) {
          movs.push({
            tipo: 'SALIDA_ENTREGA',
            cod_prenda: _codPrenda(a.prenda_top),
            nombre_prenda: a.prenda_top,
            talla_key: a.talla_top_key,
            cantidad: 1,
            alumno_id: a.id,
            escuela_id: a.escuela_id,
            fecha: new Date().toISOString().slice(0,10),
            observaciones: `Entregado directo a ${a.nombre}`,
          });
        }
        totalTopUpdated++;
      }
      if (a._botElig) {
        update.estado_bottom = accion;
        if (accion === 'empacado') {
          if (consumirDelPool(a.escuela_id, a.prenda_bottom, a.talla_bottom_key)) {
            pieasDesdePool++;
          } else {
            movs.push({
              tipo: 'SALIDA_EMPAQUE',
              cod_prenda: _codPrenda(a.prenda_bottom),
              nombre_prenda: a.prenda_bottom,
              talla_key: a.talla_bottom_key,
              cantidad: 1,
              alumno_id: a.id,
              escuela_id: a.escuela_id,
              fecha: new Date().toISOString().slice(0,10),
              observaciones: `Empacado para ${a.nombre}`,
            });
          }
        } else if (accion === 'entregado' && a.estado_bottom !== 'entregado'
                   && (a.estado_bottom === 'reservado' || !a.estado_bottom || a.estado_bottom === 'pendiente')) {
          movs.push({
            tipo: 'SALIDA_ENTREGA',
            cod_prenda: _codPrenda(a.prenda_bottom),
            nombre_prenda: a.prenda_bottom,
            talla_key: a.talla_bottom_key,
            cantidad: 1,
            alumno_id: a.id,
            escuela_id: a.escuela_id,
            fecha: new Date().toISOString().slice(0,10),
            observaciones: `Entregado directo a ${a.nombre}`,
          });
        }
        totalBotUpdated++;
      }
      await supaUpdate('alumno', a.id, update);
    }

    // Insertar movimientos en bulk (sólo los que no vinieron del pool)
    if (movs.length > 0) {
      await supaFetch('bodega_movimiento', 'POST', movs);
    }
    if (Object.keys(poolDelta).length > 0) {
      await _consumePoolBatch(poolDelta);
    }

    cerrarAsignarModal();
    if (bodegaCache.vistaActual === 'stock') await cargarBodegaStock();
    else if (bodegaCache.vistaActual === 'movimientos') await cargarMovimientos();
    else if (bodegaCache.vistaActual === 'vs_demanda') await cargarBodegaVsDemanda();
    const detPool = pieasDesdePool > 0 ? ` · ${pieasDesdePool} pieza(s) del pool acaparado` : '';
    alert(`✓ ${alumnos.length} alumno(s) actualizados (${totalTopUpdated} tops · ${totalBotUpdated} bottoms). ${movs.length} movimiento(s) de bodega${detPool}.`);
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Aplicar'; }
  }
}

function _codPrenda(prenda) {
  const map = { 'CAMISA':'C','BLUSA':'B','CAMISA_CELESTE':'CC','PANTALON':'P','PANTALON_BEIGE':'PB',
    'FALDA':'F','FALDA_BEIGE':'FB','FALDA_C.E':'FCE','SHORT':'S' };
  return map[(prenda||'').toUpperCase()] || (prenda||'').slice(0,3).toUpperCase();
}

// Calcula disponibilidad efectiva = acaparado para las escuelas + stock libre.
// stock libre = stock_actual - reservas en otras escuelas (acaparado ajeno).
// El acaparado para estas escuelas se consume primero al empacar.
// Filtra por prenda/talla si están dadas; si no, suma todas las combinaciones
// que aparezcan en alumnos elegibles.
function _calcularDisponibilidad(escSel, prenda, talla) {
  const escSet = new Set(escSel);
  const acaparadoPorEsc = {};
  let acaparadoMio = 0;
  let acaparadoAjeno = 0;

  // Recolectar combinaciones (prenda, talla) relevantes
  const combos = new Set();
  for (const a of asignarCache.alumnos) {
    if (a.prenda_top && a.talla_top_key && (!prenda || a.prenda_top === prenda) && (!talla || a.talla_top_key === talla)) {
      combos.add(a.prenda_top + '|' + a.talla_top_key);
    }
    if (a.prenda_bottom && a.talla_bottom_key && (!prenda || a.prenda_bottom === prenda) && (!talla || a.talla_bottom_key === talla)) {
      combos.add(a.prenda_bottom + '|' + a.talla_bottom_key);
    }
  }

  // Contar acaparados por escuela (las mías vs ajenas)
  for (const a of asignarCache.alumnos) {
    const top = a.estado_top === 'reservado' && a.prenda_top && a.talla_top_key
      && combos.has(a.prenda_top + '|' + a.talla_top_key);
    const bot = a.estado_bottom === 'reservado' && a.prenda_bottom && a.talla_bottom_key
      && combos.has(a.prenda_bottom + '|' + a.talla_bottom_key);
    if (top) {
      if (escSet.has(a.escuela_id)) {
        acaparadoPorEsc[a.escuela_id] = (acaparadoPorEsc[a.escuela_id] || 0) + 1;
        acaparadoMio++;
      } else acaparadoAjeno++;
    }
    if (bot) {
      if (escSet.has(a.escuela_id)) {
        acaparadoPorEsc[a.escuela_id] = (acaparadoPorEsc[a.escuela_id] || 0) + 1;
        acaparadoMio++;
      } else acaparadoAjeno++;
    }
  }

  // Stock total en bodega para estas combinaciones, descontar acaparado ajeno = stock libre
  let stockTotal = 0;
  for (const c of combos) {
    const [p, t] = c.split('|');
    const row = asignarCache.stock.find(s =>
      ((s.nombre_prenda || s.cod_prenda) === p) && s.talla_key === t);
    if (row) stockTotal += Number(row.stock_actual) || 0;
  }
  const stockLibre = Math.max(0, stockTotal - acaparadoAjeno);
  const total = acaparadoMio + stockLibre;

  return {
    acaparado: acaparadoMio,
    acaparadoPorEsc,
    stockLibre,
    total,
  };
}

// ─── Modal: SALIDA A ESCUELA ─────────────────────────────────────
// Específico para entregas. Permite elegir escuela, prenda y talla
// del catálogo (con stock visible), valida cantidad <= stock.
let salidaCache = { escuelas: null, stock: null };

async function abrirSalidaModal() {
  const modal = document.getElementById('bodega-salida-modal');
  if (!modal) return;
  // Reset
  document.getElementById('sal-escuela').value = '';
  document.getElementById('sal-prenda').value = '';
  document.getElementById('sal-talla').innerHTML = '<option value="">— Elegí prenda primero —</option>';
  document.getElementById('sal-cantidad').value = '';
  document.getElementById('sal-obs').value = '';
  document.getElementById('sal-stock-info').style.display = 'none';

  modal.style.display = 'flex';

  try {
    // Cargar escuelas y stock en paralelo (si no están cacheados)
    if (!salidaCache.escuelas) {
      salidaCache.escuelas = await supaFetchAll('escuela',
        '?activa=eq.true&select=id,alias,nombre,codigo_cde&order=alias');
    }
    if (!salidaCache.stock || true) {
      // Siempre recargar stock para mostrar el valor más fresco
      salidaCache.stock = await supaFetchAll('vw_bodega_stock',
        '?stock_actual=gt.0&select=cod_prenda,nombre_prenda,talla_key,stock_actual,reservado_empaque');
    }

    // Popular select de escuelas
    const selE = document.getElementById('sal-escuela');
    selE.innerHTML = '<option value="">— Elegí escuela —</option>' +
      salidaCache.escuelas.map(e => `<option value="${e.id}">${e.alias || e.nombre}${e.codigo_cde ? ' · '+e.codigo_cde : ''}</option>`).join('');

    // Popular select de prendas (las que tienen stock > 0)
    const prendasUnicas = [...new Set(salidaCache.stock.map(s => s.nombre_prenda || s.cod_prenda))].sort();
    const selP = document.getElementById('sal-prenda');
    selP.innerHTML = '<option value="">— Elegí prenda —</option>' +
      prendasUnicas.map(p => `<option value="${p}">${p}</option>`).join('');
  } catch (e) {
    alert('Error cargando datos: ' + e.message);
  }
}

function cerrarSalidaModal() {
  document.getElementById('bodega-salida-modal').style.display = 'none';
}

// Cuando cambia la prenda, repoblar tallas con stock disponible
function onSalidaPrendaCambio() {
  const prenda = document.getElementById('sal-prenda').value;
  const selT = document.getElementById('sal-talla');
  if (!prenda) {
    selT.innerHTML = '<option value="">— Elegí prenda primero —</option>';
    document.getElementById('sal-stock-info').style.display = 'none';
    return;
  }
  const tallas = (salidaCache.stock || [])
    .filter(s => (s.nombre_prenda || s.cod_prenda) === prenda)
    .sort((a,b) => (a.talla_key||'').localeCompare(b.talla_key||'', 'es', { numeric: true }));
  selT.innerHTML = '<option value="">— Elegí talla —</option>' +
    tallas.map(s => `<option value="${s.talla_key}">${s.talla_key} (stock: ${s.stock_actual})</option>`).join('');
  document.getElementById('sal-stock-info').style.display = 'none';
}

// Cuando cambia la talla (o la prenda), mostrar stock disponible
function onSalidaPrendaTalla() {
  const prenda = document.getElementById('sal-prenda').value;
  const talla = document.getElementById('sal-talla').value;
  const info = document.getElementById('sal-stock-info');
  if (!prenda || !talla) { info.style.display = 'none'; return; }
  const row = (salidaCache.stock || []).find(s =>
    (s.nombre_prenda || s.cod_prenda) === prenda && s.talla_key === talla);
  if (!row) { info.style.display = 'none'; return; }
  const disponible = (row.stock_actual || 0) - (row.reservado_empaque || 0);
  info.style.display = '';
  info.innerHTML = `
    <strong>${prenda} ${talla}</strong>:
    Stock actual <strong>${row.stock_actual}</strong>
    · Reservado <strong>${row.reservado_empaque || 0}</strong>
    · <span style="color:var(--verde);font-weight:700">Disponible ${disponible}</span>
  `;
  document.getElementById('sal-cantidad').max = disponible;
}

async function guardarSalida() {
  const escuelaId = document.getElementById('sal-escuela').value;
  const prenda = document.getElementById('sal-prenda').value;
  const talla = document.getElementById('sal-talla').value;
  const cantidad = parseInt(document.getElementById('sal-cantidad').value, 10);
  const obs = document.getElementById('sal-obs').value.trim() || null;

  if (!escuelaId) return alert('Elegí una escuela');
  if (!prenda) return alert('Elegí una prenda');
  if (!talla) return alert('Elegí una talla');
  if (!cantidad || cantidad <= 0) return alert('Cantidad inválida');

  // Validar stock disponible
  const row = (salidaCache.stock || []).find(s =>
    (s.nombre_prenda || s.cod_prenda) === prenda && s.talla_key === talla);
  const disponible = row ? (row.stock_actual || 0) - (row.reservado_empaque || 0) : 0;
  if (cantidad > disponible) {
    return alert(`No hay suficiente stock disponible. Solo hay ${disponible} de ${prenda} ${talla}.`);
  }

  // Derivar cod_prenda
  const codMap = {
    'CAMISA':'C','BLUSA':'B','CAMISA_CELESTE':'CC','PANTALON':'P','PANTALON_BEIGE':'PB',
    'FALDA':'F','FALDA_BEIGE':'FB','FALDA_C.E':'FCE','SHORT':'S'
  };
  const codPrenda = codMap[prenda.toUpperCase()] || prenda.slice(0,3).toUpperCase();

  const btn = document.getElementById('sal-btn-guardar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }
  try {
    await supaFetch('bodega_movimiento', 'POST', {
      tipo: 'SALIDA_ENTREGA',
      cod_prenda: codPrenda,
      nombre_prenda: prenda,
      talla_key: talla,
      cantidad: cantidad,
      escuela_id: escuelaId,
      fecha: new Date().toISOString().slice(0, 10),
      observaciones: obs,
    });
    cerrarSalidaModal();
    // Refrescar la vista actual
    if (bodegaCache.vistaActual === 'stock') await cargarBodegaStock();
    else if (bodegaCache.vistaActual === 'movimientos') await cargarMovimientos();
    else if (bodegaCache.vistaActual === 'vs_demanda') await cargarBodegaVsDemanda();
    // Invalidar cache de stock para próxima salida
    salidaCache.stock = null;
    alert(`✓ Salida registrada: ${cantidad} ${prenda} ${talla}`);
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🚚 Registrar salida'; }
  }
}

// ─── Hook: registrar entrada al terminar bulto ──────────────────────
// Se llama desde producción cuando un bulto pasa a "terminado"
async function registrarEntradaBodegaPorBulto(bulto) {
  if (!bulto || !bulto.cod_prenda || !bulto.talla_salida || !bulto.cantidad_final) return;
  try {
    await supaFetch('bodega_movimiento', 'POST', {
      tipo: 'ENTRADA_PRODUCCION',
      cod_prenda: bulto.cod_prenda,
      nombre_prenda: bulto.nombre_prenda || null,
      talla_key: bulto.talla_salida,
      cantidad: bulto.cantidad_final,
      produccion_bulto_id: bulto.id,
      observaciones: `Bulto ${bulto.codigo_bulto || bulto.id.slice(0,6)} terminado`
    });
  } catch(e) {
    console.warn('No se pudo registrar entrada bodega:', e.message);
  }
}

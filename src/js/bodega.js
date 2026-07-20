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
    <div style="background:white;padding:8px 10px;border-radius:8px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px">
      <!-- Filtros de visualización -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding-bottom:8px;border-bottom:1px dashed #E0E0E0">
        <span style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px">Filtros</span>
        <label style="font-size:12px;display:flex;align-items:center;gap:4px;margin:0">
          Prenda
          <select onchange="bodegaCache.filtroPrenda = this.value || null; renderStock()" style="padding:4px 8px;width:auto">
            <option value="">Todas</option>
            ${prendas.map(p => `<option value="${p}" ${p===bodegaCache.filtroPrenda?'selected':''}>${p}</option>`).join('')}
          </select>
        </label>
        <label style="font-size:12px;display:flex;align-items:center;gap:4px;margin:0">
          <input type="checkbox" ${bodegaCache.filtroTallaVacia?'checked':''}
                 onchange="bodegaCache.filtroTallaVacia = this.checked; renderStock()" style="width:auto">
          Mostrar vacíos
        </label>
      </div>
      <!-- Acciones consolidadas en un solo dropdown nativo (details/summary).
           Tap "✚ Acciones" abre/cierra el panel. Sin JS extra. -->
      <div style="display:flex;gap:6px;align-items:flex-start">
        <details class="acciones-dd" style="flex:1">
          <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;background:var(--azul);color:white;border-radius:6px;font-weight:600;font-size:14px">
            <span>✚ Acciones de bodega</span>
            <span style="font-size:12px;opacity:0.9">▼</span>
          </summary>
          <div style="padding:8px;margin-top:6px;background:white;border:1px solid var(--borde);border-radius:6px;box-shadow:0 4px 8px rgba(0,0,0,0.05)">
            <!-- Fase 2 empaque unificado: la SESIÓN es la acción principal.
                 Empacar-selector, empacar-pool y asignar quedaron sin botón
                 (el código se elimina en Fase 3). Acaparar por cantidad se
                 demota a "Otras" (el caso normal es 🔒 Reservar en la sesión). -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px">
              <button class="btn btn-success btn-sm" onclick="switchTab('empaque')" title="Escuela → marcar piezas → empacar → entrega" style="text-align:left">🧺 Sesión de empaque</button>
              <button class="btn btn-warning btn-sm" onclick="emqAbrirReserva()" title="Apartar stock por talla y cantidad para una escuela (elegís escuela y prenda en el modal)" style="text-align:left">🔒 Reservar tallas</button>
              <button class="btn btn-ghost btn-sm" onclick="abrirEntradaManual()" style="text-align:left">📥 + Entrada de stock</button>
            </div>
            <!-- Otras acciones (menos frecuentes) -->
            <details style="margin-top:6px">
              <summary style="cursor:pointer;list-style:none;font-size:12px;color:#666;padding:4px 2px;user-select:none">⋯ Otras acciones</summary>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px;margin-top:4px">
                <button class="btn btn-ghost btn-sm" onclick="abrirEntregaModal()" title="Marcar empacados de una escuela como entregados" style="text-align:left">🚚 Marcar entrega</button>
                <button class="btn btn-ghost btn-sm" onclick="abrirConteoModal()" title="Carga rápida de stock físico" style="text-align:left">📊 Conteo inicial</button>
                <button class="btn btn-ghost btn-sm" onclick="abrirSalidaModal()" title="Salida sin alumnos" style="text-align:left">↗ Salida rápida</button>
              </div>
            </details>
          </div>
        </details>
        <button class="btn btn-ghost btn-sm" onclick="cargarBodegaStock()" title="Refrescar lista" style="padding:10px 12px">🔄</button>
      </div>
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
    const movs = await supaFetch('bodega_movimiento', 'GET', null,
      '?select=tipo,nombre_prenda,cod_prenda,talla_key,cantidad,observaciones,creado_en' +
      '&order=creado_en.desc&limit=200');
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
        <button class="btn btn-success btn-sm" onclick="switchTab('empaque')" title="Escuela → marcar piezas → reservar o empacar → entrega">🧺 Sesión de empaque</button>
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
// Prenda→código (mismo mapa canónico que usa el resto de bodega)
const ENT_PRENDAS = {
  'CAMISA':'C','BLUSA':'B','CAMISA_CELESTE':'CC','PANTALON':'P','PANTALON_BEIGE':'PB',
  'FALDA':'F','FALDA_BEIGE':'FB','FALDA_C.E':'FCE','SHORT':'S',
};

function abrirEntradaManual() {
  const modal = document.getElementById('bodega-entrada-modal');
  if (!modal) return;
  // Poblar select de prendas desde el mapa canónico
  const selP = document.getElementById('ent-prenda');
  selP.innerHTML = '<option value="">— Elegí prenda —</option>' +
    Object.keys(ENT_PRENDAS).map(p => `<option value="${p}">${p}</option>`).join('');
  document.getElementById('ent-talla').innerHTML = '<option value="">— Elegí prenda primero —</option>';
  document.getElementById('ent-talla-otra-wrap').style.display = 'none';
  document.getElementById('ent-talla-otra').value = '';
  document.getElementById('ent-cantidad').value = '';
  document.getElementById('ent-obs').value = '';
  document.getElementById('ent-tipo').value = 'ENTRADA_MANUAL';
  modal.style.display = 'flex';
}

// Al elegir prenda: llenar tallas válidas = catálogo + tallas ya vistas en
// el stock de esa prenda (para poder ajustar SKUs existentes no estándar).
function entPrendaCambio() {
  const prenda = document.getElementById('ent-prenda').value;
  const selT = document.getElementById('ent-talla');
  document.getElementById('ent-talla-otra-wrap').style.display = 'none';
  if (!prenda) {
    selT.innerHTML = '<option value="">— Elegí prenda primero —</option>';
    return;
  }
  const cod = ENT_PRENDAS[prenda];
  const tallas = new Set();
  const cat = (typeof CATALOGO !== 'undefined' ? CATALOGO : CATALOGO_BASE)[cod];
  if (cat && cat.keys) for (const k of cat.keys) tallas.add(k);
  // Tallas ya existentes en stock de esa prenda (aunque no estén en catálogo)
  for (const s of (bodegaCache.stock || [])) {
    if ((s.nombre_prenda === prenda || s.cod_prenda === cod) && s.talla_key) tallas.add(s.talla_key);
  }
  const lista = [...tallas].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  selT.innerHTML = '<option value="">— Elegí talla —</option>' +
    lista.map(t => `<option value="${t}">${t}</option>`).join('') +
    '<option value="__OTRA__">✏️ Otra talla (escribir)…</option>';
}

function cerrarEntradaManual() {
  document.getElementById('bodega-entrada-modal').style.display = 'none';
}

async function guardarEntradaManual() {
  const prenda = document.getElementById('ent-prenda').value;
  const selT = document.getElementById('ent-talla').value;
  const talla = selT === '__OTRA__'
    ? document.getElementById('ent-talla-otra').value.trim().toUpperCase()
    : selT;
  const cantidad = parseInt(document.getElementById('ent-cantidad').value);
  const obs = document.getElementById('ent-obs').value.trim() || null;
  const tipo = document.getElementById('ent-tipo').value;

  if (!prenda || !talla || !cantidad || cantidad <= 0) {
    alert('Completá prenda, talla y cantidad > 0'); return;
  }
  const codPrenda = ENT_PRENDAS[prenda];

  // Talla escrita a mano: doble chequeo antes de crear un SKU nuevo.
  if (selT === '__OTRA__') {
    if (!talla.startsWith(codPrenda)) {
      alert(`La KEY debe empezar con el código de la prenda (${codPrenda}). Ej: ${codPrenda}12`);
      return;
    }
    if (!confirm(`"${talla}" NO está en el catálogo de ${prenda}.\n\n¿Seguro que la KEY es correcta? Va a crear un código nuevo en bodega.`)) return;
  }

  try {
    await supaFetch('bodega_movimiento', 'POST', {
      tipo, cod_prenda: codPrenda, nombre_prenda: prenda, talla_key: talla,
      cantidad, observaciones: obs
    });
    cerrarEntradaManual();
    await cargarBodegaStock();
  } catch(e) {
    alert('Error: ' + e.message);
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
      <tr class="conteo-row" style="border-top:1px solid #EEE">
        <td data-label="Prenda" style="padding:4px 8px">
          ${f.nueva
            ? `<input type="text" value="${f.prenda||''}" data-col="prenda" oninput="conteoSetFila(${i},'prenda',this.value)" placeholder="ej: CAMISA" style="width:100%;padding:2px 4px">`
            : `<span>${escapeHtmlAca(f.prenda)}</span>`}
        </td>
        <td data-label="Talla" style="padding:4px 8px">
          ${f.nueva
            ? `<input type="text" value="${f.talla||''}" data-col="talla" oninput="conteoSetFila(${i},'talla',this.value)" placeholder="ej: C14" style="width:100%;padding:2px 4px">`
            : `<span style="font-family:monospace">${escapeHtmlAca(f.talla)}</span>`}
        </td>
        <td data-label="App" style="padding:4px 8px;text-align:right;color:#666">${f.stockApp || 0}</td>
        <td data-label="Físico *" style="padding:4px 8px;text-align:right">
          <input type="number" value="${f.fisico}" min="0" data-col="fisico"
                 oninput="conteoSetFila(${i},'fisico',this.value)"
                 style="width:70px;padding:2px 4px;text-align:right">
        </td>
        <td data-label="Δ" style="padding:4px 8px;text-align:right">${deltaTxt}</td>
        <td data-label="" style="padding:4px 8px;text-align:center">
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

const _NIVEL_LBL = { PARV: 'Parvularia', BASICA: 'Básica', BACH: 'Bachillerato', OTRO: 'Otro' };
const _SEXO_LBL  = { F: '♀ Niñas', M: '♂ Niños' };

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
  const tok = await authTokenFresh() || SUPA_KEY;
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

function estadoLabel(e) {
  if (!e || e === 'pendiente') return '⏳pendiente';
  if (e === 'reservado') return '🔒reservado';
  if (e === 'empacado') return '📦empacado';
  if (e === 'entregado') return '🚚entregado';
  return e;
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

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
  cont.innerHTML = '<div class="text-muted">Cargando stock...</div>';
  try {
    const stock = await supaFetch('vw_bodega_stock', 'GET', null, '?order=nombre_prenda,talla_key&limit=1000');
    bodegaCache.stock = stock;
    renderStock();
  } catch(e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
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
      <button class="btn btn-primary btn-sm" onclick="abrirSalidaModal()">🚚 Salida a escuela</button>
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
        <button class="btn btn-primary btn-sm" onclick="abrirSalidaModal()">🚚 Salida a escuela</button>
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

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
      <button class="btn btn-primary btn-sm" onclick="abrirAsignarModal()">🎯 Asignar / Empacar / Entregar</button>
      <button class="btn btn-ghost btn-sm" onclick="abrirSalidaModal()" title="Salida genérica (sin alumnos)">🚚 Salida rápida</button>
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
  prendas: [],
  tallas: [],
  filtrados: [],          // los que matchean los filtros actuales
  marcados: new Set(),    // ids de alumnos seleccionados
};

const ASIGNAR_INFO = {
  reservado: 'No toca el stock físico. Solo "aparta" piezas para estos alumnos. Útil para acaparar rápido.',
  empacado:  'Descuenta del stock real (SALIDA_EMPAQUE). Significa que las piezas están en la bolsa físicamente.',
  entregado: 'Registra SALIDA_ENTREGA. La bolsa sale del taller a la escuela.',
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
    // Cargar escuelas activas + alumnos para popular selects
    const [escuelas, alumnos] = await Promise.all([
      supaFetchAll('escuela', '?activa=eq.true&select=id,alias,nombre&order=alias'),
      supaFetchAll('alumno', '?activo=eq.true&select=id,nombre,grado,escuela_id,prenda_top,talla_top_key,estado_top,prenda_bottom,talla_bottom_key,estado_bottom&limit=10000'),
    ]);
    asignarCache.escuelas = escuelas;
    asignarCache.alumnos = alumnos;

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

  // Resumen
  resumen.innerHTML = `
    <strong>${filtros.length}</strong> alumno(s) elegibles ·
    Acción: <strong>${accion.toUpperCase()}</strong> ·
    Escuelas: <strong>${escSel.map(escName).join(', ')}</strong>
    ${prenda ? `· Prenda: <strong>${prenda}</strong>` : ''}
    ${talla ? `· Talla: <strong>${talla}</strong>` : ''}
  `;

  if (filtros.length === 0) {
    cont.innerHTML = '<div class="alert alert-info" style="margin:10px">Sin alumnos elegibles. Probá cambiar filtros o acción.</div>';
    return;
  }

  cont.innerHTML = filtros.map(a => {
    const esc = escName(a.escuela_id);
    const top = a.talla_top_key ? `<code>${a.talla_top_key}</code> <small>(${estadoLabel(a.estado_top)})</small>${a._topElig ? '' : ' <small style="color:#aaa">no aplica</small>'}` : '<small style="color:#aaa">sin top</small>';
    const bot = a.talla_bottom_key ? `<code>${a.talla_bottom_key}</code> <small>(${estadoLabel(a.estado_bottom)})</small>${a._botElig ? '' : ' <small style="color:#aaa">no aplica</small>'}` : '<small style="color:#aaa">sin bot</small>';
    return `
      <label style="display:flex;gap:6px;padding:4px 6px;border-bottom:1px solid #F0F0F0;align-items:center;cursor:pointer;font-size:12px">
        <input type="checkbox" checked onchange="asignarToggle('${a.id}', this.checked)">
        <span style="flex:1"><strong>${a.nombre}</strong> · ${esc} · ${a.grado || '?'}</span>
        <span>${top} / ${bot}</span>
      </label>
    `;
  }).join('');
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
  const btn = document.getElementById('asi-btn-aplicar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Aplicando...'; }

  try {
    let totalTopUpdated = 0, totalBotUpdated = 0;
    const movs = [];

    // Procesar cada alumno: actualizar estados y juntar movimientos
    for (const a of alumnos) {
      const update = { actualizado_en: new Date().toISOString() };
      if (a._topElig) {
        update.estado_top = accion;
        if (accion === 'empacado') {
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
        } else if (accion === 'entregado' && a.estado_top !== 'entregado') {
          if (accion === 'entregado' && (a.estado_top === 'reservado' || !a.estado_top || a.estado_top === 'pendiente')) {
            // Si saltea empacado, también descuenta bodega
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
          // Si venía de empacado, no genera movimiento extra (ya se descontó al empacar)
        }
        totalTopUpdated++;
      }
      if (a._botElig) {
        update.estado_bottom = accion;
        if (accion === 'empacado') {
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

    // Insertar todos los movimientos de una en bulk
    if (movs.length > 0) {
      await supaFetch('bodega_movimiento', 'POST', movs);
    }

    cerrarAsignarModal();
    if (bodegaCache.vistaActual === 'stock') await cargarBodegaStock();
    else if (bodegaCache.vistaActual === 'movimientos') await cargarMovimientos();
    else if (bodegaCache.vistaActual === 'vs_demanda') await cargarBodegaVsDemanda();
    alert(`✓ ${alumnos.length} alumno(s) actualizados (${totalTopUpdated} tops · ${totalBotUpdated} bottoms). ${movs.length} movimiento(s) de bodega.`);
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

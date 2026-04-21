// ══════════════════════════════════════════════════════════════════════
// PEDIDOS (v21)
// Pestaña principal para gestionar los pedidos de cada escuela por temporada
// ══════════════════════════════════════════════════════════════════════

let pedidosCache = {
  temporadas: [],
  escuelas: [],
  pedidosPorEscuela: {},  // escuela_id -> array de pedidos
  temporadaActual: null,
};

async function initPedidos() {
  try {
    // Cargar temporadas
    const temps = await supaFetch('vw_temporada_resumen', 'GET', null, '?order=anio.desc&limit=20');
    pedidosCache.temporadas = temps;
    // Elegir temporada activa si hay
    const activa = temps.find(t => t.estado === 'activa') || temps[0];
    if (activa) pedidosCache.temporadaActual = activa.id;
    
    renderPedidosHeader();
    
    if (pedidosCache.temporadaActual) {
      await cargarEscuelasTemporada();
    } else {
      document.getElementById('pedidos-lista').innerHTML = 
        '<div class="alert alert-info">No hay temporadas cargadas. Corré la migración v3.11 y la carga inicial.</div>';
    }
  } catch(e) {
    document.getElementById('pedidos-lista').innerHTML = 
      `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function renderPedidosHeader() {
  const cont = document.getElementById('pedidos-header');
  if (!cont) return;
  if (pedidosCache.temporadas.length === 0) {
    cont.innerHTML = '<div class="text-muted">Sin temporadas.</div>';
    return;
  }
  
  const opts = pedidosCache.temporadas.map(t => 
    `<option value="${t.id}" ${t.id === pedidosCache.temporadaActual ? 'selected' : ''}>${t.codigo} — ${t.estado}</option>`
  ).join('');
  
  const actual = pedidosCache.temporadas.find(t => t.id === pedidosCache.temporadaActual);
  const resumen = actual ? `
    <div style="margin-top:8px;display:flex;gap:12px;flex-wrap:wrap;font-size:13px">
      <div><strong>${actual.num_escuelas}</strong> escuelas</div>
      <div><strong>${actual.piezas_solicitadas?.toLocaleString() || 0}</strong> piezas</div>
      <div style="color:var(--verde)"><strong>${actual.piezas_entregadas?.toLocaleString() || 0}</strong> entregadas</div>
      <div style="color:var(--naranja)"><strong>${actual.piezas_pendientes?.toLocaleString() || 0}</strong> pendientes</div>
      <div><strong>${actual.porcentaje_avance}%</strong> avance</div>
    </div>` : '';
  
  cont.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <label style="font-size:11px;color:#666;display:block">Temporada</label>
        <select onchange="cambiarTemporada(this.value)" style="padding:6px 10px;border-radius:6px;border:1px solid var(--borde)">${opts}</select>
      </div>
      <button class="btn btn-primary btn-sm" onclick="abrirNuevaEscuela()">+ Escuela ad-hoc</button>
    </div>
    ${resumen}
  `;
}

async function cambiarTemporada(tempId) {
  pedidosCache.temporadaActual = tempId;
  renderPedidosHeader();
  await cargarEscuelasTemporada();
}

async function cargarEscuelasTemporada() {
  const cont = document.getElementById('pedidos-lista');
  cont.innerHTML = '<div class="text-muted">Cargando...</div>';
  try {
    const esc = await supaFetch('vw_pedido_escuela', 'GET', null, 
      `?temporada_id=eq.${pedidosCache.temporadaActual}&order=piezas_solicitadas.desc&limit=200`);
    pedidosCache.escuelas = esc;
    renderListaEscuelas();
  } catch(e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function renderListaEscuelas() {
  const cont = document.getElementById('pedidos-lista');
  if (!cont) return;
  
  if (pedidosCache.escuelas.length === 0) {
    cont.innerHTML = '<div class="alert alert-info">No hay escuelas en esta temporada.</div>';
    return;
  }
  
  cont.innerHTML = pedidosCache.escuelas.map(e => {
    const pct = e.porcentaje_avance || 0;
    const colorBar = pct >= 100 ? 'var(--verde)' : (pct > 0 ? 'var(--azul)' : '#CCC');
    return `
      <div class="card" style="padding:10px;margin-bottom:8px;cursor:pointer" onclick="abrirDetalleEscuela('${e.escuela_id}')">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div style="flex:1">
            <div style="font-weight:700;color:var(--azul)">${e.escuela_nombre}</div>
            <div style="font-size:11px;color:#666">CDE ${e.codigo_cde}</div>
            <div style="font-size:13px;margin-top:4px">
              <strong>${(e.piezas_entregadas||0).toLocaleString()}/${(e.piezas_solicitadas||0).toLocaleString()}</strong> piezas
              <span style="color:#999"> · ${e.lineas_pedido} líneas</span>
            </div>
          </div>
          <div style="font-size:20px;font-weight:700;color:${colorBar}">${pct}%</div>
        </div>
        <div style="background:#EEE;height:6px;border-radius:3px;margin-top:6px;overflow:hidden">
          <div style="background:${colorBar};height:100%;width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

async function abrirDetalleEscuela(escuelaId) {
  const modal = document.getElementById('pedidos-detalle-modal');
  if (!modal) return;
  
  const esc = pedidosCache.escuelas.find(e => e.escuela_id === escuelaId);
  if (!esc) return;
  
  document.getElementById('pedidos-detalle-titulo').textContent = esc.escuela_nombre;
  document.getElementById('pedidos-detalle-subt').textContent = `CDE ${esc.codigo_cde} · ${esc.piezas_entregadas||0}/${esc.piezas_solicitadas||0} piezas`;
  document.getElementById('pedidos-detalle-tabla').innerHTML = '<div class="text-muted">Cargando pedidos...</div>';
  
  modal.style.display = 'flex';
  
  try {
    const pedidos = await supaFetch('pedido', 'GET', null, 
      `?escuela_id=eq.${escuelaId}&order=nivel,cod_prenda,talla_key&limit=500`);
    pedidosCache.pedidosPorEscuela[escuelaId] = pedidos;
    renderDetallePedidos(escuelaId);
  } catch(e) {
    document.getElementById('pedidos-detalle-tabla').innerHTML = 
      `<div style="color:red">Error: ${e.message}</div>`;
  }
}

function renderDetallePedidos(escuelaId) {
  const pedidos = pedidosCache.pedidosPorEscuela[escuelaId] || [];
  const cont = document.getElementById('pedidos-detalle-tabla');
  if (pedidos.length === 0) {
    cont.innerHTML = '<div class="text-muted">Sin pedidos.</div>';
    return;
  }
  
  // Agrupar por nivel + prenda
  const grupos = {};
  for (const p of pedidos) {
    const k = `${p.nivel}|${p.nombre_prenda || p.cod_prenda}`;
    if (!grupos[k]) grupos[k] = [];
    grupos[k].push(p);
  }
  
  cont.innerHTML = Object.entries(grupos).map(([k, lista]) => {
    const [nivel, prenda] = k.split('|');
    const total = lista.reduce((s, p) => s + p.cantidad_solicitada, 0);
    const entregado = lista.reduce((s, p) => s + (p.cantidad_entregada || 0), 0);
    
    return `
      <div style="margin-bottom:10px;border:1px solid var(--borde);border-radius:6px;overflow:hidden">
        <div style="background:#F5F7FA;padding:6px 10px;font-size:13px;font-weight:600">
          ${nivel} · ${prenda}
          <span style="float:right;font-weight:normal">${entregado}/${total}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#FAFAFA">
              <th style="padding:4px 8px;text-align:left">Talla</th>
              <th style="padding:4px 8px;text-align:right">Pedido</th>
              <th style="padding:4px 8px;text-align:right">Entregado</th>
              <th style="padding:4px 8px;text-align:center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map(p => `
              <tr style="border-top:1px solid #EEE">
                <td style="padding:4px 8px;font-family:monospace;font-weight:600">${p.talla_key}</td>
                <td style="padding:4px 8px;text-align:right">${p.cantidad_solicitada}</td>
                <td style="padding:4px 8px;text-align:right">
                  <input type="number" value="${p.cantidad_entregada || 0}" min="0" max="${p.cantidad_solicitada}"
                    style="width:60px;padding:2px 4px;text-align:right" id="ped-ent-${p.id}">
                </td>
                <td style="padding:4px 8px;text-align:center">
                  <button class="btn-mini btn-mini-success" onclick="guardarEntrega('${p.id}','${escuelaId}')">Guardar</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }).join('');
}

async function guardarEntrega(pedidoId, escuelaId) {
  const input = document.getElementById(`ped-ent-${pedidoId}`);
  const nuevaCantidad = parseInt(input.value || 0);
  if (isNaN(nuevaCantidad) || nuevaCantidad < 0) {
    alert('Cantidad inválida'); return;
  }
  
  try {
    await supaUpdate('pedido', pedidoId, {
      cantidad_entregada: nuevaCantidad,
      actualizado_en: new Date().toISOString()
    });
    // Mostrar visual feedback
    input.style.background = '#D4EDDA';
    setTimeout(() => { input.style.background = ''; }, 1000);
    // Refrescar resumen de temporada y lista
    await cargarEscuelasTemporada();
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

function cerrarDetalleEscuela() {
  document.getElementById('pedidos-detalle-modal').style.display = 'none';
}

// ─── Nueva escuela ad-hoc (Doña Victoria tipo cliente) ─────────────
function abrirNuevaEscuela() {
  const modal = document.getElementById('pedidos-escuela-modal');
  if (!modal) return;
  document.getElementById('nesc-nombre').value = '';
  document.getElementById('nesc-codigo').value = '';
  document.getElementById('nesc-director').value = '';
  document.getElementById('nesc-telefono').value = '';
  modal.style.display = 'flex';
}

function cerrarNuevaEscuela() {
  document.getElementById('pedidos-escuela-modal').style.display = 'none';
}

async function guardarNuevaEscuela() {
  const nombre = document.getElementById('nesc-nombre').value.trim();
  const codigo = document.getElementById('nesc-codigo').value.trim() || ('ADHOC-' + Date.now().toString(36));
  const director = document.getElementById('nesc-director').value.trim() || null;
  const telefono = document.getElementById('nesc-telefono').value.trim() || null;
  
  if (!nombre) { alert('Falta el nombre'); return; }
  
  try {
    await supaFetch('escuela', 'POST', {
      codigo_cde: codigo,
      nombre,
      director,
      telefono,
      activa: true,
    });
    alert('Escuela agregada. Ahora podés agregarle pedidos desde el detalle.');
    cerrarNuevaEscuela();
    await cargarEscuelasTemporada();
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

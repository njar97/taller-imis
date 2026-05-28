// ══════════════════════════════════════════════════════════════════════
// DASHBOARD GENERAL (v25)
// Home con resumen global de la temporada activa
// ══════════════════════════════════════════════════════════════════════

let dashboardCache = {
  temporadaActiva: null,
  resumen: {},
  cargando: false,
};

async function initDashboard() {
  if (dashboardCache.cargando) return;
  dashboardCache.cargando = true;
  
  const cont = document.getElementById('dashboard-contenido');
  if (!cont) { dashboardCache.cargando = false; return; }
  
  // Inicio = dashboard "Hoy" únicamente. Por-escuela e histórico viven ahora en Estadística.
  cont.innerHTML = `
    <div id="dashboard-sub-contenido">
      <div class="text-muted" style="padding:20px;text-align:center">Cargando dashboard...</div>
    </div>
  `;

  await cargarDashboardHoy();
  dashboardCache.cargando = false;
}

async function cargarDashboardHoy() {
  const sub = document.getElementById('dashboard-sub-contenido');
  if (!sub) return;
  sub.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando...</div>';

  try {
    // Para pronóstico: SALIDA_EMPAQUE de los últimos 14 días por escuela
    const desde14 = new Date(Date.now() - 14*24*60*60*1000).toISOString().slice(0,10);
    // Promise.allSettled (no Promise.all): si una query falla, las otras
    // siguen — el dashboard se renderiza con KPIs parciales en vez de
    // bloquearse. Cada KPI obtiene su valor o [] como fallback.
    const tareas = [
      ['temporadas',  () => supaFetch('vw_temporada_resumen', 'GET', null, '?order=anio.desc&limit=5')],
      ['topEscuelas', () => supaFetch('vw_pedido_escuela', 'GET', null, '?order=piezas_pendientes.desc&limit=5')],
      ['stockResumen', () => supaFetch('vw_bodega_stock', 'GET', null, '?order=stock_actual.desc&limit=10')],
      ['produccionHoy', () => cargarProduccionHoy()],
      ['alumnos', () => cachedFetch('dashboard-alumnos',
        () => supaFetchAll('alumno', '?activo=eq.true&select=escuela_id,estado_top,estado_bottom,talla_top_key,talla_bottom_key'),
        { ttl: 60_000, group: 'alumnos' })],
      ['escuelas', () => cachedFetch('dashboard-escuelas',
        () => supaFetchAll('escuela', '?activa=eq.true&select=id,alias,nombre,codigo_cde&order=alias'),
        { ttl: 300_000, group: 'escuelas' })],
      ['pool', () => cachedFetch('dashboard-pool',
        () => supaFetchAll('escuela_acaparado', '?select=escuela_id,cantidad_acaparada,cantidad_consumida'),
        { ttl: 30_000, group: 'pool' })],
      ['empaquesRec', () => supaFetchAll('bodega_movimiento',
        `?tipo=eq.SALIDA_EMPAQUE&fecha=gte.${desde14}&select=escuela_id,cantidad,fecha`)],
    ];
    const results = await Promise.allSettled(tareas.map(([, fn]) => fn()));
    const data = {};
    const fallidos = [];
    tareas.forEach(([key], i) => {
      const r = results[i];
      if (r.status === 'fulfilled') {
        data[key] = r.value;
      } else {
        data[key] = key === 'produccionHoy' ? { bultos: 0, piezas: 0 } : [];
        fallidos.push(key);
        console.warn('[dashboard]', key, 'falló:', r.reason && r.reason.message || r.reason);
      }
    });

    dashboardCache.resumen = data;
    dashboardCache.fallidos = fallidos;  // para que renderDashboard pueda mostrar warning
    renderDashboard();
  } catch(e) {
    sub.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

async function cargarProduccionHoy() {
  const hoy = new Date().toISOString().split('T')[0];
  try {
    const bultos = await supaFetch('produccion_bulto', 'GET', null, 
      `?fecha_terminado=eq.${hoy}&estado=eq.terminado&limit=500`);
    const total = bultos.reduce((s,b) => s + (b.cantidad_final || 0), 0);
    return { bultos: bultos.length, piezas: total };
  } catch(e) {
    return { bultos: 0, piezas: 0 };
  }
}

function renderDashboard() {
  const cont = document.getElementById('dashboard-sub-contenido');
  if (!cont) return;
  
  const r = dashboardCache.resumen;
  const tempActiva = (r.temporadas || []).find(t => t.estado === 'activa') || r.temporadas?.[0];
  
  // Alumnos stats
  const alumnos = r.alumnos || [];
  const totalAlumnos = alumnos.length;
  const completos = alumnos.filter(a => a.estado_top === 'empacado' && a.estado_bottom === 'empacado').length;
  const parciales = alumnos.filter(a => 
    (a.estado_top === 'empacado' && a.estado_bottom !== 'empacado') ||
    (a.estado_bottom === 'empacado' && a.estado_top !== 'empacado')
  ).length;
  const pendientes = totalAlumnos - completos - parciales;
  const entregados = alumnos.filter(a => a.estado_top === 'entregado' && a.estado_bottom === 'entregado').length;
  
  // Stock
  const stock = r.stockResumen || [];
  const stockTotal = stock.reduce((s,x) => s + (x.stock_actual || 0), 0);
  const stockReservado = stock.reduce((s,x) => s + (x.reservado_empaque || 0), 0);
  
  cont.innerHTML = `
    <!-- Fila 1: Temporada activa -->
    ${tempActiva ? `
      <div class="card" style="padding:14px;margin-bottom:10px;background:linear-gradient(135deg,#0065CC,#004999);color:white">
        <div style="font-size:11px;opacity:0.8">TEMPORADA ACTIVA</div>
        <div style="font-size:22px;font-weight:700;margin-top:4px">${tempActiva.nombre}</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:13px">
          <div><strong>${tempActiva.num_escuelas || 0}</strong> escuelas</div>
          <div><strong>${(tempActiva.piezas_solicitadas||0).toLocaleString()}</strong> piezas contratadas</div>
          <div><strong>${tempActiva.porcentaje_avance || 0}%</strong> avance</div>
        </div>
        <div style="background:rgba(255,255,255,0.2);height:8px;border-radius:4px;margin-top:8px;overflow:hidden">
          <div style="background:white;height:100%;width:${tempActiva.porcentaje_avance || 0}%"></div>
        </div>
      </div>
    ` : '<div class="alert alert-info">No hay temporadas. Cargá una primero.</div>'}
    
    <!-- Fila 2: 4 KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:10px">
      <div class="card" style="padding:12px;text-align:center">
        <div style="font-size:11px;color:#666">Producido hoy</div>
        <div style="font-size:24px;font-weight:700;color:var(--azul);margin-top:4px">${(r.produccionHoy?.piezas || 0).toLocaleString()}</div>
        <div style="font-size:10px;color:#888">${r.produccionHoy?.bultos || 0} bulto(s)</div>
      </div>
      <div class="card" style="padding:12px;text-align:center">
        <div style="font-size:11px;color:#666">Stock en bodega</div>
        <div style="font-size:24px;font-weight:700;color:var(--verde);margin-top:4px">${stockTotal.toLocaleString()}</div>
        <div style="font-size:10px;color:#888">${stockReservado} reservadas</div>
      </div>
      <div class="card" style="padding:12px;text-align:center">
        <div style="font-size:11px;color:#666">Alumnos cargados</div>
        <div style="font-size:24px;font-weight:700;color:#333;margin-top:4px">${totalAlumnos.toLocaleString()}</div>
        <div style="font-size:10px;color:#888">${entregados} entregados</div>
      </div>
      <div class="card" style="padding:12px;text-align:center">
        <div style="font-size:11px;color:#666">Empaque</div>
        <div style="font-size:24px;font-weight:700;color:var(--naranja);margin-top:4px">${completos}</div>
        <div style="font-size:10px;color:#888">+${parciales} parciales</div>
      </div>
    </div>
    
    <!-- Fila 3: top escuelas pendientes -->
    ${r.topEscuelas && r.topEscuelas.length > 0 ? `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">
        <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">⚠ Top escuelas con pendientes</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#FAFAFA">
              <th style="padding:6px 8px;text-align:left">Escuela</th>
              <th style="padding:6px 8px;text-align:right">Pendiente</th>
              <th style="padding:6px 8px;text-align:right">Avance</th>
            </tr>
          </thead>
          <tbody>
            ${r.topEscuelas.slice(0,5).map(e => `
              <tr style="border-top:1px solid #EEE;cursor:pointer" onclick="switchTab('registro'); setTimeout(() => abrirDetalleEscuelaRegistro('${e.escuela_id}'), 500)">
                <td style="padding:6px 8px">
                  <div style="font-weight:600">${e.escuela_nombre}</div>
                  <div style="font-size:10px;color:#888">CDE ${e.codigo_cde}</div>
                </td>
                <td style="padding:6px 8px;text-align:right;color:var(--naranja);font-weight:600">${(e.piezas_pendientes||0).toLocaleString()}</td>
                <td style="padding:6px 8px;text-align:right">${e.porcentaje_avance || 0}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}
    
    <!-- Avance por escuela (embudo completo + accesos directos) -->
    ${_renderAvancePorEscuela(r)}

    <!-- Fila 4: stock top -->
    ${stock.length > 0 ? `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">
        <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">📦 Stock disponible (top 10)</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#FAFAFA">
              <th style="padding:6px 8px;text-align:left">Prenda</th>
              <th style="padding:6px 8px;text-align:left">Talla</th>
              <th style="padding:6px 8px;text-align:right">Stock</th>
              <th style="padding:6px 8px;text-align:right">Reservado</th>
            </tr>
          </thead>
          <tbody>
            ${stock.slice(0,10).map(s => `
              <tr style="border-top:1px solid #EEE">
                <td style="padding:4px 8px">${s.nombre_prenda || s.cod_prenda}</td>
                <td style="padding:4px 8px;font-family:monospace;font-weight:600">${s.talla_key}</td>
                <td style="padding:4px 8px;text-align:right;color:var(--azul);font-weight:700">${s.stock_actual || 0}</td>
                <td style="padding:4px 8px;text-align:right;color:#888">${s.reservado_empaque || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}
    
    <!-- Accesos rápidos -->
    <div class="card" style="padding:14px">
      <div style="font-weight:600;margin-bottom:10px">⚡ Accesos rápidos</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">
        <button class="btn btn-ghost" onclick="switchTab('registro')" style="padding:10px">📋 Registro</button>
        <button class="btn btn-ghost" onclick="switchTab('produccion')" style="padding:10px">🏭 Producción</button>
        <button class="btn btn-ghost" onclick="switchTab('bodega')" style="padding:10px">📦 Bodega</button>
        <button class="btn btn-ghost" onclick="irA('trazo')" style="padding:10px">✂ Nuevo trazo</button>
      </div>
    </div>
    
    <div style="text-align:center;margin-top:10px">
      <button class="btn btn-ghost btn-sm" onclick="initDashboard()">🔄 Refrescar</button>
    </div>
  `;
}

// ─── Avance por escuela (embudo + atajos) ─────────────────────────────
// Computa por escuela: pendientes / acaparados (pool disp) / empacados /
// entregados, % avance y dibuja una card por cada una. Default colapsado
// para no saturar el dashboard; expandible.
let _avanceEscColapsado = true;
function toggleAvanceEsc() {
  _avanceEscColapsado = !_avanceEscColapsado;
  renderDashboard();
}

function _renderAvancePorEscuela(r) {
  const alumnos = r.alumnos || [];
  const escuelas = r.escuelas || [];
  const pool = r.pool || [];
  if (alumnos.length === 0 || escuelas.length === 0) return '';

  // Computar por escuela
  const byEsc = {};
  for (const e of escuelas) {
    byEsc[e.id] = {
      escuela: e, total: 0,
      pendientes: 0, empacados: 0, entregados: 0, sinTallar: 0,
      acaparados: 0,
    };
  }
  for (const a of alumnos) {
    const o = byEsc[a.escuela_id];
    if (!o) continue;
    // total = alumnos del esc
    o.total++;
    // Por pieza top
    const evaluar = (talla, estado) => {
      if (!talla) { o.sinTallar++; return; }
      if (estado === 'entregado') o.entregados++;
      else if (estado === 'empacado') o.empacados++;
      else o.pendientes++;
    };
    evaluar(a.talla_top_key, a.estado_top);
    evaluar(a.talla_bottom_key, a.estado_bottom);
  }
  for (const p of pool) {
    const o = byEsc[p.escuela_id];
    if (!o) continue;
    o.acaparados += Math.max(0, (Number(p.cantidad_acaparada)||0) - (Number(p.cantidad_consumida)||0));
  }
  // Velocidad por escuela: piezas empacadas en últimos 14 días / 14
  const empaquesRec = r.empaquesRec || [];
  const piezasPorEsc = {};
  for (const m of empaquesRec) {
    if (!m.escuela_id) continue;
    piezasPorEsc[m.escuela_id] = (piezasPorEsc[m.escuela_id] || 0) + (Number(m.cantidad) || 0);
  }
  const VENTANA_DIAS = 14;
  for (const o of Object.values(byEsc)) {
    const piezas = piezasPorEsc[o.escuela.id] || 0;
    o.velocidad = piezas / VENTANA_DIAS;  // piezas/día
  }
  // Filtrar escuelas sin alumnos
  let lista = Object.values(byEsc).filter(o => o.total > 0);
  // % avance = entregados / piezas posibles (total * 2)
  for (const o of lista) {
    const piezas = o.total * 2;
    o.pct = piezas > 0 ? Math.round(100 * o.entregados / piezas) : 0;
    o.pctEmpaque = piezas > 0 ? Math.round(100 * (o.empacados + o.entregados) / piezas) : 0;
  }
  // Orden: % avance asc (más atrasadas primero)
  lista.sort((a,b) => a.pct - b.pct || b.pendientes - a.pendientes);

  if (lista.length === 0) return '';
  const totalEsc = lista.length;
  const colapsado = _avanceEscColapsado;
  const mostrar = colapsado ? lista.slice(0, 5) : lista;

  const cards = mostrar.map(o => {
    const e = o.escuela;
    const alias = e.alias || e.nombre || '';
    const cde = e.codigo_cde ? `CDE ${e.codigo_cde}` : '';
    const barraColor = o.pct >= 100 ? 'var(--verde)' : (o.pct > 50 ? 'var(--azul)' : (o.pct > 0 ? 'var(--naranja)' : '#ccc'));
    // Pronóstico de fecha de entrega
    let pronostico = '';
    if (o.pendientes > 0 && o.velocidad > 0) {
      const dias = Math.ceil(o.pendientes / o.velocidad);
      const fecha = new Date(Date.now() + dias*24*60*60*1000);
      const fechaLbl = fecha.toLocaleDateString('es-SV', { day:'2-digit', month:'short', year:'numeric' });
      const tasaLbl = o.velocidad.toFixed(1);
      pronostico = `<div style="font-size:11px;color:#26a;margin-top:4px"
        title="A ritmo de ${tasaLbl} pieza(s)/día (promedio últimos 14 días)">
        📅 Estimado: <strong>${fechaLbl}</strong> · ${dias} día(s) (${tasaLbl}/día)
      </div>`;
    } else if (o.pendientes > 0) {
      pronostico = `<div style="font-size:11px;color:#888;margin-top:4px"
        title="Sin actividad de empaque en los últimos 14 días — no se puede estimar">
        📅 Estimado: sin actividad reciente
      </div>`;
    }
    return `
      <div class="card" style="padding:10px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:13px">🏫 ${alias}</div>
            <div style="font-size:10px;color:#888">${cde} · ${o.total} alumnos</div>
          </div>
          <div style="font-size:18px;font-weight:700;color:${barraColor};white-space:nowrap">${o.pct}%</div>
        </div>
        <!-- Embudo (numbers) -->
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;font-size:11px">
          <span style="background:#FFF4E6;color:#a85;padding:2px 6px;border-radius:4px"><strong>${o.pendientes}</strong> pend</span>
          ${o.acaparados > 0 ? `<span style="background:#FFF9E6;color:#a82;padding:2px 6px;border-radius:4px"><strong>${o.acaparados}</strong> acap</span>` : ''}
          <span style="background:#E0F4E5;color:#2a6;padding:2px 6px;border-radius:4px"><strong>${o.empacados}</strong> emp</span>
          <span style="background:#E8F0FA;color:#26a;padding:2px 6px;border-radius:4px"><strong>${o.entregados}</strong> entr</span>
          ${o.sinTallar > 0 ? `<span style="background:#FFEEEE;color:#c44;padding:2px 6px;border-radius:4px"><strong>${o.sinTallar}</strong> sin tallar</span>` : ''}
        </div>
        <!-- Barra de avance -->
        <div style="background:#EEE;height:6px;border-radius:3px;margin-top:6px;overflow:hidden">
          <div style="background:${barraColor};height:100%;width:${o.pct}%"></div>
        </div>
        ${pronostico}
        <!-- Atajos -->
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px">
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('registro','${e.id}')" style="font-size:11px;padding:4px 8px">📋 Registro</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('acaparar','${e.id}')" style="font-size:11px;padding:4px 8px">📥 Acaparar</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('empacar','${e.id}')" style="font-size:11px;padding:4px 8px">📦 Empacar</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('entrega','${e.id}')" style="font-size:11px;padding:4px 8px">🚚 Entrega</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('lista','${e.id}')" style="font-size:11px;padding:4px 8px" title="Descargar PDF de la lista de empaque">🖨 Lista</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('resumen','${e.id}')" style="font-size:11px;padding:4px 8px" title="Descargar resumen ejecutivo PDF (2 hojas)">📑 Resumen</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('bolsa','${e.id}')" style="font-size:11px;padding:4px 8px" title="Etiquetas grandes para bolsa (2 por hoja)">🏷 Bolsa</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">
      <div style="background:#F5F7FA;padding:8px 12px;font-weight:600;display:flex;justify-content:space-between;align-items:center">
        <span>🏫 Avance por escuela ${colapsado && totalEsc > 5 ? `(top ${mostrar.length} de ${totalEsc})` : `(${totalEsc})`}</span>
        ${totalEsc > 5 ? `
          <button class="btn btn-ghost btn-sm" onclick="toggleAvanceEsc()" style="font-size:11px">
            ${colapsado ? `Ver todas (${totalEsc}) ▼` : 'Colapsar ▲'}
          </button>
        ` : ''}
      </div>
      <div style="padding:8px">${cards}</div>
    </div>
  `;
}

// Atajos: cambia de tab y prefila el filtro de escuela según la acción
function _avanceEscIrA(accion, escId) {
  if (accion === 'registro') {
    if (typeof alumnosGlobalCache !== 'undefined') {
      alumnosGlobalCache.filtroEscuelas = [escId];
      alumnosGlobalCache.busqueda = '';
      alumnosGlobalCache.filtroEstado = '';
    }
    if (typeof switchTab === 'function') switchTab('registro');
    setTimeout(() => {
      if (typeof alumnosGlobalCache !== 'undefined' && alumnosGlobalCache.cargado
          && typeof renderAlumnosGlobal === 'function') renderAlumnosGlobal();
      else if (typeof initAlumnosGlobal === 'function') initAlumnosGlobal();
    }, 50);
    return;
  }
  if (accion === 'acaparar') {
    if (typeof switchTab === 'function') switchTab('bodega');
    setTimeout(() => {
      if (typeof abrirAcapararModal === 'function') {
        abrirAcapararModal();
        setTimeout(() => {
          const sel = document.getElementById('aca-escuela');
          if (sel) { sel.value = escId; if (typeof onAcapararTallaCambio === 'function') onAcapararTallaCambio(); }
        }, 400);
      }
    }, 100);
    return;
  }
  if (accion === 'empacar') {
    if (typeof switchTab === 'function') switchTab('bodega');
    setTimeout(() => {
      if (typeof abrirEmpacarSelector === 'function') {
        abrirEmpacarSelector();
        setTimeout(() => {
          const sel = document.getElementById('emp-sel-escuela');
          if (sel) { sel.value = escId; if (typeof renderEmpSelCombos === 'function') renderEmpSelCombos(); }
        }, 400);
      }
    }, 100);
    return;
  }
  if (accion === 'lista') {
    if (typeof descargarListaEmpaquePDF === 'function') {
      descargarListaEmpaquePDF(escId);
    } else {
      alert('Función no disponible. Recargá la página.');
    }
    return;
  }
  if (accion === 'resumen') {
    if (typeof descargarResumenEjecutivoPDF === 'function') {
      descargarResumenEjecutivoPDF(escId);
    } else {
      alert('Función no disponible. Recargá la página.');
    }
    return;
  }
  if (accion === 'bolsa') {
    if (typeof descargarEtiquetasBolsaPDF === 'function') {
      descargarEtiquetasBolsaPDF(escId);
    } else {
      alert('Función no disponible. Recargá la página.');
    }
    return;
  }
  if (accion === 'entrega') {
    if (typeof switchTab === 'function') switchTab('bodega');
    setTimeout(() => {
      if (typeof abrirEntregaModal === 'function') {
        abrirEntregaModal();
        setTimeout(() => {
          const sel = document.getElementById('ent-escuela');
          if (sel) { sel.value = escId; if (typeof onEntregaEscuelaCambio === 'function') onEntregaEscuelaCambio(); }
        }, 400);
      }
    }, 100);
    return;
  }
}

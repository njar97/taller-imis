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
  
  // Renderizar sub-tabs primero
  cont.innerHTML = `
    <div class="sub-tabs" style="margin-bottom:10px">
      <div class="sub-tab active" onclick="cambiarVistaDashboard('hoy', this)">📊 Hoy</div>
      <div class="sub-tab" onclick="cambiarVistaDashboard('historico', this)">📈 Histórico</div>
    </div>
    <div id="dashboard-sub-contenido">
      <div class="text-muted" style="padding:20px;text-align:center">Cargando dashboard...</div>
    </div>
  `;
  
  await cargarDashboardHoy();
  dashboardCache.cargando = false;
}

function cambiarVistaDashboard(vista, el) {
  document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  if (vista === 'hoy') cargarDashboardHoy();
  else if (vista === 'historico') {
    const sub = document.getElementById('dashboard-sub-contenido');
    if (sub) sub.innerHTML = '<div id="historico-contenido"><div class="text-muted" style="padding:20px;text-align:center">Cargando datos históricos...</div></div>';
    if (typeof initHistorico === 'function') initHistorico();
  }
}

async function cargarDashboardHoy() {
  const sub = document.getElementById('dashboard-sub-contenido');
  if (!sub) return;
  sub.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando...</div>';
  
  try {
    const [
      temporadasResumen,
      topEscuelas,
      stockResumen,
      produccionHoy,
      alumnosResumen,
    ] = await Promise.all([
      supaFetch('vw_temporada_resumen', 'GET', null, '?order=anio.desc&limit=5').catch(() => []),
      supaFetch('vw_pedido_escuela', 'GET', null, '?order=piezas_pendientes.desc&limit=5').catch(() => []),
      supaFetch('vw_bodega_stock', 'GET', null, '?order=stock_actual.desc&limit=10').catch(() => []),
      cargarProduccionHoy(),
      supaFetch('alumno', 'GET', null, '?activo=eq.true&select=estado_top,estado_bottom&limit=20000').catch(() => []),
    ]);
    
    dashboardCache.resumen = {
      temporadas: temporadasResumen,
      topEscuelas,
      stockResumen,
      produccionHoy,
      alumnos: alumnosResumen,
    };
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

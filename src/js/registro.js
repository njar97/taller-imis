// ══════════════════════════════════════════════════════════════════════
// REGISTRO (v23) - reemplaza "Pedidos"
// Módulo central: alumnos, tallaje, empaque, por talla
// ══════════════════════════════════════════════════════════════════════

let registroCache = {
  temporadas: [],
  escuelas: [],
  temporadaActual: null,
  escuelaActual: null,
  vistaDetalle: 'tallaje', // tallaje | alumnos | por_talla | empaque
  pedidosPorEscuela: {},
  alumnos: [],
  stockPorTalla: {},
  gradosConocidos: [],
  // Tallaje actual
  tallajeEscuelaId: null,
  tallajeGrado: null,
};

// Mantener variable "pedidosCache" para compatibilidad con código viejo
let pedidosCache = registroCache; // alias

async function initRegistro() {
  try {
    const [temps, grados] = await Promise.all([
      supaFetch('vw_temporada_resumen', 'GET', null, '?order=anio.desc&limit=20'),
      supaFetch('vw_grados_conocidos', 'GET', null, '?limit=200').catch(() => [])
    ]);
    registroCache.temporadas = temps;
    registroCache.gradosConocidos = grados;
    
    const activa = temps.find(t => t.estado === 'activa') || temps[0];
    if (activa) registroCache.temporadaActual = activa.id;
    
    renderRegistroHeader();
    
    if (registroCache.temporadaActual) {
      await cargarEscuelasTemporada();
    } else {
      document.getElementById('registro-lista').innerHTML = 
        '<div class="alert alert-info">No hay temporadas cargadas. Corré la migración v3.11 y la carga inicial.</div>';
    }
  } catch(e) {
    document.getElementById('registro-lista').innerHTML = 
      `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

// alias para compat
const initPedidos = initRegistro;

function renderRegistroHeader() {
  const cont = document.getElementById('registro-header');
  if (!cont) return;
  if (registroCache.temporadas.length === 0) {
    cont.innerHTML = '<div class="text-muted">Sin temporadas.</div>';
    return;
  }
  
  const opts = registroCache.temporadas.map(t => 
    `<option value="${t.id}" ${t.id === registroCache.temporadaActual ? 'selected' : ''}>${t.codigo} — ${t.estado}</option>`
  ).join('');
  
  const actual = registroCache.temporadas.find(t => t.id === registroCache.temporadaActual);
  const resumen = actual ? `
    <div style="margin-top:8px;display:flex;gap:12px;flex-wrap:wrap;font-size:13px">
      <div><strong>${actual.num_escuelas}</strong> escuelas</div>
      <div><strong>${actual.piezas_solicitadas?.toLocaleString() || 0}</strong> piezas contratadas</div>
      <div style="color:var(--verde)"><strong>${actual.piezas_entregadas?.toLocaleString() || 0}</strong> entregadas</div>
      <div><strong>${actual.porcentaje_avance||0}%</strong> avance</div>
    </div>` : '';
  
  cont.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <label style="font-size:11px;color:#666;display:block">Temporada</label>
        <select onchange="cambiarTemporadaRegistro(this.value)" style="padding:6px 10px;border-radius:6px;border:1px solid var(--borde)">${opts}</select>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="abrirModalExport()">💾 Exportar</button>
        <button class="btn btn-primary btn-sm" onclick="abrirNuevaEscuela()">+ Escuela ad-hoc</button>
      </div>
    </div>
    ${resumen}
  `;
}

async function cambiarTemporadaRegistro(tempId) {
  registroCache.temporadaActual = tempId;
  renderRegistroHeader();
  await cargarEscuelasTemporada();
}
const cambiarTemporada = cambiarTemporadaRegistro; // alias

async function cargarEscuelasTemporada() {
  const cont = document.getElementById('registro-lista');
  cont.innerHTML = '<div class="text-muted">Cargando escuelas...</div>';
  try {
    // Obtener escuelas con pedidos O con alumnos en esta temporada
    const [conPedidos, todasEscuelas] = await Promise.all([
      supaFetch('vw_pedido_escuela', 'GET', null, 
        `?temporada_id=eq.${registroCache.temporadaActual}&order=piezas_solicitadas.desc&limit=200`).catch(() => []),
      supaFetch('escuela', 'GET', null, '?activa=eq.true&order=nombre&limit=500').catch(() => [])
    ]);
    
    // Contar alumnos por escuela en esta temporada
    const alumnosCount = await supaFetch('alumno', 'GET', null, 
      `?temporada_id=eq.${registroCache.temporadaActual}&activo=eq.true&select=escuela_id&limit=20000`).catch(() => []);
    const alumnosPorEscuela = {};
    for (const a of alumnosCount) {
      alumnosPorEscuela[a.escuela_id] = (alumnosPorEscuela[a.escuela_id] || 0) + 1;
    }
    
    // Enriquecer
    const escuelasMap = {};
    for (const e of todasEscuelas) {
      escuelasMap[e.id] = {
        escuela_id: e.id,
        escuela_nombre: e.nombre,
        codigo_cde: e.codigo_cde,
        grupo_produccion: e.grupo_produccion,
        piezas_solicitadas: 0,
        piezas_entregadas: 0,
        piezas_pendientes: 0,
        porcentaje_avance: 0,
        lineas_pedido: 0,
        num_alumnos: alumnosPorEscuela[e.id] || 0,
      };
    }
    for (const p of conPedidos) {
      if (escuelasMap[p.escuela_id]) {
        Object.assign(escuelasMap[p.escuela_id], {
          piezas_solicitadas: p.piezas_solicitadas,
          piezas_entregadas: p.piezas_entregadas,
          piezas_pendientes: p.piezas_pendientes,
          porcentaje_avance: p.porcentaje_avance,
          lineas_pedido: p.lineas_pedido,
        });
      }
    }
    
    // Solo escuelas que tienen pedidos O alumnos en esta temporada
    registroCache.escuelas = Object.values(escuelasMap).filter(e => 
      e.piezas_solicitadas > 0 || e.num_alumnos > 0
    );
    renderListaEscuelas();
  } catch(e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function renderListaEscuelas() {
  const cont = document.getElementById('registro-lista');
  if (!cont) return;
  
  if (registroCache.escuelas.length === 0) {
    cont.innerHTML = '<div class="alert alert-info">No hay escuelas con datos en esta temporada.</div>';
    return;
  }
  
  // Ordenar por piezas_solicitadas desc, luego por alumnos
  const ordenadas = [...registroCache.escuelas].sort((a,b) => 
    (b.piezas_solicitadas||0) - (a.piezas_solicitadas||0) || (b.num_alumnos||0) - (a.num_alumnos||0)
  );
  
  cont.innerHTML = ordenadas.map(e => {
    const pct = e.porcentaje_avance || 0;
    const colorBar = pct >= 100 ? 'var(--verde)' : (pct > 0 ? 'var(--azul)' : '#CCC');
    const grupo = e.grupo_produccion ? `<span style="background:#EEF;padding:2px 6px;border-radius:4px;font-size:10px;color:#66F;margin-left:4px">${e.grupo_produccion}</span>` : '';
    return `
      <div class="card" style="padding:10px;margin-bottom:8px;cursor:pointer" onclick="abrirDetalleEscuelaRegistro('${e.escuela_id}')">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div style="flex:1">
            <div style="font-weight:700;color:var(--azul)">${e.escuela_nombre}${grupo}</div>
            <div style="font-size:11px;color:#666">CDE ${e.codigo_cde}</div>
            <div style="font-size:13px;margin-top:4px">
              ${e.num_alumnos > 0 ? `<strong>${e.num_alumnos}</strong> alumnos · ` : ''}
              ${e.piezas_solicitadas > 0 ? `<strong>${(e.piezas_entregadas||0).toLocaleString()}/${e.piezas_solicitadas.toLocaleString()}</strong> piezas` : '<em style="color:#888">Sin pedidos</em>'}
            </div>
          </div>
          ${e.piezas_solicitadas > 0 ? `<div style="font-size:20px;font-weight:700;color:${colorBar}">${pct}%</div>` : ''}
        </div>
        ${e.piezas_solicitadas > 0 ? `
          <div style="background:#EEE;height:6px;border-radius:3px;margin-top:6px;overflow:hidden">
            <div style="background:${colorBar};height:100%;width:${pct}%"></div>
          </div>` : ''}
      </div>
    `;
  }).join('');
}

// ─── Detalle de escuela con 4 sub-tabs ──────────────────────────────
async function abrirDetalleEscuelaRegistro(escuelaId) {
  const modal = document.getElementById('registro-detalle-modal');
  if (!modal) return;
  
  const esc = registroCache.escuelas.find(e => e.escuela_id === escuelaId);
  if (!esc) return;
  
  registroCache.escuelaActual = escuelaId;
  registroCache.vistaDetalle = 'tallaje';
  
  document.getElementById('registro-detalle-titulo').textContent = esc.escuela_nombre;
  const grupo = esc.grupo_produccion ? ` · Grupo ${esc.grupo_produccion}` : '';
  document.getElementById('registro-detalle-subt').textContent = 
    `CDE ${esc.codigo_cde}${grupo} · ${esc.num_alumnos||0} alumnos · ${esc.piezas_entregadas||0}/${esc.piezas_solicitadas||0} piezas`;
  
  document.getElementById('registro-detalle-subtabs').innerHTML = `
    <div class="sub-tabs">
      <div class="sub-tab active" onclick="cambiarVistaDetalle('tallaje', this)">📏 Tallaje</div>
      <div class="sub-tab" onclick="cambiarVistaDetalle('alumnos', this)">👥 Alumnos</div>
      <div class="sub-tab" onclick="cambiarVistaDetalle('por_talla', this)">📊 Por talla</div>
      <div class="sub-tab" onclick="cambiarVistaDetalle('empaque', this)">📦 Empaque</div>
    </div>
  `;
  
  modal.style.display = 'flex';
  await mostrarVistaDetalle('tallaje');
}
// alias
const abrirDetalleEscuela = abrirDetalleEscuelaRegistro;

function cambiarVistaDetalle(vista, el) {
  document.querySelectorAll('#registro-detalle-subtabs .sub-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  registroCache.vistaDetalle = vista;
  mostrarVistaDetalle(vista);
}

async function mostrarVistaDetalle(vista) {
  const cont = document.getElementById('registro-detalle-tabla');
  cont.innerHTML = '<div class="text-muted">Cargando...</div>';
  const escuelaId = registroCache.escuelaActual;
  
  if (vista === 'tallaje') {
    renderTallajeInicial(escuelaId);
  } else if (vista === 'alumnos') {
    await mostrarAlumnos(escuelaId);
  } else if (vista === 'por_talla') {
    await cargarPedidosEscuela(escuelaId);
  } else if (vista === 'empaque') {
    await cargarVistaEmpaque(escuelaId);
  }
}

function cerrarDetalleEscuela() {
  document.getElementById('registro-detalle-modal').style.display = 'none';
}

// ─── Sub-tab: Por Talla ─────────────────────────────────────────────
async function cargarPedidosEscuela(escuelaId) {
  document.getElementById('registro-detalle-tabla').innerHTML = '<div class="text-muted">Cargando pedidos...</div>';
  try {
    const pedidos = await supaFetch('pedido', 'GET', null, 
      `?escuela_id=eq.${escuelaId}&order=nivel,cod_prenda,talla_key&limit=500`);
    registroCache.pedidosPorEscuela[escuelaId] = pedidos;
    renderDetallePedidos(escuelaId);
  } catch(e) {
    document.getElementById('registro-detalle-tabla').innerHTML = 
      `<div style="color:red">Error: ${e.message}</div>`;
  }
}

function renderDetallePedidos(escuelaId) {
  const pedidos = registroCache.pedidosPorEscuela[escuelaId] || [];
  const cont = document.getElementById('registro-detalle-tabla');
  if (pedidos.length === 0) {
    cont.innerHTML = '<div class="text-muted">Sin pedidos cargados para esta escuela. Agregá alumnos o cargá el contrato.</div>';
    return;
  }
  
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
  if (isNaN(nuevaCantidad) || nuevaCantidad < 0) { alert('Cantidad inválida'); return; }
  try {
    await supaUpdate('pedido', pedidoId, {
      cantidad_entregada: nuevaCantidad,
      actualizado_en: new Date().toISOString()
    });
    input.style.background = '#D4EDDA';
    setTimeout(() => { input.style.background = ''; }, 1000);
    await cargarEscuelasTemporada();
  } catch(e) { alert('Error: ' + e.message); }
}

// ─── Sub-tab: Empaque (resumen por escuela) ─────────────────────────
async function cargarVistaEmpaque(escuelaId) {
  const cont = document.getElementById('registro-detalle-tabla');
  try {
    const resumen = await supaFetch('vw_alumno_escuela', 'GET', null, 
      `?escuela_id=eq.${escuelaId}&temporada_id=eq.${registroCache.temporadaActual}&order=nivel,grado&limit=200`);
    
    if (!resumen || resumen.length === 0) {
      cont.innerHTML = '<div class="alert alert-info">No hay alumnos cargados. Usá la sub-tab 📏 Tallaje para empezar.</div>';
      return;
    }
    
    const tot = resumen.reduce((a,r) => a + (r.total_alumnos||0), 0);
    const completos = resumen.reduce((a,r) => a + (r.completos||0), 0);
    const entregados = resumen.reduce((a,r) => a + (r.entregados||0), 0);
    const pct = tot > 0 ? Math.round(100 * completos / tot) : 0;
    
    cont.innerHTML = `
      <div class="card" style="padding:10px;margin-bottom:10px">
        <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px">
          <div>Total alumnos: <strong>${tot}</strong></div>
          <div style="color:var(--verde)">Completos: <strong>${completos}</strong></div>
          <div style="color:var(--azul)">Entregados: <strong>${entregados}</strong></div>
          <div><strong>${pct}%</strong> empacado</div>
        </div>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">Por grado</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#FAFAFA">
              <th style="padding:6px 8px;text-align:left">Grado</th>
              <th style="padding:6px 8px;text-align:right">Total</th>
              <th style="padding:6px 8px;text-align:right">Top ✓</th>
              <th style="padding:6px 8px;text-align:right">Bottom ✓</th>
              <th style="padding:6px 8px;text-align:right">Completos</th>
              <th style="padding:6px 8px;text-align:right">Entregados</th>
            </tr>
          </thead>
          <tbody>
            ${resumen.map(r => `
              <tr style="border-top:1px solid #EEE">
                <td style="padding:4px 8px;font-weight:600">${r.grado || '-'}</td>
                <td style="padding:4px 8px;text-align:right">${r.total_alumnos}</td>
                <td style="padding:4px 8px;text-align:right">${r.top_empacados}</td>
                <td style="padding:4px 8px;text-align:right">${r.bottom_empacados}</td>
                <td style="padding:4px 8px;text-align:right;color:var(--verde);font-weight:600">${r.completos}</td>
                <td style="padding:4px 8px;text-align:right;color:var(--azul);font-weight:600">${r.entregados}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:10px;text-align:center">
        <button class="btn btn-primary" onclick="cambiarVistaDetalle('alumnos', null); document.querySelectorAll('#registro-detalle-subtabs .sub-tab')[1].classList.add('active'); document.querySelectorAll('#registro-detalle-subtabs .sub-tab')[3].classList.remove('active')">→ Empacar alumno por alumno</button>
      </div>
      
      <!-- Sugerencias de empaque automáticas -->
      <div class="card" style="padding:10px;margin-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-weight:600;font-size:13px">✨ Sugerencias automáticas</div>
          <button class="btn btn-ghost btn-sm" onclick="cargarSugerenciasEmpaque('${escuelaId}')">🔄 Recalcular</button>
        </div>
        <div id="sugerencias-empaque-area">
          <div class="text-muted" style="font-size:12px">Calculando alumnos empacables según stock actual...</div>
        </div>
      </div>
    `;
    // Auto-cargar sugerencias al abrir vista Empaque
    setTimeout(() => cargarSugerenciasEmpaque(escuelaId), 100);
  } catch(e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

// ─── Nueva escuela ad-hoc ───────────────────────────────────────────
function abrirNuevaEscuela() {
  const modal = document.getElementById('registro-escuela-modal');
  if (!modal) return;
  ['nesc-nombre','nesc-codigo','nesc-director','nesc-telefono','nesc-grupo'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  modal.style.display = 'flex';
}

function cerrarNuevaEscuela() {
  const modal = document.getElementById('registro-escuela-modal');
  if (modal) modal.style.display = 'none';
}

async function guardarNuevaEscuela() {
  const nombre = document.getElementById('nesc-nombre').value.trim();
  const codigo = document.getElementById('nesc-codigo').value.trim() || ('ADHOC-' + Date.now().toString(36));
  const director = document.getElementById('nesc-director').value.trim() || null;
  const telefono = document.getElementById('nesc-telefono').value.trim() || null;
  const grupo = document.getElementById('nesc-grupo').value.trim() || null;
  
  if (!nombre) { alert('Falta el nombre'); return; }
  
  try {
    await supaFetch('escuela', 'POST', {
      codigo_cde: codigo, nombre, director, telefono,
      grupo_produccion: grupo, activa: true,
    });
    alert('Escuela agregada. Podés cargar alumnos desde el Tallaje.');
    cerrarNuevaEscuela();
    await cargarEscuelasTemporada();
  } catch(e) { alert('Error: ' + e.message); }
}

// Toggle panel "Todos los alumnos" (v28)
function toggleAlumnosGlobal() {
  const panel = document.getElementById('alumnos-global-panel');
  const txt = document.getElementById('alumnos-global-toggle-txt');
  if (!panel) return;
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    if (txt) txt.textContent = 'Ocultar ▲';
    if (!alumnosGlobalCache.cargado) initAlumnosGlobal();
  } else {
    panel.style.display = 'none';
    if (txt) txt.textContent = 'Mostrar ▼';
  }
}

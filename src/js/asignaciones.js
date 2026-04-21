// ══════════════════════════════════════════════════════════════════════
// ASIGNACIONES (v20)
// Planificación: a qué operaria le toca qué operación sobre qué bultos
// ══════════════════════════════════════════════════════════════════════

let asignacionesCache = [];       // vw_asignacion_estado
let asignTabActual = 'activas';   // 'activas' | 'completadas' | 'canceladas'
let asignExpandidas = new Set();  // IDs de asignaciones expandidas

// ─── Init y navegación ────────────────────────────────────────────
async function initAsignaciones() {
  await cargarAsignaciones();
}

function cambiarTabAsignaciones(tab) {
  asignTabActual = tab;
  ['activas','completadas','canceladas'].forEach(t => {
    const btn = document.getElementById(`asig-tab-${t}`);
    if (btn) btn.className = (t === tab) ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
  });
  renderAsignaciones();
}

async function cargarAsignaciones() {
  try {
    document.getElementById('asig-lista-container').innerHTML = '<div class="text-muted">Cargando...</div>';
    asignacionesCache = await supaFetch('vw_asignacion_estado','GET',null,'?limit=500');
    renderAsignaciones();
  } catch(e) {
    document.getElementById('asig-lista-container').innerHTML = 
      `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function renderAsignaciones() {
  const cont = document.getElementById('asig-lista-container');
  if (!cont) return;

  // Mapear estados a tab
  const estadoMap = { 'activas':'activa', 'completadas':'completada', 'canceladas':'cancelada' };
  const estadoFiltro = estadoMap[asignTabActual];
  
  const filtradas = asignacionesCache.filter(a => a.estado === estadoFiltro);

  if (filtradas.length === 0) {
    const msg = asignTabActual === 'activas' 
      ? 'No hay asignaciones activas. Creá una con "+ Nueva".'
      : `No hay asignaciones ${asignTabActual}.`;
    cont.innerHTML = `<div class="alert alert-info">${msg}</div>`;
    return;
  }

  // Agrupar por operaria
  const porOperaria = {};
  filtradas.forEach(a => {
    if (!porOperaria[a.operaria_nombre]) porOperaria[a.operaria_nombre] = [];
    porOperaria[a.operaria_nombre].push(a);
  });

  const nombres = Object.keys(porOperaria).sort();
  cont.innerHTML = nombres.map(nom => {
    const lista = porOperaria[nom];
    return `
      <div class="card" style="padding:10px;margin-bottom:10px">
        <div style="font-weight:700;color:var(--azul);margin-bottom:8px">👷 ${nom}</div>
        ${lista.map(a => renderAsignacionCard(a)).join('')}
      </div>
    `;
  }).join('');
}

function renderAsignacionCard(a) {
  const pct = a.bultos_total > 0 ? Math.round(100 * a.bultos_hechos / a.bultos_total) : 0;
  const expandida = asignExpandidas.has(a.asignacion_id);
  const prendaNombre = (CATALOGO && CATALOGO[a.cod_prenda]?.nombre) || a.cod_prenda || '?';
  
  let botones = '';
  if (a.estado === 'activa') {
    if (a.bultos_hechos > 0 && a.bultos_hechos >= a.bultos_total) {
      botones += `<button class="btn-mini btn-mini-success" onclick="marcarCompletada('${a.asignacion_id}')">✓ Marcar completada</button>`;
    }
    botones += `<button class="btn-mini" onclick="capturarAsignacion('${a.asignacion_id}')">📝 Registrar avance</button>`;
    botones += `<button class="btn-mini btn-mini-danger" onclick="cancelarAsignacion('${a.asignacion_id}')">✖ Cancelar</button>`;
  } else if (a.estado === 'cancelada' || a.estado === 'completada') {
    botones += `<button class="btn-mini" onclick="reactivarAsignacion('${a.asignacion_id}')">↶ Reactivar</button>`;
  }

  return `
    <div style="border:1px solid var(--borde);border-radius:6px;padding:8px;margin-bottom:6px;background:#FAFAFA">
      <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="toggleAsignacion('${a.asignacion_id}')">
        <div style="flex:1">
          <div style="font-weight:600">${a.operacion_nombre}</div>
          <div style="font-size:11px;color:#666">${prendaNombre} · ${a.fecha_asignacion}</div>
          <div style="margin-top:4px">
            <strong>${a.bultos_hechos}/${a.bultos_total}</strong> bultos
            <div class="prod-progress" style="max-width:200px;margin-top:2px"><div class="prod-progress-bar" style="width:${pct}%"></div></div>
          </div>
          ${a.observaciones ? `<div style="font-size:11px;color:#856404;margin-top:4px">📝 ${a.observaciones}</div>` : ''}
        </div>
        <div style="font-size:18px;margin-left:8px">${expandida?'▼':'▶'}</div>
      </div>
      <div id="asig-detalle-${a.asignacion_id}" style="${expandida?'':'display:none'};margin-top:8px"></div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px">${botones}</div>
    </div>
  `;
}

async function toggleAsignacion(asignId) {
  if (asignExpandidas.has(asignId)) {
    asignExpandidas.delete(asignId);
    renderAsignaciones();
    return;
  }
  asignExpandidas.add(asignId);
  renderAsignaciones();
  // Cargar detalle de bultos
  const cont = document.getElementById(`asig-detalle-${asignId}`);
  if (!cont) return;
  cont.innerHTML = '<div class="text-muted" style="font-size:11px">Cargando bultos...</div>';
  try {
    const bultos = await supaFetch('vw_asignacion_bultos','GET',null,
      `?asignacion_id=eq.${asignId}&limit=200`);
    if (bultos.length === 0) {
      cont.innerHTML = '<div class="text-muted" style="font-size:11px">Sin bultos.</div>';
      return;
    }
    cont.innerHTML = bultos.map(b => {
      const hecho = !!b.registro_id;
      return `
        <div style="padding:4px 6px;border-bottom:1px solid #EEE;display:flex;justify-content:space-between;align-items:center;font-size:12px">
          <div>
            <span style="font-family:monospace;font-weight:600;color:var(--azul)">${b.codigo_bulto || '?'}</span>
            <span style="color:#666;margin-left:8px">${b.cantidad_original||'?'}pz</span>
          </div>
          <div>
            ${hecho 
              ? `<span style="color:#155724;font-size:11px">✓ ${b.fecha_hecho||''}</span>` 
              : `<span style="color:#999;font-size:11px">pendiente</span>`}
          </div>
        </div>
      `;
    }).join('');
  } catch(e) {
    cont.innerHTML = `<div style="color:#B00;font-size:11px">Error: ${e.message}</div>`;
  }
}

// ─── Nueva asignación ────────────────────────────────────────────
async function abrirNuevaAsignacion() {
  const modal = document.getElementById('asig-modal');
  if (!modal) return;
  
  // Asegurar que operarias y operaciones estén cargadas
  if (!operariasCache || operariasCache.length === 0) {
    operariasCache = await supaFetch('operaria','GET',null,'?order=nombre&limit=100');
  }
  if (!operacionesCache || Object.keys(operacionesCache).length === 0) {
    operacionesCache = {};
    const ops = await supaFetch('produccion_operacion','GET',null,'?activo=eq.true&order=cod_prenda,orden&limit=200');
    ops.forEach(o => {
      if (!operacionesCache[o.cod_prenda]) operacionesCache[o.cod_prenda] = [];
      operacionesCache[o.cod_prenda].push(o);
    });
  }
  if (!produccionData || produccionData.length === 0) {
    produccionData = await supaFetch('vw_produccion_estado','GET',null,'?limit=2000');
  }

  // Llenar selects
  const selOp = document.getElementById('asig-operaria');
  selOp.innerHTML = '<option value="">— Elegir operaria —</option>' +
    operariasCache.filter(o => o.activo).map(o => `<option value="${o.id}">${o.nombre}</option>`).join('');

  // Prendas disponibles
  const prendas = new Set();
  produccionData.forEach(b => { if (b.cod_prenda) prendas.add(b.cod_prenda); });
  const selPrenda = document.getElementById('asig-prenda');
  selPrenda.innerHTML = '<option value="">— Elegir prenda —</option>' +
    [...prendas].sort().map(p => `<option value="${p}">${(CATALOGO && CATALOGO[p]?.nombre) || p}</option>`).join('');

  // Cortes
  const cortes = new Map();
  produccionData.forEach(b => {
    if (b.estado_manual === 'terminado' || !b.produccion_bulto_id) return;
    const k = b.codigo_corte + '||' + (b.letra_corte||'');
    cortes.set(k, `${b.letra_corte||'?'} · ${b.codigo_corte}`);
  });
  const selCorte = document.getElementById('asig-corte');
  selCorte.innerHTML = '<option value="">— Todos —</option>' +
    [...cortes.entries()].sort((a,b)=>a[1].localeCompare(b[1])).map(([k,l]) => `<option value="${k}">Corte ${l}</option>`).join('');

  // Operaciones (vacío hasta que se elija prenda)
  document.getElementById('asig-operacion').innerHTML = '<option value="">— Elegí prenda primero —</option>';
  
  // Bultos lista
  document.getElementById('asig-bultos-lista').innerHTML = '<div class="text-muted" style="font-size:12px">Elegí operación primero...</div>';
  document.getElementById('asig-cuenta').textContent = '';
  
  // Fecha = hoy
  document.getElementById('asig-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('asig-observaciones').value = '';

  modal.style.display = 'flex';
}

function cerrarNuevaAsignacion() {
  const modal = document.getElementById('asig-modal');
  if (modal) modal.style.display = 'none';
}

function asigRefrescarOps() {
  const prenda = document.getElementById('asig-prenda').value;
  const sel = document.getElementById('asig-operacion');
  if (!prenda || !operacionesCache[prenda]) {
    sel.innerHTML = '<option value="">— Elegí prenda primero —</option>';
  } else {
    sel.innerHTML = '<option value="">— Elegir operación —</option>' +
      operacionesCache[prenda].map(o => `<option value="${o.id}">${o.orden}. ${o.nombre}</option>`).join('');
  }
  asigRefrescarBultos();
}

function asigRefrescarBultos() {
  const prenda = document.getElementById('asig-prenda').value;
  const corte = document.getElementById('asig-corte').value;
  const operacionId = document.getElementById('asig-operacion').value;
  const cont = document.getElementById('asig-bultos-lista');
  
  if (!prenda || !operacionId) {
    cont.innerHTML = '<div class="text-muted" style="font-size:12px">Elegí prenda y operación primero...</div>';
    document.getElementById('asig-cuenta').textContent = '';
    return;
  }

  let candidatos = produccionData.filter(b => 
    b.cod_prenda === prenda && 
    b.estado_manual !== 'terminado' && 
    b.produccion_bulto_id
  );
  if (corte) {
    candidatos = candidatos.filter(b => (b.codigo_corte + '||' + (b.letra_corte||'')) === corte);
  }

  if (candidatos.length === 0) {
    cont.innerHTML = '<div class="text-muted" style="font-size:12px">No hay bultos disponibles con esos filtros.</div>';
    document.getElementById('asig-cuenta').textContent = '';
    return;
  }

  cont.innerHTML = candidatos.map(b => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid #F0F0F0;cursor:pointer">
      <input type="checkbox" class="asig-check" data-bulto-id="${b.produccion_bulto_id}" onchange="asigActualizarCuenta()" checked>
      <div style="flex:1;font-size:12px">
        <div style="font-family:monospace;font-weight:700;color:var(--azul)">${b.codigo_bulto}</div>
        <div style="color:#666">${b.cantidad_original}pz · Corte ${b.letra_corte||'?'}</div>
      </div>
    </label>
  `).join('');
  asigActualizarCuenta();
}

function asigActualizarCuenta() {
  const marcados = document.querySelectorAll('.asig-check:checked');
  const el = document.getElementById('asig-cuenta');
  if (el) el.textContent = marcados.length > 0 ? `· ${marcados.length} seleccionados` : '';
}

function asigMarcarTodos(valor) {
  document.querySelectorAll('.asig-check').forEach(c => c.checked = valor);
  asigActualizarCuenta();
}

async function guardarAsignacion() {
  const operariaId = document.getElementById('asig-operaria').value;
  const operacionId = document.getElementById('asig-operacion').value;
  const fecha = document.getElementById('asig-fecha').value;
  const observaciones = document.getElementById('asig-observaciones').value.trim() || null;
  const bultosIds = Array.from(document.querySelectorAll('.asig-check:checked')).map(c => c.dataset.bultoId);

  if (!operariaId) { alert('Elegí una operaria'); return; }
  if (!operacionId) { alert('Elegí una operación'); return; }
  if (bultosIds.length === 0) { alert('Marcá al menos un bulto'); return; }

  try {
    // 1. Crear asignación
    const [nueva] = await supaFetch('asignacion','POST',{
      operaria_id: operariaId,
      operacion_id: operacionId,
      fecha_asignacion: fecha,
      estado: 'activa',
      observaciones,
    });
    // 2. Crear relaciones con bultos
    const relaciones = bultosIds.map(bid => ({
      asignacion_id: nueva.id,
      produccion_bulto_id: bid,
    }));
    await supaFetch('asignacion_bulto','POST',relaciones);

    cerrarNuevaAsignacion();
    alert(`✅ Asignación creada con ${bultosIds.length} bulto(s).`);
    await cargarAsignaciones();
    await cargarProduccion(); // refrescar dashboard también
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

// ─── Acciones sobre asignaciones ─────────────────────────────────
async function marcarCompletada(asignId) {
  if (!confirm('¿Marcar esta asignación como completada?')) return;
  try {
    await supaUpdate('asignacion', asignId, { 
      estado: 'completada', 
      actualizado_en: new Date().toISOString() 
    });
    await cargarAsignaciones();
  } catch(e) { alert('Error: ' + e.message); }
}

async function cancelarAsignacion(asignId) {
  if (!confirm('¿Cancelar esta asignación?\n\nLos registros de trabajo ya hecho se conservan.')) return;
  try {
    await supaUpdate('asignacion', asignId, { 
      estado: 'cancelada', 
      actualizado_en: new Date().toISOString() 
    });
    await cargarAsignaciones();
  } catch(e) { alert('Error: ' + e.message); }
}

async function reactivarAsignacion(asignId) {
  if (!confirm('¿Reactivar esta asignación?')) return;
  try {
    await supaUpdate('asignacion', asignId, { 
      estado: 'activa', 
      actualizado_en: new Date().toISOString() 
    });
    await cargarAsignaciones();
  } catch(e) { alert('Error: ' + e.message); }
}

// Atajo: ir a captura filtrando por esta asignación
async function capturarAsignacion(asignId) {
  // Cambiar a sub-pestaña de captura
  switchSubProd('captura');
  // Cargar el asignacionId en un contexto que captura pueda leer
  window._asignacionCapturaContexto = asignId;
  setTimeout(() => cargarCapturaConAsignacion(asignId), 300);
}

async function cargarCapturaConAsignacion(asignId) {
  // Buscar la asignación
  const a = asignacionesCache.find(x => x.asignacion_id === asignId);
  if (!a) return;
  
  // Ir al modo lote y pre-llenar
  cambiarModoCap('lote');
  const selOp = document.getElementById('lote-operaria');
  if (selOp) selOp.value = a.operaria_id;
  
  // Cargar bultos de la asignación y marcarlos
  try {
    const bultos = await supaFetch('vw_asignacion_bultos','GET',null,
      `?asignacion_id=eq.${asignId}&limit=200`);
    // Esperar que el selector de operación esté listo
    setTimeout(() => {
      const selPrenda = document.getElementById('lote-prenda');
      if (selPrenda && bultos[0]?.cod_prenda) {
        selPrenda.value = bultos[0].cod_prenda;
        if (typeof llenarOperacionesLote === 'function') llenarOperacionesLote();
      }
      setTimeout(() => {
        const selOperacion = document.getElementById('lote-operacion');
        if (selOperacion) selOperacion.value = a.operacion_id;
        if (typeof refrescarBultosLote === 'function') refrescarBultosLote();
        // Después de que la lista se renderice, marcar solo los bultos de esta asignación
        setTimeout(() => {
          const idsAsignacion = new Set(bultos.filter(b => !b.registro_id).map(b => b.produccion_bulto_id));
          document.querySelectorAll('.lote-check').forEach(c => {
            c.checked = idsAsignacion.has(c.dataset.bultoId);
          });
          if (typeof actualizarCuentaLote === 'function') actualizarCuentaLote();
        }, 300);
      }, 200);
    }, 200);
  } catch(e) { console.warn('cargarCapturaConAsignacion:', e.message); }
}

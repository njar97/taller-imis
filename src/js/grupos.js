// ══════════════════════════════════════════════════════════════════════
// GRUPOS DE TRABAJO (v31)
// Sub-tab dentro de 🏭 Prod. Gestión de grupos + operarias + contribuciones.
// ══════════════════════════════════════════════════════════════════════

let gruposCache = {
  grupos: [],
  operarias: [],
  tareas: [],
  grupoSeleccionado: null,
  vista: 'grupos', // 'grupos' | 'tareas' | 'productividad'
};

async function initGrupos() {
  const cont = document.getElementById('grupos-contenido');
  if (!cont) return;
  cont.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando grupos...</div>';
  
  try {
    const [grupos, operarias] = await Promise.all([
      supaFetch('vw_grupo_con_operarias', 'GET', null, '?activo=eq.true&order=codigo&limit=100').catch(() => []),
      supaFetch('operaria', 'GET', null, '?activo=eq.true&order=nombre&limit=100').catch(() => []),
    ]);
    
    gruposCache.grupos = grupos;
    gruposCache.operarias = operarias;
    renderGruposHeader();
    renderVistaGrupos();
  } catch(e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function renderGruposHeader() {
  const cont = document.getElementById('grupos-tabs');
  if (!cont) return;
  cont.innerHTML = `
    <div class="sub-tabs">
      <div class="sub-tab ${gruposCache.vista==='grupos'?'active':''}" onclick="cambiarVistaGrupos('grupos')">👥 Grupos</div>
      <div class="sub-tab ${gruposCache.vista==='tareas'?'active':''}" onclick="cambiarVistaGrupos('tareas')">📝 Tareas activas</div>
      <div class="sub-tab ${gruposCache.vista==='productividad'?'active':''}" onclick="cambiarVistaGrupos('productividad')">📊 Productividad</div>
    </div>
  `;
}

function cambiarVistaGrupos(v) {
  gruposCache.vista = v;
  renderGruposHeader();
  if (v === 'grupos') renderVistaGrupos();
  else if (v === 'tareas') cargarVistaTareas();
  else if (v === 'productividad') cargarVistaProductividad();
}

function renderVistaGrupos() {
  const cont = document.getElementById('grupos-contenido');
  if (!cont) return;
  
  const grupos = gruposCache.grupos;
  
  cont.innerHTML = `
    <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="abrirNuevoGrupo('permanente')">+ Grupo permanente</button>
      <button class="btn btn-ghost btn-sm" onclick="abrirNuevoGrupo('adhoc')">+ Grupo ad-hoc</button>
      <button class="btn btn-ghost btn-sm" onclick="initGrupos()">🔄</button>
    </div>
    
    ${grupos.length === 0 ? `
      <div class="alert alert-info">
        No hay grupos aún. Creá el primero con los botones de arriba.<br>
        <strong>Permanentes:</strong> equipos fijos (Costura, Acabado).<br>
        <strong>Ad-hoc:</strong> para una tarea específica (se desarma después).
      </div>
    ` : grupos.map(g => {
      const tipoColor = g.tipo === 'permanente' ? 'var(--azul)' : '#f80';
      const tipoLabel = g.tipo === 'permanente' ? '🔒 Permanente' : '⚡ Ad-hoc';
      return `
        <div class="card" style="padding:12px;margin-bottom:8px;border-left:4px solid ${tipoColor}">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px">
            <div style="flex:1">
              <div style="font-weight:700;font-size:15px">${g.codigo} · ${g.nombre}</div>
              <div style="font-size:10px;color:${tipoColor};font-weight:600">${tipoLabel}</div>
            </div>
            <div style="display:flex;gap:4px">
              <button class="btn-mini" onclick="abrirMiembros('${g.grupo_id}')">👥 Miembros</button>
              <button class="btn-mini" onclick="abrirEditarGrupo('${g.grupo_id}')">✏</button>
              <button class="btn-mini btn-mini-danger" onclick="archivarGrupo('${g.grupo_id}', '${g.nombre}')">✗</button>
            </div>
          </div>
          <div style="font-size:12px;color:#666">
            <strong>${g.num_operarias || 0}</strong> operaria(s): 
            <span style="color:#333">${g.operarias_nombres || '(sin miembros)'}</span>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

// ─── Nuevo grupo ───────────────────────────────────────────────────
function abrirNuevoGrupo(tipo) {
  const modal = document.getElementById('grupo-modal');
  if (!modal) return;
  document.getElementById('grp-id').value = '';
  document.getElementById('grp-codigo').value = '';
  document.getElementById('grp-nombre').value = '';
  document.getElementById('grp-tipo').value = tipo;
  document.getElementById('grp-tipo-label').textContent = tipo === 'permanente' ? '🔒 Grupo permanente' : '⚡ Grupo ad-hoc';
  document.getElementById('grp-modal-title').textContent = '+ Nuevo grupo';
  modal.style.display = 'flex';
}

async function abrirEditarGrupo(grupoId) {
  try {
    const res = await supaFetch('grupo_trabajo', 'GET', null, `?id=eq.${grupoId}&limit=1`);
    if (!res || res.length === 0) return;
    const g = res[0];
    document.getElementById('grp-id').value = g.id;
    document.getElementById('grp-codigo').value = g.codigo;
    document.getElementById('grp-nombre').value = g.nombre;
    document.getElementById('grp-tipo').value = g.tipo;
    document.getElementById('grp-tipo-label').textContent = g.tipo === 'permanente' ? '🔒 Grupo permanente' : '⚡ Grupo ad-hoc';
    document.getElementById('grp-modal-title').textContent = '✏ Editar grupo';
    document.getElementById('grupo-modal').style.display = 'flex';
  } catch(e) { alert('Error: ' + e.message); }
}

function cerrarGrupoModal() {
  document.getElementById('grupo-modal').style.display = 'none';
}

async function guardarGrupo() {
  const id = document.getElementById('grp-id').value;
  const codigo = document.getElementById('grp-codigo').value.trim();
  const nombre = document.getElementById('grp-nombre').value.trim();
  const tipo = document.getElementById('grp-tipo').value;
  
  if (!codigo || !nombre) { alert('Código y nombre son obligatorios'); return; }
  
  try {
    if (id) {
      await supaUpdate('grupo_trabajo', id, { codigo, nombre, tipo });
    } else {
      await supaFetch('grupo_trabajo', 'POST', { codigo, nombre, tipo, activo: true });
    }
    cerrarGrupoModal();
    await initGrupos();
  } catch(e) { alert('Error: ' + e.message); }
}

async function archivarGrupo(grupoId, nombre) {
  if (!confirm(`¿Archivar el grupo "${nombre}"?\n\nNo se borra, solo se oculta. Las tareas pasadas quedan intactas.`)) return;
  try {
    await supaUpdate('grupo_trabajo', grupoId, { activo: false });
    await initGrupos();
  } catch(e) { alert('Error: ' + e.message); }
}

// ─── Miembros del grupo ────────────────────────────────────────────
async function abrirMiembros(grupoId) {
  const modal = document.getElementById('miembros-modal');
  if (!modal) return;
  gruposCache.grupoSeleccionado = grupoId;
  
  const g = gruposCache.grupos.find(x => x.grupo_id === grupoId);
  document.getElementById('miembros-titulo').textContent = g ? `${g.codigo} · ${g.nombre}` : '';
  
  try {
    const [miembros, todasOperarias] = await Promise.all([
      supaFetch('grupo_operaria', 'GET', null, `?grupo_id=eq.${grupoId}&activo=eq.true&limit=100`),
      supaFetch('operaria', 'GET', null, '?activo=eq.true&order=nombre&limit=100'),
    ]);
    
    const miembrosIds = new Set(miembros.map(m => m.operaria_id));
    
    document.getElementById('miembros-body').innerHTML = `
      <div style="font-size:11px;color:#666;margin-bottom:8px">
        Marcá quién está en este grupo. Una operaria puede estar en varios grupos.
      </div>
      <div style="max-height:400px;overflow:auto">
        ${todasOperarias.map(o => `
          <label style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid #EEE;cursor:pointer">
            <input type="checkbox" value="${o.id}" ${miembrosIds.has(o.id)?'checked':''} onchange="toggleMiembro('${grupoId}','${o.id}',this.checked)">
            <span style="font-weight:600">${o.nombre}</span>
          </label>
        `).join('')}
      </div>
    `;
    modal.style.display = 'flex';
  } catch(e) { alert('Error: ' + e.message); }
}

function cerrarMiembros() {
  document.getElementById('miembros-modal').style.display = 'none';
  initGrupos();
}

async function toggleMiembro(grupoId, operariaId, checked) {
  try {
    if (checked) {
      await supaFetch('grupo_operaria', 'POST', {
        grupo_id: grupoId, operaria_id: operariaId, activo: true
      });
    } else {
      // Buscar la membresía activa y desactivarla
      const res = await supaFetch('grupo_operaria', 'GET', null, 
        `?grupo_id=eq.${grupoId}&operaria_id=eq.${operariaId}&activo=eq.true&limit=1`);
      if (res && res.length > 0) {
        await supaUpdate('grupo_operaria', res[0].id, { activo: false, hasta: new Date().toISOString().split('T')[0] });
      }
    }
  } catch(e) { alert('Error: ' + e.message); }
}

// ─── Vista: Tareas activas ─────────────────────────────────────────
async function cargarVistaTareas() {
  const cont = document.getElementById('grupos-contenido');
  cont.innerHTML = '<div class="text-muted" style="padding:10px">Cargando tareas...</div>';
  
  try {
    const tareas = await supaFetch('grupo_produccion', 'GET', null, '?order=fecha_asignada.desc&limit=100');
    renderVistaTareas(tareas);
  } catch(e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function renderVistaTareas(tareas) {
  const cont = document.getElementById('grupos-contenido');
  
  const enCurso = tareas.filter(t => t.estado === 'en_curso');
  const terminadas = tareas.filter(t => t.estado === 'terminada').slice(0, 20);
  
  // Indexar grupos por id
  const gMap = {};
  for (const g of gruposCache.grupos) gMap[g.grupo_id] = g;
  
  cont.innerHTML = `
    <div style="margin-bottom:10px">
      <button class="btn btn-primary btn-sm" onclick="abrirNuevaTarea()">+ Asignar tarea a grupo</button>
    </div>
    
    ${enCurso.length > 0 ? `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">
        <div style="background:#E6F0FF;padding:8px 12px;font-weight:600">📝 En curso (${enCurso.length})</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#F5F7FA">
              <th style="padding:6px 8px;text-align:left">Grupo</th>
              <th style="padding:6px 8px;text-align:right">Asignado</th>
              <th style="padding:6px 8px;text-align:right">Terminado</th>
              <th style="padding:6px 8px;text-align:center">Avance</th>
              <th style="padding:6px 8px;text-align:right">Asignado</th>
              <th style="padding:6px 8px;text-align:center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${enCurso.map(t => {
              const g = gMap[t.grupo_id];
              const pct = t.cantidad_asignada > 0 ? Math.round(100 * t.cantidad_terminada / t.cantidad_asignada) : 0;
              return `
                <tr style="border-top:1px solid #EEE">
                  <td style="padding:6px 8px"><strong>${g ? g.codigo : '-'}</strong> ${g ? g.nombre : ''}</td>
                  <td style="padding:6px 8px;text-align:right">${t.cantidad_asignada}</td>
                  <td style="padding:6px 8px;text-align:right">${t.cantidad_terminada}</td>
                  <td style="padding:6px 8px;text-align:center">
                    <div style="background:#EEE;height:6px;border-radius:3px;position:relative;width:80px;margin:auto">
                      <div style="background:var(--azul);height:100%;width:${pct}%;border-radius:3px"></div>
                    </div>
                    <div style="font-size:10px;margin-top:1px">${pct}%</div>
                  </td>
                  <td style="padding:6px 8px;text-align:right;font-size:11px;color:#666">${t.fecha_asignada}</td>
                  <td style="padding:6px 8px;text-align:center">
                    <button class="btn-mini btn-mini-success" onclick="registrarAvanceTarea('${t.id}')">📝 Avance</button>
                    <button class="btn-mini" onclick="verContribuciones('${t.id}')">👥</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : '<div class="alert alert-info">No hay tareas en curso. Asigná una con el botón de arriba.</div>'}
    
    ${terminadas.length > 0 ? `
      <div class="card" style="padding:0;overflow:hidden">
        <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">✓ Últimas terminadas</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <tbody>
            ${terminadas.map(t => {
              const g = gMap[t.grupo_id];
              return `
                <tr style="border-top:1px solid #EEE">
                  <td style="padding:4px 8px">${g ? g.codigo : '-'} · ${g ? g.nombre : ''}</td>
                  <td style="padding:4px 8px;text-align:right">${t.cantidad_terminada} piezas</td>
                  <td style="padding:4px 8px;font-size:11px;color:#666">${t.fecha_cerrada || t.fecha_asignada}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}
  `;
}

// ─── Nueva tarea para grupo ─────────────────────────────────────────
function abrirNuevaTarea() {
  const modal = document.getElementById('tarea-modal');
  if (!modal) return;
  
  const selG = document.getElementById('tarea-grupo');
  selG.innerHTML = gruposCache.grupos.map(g => 
    `<option value="${g.grupo_id}">${g.codigo} · ${g.nombre}</option>`
  ).join('');
  
  document.getElementById('tarea-cantidad').value = '';
  document.getElementById('tarea-obs').value = '';
  modal.style.display = 'flex';
}

function cerrarTareaModal() {
  document.getElementById('tarea-modal').style.display = 'none';
}

async function guardarTarea() {
  const grupoId = document.getElementById('tarea-grupo').value;
  const cantidad = parseInt(document.getElementById('tarea-cantidad').value);
  const obs = document.getElementById('tarea-obs').value.trim() || null;
  
  if (!grupoId || !cantidad || cantidad <= 0) {
    alert('Elegí grupo y cantidad > 0'); return;
  }
  
  try {
    await supaFetch('grupo_produccion', 'POST', {
      grupo_id: grupoId, cantidad_asignada: cantidad, cantidad_terminada: 0,
      estado: 'en_curso', observaciones: obs,
    });
    cerrarTareaModal();
    cargarVistaTareas();
  } catch(e) { alert('Error: ' + e.message); }
}

// ─── Registrar avance ──────────────────────────────────────────────
async function registrarAvanceTarea(tareaId) {
  try {
    // Buscar tarea y sus miembros del grupo
    const res = await supaFetch('grupo_produccion', 'GET', null, `?id=eq.${tareaId}&limit=1`);
    if (!res || res.length === 0) return;
    const tarea = res[0];
    
    const miembros = await supaFetch('grupo_operaria', 'GET', null, 
      `?grupo_id=eq.${tarea.grupo_id}&activo=eq.true&limit=50`);
    
    const operariasMap = {};
    for (const o of gruposCache.operarias) operariasMap[o.id] = o;
    
    const modal = document.getElementById('avance-modal');
    document.getElementById('avance-tarea-id').value = tareaId;
    document.getElementById('avance-titulo').textContent = `Avance · Tarea ${tareaId.slice(0,6)}`;
    document.getElementById('avance-progreso').textContent = 
      `${tarea.cantidad_terminada}/${tarea.cantidad_asignada} piezas`;
    
    const bodyHtml = `
      <div style="background:#FFF4D6;padding:8px;border-radius:4px;font-size:11px;margin-bottom:10px">
        Registrá cuánto hizo cada operaria (opcional). Si dejás "0" en todas y solo ponés el total abajo, se registra sólo como grupo.
      </div>
      
      ${miembros.length === 0 ? `
        <div class="alert alert-info" style="font-size:12px">Este grupo no tiene miembros asignados. Podés registrar solo el total abajo.</div>
      ` : `
        <div style="margin-bottom:10px">
          ${miembros.map(m => {
            const op = operariasMap[m.operaria_id];
            return `
              <div style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid #EEE">
                <div style="flex:1;font-weight:600;font-size:13px">${op ? op.nombre : '(op)'}</div>
                <input type="number" min="0" value="0" data-operaria="${m.operaria_id}" class="avance-input"
                  style="width:60px;padding:3px 6px;text-align:right">
                <span style="font-size:11px;color:#888">piezas</span>
              </div>
            `;
          }).join('')}
        </div>
      `}
      
      <div class="field">
        <label>Total de esta entrada (requerido)</label>
        <input type="number" id="avance-total" min="1" placeholder="Cantidad que se produjo ahora">
        <div style="font-size:11px;color:#888;margin-top:2px">Este número se suma al cantidad_terminada</div>
      </div>
      
      <div class="field">
        <label>Observaciones (opcional)</label>
        <input type="text" id="avance-obs">
      </div>
    `;
    document.getElementById('avance-body').innerHTML = bodyHtml;
    modal.style.display = 'flex';
  } catch(e) { alert('Error: ' + e.message); }
}

function cerrarAvance() {
  document.getElementById('avance-modal').style.display = 'none';
}

async function guardarAvance() {
  const tareaId = document.getElementById('avance-tarea-id').value;
  const totalInput = document.getElementById('avance-total');
  const total = parseInt(totalInput.value);
  const obs = document.getElementById('avance-obs').value.trim() || null;
  
  if (!total || total <= 0) { alert('El total es requerido y debe ser > 0'); return; }
  
  try {
    // 1. Leer tarea actual
    const res = await supaFetch('grupo_produccion', 'GET', null, `?id=eq.${tareaId}&limit=1`);
    if (!res || res.length === 0) return;
    const tarea = res[0];
    const nuevoTotal = (tarea.cantidad_terminada || 0) + total;
    const finalizada = nuevoTotal >= tarea.cantidad_asignada;
    
    // 2. Guardar contribuciones individuales
    const inputs = document.querySelectorAll('.avance-input');
    for (const inp of inputs) {
      const cant = parseInt(inp.value || 0);
      if (cant > 0) {
        await supaFetch('grupo_contribucion', 'POST', {
          grupo_produccion_id: tareaId,
          operaria_id: inp.dataset.operaria,
          cantidad: cant,
          observaciones: obs,
        });
      }
    }
    
    // 3. Actualizar tarea
    const patch = { cantidad_terminada: nuevoTotal };
    if (finalizada) {
      patch.estado = 'terminada';
      patch.fecha_cerrada = new Date().toISOString().split('T')[0];
    }
    await supaUpdate('grupo_produccion', tareaId, patch);
    
    cerrarAvance();
    cargarVistaTareas();
  } catch(e) { alert('Error: ' + e.message); }
}

// ─── Ver contribuciones ────────────────────────────────────────────
async function verContribuciones(tareaId) {
  try {
    const contrib = await supaFetch('grupo_contribucion', 'GET', null, 
      `?grupo_produccion_id=eq.${tareaId}&order=fecha.desc&limit=100`);
    
    const opMap = {};
    for (const o of gruposCache.operarias) opMap[o.id] = o;
    
    const porOperaria = {};
    for (const c of contrib) {
      if (!porOperaria[c.operaria_id]) porOperaria[c.operaria_id] = 0;
      porOperaria[c.operaria_id] += c.cantidad;
    }
    
    let msg = 'Contribuciones por operaria:\n\n';
    if (Object.keys(porOperaria).length === 0) {
      msg += '(Sin contribuciones individuales registradas)';
    } else {
      for (const [opId, cant] of Object.entries(porOperaria)) {
        const op = opMap[opId];
        msg += `  ${op ? op.nombre : opId.slice(0,6)}: ${cant} piezas\n`;
      }
    }
    alert(msg);
  } catch(e) { alert('Error: ' + e.message); }
}

// ─── Vista: Productividad ──────────────────────────────────────────
async function cargarVistaProductividad() {
  const cont = document.getElementById('grupos-contenido');
  cont.innerHTML = '<div class="text-muted" style="padding:10px">Cargando productividad...</div>';
  
  try {
    const [porOperaria, porGrupo] = await Promise.all([
      supaFetch('vw_operaria_productividad', 'GET', null, '?order=total_piezas.desc&limit=50'),
      supaFetch('vw_grupo_productividad', 'GET', null, '?order=total_piezas_terminadas.desc&limit=50'),
    ]);
    
    cont.innerHTML = `
      <div class="alert alert-info" style="font-size:12px;margin-bottom:10px">
        ℹ Esta vista muestra las piezas producidas desde que arrancó el sistema. 
        Útil para comparar productividad entre operarias o grupos (base para destajo).
      </div>
      
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">
        <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">👤 Por operaria</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#FAFAFA">
              <th style="padding:6px 8px;text-align:left">Operaria</th>
              <th style="padding:6px 8px;text-align:right">Tareas</th>
              <th style="padding:6px 8px;text-align:right">Piezas</th>
              <th style="padding:6px 8px;text-align:right">Última fecha</th>
            </tr>
          </thead>
          <tbody>
            ${porOperaria.map(o => `
              <tr style="border-top:1px solid #EEE">
                <td style="padding:6px 8px;font-weight:600">${o.nombre}</td>
                <td style="padding:6px 8px;text-align:right">${o.tareas_participadas || 0}</td>
                <td style="padding:6px 8px;text-align:right;color:var(--azul);font-weight:700">${(o.total_piezas||0).toLocaleString()}</td>
                <td style="padding:6px 8px;text-align:right;font-size:11px;color:#666">${o.ultima_fecha || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <div class="card" style="padding:0;overflow:hidden">
        <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">👥 Por grupo</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#FAFAFA">
              <th style="padding:6px 8px;text-align:left">Grupo</th>
              <th style="padding:6px 8px;text-align:right">Total tareas</th>
              <th style="padding:6px 8px;text-align:right">Terminadas</th>
              <th style="padding:6px 8px;text-align:right">Piezas totales</th>
            </tr>
          </thead>
          <tbody>
            ${porGrupo.map(g => `
              <tr style="border-top:1px solid #EEE">
                <td style="padding:6px 8px"><strong>${g.codigo}</strong> ${g.nombre}</td>
                <td style="padding:6px 8px;text-align:right">${g.tareas_totales || 0}</td>
                <td style="padding:6px 8px;text-align:right;color:var(--verde)">${g.tareas_terminadas || 0}</td>
                <td style="padding:6px 8px;text-align:right;color:var(--azul);font-weight:700">${(g.total_piezas_terminadas||0).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch(e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

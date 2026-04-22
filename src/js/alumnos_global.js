// ══════════════════════════════════════════════════════════════════════
// ALUMNOS GLOBAL + ETIQUETAS (v28)
// Vista con búsqueda/filtros + imprimir etiquetas en filas de 1cm
// ══════════════════════════════════════════════════════════════════════

let alumnosGlobalCache = {
  alumnos: [],
  escuelas: {},
  busqueda: '',
  filtroEscuela: '',
  filtroNivel: '',
  filtroTemporada: '',
  filtroEstado: '',   // 'pendiente'|'parcial'|'completo'|'entregado'|'sin_tallas'
  cargado: false,
};

async function initAlumnosGlobal() {
  const cont = document.getElementById('alumnos-global-contenido');
  if (!cont) return;
  cont.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando alumnos...</div>';
  
  try {
    const [escuelas, alumnos] = await Promise.all([
      supaFetch('escuela', 'GET', null, '?limit=500'),
      // traer TODOS incluso los sin tallas
      supaFetch('alumno', 'GET', null, '?activo=eq.true&order=nombre&limit=10000'),
    ]);
    
    const escMap = {};
    for (const e of escuelas) escMap[e.id] = e;
    alumnosGlobalCache.escuelas = escMap;
    alumnosGlobalCache.alumnos = alumnos;
    alumnosGlobalCache.cargado = true;
    
    // Asegurar que tenemos la lista de temporadas
    if (!registroCache.temporadas || registroCache.temporadas.length === 0) {
      try {
        registroCache.temporadas = await supaFetch('vw_temporada_resumen', 'GET', null, '?order=anio.desc&limit=20');
      } catch(e) { registroCache.temporadas = []; }
    }
    
    renderAlumnosGlobal();
  } catch(e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function alumnoSinTallas(a) {
  return !a.talla_top_key && !a.talla_bottom_key;
}

function renderAlumnosGlobal() {
  const cont = document.getElementById('alumnos-global-contenido');
  if (!cont) return;
  
  const c = alumnosGlobalCache;
  let lista = c.alumnos;
  
  // Filtros
  if (c.busqueda) {
    const q = c.busqueda.toLowerCase().trim();
    lista = lista.filter(a => (a.nombre||'').toLowerCase().includes(q));
  }
  if (c.filtroEscuela) lista = lista.filter(a => a.escuela_id === c.filtroEscuela);
  if (c.filtroNivel) lista = lista.filter(a => a.nivel === c.filtroNivel);
  if (c.filtroTemporada) lista = lista.filter(a => a.temporada_id === c.filtroTemporada);
  if (c.filtroEstado) {
    lista = lista.filter(a => {
      if (c.filtroEstado === 'sin_tallas') return alumnoSinTallas(a);
      const t = a.estado_top, b = a.estado_bottom;
      if (c.filtroEstado === 'pendiente') return t==='pendiente' && b==='pendiente' && !alumnoSinTallas(a);
      if (c.filtroEstado === 'parcial') 
        return (t==='empacado' && b!=='empacado') || (b==='empacado' && t!=='empacado');
      if (c.filtroEstado === 'completo') return t==='empacado' && b==='empacado';
      if (c.filtroEstado === 'entregado') return t==='entregado' && b==='entregado';
      return true;
    });
  }
  
  // Opciones
  const escuelasUnicas = {};
  for (const a of c.alumnos) {
    if (a.escuela_id && c.escuelas[a.escuela_id]) {
      escuelasUnicas[a.escuela_id] = c.escuelas[a.escuela_id];
    }
  }
  const escuelasOpts = Object.values(escuelasUnicas).sort((a,b) => a.nombre.localeCompare(b.nombre));
  const temporadasOpts = registroCache.temporadas || [];
  
  // Stats
  const totMostrando = lista.length;
  const tot = c.alumnos.length;
  const sinTallas = c.alumnos.filter(alumnoSinTallas).length;
  const completos = c.alumnos.filter(a => a.estado_top==='empacado' && a.estado_bottom==='empacado').length;
  
  const header = `
    <div class="card" style="padding:12px;margin-bottom:10px">
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;margin-bottom:10px">
        <div>Total: <strong>${tot.toLocaleString()}</strong></div>
        <div style="color:#c44">Sin tallas: <strong>${sinTallas}</strong></div>
        <div style="color:var(--verde)">Completos: <strong>${completos}</strong></div>
        <div style="color:#888">Mostrando: <strong>${totMostrando.toLocaleString()}</strong></div>
      </div>
      
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px">
        <input type="text" placeholder="🔍 Buscar nombre..." value="${c.busqueda}"
          oninput="alumnosGlobalCache.busqueda = this.value; renderAlumnosGlobal()"
          style="padding:6px 10px;border:1px solid var(--borde);border-radius:4px">
        
        <select onchange="alumnosGlobalCache.filtroEscuela = this.value; renderAlumnosGlobal()" style="padding:6px">
          <option value="">Todas escuelas</option>
          ${escuelasOpts.map(e => `<option value="${e.id}" ${e.id===c.filtroEscuela?'selected':''}>${e.nombre}</option>`).join('')}
        </select>
        
        <select onchange="alumnosGlobalCache.filtroTemporada = this.value; renderAlumnosGlobal()" style="padding:6px">
          <option value="">Toda temporada</option>
          ${temporadasOpts.map(t => `<option value="${t.id}" ${t.id===c.filtroTemporada?'selected':''}>${t.codigo}</option>`).join('')}
        </select>
        
        <select onchange="alumnosGlobalCache.filtroNivel = this.value; renderAlumnosGlobal()" style="padding:6px">
          <option value="">Todo nivel</option>
          <option value="PARV" ${c.filtroNivel==='PARV'?'selected':''}>PARV</option>
          <option value="BASICA" ${c.filtroNivel==='BASICA'?'selected':''}>BASICA</option>
          <option value="BACH" ${c.filtroNivel==='BACH'?'selected':''}>BACH</option>
          <option value="OTRO" ${c.filtroNivel==='OTRO'?'selected':''}>OTRO</option>
        </select>
        
        <select onchange="alumnosGlobalCache.filtroEstado = this.value; renderAlumnosGlobal()" style="padding:6px">
          <option value="">Todo estado</option>
          <option value="sin_tallas" ${c.filtroEstado==='sin_tallas'?'selected':''}>⚠ Sin tallas</option>
          <option value="pendiente" ${c.filtroEstado==='pendiente'?'selected':''}>❌❌ Pendiente</option>
          <option value="parcial" ${c.filtroEstado==='parcial'?'selected':''}>✅❌ Parcial</option>
          <option value="completo" ${c.filtroEstado==='completo'?'selected':''}>✅✅ Completo</option>
          <option value="entregado" ${c.filtroEstado==='entregado'?'selected':''}>🚚 Entregado</option>
        </select>
      </div>
      
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="abrirModalEtiquetas()">🏷 Imprimir etiquetas</button>
        <button class="btn btn-ghost btn-sm" onclick="initAlumnosGlobal()">🔄 Refrescar</button>
        ${(c.busqueda || c.filtroEscuela || c.filtroNivel || c.filtroTemporada || c.filtroEstado) ? 
          `<button class="btn btn-ghost btn-sm" onclick="limpiarFiltros()">✗ Limpiar filtros</button>` : ''}
      </div>
    </div>
  `;
  
  if (lista.length === 0) {
    cont.innerHTML = header + '<div class="alert alert-info">Sin resultados.</div>';
    return;
  }
  
  // Tabla
  const visible = lista.slice(0, 500); // cap
  const hayMas = lista.length > 500;
  
  const iconEstado = (e) => e === 'empacado' ? '✅' : (e === 'entregado' ? '🚚' : (e === 'reservado' ? '⏳' : '⬜'));
  
  const filas = visible.map(a => {
    const esc = c.escuelas[a.escuela_id];
    const sinTallas = alumnoSinTallas(a);
    const bg = sinTallas ? '#FFF4F0' : 'white';
    return `
      <tr style="border-top:1px solid #EEE;background:${bg}">
        <td style="padding:4px 8px;font-weight:600">${a.nombre}</td>
        <td style="padding:4px 8px;font-size:11px;color:#666">${esc ? esc.nombre : '-'}</td>
        <td style="padding:4px 8px;font-size:11px">${a.grado || '-'}</td>
        <td style="padding:4px 8px;text-align:center">${a.sexo==='F'?'♀':(a.sexo==='M'?'♂':'-')}</td>
        <td style="padding:4px 8px;text-align:center;font-family:monospace;color:${a.talla_top_key?'var(--azul)':'#c44'}">${a.talla_top_key || '⚠'}</td>
        <td style="padding:4px 8px;text-align:center;font-family:monospace;color:${a.talla_bottom_key?'var(--azul)':'#c44'}">${a.talla_bottom_key || '⚠'}</td>
        <td style="padding:4px 8px;text-align:center">${iconEstado(a.estado_top)}${iconEstado(a.estado_bottom)}</td>
        <td style="padding:4px 8px;text-align:center">
          <button class="btn-mini" onclick="editarAlumnoGlobal('${a.id}')">✏</button>
        </td>
      </tr>
    `;
  }).join('');
  
  cont.innerHTML = header + `
    <div class="card" style="padding:0;overflow:auto;max-height:70vh">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead style="position:sticky;top:0;background:#F5F7FA;z-index:1">
          <tr>
            <th style="padding:6px 8px;text-align:left">Nombre</th>
            <th style="padding:6px 8px;text-align:left">Escuela</th>
            <th style="padding:6px 8px;text-align:left">Grado</th>
            <th style="padding:6px 8px">Sx</th>
            <th style="padding:6px 8px">Top</th>
            <th style="padding:6px 8px">Bottom</th>
            <th style="padding:6px 8px">Estado</th>
            <th style="padding:6px 8px"></th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      ${hayMas ? `<div style="padding:10px;text-align:center;color:#888;font-size:12px">... ${lista.length-500} alumnos más. Usá filtros para reducir.</div>` : ''}
    </div>
  `;
}

function limpiarFiltros() {
  alumnosGlobalCache.busqueda = '';
  alumnosGlobalCache.filtroEscuela = '';
  alumnosGlobalCache.filtroNivel = '';
  alumnosGlobalCache.filtroTemporada = '';
  alumnosGlobalCache.filtroEstado = '';
  renderAlumnosGlobal();
}

// Editar alumno desde vista global
async function editarAlumnoGlobal(alumnoId) {
  try {
    const res = await supaFetch('alumno', 'GET', null, `?id=eq.${alumnoId}&limit=1`);
    if (!res || res.length === 0) return;
    const a = res[0];
    
    // Switchear al tab Registro, abrir escuela, sub-tab Tallaje, editar alumno
    switchTab('registro');
    setTimeout(async () => {
      // Cambiar temporada si hace falta
      if (a.temporada_id !== registroCache.temporadaActual) {
        registroCache.temporadaActual = a.temporada_id;
        renderRegistroHeader();
        await cargarEscuelasTemporada();
      }
      // Abrir detalle de escuela
      setTimeout(async () => {
        await abrirDetalleEscuelaRegistro(a.escuela_id);
        // Ir a Tallaje sub-tab
        setTimeout(() => {
          cambiarVistaDetalle('tallaje', document.querySelectorAll('#registro-detalle-subtabs .sub-tab')[0]);
          setTimeout(() => editarAlumno(alumnoId), 200);
        }, 200);
      }, 200);
    }, 100);
  } catch(e) { alert('Error: ' + e.message); }
}

// ═══════════════════════════════════════════════════════════════════
// ETIQUETAS IMPRIMIBLES
// ═══════════════════════════════════════════════════════════════════

function abrirModalEtiquetas() {
  const modal = document.getElementById('etiquetas-modal');
  if (!modal) return;
  
  // Pre-llenar con los filtros actuales
  const c = alumnosGlobalCache;
  const sel = document.getElementById('et-escuela');
  if (sel) {
    // Llenar con escuelas únicas
    const escuelasUnicas = {};
    for (const a of c.alumnos) {
      if (a.escuela_id && c.escuelas[a.escuela_id]) {
        escuelasUnicas[a.escuela_id] = c.escuelas[a.escuela_id];
      }
    }
    const opts = Object.values(escuelasUnicas).sort((a,b) => a.nombre.localeCompare(b.nombre));
    sel.innerHTML = '<option value="">— Todas las escuelas —</option>' + 
      opts.map(e => `<option value="${e.id}" ${e.id===c.filtroEscuela?'selected':''}>${e.nombre}</option>`).join('');
  }
  
  const selT = document.getElementById('et-temporada');
  if (selT) {
    selT.innerHTML = '<option value="">— Toda temporada —</option>' + 
      (registroCache.temporadas || []).map(t => `<option value="${t.id}" ${t.id===c.filtroTemporada?'selected':''}>${t.codigo}</option>`).join('');
  }
  
  modal.style.display = 'flex';
}

function cerrarModalEtiquetas() {
  const modal = document.getElementById('etiquetas-modal');
  if (modal) modal.style.display = 'none';
}

function generarEtiquetas() {
  const escId = document.getElementById('et-escuela').value;
  const tempId = document.getElementById('et-temporada').value;
  const columnas = parseInt(document.getElementById('et-columnas').value) || 3;
  const orden = document.getElementById('et-orden').value;
  const soloEmpacados = document.getElementById('et-solo-empacados').checked;
  const incluirObs = document.getElementById('et-incluir-obs').checked;
  
  const c = alumnosGlobalCache;
  let lista = c.alumnos.filter(a => {
    // SOLO con tallas (al menos top o bottom)
    if (alumnoSinTallas(a)) return false;
    if (escId && a.escuela_id !== escId) return false;
    if (tempId && a.temporada_id !== tempId) return false;
    if (soloEmpacados) {
      const algEmp = a.estado_top === 'empacado' || a.estado_bottom === 'empacado';
      if (!algEmp) return false;
    }
    return true;
  });
  
  if (lista.length === 0) {
    alert('No hay alumnos para etiquetar con esos filtros.\nAsegurate de que tengan tallas cargadas.');
    return;
  }
  
  // Ordenar
  if (orden === 'grado_nombre') {
    lista.sort((a,b) => {
      const g = (a.grado||'').localeCompare(b.grado||'');
      if (g !== 0) return g;
      return (a.nombre||'').localeCompare(b.nombre||'');
    });
  } else if (orden === 'grado_talla') {
    lista.sort((a,b) => {
      const g = (a.grado||'').localeCompare(b.grado||'');
      if (g !== 0) return g;
      const tt = (a.talla_top_key||'').localeCompare(b.talla_top_key||'');
      if (tt !== 0) return tt;
      return (a.nombre||'').localeCompare(b.nombre||'');
    });
  } else if (orden === 'escuela_grado_nombre') {
    lista.sort((a,b) => {
      const ea = c.escuelas[a.escuela_id]?.nombre || '';
      const eb = c.escuelas[b.escuela_id]?.nombre || '';
      const e = ea.localeCompare(eb);
      if (e !== 0) return e;
      const g = (a.grado||'').localeCompare(b.grado||'');
      if (g !== 0) return g;
      return (a.nombre||'').localeCompare(b.nombre||'');
    });
  } else if (orden === 'talla') {
    lista.sort((a,b) => {
      const tt = (a.talla_top_key||'').localeCompare(b.talla_top_key||'');
      if (tt !== 0) return tt;
      return (a.nombre||'').localeCompare(b.nombre||'');
    });
  }
  
  // Info de escuela para header
  const escName = escId ? (c.escuelas[escId]?.nombre || '') : '';
  const tempCode = tempId ? ((registroCache.temporadas||[]).find(t => t.id === tempId)?.codigo || '') : '';
  
  const html = renderHojaEtiquetas(lista, columnas, incluirObs, c.escuelas, escName, tempCode);
  cerrarModalEtiquetas();
  abrirVentanaImpresion(html);
}

function renderHojaEtiquetas(alumnos, cols, incluirObs, escuelasMap, escNameHdr, tempCodeHdr) {
  const fecha = new Date().toLocaleDateString('es-SV');
  const total = alumnos.length;
  
  // Cada etiqueta: 1 fila del grid CSS
  const etiquetas = alumnos.map((a, i) => {
    const esc = escuelasMap[a.escuela_id];
    const escCorto = esc ? (esc.nombre.length > 20 ? esc.nombre.slice(0, 20) + '…' : esc.nombre) : '';
    const nombreCorto = a.nombre.length > 35 ? a.nombre.slice(0, 35) + '…' : a.nombre;
    const obs = incluirObs && a.observaciones ? ` · ${a.observaciones.slice(0, 20)}` : '';
    const top = a.talla_top_key || '—';
    const bot = a.talla_bottom_key || '—';
    
    return `
      <div class="etiqueta">
        <span class="grado">${a.grado || '—'}</span>
        <span class="nombre">${nombreCorto}</span>
        <span class="tallas">${top}/${bot}</span>
        ${obs ? `<span class="obs">${obs}</span>` : ''}
      </div>
    `;
  }).join('');
  
  const tituloExtra = [escNameHdr, tempCodeHdr].filter(Boolean).join(' · ');
  
  return `
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Etiquetas${tituloExtra ? ' - ' + tituloExtra : ''}</title>
    <style>
      @page { size: A4; margin: 8mm; }
      body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; margin: 0; padding: 0; }
      
      .header {
        text-align: center;
        border-bottom: 1px solid #000;
        padding-bottom: 3px;
        margin-bottom: 4px;
        font-size: 9pt;
      }
      .header strong { font-size: 11pt; }
      .header .info { font-size: 8pt; color: #333; }
      
      .grid {
        display: grid;
        grid-template-columns: repeat(${cols}, 1fr);
        gap: 0;
      }
      
      .etiqueta {
        height: 10mm;
        border: 0.5pt solid #000;
        padding: 0 3mm;
        display: flex;
        align-items: center;
        gap: 4mm;
        overflow: hidden;
        box-sizing: border-box;
        page-break-inside: avoid;
      }
      
      .etiqueta .grado {
        font-weight: bold;
        background: #000;
        color: white;
        padding: 1pt 4pt;
        font-size: 8pt;
        min-width: 20pt;
        text-align: center;
        border-radius: 2pt;
        flex-shrink: 0;
      }
      
      .etiqueta .nombre {
        flex: 1;
        font-size: 9pt;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .etiqueta .tallas {
        font-family: monospace;
        font-weight: bold;
        font-size: 9pt;
        white-space: nowrap;
        flex-shrink: 0;
      }
      
      .etiqueta .obs {
        font-size: 7pt;
        color: #444;
        font-style: italic;
      }
      
      @media print { .no-print { display: none; } }
    </style></head>
    <body>
      <div class="header">
        <div><strong>Etiquetas de empaque</strong></div>
        <div class="info">
          ${tituloExtra ? tituloExtra + ' · ' : ''}${total} etiqueta(s) · ${fecha}
        </div>
      </div>
      
      <div class="grid">
        ${etiquetas}
      </div>
      
      <div class="no-print" style="margin-top:20px;text-align:center">
        <button onclick="window.print()" style="padding:10px 20px;font-size:14pt">🖨 Imprimir</button>
        <button onclick="window.close()" style="padding:10px 20px;font-size:14pt">✕ Cerrar</button>
      </div>
    </body></html>
  `;
}

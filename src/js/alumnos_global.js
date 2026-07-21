// ══════════════════════════════════════════════════════════════════════
// ALUMNOS GLOBAL + ETIQUETAS (v28)
// Vista con búsqueda/filtros + imprimir etiquetas en filas de 1cm
// ══════════════════════════════════════════════════════════════════════

let alumnosGlobalCache = {
  alumnos: [],
  escuelas: {},
  busqueda: '',
  filtroEscuela: '',           // (deprecated, se mantiene por compat con código viejo)
  filtroEscuelas: [],          // array de escuela_id seleccionadas (multi)
  filtroNivel: '',
  filtroTemporada: '',
  filtroEstado: '',            // 'pendiente'|'parcial'|'completo'|'entregado'|'sin_tallas'
  filtroTalla: '',             // KEY exacta (ej. 'C14') — puente desde Estadística→Por talla
  masFiltrosAbierto: false,
  cargado: false,
};

// ── Puentes Registro ↔ Estadística (integración v33) ─────────────────
// Desde una fila de Estadística→Por talla: ver LOS ALUMNOS de esa talla.
function verAlumnosPorTalla(talla) {
  const c = alumnosGlobalCache;
  c.filtroTalla = talla;
  c.filtroEstado = '';
  c.busqueda = '';
  c.pagina = 1;
  if (typeof switchTab === 'function') switchTab('registro');
  setTimeout(() => {
    if (c.cargado && typeof renderAlumnosGlobal === 'function') renderAlumnosGlobal();
    else if (typeof initAlumnosGlobal === 'function') initAlumnosGlobal();
  }, 50);
}

// Desde una escuela filtrada en Registro: ver SU reporte en Estadística.
function verEstadisticaEscuela(escuelaId) {
  window._estEscuelaHint = escuelaId;
  if (typeof switchTab === 'function') switchTab('estadistica');
  setTimeout(() => { if (typeof switchSubEst === 'function') switchSubEst('escuela'); }, 50);
}

// Preferencia de orden para etiquetas — persistida en localStorage
const ET_ORDEN_DEFAULT = ['escuela', 'sexo_fm', 'grado', 'nombre'];
function etOrdenGuardado() {
  try {
    const v = JSON.parse(localStorage.getItem('et_orden') || '');
    if (Array.isArray(v) && v.length === 4) return v;
  } catch(_) {}
  return [...ET_ORDEN_DEFAULT];
}
function etOrdenSet(arr) {
  localStorage.setItem('et_orden', JSON.stringify(arr));
}

// Persistir el estado actual de c.alumnos + escuelas al cache local.
// Llamar tras cambios in-memory para que la próxima apertura desde cache
// refleje el último estado conocido (ej: tras desempacar inline).
function _persistAlumnosCache() {
  const c = alumnosGlobalCache;
  if (!c.cargado || !Array.isArray(c.alumnos) || typeof tiCacheSet !== 'function') return;
  const escuelas = Object.values(c.escuelas || {});
  tiCacheSet('alumnos_v1', { alumnos: c.alumnos, escuelas });
}

async function initAlumnosGlobal() {
  const cont = document.getElementById('alumnos-global-contenido');
  if (!cont) return;

  // Stale-while-revalidate: si hay cache válido (< 24h, mismo schema), pintar
  // instantáneo. En paralelo, hacer fetch fresh y reemplazar cuando responda.
  const cached = (typeof tiCacheGet === 'function') ? tiCacheGet('alumnos_v1') : null;
  let mostradoDesdeCache = false;
  if (cached && Array.isArray(cached.alumnos) && Array.isArray(cached.escuelas)) {
    const escMap = {};
    for (const e of cached.escuelas) escMap[e.id] = e;
    alumnosGlobalCache.escuelas = escMap;
    alumnosGlobalCache.alumnos = cached.alumnos;
    alumnosGlobalCache.cargado = true;
    renderAlumnosGlobal();
    mostradoDesdeCache = true;
  } else {
    cont.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando alumnos...</div>';
  }

  try {
    const [escuelas, alumnos] = await Promise.all([
      supaFetchAll('escuela'),
      // traer TODOS incluso los sin tallas — select explícito para evitar
      // bajar columnas no usadas (creado_en/actualizado_en). Si después se
      // agregan columnas grandes a alumno, no van a afectar el load inicial.
      supaFetchAll('alumno',
        '?activo=eq.true&select=' +
        'id,temporada_id,escuela_id,nombre,grado,nivel,ciclo,sexo,activo,' +
        'prenda_top,talla_top_key,estado_top,empacado_top_en,' +
        'prenda_bottom,talla_bottom_key,estado_bottom,empacado_bottom_en,' +
        'talla_empacada_top,talla_empacada_bot,' +
        'observaciones,tiene_talla_no_estandar' +
        '&order=nombre'),
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

    // Persistir snapshot fresh y re-render. Si ya estábamos mostrando desde
    // cache, el reemplazo se ve como un refresh discreto.
    if (typeof tiCacheSet === 'function') tiCacheSet('alumnos_v1', { alumnos, escuelas });
    renderAlumnosGlobal();
  } catch(e) {
    // Si no había cache + falla la red → mostrar error. Si había cache →
    // log silencioso, el usuario sigue viendo datos del cache (offline OK).
    if (!mostradoDesdeCache) {
      cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
    } else {
      console.warn('[init] refresh falló, usando cache local:', e.message);
    }
  }
}

// "Sin tallar" significa "le falta al menos una talla" — antes era "sin NINGUNA"
// y mostraba 0 porque casi todos tienen al menos una talla cargada.
function alumnoSinTallas(a) {
  return !a.talla_top_key || !a.talla_bottom_key;
}

// Comparadores de orden — usados tanto en la tabla de Registro como en
// el PDF de etiquetas (mismo orden visible en ambos lados).
const ORDEN_CMP = {
  escuela: (a,b) => {
    const c = alumnosGlobalCache;
    const ea = c.escuelas[a.escuela_id]?.alias || c.escuelas[a.escuela_id]?.nombre || '';
    const eb = c.escuelas[b.escuela_id]?.alias || c.escuelas[b.escuela_id]?.nombre || '';
    return ea.localeCompare(eb);
  },
  sexo_fm: (a,b) => {
    const rk = (s) => s === 'F' ? 0 : (s === 'M' ? 1 : 2);
    return rk(a.sexo) - rk(b.sexo);
  },
  sexo_mf: (a,b) => {
    const rk = (s) => s === 'M' ? 0 : (s === 'F' ? 1 : 2);
    return rk(a.sexo) - rk(b.sexo);
  },
  // Ciclo: 0=PARV, 1/2/3=BASICA, 4=BACH. Null al final.
  ciclo:     (a,b) => (a.ciclo == null ? 99 : a.ciclo) - (b.ciclo == null ? 99 : b.ciclo),
  grado:     (a,b) => (a.grado||'').localeCompare(b.grado||'', 'es', { numeric: true }),
  nombre:    (a,b) => (a.nombre||'').localeCompare(b.nombre||'', 'es'),
  talla_top: (a,b) => (a.talla_top_key||'').localeCompare(b.talla_top_key||'', 'es', { numeric: true }),
  talla_bot: (a,b) => (a.talla_bottom_key||'').localeCompare(b.talla_bottom_key||'', 'es', { numeric: true }),
};

// Filtro compartido entre la tabla del tab Registro y el PDF de etiquetas.
// opts.requiereAlgunaTalla = true → excluye alumnos sin top y sin bottom
//   (útil para etiquetas, que no tendrían qué imprimir).
// opts.soloEmpacados = true → además filtra a los que tienen al menos una
//   pieza empacada (para "Solo empacados" del modal de etiquetas).
function aplicarFiltrosAlumnos(c, opts = {}) {
  const { requiereAlgunaTalla = false, soloEmpacados = false } = opts;

  let lista = c.alumnos;

  if (c.busqueda) {
    const q = c.busqueda.toLowerCase().trim();
    lista = lista.filter(a => (a.nombre||'').toLowerCase().includes(q));
  }
  if (c.filtroEscuelas && c.filtroEscuelas.length > 0) {
    const set = new Set(c.filtroEscuelas);
    lista = lista.filter(a => set.has(a.escuela_id));
  } else if (c.filtroEscuela) {
    lista = lista.filter(a => a.escuela_id === c.filtroEscuela);
  }
  if (c.filtroTalla) {
    lista = lista.filter(a => a.talla_top_key === c.filtroTalla || a.talla_bottom_key === c.filtroTalla);
  }
  if (c.filtroNivel) lista = lista.filter(a => a.nivel === c.filtroNivel);
  if (c.filtroTemporada) lista = lista.filter(a => a.temporada_id === c.filtroTemporada);
  if (c.filtroEstado) {
    lista = lista.filter(a => {
      if (c.filtroEstado === 'sin_tallas') return alumnoSinTallas(a);
      const t = a.estado_top, b = a.estado_bottom;
      if (c.filtroEstado === 'pendiente') return t==='pendiente' && b==='pendiente' && !alumnoSinTallas(a);
      if (c.filtroEstado === 'parcial')
        return (t==='empacado' && b!=='empacado') || (b==='empacado' && t!=='empacado');
      if (c.filtroEstado === 'completo')  return t==='empacado' && b==='empacado';
      if (c.filtroEstado === 'entregado') return t==='entregado' && b==='entregado';
      return true;
    });
  }
  if (requiereAlgunaTalla) {
    lista = lista.filter(a => a.talla_top_key || a.talla_bottom_key);
  }
  if (soloEmpacados) {
    lista = lista.filter(a => a.estado_top === 'empacado' || a.estado_bottom === 'empacado');
  }
  return lista;
}

// Render diferido para hot paths (toggles de checkbox, input de búsqueda).
// Coalesce múltiples llamadas en un solo render por frame. El feedback
// inmediato del browser (el check marcado, el texto escrito) sigue ahí —
// solo el recálculo de disabled/banner/avisos se diferre al próximo frame.
let _renderAlumnosRaf = 0;
function scheduleRenderAlumnos() {
  if (_renderAlumnosRaf) return;
  _renderAlumnosRaf = (typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame : (cb) => setTimeout(cb, 16))(() => {
    _renderAlumnosRaf = 0;
    renderAlumnosGlobal();
  });
}

function renderAlumnosGlobal() {
  const cont = document.getElementById('alumnos-global-contenido');
  if (!cont) return;

  const c = alumnosGlobalCache;
  let lista = aplicarFiltrosAlumnos(c);

  // Aplicar el orden seleccionado en el header (mismo que usa el PDF de etiquetas)
  // para que la tabla de Registro se vea ordenada igual que va a salir el PDF.
  const ordenList = (c.ordenList || etOrdenGuardado()).filter(Boolean);
  if (ordenList.length > 0) {
    const cmps = ordenList.map(k => ORDEN_CMP[k]).filter(Boolean);
    lista = lista.slice().sort((a, b) => {
      for (const fn of cmps) { const r = fn(a, b); if (r !== 0) return r; }
      return 0;
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
  const sinTallas = c.alumnos.filter(alumnoSinTallas).length;  // ahora = "le falta al menos una"
  const completos = c.alumnos.filter(a => a.estado_top==='empacado' && a.estado_bottom==='empacado').length;
  
  // Compat: si hay filtroEscuela (string, viejo) y filtroEscuelas (array) está vacío, migrar
  if (c.filtroEscuela && (!c.filtroEscuelas || c.filtroEscuelas.length === 0)) {
    c.filtroEscuelas = [c.filtroEscuela];
    c.filtroEscuela = '';
  }
  const escuelasSel = c.filtroEscuelas || [];
  const algunFiltro = (c.busqueda || escuelasSel.length || c.filtroNivel || c.filtroEstado || c.filtroTalla);
  const masFiltrosAbierto = !!c.masFiltrosAbierto;

  // Opciones de escuela que aún NO están seleccionadas
  const escuelasDisponibles = escuelasOpts.filter(e => !escuelasSel.includes(e.id));

  // Contador de "filtros activos" para el badge del botón de opciones
  const filtrosActivos = (escuelasSel.length > 0 ? 1 : 0) +
    (c.filtroNivel ? 1 : 0) + (c.filtroTemporada ? 1 : 0);

  // Conteo de alumnos por escuela (para los chips)
  const alumnosPorEscuela = {};
  for (const a of c.alumnos) {
    if (a.escuela_id) alumnosPorEscuela[a.escuela_id] = (alumnosPorEscuela[a.escuela_id] || 0) + 1;
  }
  const unaEscuela = escuelasSel.length === 1 ? escuelasSel[0] : null;

  const header = `
    <div class="card" style="padding:10px 12px;margin-bottom:10px">
      <!-- Fila 1: buscar + acciones principales -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
        <input type="text" placeholder="🔍 Filtrar esta lista por nombre..." value="${c.busqueda}"
          title="Filtra los alumnos ya cargados en esta lista. Para buscar en TODA la app, usá el buscador del encabezado (Ctrl+K)."
          oninput="alumnosGlobalCache.busqueda = this.value; alumnosGlobalCache.pagina = 1; scheduleRenderAlumnos()"
          style="flex:1;min-width:160px;padding:8px 12px;border:1px solid var(--borde);border-radius:6px;font-size:14px">
        <button class="btn btn-success btn-sm" onclick="abrirNuevoAlumno()">+ Nuevo alumno</button>
        <button class="btn btn-sm ${c.vistaGrilla ? 'btn-primary' : 'btn-ghost'}" onclick="toggleVistaGrilla()"
          title="Grilla tipo Excel: edición inline con teclado y pegado de columnas">⚡ Grilla</button>
        <button class="btn btn-ghost btn-sm" onclick="initAlumnosGlobal()" title="Refrescar">🔄</button>
      </div>

      <!-- Fila 2: ESCUELAS como chips deslizables (el filtro más usado, siempre a la vista) -->
      <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:2px;-webkit-overflow-scrolling:touch;scrollbar-width:thin">
        <button class="btn btn-sm ${escuelasSel.length === 0 ? 'btn-primary' : 'btn-ghost'}" style="white-space:nowrap;flex-shrink:0"
          onclick="alumnosGlobalCache.filtroEscuelas=[];alumnosGlobalCache.pagina=1;renderAlumnosGlobal()">🏫 Todas</button>
        ${escuelasOpts.map(e => {
          const sel = escuelasSel.includes(e.id);
          const n = alumnosPorEscuela[e.id] || 0;
          return `<button class="btn btn-sm ${sel ? 'btn-primary' : 'btn-ghost'}" style="white-space:nowrap;flex-shrink:0"
            onclick="${sel ? `quitarFiltroEscuela('${e.id}')` : `agregarFiltroEscuela('${e.id}')`}"
            title="${(e.nombre || '').replace(/"/g, '&quot;')} · ${n} alumnos">${e.alias || e.nombre}${e.alias ? '' : ' ⚠️'} <span style="opacity:.55;font-size:10px">${n}</span></button>`;
        }).join('')}
      </div>
      ${unaEscuela ? `
      <!-- Acciones de la escuela elegida -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;font-size:12px">
        <button class="btn btn-ghost btn-sm" onclick="verEstadisticaEscuela('${unaEscuela}')" title="Tallaje, contrato y tela de esta escuela">📊 Su estadística</button>
        <button class="btn btn-ghost btn-sm" onclick="window._emqHintEscuela='${unaEscuela}';switchTab('empaque')" title="Sesión de empaque de esta escuela">🧺 Empacarla</button>
        <button class="btn btn-ghost btn-sm" onclick="editarEscuela('${unaEscuela}')" title="Alias y datos de la escuela">✏️ Editar escuela</button>
      </div>` : '<div style="margin-bottom:6px"></div>'}

      <!-- Fila 3: chips de estado + contador -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
        <button class="btn btn-sm ${!c.filtroEstado && escuelasSel.length===0 && !c.busqueda?'btn-primary':'btn-ghost'}"
          onclick="limpiarFiltros()">👥 Todos (${tot.toLocaleString()})</button>
        <button class="btn btn-sm ${c.filtroEstado==='sin_tallas'?'btn-primary':'btn-ghost'}"
          onclick="aplicarFiltroEstado('sin_tallas')">⚠️ Falta tallar (${sinTallas})</button>
        <button class="btn btn-sm ${c.filtroEstado==='completo'?'btn-primary':'btn-ghost'}"
          onclick="aplicarFiltroEstado('completo')">✅ Completos (${completos})</button>
        ${c.filtroTalla ? `<span class="btn btn-sm btn-primary" style="cursor:default" title="Filtro por talla (vino de Estadística)">📐 ${c.filtroTalla} <span style="margin-left:4px;cursor:pointer" onclick="alumnosGlobalCache.filtroTalla='';alumnosGlobalCache.pagina=1;renderAlumnosGlobal()">✕</span></span>` : ''}
        ${algunFiltro ? `<button class="btn btn-ghost btn-sm" onclick="limpiarFiltros()" title="Quitar todos los filtros">✗</button>` : ''}
        <span style="margin-left:auto;color:#888;font-size:11px;align-self:center">${totMostrando.toLocaleString()} mostrando</span>
      </div>

      <!-- Colapsado: acciones + filtros avanzados + orden -->
      <details ${masFiltrosAbierto ? 'open' : ''} ontoggle="alumnosGlobalCache.masFiltrosAbierto = this.open">
        <summary style="cursor:pointer;list-style:none;padding:8px 12px;background:#F5F7FA;border-radius:6px;font-size:13px;font-weight:600;color:#555;display:flex;align-items:center;justify-content:space-between;user-select:none">
          <span>🎛 Más opciones${filtrosActivos > 0 ? ` <span style="background:var(--azul);color:white;border-radius:10px;padding:1px 7px;font-size:11px;margin-left:4px">${filtrosActivos} filtro${filtrosActivos>1?'s':''}</span>` : ''}</span>
          <span style="opacity:0.6">▼</span>
        </summary>
        <div style="padding:10px 4px 0 4px;display:flex;flex-direction:column;gap:8px">
          <!-- Acciones -->
          <div>
            <div style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Acciones</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              <button class="btn btn-primary btn-sm" onclick="generarEtiquetasDirecto()" title="PDF de etiquetas con los filtros y orden actuales">🏷 Imprimir etiquetas</button>
              ${typeof abrirModalExport === 'function' ? '<button class="btn btn-ghost btn-sm" onclick="abrirModalExport()" title="Descargar alumnos/pedidos/stock en CSV">💾 Exportar datos</button>' : ''}
              <button class="btn btn-ghost btn-sm" onclick="nuevaEscuela()" title="Crear escuela nueva">🏫 + Nueva escuela</button>
            </div>
          </div>

          <!-- Filtros avanzados: nivel + estado + temporada -->
          <div style="padding-top:6px;border-top:1px dashed #E0E0E0">
            <div style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Filtros avanzados</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px">
              <select onchange="alumnosGlobalCache.filtroNivel = this.value; alumnosGlobalCache.pagina = 1; renderAlumnosGlobal()" style="padding:6px">
                <option value="">Todo nivel</option>
                <option value="PARV"   ${c.filtroNivel==='PARV'?'selected':''}>PARV</option>
                <option value="BASICA" ${c.filtroNivel==='BASICA'?'selected':''}>BASICA</option>
                <option value="BACH"   ${c.filtroNivel==='BACH'?'selected':''}>BACH</option>
                <option value="OTRO"   ${c.filtroNivel==='OTRO'?'selected':''}>OTRO</option>
              </select>
              <select onchange="alumnosGlobalCache.filtroEstado = this.value; alumnosGlobalCache.pagina = 1; renderAlumnosGlobal()" style="padding:6px">
                <option value="">Estado avanzado…</option>
                <option value="pendiente" ${c.filtroEstado==='pendiente'?'selected':''}>❌❌ Pendiente (sin empacar)</option>
                <option value="parcial"   ${c.filtroEstado==='parcial'?'selected':''}>✅❌ Parcial empacado</option>
                <option value="entregado" ${c.filtroEstado==='entregado'?'selected':''}>🚚 Entregado</option>
              </select>
              ${temporadasOpts.length > 1 ? `
              <select onchange="alumnosGlobalCache.filtroTemporada = this.value; alumnosGlobalCache.pagina = 1; renderAlumnosGlobal()" style="padding:6px">
                <option value="">Toda temporada</option>
                ${temporadasOpts.map(t => `<option value="${t.id}" ${c.filtroTemporada===t.id?'selected':''}>${t.codigo || t.anio}</option>`).join('')}
              </select>` : ''}
            </div>
          </div>
          <!-- Orden de la lista -->
          <div style="padding-top:6px;border-top:1px dashed #E0E0E0">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px">Orden de la lista (y del PDF de etiquetas)</span>
              <button class="btn btn-ghost btn-sm" onclick="ordenDefault()" style="font-size:10px;padding:2px 8px">↺ Default</button>
            </div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;font-size:12px;max-width:380px">
              ${[1,2,3,4].map(n => {
                const val = (alumnosGlobalCache.ordenList || etOrdenGuardado())[n-1] || '';
                return `
                  <span style="font-weight:600;color:#666">${n}°</span>
                  <select onchange="cambiarOrden(${n-1}, this.value)" style="padding:4px 6px;width:100%">
                    ${ET_ORDEN_OPCIONES.map(o => `<option value="${o.val}" ${o.val===val?'selected':''}>${o.label}</option>`).join('')}
                  </select>
                `;
              }).join('')}
            </div>
            <div style="font-size:11px;color:#888;margin-top:4px">Si el 1° es "Escuela", se agrupan en hojas separadas al imprimir.</div>
          </div>
        </div>
      </details>
    </div>
  `;
  
  // Vista grilla tipo Excel (grilla_padron.js): reusa header/filtros/orden,
  // reemplaza solo el cuerpo.
  if (c.vistaGrilla && typeof renderGrillaPadron === 'function') {
    renderGrillaPadron(cont, header, lista);
    return;
  }

  if (lista.length === 0) {
    cont.innerHTML = header + '<div class="alert alert-info">Sin resultados.</div>';
    return;
  }

  // Paginación: 50 alumnos por página. Reduce DOM de 5k+ nodos a ~500
  // (10x más rápido el render en móvil). pagina vive en el cache global
  // para sobrevivir re-renders. Reset a 1 cuando cambian filtros.
  const PAGINA_SIZE = 50;
  if (typeof c.pagina !== 'number' || c.pagina < 1) c.pagina = 1;
  const totalPaginas = Math.max(1, Math.ceil(lista.length / PAGINA_SIZE));
  if (c.pagina > totalPaginas) c.pagina = totalPaginas;
  const inicioIdx = (c.pagina - 1) * PAGINA_SIZE;
  const finIdx = Math.min(inicioIdx + PAGINA_SIZE, lista.length);
  const visible = lista.slice(inicioIdx, finIdx);

  const iconEstado = (e) => e === 'empacado' ? '✅' : (e === 'entregado' ? '🚚' : (e === 'reservado' ? '⏳' : '⬜'));


  const filas = visible.map(a => {
    const esc = c.escuelas[a.escuela_id];
    const sinTallas = alumnoSinTallas(a);
    const bg = sinTallas ? '#FFF4F0' : 'white';

    const topStyle = 'color:' + (a.talla_top_key ? 'var(--azul)' : '#c44');
    const botStyle = 'color:' + (a.talla_bottom_key ? 'var(--azul)' : '#c44');

    // Celda Top/Bot: talla pedida, o alterna persistida en BD (se ve
    // "F7 F6(tachado)" sobre fondo amarillo con outline punteado).
    const renderCellTalla = (esTop) => {
      const tallaPedida = esTop ? a.talla_top_key : a.talla_bottom_key;
      const persistida  = esTop ? a.talla_empacada_top : a.talla_empacada_bot;
      const tallaShow = persistida || tallaPedida;
      const esAlterna = !!persistida && tallaShow !== tallaPedida;
      const style = esTop ? topStyle : botStyle;
      const display = !tallaPedida ? '⚠'
        : esAlterna ? `${tallaShow}<span style="font-size:9px;color:#888;text-decoration:line-through;margin-left:3px;font-weight:400">${tallaPedida}</span>`
        : tallaShow;
      return `<td style="padding:4px 8px;text-align:center;font-family:monospace;${style}${esAlterna?';background:#FFF4CC;outline:1px dashed #C90;outline-offset:-2px':''}">${display}</td>`;
    };

    return `
      <tr style="border-top:1px solid #EEE;background:${bg};cursor:pointer" onclick="editarAlumnoRapido('${a.id}')" title="Clic para editar">
        <td style="padding:4px 8px;font-weight:600">${a.nombre}</td>
        <td style="padding:4px 8px;font-size:11px;color:#666">${esc ? esc.nombre : '-'}</td>
        <td style="padding:4px 8px;font-size:11px">${a.grado || '-'}</td>
        <td style="padding:4px 8px;text-align:center">${a.sexo==='F'?'♀':(a.sexo==='M'?'♂':'-')}</td>
        ${renderCellTalla(true)}
        ${renderCellTalla(false)}
        <td style="padding:4px 8px;text-align:center">${iconEstado(a.estado_top)}${iconEstado(a.estado_bottom)}</td>
        <td style="padding:4px 8px;text-align:center" onclick="event.stopPropagation()">
          <button class="btn-mini" onclick="editarAlumnoRapido('${a.id}')" title="Editar">✏</button>
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
      ${totalPaginas > 1 ? `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 8px;border-top:1px solid #EEE;background:#F8FAFC;font-size:12px;gap:8px;flex-wrap:wrap">
          <div style="color:#666">Mostrando <strong>${inicioIdx + 1}–${finIdx}</strong> de <strong>${lista.length}</strong></div>
          <div style="display:flex;gap:4px;align-items:center">
            <button class="btn btn-ghost btn-sm" onclick="irPaginaAlumnos(1)" ${c.pagina <= 1 ? 'disabled' : ''} title="Primera página">«</button>
            <button class="btn btn-ghost btn-sm" onclick="irPaginaAlumnos(${c.pagina - 1})" ${c.pagina <= 1 ? 'disabled' : ''} title="Anterior">◀</button>
            <span style="padding:0 8px;font-weight:600">${c.pagina} / ${totalPaginas}</span>
            <button class="btn btn-ghost btn-sm" onclick="irPaginaAlumnos(${c.pagina + 1})" ${c.pagina >= totalPaginas ? 'disabled' : ''} title="Siguiente">▶</button>
            <button class="btn btn-ghost btn-sm" onclick="irPaginaAlumnos(${totalPaginas})" ${c.pagina >= totalPaginas ? 'disabled' : ''} title="Última página">»</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

// Cambiar de página en la lista de alumnos del Registro.
function irPaginaAlumnos(n) {
  const c = alumnosGlobalCache;
  c.pagina = Math.max(1, parseInt(n, 10) || 1);
  renderAlumnosGlobal();
  // Scroll al inicio de la tabla para que el usuario vea la nueva página
  const cont = document.getElementById('alumnos-global-contenido');
  if (cont) cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function limpiarFiltros() {
  alumnosGlobalCache.busqueda = '';
  alumnosGlobalCache.filtroEscuela = '';
  alumnosGlobalCache.filtroEscuelas = [];
  alumnosGlobalCache.filtroNivel = '';
  alumnosGlobalCache.filtroTemporada = '';
  alumnosGlobalCache.filtroEstado = '';
  alumnosGlobalCache.filtroTalla = '';
  alumnosGlobalCache.pagina = 1;
  renderAlumnosGlobal();
}

// Helpers para los chips de filtro rápido
function aplicarFiltroEstado(estado) {
  alumnosGlobalCache.filtroEstado = (alumnosGlobalCache.filtroEstado === estado) ? '' : estado;
  alumnosGlobalCache.pagina = 1;
  renderAlumnosGlobal();
}
// Compat: setea una sola escuela (limpia las demás)
function aplicarFiltroEscuela(escuelaId) {
  alumnosGlobalCache.filtroEscuela = '';
  alumnosGlobalCache.filtroEscuelas = escuelaId ? [escuelaId] : [];
  alumnosGlobalCache.pagina = 1;
  renderAlumnosGlobal();
}
// Abre modal de escuela. escuelaId=null para crear nueva.
async function editarEscuela(escuelaId) {
  const tempActiva = (registroCache.temporadas || []).find(t => t.estado === 'activa');
  const anio = tempActiva ? tempActiva.anio : new Date().getFullYear();
  const titulo = document.getElementById('ese-titulo');
  const anioLabel = document.getElementById('ese-anio-label');
  if (anioLabel) anioLabel.textContent = '(año ' + anio + ')';

  // Resetear todos los campos
  ['ese-alias','ese-nombre','ese-cde','ese-director','ese-distrito','ese-municipio',
   'ese-cod-contrato','ese-persona','ese-pz-l1','ese-mt-l1','ese-pz-l2','ese-mt-l2',
   'ese-tela-celeste','ese-tela-blanca','ese-tela-azul','ese-tela-beige','ese-grupo']
   .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  // Datalist de grupos existentes (autocompletar). Toma de cualquier cache disponible.
  const dl = document.getElementById('ese-grupo-datalist');
  if (dl) {
    const fuente = (typeof registroCache !== 'undefined' && registroCache.escuelas) ? registroCache.escuelas
      : Object.values((typeof alumnosGlobalCache !== 'undefined' && alumnosGlobalCache.escuelas) || {});
    const grupos = [...new Set(fuente.map(x => x.grupo_produccion).filter(Boolean))].sort();
    dl.innerHTML = grupos.map(g => `<option value="${g.replace(/"/g,'&quot;')}">`).join('');
  }

  if (!escuelaId) {
    if (titulo) titulo.textContent = '🏫 Nueva escuela';
    document.getElementById('ese-id').value = '';
    document.getElementById('escuela-edit-modal').style.display = 'flex';
    setTimeout(() => { const el = document.getElementById('ese-alias'); if (el) el.focus(); }, 100);
    return;
  }

  if (titulo) titulo.textContent = '🏫 Editar escuela';
  document.getElementById('ese-id').value = escuelaId;

  try {
    // Cargar datos de escuela + contrato del año activo en paralelo
    const [escRes, conRes] = await Promise.all([
      supaFetch('escuela', 'GET', null, `?id=eq.${escuelaId}&limit=1`),
      supaFetch('contrato_escuela', 'GET', null, `?escuela_id=eq.${escuelaId}&anio=eq.${anio}&limit=1`).catch(() => []),
    ]);
    if (!escRes || escRes.length === 0) { alert('Escuela no encontrada'); return; }
    const e = escRes[0];
    const c = (conRes && conRes[0]) || {};

    document.getElementById('ese-alias').value         = e.alias || '';
    document.getElementById('ese-nombre').value        = e.nombre || '';
    document.getElementById('ese-cde').value           = e.codigo_cde || '';
    document.getElementById('ese-director').value      = e.director || '';
    document.getElementById('ese-distrito').value      = e.distrito || '';
    document.getElementById('ese-municipio').value     = e.municipio || '';

    document.getElementById('ese-cod-contrato').value  = c.cod_contrato || '';
    document.getElementById('ese-persona').value       = c.persona || '';
    document.getElementById('ese-pz-l1').value         = c.piezas_lote1 || '';
    document.getElementById('ese-mt-l1').value         = c.monto_lote1 || '';
    document.getElementById('ese-pz-l2').value         = c.piezas_lote2 || '';
    document.getElementById('ese-mt-l2').value         = c.monto_lote2 || '';

    document.getElementById('ese-tela-celeste').value  = c.tela_celeste_yd || '';
    document.getElementById('ese-tela-blanca').value   = c.tela_blanca_yd || '';
    document.getElementById('ese-tela-azul').value     = c.tela_azul_yd || '';
    document.getElementById('ese-tela-beige').value    = c.tela_beige_yd || '';

    document.getElementById('ese-grupo').value         = e.grupo_produccion || '';

    document.getElementById('escuela-edit-modal').style.display = 'flex';
    setTimeout(() => { const el = document.getElementById('ese-alias'); if (el) { el.focus(); el.select(); } }, 100);
  } catch (err) { alert('Error: ' + err.message); }
}

function cerrarEscuelaEdit() {
  document.getElementById('escuela-edit-modal').style.display = 'none';
}

async function guardarEscuelaEdit() {
  const id = document.getElementById('ese-id').value;
  const alias = document.getElementById('ese-alias').value.trim().toUpperCase();
  if (!alias) { alert('El alias es obligatorio.'); return; }

  const tempActiva = (registroCache.temporadas || []).find(t => t.estado === 'activa');
  const anio = tempActiva ? tempActiva.anio : new Date().getFullYear();

  const escPayload = {
    alias: alias,
    nombre:      document.getElementById('ese-nombre').value.trim() || null,
    codigo_cde:  document.getElementById('ese-cde').value.trim() || null,
    director:    document.getElementById('ese-director').value.trim() || null,
    distrito:    document.getElementById('ese-distrito').value.trim() || null,
    municipio:   document.getElementById('ese-municipio').value.trim() || null,
    grupo_produccion: document.getElementById('ese-grupo').value.trim().toUpperCase() || null,
  };

  const numOrZero = (id) => parseFloat(document.getElementById(id).value) || 0;
  const conPayload = {
    anio: anio,
    cod_contrato:    document.getElementById('ese-cod-contrato').value.trim() || null,
    persona:         document.getElementById('ese-persona').value.trim() || null,
    piezas_lote1:    numOrZero('ese-pz-l1'),
    monto_lote1:     numOrZero('ese-mt-l1'),
    piezas_lote2:    numOrZero('ese-pz-l2'),
    monto_lote2:     numOrZero('ese-mt-l2'),
    tela_celeste_yd: numOrZero('ese-tela-celeste'),
    tela_blanca_yd:  numOrZero('ese-tela-blanca'),
    tela_azul_yd:    numOrZero('ese-tela-azul'),
    tela_beige_yd:   numOrZero('ese-tela-beige'),
  };

  try {
    let escuelaId = id;
    if (!escuelaId) {
      // Nueva: insertar escuela
      const r = await supaFetch('escuela', 'POST', { ...escPayload, activa: true });
      escuelaId = Array.isArray(r) ? r[0]?.id : r?.id;
      if (!escuelaId) throw new Error('No se pudo crear la escuela');
    } else {
      await supaUpdate('escuela', escuelaId, escPayload);
    }

    // Upsert contrato_escuela (anio + escuela_id es la unique)
    conPayload.escuela_id = escuelaId;
    // PostgREST upsert con Prefer: resolution=merge-duplicates
    const url = `${SUPA_URL}/rest/v1/contrato_escuela?on_conflict=escuela_id,anio`;
    const tok = (typeof authToken === 'function' ? authToken() : null) || SUPA_KEY;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${tok}`,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(conPayload),
    });
    if (!res.ok) throw new Error('Error guardando contrato: ' + await res.text());

    // Refrescar cache local
    if (alumnosGlobalCache.escuelas[escuelaId]) {
      Object.assign(alumnosGlobalCache.escuelas[escuelaId], escPayload);
    } else if (id === '') {
      // Nueva escuela: agregar al cache
      alumnosGlobalCache.escuelas[escuelaId] = { id: escuelaId, ...escPayload, activa: true };
    }
    cerrarEscuelaEdit();
    renderAlumnosGlobal();
    // El grupo vive en escuela.grupo_produccion: invalidar caches y refrescar la
    // lista de escuelas de Registro para que el badge de grupo quede al día.
    if (typeof invalidarCache === 'function') invalidarCache('escuelas');
    if (typeof tiCacheClearAll === 'function') tiCacheClearAll();
    if (typeof cargarEscuelasTemporada === 'function') cargarEscuelasTemporada();
    alert('✓ Guardado correctamente');
  } catch (err) { alert('Error al guardar: ' + err.message); }
}

// Atajo: abrir modal en modo "nueva escuela"
function nuevaEscuela() { editarEscuela(null); }

// Nuevos: multi-escuela
function agregarFiltroEscuela(escuelaId) {
  if (!escuelaId) return;
  const arr = alumnosGlobalCache.filtroEscuelas || [];
  if (!arr.includes(escuelaId)) arr.push(escuelaId);
  alumnosGlobalCache.filtroEscuelas = arr;
  alumnosGlobalCache.filtroEscuela = '';
  alumnosGlobalCache.pagina = 1;
  renderAlumnosGlobal();
}
function quitarFiltroEscuela(escuelaId) {
  alumnosGlobalCache.filtroEscuelas = (alumnosGlobalCache.filtroEscuelas || []).filter(id => id !== escuelaId);
  alumnosGlobalCache.pagina = 1;
  renderAlumnosGlobal();
}

// Estado del modal de edición — todo el wizard depende de esto
let aeState = {
  alumnoId: null,
  sexo: '',
  prendaTop: '',
  prendaBot: '',
  tallaTopNum: '',     // talla número (sin prefijo)
  tallaBotNum: '',
  largoBot: '',        // largo (sólo si la prenda lo usa)
  manualTop: false,    // si el user override la prenda manualmente
  manualBot: false,
};

// Código de prenda → prefijo de KEY (mismo orden que CATALOGO_BASE)
const AE_PRENDA_PREFIX = {
  'CAMISA':         'C',
  'BLUSA':          'B',
  'CAMISA_CELESTE': 'CC',
  'PANTALON':       'P',
  'FALDA':          'F',
  'PANTALON_BEIGE': 'PB',
  'FALDA_BEIGE':    'FB',
  'FALDA_C.E':      'FCE',
  'SHORT':          'S',
};

// Si la prenda usa largo en la KEY (pantalon/falda)
function aeUsaLargo(prenda) {
  return ['PANTALON','FALDA','PANTALON_BEIGE','FALDA_BEIGE','FALDA_C.E'].includes(prenda);
}

// Devuelve la lista de tallas y largos posibles para una prenda
// extrayéndolos del CATALOGO_BASE (que ya está cargado en core.js).
function aeOpcionesParaPrenda(prenda) {
  const prefix = AE_PRENDA_PREFIX[prenda];
  if (!prefix) return { tallas: [], largos: [] };
  // Buscar en CATALOGO global (extiende CATALOGO_BASE)
  const cat = (typeof CATALOGO !== 'undefined' ? CATALOGO : CATALOGO_BASE)[prefix];
  if (!cat || !cat.keys) return { tallas: [], largos: [] };
  const tallasSet = new Set();
  const largosSet = new Set();
  const usaLargo = aeUsaLargo(prenda);
  for (const k of cat.keys) {
    const rest = k.startsWith(prefix) ? k.slice(prefix.length) : k;
    if (!usaLargo) {
      // KEY = prefix + numero (camisa/blusa/cc/short)
      tallasSet.add(rest);
    } else {
      // KEY = prefix + talla + largo. Las tallas son 1-2 dígitos, los largos 2 dígitos.
      // Heurística: el largo son los últimos 2 dígitos numéricos antes de cualquier sufijo.
      const m = rest.match(/^(\d+)(\d{2})(.*)$/);
      if (m) {
        tallasSet.add(m[1]);
        largosSet.add(m[2]);
      }
    }
  }
  const sortNum = (a,b) => parseInt(a,10) - parseInt(b,10);
  return {
    tallas: [...tallasSet].sort(sortNum),
    largos: [...largosSet].sort(sortNum),
  };
}

function aeSugerirPrenda(sexo, nivel) {
  if (typeof sugerenciaPrenda === 'function') return sugerenciaPrenda(sexo, nivel);
  return { top: '', bottom: '' };
}

// Renderiza chips de talla/largo y refresca KEY preview
function aeRender() {
  // Nivel desde grado
  const grado = document.getElementById('ae-grado').value.trim();
  const nivel = (typeof nivelDesdeGrado === 'function') ? nivelDesdeGrado(grado) : null;
  document.getElementById('ae-nivel-info').innerHTML = 'Nivel: <strong>' + (nivel || '—') + '</strong>';

  // Sexo + nivel → sugerencia de prenda (si no override manual)
  if (aeState.sexo && nivel) {
    const sug = aeSugerirPrenda(aeState.sexo, nivel);
    if (!aeState.manualTop) aeState.prendaTop = sug.top || '';
    if (!aeState.manualBot) aeState.prendaBot = sug.bottom || '';
  }

  // Botones de sexo
  document.querySelectorAll('.ae-sexo-btn').forEach(b => {
    const sel = b.dataset.val === aeState.sexo;
    b.className = 'ae-sexo-btn btn btn-sm ' + (sel ? 'btn-primary' : 'btn-ghost');
  });

  // Labels de prenda sugerida
  document.getElementById('ae-pt-label').textContent = aeState.prendaTop || '— elegí sexo + grado —';
  document.getElementById('ae-pb-label').textContent = aeState.prendaBot || '— elegí sexo + grado —';

  // Selects de override
  document.getElementById('ae-prenda-top-sel').value = aeState.manualTop ? aeState.prendaTop : '';
  document.getElementById('ae-prenda-bot-sel').value = aeState.manualBot ? aeState.prendaBot : '';

  // Chips de talla TOP
  aeRenderChips('top');
  aeRenderChips('bot');

  // KEY preview
  aeActualizarKeys();
}

function aeRenderChips(slot) {
  const prenda = slot === 'top' ? aeState.prendaTop : aeState.prendaBot;
  const opts = aeOpcionesParaPrenda(prenda);
  const tallaSel = slot === 'top' ? aeState.tallaTopNum : aeState.tallaBotNum;
  const cont = document.getElementById(slot === 'top' ? 'ae-tt-chips' : 'ae-tb-chips');
  if (!cont) return;
  if (!prenda) {
    cont.innerHTML = '<span style="color:#aaa;font-size:11px">elegí prenda primero</span>';
  } else if (opts.tallas.length === 0) {
    cont.innerHTML = '<span style="color:#aaa;font-size:11px">sin tallas en catálogo</span>';
  } else {
    cont.innerHTML = opts.tallas.map(t => `
      <button type="button"
        class="btn btn-sm ${t===tallaSel?'btn-primary':'btn-ghost'}"
        style="min-width:42px;padding:4px 8px"
        onclick="aeSetTalla('${slot}','${t}')">${t}</button>
    `).join('');
  }
  // Largos (solo bottom y solo si prenda usa largo)
  if (slot === 'bot') {
    const wrap = document.getElementById('ae-tb-largo-wrap');
    const contL = document.getElementById('ae-tb-largos');
    if (aeUsaLargo(prenda) && opts.largos.length > 0) {
      wrap.style.display = '';
      contL.innerHTML = opts.largos.map(l => `
        <button type="button"
          class="btn btn-sm ${l===aeState.largoBot?'btn-primary':'btn-ghost'}"
          style="min-width:42px;padding:4px 8px"
          onclick="aeSetLargo('${l}')">${l}</button>
      `).join('');
    } else {
      wrap.style.display = 'none';
      aeState.largoBot = '';
    }
  }
}

function aeActualizarKeys() {
  // TOP: prefix + talla
  let keyTop = '';
  if (aeState.prendaTop && aeState.tallaTopNum) {
    keyTop = (AE_PRENDA_PREFIX[aeState.prendaTop] || '') + aeState.tallaTopNum;
  }
  document.getElementById('ae-talla-top').value = keyTop;
  document.getElementById('ae-tt-key').textContent = keyTop ? 'KEY: ' + keyTop + ' ✓' : '';

  // BOT: prefix + talla + (largo si aplica)
  let keyBot = '';
  if (aeState.prendaBot && aeState.tallaBotNum) {
    const pref = AE_PRENDA_PREFIX[aeState.prendaBot] || '';
    if (aeUsaLargo(aeState.prendaBot)) {
      if (aeState.largoBot) keyBot = pref + aeState.tallaBotNum + aeState.largoBot;
    } else {
      keyBot = pref + aeState.tallaBotNum;
    }
  }
  document.getElementById('ae-talla-bot').value = keyBot;
  document.getElementById('ae-tb-key').textContent = keyBot ? 'KEY: ' + keyBot + ' ✓' : '';
}

// Handlers de la UI (llamados desde el HTML)
function aeSetSexo(sexo) {
  aeState.sexo = sexo;
  aeState.manualTop = false;
  aeState.manualBot = false;
  aeRender();
}
function aeRecalcular() { aeRender(); }
function aeSetTalla(slot, t) {
  if (slot === 'top') aeState.tallaTopNum = t; else aeState.tallaBotNum = t;
  aeRender();
}
function aeSetLargo(l) { aeState.largoBot = l; aeRender(); }
function aeSetPrenda(slot, prenda) {
  if (slot === 'top') {
    aeState.prendaTop = prenda || '';
    aeState.manualTop = !!prenda;
    aeState.tallaTopNum = '';
  } else {
    aeState.prendaBot = prenda || '';
    aeState.manualBot = !!prenda;
    aeState.tallaBotNum = '';
    aeState.largoBot = '';
  }
  aeRender();
}

// Parsea una KEY existente (ej "P1075") al state: prenda, talla_num, largo
function aeParsearKey(prenda, key) {
  if (!prenda || !key) return { tallaNum: '', largo: '' };
  const pref = AE_PRENDA_PREFIX[prenda] || '';
  const rest = key.startsWith(pref) ? key.slice(pref.length) : key;
  if (aeUsaLargo(prenda)) {
    const m = rest.match(/^(\d+)(\d{2})/);
    if (m) return { tallaNum: m[1], largo: m[2] };
  }
  return { tallaNum: rest.replace(/\D.*/g, ''), largo: '' };
}

async function editarAlumnoRapido(alumnoId) {
  try {
    const res = await supaFetch('alumno', 'GET', null, `?id=eq.${alumnoId}&limit=1`);
    if (!res || res.length === 0) { alert('Alumno no encontrado'); return; }
    const a = res[0];
    const esc = alumnosGlobalCache.escuelas[a.escuela_id];

    // Poblar datalist de grados con el catálogo (autocomplete)
    _populateGradosDatalist();

    // Reset y poblar state
    aeState = {
      alumnoId: a.id,
      sexo: a.sexo || '',
      prendaTop: a.prenda_top || '',
      prendaBot: a.prenda_bottom || '',
      tallaTopNum: '',
      tallaBotNum: '',
      largoBot: '',
      // Considerar manual si la prenda ya está cargada (no sobreescribir con sugerencia)
      manualTop: !!a.prenda_top,
      manualBot: !!a.prenda_bottom,
    };
    const pt = aeParsearKey(a.prenda_top,    a.talla_top_key);
    const pb = aeParsearKey(a.prenda_bottom, a.talla_bottom_key);
    aeState.tallaTopNum = pt.tallaNum;
    aeState.tallaBotNum = pb.tallaNum;
    aeState.largoBot    = pb.largo;

    document.getElementById('ae-id').value      = a.id;
    document.getElementById('ae-nombre').value  = a.nombre || '';
    document.getElementById('ae-grado').value   = a.grado || '';
    document.getElementById('ae-obs').value     = a.observaciones || '';
    document.getElementById('ae-subt').textContent = esc ? (esc.alias || esc.nombre) : '';

    aeRender();
    _renderEstadoEmpaqueAlumno(a);
    document.getElementById('alumno-edit-modal').style.display = 'flex';
    setTimeout(() => {
      const focusId = !a.sexo ? 'ae-grado'
                    : !aeState.tallaTopNum ? null   // los chips toman foco con clic
                    : !aeState.tallaBotNum ? null
                    : 'ae-nombre';
      if (focusId) {
        const el = document.getElementById(focusId);
        if (el) { el.focus(); el.select && el.select(); }
      }
    }, 100);
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

function cerrarAlumnoEdit() {
  document.getElementById('alumno-edit-modal').style.display = 'none';
}

// Muestra el estado de empaque del alumno en el modal de edición.
// Si una pieza está empacada o entregada, ofrece un botón para desempacarla.
function _renderEstadoEmpaqueAlumno(a) {
  const box = document.getElementById('ae-estado-empaque');
  const lista = document.getElementById('ae-estado-piezas');
  if (!box || !lista) return;
  const piezas = [];
  if (a.prenda_top && a.talla_top_key) {
    piezas.push({ k: 'top', label: '👕 Top', prenda: a.prenda_top, talla: a.talla_top_key, estado: a.estado_top || 'pendiente' });
  }
  if (a.prenda_bottom && a.talla_bottom_key) {
    piezas.push({ k: 'bottom', label: '👖 Bottom', prenda: a.prenda_bottom, talla: a.talla_bottom_key, estado: a.estado_bottom || 'pendiente' });
  }
  // Solo mostrar la sección si al menos una pieza está empacada o entregada
  const tieneAlgo = piezas.some(p => p.estado === 'empacado' || p.estado === 'entregado');
  if (!tieneAlgo) { box.style.display = 'none'; return; }
  box.style.display = '';
  lista.innerHTML = piezas.map(p => {
    const colorMap = { empacado: 'var(--verde)', entregado: 'var(--azul)', pendiente: '#888', reservado: '#a86' };
    const iconMap = { empacado: '✅', entregado: '🚚', pendiente: '⬜', reservado: '⏳' };
    const puedeDesempacar = p.estado === 'empacado' || p.estado === 'entregado';
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:4px 8px;background:white;border:1px solid #E0E4EA;border-radius:6px;font-size:12px">
        <span style="flex:0 0 70px">${p.label}</span>
        <span style="flex:1;color:#666">${p.prenda} ${p.talla}</span>
        <span style="color:${colorMap[p.estado]||'#666'};font-weight:600">${iconMap[p.estado]||'?'} ${p.estado}</span>
        ${puedeDesempacar
          ? `<button type="button" class="btn-mini" style="background:#fde7e7;color:#a33"
                     onclick="desempacarPiezaAlumno('${a.id}','${p.k}')">↶ Desempacar</button>`
          : ''}
      </div>
    `;
  }).join('');
}

async function desempacarPiezaAlumno(alumnoId, pieza) {
  if (!confirm(`¿Desempacar la pieza ${pieza === 'top' ? '👕 top' : '👖 bottom'} de este alumno?\n\nVa a:\n• Marcar el estado como "pendiente"\n• Devolver la unidad al stock o al pool acaparado (según de dónde haya salido)`)) return;
  try {
    if (typeof desempacarPieza !== 'function') throw new Error('Función desempacarPieza no disponible');
    const r = await desempacarPieza(alumnoId, pieza);
    // Actualizar cache local
    const idx = alumnosGlobalCache.alumnos.findIndex(x => x.id === alumnoId);
    if (idx >= 0) {
      const upd = pieza === 'top' ? { estado_top: 'pendiente' } : { estado_bottom: 'pendiente' };
      Object.assign(alumnosGlobalCache.alumnos[idx], upd);
    }
    // Refrescar la sección en el modal
    const refreshed = await supaFetch('alumno', 'GET', null, `?id=eq.${alumnoId}&limit=1`);
    if (refreshed && refreshed[0]) _renderEstadoEmpaqueAlumno(refreshed[0]);
    renderAlumnosGlobal();
    alert(`✓ Pieza desempacada (${r.vinoDeStock ? 'devuelta al stock' : 'liberada del pool'}).`);
  } catch(e) {
    alert('Error al desempacar: ' + e.message);
  }
}

async function guardarAlumnoEdit(continuar) {
  const id = document.getElementById('ae-id').value;
  const nombre = document.getElementById('ae-nombre').value.trim();
  if (!nombre) { alert('El nombre es obligatorio'); return; }
  const grado = document.getElementById('ae-grado').value.trim() || null;
  const nivel = grado && typeof nivelDesdeGrado === 'function' ? nivelDesdeGrado(grado) : null;
  const payload = {
    nombre,
    sexo:             aeState.sexo || null,
    grado:            grado,
    nivel:            nivel,
    prenda_top:       aeState.prendaTop || null,
    talla_top_key:    document.getElementById('ae-talla-top').value || null,
    prenda_bottom:    aeState.prendaBot || null,
    talla_bottom_key: document.getElementById('ae-talla-bot').value || null,
    observaciones:    document.getElementById('ae-obs').value.trim() || null,
    actualizado_en:   new Date().toISOString(),
  };
  try {
    await supaUpdate('alumno', id, payload);
    const idx = alumnosGlobalCache.alumnos.findIndex(a => a.id === id);
    if (idx >= 0) Object.assign(alumnosGlobalCache.alumnos[idx], payload);

    // Si el grado no está en el catálogo, ofrecer agregarlo ahora
    if (grado) {
      const ok = await verificarYAgregarGradoAlCatalogo(grado, id);
      if (ok && ok.nivel != null) {
        // Catálogo actualizado: aplicar nivel/ciclo al alumno
        const updPayload = { nivel: ok.nivel, ciclo: ok.ciclo, actualizado_en: new Date().toISOString() };
        await supaUpdate('alumno', id, updPayload);
        if (idx >= 0) Object.assign(alumnosGlobalCache.alumnos[idx], updPayload);
      }
    }

    if (continuar) {
      const siguiente = alumnosGlobalCache.alumnos.find(a => a.id !== id && (!a.talla_top_key || !a.talla_bottom_key));
      if (siguiente) {
        cerrarAlumnoEdit();
        setTimeout(() => editarAlumnoRapido(siguiente.id), 50);
        renderAlumnosGlobal();
        return;
      }
    }
    cerrarAlumnoEdit();
    renderAlumnosGlobal();
  } catch(e) {
    alert('Error al guardar: ' + e.message);
  }
}

// Cache compartido del catálogo de grados (lazy)
async function _cargarCatalogoGradosCache() {
  if (window._gradoCatalogoCache && window._gradoCatalogoCache.length > 0) return window._gradoCatalogoCache;
  try {
    window._gradoCatalogoCache = await supaFetchAll('grado_catalogo', '?select=grado,nivel,ciclo&order=nivel,ciclo,grado');
  } catch (_) {
    window._gradoCatalogoCache = [];
  }
  return window._gradoCatalogoCache;
}

// Llena el datalist del modal de alumno con los grados del catálogo.
async function _populateGradosDatalist() {
  const dl = document.getElementById('ae-grados-datalist');
  if (!dl) return;
  try {
    const cat = await _cargarCatalogoGradosCache();
    dl.innerHTML = cat
      .filter(g => g.activo !== false)
      .map(g => `<option value="${g.grado}">${g.nivel} · ciclo ${g.ciclo}</option>`)
      .join('');
  } catch (_) { /* ignore */ }
}

// Verifica si el grado está en el catálogo. Si no, abre el modal de
// Config (grado-edit-modal) pre-llenado para que el user defina nivel
// y ciclo. Cuando el user guarda allí, esta promesa resuelve con los
// datos del grado nuevo. Si cancela, resuelve null.
async function verificarYAgregarGradoAlCatalogo(grado, alumnoId) {
  const catalog = await _cargarCatalogoGradosCache();
  const existe = catalog.find(g => g.grado === grado);
  if (existe) return { nivel: existe.nivel, ciclo: existe.ciclo };

  // Verificar que el modal de Config esté disponible
  if (typeof editarGrado !== 'function' || !document.getElementById('grado-edit-modal')) {
    console.warn('Modal de Config no disponible para agregar grado');
    return null;
  }

  return new Promise((resolve) => {
    // Callback que ejecuta guardarGradoEdit en Config al guardar
    window._gradoPendienteCallback = (gradoData) => {
      window._gradoPendienteCallback = null;
      // Actualizar cache local con el nuevo grado
      if (gradoData) {
        const cache = window._gradoCatalogoCache || [];
        const idx = cache.findIndex(g => g.grado === gradoData.grado);
        if (idx >= 0) cache[idx] = gradoData; else cache.push(gradoData);
        window._gradoCatalogoCache = cache;
        // Refrescar el datalist del modal de alumno por si vuelve a abrirse
        _populateGradosDatalist();
      }
      resolve(gradoData);
    };
    // Abrir el modal de Config en modo "nuevo" con el código pre-llenado
    editarGrado(null);
    setTimeout(() => {
      document.getElementById('grad-codigo').value = grado;
      document.getElementById('grado-edit-titulo').textContent = `🆕 Grado nuevo: "${grado}"`;
      // Mantener editable por si quiere corregir typo, pero focar en nivel
      const nivelSel = document.getElementById('grad-nivel');
      if (nivelSel) nivelSel.focus();
    }, 100);
  });
}

// Abre flow de nuevo alumno: pide escuela y redirige al sub-tab Tallaje
// (donde el form ya existe). Si solo hay una escuela activa, va directo.
async function abrirNuevoAlumno() {
  const c = alumnosGlobalCache;
  // Si hay un filtro de escuela activo, usar esa
  let escuelaId = c.filtroEscuela;
  if (!escuelaId) {
    // Pedirle al user que elija una de las escuelas
    const opts = Object.values(c.escuelas)
      .filter(e => e.activa !== false)
      .sort((a,b) => (a.alias||a.nombre).localeCompare(b.alias||b.nombre));
    if (opts.length === 0) { alert('No hay escuelas activas. Cargá una primero.'); return; }
    const lista = opts.map((e,i) => `${i+1}. ${e.alias || e.nombre}`).join('\n');
    const ans = prompt(`Para qué escuela?\n\n${lista}\n\nEscribí el número o el alias:`);
    if (!ans) return;
    const num = parseInt(ans, 10);
    if (!isNaN(num) && num >= 1 && num <= opts.length) {
      escuelaId = opts[num - 1].id;
    } else {
      const match = opts.find(e =>
        (e.alias || '').toLowerCase() === ans.toLowerCase() ||
        (e.nombre || '').toLowerCase().includes(ans.toLowerCase())
      );
      if (!match) { alert('No encontré esa escuela. Probá con el número.'); return; }
      escuelaId = match.id;
    }
  }
  // Navegar a Registro > Escuelas > detalle de esa escuela > sub-tab Tallaje
  if (typeof switchSubRegistro === 'function') switchSubRegistro('escuelas');
  setTimeout(async () => {
    if (typeof abrirDetalleEscuelaRegistro === 'function') {
      await abrirDetalleEscuelaRegistro(escuelaId);
      // Activar sub-tab tallaje y nuevo alumno
      setTimeout(() => {
        if (typeof cambiarVistaDetalle === 'function') {
          const subT = document.querySelectorAll('#registro-detalle-subtabs .sub-tab')[0];
          cambiarVistaDetalle('tallaje', subT);
        }
      }, 200);
    }
  }, 100);
}

// ═══════════════════════════════════════════════════════════════════
// ETIQUETAS IMPRIMIBLES
// ═══════════════════════════════════════════════════════════════════

// Genera el PDF de etiquetas DIRECTO con los filtros + orden de Registro.
function generarEtiquetasDirecto() {
  const orden = alumnosGlobalCache.ordenList || etOrdenGuardado();
  _ejecutarGenerarEtiquetas(orden, { soloEmpacados: false, incluirObs: false });
}

// Cambia un nivel del orden — afecta tanto la lista de Registro como el PDF.
function cambiarOrden(idx, val) {
  const arr = alumnosGlobalCache.ordenList || etOrdenGuardado();
  arr[idx] = val;
  alumnosGlobalCache.ordenList = arr;
  etOrdenSet(arr);  // persistir
  renderAlumnosGlobal();
}

function ordenDefault() {
  alumnosGlobalCache.ordenList = [...ET_ORDEN_DEFAULT];
  etOrdenSet([...ET_ORDEN_DEFAULT]);
  renderAlumnosGlobal();
}

// Aliases por compat con código viejo
function abrirOpcionesEtiquetas() { generarEtiquetasDirecto(); }
function imprimirEtiquetasConFiltros() { generarEtiquetasDirecto(); }

// Campos disponibles para el orden personalizado
const ET_ORDEN_OPCIONES = [
  { val: '',         label: '— (sin más)' },
  { val: 'escuela',  label: '🏫 Escuela' },
  { val: 'sexo_fm',  label: '♀ → ♂ (Femenino primero)' },
  { val: 'sexo_mf',  label: '♂ → ♀ (Masculino primero)' },
  { val: 'ciclo',    label: '🎓 Ciclo (PARV → 1C → 2C → 3C → BACH)' },
  { val: 'grado',    label: '📋 Grado' },
  { val: 'nombre',   label: '🔤 Nombre alfabético' },
  { val: 'talla_top', label: '👕 Talla top' },
  { val: 'talla_bot', label: '👖 Talla bottom' },
];

function etRenderOrdenSelects(seleccion) {
  // seleccion = ['escuela', 'sexo_fm', 'grado', 'nombre'] (default)
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('et-orden-' + i);
    if (!el) continue;
    const val = seleccion[i-1] || '';
    el.innerHTML = ET_ORDEN_OPCIONES.map(o =>
      `<option value="${o.val}" ${o.val===val?'selected':''}>${o.label}</option>`
    ).join('');
  }
}

function etOrdenDefault() {
  etOrdenSet([...ET_ORDEN_DEFAULT]);
  etRenderOrdenSelects([...ET_ORDEN_DEFAULT]);
}

function etSelEscuelas(modo) {
  const sel = document.getElementById('et-escuelas-multi');
  if (!sel) return;
  for (const opt of sel.options) opt.selected = (modo === 'all');
}

function abrirModalEtiquetas() {
  const modal = document.getElementById('etiquetas-modal');
  if (!modal) return;
  // Orden: cargar el guardado en localStorage (no el hardcoded default)
  etRenderOrdenSelects(etOrdenGuardado());
  // Resumen de filtros que se van a aplicar
  const resumen = document.getElementById('et-resumen-filtros');
  if (resumen) resumen.innerHTML = generarResumenFiltros();
  modal.style.display = 'flex';
  setTimeout(() => {
    const btn = document.getElementById('et-btn-generar');
    if (btn) btn.focus();
  }, 100);
}

function generarResumenFiltros() {
  const c = alumnosGlobalCache;
  const partes = [];
  const escSel = c.filtroEscuelas || [];
  if (escSel.length === 0) {
    partes.push('🏫 Todas las escuelas');
  } else if (escSel.length <= 3) {
    const nombres = escSel.map(id => c.escuelas[id]?.alias || c.escuelas[id]?.nombre || '?').join(', ');
    partes.push(`🏫 ${nombres}`);
  } else {
    partes.push(`🏫 ${escSel.length} escuelas`);
  }
  if (c.filtroNivel)     partes.push(`nivel ${c.filtroNivel}`);
  if (c.filtroEstado)    partes.push(`estado ${c.filtroEstado}`);
  if (c.filtroTemporada) {
    const t = (registroCache.temporadas || []).find(x => x.id === c.filtroTemporada);
    partes.push(`temporada ${t ? (t.codigo || t.anio) : '(custom)'}`);
  }
  if (c.busqueda) partes.push(`búsqueda "${c.busqueda}"`);
  // Conteo previo
  let n = '—';
  try {
    n = aplicarFiltrosAlumnos(c, { requiereAlgunaTalla: true }).length;
  } catch(_) {}
  return `
    <div style="font-size:12px;color:#555"><strong>Filtros activos:</strong> ${partes.join(' · ')}</div>
    <div style="font-size:12px;color:#555;margin-top:2px"><strong>Coincidencias con tallas:</strong> ${n}</div>
    <div style="font-size:10px;color:#888;margin-top:2px">Para cambiarlos, cerrá este diálogo y ajustá en la página.</div>
  `;
}

function cerrarModalEtiquetas() {
  const modal = document.getElementById('etiquetas-modal');
  if (modal) modal.style.display = 'none';
}

// generarEtiquetas: lee opciones del modal (orden custom + checkboxes) y dispara.
// Guarda el orden elegido en localStorage para próximas impresiones directas.
function generarEtiquetas() {
  const ordenSeleccion = [
    document.getElementById('et-orden-1')?.value || '',
    document.getElementById('et-orden-2')?.value || '',
    document.getElementById('et-orden-3')?.value || '',
    document.getElementById('et-orden-4')?.value || '',
  ];
  const soloEmpacados = document.getElementById('et-solo-empacados').checked;
  const incluirObs = document.getElementById('et-incluir-obs').checked;
  // Guardar preferencia
  etOrdenSet(ordenSeleccion);
  cerrarModalEtiquetas();
  _ejecutarGenerarEtiquetas(ordenSeleccion.filter(Boolean), { soloEmpacados, incluirObs });
}

// Núcleo de generación de etiquetas. Usa los filtros vigentes en la página
// vía aplicarFiltrosAlumnos para ser 1:1 con lo que se ve en la tabla.
// Si el usuario no fijó filtroTemporada, fallback a la temporada activa
// (preserva el comportamiento default cuando no hay filtro explícito).
function _ejecutarGenerarEtiquetas(ordenSeleccion, { soloEmpacados = false, incluirObs = false } = {}) {
  const c = alumnosGlobalCache;
  const tempActiva = (registroCache.temporadas || []).find(t => t.estado === 'activa');
  const columnas = 1; // hardcoded — tira tipo Excel
  ordenSeleccion = (ordenSeleccion || []).filter(Boolean);
  if (ordenSeleccion.length === 0) ordenSeleccion = [...ET_ORDEN_DEFAULT];

  // Si no hay filtroTemporada explícito, aplicar temporada activa como default
  // para no imprimir alumnos de temporadas viejas inactivas por accidente.
  const filtroTempBackup = c.filtroTemporada;
  if (!filtroTempBackup && tempActiva) c.filtroTemporada = tempActiva.id;
  let lista;
  try {
    lista = aplicarFiltrosAlumnos(c, { requiereAlgunaTalla: true, soloEmpacados });
  } finally {
    c.filtroTemporada = filtroTempBackup;  // no contaminar el cache
  }

  if (lista.length === 0) {
    alert('No hay alumnos para etiquetar con esos filtros.\nRevisá los filtros activos (escuela, nivel, estado, búsqueda) y asegurate de que tengan tallas cargadas.');
    return;
  }

  // Comparadores nombrados — uno por cada opción del select
  const cmpFn = {
    escuela: (a,b) => {
      const ea = c.escuelas[a.escuela_id]?.alias || c.escuelas[a.escuela_id]?.nombre || '';
      const eb = c.escuelas[b.escuela_id]?.alias || c.escuelas[b.escuela_id]?.nombre || '';
      return ea.localeCompare(eb);
    },
    sexo_fm: (a,b) => {
      const rk = (s) => s === 'F' ? 0 : (s === 'M' ? 1 : 2);
      return rk(a.sexo) - rk(b.sexo);
    },
    sexo_mf: (a,b) => {
      const rk = (s) => s === 'M' ? 0 : (s === 'F' ? 1 : 2);
      return rk(a.sexo) - rk(b.sexo);
    },
    ciclo:     (a,b) => (a.ciclo == null ? 99 : a.ciclo) - (b.ciclo == null ? 99 : b.ciclo),
    grado:     (a,b) => (a.grado||'').localeCompare(b.grado||'', 'es', { numeric: true }),
    nombre:    (a,b) => (a.nombre||'').localeCompare(b.nombre||'', 'es'),
    talla_top: (a,b) => (a.talla_top_key||'').localeCompare(b.talla_top_key||'', 'es', { numeric: true }),
    talla_bot: (a,b) => (a.talla_bottom_key||'').localeCompare(b.talla_bottom_key||'', 'es', { numeric: true }),
  };
  const cmps = ordenSeleccion.map(k => cmpFn[k]).filter(Boolean);
  lista.sort((a,b) => {
    for (const fn of cmps) { const r = fn(a,b); if (r !== 0) return r; }
    return 0;
  });

  // Agrupar por escuela SOLO si el primer criterio fue "escuela"
  const agruparPorEscuela = ordenSeleccion[0] === 'escuela';
  const grupos = [];
  if (agruparPorEscuela) {
    let actual = null;
    for (const a of lista) {
      if (!actual || actual.escuela_id !== a.escuela_id) {
        const esc = c.escuelas[a.escuela_id];
        actual = {
          escuela_id: a.escuela_id,
          escuela_nombre: esc?.nombre || '—',
          escuela_alias: esc?.alias || '',
          alumnos: [],
        };
        grupos.push(actual);
      }
      actual.alumnos.push(a);
    }
  } else {
    grupos.push({ escuela_id: null, escuela_nombre: '', escuela_alias: '', alumnos: lista });
  }

  const tempCode = tempActiva ? (tempActiva.codigo || tempActiva.nombre || tempActiva.anio) : '';
  const html = renderHojaEtiquetas(grupos, columnas, incluirObs, c.escuelas, tempCode, lista.length);
  cerrarModalEtiquetas();
  // Generación directa de PDF sin ventana nueva (mobile-friendly)
  generarPdfDirecto(html, construirNombreArchivo(c, tempActiva));
}

// Construye un nombre de archivo descriptivo según los filtros aplicados.
// Ejemplos:
//   etiquetas_ALBERTOGUERRA_2026-05-20.pdf
//   etiquetas_ARCE_LAURELES_2026-05-20.pdf
//   etiquetas_5escuelas_2026-05-20.pdf
//   etiquetas_todas_falta-tallar_2026-05-20.pdf
function construirNombreArchivo(cache, tempActiva) {
  const sanitizar = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  const escSel = cache.filtroEscuelas || [];
  let escTag;
  if (escSel.length === 0) escTag = 'todas';
  else if (escSel.length === 1) escTag = sanitizar(cache.escuelas[escSel[0]]?.alias || cache.escuelas[escSel[0]]?.nombre || 'esc');
  else if (escSel.length <= 3) escTag = escSel.map(id => sanitizar(cache.escuelas[id]?.alias || 'esc')).join('-');
  else escTag = escSel.length + 'escuelas';

  const partes = ['etiquetas', escTag];
  if (cache.filtroEstado && cache.filtroEstado !== 'sin_tallas') partes.push(sanitizar(cache.filtroEstado));
  if (cache.filtroEstado === 'sin_tallas') partes.push('falta-tallar');
  if (cache.filtroNivel) partes.push(sanitizar(cache.filtroNivel));
  if (tempActiva && tempActiva.anio) partes.push(String(tempActiva.anio));
  partes.push(new Date().toISOString().slice(0, 10));
  return partes.join('_') + '.pdf';
}

// Lazy-loader de html2pdf — NO se carga en head.html para no bloquear
// el load inicial de la app (700KB importa en mobile).
function cargarHtml2Pdf() {
  if (typeof html2pdf === 'function') return Promise.resolve();
  if (window._html2pdfPromise) return window._html2pdfPromise;
  window._html2pdfPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar la librería PDF (verificá conexión).'));
    document.head.appendChild(s);
  });
  return window._html2pdfPromise;
}

// Inserta el HTML en un contenedor del documento actual, genera el PDF
// con html2pdf y lo descarga. Sin ventana nueva.
async function generarPdfDirecto(html, filename) {
  // 0) Estimación: cuántas etiquetas tiene? Mobile no banca >500
  const numEtiq = (html.match(/class="etiqueta"/g) || []).length;
  const esMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const LIMITE_MOBILE = 400;
  if (esMobile && numEtiq > LIMITE_MOBILE) {
    const ok = confirm(
      `Vas a generar ${numEtiq.toLocaleString()} etiquetas en un celular.\n\n` +
      `Esto puede tardar mucho o bloquear el navegador.\n\n` +
      `Recomendación: filtrá por una escuela o usá la PC.\n\n` +
      `¿Continuar igual?`
    );
    if (!ok) return;
  }

  // Cargar html2pdf si no estaba (es lazy)
  try {
    await cargarHtml2Pdf();
  } catch (e) {
    alert(e.message);
    return;
  }

  // 1) Container en FLUJO NORMAL del documento. Sin position:absolute ni
  //    visibility:hidden — html2canvas necesita el render real. El overlay
  //    (z-index:99999) tapa la pantalla así el user no ve la inyección.
  const wrap = document.createElement('div');
  wrap.id = 'etiq-pdf-wrap';
  wrap.style.cssText = 'width:8.5in;background:white;color:#000;font-family:Arial,sans-serif;';

  // 2) Overlay de progreso — z-index altísimo para tapar el container
  const overlay = document.createElement('div');
  overlay.id = 'pdf-progress-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;color:white;font-size:18px;text-align:center;padding:20px';
  overlay.innerHTML = `
    <div>
      <div style="font-size:48px;margin-bottom:10px">📄</div>
      <div id="pdf-progress-msg">Generando PDF de ${numEtiq.toLocaleString()} etiqueta(s)...</div>
      <div style="font-size:14px;opacity:0.7;margin-top:8px">No cierres esta página</div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Extraer body y estilos del HTML template
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let bodyHtml = m ? m[1] : html;
  // Quitar <script> que vino en el template (no aplica para PDF) y elementos no-print
  bodyHtml = bodyHtml.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Estilos: inyectar en document.head con scope #etiq-pdf-wrap para no
  // pisar los estilos de la app. Esto los hace globales (más confiable que
  // un <style> dentro del div, que algunos navegadores no aplican bien).
  let styleEl = null;
  const sm = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (sm) {
    let css = sm[1].replace(/@page[^}]*\}/g, '');
    css = css.replace(/@media\s+screen\s*\{[\s\S]*?\}\s*\}/g, ''); // sacar @media screen
    // Scope: prefijar todos los selectores con #etiq-pdf-wrap (no cubrimos
    // todos los casos pero suficiente para nuestras reglas)
    css = css.replace(/(^|\})\s*([^@{}]+)\{/g, (m, pre, sel) => {
      const scoped = sel.split(',').map(s => s.trim()).filter(Boolean)
        .map(s => s === 'body' ? '#etiq-pdf-wrap' : '#etiq-pdf-wrap ' + s)
        .join(',');
      return (pre || '') + scoped + '{';
    });
    styleEl = document.createElement('style');
    styleEl.id = 'etiq-pdf-style';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  wrap.insertAdjacentHTML('beforeend', bodyHtml);
  wrap.querySelectorAll('.no-print').forEach(el => el.remove());
  document.body.appendChild(wrap);

  // 3) Forzar reflow + auto-fit por celda con MEDICIÓN POR CANVAS
  // scrollWidth puede dar valores raros en flex items, especialmente con
  // child elements. Canvas.measureText es 100% confiable.
  try {
    void wrap.offsetHeight;
    await new Promise(r => setTimeout(r, 200));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const ptToPx = 1.333;  // 1pt = 1.333px @96dpi

    const fitOne = (el) => {
      const max = parseFloat(el.getAttribute('data-fit-max')) || 14;
      const min = parseFloat(el.getAttribute('data-fit-min')) || 7;
      const cs = window.getComputedStyle(el);
      const fontFamily = cs.fontFamily;
      const fontWeight = cs.fontWeight;
      const letterSpacing = parseFloat(cs.letterSpacing) || 0; // px

      // Espacio disponible: ancho del elemento menos paddings
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const availPx = el.clientWidth - padL - padR;
      if (availPx <= 0) return;

      const text = el.textContent || '';
      // Probar tamaños de max a min hasta encontrar uno que entre
      let size = max;
      while (size > min) {
        ctx.font = `${fontWeight} ${size}pt ${fontFamily}`;
        const w = ctx.measureText(text).width + letterSpacing * (text.length - 1);
        if (w <= availPx) break;
        size -= 0.5;
      }
      el.style.fontSize = size + 'pt';
    };

    const cells = wrap.querySelectorAll('[data-fit-max]');
    cells.forEach(fitOne);
    void wrap.offsetHeight;
    await new Promise(r => setTimeout(r, 100));
    // Segunda pasada por si flex redistribuyó tracks después del primer fit
    cells.forEach(fitOne);
    void wrap.offsetHeight;
    await new Promise(r => setTimeout(r, 100));
  } catch (e) { console.warn('autoFit error', e); }

  // 4) Verificar html2pdf
  if (typeof html2pdf !== 'function') {
    document.body.removeChild(wrap);
    document.body.removeChild(overlay);
    alert('No se pudo cargar la librería PDF. Verificá tu conexión a internet y reintentá.');
    return;
  }

  // 5) Generar PDF
  const opt = {
    margin: [8, 5, 5, 10],
    filename: filename,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: esMobile ? 1.5 : 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
    jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait', compress: true },
    pagebreak: { mode: ['css', 'legacy'], before: '.page-break' }
  };

  const msg = document.getElementById('pdf-progress-msg');
  if (msg) msg.textContent = `Renderizando ${numEtiq.toLocaleString()} etiqueta(s)... (puede tardar un minuto)`;

  try {
    await html2pdf().set(opt).from(wrap).save();
    if (msg) msg.textContent = '✓ Descarga iniciada';
    await new Promise(r => setTimeout(r, 700));
  } catch (e) {
    alert('Error generando PDF: ' + (e.message || e) + '\n\nProbá con menos etiquetas (filtrá por escuela).');
  } finally {
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
  }
}

// `grupos` puede ser:
//   - array de { escuela_id, escuela_nombre, escuela_alias, alumnos[] } cuando agrupamos por escuela
//   - un solo grupo con escuela_id=null cuando es modo mezclado
// Cada grupo se separa con page-break en la impresión.
function renderHojaEtiquetas(grupos, cols, incluirObs, escuelasMap, tempCodeHdr, totalAlumnos) {
  const fecha = new Date().toLocaleDateString('es-SV');
  const total = totalAlumnos != null ? totalAlumnos : (Array.isArray(grupos) ? grupos.reduce((s,g)=>s+g.alumnos.length,0) : 0);

  // Columnas FIJAS — cada celda tiene su font-size máximo y un mínimo.
  // El script en la ventana de impresión achica cada celda independiente
  // hasta que entre en su ancho fijo.
  // Orden de columnas: grado · sexo · nombre · centro · tallas
  const renderUnaEtiqueta = (a) => {
    const esc = escuelasMap[a.escuela_id];
    let escAbrev = esc ? (esc.alias || (esc.nombre || '').replace(/^CDE\s+/i, '').slice(0, 30)) : '';
    const nombreCompleto = a.nombre || '';
    const top = a.talla_top_key || '—';
    const bot = a.talla_bottom_key || '—';
    const obs = incluirObs && a.observaciones ? a.observaciones.slice(0, 18) : '';
    const sexIcon = a.sexo === 'F' ? '♀' : (a.sexo === 'M' ? '♂' : '');
    if (obs) escAbrev = escAbrev + ' · ' + obs;
    // Orden visual: SEXO | NOMBRE | (corte) | CENTRO | GRADO | TALLAS (top + bot juntas)
    return `
      <div class="etiqueta">
        <span class="sexo">${sexIcon}</span>
        <span class="nombre" data-fit-max="16" data-fit-min="7">${nombreCompleto}</span>
        <span class="centro" data-fit-max="12" data-fit-min="7">${escAbrev}</span>
        <span class="grado" data-fit-max="14" data-fit-min="9">${a.grado || '—'}</span>
        <span class="tallas" data-fit-max="18" data-fit-min="6">${top}<span class="sep"></span>${bot}</span>
      </div>
    `;
  };

  const bloquesPorGrupo = grupos.map((g, idx) => {
    const tituloGrupo = g.escuela_id ? `${g.escuela_alias ? g.escuela_alias + ' · ' : ''}${g.escuela_nombre} <span class="cnt">(${g.alumnos.length})</span>` : '';
    return `
      ${tituloGrupo ? `<div class="grupo-header">${tituloGrupo}</div>` : ''}
      <div class="grid${idx > 0 ? ' page-break' : ''}">
        ${g.alumnos.map(renderUnaEtiqueta).join('')}
      </div>
    `;
  }).join('');

  const tituloExtra = tempCodeHdr ? `Temporada ${tempCodeHdr}` : '';

  // Sugerencia de nombre de archivo
  const fechaCorta = new Date().toISOString().slice(0,10);
  const filename = `etiquetas_${fechaCorta}.pdf`;

  return `
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Etiquetas${tituloExtra ? ' - ' + tituloExtra : ''}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js"><\/script>
    <style>
      /* Tamaño carta · margen izquierdo amplio para engrapar varias hojas y cortar */
      @page { size: letter; margin: 8mm 5mm 5mm 10mm; }
      body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; margin: 0; padding: 0; }
      /* En pantalla, simulamos el ancho exacto de Letter menos márgenes
         (8.5in - 5mm derecho - 10mm izquierdo ≈ 8.91in - 0.59in ≈ 760px @96dpi)
         para que el auto-fit del nombre mida con el ancho real de impresión. */
      @media screen {
        body { width: 760px; margin: 0 auto; padding: 8mm 5mm 5mm 10mm; box-sizing: border-box; }
      }

      .header {
        text-align: center;
        border-bottom: 1px solid #000;
        padding-bottom: 2px;
        margin-bottom: 3px;
        font-size: 8pt;
      }
      .header strong { font-size: 10pt; }
      .header .info { font-size: 7pt; color: #333; }

      .grupo-header {
        font-weight: bold;
        font-size: 11pt;
        padding: 2mm 0 1mm 0;
        border-bottom: 1pt solid #000;
        margin-bottom: 1mm;
      }
      .grupo-header .cnt { font-weight: normal; color: #666; font-size: 9pt; }

      .grid { display: block; }
      .grid.page-break { page-break-before: always; }

      /* Orden: SEXO | NOMBRE | (gap corte) | CENTRO | GRADO | TALLA-TOP | TALLA-BOT
         Flexbox para que html2canvas lo renderee fielmente (grid daba
         tallas cortadas en el PDF). */
      .etiqueta {
        height: 10mm;
        border-top: 0.5pt dashed #888;
        padding: 0 1mm;
        display: flex;
        align-items: center;
        gap: 2mm;
        overflow: hidden;
        box-sizing: border-box;
        page-break-inside: avoid;
        line-height: 1;
      }
      .etiqueta:last-child { border-bottom: 0.5pt dashed #888; }

      /* Cada celda: overflow hidden + nowrap. El font-size lo ajusta
         autoFitCeldas() en JS para que el texto entre completo. */
      .etiqueta > span {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: clip;
        display: block;
      }

      .etiqueta .sexo {
        flex: 0 0 7mm;
        font-size: 18pt;
        color: #000;
        text-align: center;
      }
      .etiqueta .nombre {
        flex: 0 0 75mm;
        font-size: 16pt;
        font-weight: 700;
      }
      /* Línea de corte: el user corta la etiqueta acá para pegarla
         en 2 filas en la bolsa. */
      .etiqueta .centro {
        flex: 0 1 auto;
        max-width: 40mm;
        padding-left: 6mm;
        margin-left: 2mm;
        border-left: 1.5pt dashed #aaa;
        font-size: 12pt;
        font-weight: 600;
        color: #222;
        font-family: 'Arial Narrow', Arial, sans-serif;
      }
      .etiqueta .grado {
        flex: 0 0 14mm;
        font-weight: 900;
        background: #000;
        color: white;
        font-size: 14pt;
        text-align: center;
        border-radius: 2pt;
        padding: 1pt 0;
      }
      .etiqueta .tallas {
        flex: 1 1 auto;
        min-width: 28mm;
        font-family: 'Courier New', monospace;
        font-size: 18pt;
        font-weight: 900;
        letter-spacing: 0.5pt;
        text-align: left;
      }
      .etiqueta .tallas .sep { display:inline-block; width: 3mm; }

      .etiqueta .obs {
        font-size: 8pt;
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

      <!-- Botonera arriba (no se imprime) — más visible en mobile -->
      <div class="no-print" style="text-align:center;padding:14px;background:#0065CC;color:white;margin-bottom:10px;border-radius:6px">
        <div style="font-size:11pt;margin-bottom:8px">${total.toLocaleString()} etiqueta(s) listas</div>
        <button onclick="descargarPdf()" id="btn-pdf"
          style="padding:12px 28px;font-size:14pt;background:white;color:#0065CC;border:none;border-radius:6px;font-weight:700;cursor:pointer">
          📥 Descargar PDF
        </button>
        <button onclick="window.print()" style="padding:12px 18px;font-size:14pt;background:transparent;color:white;border:1px solid white;border-radius:6px;cursor:pointer;margin-left:6px">
          🖨 Imprimir
        </button>
      </div>

      <div id="contenido-pdf">
        ${bloquesPorGrupo}
      </div>

      <div class="no-print" style="margin-top:20px;text-align:center;padding:10px;background:#F5F7FA;border-radius:6px">
        <button onclick="window.close()" style="padding:8px 16px;font-size:12pt">✕ Cerrar</button>
      </div>

      <script>
        // Auto-fit por celda: cada [data-fit-max] arranca en su máximo
        // y baja 0.5pt hasta entrar en su columna fija.
        function autoFitCeldas() {
          var els = document.querySelectorAll('[data-fit-max]');
          for (var i = 0; i < els.length; i++) {
            var el = els[i];
            var max = parseFloat(el.getAttribute('data-fit-max')) || 14;
            var min = parseFloat(el.getAttribute('data-fit-min')) || 7;
            var size = max;
            el.style.fontSize = size + 'pt';
            while (size > min && el.scrollWidth > el.clientWidth + 1) {
              size -= 0.5;
              el.style.fontSize = size + 'pt';
            }
          }
        }
        // Descarga PDF directa con html2pdf — funciona en desktop y mobile.
        function descargarPdf() {
          var btn = document.getElementById('btn-pdf');
          if (btn) { btn.textContent = '⏳ Generando…'; btn.disabled = true; }
          autoFitCeldas();
          var element = document.getElementById('contenido-pdf');
          var opt = {
            margin: [8, 5, 5, 10],            // top, right, bottom, left (mm)
            filename: '${filename}',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'], before: '.page-break' }
          };
          html2pdf().set(opt).from(element).save().then(function(){
            if (btn) { btn.textContent = '📥 Descargar PDF'; btn.disabled = false; }
          }).catch(function(e){
            if (btn) { btn.textContent = '📥 Descargar PDF'; btn.disabled = false; }
            alert('Error generando PDF: ' + e.message + '\\n\\nUsá el botón "Imprimir" como alternativa.');
          });
        }
        window.addEventListener('load', function() {
          requestAnimationFrame(function() {
            requestAnimationFrame(autoFitCeldas);
          });
        });
        window.addEventListener('beforeprint', autoFitCeldas);
      <\/script>
    </body></html>
  `;
}

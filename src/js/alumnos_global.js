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
  masFiltrosAbierto: false,
  cargado: false,
};

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

async function initAlumnosGlobal() {
  const cont = document.getElementById('alumnos-global-contenido');
  if (!cont) return;
  cont.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando alumnos...</div>';
  
  try {
    const [escuelas, alumnos] = await Promise.all([
      supaFetchAll('escuela'),
      // traer TODOS incluso los sin tallas
      supaFetchAll('alumno', '?activo=eq.true&order=nombre'),
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

// "Sin tallar" significa "le falta al menos una talla" — antes era "sin NINGUNA"
// y mostraba 0 porque casi todos tienen al menos una talla cargada.
function alumnoSinTallas(a) {
  return !a.talla_top_key || !a.talla_bottom_key;
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
  if (c.filtroEscuelas && c.filtroEscuelas.length > 0) {
    const set = new Set(c.filtroEscuelas);
    lista = lista.filter(a => set.has(a.escuela_id));
  } else if (c.filtroEscuela) {
    lista = lista.filter(a => a.escuela_id === c.filtroEscuela);
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
  const sinTallas = c.alumnos.filter(alumnoSinTallas).length;  // ahora = "le falta al menos una"
  const completos = c.alumnos.filter(a => a.estado_top==='empacado' && a.estado_bottom==='empacado').length;
  
  // Compat: si hay filtroEscuela (string, viejo) y filtroEscuelas (array) está vacío, migrar
  if (c.filtroEscuela && (!c.filtroEscuelas || c.filtroEscuelas.length === 0)) {
    c.filtroEscuelas = [c.filtroEscuela];
    c.filtroEscuela = '';
  }
  const escuelasSel = c.filtroEscuelas || [];
  const algunFiltro = (c.busqueda || escuelasSel.length || c.filtroNivel || c.filtroEstado);
  const masFiltrosAbierto = !!c.masFiltrosAbierto;

  // Opciones de escuela que aún NO están seleccionadas
  const escuelasDisponibles = escuelasOpts.filter(e => !escuelasSel.includes(e.id));

  const header = `
    <div class="card" style="padding:10px 12px;margin-bottom:10px">
      <!-- Fila 1: chips de estado con stats integrados -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <button class="btn btn-sm ${!c.filtroEstado && escuelasSel.length===0 && !c.busqueda?'btn-primary':'btn-ghost'}"
          onclick="limpiarFiltros()">👥 Todos (${tot.toLocaleString()})</button>
        <button class="btn btn-sm ${c.filtroEstado==='sin_tallas'?'btn-primary':'btn-ghost'}"
          onclick="aplicarFiltroEstado('sin_tallas')">⚠️ Falta tallar (${sinTallas})</button>
        <button class="btn btn-sm ${c.filtroEstado==='completo'?'btn-primary':'btn-ghost'}"
          onclick="aplicarFiltroEstado('completo')">✅ Completos (${completos})</button>
        <span style="margin-left:auto;color:#888;font-size:11px;align-self:center">Mostrando ${totMostrando.toLocaleString()}</span>
      </div>

      <!-- Fila 2: chips de escuelas seleccionadas + agregar -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
        ${escuelasSel.length === 0 ? `<span style="color:#888;font-size:12px">🏫 Todas las escuelas</span>` : ''}
        ${escuelasSel.map(eid => {
          const e = c.escuelas[eid];
          if (!e) return '';
          return `<span class="btn btn-sm btn-primary" style="cursor:default">🏫 ${e.alias || e.nombre} <span style="margin-left:6px;cursor:pointer" onclick="quitarFiltroEscuela('${eid}')">✕</span></span>`;
        }).join('')}
        ${escuelasDisponibles.length > 0 ? `
          <select onchange="if(this.value){agregarFiltroEscuela(this.value); this.value='';}" style="padding:4px 6px;font-size:12px;border:1px solid var(--borde);border-radius:4px">
            <option value="">+ Agregar escuela…</option>
            ${escuelasDisponibles.map(e => `<option value="${e.id}">${e.alias ? e.alias + ' · ' : ''}${e.nombre}</option>`).join('')}
          </select>
        ` : ''}
      </div>

      <!-- Fila 3: buscar + acciones -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
        <input type="text" placeholder="🔍 Buscar nombre..." value="${c.busqueda}"
          oninput="alumnosGlobalCache.busqueda = this.value; renderAlumnosGlobal()"
          style="flex:1;min-width:140px;padding:6px 10px;border:1px solid var(--borde);border-radius:4px">
        <button class="btn btn-success btn-sm" onclick="abrirNuevoAlumno()">+ Nuevo alumno</button>
        <button class="btn btn-primary btn-sm" onclick="generarEtiquetasDirecto()" title="Genera PDF según los filtros aplicados">🏷 Imprimir etiquetas</button>
        <button class="btn btn-ghost btn-sm" onclick="abrirOpcionesEtiquetas()" title="Cambiar orden de las etiquetas">⚙️</button>
        <button class="btn btn-ghost btn-sm" onclick="initAlumnosGlobal()" title="Refrescar">🔄</button>
      </div>

      <!-- Fila 4: toggle más filtros + limpiar -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-ghost btn-sm" onclick="alumnosGlobalCache.masFiltrosAbierto = !alumnosGlobalCache.masFiltrosAbierto; renderAlumnosGlobal()">
          ⚙️ Más filtros ${masFiltrosAbierto?'▲':'▼'}
        </button>
        ${algunFiltro ? `<button class="btn btn-ghost btn-sm" onclick="limpiarFiltros()">✗ Limpiar</button>` : ''}
      </div>

      <!-- Más filtros (colapsable) -->
      ${masFiltrosAbierto ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid #EEE">
          <select onchange="alumnosGlobalCache.filtroNivel = this.value; renderAlumnosGlobal()" style="padding:6px">
            <option value="">Todo nivel</option>
            <option value="PARV"   ${c.filtroNivel==='PARV'?'selected':''}>PARV</option>
            <option value="BASICA" ${c.filtroNivel==='BASICA'?'selected':''}>BASICA</option>
            <option value="BACH"   ${c.filtroNivel==='BACH'?'selected':''}>BACH</option>
            <option value="OTRO"   ${c.filtroNivel==='OTRO'?'selected':''}>OTRO</option>
          </select>
          <select onchange="alumnosGlobalCache.filtroEstado = this.value; renderAlumnosGlobal()" style="padding:6px">
            <option value="">Estado avanzado…</option>
            <option value="pendiente" ${c.filtroEstado==='pendiente'?'selected':''}>❌❌ Pendiente (sin empacar)</option>
            <option value="parcial"   ${c.filtroEstado==='parcial'?'selected':''}>✅❌ Parcial empacado</option>
            <option value="entregado" ${c.filtroEstado==='entregado'?'selected':''}>🚚 Entregado</option>
          </select>
        </div>
      ` : ''}
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
      <tr style="border-top:1px solid #EEE;background:${bg};cursor:pointer" onclick="editarAlumnoRapido('${a.id}')" title="Clic para editar">
        <td style="padding:4px 8px;font-weight:600">${a.nombre}</td>
        <td style="padding:4px 8px;font-size:11px;color:#666">${esc ? esc.nombre : '-'}</td>
        <td style="padding:4px 8px;font-size:11px">${a.grado || '-'}</td>
        <td style="padding:4px 8px;text-align:center">${a.sexo==='F'?'♀':(a.sexo==='M'?'♂':'-')}</td>
        <td style="padding:4px 8px;text-align:center;font-family:monospace;color:${a.talla_top_key?'var(--azul)':'#c44'}">${a.talla_top_key || '⚠'}</td>
        <td style="padding:4px 8px;text-align:center;font-family:monospace;color:${a.talla_bottom_key?'var(--azul)':'#c44'}">${a.talla_bottom_key || '⚠'}</td>
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
      ${hayMas ? `<div style="padding:10px;text-align:center;color:#888;font-size:12px">... ${lista.length-500} alumnos más. Usá filtros para reducir.</div>` : ''}
    </div>
  `;
}

function limpiarFiltros() {
  alumnosGlobalCache.busqueda = '';
  alumnosGlobalCache.filtroEscuela = '';
  alumnosGlobalCache.filtroEscuelas = [];
  alumnosGlobalCache.filtroNivel = '';
  alumnosGlobalCache.filtroTemporada = '';
  alumnosGlobalCache.filtroEstado = '';
  renderAlumnosGlobal();
}

// Helpers para los chips de filtro rápido
function aplicarFiltroEstado(estado) {
  alumnosGlobalCache.filtroEstado = (alumnosGlobalCache.filtroEstado === estado) ? '' : estado;
  renderAlumnosGlobal();
}
// Compat: setea una sola escuela (limpia las demás)
function aplicarFiltroEscuela(escuelaId) {
  alumnosGlobalCache.filtroEscuela = '';
  alumnosGlobalCache.filtroEscuelas = escuelaId ? [escuelaId] : [];
  renderAlumnosGlobal();
}
// Nuevos: multi-escuela
function agregarFiltroEscuela(escuelaId) {
  if (!escuelaId) return;
  const arr = alumnosGlobalCache.filtroEscuelas || [];
  if (!arr.includes(escuelaId)) arr.push(escuelaId);
  alumnosGlobalCache.filtroEscuelas = arr;
  alumnosGlobalCache.filtroEscuela = '';
  renderAlumnosGlobal();
}
function quitarFiltroEscuela(escuelaId) {
  alumnosGlobalCache.filtroEscuelas = (alumnosGlobalCache.filtroEscuelas || []).filter(id => id !== escuelaId);
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

// Editar alumno desde vista global (path completo a Escuela > Tallaje)
// Mantenido por compatibilidad — la vista global ahora usa editarAlumnoRapido.
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

// Genera el PDF de etiquetas DIRECTO con los filtros aplicados en la página
// y el orden guardado en localStorage. Sin popup.
function generarEtiquetasDirecto() {
  _ejecutarGenerarEtiquetas(etOrdenGuardado(), { soloEmpacados: false, incluirObs: false });
}

// Abre el modal SOLO con orden + opciones (sin filtros — esos van en la página)
function abrirOpcionesEtiquetas() { abrirModalEtiquetas(); }
// Alias por compat
function imprimirEtiquetasConFiltros() { generarEtiquetasDirecto(); }

// Campos disponibles para el orden personalizado
const ET_ORDEN_OPCIONES = [
  { val: '',         label: '— (sin más)' },
  { val: 'escuela',  label: '🏫 Escuela' },
  { val: 'sexo_fm',  label: '♀ → ♂ (Femenino primero)' },
  { val: 'sexo_mf',  label: '♂ → ♀ (Masculino primero)' },
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
  if (c.filtroNivel)  partes.push(`nivel ${c.filtroNivel}`);
  if (c.filtroEstado && c.filtroEstado !== 'sin_tallas') partes.push(`estado ${c.filtroEstado}`);
  if (c.busqueda)     partes.push(`búsqueda "${c.busqueda}"`);
  return `
    <div style="font-size:12px;color:#555"><strong>Filtros activos:</strong> ${partes.join(' · ')}</div>
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

// Núcleo de generación de etiquetas. Usa los filtros vigentes en la página.
// Multi-escuela: si filtroEscuelas tiene items, filtra por esos; si está vacío, todas.
function _ejecutarGenerarEtiquetas(ordenSeleccion, { soloEmpacados = false, incluirObs = false } = {}) {
  const c = alumnosGlobalCache;
  const tempActiva = (registroCache.temporadas || []).find(t => t.estado === 'activa');
  const tempId = tempActiva ? tempActiva.id : '';
  const columnas = 1; // hardcoded — tira tipo Excel
  ordenSeleccion = (ordenSeleccion || []).filter(Boolean);
  if (ordenSeleccion.length === 0) ordenSeleccion = [...ET_ORDEN_DEFAULT];

  // Multi-escuela desde la página
  const escuelasSel = (c.filtroEscuelas && c.filtroEscuelas.length > 0)
    ? new Set(c.filtroEscuelas)
    : (c.filtroEscuela ? new Set([c.filtroEscuela]) : null);

  let lista = c.alumnos.filter(a => {
    if (!a.talla_top_key && !a.talla_bottom_key) return false;
    if (tempId && a.temporada_id !== tempId) return false;
    if (escuelasSel && !escuelasSel.has(a.escuela_id)) return false;
    if (c.filtroNivel && a.nivel !== c.filtroNivel) return false;
    if (c.filtroEstado === 'completo'  && !(a.estado_top==='empacado' && a.estado_bottom==='empacado')) return false;
    if (c.filtroEstado === 'entregado' && !(a.estado_top==='entregado' && a.estado_bottom==='entregado')) return false;
    if (c.filtroEstado === 'pendiente' && !(a.estado_top==='pendiente' && a.estado_bottom==='pendiente')) return false;
    if (c.filtroEstado === 'parcial') {
      const parcial = (a.estado_top==='empacado' && a.estado_bottom!=='empacado') || (a.estado_bottom==='empacado' && a.estado_top!=='empacado');
      if (!parcial) return false;
    }
    if (c.busqueda) {
      const q = c.busqueda.toLowerCase().trim();
      if (!(a.nombre||'').toLowerCase().includes(q)) return false;
    }
    if (soloEmpacados) {
      const algEmp = a.estado_top === 'empacado' || a.estado_bottom === 'empacado';
      if (!algEmp) return false;
    }
    return true;
  });

  if (lista.length === 0) {
    alert('No hay alumnos para etiquetar con esos filtros.\nAsegurate de que las escuelas seleccionadas tengan alumnos con tallas cargadas.');
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
  abrirVentanaImpresion(html);
}

// `grupos` puede ser:
//   - array de { escuela_id, escuela_nombre, escuela_alias, alumnos[] } cuando agrupamos por escuela
//   - un solo grupo con escuela_id=null cuando es modo mezclado
// Cada grupo se separa con page-break en la impresión.
function renderHojaEtiquetas(grupos, cols, incluirObs, escuelasMap, tempCodeHdr, totalAlumnos) {
  const fecha = new Date().toLocaleDateString('es-SV');
  const total = totalAlumnos != null ? totalAlumnos : (Array.isArray(grupos) ? grupos.reduce((s,g)=>s+g.alumnos.length,0) : 0);

  const renderUnaEtiqueta = (a) => {
    const esc = escuelasMap[a.escuela_id];
    const escAbrev = esc ? (esc.alias || (esc.nombre || '').replace(/^CDE\s+/i, '').slice(0, 22)) : '';
    const nombreCorto = a.nombre.length > 38 ? a.nombre.slice(0, 38) + '…' : a.nombre;
    const top = a.talla_top_key || '—';
    const bot = a.talla_bottom_key || '—';
    const obs = incluirObs && a.observaciones ? a.observaciones.slice(0, 18) : '';
    const sexIcon = a.sexo === 'F' ? '♀' : (a.sexo === 'M' ? '♂' : '');
    return `
      <div class="etiqueta">
        <span class="grado">${a.grado || '—'}</span>
        <span class="nombre">${nombreCorto}</span>
        <span class="centro">${escAbrev}</span>
        <span class="sexo">${sexIcon}</span>
        <span class="tallas"><b>${top}</b>&nbsp;&nbsp;<b>${bot}</b></span>
        ${obs ? `<span class="obs">${obs}</span>` : ''}
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

  return `
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Etiquetas${tituloExtra ? ' - ' + tituloExtra : ''}</title>
    <style>
      /* Tamaño carta · margen izquierdo amplio para engrapar varias hojas y cortar */
      @page { size: letter; margin: 8mm 5mm 5mm 10mm; }
      body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; margin: 0; padding: 0; }

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

      .grid {
        display: grid;
        grid-template-columns: repeat(${cols}, 1fr);
        gap: 0;
      }
      .grid.page-break { page-break-before: always; }

      /* Cada etiqueta es una tira de ~10mm = 28pt de alto. Las fuentes
         están al máximo razonable: ~18-20pt para info clave. */
      .etiqueta {
        height: 10mm;
        border-top: 0.5pt dashed #888;
        padding: 0 2mm;
        display: flex;
        align-items: center;
        gap: 3mm;
        overflow: hidden;
        box-sizing: border-box;
        page-break-inside: avoid;
        line-height: 1;
      }
      .etiqueta:last-child { border-bottom: 0.5pt dashed #888; }

      .etiqueta .sexo {
        font-size: 18pt;
        color: #000;
        min-width: 16pt;
        text-align: center;
        flex-shrink: 0;
      }

      .etiqueta .grado {
        font-weight: 900;
        background: #000;
        color: white;
        padding: 1.5pt 5pt;
        font-size: 14pt;
        min-width: 28pt;
        text-align: center;
        border-radius: 2pt;
        flex-shrink: 0;
      }

      .etiqueta .nombre {
        flex: 2.2;
        font-size: 16pt;
        font-weight: 700;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .etiqueta .centro {
        flex: 1;
        font-size: 12pt;
        font-weight: 600;
        color: #222;
        font-family: 'Arial Narrow', Arial, sans-serif;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .etiqueta .tallas {
        font-family: 'Courier New', monospace;
        font-size: 18pt;
        font-weight: 900;
        white-space: nowrap;
        flex-shrink: 0;
        letter-spacing: 0.5pt;
      }
      .etiqueta .tallas b { color: #000; }

      .etiqueta .obs {
        font-size: 8pt;
        color: #444;
        font-style: italic;
        flex-shrink: 0;
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

      ${bloquesPorGrupo}

      <div class="no-print" style="margin-top:20px;text-align:center;padding:10px;background:#F5F7FA;border-radius:6px">
        <div style="font-size:12pt;margin-bottom:8px;color:#333">
          💡 En el diálogo elegí <strong>"Guardar como PDF"</strong> como destino para descargar el archivo.
        </div>
        <button onclick="window.print()" style="padding:10px 20px;font-size:14pt">🖨 Imprimir / PDF</button>
        <button onclick="window.close()" style="padding:10px 20px;font-size:14pt">✕ Cerrar</button>
      </div>
      <script>
        // Disparar el diálogo de impresión/guardar PDF automáticamente al cargar.
        // El user puede elegir "Guardar como PDF" en el destino para descargar.
        window.addEventListener('load', function() {
          setTimeout(function(){ window.print(); }, 400);
        });
      </script>
    </body></html>
  `;
}

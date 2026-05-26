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
  // Modo empaque (se activa desde Bodega → Empacar a alumnos)
  modoEmpaque: false,
  empPrendas: [],              // ['CAMISA','PANTALON'] — solo se ven alumnos con alguna de estas pendientes
  empMarcadosTop: null,        // Set<alumno_id> — piezas top a empacar
  empMarcadosBot: null,        // Set<alumno_id> — piezas bottom a empacar
  empSupply: null,             // { stockMap: Map, poolMap: Map } — cargado al activar modo
  empPiezasExtra: null,        // Set<"alumno_id|top"|"alumno_id|bottom"> — piezas re-elegibles tras desempacar
};

// Carga stock + pool para el modo empaque. Se llama desde bodega cuando se
// activa el modo (selector / acaparados / pool).
async function cargarSupplyEmpaque() {
  try {
    const [stock, pool] = await Promise.all([
      supaFetchAll('vw_bodega_stock', '?select=nombre_prenda,cod_prenda,talla_key,stock_actual'),
      supaFetchAll('escuela_acaparado', '?select=escuela_id,nombre_prenda,talla_key,cantidad_acaparada,cantidad_consumida'),
    ]);
    const stockMap = new Map();
    for (const s of stock) {
      const p = s.nombre_prenda || (typeof prendaCanon === 'function' ? prendaCanon(s.cod_prenda) : s.cod_prenda);
      if (!p || !s.talla_key) continue;
      stockMap.set(p + '|' + s.talla_key, Number(s.stock_actual) || 0);
    }
    const poolMap = new Map();
    for (const p of pool) {
      const d = Math.max(0, (Number(p.cantidad_acaparada)||0) - (Number(p.cantidad_consumida)||0));
      if (d <= 0) continue;
      const k = p.escuela_id + '|' + p.nombre_prenda + '|' + p.talla_key;
      poolMap.set(k, (poolMap.get(k) || 0) + d);
    }
    alumnosGlobalCache.empSupply = { stockMap, poolMap };
  } catch(e) {
    console.warn('cargarSupplyEmpaque:', e.message);
    alumnosGlobalCache.empSupply = { stockMap: new Map(), poolMap: new Map() };
  }
}

// Simula consumo de las piezas YA marcadas y devuelve el remanente.
// Para cada fila, se compara contra este remanente para saber si la pieza
// puede marcarse (sin overload de stock).
// Helper: talla a usar para una pieza al empacar. Si el usuario eligió talla
// alterna (vía mini-modal en la celda), se usa esa; sino la pedida.
function _getTallaEmpaque(a, pieza) {
  const c = alumnosGlobalCache;
  if (c && c.empTallaAlt) {
    const alt = c.empTallaAlt.get(a.id + '|' + pieza);
    if (alt) return alt;
  }
  return pieza === 'top' ? a.talla_top_key : a.talla_bottom_key;
}

function _supplyRestante() {
  const c = alumnosGlobalCache;
  if (!c.empSupply) return null;
  const poolRest = new Map(c.empSupply.poolMap);
  const stockRest = new Map(c.empSupply.stockMap);
  const consumir = (escId, prenda, talla) => {
    if (!prenda || !talla) return;
    const kPool = escId + '|' + prenda + '|' + talla;
    const pp = poolRest.get(kPool) || 0;
    if (pp > 0) { poolRest.set(kPool, pp - 1); return; }
    const kStock = prenda + '|' + talla;
    const ss = stockRest.get(kStock) || 0;
    if (ss > 0) { stockRest.set(kStock, ss - 1); return; }
    // Si no hay ni pool ni stock, igual descontamos virtualmente para que
    // se note el "déficit" (poolRest queda en 0, stockRest queda en 0).
  };
  const byId = new Map();
  for (const a of c.alumnos) byId.set(a.id, a);
  for (const id of (c.empMarcadosTop || new Set())) {
    const a = byId.get(id); if (!a) continue;
    consumir(a.escuela_id, a.prenda_top, _getTallaEmpaque(a, 'top'));
  }
  for (const id of (c.empMarcadosBot || new Set())) {
    const a = byId.get(id); if (!a) continue;
    consumir(a.escuela_id, a.prenda_bottom, _getTallaEmpaque(a, 'bottom'));
  }
  return { poolRest, stockRest };
}

// ¿Hay suministro restante (pool de la escuela o stock libre) para esa pieza?
// Si la pieza ya tiene talla alterna asignada, chequea esa; sino la pedida.
function _piezaConSuministro(a, pieza, restante) {
  if (!restante) return true;
  const prenda = pieza === 'top' ? a.prenda_top : a.prenda_bottom;
  const talla  = _getTallaEmpaque(a, pieza);
  if (!prenda || !talla) return false;
  const kPool = a.escuela_id + '|' + prenda + '|' + talla;
  const kStock = prenda + '|' + talla;
  return (restante.poolRest.get(kPool) || 0) > 0
      || (restante.stockRest.get(kStock) || 0) > 0;
}

// Devuelve [{talla, stock, pool, total}] para una prenda en una escuela.
// Usado por el modal de selección de talla alterna.
function _tallasDisponiblesParaEmpaque(prenda, escuelaId, restante) {
  const c = alumnosGlobalCache;
  if (!c.empSupply) return [];
  const rest = restante || _supplyRestante();
  const sMap = rest ? rest.stockRest : c.empSupply.stockMap;
  const pMap = rest ? rest.poolRest : c.empSupply.poolMap;
  const tallas = new Map();
  for (const [k, qty] of sMap.entries()) {
    const idx = k.indexOf('|');
    if (idx < 0) continue;
    const p = k.slice(0, idx);
    const t = k.slice(idx + 1);
    if (p !== prenda || qty <= 0) continue;
    if (!tallas.has(t)) tallas.set(t, { stock: 0, pool: 0 });
    tallas.get(t).stock = qty;
  }
  for (const [k, qty] of pMap.entries()) {
    const parts = k.split('|');
    if (parts.length < 3 || qty <= 0) continue;
    const escId = parts[0];
    const p = parts[1];
    const t = parts.slice(2).join('|');
    if (escId !== escuelaId || p !== prenda) continue;
    if (!tallas.has(t)) tallas.set(t, { stock: 0, pool: 0 });
    tallas.get(t).pool = qty;
  }
  return [...tallas.entries()]
    .map(([t, v]) => ({ talla: t, stock: v.stock, pool: v.pool, total: v.stock + v.pool }))
    .filter(e => e.total > 0)
    .sort((a, b) => a.talla.localeCompare(b.talla, 'es', { numeric: true }));
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

async function initAlumnosGlobal() {
  const cont = document.getElementById('alumnos-global-contenido');
  if (!cont) return;
  cont.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando alumnos...</div>';
  
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

  // Modo empaque - pool > combos > prendas (en orden de precedencia)
  let lista = c.alumnos;
  if (c.modoEmpaque && Array.isArray(c.empPoolEntries) && c.empPoolEntries.length > 0) {
    lista = lista.filter(a => c.empPoolEntries.some(p => {
      if (a.escuela_id !== p.escuela_id) return false;
      const topMatch = a.prenda_top === p.prenda && a.talla_top_key === p.talla
        && a.estado_top !== 'empacado' && a.estado_top !== 'entregado';
      const botMatch = a.prenda_bottom === p.prenda && a.talla_bottom_key === p.talla
        && a.estado_bottom !== 'empacado' && a.estado_bottom !== 'entregado';
      return topMatch || botMatch;
    }));
  } else if (c.modoEmpaque && Array.isArray(c.empCombos) && c.empCombos.length > 0) {
    lista = lista.filter(a => c.empCombos.some(combo => {
      if (a.nivel !== combo.nivel || a.sexo !== combo.sexo) return false;
      const topMatch = combo.prenda_top && a.prenda_top === combo.prenda_top && a.talla_top_key
        && a.estado_top !== 'empacado' && a.estado_top !== 'entregado';
      const botMatch = combo.prenda_bottom && a.prenda_bottom === combo.prenda_bottom && a.talla_bottom_key
        && a.estado_bottom !== 'empacado' && a.estado_bottom !== 'entregado';
      return topMatch || botMatch;
    }));
  } else if (c.modoEmpaque && Array.isArray(c.empPrendas) && c.empPrendas.length > 0) {
    const setP = new Set(c.empPrendas);
    lista = lista.filter(a => {
      const topMatch = a.prenda_top && setP.has(a.prenda_top) && a.talla_top_key
        && a.estado_top !== 'empacado' && a.estado_top !== 'entregado';
      const botMatch = a.prenda_bottom && setP.has(a.prenda_bottom) && a.talla_bottom_key
        && a.estado_bottom !== 'empacado' && a.estado_bottom !== 'entregado';
      return topMatch || botMatch;
    });
  }

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
          const label = e.alias || e.nombre;
          const sinAlias = !e.alias;
          return `<span class="btn btn-sm btn-primary" style="cursor:default">🏫 ${label}${sinAlias ? ' ⚠️' : ''} <span style="margin-left:4px;cursor:pointer;opacity:0.85" onclick="editarEscuela('${eid}')" title="Editar escuela (alias, datos)">✏️</span> <span style="margin-left:2px;cursor:pointer" onclick="quitarFiltroEscuela('${eid}')" title="Quitar filtro">✕</span></span>`;
        }).join('')}
        ${escuelasDisponibles.length > 0 ? `
          <select onchange="if(this.value){agregarFiltroEscuela(this.value); this.value='';}" style="padding:4px 6px;font-size:12px;border:1px solid var(--borde);border-radius:4px">
            <option value="">+ Agregar escuela…</option>
            ${escuelasDisponibles.map(e => `<option value="${e.id}">${e.alias ? e.alias + ' · ' : ''}${e.nombre}</option>`).join('')}
          </select>
        ` : ''}
        <button class="btn btn-ghost btn-sm" onclick="nuevaEscuela()" title="Crear escuela nueva (datos + contrato + tela)">🏫 + Nueva escuela</button>
      </div>

      <!-- Fila 3: buscar + acciones -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
        <input type="text" placeholder="🔍 Buscar nombre..." value="${c.busqueda}"
          oninput="alumnosGlobalCache.busqueda = this.value; scheduleRenderAlumnos()"
          style="flex:1;min-width:140px;padding:6px 10px;border:1px solid var(--borde);border-radius:4px">
        <button class="btn btn-success btn-sm" onclick="abrirNuevoAlumno()">+ Nuevo alumno</button>
        <button class="btn btn-primary btn-sm" onclick="generarEtiquetasDirecto()" title="Genera PDF con los filtros y orden actuales">🏷 Imprimir etiquetas</button>
        <button class="btn btn-ghost btn-sm" onclick="initAlumnosGlobal()" title="Refrescar">🔄</button>
      </div>

      <!-- Fila 4: toggle más filtros + limpiar -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-ghost btn-sm" onclick="alumnosGlobalCache.masFiltrosAbierto = !alumnosGlobalCache.masFiltrosAbierto; renderAlumnosGlobal()">
          ⚙️ Más filtros / Orden ${masFiltrosAbierto?'▲':'▼'}
        </button>
        ${algunFiltro ? `<button class="btn btn-ghost btn-sm" onclick="limpiarFiltros()">✗ Limpiar</button>` : ''}
      </div>

      <!-- Más filtros (colapsable) -->
      ${masFiltrosAbierto ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #EEE">
          <div style="font-size:11px;font-weight:600;color:#666;margin-bottom:4px">FILTROS AVANZADOS</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px;margin-bottom:10px">
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

        <div style="font-size:11px;font-weight:600;color:#666;margin:8px 0 4px 0;display:flex;justify-content:space-between;align-items:center">
          <span>ORDEN DE LA LISTA (Y DEL PDF DE ETIQUETAS)</span>
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
      ` : ''}
    </div>
  `;
  
  // Banner modo empaque (entre header y tabla)
  const empaqueBanner = c.modoEmpaque ? renderEmpaqueBanner(lista) : '';

  if (lista.length === 0) {
    cont.innerHTML = header + empaqueBanner + '<div class="alert alert-info">Sin resultados.</div>';
    return;
  }

  // Tabla
  const visible = lista.slice(0, 500); // cap
  const hayMas = lista.length > 500;

  const iconEstado = (e) => e === 'empacado' ? '✅' : (e === 'entregado' ? '🚚' : (e === 'reservado' ? '⏳' : '⬜'));

  // En modo empaque: dos sets de marcados (top + bot) + cálculo de stock
  if (c.modoEmpaque && !(c.empMarcadosTop instanceof Set)) c.empMarcadosTop = new Set();
  if (c.modoEmpaque && !(c.empMarcadosBot instanceof Set)) c.empMarcadosBot = new Set();
  const setP = c.modoEmpaque ? new Set(c.empPrendas || []) : null;
  // Restante de suministro tras todas las piezas marcadas
  const restante = c.modoEmpaque ? _supplyRestante() : null;

  const filas = visible.map(a => {
    const esc = c.escuelas[a.escuela_id];
    const sinTallas = alumnoSinTallas(a);
    const bg = sinTallas ? '#FFF4F0' : 'white';

    // En modo empaque destacamos las piezas que SE VAN A EMPACAR (verde) vs las que no entran.
    // Una pieza es elegible si:
    //  (a) su prenda está en el filtro empPrendas, O
    //  (b) está en empPiezasExtra (re-elegible tras un desempacar inline)
    const extra = c.empPiezasExtra;
    const topExtra = extra && extra.has(a.id + '|top');
    const botExtra = extra && extra.has(a.id + '|bottom');
    const topElig = (c.modoEmpaque && a.prenda_top && a.talla_top_key
      && a.estado_top !== 'empacado' && a.estado_top !== 'entregado'
      && (topExtra || (setP && setP.has(a.prenda_top))));
    const botElig = (c.modoEmpaque && a.prenda_bottom && a.talla_bottom_key
      && a.estado_bottom !== 'empacado' && a.estado_bottom !== 'entregado'
      && (botExtra || (setP && setP.has(a.prenda_bottom))));
    const topStyle = topElig ? 'background:#E0F4E5;color:var(--verde);font-weight:700' : `color:${a.talla_top_key?'var(--azul)':'#c44'}`;
    const botStyle = botElig ? 'background:#E0F4E5;color:var(--verde);font-weight:700' : `color:${a.talla_bottom_key?'var(--azul)':'#c44'}`;

    // Cálculo de habilitación por pieza
    let topCheck = '', botCheck = '';
    if (c.modoEmpaque) {
      const topMarcado = c.empMarcadosTop.has(a.id);
      const botMarcado = c.empMarcadosBot.has(a.id);
      const topConSupply = _piezaConSuministro(a, 'top', restante);
      const botConSupply = _piezaConSuministro(a, 'bottom', restante);
      // Si ya está marcado, debe poder desmarcarse → enabled.
      // Si no está marcado, enabled solo si elig + hay suministro restante.
      const topPuede = topMarcado || (topElig && topConSupply);
      const botPuede = botMarcado || (botElig && botConSupply);
      // Tooltip: razón real del disabled (ayuda mucho cuando el user no sabe por qué)
      const razonDisabled = (pieza, eligible, conSupply, prenda) => {
        if (eligible && conSupply) return '';
        const partes = [];
        if (!eligible) {
          if (!prenda) partes.push('alumno sin prenda definida');
          else partes.push(`prenda "${prenda}" no está en el filtro del empaque actual`);
        }
        if (eligible && !conSupply) partes.push('sin stock libre ni pool disponible');
        return partes.join(' · ');
      };
      const topTitle = topMarcado ? 'Empacar top (marcado)'
        : (topPuede ? 'Empacar top' : razonDisabled('top', topElig, topConSupply, a.prenda_top));
      const botTitle = botMarcado ? 'Empacar bottom (marcado)'
        : (botPuede ? 'Empacar bottom' : razonDisabled('bottom', botElig, botConSupply, a.prenda_bottom));
      // El input solo se renderiza si la pieza es elegible (top en filtro de prendas).
      // Si NO es elegible pero la pieza ya está empacada/entregada → ✓ clickeable
      // para DESEMPACAR (vuelve a stock libre o pool de la escuela).
      // Si NO es elegible y no está empacada → raya.
      const topEmpacado = a.estado_top === 'empacado' || a.estado_top === 'entregado';
      const botEmpacado = a.estado_bottom === 'empacado' || a.estado_bottom === 'entregado';
      // Renderizar: si está empacada/entregada → ✓ verde (desempacar);
      // si es elegible (en filtro + talla + pendiente) → checkbox marcable;
      // si la prenda existe pero no está en el filtro o sin stock → checkbox disabled con tooltip claro.
      const renderCheck = (pieza, prenda, talla, estado, marcado, puede, eligible, conSupply, empacado, title) => {
        if (empacado && prenda && talla) {
          // Tap target ≥ 40×40 (Apple/Google rec.). Span es 36px visible + td le suma
          // padding para alcanzar el área cómoda. Botón nativo para mejor handling en móvil.
          return `<button type="button"
            style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;min-width:36px;border-radius:50%;background:#E0F4E5;color:var(--verde);font-weight:700;font-size:18px;cursor:pointer;border:2px solid var(--verde);padding:0;line-height:1;-webkit-tap-highlight-color:rgba(40,167,69,0.3)"
            title="Pieza ${estado}. Tocá para desempacar (vuelve al stock de bodega)."
            onclick="desempacarPiezaDesdeLista('${a.id}','${pieza}')">✓</button>`;
        }
        if (!prenda || !talla) return '<span style="color:#ccc" title="Sin prenda/talla definida">—</span>';
        return `<input type="checkbox" ${marcado?'checked':''} ${puede?'':'disabled'}
                onchange="toggleMarcarPieza('${a.id}','${pieza}',this.checked)"
                title="${title}"
                style="cursor:${puede?'pointer':'not-allowed'};opacity:${puede?1:0.4};width:22px;height:22px">`;
      };
      topCheck = renderCheck('top', a.prenda_top, a.talla_top_key, a.estado_top,
        topMarcado, topPuede, topElig, topConSupply, topEmpacado, topTitle);
      botCheck = renderCheck('bottom', a.prenda_bottom, a.talla_bottom_key, a.estado_bottom,
        botMarcado, botPuede, botElig, botConSupply, botEmpacado, botTitle);
    }

    const checkCell = c.modoEmpaque
      ? `<td style="padding:6px 6px;text-align:center" onclick="event.stopPropagation()">${topCheck}</td>
         <td style="padding:6px 6px;text-align:center" onclick="event.stopPropagation()">${botCheck}</td>`
      : '';

    // Render de celda Top/Bot: muestra talla pedida, alterna persistida en BD,
    // o alterna pendiente en cache (c.empTallaAlt). Cuando hay alterna, se ve
    // "F7 F6tachado" sobre fondo amarillo con outline punteado. La celda es
    // clickeable solo si la pieza es elegible para empacar (modo empaque +
    // elig + no empacada + tiene talla pedida) — abre el selector de talla.
    const renderCellTalla = (esTop) => {
      const tallaPedida = esTop ? a.talla_top_key : a.talla_bottom_key;
      const persistida  = esTop ? a.talla_empacada_top : a.talla_empacada_bot;
      const altCache    = c.modoEmpaque && c.empTallaAlt
        ? c.empTallaAlt.get(a.id + '|' + (esTop ? 'top' : 'bottom')) : null;
      const tallaShow = altCache || persistida || tallaPedida;
      const esAlterna = !!(altCache || persistida) && tallaShow && tallaShow !== tallaPedida;
      const style = esTop ? topStyle : botStyle;
      const elig  = esTop ? topElig  : botElig;
      const empacado = esTop
        ? (a.estado_top === 'empacado'    || a.estado_top === 'entregado')
        : (a.estado_bottom === 'empacado' || a.estado_bottom === 'entregado');
      const clickeable = c.modoEmpaque && elig && !empacado && !!tallaPedida;
      const display = !tallaPedida ? '⚠'
        : esAlterna ? `${tallaShow}<span style="font-size:9px;color:#888;text-decoration:line-through;margin-left:3px;font-weight:400">${tallaPedida}</span>`
        : tallaShow;
      const baseStyle = `padding:4px 8px;text-align:center;font-family:monospace;${style}${esAlterna?';background:#FFF4CC;outline:1px dashed #C90;outline-offset:-2px':''}`;
      if (clickeable) {
        return `<td style="${baseStyle};cursor:pointer;text-decoration:underline dotted" onclick="event.stopPropagation();abrirSelectorTallaAlt('${a.id}','${esTop?'top':'bottom'}')" title="Tocá para empacar con otra talla (default: ${tallaPedida})">${display}</td>`;
      }
      return `<td style="${baseStyle}">${display}</td>`;
    };

    return `
      <tr style="border-top:1px solid #EEE;background:${bg};cursor:pointer" onclick="editarAlumnoRapido('${a.id}')" title="Clic para editar">
        ${checkCell}
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

  const checkHeader = c.modoEmpaque
    ? `<th style="padding:6px 8px;text-align:center;width:30px">
         <input type="checkbox" onchange="marcarTodosEmpaque('top', this.checked)" title="Marcar/desmarcar todos los TOP visibles (hasta donde alcance el stock)">
       </th>
       <th style="padding:6px 8px;text-align:center;width:30px">
         <input type="checkbox" onchange="marcarTodosEmpaque('bot', this.checked)" title="Marcar/desmarcar todos los BOTTOM visibles (hasta donde alcance el stock)">
       </th>`
    : '';

  cont.innerHTML = header + empaqueBanner + `
    <div class="card" style="padding:0;overflow:auto;max-height:70vh">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead style="position:sticky;top:0;background:#F5F7FA;z-index:1">
          <tr>
            ${checkHeader}
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

function renderEmpaqueBanner(listaVisible) {
  const c = alumnosGlobalCache;
  if (!c.empMarcadosTop) c.empMarcadosTop = new Set();
  if (!c.empMarcadosBot) c.empMarcadosBot = new Set();
  const setP = new Set(c.empPrendas || []);
  const piezasTop = c.empMarcadosTop.size;
  const piezasBot = c.empMarcadosBot.size;
  const piezasAEmpacar = piezasTop + piezasBot;
  // alumnos únicos involucrados
  const alumnosUnicos = new Set([...c.empMarcadosTop, ...c.empMarcadosBot]).size;
  const marcados = alumnosUnicos;
  // Bulk por grado+sexo (visible solo cuando hay alumnos en la lista)
  const gradoSexoMap = new Map();  // "grado|sexo" → count
  for (const a of listaVisible) {
    if (!a.grado || !a.sexo) continue;
    const k = a.grado + '|' + a.sexo;
    gradoSexoMap.set(k, (gradoSexoMap.get(k) || 0) + 1);
  }
  const grupos = [...gradoSexoMap.entries()]
    .sort((a,b) => a[0].localeCompare(b[0], 'es', { numeric:true }))
    .map(([k, n]) => {
      const [g, s] = k.split('|');
      const ico = s === 'F' ? '♀' : (s === 'M' ? '♂' : '');
      return `<button class="btn btn-ghost btn-sm" onclick="marcarBulkGradoSexo('${g.replace(/'/g,"\\'")}','${s}')"
                title="Marcar las piezas elegibles de ${ico} ${g} (top y bot, hasta donde alcance el stock)"
                style="font-size:11px;padding:3px 8px">📦 ${g} ${ico} (${n})</button>`;
    }).join('');

  // Etiquetar combinaciones / pool de manera amigable
  const NIVEL_LBL = { PARV:'Parvularia', BASICA:'Básica', BACH:'Bach', OTRO:'Otro' };
  const SEXO_LBL = { F:'♀', M:'♂' };
  const combos = c.empCombos || [];
  const poolEntries = c.empPoolEntries || [];
  let lblCombos;
  if (poolEntries.length > 0) {
    const piezas = poolEntries.reduce((s,p) => s + 1, 0);
    lblCombos = `Pool acaparado: ${piezas} entrada(s) — ${[...new Set(poolEntries.map(p=>p.prenda))].join(', ')}`;
  } else if (combos.length > 0) {
    lblCombos = combos.map(co => {
      const piezas = [co.prenda_top, co.prenda_bottom].filter(Boolean).join('+');
      return `${NIVEL_LBL[co.nivel]||co.nivel} ${SEXO_LBL[co.sexo]||co.sexo} (${piezas})`;
    }).join(' · ');
  } else {
    lblCombos = (c.empPrendas||[]).join(', ') || '—';
  }
  // Detectar combinaciones SIN suministro disponible (todas las prendas+tallas
  // visibles donde stock + pool = 0). Útil para aclarar por qué los checkboxes
  // están bloqueados.
  let avisoSinStock = '';
  if (c.empSupply) {
    const sinStock = new Map();  // "prenda|talla" → { necesita: n, escuelas: Set }
    const piezaSinSupply = (a, pieza) => {
      const prenda = pieza === 'top' ? a.prenda_top : a.prenda_bottom;
      const talla  = pieza === 'top' ? a.talla_top_key : a.talla_bottom_key;
      const estado = pieza === 'top' ? a.estado_top : a.estado_bottom;
      if (!prenda || !talla) return;
      if (estado === 'empacado' || estado === 'entregado') return;
      if (setP && !setP.has(prenda)) return;  // no está en el filtro
      const kPool = a.escuela_id + '|' + prenda + '|' + talla;
      const kStock = prenda + '|' + talla;
      const pool = c.empSupply.poolMap.get(kPool) || 0;
      const stock = c.empSupply.stockMap.get(kStock) || 0;
      if (pool > 0 || stock > 0) return;
      const k = prenda + '|' + talla;
      if (!sinStock.has(k)) sinStock.set(k, { necesita: 0, escuelas: new Set() });
      const o = sinStock.get(k);
      o.necesita++;
      o.escuelas.add(a.escuela_id);
    };
    for (const a of listaVisible) {
      piezaSinSupply(a, 'top');
      piezaSinSupply(a, 'bottom');
    }
    if (sinStock.size > 0) {
      const filas = [...sinStock.entries()].slice(0, 5).map(([k, o]) => {
        const [p, t] = k.split('|');
        return `<li><strong>${p} ${t}</strong>: ${o.necesita} pieza(s) en ${o.escuelas.size} escuela(s)</li>`;
      }).join('');
      const mas = sinStock.size > 5 ? `<li style="color:#888">…y ${sinStock.size - 5} más</li>` : '';
      avisoSinStock = `
        <div style="width:100%;background:#FFEEE6;border:1px solid #F2B280;border-radius:6px;padding:8px 10px;margin-top:8px;font-size:12px;color:#a52">
          <strong>⚠ Sin stock disponible</strong> para algunas tallas — los checkbox quedan bloqueados:
          <ul style="margin:4px 0 0 18px;padding:0">${filas}${mas}</ul>
          <div style="margin-top:4px;font-size:11px;color:#666">Cargá stock (📥 + Entrada en Bodega) o terminá bultos en Producción, después volvé a empacar.</div>
        </div>`;
    }
  }

  // Detectar piezas pendientes que NO están en el filtro de prendas — el
  // checkbox queda disabled aunque haya stock. Indicar al usuario que
  // amplíe el filtro saliendo + reentrando al modo empaque con más prendas.
  let avisoFuera = '';
  if (setP && setP.size > 0) {
    const fueraDeFiltro = new Set();
    for (const a of listaVisible) {
      const evalPieza = (prenda, talla, estado) => {
        if (!prenda || !talla) return;
        if (estado === 'empacado' || estado === 'entregado') return;
        if (setP.has(prenda)) return;
        fueraDeFiltro.add(prenda);
      };
      evalPieza(a.prenda_top, a.talla_top_key, a.estado_top);
      evalPieza(a.prenda_bottom, a.talla_bottom_key, a.estado_bottom);
    }
    if (fueraDeFiltro.size > 0) {
      const botones = [...fueraDeFiltro].map(p =>
        `<button type="button" class="btn btn-success btn-sm"
          style="font-size:11px;padding:4px 10px;margin:2px"
          onclick="event.stopPropagation();agregarPrendaAlFiltroEmpaque('${p.replace(/'/g, "\\'")}')"
          title="Sumar ${p} al filtro de empaque actual (sin salir del modo)">+ ${p}</button>`
      ).join('');
      avisoFuera = `
        <div style="width:100%;background:#FFF9E6;border:1px solid #F2D080;border-radius:6px;padding:8px 10px;margin-top:8px;font-size:12px;color:#946">
          <strong>ℹ Otras prendas pendientes fuera del filtro:</strong>
          <div style="margin-top:6px">${botones}</div>
          <div style="margin-top:6px;font-size:11px;color:#666">Tocá una prenda para sumarla al filtro y poder marcar sus piezas pendientes en esta misma sesión.</div>
        </div>`;
    }
  }

  return `
    <div class="card" style="background:#E0F4E5;border:2px solid var(--verde);padding:10px 12px;margin-bottom:8px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between">
      <div>
        <div style="font-weight:700;color:var(--verde);font-size:14px">📦 Modo empaque</div>
        <div style="font-size:12px;margin-top:2px">
          ${lblCombos}
          · ${listaVisible.length} alumno(s) coinciden
          · <strong>${marcados}</strong> alumno(s) marcado(s) (${piezasTop} top + ${piezasBot} bot = ${piezasAEmpacar} pieza${piezasAEmpacar===1?'':'s'})
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-success btn-sm" onclick="aplicarEmpaqueMarcados()" ${marcados===0?'disabled':''}>
          ✓ Empacar marcados (${marcados})
        </button>
        <button class="btn btn-ghost btn-sm" onclick="salirModoEmpaque()">Salir</button>
      </div>
      ${grupos.length > 0 ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(0,0,0,0.15)">
          <div style="font-size:10px;color:#555;text-transform:uppercase;font-weight:600;margin-bottom:4px">⚡ Marcar bulk por grado · sexo</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">${grupos}</div>
        </div>
      ` : ''}
      ${avisoSinStock}
      ${avisoFuera}
    </div>
  `;
}

// Desempacar inline desde la tabla en modo empaque. Click en el ✓ verde
// de una pieza ya empacada → confirma → revierte estado a pendiente y
// devuelve la unidad al stock libre (si vino de bodega) o libera el pool
// de la escuela (si vino del pool acaparado).
async function desempacarPiezaDesdeLista(alumnoId, pieza) {
  const c = alumnosGlobalCache;
  const a = c.alumnos.find(x => x.id === alumnoId);
  if (!a) return;
  const prenda = pieza === 'top' ? a.prenda_top : a.prenda_bottom;
  const talla = pieza === 'top' ? a.talla_top_key : a.talla_bottom_key;
  const esc = c.escuelas[a.escuela_id];
  const escLbl = esc ? (esc.alias || esc.nombre || '') : '';
  if (!confirm(
      `¿Desempacar ${prenda} ${talla} de ${a.nombre}?\n\n` +
      `Escuela: ${escLbl}\n\n` +
      `Esto vuelve la pieza a "pendiente" y la libera al stock disponible ` +
      `(si vino de bodega) o al pool de la escuela (si vino acaparada). ` +
      `Vas a poder empacarla a otro alumno.`)) return;
  try {
    if (typeof desempacarPieza !== 'function') throw new Error('desempacarPieza no disponible');
    const r = await desempacarPieza(alumnoId, pieza);
    // Actualizar cache local sin refetch completo
    const idx = c.alumnos.findIndex(x => x.id === alumnoId);
    if (idx >= 0) {
      const upd = pieza === 'top' ? { estado_top: 'pendiente' } : { estado_bottom: 'pendiente' };
      Object.assign(c.alumnos[idx], upd);
    }
    // Marcar la pieza como re-elegible aunque su prenda no esté en el filtro
    // general. Además agregamos la prenda al filtro empPrendas para que
    // sobreviva al pierde-state (ej. si se recarga, igual queda eligible).
    if (!c.empPiezasExtra) c.empPiezasExtra = new Set();
    c.empPiezasExtra.add(alumnoId + '|' + pieza);
    if (!Array.isArray(c.empPrendas)) c.empPrendas = [];
    if (prenda && !c.empPrendas.includes(prenda)) {
      c.empPrendas.push(prenda);
    }
    // Invalidar cache de datos (stock, pool, alumnos) para badges y otras vistas
    if (typeof invalidarCache === 'function') {
      invalidarCache('alumnos');
      invalidarCache('bodega');
      invalidarCache('pool');
    }
    // Refrescar supply para que el checkbox de empaque se reactive con el +1
    if (typeof cargarSupplyEmpaque === 'function') await cargarSupplyEmpaque();
    renderAlumnosGlobal();
    // Refrescar el badge de "esperando empaque" en el nav
    if (typeof refrescarBadgeEsperando === 'function') refrescarBadgeEsperando();
    // Toast simple en el banner (no alert para no romper el flujo)
    const msg = r.vinoDeStock
      ? `✓ ${prenda} ${talla} devuelto al stock de bodega. Disponible para empacar a otro alumno.`
      : `✓ ${prenda} ${talla} liberado del pool de ${escLbl}. Pool disponible +1.`;
    console.log('[desempacar OK]', a.nombre, prenda, talla, r);
    alert(msg);
  } catch(e) {
    console.error('[desempacar ERROR]', a.nombre, prenda, talla, e);
    alert(
      `⚠ ERROR al desempacar ${prenda} ${talla} de ${a.nombre}\n\n` +
      `Detalle: ${e.message || e}\n\n` +
      `Verificá la conexión a internet. La pieza sigue marcada como empacada — ` +
      `volvé a intentar cuando tengas conexión estable.`
    );
  }
}

// Marca en bulk todas las piezas elegibles de los alumnos de un grado+sexo
// específico (de la lista visible). Top primero hasta que se acabe el stock,
// luego bottom. Si una pieza ya estaba marcada, queda; las nuevas se suman
// solo si hay suministro disponible.
function marcarBulkGradoSexo(grado, sexo) {
  const c = alumnosGlobalCache;
  if (!c.modoEmpaque) return;
  if (!c.empMarcadosTop) c.empMarcadosTop = new Set();
  if (!c.empMarcadosBot) c.empMarcadosBot = new Set();
  const setP = new Set(c.empPrendas || []);
  const combos = c.empCombos || [];
  const poolEntries = c.empPoolEntries || [];

  const piezaElig = (a, pieza) => {
    const prenda = pieza === 'top' ? a.prenda_top : a.prenda_bottom;
    const talla  = pieza === 'top' ? a.talla_top_key : a.talla_bottom_key;
    const estado = pieza === 'top' ? a.estado_top : a.estado_bottom;
    if (!prenda || !talla) return false;
    if (estado === 'empacado' || estado === 'entregado') return false;
    if (poolEntries.length > 0) {
      return poolEntries.some(p => a.escuela_id === p.escuela_id
        && prenda === p.prenda && talla === p.talla);
    }
    if (combos.length > 0) {
      return combos.some(co => a.nivel === co.nivel && a.sexo === co.sexo
        && (pieza === 'top' ? co.prenda_top === prenda : co.prenda_bottom === prenda));
    }
    return setP.has(prenda);
  };

  // Aplicar mismos filtros que la tabla
  const filtroEscOk = (a) => {
    if (c.filtroEscuelas && c.filtroEscuelas.length > 0) {
      return c.filtroEscuelas.includes(a.escuela_id);
    }
    return true;
  };
  const busqOk = (a) => {
    if (!c.busqueda) return true;
    const q = c.busqueda.toLowerCase().trim();
    return (a.nombre||'').toLowerCase().includes(q);
  };

  const candidatos = c.alumnos
    .filter(a => a.grado === grado && a.sexo === sexo && filtroEscOk(a) && busqOk(a))
    .slice(0, 500);

  if (candidatos.length === 0) return;

  // Restante para no over-empacar
  const restante = _supplyRestante();
  let markedTop = 0, markedBot = 0, skippedTop = 0, skippedBot = 0;
  for (const a of candidatos) {
    if (piezaElig(a, 'top') && !c.empMarcadosTop.has(a.id)) {
      if (!restante || _piezaConSuministro(a, 'top', restante)) {
        c.empMarcadosTop.add(a.id);
        markedTop++;
        // Descontar 1 del restante
        if (restante) _restarSuministro(a, 'top', restante);
      } else {
        skippedTop++;
      }
    }
    if (piezaElig(a, 'bottom') && !c.empMarcadosBot.has(a.id)) {
      if (!restante || _piezaConSuministro(a, 'bottom', restante)) {
        c.empMarcadosBot.add(a.id);
        markedBot++;
        if (restante) _restarSuministro(a, 'bottom', restante);
      } else {
        skippedBot++;
      }
    }
  }
  renderAlumnosGlobal();
  if (skippedTop > 0 || skippedBot > 0) {
    // Sólo log; el usuario verá los disabled en pantalla.
    console.warn(`Bulk ${grado} ${sexo}: ${markedTop}+${markedBot} marcados; saltados sin stock: ${skippedTop} top, ${skippedBot} bot`);
  }
}

function _restarSuministro(a, pieza, restante) {
  const prenda = pieza === 'top' ? a.prenda_top : a.prenda_bottom;
  const talla  = pieza === 'top' ? a.talla_top_key : a.talla_bottom_key;
  if (!prenda || !talla) return;
  const kPool = a.escuela_id + '|' + prenda + '|' + talla;
  const kStock = prenda + '|' + talla;
  const pp = restante.poolRest.get(kPool) || 0;
  if (pp > 0) { restante.poolRest.set(kPool, pp - 1); return; }
  const ss = restante.stockRest.get(kStock) || 0;
  if (ss > 0) restante.stockRest.set(kStock, ss - 1);
}

// Toggle granular por pieza: 'top' o 'bottom'
function toggleMarcarPieza(id, pieza, checked) {
  const c = alumnosGlobalCache;
  if (!c.empMarcadosTop) c.empMarcadosTop = new Set();
  if (!c.empMarcadosBot) c.empMarcadosBot = new Set();
  const set = pieza === 'top' ? c.empMarcadosTop : c.empMarcadosBot;
  if (checked) set.add(id);
  else set.delete(id);
  // El browser ya pintó el check change. Diferimos el recálculo de
  // disabled/banner/avisos al próximo frame para no bloquear taps rápidos.
  scheduleRenderAlumnos();
}

// Compat (en caso de que algo viejo todavía llame). Marca ambas piezas si elig.
function toggleMarcarEmpaque(id, checked) {
  toggleMarcarPieza(id, 'top', checked);
  toggleMarcarPieza(id, 'bottom', checked);
}

// Marca todos los visibles para una pieza ('top' o 'bot'). Respeta el stock:
// solo marca hasta donde alcance el suministro (pool + libre).
function marcarTodosEmpaque(piezaArg, checked) {
  const c = alumnosGlobalCache;
  // Backward compat: si se llama con un solo arg booleano (uso viejo) marca ambas
  if (typeof piezaArg === 'boolean') {
    marcarTodosEmpaque('top', piezaArg);
    marcarTodosEmpaque('bot', piezaArg);
    return;
  }
  const pieza = piezaArg === 'top' ? 'top' : 'bottom';
  if (!c.empMarcadosTop) c.empMarcadosTop = new Set();
  if (!c.empMarcadosBot) c.empMarcadosBot = new Set();
  const set = pieza === 'top' ? c.empMarcadosTop : c.empMarcadosBot;

  // Construir lista de elegibles visibles aplicando los mismos filtros
  // que renderAlumnosGlobal (escuelas, búsqueda, modo empaque).
  const setP = new Set(c.empPrendas || []);
  const combos = c.empCombos || [];
  const poolEntries = c.empPoolEntries || [];
  const piezaMatch = (a) => {
    if (pieza === 'top') {
      if (!a.prenda_top || !a.talla_top_key) return false;
      if (a.estado_top === 'empacado' || a.estado_top === 'entregado') return false;
      // Tiene que coincidir con el filtro (combos, pool o prendas)
      if (poolEntries.length > 0) {
        return poolEntries.some(p => a.escuela_id === p.escuela_id
          && a.prenda_top === p.prenda && a.talla_top_key === p.talla);
      }
      if (combos.length > 0) {
        return combos.some(co => a.nivel === co.nivel && a.sexo === co.sexo
          && co.prenda_top && a.prenda_top === co.prenda_top);
      }
      return setP.has(a.prenda_top);
    }
    // bottom
    if (!a.prenda_bottom || !a.talla_bottom_key) return false;
    if (a.estado_bottom === 'empacado' || a.estado_bottom === 'entregado') return false;
    if (poolEntries.length > 0) {
      return poolEntries.some(p => a.escuela_id === p.escuela_id
        && a.prenda_bottom === p.prenda && a.talla_bottom_key === p.talla);
    }
    if (combos.length > 0) {
      return combos.some(co => a.nivel === co.nivel && a.sexo === co.sexo
        && co.prenda_bottom && a.prenda_bottom === co.prenda_bottom);
    }
    return setP.has(a.prenda_bottom);
  };

  const filtroEscOk = (a) => {
    if (c.filtroEscuelas && c.filtroEscuelas.length > 0) {
      return c.filtroEscuelas.includes(a.escuela_id);
    }
    return true;
  };
  const busqOk = (a) => {
    if (!c.busqueda) return true;
    const q = c.busqueda.toLowerCase().trim();
    return (a.nombre||'').toLowerCase().includes(q);
  };

  const candidatos = c.alumnos
    .filter(a => piezaMatch(a) && filtroEscOk(a) && busqOk(a))
    .slice(0, 500);

  if (!checked) {
    candidatos.forEach(a => set.delete(a.id));
    renderAlumnosGlobal();
    return;
  }

  // Marcar hasta donde alcance el suministro
  const restante = _supplyRestante();
  for (const a of candidatos) {
    if (set.has(a.id)) continue;  // ya marcado, dejar
    if (!restante || _piezaConSuministro(a, pieza, restante)) {
      set.add(a.id);
      // Re-simular para la próxima — descontar 1
      if (restante) {
        const prenda = pieza === 'top' ? a.prenda_top : a.prenda_bottom;
        const talla  = pieza === 'top' ? a.talla_top_key : a.talla_bottom_key;
        const kPool = a.escuela_id + '|' + prenda + '|' + talla;
        const kStock = prenda + '|' + talla;
        const pp = restante.poolRest.get(kPool) || 0;
        if (pp > 0) restante.poolRest.set(kPool, pp - 1);
        else {
          const ss = restante.stockRest.get(kStock) || 0;
          if (ss > 0) restante.stockRest.set(kStock, ss - 1);
        }
      }
    }
  }
  renderAlumnosGlobal();
}

// Agrega una prenda al filtro del modo empaque sin requerir salir/reentrar.
// Útil para que las piezas que volvieron a pendiente (desempacar + recarga)
// se puedan empacar de nuevo sin perder el resto del estado del sprint.
function agregarPrendaAlFiltroEmpaque(prenda) {
  const c = alumnosGlobalCache;
  if (!c.modoEmpaque || !prenda) return;
  if (!Array.isArray(c.empPrendas)) c.empPrendas = [];
  if (!c.empPrendas.includes(prenda)) c.empPrendas.push(prenda);
  renderAlumnosGlobal();
}

function salirModoEmpaque() {
  const c = alumnosGlobalCache;
  c.modoEmpaque = false;
  c.empPrendas = [];
  c.empCombos = [];
  c.empPoolEntries = [];
  c.empCompletarParejas = false;
  c.empMarcadosTop = null;
  c.empMarcadosBot = null;
  c.empSupply = null;
  c.empPiezasExtra = null;
  c.empTallaAlt = null;
  renderAlumnosGlobal();
}

// ─── Selector de talla alterna ───────────────────────────────────────
// Permite empacar una pieza con talla distinta a la pedida (caso pantalón
// largo). Guarda la elección en c.empTallaAlt = Map<"id|pieza", talla>.
// Al aplicar empaque, las entradas distintas a la pedida se mandan al
// backend en opts.tallasAlt, y se persisten en alumno.talla_empacada_*.
function abrirSelectorTallaAlt(alumnoId, pieza) {
  const c = alumnosGlobalCache;
  const a = c.alumnos.find(x => x.id === alumnoId);
  if (!a) return;
  const prenda = pieza === 'top' ? a.prenda_top : a.prenda_bottom;
  const tallaPedida = pieza === 'top' ? a.talla_top_key : a.talla_bottom_key;
  if (!prenda || !tallaPedida) return;
  if (!c.empTallaAlt) c.empTallaAlt = new Map();
  const tallaActual = c.empTallaAlt.get(alumnoId + '|' + pieza) || tallaPedida;

  // Restante simulando consumo, PERO sin contar la talla que esta pieza
  // ya tiene asignada (para no doble-descontarla en su propia listado).
  const restante = _supplyRestante();
  if (restante) {
    const tallaActualEnConsumo = c.empTallaAlt.get(alumnoId + '|' + pieza) || tallaPedida;
    const marcado = (pieza === 'top' ? c.empMarcadosTop : c.empMarcadosBot) || new Set();
    if (marcado.has(alumnoId)) {
      // Sumar 1 al restante para que el usuario vea la talla actual disponible
      const kPool = a.escuela_id + '|' + prenda + '|' + tallaActualEnConsumo;
      const kStock = prenda + '|' + tallaActualEnConsumo;
      if ((c.empSupply.poolMap.get(kPool) || 0) > 0) {
        restante.poolRest.set(kPool, (restante.poolRest.get(kPool) || 0) + 1);
      } else {
        restante.stockRest.set(kStock, (restante.stockRest.get(kStock) || 0) + 1);
      }
    }
  }

  const tallas = _tallasDisponiblesParaEmpaque(prenda, a.escuela_id, restante);
  // Asegurar que la talla pedida aparece aunque no tenga stock (por consistencia visual)
  if (!tallas.some(t => t.talla === tallaPedida)) {
    tallas.push({ talla: tallaPedida, stock: 0, pool: 0, total: 0 });
    tallas.sort((a, b) => a.talla.localeCompare(b.talla, 'es', { numeric: true }));
  }

  const sub = document.getElementById('talla-alt-sub');
  if (sub) sub.innerHTML = `<strong>${a.nombre}</strong> · ${prenda} · pedida <strong>${tallaPedida}</strong>${tallaActual !== tallaPedida ? ` · actual <strong style="color:#C90">${tallaActual}</strong>` : ''}`;
  const lista = document.getElementById('talla-alt-lista');
  if (lista) {
    const rows = tallas.map(t => {
      const esPedida = t.talla === tallaPedida;
      const esSeleccionada = t.talla === tallaActual;
      const stockLbl = t.stock > 0 ? `<span style="color:var(--verde)">stock ${t.stock}</span>` : '<span style="color:#aaa">stock 0</span>';
      const poolLbl  = t.pool  > 0 ? `<span style="color:#C90">pool ${t.pool}</span>`  : '';
      const disponLbl = [stockLbl, poolLbl].filter(Boolean).join(' · ');
      const disabled = t.total === 0 && !esPedida;
      const bg = esSeleccionada ? '#E0F4E5' : (esPedida ? '#F8FBFF' : 'white');
      const border = esSeleccionada ? '2px solid var(--verde)' : '1px solid #DDD';
      return `<button type="button" ${disabled ? 'disabled' : ''}
        onclick="confirmarTallaAlt('${alumnoId}','${pieza}','${t.talla.replace(/'/g, "\\'")}')"
        style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:12px 14px;margin-bottom:6px;background:${bg};border:${border};border-radius:8px;cursor:${disabled?'not-allowed':'pointer'};opacity:${disabled?0.45:1};font-family:Arial,sans-serif;text-align:left">
        <span>
          <span style="font-family:monospace;font-weight:700;font-size:15px">${t.talla}</span>
          ${esPedida ? '<span style="font-size:11px;color:#666;margin-left:6px">· talla pedida</span>' : ''}
          ${esSeleccionada && !esPedida ? '<span style="font-size:11px;color:var(--verde);margin-left:6px;font-weight:700">✓ elegida</span>' : ''}
        </span>
        <span style="font-size:12px">${disponLbl || '<span style="color:#aaa">sin disponibilidad</span>'}</span>
      </button>`;
    }).join('');
    const hayAlterna = tallaActual !== tallaPedida;
    const quitarBtn = hayAlterna
      ? `<button type="button" onclick="quitarTallaAlt('${alumnoId}','${pieza}')" style="width:100%;padding:10px 14px;margin-top:8px;background:#F8F8F8;border:1px dashed #CCC;border-radius:8px;cursor:pointer;font-size:13px;color:#666">↩ Volver a talla pedida (${tallaPedida})</button>`
      : '';
    lista.innerHTML = rows + quitarBtn +
      `<div style="margin-top:10px;font-size:11px;color:#888;line-height:1.4">
        Al aplicar empaque, la talla elegida se descuenta del stock o pool, y se guarda en el alumno para que la trazabilidad sea correcta.
      </div>`;
  }
  const overlay = document.getElementById('talla-alt-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function cerrarSelectorTallaAlt() {
  const overlay = document.getElementById('talla-alt-overlay');
  if (overlay) overlay.style.display = 'none';
}

function confirmarTallaAlt(alumnoId, pieza, talla) {
  const c = alumnosGlobalCache;
  if (!c.empTallaAlt) c.empTallaAlt = new Map();
  const a = c.alumnos.find(x => x.id === alumnoId);
  if (!a) { cerrarSelectorTallaAlt(); return; }
  const tallaPedida = pieza === 'top' ? a.talla_top_key : a.talla_bottom_key;
  if (talla === tallaPedida) {
    c.empTallaAlt.delete(alumnoId + '|' + pieza);
  } else {
    c.empTallaAlt.set(alumnoId + '|' + pieza, talla);
  }
  cerrarSelectorTallaAlt();
  renderAlumnosGlobal();
}

function quitarTallaAlt(alumnoId, pieza) {
  const c = alumnosGlobalCache;
  if (c.empTallaAlt) c.empTallaAlt.delete(alumnoId + '|' + pieza);
  cerrarSelectorTallaAlt();
  renderAlumnosGlobal();
}

async function aplicarEmpaqueMarcados() {
  const c = alumnosGlobalCache;
  if (!c.empMarcadosTop) c.empMarcadosTop = new Set();
  if (!c.empMarcadosBot) c.empMarcadosBot = new Set();
  if (c.empMarcadosTop.size === 0 && c.empMarcadosBot.size === 0) {
    return alert('Marcá al menos una pieza (top o bottom)');
  }
  // Plan externo: una entrada por alumno con top/bottom indicado
  const planExterno = new Map();
  const idsInvolucrados = new Set([...c.empMarcadosTop, ...c.empMarcadosBot]);
  for (const id of idsInvolucrados) {
    planExterno.set(id, {
      top: c.empMarcadosTop.has(id),
      bottom: c.empMarcadosBot.has(id),
    });
  }
  const alumnos = c.alumnos.filter(a => idsInvolucrados.has(a.id));
  if (alumnos.length === 0) return alert('Alumnos marcados no encontrados');

  const piezasTotal = c.empMarcadosTop.size + c.empMarcadosBot.size;
  if (!confirm(`¿Empacar ${piezasTotal} pieza(s) (${c.empMarcadosTop.size} top + ${c.empMarcadosBot.size} bot) en ${alumnos.length} alumno(s)?\n\nLas piezas se descuentan del pool acaparado de la escuela primero, y del stock libre si el pool no alcanza.`)) return;

  try {
    // prendasSet null porque tenemos planExterno
    // tallasAlt: solo incluir entradas con valor distinto a la talla pedida
    let tallasAlt = null;
    if (c.empTallaAlt && c.empTallaAlt.size > 0) {
      tallasAlt = new Map();
      const byId = new Map();
      for (const a of c.alumnos) byId.set(a.id, a);
      for (const [k, v] of c.empTallaAlt.entries()) {
        const [aid, pieza] = k.split('|');
        const a = byId.get(aid); if (!a || !v) continue;
        const pedida = pieza === 'top' ? a.talla_top_key : a.talla_bottom_key;
        if (v !== pedida) tallasAlt.set(k, v);
      }
      if (tallasAlt.size === 0) tallasAlt = null;
    }
    const r = await empacarAlumnosDesdeRegistro(alumnos, null, { planExterno, tallasAlt });
    if (r.errores && r.errores.length > 0) {
      alert('❌ No hay stock suficiente:\n\n' + r.errores.join('\n') +
            '\n\nOpciones: registrar entrada en bodega, acaparar primero, o desmarcar piezas sin stock.');
      return;
    }
    alert(`✓ ${r.actualizados} alumno(s) empacado(s).\n${r.piezasPool} pieza(s) del pool acaparado.\n${r.piezasStock} pieza(s) del stock libre.`);
    c.empMarcadosTop = new Set();
    c.empMarcadosBot = new Set();
    await initAlumnosGlobal();
  } catch(e) {
    alert('Error: ' + e.message);
  }
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
   'ese-tela-celeste','ese-tela-blanca','ese-tela-azul','ese-tela-beige']
   .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

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
  if (c.modoEmpaque) partes.push('📦 modo empaque');
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

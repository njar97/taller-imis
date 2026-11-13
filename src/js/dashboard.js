// ══════════════════════════════════════════════════════════════════════
// DASHBOARD GENERAL (v25)
// Home con resumen global de la temporada activa.
// Desde 2026 el pedido viene por CANTIDADES (tabla pedido, sin alumnos):
// Inicio cuenta piezas por escuela × prenda × talla. Las temporadas con
// alumnos (2025) se siguen viendo con el selector «Ver:».
// ══════════════════════════════════════════════════════════════════════

let dashboardCache = {
  temporadaActiva: null,
  temporadaSel: null,   // id elegido en «Ver:» (null = la temporada activa)
  resumen: {},
  cargando: false,
};

async function initDashboard() {
  if (dashboardCache.cargando) return;
  dashboardCache.cargando = true;

  const cont = document.getElementById('dashboard-contenido');
  if (!cont) { dashboardCache.cargando = false; return; }

  // Inicio = tareas del día arriba + dashboard "Hoy". Por-escuela e
  // histórico viven en Estadística. Las tareas se pintan antes de cargar
  // datos: si la red falla, igual se puede ir a trabajar.
  cont.innerHTML = `
    ${tareasInicioHtml()}
    <div id="dashboard-sub-contenido">
      <div class="text-muted" style="padding:20px;text-align:center">Cargando dashboard...</div>
    </div>
  `;

  await cargarDashboardHoy();
  dashboardCache.cargando = false;
}

function dashElegirTemporada(id) {
  dashboardCache.temporadaSel = id;
  initDashboard();
}

// ══════════════════════════════════════════════════════════════════════
// «¿QUÉ VAS A HACER HOY?» — botones grandes de tarea arriba de Inicio
// Cada uno lleva a la pantalla que ya existe para esa tarea. Los ven
// todos los roles (el taller es quien los usa).
// ══════════════════════════════════════════════════════════════════════
const TAREAS_INICIO = [
  { id: 'corte',      ico: '✂️', tit: 'Anotar un corte',          sub: 'Lo del cuaderno de tendido' },
  { id: 'bulto',      ico: '📦', tit: 'Bulto terminado',          sub: 'Pasa de costura a bodega' },
  { id: 'entrada',    ico: '📥', tit: 'Entró a bodega',           sub: 'Piezas que llegaron' },
  { id: 'contar',     ico: '🔢', tit: 'Contar bodega',            sub: 'Lo que hay en el estante' },
  { id: 'empacar',    ico: '🧺', tit: 'Empacar para una escuela', sub: 'Apartar lo de una escuela' },
  { id: 'entregar',   ico: '🚚', tit: 'Entregar a una escuela',   sub: 'Lo empacado se va' },
  { id: 'especiales', ico: '📏', tit: 'Tallas especiales',        sub: 'Alumnos con medida propia' },
  { id: 'avance',     ico: '🧵', tit: '¿Cómo van los bultos?',    sub: 'Qué va terminado y qué falta' },
];

function tareasInicioHtml() {
  const ayuda = typeof ayudaHtml === 'function'
    ? ayudaHtml('inicio', 'Tocá lo que vas a hacer y la app te lleva directo. Los números de la temporada están más abajo.')
    : '';
  return `
    <section class="card tareas-card" aria-labelledby="tareas-tit">
      ${ayuda}
      <h2 class="tareas-tit" id="tareas-tit">¿Qué vas a hacer hoy?</h2>
      <div class="tareas-grid">
        ${TAREAS_INICIO.map(t => `
        <button type="button" class="tarea-btn" data-tarea="${t.id}" onclick="tareaIr('${t.id}')">
          <span class="tarea-ico" aria-hidden="true">${t.ico}</span>
          <span class="tarea-tit">${t.tit}</span>
          <span class="tarea-sub">${t.sub}</span>
        </button>`).join('')}
      </div>
    </section>`;
}

function tareaIr(id) {
  const ir = typeof abrirPestana === 'function' ? abrirPestana : (t) => switchTab(t);
  switch (id) {
    case 'corte':        // Corte → Nuevo → Tendido (lo que dice el cuaderno)
      ir('corte');
      if (typeof switchSubCorte === 'function') switchSubCorte('nuevo');
      irA('tendido');
      return;
    case 'bulto':        // Producción → bultos sin terminar (✓ Terminar → bodega)
    case 'avance':       // Producción → todos los bultos (con 📐 Plan al lado)
      if (typeof produccionFiltro !== 'undefined') produccionFiltro = id === 'bulto' ? 'pendientes' : 'todos';
      window._prodHintSub = 'dashboard';
      ir('produccion');
      return;
    case 'entrada':      // Bodega → 📥 entrada de piezas
      ir('bodega');
      if (typeof abrirEntradaManual === 'function') abrirEntradaManual();
      return;
    case 'contar':       // Bodega → 🔢 conteo
      ir('bodega');
      if (typeof abrirConteoModal === 'function') abrirConteoModal();
      return;
    case 'empacar':      // Empaque por cantidad, desde la lista de escuelas
      window._emqHintEscuela = null;
      if (typeof emqState !== 'undefined') { emqState.escuelaId = null; emqState.paso = 1; }
      ir('empaque');
      return;
    case 'entregar':     // Bodega → 🚚 entregar lo empacado de una escuela
      ir('bodega');
      if (typeof abrirEntregaModal === 'function') abrirEntregaModal();
      return;
    case 'especiales':   // Registro (temporada activa) → 📏 Especiales
      if (typeof registroCache !== 'undefined') registroCache.temporadaActual = null;
      window._regHintVista = 'especiales';
      ir('registro');
      return;
  }
}

// ══════════════════════════════════════════════════════════════════════
// TEMPORADA POR CANTIDADES (2026 en adelante)
// pedido = lo que pidió cada escuela por prenda y talla (P12, C16, FCE10…)
// escuela_acaparado = lo empacado para la escuela y todavía no entregado
//   (cantidad_acaparada − cantidad_consumida), con la clave de BODEGA
//   (P1181, C17, B12…). Se pasa a la talla 2026 con talla_equivalencia,
//   igual que vw_bodega_equivalente / vw_plan_produccion.
// Lo usan Inicio y el globito de 📦 Bodega (nav_badges.js).
// ══════════════════════════════════════════════════════════════════════

function dashEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function dashNum(n) {
  return (Number(n) || 0).toLocaleString('es-SV');
}

// Temporadas (tabla chica): la activa manda.
async function temporadasLista() {
  return cachedFetch('temporadas-lista',
    () => supaFetch('temporada', 'GET', null, '?select=id,codigo,nombre,anio,estado&order=anio.desc'),
    { ttl: 300_000, group: 'temporada' });
}
function temporadaActivaDe(lista) {
  return (lista || []).find(t => t.estado === 'activa') || (lista || [])[0] || null;
}

// Pedido de una temporada = el de todos sus contratos.
async function pedidoDeTemporada(temporadaId) {
  return cachedFetch('pedido-temp-' + temporadaId, async () => {
    const contratos = await supaFetch('contrato', 'GET', null,
      `?temporada_id=eq.${temporadaId}&select=id,codigo`);
    if (!contratos || contratos.length === 0) return { contratos: [], pedido: [] };
    const pedido = await supaFetchAll('pedido',
      `?contrato_id=in.(${contratos.map(c => c.id).join(',')})` +
      '&select=escuela_id,nivel,cod_prenda,nombre_prenda,talla_key,cantidad_solicitada,cantidad_entregada');
    return { contratos, pedido };
  }, { ttl: 60_000, group: 'pedido' });
}

async function acaparadoTodo() {
  return cachedFetch('acaparado-todo',
    () => supaFetchAll('escuela_acaparado', '?select=escuela_id,cod_prenda,nombre_prenda,talla_key,cantidad_acaparada,cantidad_consumida'),
    { ttl: 30_000, group: 'pool' });
}

async function tallaEquivalencias() {
  return cachedFetch('talla-equivalencia',
    () => supaFetch('talla_equivalencia', 'GET', null, '?select=cod_prenda,talla_vieja,talla_2026,largo_2026_cm'),
    { ttl: 600_000, group: 'tallas' });
}

// Código de prenda (C, P, FCE…) aunque la fila solo traiga el nombre.
function codDePrenda(cod, nombre) {
  if (cod) return cod;
  const n = String(nombre || '').toUpperCase();
  for (const [c, nom] of Object.entries(typeof _PRENDA_CANON_MAP !== 'undefined' ? _PRENDA_CANON_MAP : {})) {
    if (nom === n) return c;
  }
  return n || null;
}

// Talla 2026 de una clave de PEDIDO: P12 → T12 (igual que vw_plan_produccion).
function tallaPedido2026(cod, talla_key) {
  return 'T' + String(talla_key || '').slice(String(cod || '').length);
}

// Talla 2026 de una clave de BODEGA, igual que vw_bodega_equivalente:
// talla vieja de 1 o 2 dígitos + largo opcional (P1181 → vieja 11 → T12;
// C17 → T18). Si la prenda no está en talla_equivalencia y la clave ya
// es la del pedido (B12, S6, P12), se toma tal cual. Si no, null.
function tallaBodega2026(cod, talla_key, equivIdx) {
  const resto = String(talla_key || '').slice(String(cod || '').length);
  for (const n of [1, 2]) {
    const vieja = resto.slice(0, n);
    const largo = resto.slice(n);
    if (vieja.length !== n) continue;
    const e = equivIdx.get(cod + '|' + vieja);
    if (!e) continue;
    if (/^[1-9]\d{1,2}$/.test(largo) || (largo === '' && e.largo_2026_cm == null)) return e.talla_2026;
  }
  return /^(\d{1,2}|\dX)$/i.test(resto) ? 'T' + resto.toUpperCase() : null;
}

// Una línea por escuela × prenda × talla 2026:
//   sol = pedido · ent = entregado · emp = empacado sin entregar
//   pend = falta empacar (sol − ent − emp)
function avancePedidoTemporada(pedido, acaparado, equiv) {
  const lineas = new Map();
  for (const p of pedido || []) {
    const cod = p.cod_prenda;
    const talla = tallaPedido2026(cod, p.talla_key);
    const k = p.escuela_id + '|' + cod + '|' + talla;
    let o = lineas.get(k);
    if (!o) {
      o = { escuela_id: p.escuela_id, cod, talla, sol: 0, ent: 0, emp: 0, pend: 0 };
      lineas.set(k, o);
    }
    o.sol += Number(p.cantidad_solicitada) || 0;
    o.ent += Number(p.cantidad_entregada) || 0;
  }
  const equivIdx = new Map((equiv || []).map(e => [e.cod_prenda + '|' + e.talla_vieja, e]));
  const empacado = new Map();
  for (const a of acaparado || []) {
    const disp = Math.max(0, (Number(a.cantidad_acaparada) || 0) - (Number(a.cantidad_consumida) || 0));
    if (disp <= 0) continue;
    const cod = codDePrenda(a.cod_prenda, a.nombre_prenda);
    const talla = cod ? tallaBodega2026(cod, a.talla_key, equivIdx) : null;
    if (!talla) continue;
    const k = a.escuela_id + '|' + cod + '|' + talla;
    empacado.set(k, (empacado.get(k) || 0) + disp);
  }
  for (const [k, o] of lineas) {
    const resta = Math.max(0, o.sol - o.ent);
    o.emp = Math.min(empacado.get(k) || 0, resta);
    o.pend = resta - o.emp;
  }
  return [...lineas.values()];
}

// Nombre y orden de prendas: los mismos del plan de producción.
function dashPrendaNombre(cod) {
  if (typeof PLAN_PRENDAS !== 'undefined' && PLAN_PRENDAS[cod]) return PLAN_PRENDAS[cod];
  return typeof prendaCanon === 'function' ? prendaCanon(cod) : cod;
}
function dashOrdenPrenda(cod) {
  const orden = typeof PLAN_PRENDAS !== 'undefined' ? Object.keys(PLAN_PRENDAS) : [];
  const i = orden.indexOf(cod);
  return i < 0 ? orden.length : i;
}
function dashOrdenTalla(a, b) {
  return String(a).localeCompare(String(b), 'es', { numeric: true });
}

// ══════════════════════════════════════════════════════════════════════
// CARGA
// ══════════════════════════════════════════════════════════════════════

// Promise.allSettled (no Promise.all): si una query falla, las otras
// siguen — el dashboard se renderiza con KPIs parciales en vez de
// bloquearse. Cada KPI obtiene su valor o un vacío como fallback.
async function _dashCorrer(tareas, data, fallidos) {
  const results = await Promise.allSettled(tareas.map(([, fn]) => fn()));
  tareas.forEach(([key], i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      data[key] = r.value;
    } else {
      data[key] = key === 'produccionHoy' ? { bultos: 0, piezas: 0 }
        : key === 'pedidoTemp' ? { contratos: [], pedido: [] } : [];
      fallidos.push(key);
      console.warn('[dashboard]', key, 'falló:', r.reason && r.reason.message || r.reason);
    }
  });
}

async function cargarDashboardHoy() {
  const sub = document.getElementById('dashboard-sub-contenido');
  if (!sub) return;
  sub.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando...</div>';

  try {
    // Para pronóstico: SALIDA_EMPAQUE de los últimos 14 días por escuela
    const desde14 = new Date(Date.now() - 14*24*60*60*1000).toISOString().slice(0,10);
    const data = {};
    const fallidos = [];

    // 1) Lo que no depende de la temporada
    await _dashCorrer([
      ['temporadas',  () => supaFetch('vw_temporada_resumen', 'GET', null, '?order=anio.desc&limit=5')],
      ['stock', () => cachedFetch('dashboard-stock',
        () => supaFetchAll('vw_bodega_stock', '?select=cod_prenda,nombre_prenda,talla_key,stock_actual,reservado_empaque'),
        { ttl: 30_000, group: 'bodega' })],
      ['produccionHoy', () => cargarProduccionHoy()],
      ['escuelas', () => cachedFetch('dashboard-escuelas',
        () => supaFetchAll('escuela', '?activa=eq.true&select=id,alias,nombre,codigo_cde&order=alias'),
        { ttl: 300_000, group: 'escuelas' })],
      ['empaquesRec', () => supaFetchAll('bodega_movimiento',
        `?tipo=eq.SALIDA_EMPAQUE&fecha=gte.${desde14}&select=escuela_id,cantidad,fecha`)],
    ], data, fallidos);

    // 2) Lo de la temporada elegida (por defecto, la activa)
    const temps = data.temporadas || [];
    const activa = temps.find(t => t.estado === 'activa') || temps[0] || null;
    const sel = temps.find(t => t.id === dashboardCache.temporadaSel) || activa;
    dashboardCache.temporadaActiva = activa;
    data.tempActiva = activa;
    data.tempSel = sel;
    data.modo = !sel ? 'vacio' : (Number(sel.num_pedidos) > 0 ? 'pedido' : 'alumnos');
    // Esconder (o mostrar) en toda la app lo que solo sirve con alumnos
    if (typeof tiFijarTemporada === 'function') tiFijarTemporada(activa, sel);

    if (data.modo === 'pedido') {
      const tareas = [
        ['pedidoTemp', () => pedidoDeTemporada(sel.id)],
        ['acap', () => acaparadoTodo()],
        ['equiv', () => tallaEquivalencias()],
        ['topEscuelas', () => supaFetch('vw_pedido_escuela', 'GET', null,
          `?temporada_id=eq.${sel.id}&piezas_pendientes=gt.0&order=piezas_pendientes.desc&limit=5`)],
      ];
      // vw_plan_produccion es el plan de la temporada en curso
      if (sel === activa) {
        tareas.push(['plan', () => supaFetch('vw_plan_produccion', 'GET', null,
          '?select=cod_prenda,nombre_prenda,talla_2026,pedido,falta_hacer,en_proceso,falta_iniciar')]);
      }
      await _dashCorrer(tareas, data, fallidos);
    } else if (data.modo === 'alumnos') {
      // Temporadas con alumnos (2025): solo los alumnos de ESA temporada
      await _dashCorrer([
        ['alumnos', () => cachedFetch('dashboard-alumnos-' + sel.id,
          () => supaFetchAll('alumno', `?activo=eq.true&temporada_id=eq.${sel.id}&select=escuela_id,estado_top,estado_bottom,talla_top_key,talla_bottom_key`),
          { ttl: 60_000, group: 'alumnos' })],
        ['pool', () => acaparadoTodo()],
      ], data, fallidos);
    }

    dashboardCache.resumen = data;
    dashboardCache.fallidos = fallidos;
    renderDashboard();
  } catch(e) {
    sub.innerHTML = `<div class="alert alert-error">Error: ${dashEsc(e.message)}</div>`;
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

// ══════════════════════════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════════════════════════

const DASH_NARANJA = '#C2660A';

function _dashKpi(titulo, valor, sub, color) {
  return `
      <div class="card" style="padding:12px;text-align:center">
        <div style="font-size:11px;color:#666">${titulo}</div>
        <div style="font-size:24px;font-weight:700;color:${color};margin-top:4px">${valor}</div>
        <div style="font-size:10px;color:#888">${sub}</div>
      </div>`;
}

function _dashBanner(temp, esActiva, datos, pct, nota) {
  if (!temp) return '<div class="alert alert-info">No hay temporadas. Cargá una primero.</div>';
  return `
      <div class="card" style="padding:14px;margin-bottom:10px;background:linear-gradient(135deg,#0065CC,#004999);color:white">
        <div style="font-size:11px;opacity:0.8">${esActiva ? 'TEMPORADA ACTIVA' : 'TEMPORADA ANTERIOR'}</div>
        <div style="font-size:22px;font-weight:700;margin-top:4px">${dashEsc(temp.nombre)}</div>
        ${nota ? `<div style="font-size:11px;opacity:0.85;margin-top:2px">${nota}</div>` : ''}
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:13px">
          ${datos.map(d => `<div>${d}</div>`).join('')}
        </div>
        ${pct == null ? '' : `
        <div style="background:rgba(255,255,255,0.2);height:8px;border-radius:4px;margin-top:8px;overflow:hidden">
          <div style="background:white;height:100%;width:${Math.min(100, pct)}%"></div>
        </div>`}
      </div>`;
}

function _dashSelectorTemporada(temps, selId) {
  if (!temps || temps.length < 2) return '';
  return `
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:12px">
      <span style="color:#666">Ver:</span>
      ${temps.map(t => `
        <button class="btn btn-sm ${t.id === selId ? 'btn-primary' : 'btn-ghost'}" onclick="dashElegirTemporada('${t.id}')">
          ${dashEsc(t.codigo || t.anio)}${t.estado === 'activa' ? ' · activa' : ''}
        </button>`).join('')}
    </div>`;
}

function renderDashboard() {
  const cont = document.getElementById('dashboard-sub-contenido');
  if (!cont) return;

  const r = dashboardCache.resumen;
  const sel = r.tempSel || null;
  const esActiva = !!sel && sel === r.tempActiva;

  // Stock (todas las tallas; la tabla muestra las 10 con más)
  const stock = (r.stock || []).slice()
    .sort((a, b) => (Number(b.stock_actual) || 0) - (Number(a.stock_actual) || 0));
  const stockTotal = stock.reduce((s,x) => s + Math.max(0, Number(x.stock_actual) || 0), 0);
  const stockReservado = stock.reduce((s,x) => s + (Number(x.reservado_empaque) || 0), 0);
  const stockTop = stock.filter(s => (Number(s.stock_actual) || 0) > 0).slice(0, 10);

  const kpiHoy = _dashKpi('Producido hoy', dashNum(r.produccionHoy?.piezas), `${r.produccionHoy?.bultos || 0} bulto(s)`, 'var(--azul)');
  const kpiStock = _dashKpi('Stock en bodega', dashNum(stockTotal), `${dashNum(stockReservado)} reservadas`, 'var(--verde)');

  let banner, kpis, cuerpo;
  if (r.modo === 'pedido') {
    const lineas = avancePedidoTemporada(r.pedidoTemp?.pedido, r.acap, r.equiv);
    const tot = lineas.reduce((t, l) => {
      t.sol += l.sol; t.ent += l.ent; t.emp += l.emp; t.pend += l.pend; return t;
    }, { sol: 0, ent: 0, emp: 0, pend: 0 });
    const nEsc = new Set(lineas.map(l => l.escuela_id)).size;
    const pctEnt = tot.sol > 0 ? Math.round(100 * tot.ent / tot.sol) : 0;
    const codigos = [...new Set((r.pedidoTemp?.contratos || []).map(c => c.codigo).filter(Boolean))];
    banner = _dashBanner(sel, esActiva, [
      `<strong>${dashNum(nEsc)}</strong> escuelas`,
      `<strong>${dashNum(tot.sol)}</strong> piezas pedidas`,
      `<strong>${pctEnt}%</strong> entregado`,
    ], pctEnt, codigos.length ? `Contrato ${codigos.map(dashEsc).join(', ')}` : '');
    kpis = kpiHoy + kpiStock
      + _dashKpi('Empacado', dashNum(tot.emp), `faltan ${dashNum(tot.pend)} por empacar`, DASH_NARANJA)
      + _dashKpi('Entregado', dashNum(tot.ent), `de ${dashNum(tot.sol)} pedidas`, '#333');
    cuerpo = _renderProduccionTemporada(r.plan)
      + _renderEmpaquePorPrenda(lineas)
      + _renderTopEscuelas(r.topEscuelas, 'pedido')
      + _renderAvancePedido(r, lineas);
  } else {
    // Temporada con alumnos (2025) o sin datos
    const alumnos = r.alumnos || [];
    const totalAlumnos = alumnos.length;
    const completos = alumnos.filter(a => a.estado_top === 'empacado' && a.estado_bottom === 'empacado').length;
    const parciales = alumnos.filter(a =>
      (a.estado_top === 'empacado' && a.estado_bottom !== 'empacado') ||
      (a.estado_bottom === 'empacado' && a.estado_top !== 'empacado')
    ).length;
    const entregados = alumnos.filter(a => a.estado_top === 'entregado' && a.estado_bottom === 'entregado').length;
    const nEsc = new Set(alumnos.map(a => a.escuela_id)).size;
    banner = _dashBanner(sel, esActiva, [
      `<strong>${dashNum(nEsc)}</strong> escuelas`,
      `<strong>${dashNum(totalAlumnos)}</strong> alumnos`,
    ], null, '');
    kpis = kpiHoy + kpiStock
      + _dashKpi('Alumnos cargados', dashNum(totalAlumnos), `${dashNum(entregados)} entregados`, '#333')
      + _dashKpi('Empaque', dashNum(completos), `+${dashNum(parciales)} parciales`, DASH_NARANJA);
    cuerpo = _renderAvancePorEscuela(r);
  }

  const avisoFallidos = (dashboardCache.fallidos || []).length
    ? `<div class="alert alert-warn" style="font-size:12px;margin-bottom:10px">⚠ No se pudo cargar todo (${dashboardCache.fallidos.map(dashEsc).join(', ')}). Probá 🔄 Refrescar.</div>`
    : '';

  cont.innerHTML = `
    ${avisoFallidos}
    <!-- Fila 1: Temporada -->
    ${banner}
    ${_dashSelectorTemporada(r.temporadas, sel?.id)}

    <!-- Fila 2: 4 KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:10px">
      ${kpis}
    </div>

    ${cuerpo}

    <!-- Stock top -->
    ${stockTop.length > 0 ? `
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
            ${stockTop.map(s => `
              <tr style="border-top:1px solid #EEE">
                <td style="padding:4px 8px">${dashEsc(s.nombre_prenda || s.cod_prenda)}</td>
                <td style="padding:4px 8px;font-family:monospace;font-weight:600">${dashEsc(s.talla_key)}</td>
                <td style="padding:4px 8px;text-align:right;color:var(--azul);font-weight:700">${dashNum(s.stock_actual)}</td>
                <td style="padding:4px 8px;text-align:right;color:#888">${dashNum(s.reservado_empaque)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    <!-- (Los accesos rápidos de antes quedaron arriba, en «¿Qué vas a hacer hoy?») -->
    <div style="text-align:center;margin-top:10px">
      <button class="btn btn-ghost btn-sm" onclick="initDashboard()">🔄 Refrescar</button>
    </div>
  `;
}

// ─── Producción de la temporada (vw_plan_produccion, por prenda) ─────
function dashVerPlan() {
  window._prodHintSub = 'plan';
  if (typeof abrirPestana === 'function') abrirPestana('produccion');
  else if (typeof switchTab === 'function') switchTab('produccion');
  // Por si initProduccion no corrió (pestaña ya abierta o sin el atajo)
  if (window._prodHintSub && typeof switchSubProd === 'function') { window._prodHintSub = null; switchSubProd('plan'); }
}

function _renderProduccionTemporada(plan) {
  if (!plan || plan.length === 0) return '';
  const porPrenda = new Map();
  const tot = { pedido: 0, falta_hacer: 0, en_proceso: 0, falta_iniciar: 0 };
  for (const f of plan) {
    let o = porPrenda.get(f.cod_prenda);
    if (!o) {
      o = { cod: f.cod_prenda, pedido: 0, falta_hacer: 0, en_proceso: 0, falta_iniciar: 0 };
      porPrenda.set(f.cod_prenda, o);
    }
    for (const c of Object.keys(tot)) {
      const v = Number(f[c]) || 0;
      o[c] += v;
      tot[c] += v;
    }
  }
  const filas = [...porPrenda.values()].sort((a, b) => dashOrdenPrenda(a.cod) - dashOrdenPrenda(b.cod));
  const td = 'padding:5px 8px;text-align:right';
  const fila = (nombre, o, negrita) => `
            <tr style="border-top:1px solid #EEE;${negrita ? 'font-weight:700' : ''}">
              <td style="padding:5px 8px">${nombre}</td>
              <td style="${td}">${dashNum(o.pedido)}</td>
              <td style="${td};color:var(--azul);font-weight:700">${dashNum(o.falta_hacer)}</td>
              <td style="${td}">${dashNum(o.en_proceso)}</td>
              <td style="${td};color:${o.falta_iniciar > 0 ? DASH_NARANJA : '#888'}">${dashNum(o.falta_iniciar)}</td>
            </tr>`;
  return `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">
        <div style="background:#F5F7FA;padding:8px 12px;font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:8px">
          <span>🧵 Producción de la temporada</span>
          <button class="btn btn-ghost btn-sm" onclick="dashVerPlan()" style="font-size:11px;padding:4px 8px">Ver plan ›</button>
        </div>
        <div style="padding:8px 12px 2px;font-size:13px">
          <span style="font-size:18px;font-weight:700;color:var(--azul)">Falta hacer ${dashNum(tot.falta_hacer)}</span>
          <span style="color:#666"> · ${dashNum(tot.en_proceso)} en proceso · ${dashNum(tot.falta_iniciar)} sin iniciar</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#FAFAFA;font-size:11px">
              <th style="padding:6px 8px;text-align:left">Prenda</th>
              <th style="padding:6px 8px;text-align:right">Pedido</th>
              <th style="padding:6px 8px;text-align:right;color:var(--azul)">Falta hacer</th>
              <th style="padding:6px 8px;text-align:right">En proceso</th>
              <th style="padding:6px 8px;text-align:right">Sin iniciar</th>
            </tr>
          </thead>
          <tbody>${filas.map(o => fila(dashEsc(dashPrendaNombre(o.cod)), o, false)).join('')}</tbody>
          <tfoot>${fila('Total', tot, true)}</tfoot>
        </table>
      </div>`;
}

// ─── Empaque y entrega por prenda (solo si ya hay algo) ──────────────
function _renderEmpaquePorPrenda(lineas) {
  const porPrenda = new Map();
  for (const l of lineas) {
    let o = porPrenda.get(l.cod);
    if (!o) { o = { cod: l.cod, sol: 0, emp: 0, ent: 0, pend: 0 }; porPrenda.set(l.cod, o); }
    o.sol += l.sol; o.emp += l.emp; o.ent += l.ent; o.pend += l.pend;
  }
  const filas = [...porPrenda.values()].sort((a, b) => dashOrdenPrenda(a.cod) - dashOrdenPrenda(b.cod));
  if (!filas.some(o => o.emp > 0 || o.ent > 0)) return '';
  const td = 'padding:5px 8px;text-align:right';
  return `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">
        <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">📦 Empaque y entrega por prenda</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#FAFAFA;font-size:11px">
              <th style="padding:6px 8px;text-align:left">Prenda</th>
              <th style="padding:6px 8px;text-align:right">Pedido</th>
              <th style="padding:6px 8px;text-align:right">Empacado</th>
              <th style="padding:6px 8px;text-align:right">Entregado</th>
              <th style="padding:6px 8px;text-align:right">Falta empacar</th>
            </tr>
          </thead>
          <tbody>
            ${filas.map(o => `
            <tr style="border-top:1px solid #EEE">
              <td style="padding:5px 8px">${dashEsc(dashPrendaNombre(o.cod))}</td>
              <td style="${td}">${dashNum(o.sol)}</td>
              <td style="${td};color:var(--success-text)">${dashNum(o.emp)}</td>
              <td style="${td};color:var(--azul)">${dashNum(o.ent)}</td>
              <td style="${td};color:${o.pend > 0 ? DASH_NARANJA : '#888'};font-weight:700">${dashNum(o.pend)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
}

// ─── Top escuelas con pendientes (vw_pedido_escuela de la temporada) ─
function _renderTopEscuelas(top, modo) {
  if (!top || top.length === 0) return '';
  const accion = modo === 'pedido' ? 'empacar' : 'registro';
  const ayuda = modo === 'pedido' ? 'Abrir el empaque de esta escuela' : 'Ver los alumnos de esta escuela en Registro';
  return `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">
        <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">⚠ Escuelas con más por entregar</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#FAFAFA">
              <th style="padding:6px 8px;text-align:left">Escuela</th>
              <th style="padding:6px 8px;text-align:right">Por entregar</th>
              <th style="padding:6px 8px;text-align:right">Entregado</th>
            </tr>
          </thead>
          <tbody>
            ${top.slice(0,5).map(e => `
              <tr style="border-top:1px solid #EEE;cursor:pointer" onclick="_avanceEscIrA('${accion}','${e.escuela_id}')" title="${ayuda}">
                <td style="padding:6px 8px">
                  <div style="font-weight:600">${dashEsc(e.alias || e.escuela_nombre)}</div>
                  <div style="font-size:10px;color:#888">CDE ${dashEsc(e.codigo_cde)}</div>
                </td>
                <td style="padding:6px 8px;text-align:right;color:${DASH_NARANJA};font-weight:600">${dashNum(e.piezas_pendientes)}</td>
                <td style="padding:6px 8px;text-align:right">${Number(e.porcentaje_avance) || 0}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
}

// ─── Avance por escuela ───────────────────────────────────────────────
// Default colapsado (top 5) para no saturar el dashboard; expandible.
let _avanceEscColapsado = true;
function toggleAvanceEsc() {
  _avanceEscColapsado = !_avanceEscColapsado;
  renderDashboard();
}

// Velocidad por escuela: piezas empacadas en últimos 14 días / 14
const VENTANA_EMPAQUE_DIAS = 14;
function _dashVelocidades(empaquesRec) {
  const piezasPorEsc = {};
  for (const m of empaquesRec || []) {
    if (!m.escuela_id) continue;
    piezasPorEsc[m.escuela_id] = (piezasPorEsc[m.escuela_id] || 0) + (Number(m.cantidad) || 0);
  }
  for (const k of Object.keys(piezasPorEsc)) piezasPorEsc[k] /= VENTANA_EMPAQUE_DIAS;
  return piezasPorEsc;  // escuela_id → piezas/día
}

// Pronóstico de fecha: lo que falta empacar al ritmo de los últimos 14 días
function _dashPronostico(pendientes, velocidad) {
  if (pendientes > 0 && velocidad > 0) {
    const dias = Math.ceil(pendientes / velocidad);
    const fecha = new Date(Date.now() + dias*24*60*60*1000);
    const fechaLbl = fecha.toLocaleDateString('es-SV', { day:'2-digit', month:'short', year:'numeric' });
    const tasaLbl = velocidad.toFixed(1);
    return `<div style="font-size:11px;color:#26a;margin-top:4px"
        title="A ritmo de ${tasaLbl} pieza(s)/día (promedio últimos 14 días)">
        📅 Estimado: <strong>${fechaLbl}</strong> · ${dias} día(s) (${tasaLbl}/día)
      </div>`;
  }
  if (pendientes > 0) {
    return `<div style="font-size:11px;color:#888;margin-top:4px"
        title="Sin actividad de empaque en los últimos 14 días — no se puede estimar">
        📅 Estimado: sin actividad reciente
      </div>`;
  }
  return '';
}

function _dashMarcoAvance(totalEsc, mostrados, cards) {
  const colapsado = _avanceEscColapsado;
  return `
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">
      <div style="background:#F5F7FA;padding:8px 12px;font-weight:600;display:flex;justify-content:space-between;align-items:center">
        <span>🏫 Avance por escuela ${colapsado && totalEsc > 5 ? `(top ${mostrados} de ${totalEsc})` : `(${totalEsc})`}</span>
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

// Temporada por cantidades: pedido vs empacado vs entregado por escuela
function _renderAvancePedido(r, lineas) {
  if (!lineas || lineas.length === 0) return '';
  const escMap = new Map((r.escuelas || []).map(e => [e.id, e]));
  const byEsc = new Map();
  for (const l of lineas) {
    let o = byEsc.get(l.escuela_id);
    if (!o) {
      o = { escuela: escMap.get(l.escuela_id) || { id: l.escuela_id, nombre: 'Escuela sin nombre' },
            sol: 0, emp: 0, ent: 0, pend: 0, lineas: [] };
      byEsc.set(l.escuela_id, o);
    }
    o.sol += l.sol; o.emp += l.emp; o.ent += l.ent; o.pend += l.pend;
    o.lineas.push(l);
  }
  const vel = _dashVelocidades(r.empaquesRec);
  const conPronostico = r.tempSel === r.tempActiva;  // en temporadas pasadas no se estima
  const lista = [...byEsc.values()];
  for (const o of lista) {
    o.pct = o.sol > 0 ? Math.round(100 * o.ent / o.sol) : 0;
    o.pctEmp = o.sol > 0 ? Math.round(100 * o.emp / o.sol) : 0;
    o.velocidad = vel[o.escuela.id] || 0;
  }
  // Más atrasadas primero; a igual avance, la que más le falta
  lista.sort((a, b) => a.pct - b.pct || b.pend - a.pend);

  const totalEsc = lista.length;
  const mostrar = _avanceEscColapsado ? lista.slice(0, 5) : lista;
  const cards = mostrar.map(o => {
    const e = o.escuela;
    const nombre = e.alias || e.nombre || '';
    const cde = e.codigo_cde ? `CDE ${dashEsc(e.codigo_cde)} · ` : '';
    const colorPct = o.pct >= 100 ? 'var(--verde)' : (o.pct > 50 ? 'var(--azul)' : (o.pct > 0 ? DASH_NARANJA : '#999'));
    const falta = o.lineas
      .filter(l => l.pend > 0)
      .sort((a, b) => dashOrdenPrenda(a.cod) - dashOrdenPrenda(b.cod) || dashOrdenTalla(a.talla, b.talla))
      .map(l => `${dashEsc(dashPrendaNombre(l.cod))} ${dashEsc(l.talla)}: <strong>${dashNum(l.pend)}</strong>`);
    return `
      <div class="card" style="padding:10px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:13px">🏫 ${dashEsc(nombre)}</div>
            <div style="font-size:10px;color:#888">${cde}${dashNum(o.sol)} piezas pedidas</div>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div style="font-size:18px;font-weight:700;color:${colorPct}">${o.pct}%</div>
            <div style="font-size:9px;color:#888">entregado</div>
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;font-size:11px">
          <span style="background:#FFF4E6;color:#a85;padding:2px 6px;border-radius:4px"><strong>${dashNum(o.pend)}</strong> falta empacar</span>
          <span style="background:#E0F4E5;color:#2a6;padding:2px 6px;border-radius:4px"><strong>${dashNum(o.emp)}</strong> empacadas</span>
          <span style="background:#E8F0FA;color:#26a;padding:2px 6px;border-radius:4px"><strong>${dashNum(o.ent)}</strong> entregadas</span>
        </div>
        <!-- Barra: entregado (azul) + empacado (verde) -->
        <div style="background:#EEE;height:6px;border-radius:3px;margin-top:6px;overflow:hidden;display:flex"
             title="${o.pct}% entregado · ${o.pctEmp}% empacado sin entregar">
          <div style="background:var(--azul);height:100%;width:${o.pct}%"></div>
          <div style="background:var(--verde);height:100%;width:${o.pctEmp}%"></div>
        </div>
        ${falta.length ? `<div style="font-size:11px;color:#555;margin-top:6px;line-height:1.5">Falta empacar · ${falta.join(' · ')}</div>` : ''}
        ${conPronostico ? _dashPronostico(o.pend, o.velocidad) : ''}
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px">
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('empacar','${e.id}')" style="font-size:11px;padding:4px 8px" title="Empacar piezas para esta escuela">🧺 Empacar</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('entrega','${e.id}')" style="font-size:11px;padding:4px 8px">🚚 Entrega</button>
        </div>
      </div>
    `;
  }).join('');

  return _dashMarcoAvance(totalEsc, mostrar.length, cards);
}

// Temporadas con alumnos (2025): embudo por alumno
// Computa por escuela: pendientes / acaparados (pool disp) / empacados /
// entregados, % avance y dibuja una card por cada una.
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
  const vel = _dashVelocidades(r.empaquesRec);
  const conPronostico = r.tempSel === r.tempActiva;  // en temporadas pasadas no se estima
  for (const o of Object.values(byEsc)) {
    o.velocidad = vel[o.escuela.id] || 0;  // piezas/día
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
  const mostrar = _avanceEscColapsado ? lista.slice(0, 5) : lista;

  const cards = mostrar.map(o => {
    const e = o.escuela;
    const alias = e.alias || e.nombre || '';
    const cde = e.codigo_cde ? `CDE ${dashEsc(e.codigo_cde)}` : '';
    const barraColor = o.pct >= 100 ? 'var(--verde)' : (o.pct > 50 ? 'var(--azul)' : (o.pct > 0 ? DASH_NARANJA : '#ccc'));
    return `
      <div class="card" style="padding:10px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:13px">🏫 ${dashEsc(alias)}</div>
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
        ${conPronostico ? _dashPronostico(o.pendientes, o.velocidad) : ''}
        <!-- Atajos -->
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px">
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('registro','${e.id}')" style="font-size:11px;padding:4px 8px">📋 Registro</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('empacar','${e.id}')" style="font-size:11px;padding:4px 8px" title="Sesión de empaque: marcar piezas, reservar o empacar">🧺 Empacar</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('entrega','${e.id}')" style="font-size:11px;padding:4px 8px">🚚 Entrega</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('lista','${e.id}')" style="font-size:11px;padding:4px 8px" title="Descargar PDF de la lista de empaque">🖨 Lista</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('resumen','${e.id}')" style="font-size:11px;padding:4px 8px" title="Descargar resumen ejecutivo PDF (2 hojas)">📑 Resumen</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('bolsa','${e.id}')" style="font-size:11px;padding:4px 8px" title="Etiquetas grandes para bolsa (2 por hoja)">🏷 Bolsa</button>
        </div>
      </div>
    `;
  }).join('');

  return _dashMarcoAvance(totalEsc, mostrar.length, cards);
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
  // Fase 2 empaque unificado: acaparar y empacar van a la SESIÓN DE EMPAQUE
  // con la escuela ya elegida (reservar vive adentro como 🔒 Reservar).
  if (accion === 'acaparar' || accion === 'empacar') {
    window._emqHintEscuela = escId;
    if (typeof switchTab === 'function') switchTab('empaque');
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

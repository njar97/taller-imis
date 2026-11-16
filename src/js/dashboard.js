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
  // PANTALLA ÚNICA: 1) cómo vamos · 2) los 4 pasos del día · 3) desglose ·
  // 4) «Todo lo demás». Los pasos se pintan antes de cargar datos: si la
  // red falla, igual se puede ir a trabajar.
  cont.innerHTML = `
    <div id="dash-como-vamos">
      <div class="card text-muted" style="padding:20px;text-align:center;margin-bottom:10px">Cargando cómo vamos...</div>
    </div>
    ${tareasInicioHtml()}
    <div id="dashboard-sub-contenido"></div>
    <button type="button" class="menumas-btn" style="margin-top:6px" onclick="switchTab('mas')">
      <span class="menumas-ico">☰</span><span><strong>Más</strong></span>
    </button>
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
// Solo los 4 pasos del trabajo, en el orden en que pasa. Lo demás (entrada
// y conteo de bodega, tallas especiales…) se abre desde «Todo lo demás».
// tareaIr() sigue aceptando los otros ids (los usa el buscador).
const TAREAS_INICIO = [
  { id: 'corte',    n: 1, ico: '✂️', tit: 'Tender' },
  { id: 'bulto',    n: 2, ico: '🧵', tit: 'Terminar' },
  { id: 'empacar',  n: 3, ico: '🧺', tit: 'Empacar' },
  { id: 'entregar', n: 4, ico: '🚚', tit: 'Entregar' },
];
// Texto vivo debajo de cada paso («Sigue Plan T1 · faltan 6»…).
function tareaSubtitulo(id, txt) {
  const el = document.getElementById('tarea-sub-' + id);
  if (el && txt) el.textContent = txt;
}

function tareasInicioHtml() {
  const ayuda = typeof ayudaHtml === 'function'
    ? ayudaHtml('inicio', 'Arriba, cómo va el trabajo: verde es lo que ya está en bodega, amarillo lo que está en costura y gris lo que falta empezar. «Detalle» lo abre por prenda y por talla. Los cuatro botones son los pasos del trabajo: tocá el que vas a anotar. «Urge» son las tallas con más piezas sin empezar. «Listo» son las escuelas a las que ya se les puede empacar algo; el número es cuántas piezas. «Más» abre el resto de pantallas. Con 🏠 se vuelve aquí.')
    : '';
  return `
    <section class="card tareas-card" aria-label="Pasos del trabajo">
      ${ayuda}
      <div class="tareas-grid">
        ${TAREAS_INICIO.map(t => `
        <button type="button" class="tarea-btn" data-tarea="${t.id}" onclick="tareaIr('${t.id}')">
          <span class="tarea-ico" aria-hidden="true">${t.ico}</span>
          <span class="tarea-tit">${t.tit}</span>
        </button>`).join('')}
      </div>
    </section>`;
}

// ── «Hoy sigue»: el tendido que toca y lo que está en costura ─────────
// Dos renglones arriba de los botones; se llenan aparte para no frenar Inicio.
let _hoySigue = { t: 0, corte: '', bulto: '' };
async function cargarHoySigue() {
  const pintar = () => { tareaSubtitulo('corte', _hoySigue.corte); tareaSubtitulo('bulto', _hoySigue.bulto); };
  if (_hoySigue.t && Date.now() - _hoySigue.t < 60000) { pintar(); return; }
  try {
    const [pend, bultos] = await Promise.all([
      supaFetch('vw_trazos_sin_tendido', 'GET', null, '?select=id,codigo_corte&limit=50').catch(() => []),
      supaFetch('vw_produccion_estado', 'GET', null, '?select=fecha_corte,estado_manual,cantidad_original&limit=2000').catch(() => []),
    ]);
    let txtCorte = 'No hay tendidos pendientes', txtBulto = 'No hay bultos en costura';
    if (pend.length) {
      pend.sort((a, b) => String(a.codigo_corte || '').localeCompare(String(b.codigo_corte || ''), 'es', { numeric: true }));
      txtCorte = `Sigue ${pend[0].codigo_corte} · ${pend.length === 1 ? 'es el último' : 'faltan ' + pend.length}`;
    }
    const desde = typeof CORTES_DESDE === 'string' ? CORTES_DESDE : '';
    const enCostura = (bultos || []).filter(b => b.estado_manual !== 'terminado' && (!b.fecha_corte || String(b.fecha_corte) >= desde));
    if (enCostura.length) {
      const pz = enCostura.reduce((s, b) => s + (Number(b.cantidad_original) || 0), 0);
      txtBulto = `${dashNum(enCostura.length)} bultos en costura · ${dashNum(pz)} piezas`;
    }
    _hoySigue = { t: Date.now(), corte: txtCorte, bulto: txtBulto };
    pintar();
  } catch (_) { /* sin estos textos Inicio sigue sirviendo */ }
}

// Los 4 pasos de Inicio abren su pantalla en «modo paso»: solo lo de ese
// paso, sin los sub-menús (css body.modo-paso). Por «Todo lo demás» se
// entra a la pantalla completa.
function tareaIr(id) {
  _tareaIr(id);
  if (TAREAS_INICIO.some(t => t.id === id)) document.body.classList.add('modo-paso');
}
function _tareaIr(id) {
  const ir = typeof abrirPestana === 'function' ? abrirPestana : (t) => switchTab(t);
  switch (id) {
    case 'corte':        // Corte → ▶ Sigue (tendidos que faltan, con «Tender este»)
      ir('corte');
      if (typeof switchSubCorte === 'function') switchSubCorte('sigue');
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
    const talla = tallaPedido2026(p.cod_prenda, p.talla_key);
    const cod = codPedido2026(p.cod_prenda);   // 2026: lo pedido como blusa es camisa
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
          '?select=cod_prenda,nombre_prenda,talla_2026,pedido,falta_hacer,en_proceso,falta_iniciar,contado')]);
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
  const hoy = hoyLocal();
  try {
    // Hoy y los 6 días anteriores (para «Cómo vamos»)
    const d = new Date(); d.setDate(d.getDate() - 6);
    const desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const bultos = await supaFetch('produccion_bulto', 'GET', null,
      `?fecha_terminado=gte.${desde}&estado=eq.terminado&select=fecha_terminado,cantidad_final&limit=2000`);
    const deHoy = bultos.filter(b => b.fecha_terminado === hoy);
    const suma = arr => arr.reduce((s,b) => s + (b.cantidad_final || 0), 0);
    return { bultos: deHoy.length, piezas: suma(deHoy), bultos7: bultos.length, piezas7: suma(bultos) };
  } catch(e) {
    return { bultos: 0, piezas: 0, bultos7: 0, piezas7: 0 };
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
  cargarHoySigue();

  const r = dashboardCache.resumen;
  const sel = r.tempSel || null;
  const esActiva = !!sel && sel === r.tempActiva;

  // Stock (todas las tallas; la tabla muestra las 10 con más)
  const stock = (r.stock || [])
    .filter(s => !(r.modo === 'pedido' && bodegaNoSeEntrega(s.cod_prenda || s.nombre_prenda)))   // blusas viejas: no se entregan
    .sort((a, b) => (Number(b.stock_actual) || 0) - (Number(a.stock_actual) || 0));
  const stockTotal = stock.reduce((s,x) => s + Math.max(0, Number(x.stock_actual) || 0), 0);
  const stockReservado = stock.reduce((s,x) => s + (Number(x.reservado_empaque) || 0), 0);
  const stockTop = stock.filter(s => (Number(s.stock_actual) || 0) > 0).slice(0, 10);

  const kpiHoy = _dashKpi('Producido hoy', dashNum(r.produccionHoy?.piezas), `${r.produccionHoy?.bultos || 0} bulto(s)`, 'var(--azul)');
  const kpiStock = _dashKpi('Stock en bodega', dashNum(stockTotal), `${dashNum(stockReservado)} reservadas`, 'var(--verde)');

  let banner, kpis, cuerpo;
  let comoVamos = '';          // tarjeta de arriba (solo temporada por pedido)
  let verStock = true;         // «Stock top 10»: en 2026 se ve en Bodega
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
    // Pantalla única: sin cartel ni cuadritos; todo eso va dentro de «Cómo vamos».
    dashboardCache.cvTot = tot;
    comoVamos = _renderComoVamos(r.plan, r.produccionHoy, tot)
      || `<div class="card" style="padding:12px;margin-bottom:10px">${dashEsc(sel?.nombre || '')}: ${dashNum(tot.sol)} piezas pedidas · ${dashNum(tot.emp)} empacadas · ${dashNum(tot.ent)} entregadas</div>`;
    banner = ''; kpis = ''; verStock = false;
    tareaSubtitulo('empacar', tot.pend > 0 ? `Faltan ${dashNum(tot.pend)} piezas por empacar` : 'Todo está empacado');
    tareaSubtitulo('entregar', tot.emp > 0 ? `${dashNum(tot.emp)} piezas empacadas por entregar` : 'Todavía no hay nada empacado');
    cuerpo = _renderQueUrge(r.plan)
      + '<div id="dash-listo-empacar"></div>'
      + _renderEmpaquePorPrenda(lineas)
      // («Escuelas con más por entregar» repetía «Avance por escuela»: quitada)
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

  const cv = document.getElementById('dash-como-vamos');
  if (cv) cv.innerHTML = comoVamos;
  if (r.modo === 'pedido' && esActiva) setTimeout(cargarListoEmpacar, 0);   // se llena aparte, sin frenar Inicio

  cont.innerHTML = `
    ${avisoFallidos}
    <!-- Fila 1: Temporada (solo temporadas con alumnos) -->
    ${banner}

    <!-- Fila 2: 4 KPIs -->
    ${kpis ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:10px">
      ${kpis}
    </div>` : ''}

    ${cuerpo}

    <!-- Stock top -->
    ${verStock && stockTop.length > 0 ? `
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
                <td style="padding:4px 8px">${dashEsc(prendaBonita(s.nombre_prenda || s.cod_prenda))}</td>
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
    ${_dashSelectorTemporada(r.temporadas, sel?.id)}
    <div style="text-align:center;margin:10px 0">
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

// «Cómo vamos»: por prenda, una barra con lo que ya está en bodega, lo que
// está en costura y lo que falta empezar. Las tres partes suman el pedido.
const CV_VERDE = '#2E9E5B', CV_AMBAR = '#E6A23C', CV_GRIS = '#D9DEE5';
function _cvBarra(o, alto) {
  const pct = v => o.pedido > 0 ? (100 * v / o.pedido) : 0;
  const seg = (v, color) => v > 0 ? `<div style="width:${pct(v).toFixed(2)}%;background:${color}"></div>` : '';
  return `<div style="display:flex;height:${alto}px;border-radius:${alto / 2}px;overflow:hidden;background:${CV_GRIS}">${seg(o.listo, CV_VERDE)}${seg(o.costura, CV_AMBAR)}</div>`;
}
function _cvLeyenda(o) {
  const punto = c => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:4px"></span>`;
  const parte = (c, n, txt) => n <= 0 ? '' : `<span style="white-space:nowrap;margin-right:10px">${punto(c)}<strong>${dashNum(n)}</strong> ${txt}</span>`;
  return parte(CV_VERDE, o.listo, 'en bodega') + parte(CV_AMBAR, o.costura, 'en costura') + parte('#B4BCC8', o.sin, 'sin empezar');
}
// Prendas abiertas (se ve su tabla por talla). Tocar la prenda abre o cierra.
const _cvAbiertas = new Set();
// El desglose por prenda arranca cerrado: arriba queda solo el total y,
// enseguida, los 4 pasos. cvToggle() sin código abre o cierra el desglose.
let _cvPorPrenda = false;
function cvToggle(cod) {
  if (!cod) _cvPorPrenda = !_cvPorPrenda;
  else if (_cvAbiertas.has(cod)) _cvAbiertas.delete(cod); else _cvAbiertas.add(cod);
  const r = dashboardCache.resumen || {};
  const cv = document.getElementById('dash-como-vamos');
  if (cv) cv.innerHTML = _renderComoVamos(r.plan, r.produccionHoy, dashboardCache.cvTot);
}
function _cvTallas(o) {
  const td = 'padding:5px 6px;text-align:right';
  const filas = o.tallas.slice().sort((a, b) => dashOrdenTalla(a.talla, b.talla));
  return `
          <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;background:#FAFBFC;border-radius:8px;overflow:hidden">
            <thead><tr style="font-size:11px;color:#555">
              <th style="padding:6px;text-align:left">Talla</th>
              <th style="${td}">Pedido</th>
              <th style="${td};color:${CV_VERDE}">En bodega</th>
              <th style="${td};color:#B7791F">En costura</th>
              <th style="${td}">Sin empezar</th>
            </tr></thead>
            <tbody>${filas.map(t => `
              <tr style="border-top:1px solid #ECEFF3">
                <td style="padding:5px 6px;font-weight:700">${dashEsc(t.talla)}</td>
                <td style="${td}">${dashNum(t.pedido)}</td>
                <td style="${td}">${dashNum(t.listo)}</td>
                <td style="${td}">${dashNum(t.costura)}</td>
                <td style="${td};font-weight:${t.sin > 0 ? 700 : 400}">${dashNum(t.sin)}</td>
              </tr>`).join('')}</tbody>
          </table>`;
}
function _renderComoVamos(plan, prod, totEmp) {
  if (!plan || plan.length === 0) return '';
  const porPrenda = new Map();
  const tot = { pedido: 0, listo: 0, costura: 0, sin: 0 };
  for (const f of plan) {
    let o = porPrenda.get(f.cod_prenda);
    if (!o) { o = { cod: f.cod_prenda, pedido: 0, listo: 0, costura: 0, sin: 0, tallas: [] }; porPrenda.set(f.cod_prenda, o); }
    const pedido = Number(f.pedido) || 0, falta = Number(f.falta_hacer) || 0;
    const v = {
      pedido,
      listo: Math.max(0, pedido - falta),                       // ya en bodega y sirve
      costura: Math.min(Number(f.en_proceso) || 0, falta),      // cortado o cosiéndose (sin pasarse de lo que falta)
      sin: Number(f.falta_iniciar) || 0,                        // ni cortado
    };
    for (const c of Object.keys(tot)) { o[c] += v[c]; tot[c] += v[c]; }
    o.tallas.push({ talla: f.talla_2026, ...v });
  }
  const filas = [...porPrenda.values()].sort((a, b) => dashOrdenPrenda(a.cod) - dashOrdenPrenda(b.cod));
  const pctListo = o => o.pedido > 0 ? Math.floor(100 * o.listo / o.pedido) : 0;
  const p = prod || {};
  return `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">
        <div style="background:#F5F7FA;padding:8px 12px;font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:8px">
          <span>📊 Cómo vamos</span>
          <button class="btn btn-ghost btn-sm" onclick="initDashboard()" style="font-size:11px;padding:4px 8px" title="Volver a cargar los números">🔄</button>
        </div>
        <div style="padding:10px 12px 12px;border-bottom:1px solid #EEE">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px">
            <span style="font-size:13px;color:#555">${dashNum(tot.pedido)} piezas</span>
            <span style="font-size:20px;font-weight:700;color:${CV_VERDE}">${pctListo(tot)}%</span>
          </div>
          ${_cvBarra(tot, 16)}
          <div style="font-size:12px;margin-top:6px;line-height:1.7">${_cvLeyenda(tot)}</div>
        </div>
        <button type="button" class="cv-ver" aria-expanded="${_cvPorPrenda}" onclick="cvToggle()">
          <span>${_cvPorPrenda ? '▾ Detalle' : '▸ Detalle'}</span>
        </button>
        ${!_cvPorPrenda ? '' : `
        <div style="padding:8px 12px;border-bottom:1px solid #F0F0F0;font-size:12px;color:#555">
          Hoy <strong>${dashNum(p.piezas)}</strong> · 7 días <strong>${dashNum(p.piezas7)}</strong>${totEmp ? ` · Empacado <strong>${dashNum(totEmp.emp)}</strong> · Entregado <strong>${dashNum(totEmp.ent)}</strong>` : ''}
        </div>` + filas.map(o => `
        <div class="cv-prenda" role="button" tabindex="0" aria-expanded="${_cvAbiertas.has(o.cod)}" onclick="cvToggle('${o.cod}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();cvToggle('${o.cod}')}" style="padding:9px 12px;border-bottom:1px solid #F0F0F0;cursor:pointer">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px">
            <span style="font-weight:600;font-size:13px"><span style="color:#889;display:inline-block;width:14px">${_cvAbiertas.has(o.cod) ? '▾' : '▸'}</span>${dashEsc(dashPrendaNombre(o.cod))} <span style="font-weight:400;color:#888;font-size:11px">· ${dashNum(o.pedido)} pedidas</span></span>
            <span style="font-size:12px;font-weight:700;color:${o.listo > 0 ? CV_VERDE : '#999'}">${pctListo(o)}%</span>
          </div>
          ${_cvBarra(o, 10)}
          <div style="font-size:11px;color:#444;margin-top:4px;line-height:1.7">${_cvLeyenda(o)}</div>
          ${_cvAbiertas.has(o.cod) ? _cvTallas(o) : ''}
        </div>`).join('')}
      </div>`;
}

// ─── «Qué urge»: las tallas con más piezas sin empezar (ni cortadas) ──
function _renderQueUrge(plan) {
  const filas = (plan || []).filter(f => (Number(f.falta_iniciar) || 0) > 0)
    .sort((a, b) => (Number(b.falta_iniciar) || 0) - (Number(a.falta_iniciar) || 0)).slice(0, 4);
  if (!filas.length) return '';
  return `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">
        <div style="background:#F5F7FA;padding:8px 12px;font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:8px">
          <span>⏰ Urge</span>
          <button class="btn btn-ghost btn-sm" onclick="dashVerPlan()" style="font-size:11px;padding:4px 8px">Plan ›</button>
        </div>
        ${filas.map(f => `
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:8px 12px;border-top:1px solid #F0F0F0">
          <span style="font-size:13.5px"><strong>${dashEsc(dashPrendaNombre(f.cod_prenda))} ${dashEsc(f.talla_2026)}</strong>${f.contado === false ? ' <span style="font-size:10.5px;color:#8a4b00" title="Bodega sin contar este año">· sin contar</span>' : ''}</span>
          <span style="font-size:13px;white-space:nowrap"><strong style="color:${DASH_NARANJA}">${dashNum(f.falta_iniciar)}</strong></span>
        </div>`).join('')}
      </div>`;
}

// ─── «Listo para empacar»: escuelas a las que ya se les puede empacar
// algo con lo que hay en bodega (el mismo cálculo de 🧺 Empaque). Varias
// escuelas pueden contar las mismas piezas: es «lo que se podría», no un reparto.
async function cargarListoEmpacar() {
  const el = document.getElementById('dash-listo-empacar');
  if (!el || typeof emqCargarCant !== 'function') return;
  try {
    const ctx = await emqCargarCant(null);
    const escuelas = (dashboardCache.resumen && dashboardCache.resumen.escuelas) || [];
    const filas = [];
    for (const e of escuelas) {
      if (!ctx.escuelasPedido.has(e.id)) continue;
      const s = emqSumar(emqLineasEscuela(ctx, e.id));
      if (s.puede > 0) filas.push({ id: e.id, nombre: e.alias || e.nombre, puede: s.puede, falta: s.falta });
    }
    filas.sort((a, b) => b.puede - a.puede);
    const el2 = document.getElementById('dash-listo-empacar');
    if (!el2) return;
    if (!filas.length) { el2.innerHTML = ''; return; }
    el2.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">
        <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">🧺 Listo</div>
        ${filas.slice(0, 5).map(f => `
        <button type="button" class="listo-fila" onclick="dashEmpacarEscuela('${f.id}')">
          <span style="flex:1;min-width:0"><strong>${dashEsc(f.nombre)}</strong></span>
          <span style="text-align:right;white-space:nowrap"><strong style="color:${CV_VERDE};font-size:17px">${dashNum(f.puede)}</strong></span>
          <span aria-hidden="true" style="color:#9aa;font-size:20px">›</span>
        </button>`).join('')}
        ${filas.length > 5 ? `<div style="padding:8px 12px;font-size:12px;color:#666;border-top:1px solid #F0F0F0">+${filas.length - 5} más</div>` : ''}
      </div>`;
  } catch (e) {
    console.warn('[inicio] listo para empacar:', e && e.message || e);
  }
}
function dashEmpacarEscuela(escId) {
  window._emqHintEscuela = escId;
  abrirPestana('empaque');
  document.body.classList.add('modo-paso');
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

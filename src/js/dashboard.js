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
    <button type="button" class="menumas-btn mas-inicio" onclick="switchTab('mas')">
      <span class="tj-ico tj-gris">${ico('mas')}</span><span class="mas-txt"><strong>Más</strong><small class="solo-asistencia">Bodega, registro, estadística, ajustes y las pantallas completas</small></span>${ico('ir')}
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
// Icono dibujado del sprite de nav.html (#i-nombre). Toma el color del texto.
function ico(n) { return `<svg class="ico" aria-hidden="true"><use href="#i-${n}"/></svg>`; }
const TAREAS_INICIO = [
  { id: 'corte',    n: 1, ico: 'tijera', tit: 'Tender',   sub: 'El corte que sigue' },
  { id: 'bulto',    n: 2, ico: 'hilo', tit: 'Terminar', sub: 'El bulto sale de costura y entra a bodega' },
  { id: 'empacar',  n: 3, ico: 'caja', tit: 'Empacar',  sub: 'Apartar lo de una escuela' },
  { id: 'entregar', n: 4, ico: 'camion', tit: 'Entregar', sub: 'Lo empacado se va a la escuela' },
];
// Texto vivo debajo de cada paso («Sigue Plan T1 · faltan 6»…).
function tareaSubtitulo(id, txt) {
  const el = document.getElementById('tarea-sub-' + id);
  if (el && txt) el.textContent = txt;
}

function tareasInicioHtml() {
  const ayuda = typeof ayudaHtml === 'function'
    ? ayudaHtml('inicio', 'Arriba, cómo va el trabajo: verde es lo que ya está en bodega, amarillo lo que está en costura y gris lo que falta empezar. «Detalle» lo abre por prenda y por talla. Los cuatro botones son los pasos del trabajo: tocá el que vas a anotar. «Urge» son las tallas con más piezas sin empezar. «Listo» son las escuelas a las que ya se les puede empacar algo; el número es cuántas piezas. «Más» abre el resto de pantallas. Con la casita de arriba se vuelve aquí.')
    : '';
  return `
    <section class="card tareas-card" aria-label="Pasos del trabajo">
      ${ayuda}
      <div class="tareas-grid">
        ${TAREAS_INICIO.map(t => `
        <button type="button" class="tarea-btn paso-${t.n}" data-tarea="${t.id}" onclick="tareaIr('${t.id}')">
          <span class="paso-n" aria-hidden="true">${t.n}</span>
          <span class="tarea-ico" aria-hidden="true">${ico(t.ico)}</span>
          <span class="tarea-tit">${t.tit}</span>
          <span class="tarea-sub solo-asistencia" id="tarea-sub-${t.id}">${t.sub}</span>
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
    // Para «Urge»: en qué corte pendiente sale cada talla
    if (pend.length) {
      const tz = await supaFetch('trazo', 'GET', null,
        `?id=in.(${pend.map(x => x.id).join(',')})&select=id,codigo_corte,capas,tallas_tendido`).catch(() => []);
      tz.sort((a, b) => String(a.codigo_corte || '').localeCompare(String(b.codigo_corte || ''), 'es', { numeric: true }));
      dashboardCache.trazosPend = tz;
    } else dashboardCache.trazosPend = [];
    urgePintar();
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

// Nombre corto de cada empresa (código de la tabla proveedor → botón).
const EMPRESA_CORTA = { IMIS: 'IMIS', NELSON: 'JAV', AMERICA: 'AME' };
// Empresa elegida en Inicio (null = todas). Se recuerda por aparato.
let _dashEmpresa = null;
try { _dashEmpresa = localStorage.getItem('dash-empresa') || null; } catch (e) { /* sin almacenamiento */ }
function dashElegirEmpresa(emp) {
  _dashEmpresa = emp || null;
  try { emp ? localStorage.setItem('dash-empresa', emp) : localStorage.removeItem('dash-empresa'); } catch (e) { /* nada */ }
  _avEscAbierta = null;
  renderDashboard();
}
// escuela_id → empresa, sacado de los contratos del pedido.
function dashEmpresaPorEscuela(pedidoTemp) {
  const porContrato = new Map((pedidoTemp?.contratos || []).map(c => [c.id, c.empresa]));
  const m = new Map();
  for (const p of pedidoTemp?.pedido || []) {
    const emp = porContrato.get(p.contrato_id);
    if (emp && !m.has(p.escuela_id)) m.set(p.escuela_id, emp);
  }
  return m;
}

// Pedido de una temporada = el de todos sus contratos.
async function pedidoDeTemporada(temporadaId) {
  return cachedFetch('pedido-temp-' + temporadaId, async () => {
    const contratos = await supaFetch('contrato', 'GET', null,
      `?temporada_id=eq.${temporadaId}&select=id,codigo,proveedor_id`);
    if (!contratos || contratos.length === 0) return { contratos: [], pedido: [] };
    // Empresa de cada contrato (IMIS, JAV, AME). Si falla, el filtro no sale.
    const provs = await supaFetch('proveedor', 'GET', null, '?select=id,codigo').catch(() => []);
    const provCod = new Map((provs || []).map(p => [p.id, p.codigo]));
    for (const c of contratos) {
      const cod = provCod.get(c.proveedor_id);
      c.empresa = cod ? (EMPRESA_CORTA[cod] || cod) : null;
    }
    const pedido = await supaFetchAll('pedido',
      `?contrato_id=in.(${contratos.map(c => c.id).join(',')})` +
      '&select=escuela_id,contrato_id,nivel,cod_prenda,nombre_prenda,talla_key,cantidad_solicitada,cantidad_entregada');
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
      // Tela que entregó el MINED (rollos de bodega), para «Cómo vamos».
      if (sel === activa) {
        tareas.push(['tela', () => cachedFetch('dashboard-tela',
          () => supaFetchAll('tela_rollo', '?select=escuela_id,color,yardas,yardas_disponibles,fecha_retiro'),
          { ttl: 60_000, group: 'tela' })]);
        // Tendidos hechos (lo que se gastó en cada uno).
        tareas.push(['tendidos', () => cachedFetch('dashboard-tendidos', async () => {
          const [ts, rs] = await Promise.all([
            supaFetchAll('tendido', '?select=id,fecha,letra_corte,codigo_corte,prendas&order=fecha'),
            supaFetchAll('tendido_rollo', '?select=tendido_id,yardas_rollo,yardas_sobrantes,lienzos_salidos'),
          ]);
          const m = new Map((ts || []).map(t => [t.id, { ...t, yd: 0, telas: 0 }]));
          for (const x of rs || []) {
            const t = m.get(x.tendido_id);
            if (!t) continue;
            t.yd += Math.max(0, (Number(x.yardas_rollo) || 0) - (Number(x.yardas_sobrantes) || 0));
            t.telas += Number(x.lienzos_salidos) || 0;
          }
          return [...m.values()];
        }, { ttl: 60_000, group: 'tela' })]);
      }
      // vw_plan_produccion es el plan de la temporada en curso
      if (sel === activa) {
        tareas.push(['plan', () => supaFetch('vw_plan_produccion', 'GET', null,
          '?select=cod_prenda,nombre_prenda,talla_2026,pedido,falta_hacer,en_proceso,falta_iniciar,contado,fuera')]);
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
    const todas = avancePedidoTemporada(r.pedidoTemp?.pedido, r.acap, r.equiv);
    // Filtro por empresa: solo lo pedido, empacado y entregado de sus escuelas.
    const empEsc = dashEmpresaPorEscuela(r.pedidoTemp);
    dashboardCache.empresas = [...new Set(empEsc.values())].sort();
    if (_dashEmpresa && !dashboardCache.empresas.includes(_dashEmpresa)) _dashEmpresa = null;
    dashboardCache.empEsc = empEsc;
    const lineas = _dashEmpresa ? todas.filter(l => empEsc.get(l.escuela_id) === _dashEmpresa) : todas;
    dashboardCache.cvLineas = lineas;
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
        <div style="background:#F5F7FA;padding:8px 12px;font-weight:600"><svg class="ico" aria-hidden="true" width="1em" height="1em"><use href="#i-caja"/></svg> Stock disponible (top 10)</div>
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
      <button class="btn btn-ghost btn-sm" onclick="initDashboard()">${ico('recargar')} Refrescar</button>
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
const CV_VERDE = '#2E9E5B', CV_AMBAR = '#F0A531', CV_GRIS = '#E3E8EF';
const CV_MORADO = '#6B3FA0';   // lo entregado (mismo color que el paso «Entregar»)
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
// Nombre corto de escuela para tablas angostas (sin «Centro Escolar», etc.).
function dashEscuelaCorta(e) {
  const n = String((e && (e.alias || e.nombre)) || '¿?');
  return n.replace(/^(centro escolar|complejo educativo|instituto nacional|c\.\s*e\.|ce)\s+/i, '').trim() || n;
}
// Una prenda abierta: sus escuelas en filas y sus tallas en columnas.
// Sale de las líneas del pedido (ya filtradas por empresa si hay una).
function _cvTablaEscuelas(cod, lineas) {
  const escMap = new Map(((dashboardCache.resumen || {}).escuelas || []).map(e => [e.id, e]));
  const tallas = new Set(), porEsc = new Map(), totT = new Map();
  for (const l of lineas || []) {
    if (l.cod !== cod || !(l.sol > 0)) continue;
    tallas.add(l.talla);
    let o = porEsc.get(l.escuela_id);
    if (!o) { o = { id: l.escuela_id, total: 0, t: new Map() }; porEsc.set(l.escuela_id, o); }
    o.t.set(l.talla, (o.t.get(l.talla) || 0) + l.sol);
    o.total += l.sol;
    totT.set(l.talla, (totT.get(l.talla) || 0) + l.sol);
  }
  if (!porEsc.size) return '';
  const ts = [...tallas].sort(dashOrdenTalla);
  const filas = [...porEsc.values()].sort((a, b) => b.total - a.total);
  const td = 'padding:5px 6px;text-align:right;white-space:nowrap';
  const totGen = filas.reduce((s, o) => s + o.total, 0);
  return `
          <div style="overflow-x:auto;margin-top:8px">
          <table style="width:100%;border-collapse:collapse;font-size:12px;background:#FAFBFC;border-radius:8px;overflow:hidden">
            <thead><tr style="font-size:11px;color:#555">
              <th style="padding:6px;text-align:left">Escuela</th>
              ${ts.map(t => `<th style="${td}">${dashEsc(t)}</th>`).join('')}
              ${ts.length > 1 ? `<th style="${td}">Total</th>` : ''}
            </tr></thead>
            <tbody>${filas.map(o => `
              <tr style="border-top:1px solid #ECEFF3">
                <td style="padding:5px 6px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${dashEsc((escMap.get(o.id) || {}).nombre || '')}">${dashEsc(dashEscuelaCorta(escMap.get(o.id)))}</td>
                ${ts.map(t => `<td style="${td}">${o.t.get(t) ? dashNum(o.t.get(t)) : '<span style="color:#C3CAD3">—</span>'}</td>`).join('')}
                ${ts.length > 1 ? `<td style="${td};font-weight:700">${dashNum(o.total)}</td>` : ''}
              </tr>`).join('')}
              <tr style="border-top:2px solid #DDE3EA;font-weight:700">
                <td style="padding:5px 6px">Total</td>
                ${ts.map(t => `<td style="${td}">${dashNum(totT.get(t))}</td>`).join('')}
                ${ts.length > 1 ? `<td style="${td}">${dashNum(totGen)}</td>` : ''}
              </tr>
            </tbody>
          </table>
          </div>`;
}
// Botones Todas · IMIS · JAV · AME (solo si hay más de una empresa).
function _cvFiltroEmpresa() {
  const emps = dashboardCache.empresas || [];
  if (emps.length < 2) return '';
  const b = (val, txt) => `<button type="button" class="btn btn-sm ${(_dashEmpresa || null) === val ? 'btn-primary' : 'btn-ghost'}" aria-pressed="${(_dashEmpresa || null) === val}" onclick="dashElegirEmpresa(${val ? `'${val}'` : 'null'})">${txt}</button>`;
  return `<div class="cv-empresas" style="display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px 0">${b(null, 'Todas')}${emps.map(e => b(e, dashEsc(e))).join('')}</div>`;
}
// «Cómo vamos» de UNA empresa: lo pedido por sus escuelas, lo empacado y lo
// entregado. Lo de producción (bodega, costura) es del taller entero y se
// muestra aparte, gris, para saber si hay con qué empacar.
function _renderComoVamosEmpresa(plan, lineas) {
  const planIdx = new Map((plan || []).map(f => [f.cod_prenda + '|' + f.talla_2026, f]));
  const porPrenda = new Map();
  const tot = { pedido: 0, emp: 0, ent: 0, pend: 0 };
  for (const l of lineas) {
    let o = porPrenda.get(l.cod);
    if (!o) { o = { cod: l.cod, pedido: 0, emp: 0, ent: 0, pend: 0, tallas: new Map() }; porPrenda.set(l.cod, o); }
    let t = o.tallas.get(l.talla);
    if (!t) { t = { talla: l.talla, pedido: 0, emp: 0, ent: 0, pend: 0 }; o.tallas.set(l.talla, t); }
    for (const [c, v] of [['pedido', l.sol], ['emp', l.emp], ['ent', l.ent], ['pend', l.pend]]) { t[c] += v; o[c] += v; tot[c] += v; }
  }
  const filas = [...porPrenda.values()].sort((a, b) => dashOrdenPrenda(a.cod) - dashOrdenPrenda(b.cod));
  const pct = o => o.pedido > 0 ? Math.floor(100 * (o.emp + o.ent) / o.pedido) : 0;
  const barra = (o, alto) => {
    const w = v => o.pedido > 0 ? (100 * v / o.pedido).toFixed(2) : 0;
    return `<div style="display:flex;height:${alto}px;border-radius:${alto / 2}px;overflow:hidden;background:${CV_GRIS}">${o.ent > 0 ? `<div style="width:${w(o.ent)}%;background:${CV_MORADO}"></div>` : ''}${o.emp > 0 ? `<div style="width:${w(o.emp)}%;background:${CV_VERDE}"></div>` : ''}</div>`;
  };
  // Lo que hay en bodega (todo el taller) de las tallas de esta prenda.
  const bodega = o => {
    const ts = [...o.tallas.keys()].sort(dashOrdenTalla).map(t => {
      const f = planIdx.get(o.cod + '|' + t);
      return [t, f ? Math.max(0, (Number(f.pedido) || 0) - (Number(f.falta_hacer) || 0)) : 0];
    });
    return `<div style="font-size:11px;color:#8A94A3;margin-top:6px">En bodega del taller (para las 3): ${ts.map(([t, n]) => `${dashEsc(t)} <strong>${dashNum(n)}</strong>`).join(' · ')}</div>`;
  };
  return `
      <div class="card tj">
        <div class="tj-cab">
          <span class="tj-ico tj-verde">${ico('avance')}</span>
          <h2>Cómo vamos · ${dashEsc(_dashEmpresa)}</h2>
          <button type="button" class="tj-accion redondo" onclick="initDashboard()" title="Volver a cargar los números" aria-label="Volver a cargar los números">${ico('recargar')}</button>
        </div>
        ${_cvFiltroEmpresa()}
        <div class="cv">
          <div class="cv-top">
            <div class="cv-pct">${pct(tot)}<small>%</small><span>empacado o entregado</span></div>
            <div class="cv-total"><strong>${dashNum(tot.pedido)}</strong>piezas<span class="solo-asistencia"> pedidas a ${dashEsc(_dashEmpresa)}</span></div>
          </div>
          ${barra(tot, 14)}
          <div class="cv-nums">
            <div style="--p:${CV_VERDE}"><b>${dashNum(tot.emp)}</b><small>Empacado</small></div>
            <div style="--p:${CV_MORADO}"><b>${dashNum(tot.ent)}</b><small>Entregado</small></div>
            <div style="--p:#B9C2CD"><b>${dashNum(tot.pend)}</b><small>Falta</small></div>
          </div>
        </div>
        <div class="solo-asistencia" style="padding:0 12px 6px;font-size:12px;color:#666">Tocá una prenda para ver sus escuelas. Lo que se corta y se cose es del taller entero: la bodega sirve para todas las empresas.</div>
        <button type="button" class="cv-ver${_cvPorPrenda ? ' abierta' : ''}" aria-expanded="${_cvPorPrenda}" onclick="cvToggle()">
          <span>Detalle<span class="solo-asistencia" style="font-weight:400"> por prenda y talla</span></span>${ico('ir')}
        </button>
        ${!_cvPorPrenda ? '' : filas.map(o => `
        <div class="cv-prenda" role="button" tabindex="0" aria-expanded="${_cvAbiertas.has(o.cod)}" onclick="cvToggle('${o.cod}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();cvToggle('${o.cod}')}" style="padding:9px 12px;border-bottom:1px solid #F0F0F0;cursor:pointer">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px">
            <span style="font-weight:600;font-size:14px"><span class="fl-flecha${_cvAbiertas.has(o.cod) ? ' abierta' : ''}">${ico('ir')}</span>${dashEsc(dashPrendaNombre(o.cod))}</span>
            <span style="white-space:nowrap"><strong style="font-size:18px">${dashNum(o.pedido)}</strong> <small style="color:#888">piezas</small></span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">${[...o.tallas.values()].sort((a, b) => dashOrdenTalla(a.talla, b.talla)).map(t => `
            <span style="display:inline-flex;align-items:baseline;gap:5px;padding:3px 9px;border:1px solid #DDE3EA;border-radius:8px;background:#F7F9FB;font-size:12px"><span style="color:#667">${dashEsc(t.talla)}</span><strong style="font-size:14px">${dashNum(t.pedido)}</strong>${t.emp + t.ent > 0 ? `<small style="color:${CV_VERDE}">· ${dashNum(t.emp + t.ent)} listas</small>` : ''}</span>`).join('')}
          </div>
          ${barra(o, 6)}
          ${_cvAbiertas.has(o.cod) ? _cvTablaEscuelas(o.cod, lineas) + bodega(o) : ''}
        </div>`).join('')}
        ${_cvTela()}
      </div>`;
}
// ─── Tela entregada por el MINED (rollos de `tela_rollo`) ────────────
// Un renglón al pie de «Cómo vamos»: yardas entregadas. Al tocarlo: por
// color (entregada y lo que queda en rollo) y por escuela. Respeta la
// empresa elegida (la escuela del rollo dice de qué empresa es).
const TELA_COLORES = [['AZUL', 'Azul', '#1F4E79'], ['BLANCA', 'Blanca', '#FFFFFF'], ['BEIGE', 'Beige', '#D4C59E'], ['CELESTE', 'Celeste', '#8EC5E8']];
let _cvTelaAbierta = false;
function cvTelaToggle() {
  _cvTelaAbierta = !_cvTelaAbierta;
  const r = dashboardCache.resumen || {};
  const cv = document.getElementById('dash-como-vamos');
  if (cv) cv.innerHTML = _renderComoVamos(r.plan, r.produccionHoy, dashboardCache.cvTot);
}
function _cvTela() {
  const r = dashboardCache.resumen || {};
  const empEsc = dashboardCache.empEsc || new Map();
  const rollos = (r.tela || []).filter(x => !_dashEmpresa || empEsc.get(x.escuela_id) === _dashEmpresa);
  if (!rollos.length) return '';
  const cero = () => ({ ent: 0, queda: 0 });
  const tot = cero(), porColor = new Map(), porEsc = new Map();
  for (const x of rollos) {
    const col = String(x.color || '').toUpperCase(), ent = Number(x.yardas) || 0, queda = Number(x.yardas_disponibles) || 0;
    tot.ent += ent; tot.queda += queda;
    if (!porColor.has(col)) porColor.set(col, cero());
    porColor.get(col).ent += ent; porColor.get(col).queda += queda;
    let e = porEsc.get(x.escuela_id);
    if (!e) { e = { id: x.escuela_id, ent: 0, c: new Map() }; porEsc.set(x.escuela_id, e); }
    e.ent += ent; e.c.set(col, (e.c.get(col) || 0) + ent);
  }
  const yd = n => dashNum(Math.round(n));
  const boton = `
        <button type="button" class="cv-ver${_cvTelaAbierta ? ' abierta' : ''}" aria-expanded="${_cvTelaAbierta}" onclick="cvTelaToggle()">
          <span>Tela <strong style="color:var(--tinta,#222)">${yd(tot.ent)} yd</strong> <span style="font-weight:400;color:#667">· gastada ${yd(tot.ent - tot.queda)}</span><span class="solo-asistencia" style="font-weight:400"> · lo que dio el MINED y lo que ya se tendió</span></span>${ico('ir')}
        </button>`;
  if (!_cvTelaAbierta) return boton;
  const colores = TELA_COLORES.filter(([k]) => porColor.has(k));
  const punto = hex => `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${hex};border:1px solid #B9C2CD;margin-right:5px"></span>`;
  const escMap = new Map((r.escuelas || []).map(e => [e.id, e]));
  const filas = [...porEsc.values()].sort((a, b) => b.ent - a.ent);
  const td = 'padding:5px 4px;text-align:right;white-space:nowrap';
  // Tendidos hechos desde que se retiró la tela (son del taller entero).
  const desde = rollos.reduce((m, x) => x.fecha_retiro && (!m || x.fecha_retiro < m) ? x.fecha_retiro : m, null);
  const tend = (r.tendidos || []).filter(t => desde && t.fecha >= desde && t.yd > 0);
  const totTend = tend.reduce((s, t) => s + t.yd, 0);
  const tendidosHtml = !tend.length ? '' : `
          <div style="font-size:11px;color:#667;font-weight:600;margin-top:10px">Gastada por tendido${_dashEmpresa ? ' (todo el taller)' : ''}</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px;background:#FAFBFC;border-radius:8px;overflow:hidden;margin-top:4px">
            <tbody>${tend.map(t => `
              <tr style="border-top:1px solid #ECEFF3">
                <td style="padding:5px 6px">${dashEsc(t.codigo_corte || t.letra_corte || t.fecha)}</td>
                <td style="${td};color:#778">${dashNum(t.telas)} telas</td>
                <td style="${td};font-weight:700">${yd(t.yd)} yd</td>
              </tr>`).join('')}
              <tr style="border-top:2px solid #DDE3EA;font-weight:700">
                <td style="padding:5px 6px" colspan="2">Total</td>
                <td style="${td}">${yd(totTend)} yd</td>
              </tr>
            </tbody>
          </table>`;
  return boton + `
        <div style="padding:10px 12px 12px">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px">${colores.map(([k, nom, hex]) => `
            <div style="background:#F6F8FB;border-radius:12px;padding:9px 10px">
              <small style="display:block;font-size:11.5px;color:#556">${punto(hex)}${nom}</small>
              <b style="display:block;font-size:18px">${yd(porColor.get(k).ent)} <small style="font-size:11px;font-weight:400;color:#778">yd</small></b>
              <small style="display:block;font-size:11px;color:#778">gastada <strong style="color:#B7791F">${yd(porColor.get(k).ent - porColor.get(k).queda)}</strong> · quedan ${yd(porColor.get(k).queda)}</small>
            </div>`).join('')}
          </div>
          <div style="font-size:12px;color:#556;margin-top:8px">Entregada <strong>${yd(tot.ent)}</strong> · gastada <strong style="color:#B7791F">${yd(tot.ent - tot.queda)}</strong> · quedan <strong>${yd(tot.queda)}</strong> yd</div>
          ${tendidosHtml}
          <div style="font-size:11px;color:#667;font-weight:600;margin-top:10px">Entregada por escuela</div>
          <div style="overflow-x:auto;margin-top:8px">
          <table style="width:100%;border-collapse:collapse;font-size:12px;background:#FAFBFC;border-radius:8px;overflow:hidden">
            <thead><tr style="font-size:11px;color:#555">
              <th style="padding:6px;text-align:left">Escuela</th>
              ${colores.map(([, nom]) => `<th style="${td}">${nom}</th>`).join('')}
              <th style="${td}">Total</th>
            </tr></thead>
            <tbody>${filas.map(e => `
              <tr style="border-top:1px solid #ECEFF3">
                <td style="padding:5px 6px;max-width:104px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${dashEsc((escMap.get(e.id) || {}).nombre || '')}">${dashEsc(dashEscuelaCorta(escMap.get(e.id)))}${!_dashEmpresa && empEsc.get(e.id) ? ` <small style="color:#8A94A3">${dashEsc(empEsc.get(e.id))}</small>` : ''}</td>
                ${colores.map(([k]) => `<td style="${td}">${e.c.get(k) ? yd(e.c.get(k)) : '<span style="color:#C3CAD3">—</span>'}</td>`).join('')}
                <td style="${td};font-weight:700">${yd(e.ent)}</td>
              </tr>`).join('')}
              <tr style="border-top:2px solid #DDE3EA;font-weight:700">
                <td style="padding:5px 6px">Total</td>
                ${colores.map(([k]) => `<td style="${td}">${yd(porColor.get(k).ent)}</td>`).join('')}
                <td style="${td}">${yd(tot.ent)}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>`;
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
                <td style="${td}">${t.costura > 0
                  ? `<a href="#" onclick="event.stopPropagation();cvVerBultos('${o.cod}','${dashEsc(t.talla)}');return false" title="Ver los bultos de esta talla" style="color:#B7791F;font-weight:700;text-decoration:underline">${dashNum(t.costura)}</a>`
                  : dashNum(t.costura)}</td>
                <td style="${td};font-weight:${t.sin > 0 ? 700 : 400}">${dashNum(t.sin)}</td>
              </tr>`).join('')}</tbody>
          </table>`;
}
// Tocar el número «En costura» de una talla abre la lista de bultos de
// «Terminar» (Producción) ya filtrada por esa prenda y esa talla.
function cvVerBultos(cod, talla) {
  window._prodHintTalla = { cod, talla };
  window._prodHintSub = 'dashboard';
  (typeof abrirPestana === 'function' ? abrirPestana : switchTab)('produccion');
  document.body.classList.add('modo-paso');
}
function _renderComoVamos(plan, prod, totEmp) {
  if (_dashEmpresa) return _renderComoVamosEmpresa(plan, dashboardCache.cvLineas || []);
  if (!plan || plan.length === 0) return '';
  const porPrenda = new Map();
  const tot = { pedido: 0, listo: 0, costura: 0, sin: 0 };
  let fuera = 0;   // de lo listo, lo que ya salió de bodega: empacado o entregado
  for (const f of plan) {
    fuera += Number(f.fuera) || 0;
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
      <div class="card tj">
        <div class="tj-cab">
          <span class="tj-ico tj-verde">${ico('avance')}</span>
          <h2>Cómo vamos</h2>
          <button type="button" class="tj-accion redondo" onclick="initDashboard()" title="Volver a cargar los números" aria-label="Volver a cargar los números">${ico('recargar')}</button>
        </div>
        ${_cvFiltroEmpresa()}
        <div class="cv">
          <div class="cv-top">
            <div class="cv-pct">${pctListo(tot)}<small>%</small><span>${fuera > 0 ? 'listas' : 'en bodega'}</span></div>
            <div class="cv-total"><strong>${dashNum(tot.pedido)}</strong>piezas<span class="solo-asistencia"> pedidas en la temporada</span></div>
          </div>
          ${_cvBarra(tot, 14)}
          <div class="cv-nums">
            <div style="--p:${CV_VERDE}"><b>${dashNum(tot.listo)}</b><small>${fuera > 0 ? 'Listas' : 'En bodega'}</small></div>
            <div style="--p:${CV_AMBAR}"><b>${dashNum(tot.costura)}</b><small>En costura</small></div>
            <div style="--p:#B9C2CD"><b>${dashNum(tot.sin)}</b><small>Sin empezar</small></div>
          </div>
          ${fuera > 0 ? `<div style="font-size:12px;color:#556;margin-top:6px">De las listas, <strong>${dashNum(fuera)}</strong> ya están empacadas o entregadas y <strong>${dashNum(Math.max(0, tot.listo - fuera))}</strong> siguen en bodega.</div>` : ''}
        </div>
        <button type="button" class="cv-ver${_cvPorPrenda ? ' abierta' : ''}" aria-expanded="${_cvPorPrenda}" onclick="cvToggle()">
          <span>Detalle<span class="solo-asistencia" style="font-weight:400"> por prenda y talla (tocá una prenda para ver sus tallas)</span></span>${ico('ir')}
        </button>
        ${!_cvPorPrenda ? '' : `
        <div style="padding:8px 12px;border-bottom:1px solid #F0F0F0;font-size:12px;color:#555">
          Hoy <strong>${dashNum(p.piezas)}</strong> · 7 días <strong>${dashNum(p.piezas7)}</strong>${totEmp ? ` · Empacado <strong>${dashNum(totEmp.emp)}</strong> · Entregado <strong>${dashNum(totEmp.ent)}</strong>` : ''}
        </div>` + filas.map(o => `
        <div class="cv-prenda" role="button" tabindex="0" aria-expanded="${_cvAbiertas.has(o.cod)}" onclick="cvToggle('${o.cod}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();cvToggle('${o.cod}')}" style="padding:9px 12px;border-bottom:1px solid #F0F0F0;cursor:pointer">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px">
            <span style="font-weight:600;font-size:13px"><span class="fl-flecha${_cvAbiertas.has(o.cod) ? ' abierta' : ''}">${ico('ir')}</span>${dashEsc(dashPrendaNombre(o.cod))} <span style="font-weight:400;color:#888;font-size:11px">· ${dashNum(o.pedido)} pedidas</span></span>
            <span style="font-size:12px;font-weight:700;color:${o.listo > 0 ? CV_VERDE : '#999'}">${pctListo(o)}%</span>
          </div>
          ${_cvBarra(o, 10)}
          <div style="font-size:11px;color:#444;margin-top:4px;line-height:1.7">${_cvLeyenda(o)}</div>
          ${_cvAbiertas.has(o.cod) ? _cvTallas(o) + _cvTablaEscuelas(o.cod, dashboardCache.cvLineas) : ''}
        </div>`).join('')}
        ${_cvTela()}
      </div>`;
}

// ─── «Qué urge»: las tallas con más piezas sin empezar (ni cortadas) ──
// Tocar una talla la abre: sus números y en qué corte pendiente sale, con
// el botón para ir a tender ese corte. Solo una abierta a la vez.
let _urgeAbierta = null;
function urgeToggle(k) {
  _urgeAbierta = _urgeAbierta === k ? null : k;
  urgePintar();
}
function urgePintar() {
  const el = document.getElementById('dash-urge');
  const r = dashboardCache.resumen || {};
  if (el) el.outerHTML = _renderQueUrge(r.plan);
}
// Cortes pendientes donde sale esa prenda y talla: [{id, codigo, porTela, capas}]
function _urgeCortes(cod, talla) {
  const n = String(talla || '').replace(/^T/, '');
  const out = [];
  for (const t of dashboardCache.trazosPend || []) {
    let porTela = 0;
    const re = /(FCE|FB|PB|CC|C|B|P|F|S)(\d{1,2}|\dX)(?:×(\d+))?/g;
    let m;
    while ((m = re.exec(String(t.tallas_tendido || '')))) {
      if (codPedido2026(m[1]) === cod && m[2] === n) porTela += Number(m[3]) || 1;
    }
    if (porTela > 0) out.push({ id: t.id, codigo: t.codigo_corte, porTela, capas: Number(t.capas) || 0 });
  }
  return out;
}
function urgeTender(trazoId) {
  if (typeof tenderTrazo === 'function') tenderTrazo(trazoId);
  document.body.classList.add('modo-paso');
}
function _renderQueUrge(plan) {
  const filas = (plan || []).filter(f => (Number(f.falta_iniciar) || 0) > 0)
    .sort((a, b) => (Number(b.falta_iniciar) || 0) - (Number(a.falta_iniciar) || 0)).slice(0, 4);
  if (!filas.length) return '<div id="dash-urge"></div>';
  const max = Math.max(...filas.map(f => Number(f.falta_iniciar) || 0), 1);
  return `
      <div class="card tj" id="dash-urge">
        <div class="tj-cab">
          <span class="tj-ico tj-naranja">${ico('reloj')}</span>
          <h2>Urge<span class="solo-asistencia"> · tocá una talla para ver en qué corte sale</span></h2>
          <button type="button" class="tj-accion" onclick="dashVerPlan()">Plan ${ico('ir')}</button>
        </div>
        <div class="solo-asistencia" style="padding:4px 12px 0;font-size:12px;color:#666">Las tallas con más piezas sin empezar: lo que conviene cortar después.</div>
        ${filas.map(f => {
          const k = f.cod_prenda + '|' + f.talla_2026;
          const abierta = _urgeAbierta === k;
          const pedido = Number(f.pedido) || 0, falta = Number(f.falta_hacer) || 0, sin = Number(f.falta_iniciar) || 0;
          const listo = Math.max(0, pedido - falta), costura = Math.min(Number(f.en_proceso) || 0, falta);
          let detalle = '';
          if (abierta) {
            const cortes = _urgeCortes(f.cod_prenda, f.talla_2026);
            detalle = `
          <div class="av-detalle">
            <div class="av-nums">
              <div><strong style="color:${DASH_NARANJA}">${dashNum(sin)}</strong><small>Sin empezar</small></div>
              <div><strong style="color:#B7791F">${dashNum(costura)}</strong><small>En costura</small></div>
              <div><strong style="color:${CV_VERDE}">${dashNum(listo)}</strong><small>En bodega</small></div>
              <div><strong>${dashNum(pedido)}</strong><small>Pedido</small></div>
            </div>
            ${f.contado === false ? '<div style="font-size:12px;color:#8a4b00;margin-top:6px">La bodega de esta prenda no se ha contado este año: puede haber piezas que bajen este número.</div>' : ''}
            ${cortes.length ? cortes.map(c => `
            <div class="urge-corte">
              <span><strong>${dashEsc(c.codigo)}</strong><small>${c.porTela} por tela${c.capas ? ` · ${dashNum(c.capas)} telas` : ''}</small></span>
              <button type="button" class="btn btn-primary" onclick="event.stopPropagation();urgeTender('${c.id}')">${ico('tijera')} Tender</button>
            </div>`).join('') : `
            <div class="urge-corte">
              <span><strong>Sin corte pendiente</strong><small>No sale en ningún tendido del plan</small></span>
              <button type="button" class="btn btn-ghost" onclick="event.stopPropagation();dashVerPlan()">Plan ›</button>
            </div>`}
          </div>`;
          }
          return `
        <div class="av-fila${abierta ? ' abierta' : ''}" role="button" tabindex="0" aria-expanded="${abierta}" onclick="urgeToggle('${k}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();urgeToggle('${k}')}">
          <div class="av-cab">
            <span class="av-nombre"><span class="fl-flecha${abierta ? ' abierta' : ''}">${ico('ir')}</span>${dashEsc(dashPrendaNombre(f.cod_prenda))} ${dashEsc(f.talla_2026)}${f.contado === false ? ' <span style="font-size:10.5px;font-weight:400;color:#8a4b00">· sin contar</span>' : ''}</span>
            <span class="av-falta"><strong>${dashNum(sin)}</strong><span class="solo-asistencia"> sin empezar de ${dashNum(pedido)}</span></span>
          </div>
          <div class="av-barra"><div style="width:${(100 * sin / max).toFixed(2)}%;background:#E8853A"></div></div>
          ${detalle}
        </div>`;
        }).join('')}
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
      if (_dashEmpresa && dashboardCache.empEsc && dashboardCache.empEsc.get(e.id) !== _dashEmpresa) continue;
      const s = emqSumar(emqLineasEscuela(ctx, e.id));
      if (s.puede > 0) filas.push({ id: e.id, nombre: e.alias || e.nombre, puede: s.puede, falta: s.falta });
    }
    filas.sort((a, b) => b.puede - a.puede);
    dashboardCache.listoPorEsc = new Map(filas.map(f => [f.id, f.puede]));
    _avPintarListo();
    const el2 = document.getElementById('dash-listo-empacar');
    if (!el2) return;
    if (!filas.length) { el2.innerHTML = ''; return; }
    el2.innerHTML = `
      <div class="card tj">
        <div class="tj-cab">
          <span class="tj-ico tj-verde">${ico('caja')}</span>
          <h2>Listo<span class="solo-asistencia"> para empacar</span></h2>
        </div>
        <div class="solo-asistencia" style="padding:4px 12px 0;font-size:12px;color:#666">Lo que ya se puede empacar con lo que hay en bodega. Tocá una escuela para empacarla.</div>
        ${filas.slice(0, 5).map(f => `
        <button type="button" class="listo-fila" onclick="dashEmpacarEscuela('${f.id}')">
          <span style="flex:1;min-width:0"><strong>${dashEsc(f.nombre)}</strong><small class="solo-asistencia">le faltan ${dashNum(f.falta)} piezas</small></span>
          <span style="text-align:right;white-space:nowrap"><strong style="color:${CV_VERDE};font-size:17px">${dashNum(f.puede)}</strong><small class="solo-asistencia">se pueden empacar</small></span>
          ${ico('ir')}
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
      <div class="card tj">
        <div class="tj-cab">
          <span class="tj-ico tj-verde">${ico('caja')}</span>
          <h2>Empaque y entrega por prenda</h2>
        </div>
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
              <td style="${td};color:${CV_MORADO}">${dashNum(o.ent)}</td>
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
        <span><svg class="ico" aria-hidden="true" width="1em" height="1em"><use href="#i-escuela"/></svg> Avance por escuela ${colapsado && totalEsc > 5 ? `(top ${mostrados} de ${totalEsc})` : `(${totalEsc})`}</span>
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

// Temporada por cantidades: una fila por escuela (nombre, barra y lo que
// falta). Tocar la fila la abre: números, tabla por prenda y los dos botones
// que llevan a empacar o entregar ESA escuela. Solo una abierta a la vez.
let _avEscAbierta = null;
// La tarjeta «Escuelas» llega plegada: hoy se trabaja por talla para cumplir
// el contrato; el reparto por escuela se abre solo cuando hace falta.
let _avEscPlegada = true;
try { _avEscPlegada = lsLeer('escuelas_abierta') !== '1'; } catch (_) { /* sin memoria local */ }
function avEscPlegar() {
  _avEscPlegada = !_avEscPlegada;
  if (_avEscPlegada) _avEscAbierta = null;
  try { lsGuardar('escuelas_abierta', _avEscPlegada ? '0' : '1'); } catch (_) { /* sin memoria local */ }
  const el = document.getElementById('dash-avance-esc');
  if (el) el.outerHTML = _renderAvancePedido(dashboardCache.resumen || {}, dashboardCache.avLineas || []);
  _avPintarListo();
}
function avEscToggle(escId) {
  _avEscAbierta = _avEscAbierta === escId ? null : escId;
  const el = document.getElementById('dash-avance-esc');
  if (el) el.outerHTML = _renderAvancePedido(dashboardCache.resumen || {}, dashboardCache.avLineas || []);
  _avPintarListo();
}
// «Se pueden empacar ya» por escuela (lo calcula cargarListoEmpacar).
function _avPintarListo() {
  const m = dashboardCache.listoPorEsc;
  if (!m) return;
  document.querySelectorAll('[data-av-listo]').forEach(el => {
    const n = m.get(el.getAttribute('data-av-listo')) || 0;
    el.innerHTML = n > 0 ? `<strong>${dashNum(n)}</strong> listas` : '';
  });
}
function avEscIr(accion, escId) {
  _avanceEscIrA(accion, escId);
  document.body.classList.add('modo-paso');
}
function _renderAvancePedido(r, lineas) {
  if (!lineas || lineas.length === 0) return '';
  dashboardCache.avLineas = lineas;
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
  const lista = [...byEsc.values()];
  // Orden fijo y fácil de seguir: la que más le falta, primero
  lista.sort((a, b) => b.pend - a.pend || String(a.escuela.alias || a.escuela.nombre || '').localeCompare(String(b.escuela.alias || b.escuela.nombre || ''), 'es'));
  const pct = (v, t) => t > 0 ? 100 * v / t : 0;
  const AZ = CV_MORADO;   // entregado
  const filas = lista.map(o => {
    const e = o.escuela;
    const abierta = _avEscAbierta === e.id;
    const nombre = e.alias || e.nombre || '';
    const pctEnt = Math.floor(pct(o.ent, o.sol));
    let detalle = '';
    if (abierta) {
      const porPrenda = new Map();
      for (const l of o.lineas) {
        let q = porPrenda.get(l.cod);
        if (!q) { q = { cod: l.cod, sol: 0, emp: 0, ent: 0, pend: 0 }; porPrenda.set(l.cod, q); }
        q.sol += l.sol; q.emp += l.emp; q.ent += l.ent; q.pend += l.pend;
      }
      const prendas = [...porPrenda.values()].sort((a, b) => dashOrdenPrenda(a.cod) - dashOrdenPrenda(b.cod));
      const td = 'padding:5px 6px;text-align:right';
      detalle = `
        <div class="av-detalle">
          <div class="av-nums">
            <div><strong style="color:${DASH_NARANJA}">${dashNum(o.pend)}</strong><small>Falta</small></div>
            <div><strong style="color:${CV_VERDE}">${dashNum(o.emp)}</strong><small>Empacado</small></div>
            <div><strong style="color:${AZ}">${dashNum(o.ent)}</strong><small>Entregado</small></div>
            <div><strong>${dashNum(o.sol)}</strong><small>Pedido</small></div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">
            <thead><tr style="font-size:11px;color:#555">
              <th style="padding:5px 6px;text-align:left">Prenda</th>
              <th style="${td}">Pedido</th><th style="${td}">Empacado</th><th style="${td}">Entregado</th><th style="${td}">Falta</th>
            </tr></thead>
            <tbody>${prendas.map(q => `
              <tr style="border-top:1px solid #ECEFF3">
                <td style="padding:5px 6px">${dashEsc(dashPrendaNombre(q.cod))}</td>
                <td style="${td}">${dashNum(q.sol)}</td>
                <td style="${td}">${dashNum(q.emp)}</td>
                <td style="${td}">${dashNum(q.ent)}</td>
                <td style="${td};font-weight:700;color:${q.pend > 0 ? DASH_NARANJA : '#888'}">${dashNum(q.pend)}</td>
              </tr>`).join('')}</tbody>
          </table>
          <div class="av-botones">
            <button type="button" class="btn btn-primary" ${o.pend > 0 ? '' : 'disabled'} onclick="event.stopPropagation();avEscIr('empacar','${e.id}')">${ico('caja')} Empacar</button>
            <button type="button" class="btn btn-success" ${o.emp > 0 ? '' : 'disabled'} onclick="event.stopPropagation();avEscIr('entrega','${e.id}')">${ico('camion')} Entregar</button>
          </div>
          <div class="solo-asistencia" style="font-size:12px;color:#666;margin-top:6px">«Empacar» abre el empaque de esta escuela. «Entregar» se activa cuando ya hay piezas empacadas.</div>
        </div>`;
    }
    return `
      <div class="av-fila${abierta ? ' abierta' : ''}" role="button" tabindex="0" aria-expanded="${abierta}" onclick="avEscToggle('${e.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();avEscToggle('${e.id}')}">
        <div class="av-cab">
          <span class="av-nombre"><span class="fl-flecha${abierta ? ' abierta' : ''}">${ico('ir')}</span>${dashEsc(nombre)}</span>
          <span class="av-listo" data-av-listo="${e.id}"></span>
          <span class="av-falta"><strong>${dashNum(o.pend)}</strong><span class="solo-asistencia"> faltan</span></span>
        </div>
        <div class="av-barra" title="${pctEnt}% entregado">
          <div style="width:${pct(o.ent, o.sol).toFixed(2)}%;background:${AZ}"></div>
          <div style="width:${pct(o.emp, o.sol).toFixed(2)}%;background:${CV_VERDE}"></div>
        </div>
        ${detalle}
      </div>`;
  }).join('');
  const faltan = lista.reduce((t, o) => t + o.pend, 0);
  const plegada = _avEscPlegada;
  return `
    <div class="card tj" id="dash-avance-esc">
      <div class="tj-cab" role="button" tabindex="0" aria-expanded="${!plegada}" style="cursor:pointer" onclick="avEscPlegar()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();avEscPlegar()}">
        <span class="tj-ico tj-azul">${ico('escuela')}</span>
        <h2>Escuelas<span style="font-weight:400;font-size:12.5px;color:var(--tinta2,#667)"> · ${dashNum(lista.length)} · faltan ${dashNum(faltan)}</span><span class="solo-asistencia">${plegada ? ' · tocá para ver el reparto por escuela' : ' · tocá una para ver su detalle'}</span></h2>
        ${plegada ? '' : `<span class="tj-leyenda"><span><i style="background:${AZ}"></i>entregado</span><span><i style="background:${CV_VERDE}"></i>empacado</span></span>`}
        <span class="fl-flecha${plegada ? '' : ' abierta'}" style="font-size:18px">${ico('ir')}</span>
      </div>
      ${plegada ? '' : filas}
    </div>`;
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
            <div style="font-weight:700;font-size:13px"><svg class="ico" aria-hidden="true" width="1em" height="1em"><use href="#i-escuela"/></svg> ${dashEsc(alias)}</div>
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
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('registro','${e.id}')" style="font-size:11px;padding:4px 8px"><svg class="ico" aria-hidden="true" width="1em" height="1em"><use href="#i-lista"/></svg> Registro</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('empacar','${e.id}')" style="font-size:11px;padding:4px 8px" title="Sesión de empaque: marcar piezas, reservar o empacar"><svg class="ico" aria-hidden="true" width="1em" height="1em"><use href="#i-caja"/></svg> Empacar</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('entrega','${e.id}')" style="font-size:11px;padding:4px 8px"><svg class="ico" aria-hidden="true" width="1em" height="1em"><use href="#i-camion"/></svg> Entrega</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('lista','${e.id}')" style="font-size:11px;padding:4px 8px" title="Descargar PDF de la lista de empaque"><svg class="ico" aria-hidden="true" width="1em" height="1em"><use href="#i-imprimir"/></svg> Lista</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('resumen','${e.id}')" style="font-size:11px;padding:4px 8px" title="Descargar resumen ejecutivo PDF (2 hojas)"><svg class="ico" aria-hidden="true" width="1em" height="1em"><use href="#i-hoja"/></svg> Resumen</button>
          <button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('bolsa','${e.id}')" style="font-size:11px;padding:4px 8px" title="Etiquetas grandes para bolsa (2 por hoja)"><svg class="ico" aria-hidden="true" width="1em" height="1em"><use href="#i-etiqueta"/></svg> Bolsa</button>
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
        // La escuela se elige DESPUÉS de que la lista esté llena (antes se
        // esperaba 0.4 s a ciegas y con señal lenta el modal abría vacío).
        Promise.resolve(abrirEntregaModal()).then(() => {
          const sel = document.getElementById('ent-escuela');
          if (sel) { sel.value = escId; if (typeof onEntregaEscuelaCambio === 'function') onEntregaEscuelaCambio(); }
        });
      }
    }, 100);
    return;
  }
}

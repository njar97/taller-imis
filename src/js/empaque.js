// ══════════════════════════════════════════════════════════════════════
// SESIÓN DE EMPAQUE (beta) — flujo unificado en 3 pasos:
//   1. Elegir escuela (con cuántas piezas se pueden empacar YA)
//   2. Lista tap-para-empacar (verde=lista, gris=sin stock con motivo,
//      ✓=ya empacada). "Marcar todos" + parejas automáticas + talla alterna.
//   3. Confirmar → motor empacarAlumnosDesdeRegistro (pool primero, stock
//      después) → panel de éxito con DESHACER (desempacarPieza en lote).
// El usuario nunca decide entre pool y stock: el motor lo resuelve solo.
// Convive con los flujos viejos hasta validar (Fase 1 del rediseño).
//
// v3.37: escuelas con PEDIDO de la temporada activa (2026, sin nombres)
// van "por cantidad": tabla prenda·talla con − / + (ver la sección
// 📋 MODO POR CANTIDAD al final). Los alumnos se filtran por temporada
// activa: el flujo por alumno queda para temporadas que sí tengan alumnos.
// ══════════════════════════════════════════════════════════════════════

let emqState = {
  paso: 1,
  escuelaId: null,
  escuelas: [],
  cant: null,           // datos del modo por cantidad (emqCargarCant)
  sel: {},              // grupo → Map(línea → cantidad elegida con − / +)
  selMax: {},           // grupo → Map(línea → tope)
  alumnos: [],          // activos de la temporada activa (objetos completos)
  stockMap: new Map(),  // "prenda|talla" → n
  poolMap: new Map(),   // "escId|prenda|talla" → n
  marcados: new Map(),  // alumnoId → {top:bool, bottom:bool}
  tallasAlt: new Map(), // "alumnoId|pieza" → talla_key alterna
  parejas: true,        // completar la otra pieza del alumno si hay stock
  busqueda: '',
  cargado: false,
  ultimoEmpaque: null,  // { piezas:[{id,pieza}], resumen } → para Deshacer
};

async function initEmpaque(escuelaId) {
  // Hint desde otros módulos (dashboard, producción): abre directo en esa
  // escuela sin cadenas de setTimeout.
  if (!escuelaId && window._emqHintEscuela) {
    escuelaId = window._emqHintEscuela;
    window._emqHintEscuela = null;
  }
  const root = document.getElementById('empaque-contenido');
  if (!root) return;
  root.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando datos de empaque...</div>';
  try {
    // Datos frescos siempre (una sesión arranca con la foto real, sin SWR)
    const tempF = await emqFiltroTemporadaAlumno();
    const [escuelas, alumnos, cant, prodPend] = await Promise.all([
      supaFetchAll('escuela', '?activa=eq.true&select=id,alias,nombre&order=alias'),
      supaFetchAll('alumno',
        `?activo=eq.true${tempF}&select=id,nombre,grado,sexo,escuela_id,prenda_top,talla_top_key,estado_top,prenda_bottom,talla_bottom_key,estado_bottom&order=nombre&limit=10000`),
      // Pedido de la temporada + bodega + reservas (vw_bodega_stock y
      // escuela_acaparado vienen acá: no se piden dos veces)
      emqCargarCant(),
      // 🏭 Lo que viene en camino desde corte/producción (bultos no terminados)
      supaFetchAll('vw_produccion_estado',
        '?estado_manual=neq.terminado&select=cod_prenda,talla_key_salida,cantidad_original')
        .catch(() => []),
    ]);
    const stock = cant.stockRows;
    const pool = cant.acapViejo;   // reservas por alumno; lo empacado por pedido va aparte
    emqState.escuelas = escuelas;
    emqState.alumnos = alumnos;
    emqState.cant = cant;
    emqState.stockMap = new Map();
    for (const s of stock) {
      const p = s.nombre_prenda || (typeof prendaCanon === 'function' ? prendaCanon(s.cod_prenda) : s.cod_prenda);
      if (p && s.talla_key) emqState.stockMap.set(p + '|' + s.talla_key, Number(s.stock_actual) || 0);
    }
    emqState.poolMap = new Map();
    for (const p of pool) {
      const d = Math.max(0, (Number(p.cantidad_acaparada) || 0) - (Number(p.cantidad_consumida) || 0));
      if (d <= 0) continue;
      const k = p.escuela_id + '|' + p.nombre_prenda + '|' + p.talla_key;
      emqState.poolMap.set(k, (emqState.poolMap.get(k) || 0) + d);
    }
    // "prenda|talla" → piezas en camino (bultos de corte/producción sin terminar)
    emqState.prodMap = new Map();
    for (const b of prodPend) {
      if (!b.cod_prenda || !b.talla_key_salida) continue;
      const nombre = (typeof prendaCanon === 'function') ? prendaCanon(b.cod_prenda) : b.cod_prenda;
      const k = nombre + '|' + b.talla_key_salida;
      emqState.prodMap.set(k, (emqState.prodMap.get(k) || 0) + (Number(b.cantidad_original) || 0));
    }
    emqState.cargado = true;
    emqState.marcados = new Map();
    emqState.tallasAlt = new Map();
    emqState.ultimoEmpaque = null;
    if (escuelaId) { emqState.escuelaId = escuelaId; emqState.paso = 2; }
    else if (!emqState.escuelaId) emqState.paso = 1;
    renderEmpaque();
  } catch (e) {
    root.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

// ── Helpers de dominio ───────────────────────────────────────────────

function emqPend(a, pieza) {
  const prenda = pieza === 'top' ? a.prenda_top : a.prenda_bottom;
  const talla = pieza === 'top' ? a.talla_top_key : a.talla_bottom_key;
  const estado = pieza === 'top' ? a.estado_top : a.estado_bottom;
  return !!prenda && !!talla && estado !== 'empacado' && estado !== 'entregado';
}
function emqTalla(a, pieza) {
  const alt = emqState.tallasAlt.get(a.id + '|' + pieza);
  return alt || (pieza === 'top' ? a.talla_top_key : a.talla_bottom_key);
}
function emqPrenda(a, pieza) {
  return pieza === 'top' ? a.prenda_top : a.prenda_bottom;
}

// Copia del suministro con lo YA MARCADO descontado (pool de la escuela
// primero, stock libre después — espejo del motor real).
function emqRestante() {
  const stockRest = new Map(emqState.stockMap);
  const poolRest = new Map(emqState.poolMap);
  const byId = new Map();
  for (const a of emqState.alumnos) byId.set(a.id, a);
  const consumir = (escId, prenda, talla) => {
    if (!prenda || !talla) return;
    const kP = escId + '|' + prenda + '|' + talla;
    if ((poolRest.get(kP) || 0) > 0) { poolRest.set(kP, poolRest.get(kP) - 1); return; }
    const kS = prenda + '|' + talla;
    stockRest.set(kS, (stockRest.get(kS) || 0) - 1);
  };
  for (const [id, m] of emqState.marcados) {
    const a = byId.get(id);
    if (!a) continue;
    if (m.top) consumir(a.escuela_id, a.prenda_top, emqTalla(a, 'top'));
    if (m.bottom) consumir(a.escuela_id, a.prenda_bottom, emqTalla(a, 'bottom'));
  }
  return { stockRest, poolRest };
}

function emqHay(a, pieza, rest) {
  const prenda = emqPrenda(a, pieza);
  const talla = emqTalla(a, pieza);
  if (!prenda || !talla) return false;
  const kP = a.escuela_id + '|' + prenda + '|' + talla;
  const kS = prenda + '|' + talla;
  return (rest.poolRest.get(kP) || 0) > 0 || (rest.stockRest.get(kS) || 0) > 0;
}

// Cuenta cuántas piezas pendientes de una escuela pueden empacarse YA
// (simulación greedy independiente por escuela, sin contar marcados).
function emqEmpacablesEscuela(escId) {
  const stockRest = new Map(emqState.stockMap);
  const poolRest = new Map(emqState.poolMap);
  let n = 0, pendientes = 0;
  for (const a of emqState.alumnos) {
    if (a.escuela_id !== escId) continue;
    for (const pieza of ['top', 'bottom']) {
      if (!emqPend(a, pieza)) continue;
      pendientes++;
      const prenda = emqPrenda(a, pieza);
      const talla = pieza === 'top' ? a.talla_top_key : a.talla_bottom_key;
      const kP = escId + '|' + prenda + '|' + talla;
      const kS = prenda + '|' + talla;
      if ((poolRest.get(kP) || 0) > 0) { poolRest.set(kP, poolRest.get(kP) - 1); n++; }
      else if ((stockRest.get(kS) || 0) > 0) { stockRest.set(kS, stockRest.get(kS) - 1); n++; }
    }
  }
  return { empacables: n, pendientes };
}

// ── Acciones de marcado ──────────────────────────────────────────────

function emqToggle(alumnoId, pieza) {
  const a = emqState.alumnos.find(x => x.id === alumnoId);
  if (!a) return;
  const m = emqState.marcados.get(alumnoId) || { top: false, bottom: false };
  if (m[pieza]) {
    // Desmarcar (y limpiar talla alterna de esa pieza)
    m[pieza] = false;
    emqState.tallasAlt.delete(alumnoId + '|' + pieza);
  } else {
    if (!emqPend(a, pieza)) return;
    const rest = emqRestante();
    if (!emqHay(a, pieza, rest)) { emqAbrirAlt(alumnoId, pieza); return; }
    m[pieza] = true;
    emqState.marcados.set(alumnoId, m);  // registrar ANTES de evaluar la pareja
    // 🧷 Pareja: si la otra pieza está pendiente y hay stock, se marca sola
    if (emqState.parejas) {
      const otra = pieza === 'top' ? 'bottom' : 'top';
      if (!m[otra] && emqPend(a, otra) && emqHay(a, otra, emqRestante())) m[otra] = true;
    }
  }
  if (!m.top && !m.bottom) emqState.marcados.delete(alumnoId);
  else emqState.marcados.set(alumnoId, m);
  renderEmpaque();
}

function emqMarcarTodos() {
  const escId = emqState.escuelaId;
  for (const a of emqState.alumnos) {
    if (a.escuela_id !== escId) continue;
    for (const pieza of ['top', 'bottom']) {
      if (!emqPend(a, pieza)) continue;
      const m = emqState.marcados.get(a.id) || { top: false, bottom: false };
      if (m[pieza]) continue;
      if (emqHay(a, pieza, emqRestante())) {
        m[pieza] = true;
        emqState.marcados.set(a.id, m);
      }
    }
  }
  renderEmpaque();
}

function emqLimpiar() {
  emqState.marcados = new Map();
  emqState.tallasAlt = new Map();
  renderEmpaque();
}

function emqVolverEscuelas() {
  emqState.escuelaId = null;
  emqState.paso = 1;
  emqState.sel = {};   // cantidades elegidas (modo por pedido) son de esa escuela
  emqLimpiar();
}

function emqSetParejas(on) { emqState.parejas = on; }
function emqSetBusqueda(v) {
  emqState.busqueda = v;
  const cont = document.getElementById('emq-lista');
  if (cont) cont.innerHTML = emqListaHtml();
}

// ── Talla alterna ────────────────────────────────────────────────────

let _emqAltCtx = null;

function emqAbrirAlt(alumnoId, pieza) {
  const a = emqState.alumnos.find(x => x.id === alumnoId);
  if (!a) return;
  const prenda = emqPrenda(a, pieza);
  const pedida = pieza === 'top' ? a.talla_top_key : a.talla_bottom_key;
  const rest = emqRestante();
  // Tallas de esa prenda con algo disponible (pool de la escuela o stock)
  const tallas = new Map();
  for (const [k, q] of rest.stockRest) {
    const i = k.indexOf('|');
    if (k.slice(0, i) === prenda && q > 0) tallas.set(k.slice(i + 1), (tallas.get(k.slice(i + 1)) || 0) + q);
  }
  for (const [k, q] of rest.poolRest) {
    const parts = k.split('|');
    if (parts[0] === a.escuela_id && parts[1] === prenda && q > 0) {
      const t = parts.slice(2).join('|');
      tallas.set(t, (tallas.get(t) || 0) + q);
    }
  }
  const lista = [...tallas.entries()].sort((x, y) => x[0].localeCompare(y[0], 'es', { numeric: true }));
  const modal = document.getElementById('emq-alt-modal');
  document.getElementById('emq-alt-titulo').textContent = `${prenda} — sin stock de ${pedida}`;
  const enProd = emqState.prodMap ? (emqState.prodMap.get(prenda + '|' + pedida) || 0) : 0;
  document.getElementById('emq-alt-sub').innerHTML =
    (enProd > 0
      ? `<div style="background:#F0F7F0;border:1px solid #CDE5CD;border-radius:6px;padding:6px 8px;margin-bottom:6px">🏭 <strong>Vienen ${enProd} pieza(s) de ${pedida} en producción</strong> — si podés esperar, quizás no haga falta talla alterna.</div>`
      : '') +
    (lista.length
      ? `Para ${a.nombre}. Elegí una talla alterna disponible:`
      : `No hay NINGUNA talla de ${prenda} disponible (ni reservada ni en stock). Esta pieza queda pendiente.`);
  document.getElementById('emq-alt-lista').innerHTML = lista.map(([t, q]) => `
    <button class="btn btn-sm btn-ghost" style="min-width:56px"
      onclick="emqElegirAlt('${alumnoId}','${pieza}','${t.replace(/'/g, "\\'")}')">${t} <span style="opacity:.6">×${q}</span></button>
  `).join('') || '';
  _emqAltCtx = { alumnoId, pieza };
  modal.style.display = 'flex';
}
function emqCerrarAlt() {
  document.getElementById('emq-alt-modal').style.display = 'none';
  _emqAltCtx = null;
}
function emqElegirAlt(alumnoId, pieza, talla) {
  emqState.tallasAlt.set(alumnoId + '|' + pieza, talla);
  const m = emqState.marcados.get(alumnoId) || { top: false, bottom: false };
  m[pieza] = true;
  emqState.marcados.set(alumnoId, m);
  emqCerrarAlt();
  renderEmpaque();
}

// ── Confirmar (motor real) y deshacer ────────────────────────────────

async function emqEmpacar() {
  const piezas = [];
  const planExterno = new Map();
  const alumnosSel = [];
  for (const [id, m] of emqState.marcados) {
    const a = emqState.alumnos.find(x => x.id === id);
    if (!a || (!m.top && !m.bottom)) continue;
    planExterno.set(id, { top: !!m.top, bottom: !!m.bottom });
    alumnosSel.push(a);
    if (m.top) piezas.push({ id, pieza: 'top' });
    if (m.bottom) piezas.push({ id, pieza: 'bottom' });
  }
  if (piezas.length === 0) return;
  if (!confirm(`¿Empacar ${piezas.length} pieza(s) de ${alumnosSel.length} alumno(s)?`)) return;

  const btn = document.getElementById('emq-btn-empacar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Empacando…'; }
  try {
    const r = await empacarAlumnosDesdeRegistro(alumnosSel, null, {
      planExterno,
      tallasAlt: emqState.tallasAlt,
    });
    if (r.errores && r.errores.length > 0) {
      alert('No se pudo empacar:\n\n' + r.errores.join('\n') + '\n\nRefrescá la sesión (pudo cambiar el stock).');
      await initEmpaque(emqState.escuelaId);
      return;
    }
    const u = {
      piezas,
      resumen: `${piezas.length} pieza(s) · ${r.piezasPool} de reserva · ${r.piezasStock} de stock`,
    };
    // Refrescar la foto local sin perder la escuela (initEmpaque borra el
    // último empaque: se vuelve a poner después, si no el Deshacer no sale)
    const escId = emqState.escuelaId;
    await initEmpaque(escId);
    emqState.ultimoEmpaque = u;
    emqState.paso = 3;
    renderEmpaque();
  } catch (e) {
    alert('Error al empacar: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '📦 Empacar'; }
  }
}

async function emqDeshacer() {
  const u = emqState.ultimoEmpaque;
  if (u && u.cant) return emqCantDeshacerUI();   // 📋 empaque por pedido
  if (!u || !u.piezas.length) return;
  if (!confirm(`¿Deshacer el empaque de ${u.piezas.length} pieza(s)? Vuelven a pendiente y el stock/reserva se restaura.`)) return;
  const panel = document.getElementById('emq-exito-panel');
  let ok = 0, fail = 0;
  for (const p of u.piezas) {
    try {
      await desempacarPieza(p.id, p.pieza);
      ok++;
    } catch (e) {
      console.warn('[empaque] deshacer', p, e.message);
      fail++;
    }
    if (panel) panel.querySelector('#emq-undo-status').textContent = `↩️ Deshaciendo… ${ok + fail}/${u.piezas.length}`;
  }
  emqState.ultimoEmpaque = null;
  alert(fail === 0 ? `✓ Deshecho: ${ok} pieza(s) volvieron a pendiente.`
    : `Deshecho parcial: ${ok} ok, ${fail} con error (ver consola).`);
  await initEmpaque(emqState.escuelaId);
}

// ── 🔒 Reservar tallas (reemplaza al "Acaparar") ─────────────────────
// Reservar NO es por alumno (eso es empacar): es por TALLA y CANTIDAD.
// Muestra lo que la escuela necesita cruzado con bodega — por cada
// prenda-talla: pendientes / ya reservado / stock libre — con la cantidad
// pre-llenada en lo que falta (topada al stock real). Los niños se eligen
// recién al empacar; el motor consume la reserva primero, solo.
// Acción GLOBAL: funciona desde la sesión (escuela ya elegida) o desde
// Bodega (se elige la escuela dentro del modal). Carga sus propios datos.
async function emqAbrirReserva(escuelaId) {
  const cont = document.getElementById('emq-reserva-contenido');
  const modal = document.getElementById('emq-reserva-modal');
  if (!cont || !modal) return;
  cont.innerHTML = '<div class="text-muted" style="padding:16px;text-align:center">Cruzando necesidad vs bodega…</div>';
  modal.style.display = 'flex';

  try {
    // Escuelas y alumnos: reusar la sesión si está cargada, sino traer.
    // Stock y reservas: SIEMPRE frescos (mismo estándar que empacar).
    const usarSesion = emqState.cargado;
    const tempF = usarSesion ? '' : await emqFiltroTemporadaAlumno();
    const [escuelas, alumnos, cant, prodPend] = await Promise.all([
      usarSesion ? Promise.resolve(emqState.escuelas)
        : supaFetchAll('escuela', '?activa=eq.true&select=id,alias,nombre&order=alias'),
      usarSesion ? Promise.resolve(emqState.alumnos)
        : supaFetchAll('alumno', `?activo=eq.true${tempF}&select=id,escuela_id,prenda_top,talla_top_key,estado_top,prenda_bottom,talla_bottom_key,estado_bottom&limit=10000`),
      // Pedido + bodega + reservas, frescos (trae vw_bodega_stock y escuela_acaparado)
      emqCargarCant(),
      supaFetchAll('vw_produccion_estado',
        '?estado_manual=neq.terminado&select=cod_prenda,talla_key_salida,cantidad_original')
        .catch(() => []),
    ]);
    const stock = cant.stockRows;
    const pool = cant.acapViejo;   // reservas por alumno (lo empacado por pedido va aparte)
    const stockFresco = new Map();
    for (const s of stock) {
      const p = s.nombre_prenda || (typeof prendaCanon === 'function' ? prendaCanon(s.cod_prenda) : s.cod_prenda);
      if (p && s.talla_key) stockFresco.set(p + '|' + s.talla_key, Number(s.stock_actual) || 0);
    }
    const prodMap = new Map();
    for (const b of prodPend) {
      if (!b.cod_prenda || !b.talla_key_salida) continue;
      const nombre = (typeof prendaCanon === 'function') ? prendaCanon(b.cod_prenda) : b.cod_prenda;
      const k = nombre + '|' + b.talla_key_salida;
      prodMap.set(k, (prodMap.get(k) || 0) + (Number(b.cantidad_original) || 0));
    }
    emqState._resv = {
      escuelas, alumnos, stockFresco, prodMap, poolRows: pool, datosCant: cant,
      modoCant: false,   // escuela con pedido 2026 → reservar = empacar por cantidad
      escuelaId: escuelaId || '',
      prendaSel: null,
      cant: new Map(),   // k → cantidad elegida
      filas: [],
    };
    emqResvBuild();
    emqResvRender();
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error">No se pudo leer bodega: ${e.message}</div>`;
  }
}

// Recalcula las filas (necesidad vs bodega) para la escuela elegida.
function emqResvBuild() {
  const r = emqState._resv;
  r.filas = [];
  r.prendaSel = null;
  r.modoCant = false;
  if (!r.escuelaId) return;
  // 📋 Escuela por pedido (sin nombres): la tabla es la de cantidades
  if (r.datosCant && r.datosCant.escuelasPedido.has(r.escuelaId)) {
    r.modoCant = true;
    emqSelInit('remp', emqLineasEscuela(r.datosCant, r.escuelaId).map(L => [L.k, L.puede]), true);
    return;
  }

  const poolEscuela = new Map();
  for (const p of r.poolRows) {
    if (p.escuela_id !== r.escuelaId) continue;
    const d = Math.max(0, (Number(p.cantidad_acaparada) || 0) - (Number(p.cantidad_consumida) || 0));
    if (d > 0) {
      const k = p.nombre_prenda + '|' + p.talla_key;
      poolEscuela.set(k, (poolEscuela.get(k) || 0) + d);
    }
  }
  // Necesidad de la escuela por prenda|talla (tallas PEDIDAS, piezas pendientes)
  const necesidad = new Map();
  for (const a of r.alumnos) {
    if (a.escuela_id !== r.escuelaId) continue;
    for (const pieza of ['top', 'bottom']) {
      if (!emqPend(a, pieza)) continue;
      const k = emqPrenda(a, pieza) + '|' + (pieza === 'top' ? a.talla_top_key : a.talla_bottom_key);
      necesidad.set(k, (necesidad.get(k) || 0) + 1);
    }
  }
  r.filas = [...necesidad.entries()]
    .map(([k, pend]) => {
      const [prenda, talla] = k.split('|');
      const reservado = poolEscuela.get(k) || 0;
      const stockLibre = r.stockFresco.get(k) || 0;
      const enProd = (r.prodMap && r.prodMap.get(k)) || 0;
      const falta = Math.max(0, pend - reservado);
      const sugerido = Math.min(falta, stockLibre);
      return { k, prenda, talla, pend, reservado, stockLibre, enProd, falta, sugerido };
    })
    .sort((a, b) => a.prenda.localeCompare(b.prenda) || a.talla.localeCompare(b.talla, 'es', { numeric: true }));
  const prendas = [...new Set(r.filas.map(f => f.prenda))];
  r.prendaSel = prendas.find(p => r.filas.some(f => f.prenda === p && f.falta > 0)) || prendas[0] || null;
}

function emqResvCambiarEscuela(id) {
  const r = emqState._resv;
  if (!r) return;
  r.escuelaId = id;
  r.cant = new Map();  // carrito nuevo: es otra escuela
  emqResvBuild();
  emqResvRender();
}

function emqResvRender() {
  const cont = document.getElementById('emq-reserva-contenido');
  const r = emqState._resv;
  if (!cont || !r) return;
  const filas = r.filas;
  // La tabla por cantidad necesita más ancho que la lista por talla
  const caja = document.querySelector('#emq-reserva-modal .modal-content');
  if (caja) caja.style.maxWidth = r.modoCant ? '760px' : '520px';

  // Selector de escuela (siempre visible: se puede cambiar sobre la marcha)
  const selEscuela = `
    <div class="field" style="margin-bottom:10px">
      <label>Escuela</label>
      <select onchange="emqResvCambiarEscuela(this.value)">
        <option value="">— Elegí escuela —</option>
        ${r.escuelas.map(e => `<option value="${e.id}" ${e.id === r.escuelaId ? 'selected' : ''}>${e.alias || e.nombre}</option>`).join('')}
      </select>
    </div>`;

  if (!r.escuelaId) {
    cont.innerHTML = selEscuela + `
      <div class="text-muted" style="padding:12px;text-align:center;font-size:12px">Elegí la escuela para ver qué necesita y qué hay en bodega.</div>
      <div style="text-align:right"><button class="btn btn-ghost btn-sm" onclick="emqCerrarReserva()">Cerrar</button></div>`;
    return;
  }

  if (r.modoCant) {
    const lineas = emqLineasEscuela(r.datosCant, r.escuelaId);
    const tot = emqSelTotal('remp');
    cont.innerHTML = selEscuela + `
      <div class="text-muted mb8" style="font-size:12px">
        📋 Esta escuela va <strong>por pedido</strong> (sin nombres). Reservar = empacar por cantidad:
        sale de bodega y queda apartado para la escuela hasta que se entregue.
      </div>
      ${emqTablaCantHtml(lineas, 'remp', 'modal')}
      <div style="display:flex;gap:8px;align-items:center;margin-top:12px;border-top:2px solid var(--borde);padding-top:10px">
        <div style="flex:1;font-size:12px"><strong data-emq-total="remp">${tot}</strong> pieza(s)</div>
        <button class="btn btn-ghost btn-sm" onclick="emqCerrarReserva()">Cerrar</button>
        <button class="btn btn-success btn-sm" data-emq-btn="remp" onclick="emqCantEmpacarUI('remp','modal')" ${tot === 0 ? 'disabled' : ''}>📦 Empacar todo lo que alcance</button>
      </div>`;
    return;
  }

  if (filas.length === 0) {
    cont.innerHTML = selEscuela + `
      <div class="alert alert-info">Esta escuela no tiene piezas pendientes — no hay nada que reservar.</div>
      <div style="text-align:right;margin-top:8px"><button class="btn btn-ghost btn-sm" onclick="emqCerrarReserva()">Cerrar</button></div>`;
    return;
  }

  // Chips de prendas (badge = piezas que aún faltan reservar de esa prenda)
  const prendas = [...new Set(filas.map(f => f.prenda))];
  const chips = prendas.map(p => {
    const falta = filas.filter(f => f.prenda === p).reduce((s, f) => s + f.falta, 0);
    const enCarrito = filas.filter(f => f.prenda === p).reduce((s, f) => s + (r.cant.get(f.k) || 0), 0);
    const sel = p === r.prendaSel;
    return `<button class="btn btn-sm ${sel ? 'btn-primary' : 'btn-ghost'}" style="font-weight:${sel ? 700 : 600}"
      onclick="emqState._resv.prendaSel='${p.replace(/'/g, "\\'")}';emqResvRender()">
      ${p} <span style="opacity:.65;font-size:10px">${enCarrito > 0 ? '🔒' + enCarrito : (falta > 0 ? 'faltan ' + falta : '✓')}</span></button>`;
  }).join(' ');

  // Tallas de la prenda elegida en ESTA escuela
  const delSel = filas.filter(f => f.prenda === r.prendaSel);
  const filasHtml = delSel.map(f => {
    const n = r.cant.get(f.k) || 0;
    const sinStock = f.stockLibre === 0;
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 4px;border-top:1px solid #F0F0F0;${sinStock ? 'opacity:.55' : ''}">
        <button style="min-width:64px;padding:8px 6px;border-radius:8px;font-weight:700;border:2px solid ${n > 0 ? 'var(--verde)' : 'var(--borde)'};background:${n > 0 ? '#E0F4E5' : 'white'};font-family:monospace"
          onclick="emqResvTapTalla('${f.k.replace(/'/g, "\\'")}')"
          title="${sinStock ? 'Sin stock libre' : 'Tap: reservar lo que falta (' + f.sugerido + ')'}"
          ${sinStock ? 'disabled' : ''}>${f.talla}</button>
        <div style="flex:1;font-size:11px;color:#666;line-height:1.5">
          Pendientes: <strong>${f.pend}</strong>${f.reservado ? ` · 🔒 ya reservadas: <strong style="color:#a82">${f.reservado}</strong>` : ''}<br>
          📦 En bodega: <strong style="color:${f.stockLibre > 0 ? 'var(--azul)' : '#c44'}">${f.stockLibre}</strong>${f.enProd > 0 ? ` · 🏭 vienen: <strong style="color:#6a5">${f.enProd}</strong>` : ''}${f.falta === 0 ? ' · <span style="color:var(--verde)">cubierta ✓</span>' : ''}
        </div>
        <div style="display:flex;align-items:center;gap:2px">
          <button class="btn btn-ghost btn-sm" style="min-width:36px;padding:6px" onclick="emqResvSet('${f.k.replace(/'/g, "\\'")}',-1)" ${n === 0 ? 'disabled' : ''}>−</button>
          <span style="min-width:28px;text-align:center;font-weight:700;font-size:15px">${n}</span>
          <button class="btn btn-ghost btn-sm" style="min-width:36px;padding:6px" onclick="emqResvSet('${f.k.replace(/'/g, "\\'")}',1)" ${n >= f.stockLibre ? 'disabled' : ''}>+</button>
        </div>
      </div>`;
  }).join('');

  const total = [...r.cant.values()].reduce((s, n) => s + n, 0);
  const resumen = filas.filter(f => (r.cant.get(f.k) || 0) > 0)
    .map(f => `${f.talla}×${r.cant.get(f.k)}`).join(' · ');

  cont.innerHTML = selEscuela + `
    <div class="text-muted mb8" style="font-size:12px">
      Elegí prenda → tocá la talla para reservar lo que falta, o ajustá con − / +.
      Podés pasar de prenda en prenda: todo se junta en una sola reserva.
    </div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">${chips}</div>
    <div>${filasHtml || '<div class="text-muted" style="padding:12px;text-align:center">Esta prenda no tiene tallas pendientes acá.</div>'}</div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:12px;border-top:2px solid var(--borde);padding-top:10px">
      <div style="flex:1;font-size:12px">
        <strong>${total}</strong> pieza(s)${resumen ? `<br><span style="color:#888;font-size:11px">${resumen}</span>` : ''}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="emqCerrarReserva()">Cancelar</button>
      <button class="btn btn-success btn-sm" onclick="emqConfirmarReserva()" ${total === 0 ? 'disabled' : ''}>🔒 Reservar ${total || ''}</button>
    </div>`;
}

// Tap en la talla: alterna entre 0 y "lo que falta" (topado al stock)
function emqResvTapTalla(k) {
  const r = emqState._resv;
  const f = r.filas.find(x => x.k === k);
  if (!f) return;
  const actual = r.cant.get(k) || 0;
  const objetivo = actual > 0 ? 0 : Math.max(1, f.sugerido);
  if (objetivo === 0) r.cant.delete(k);
  else r.cant.set(k, Math.min(objetivo, f.stockLibre));
  emqResvRender();
}

function emqResvSet(k, delta) {
  const r = emqState._resv;
  const f = r.filas.find(x => x.k === k);
  if (!f) return;
  const n = Math.max(0, Math.min(f.stockLibre, (r.cant.get(k) || 0) + delta));
  if (n === 0) r.cant.delete(k);
  else r.cant.set(k, n);
  emqResvRender();
}

function emqCerrarReserva() {
  document.getElementById('emq-reserva-modal').style.display = 'none';
  emqState._resv = null;
}

async function emqConfirmarReserva() {
  const r = emqState._resv;
  if (!r || !r.escuelaId) return;
  const escId = r.escuelaId;
  const pedidos = r.filas
    .filter(f => (r.cant.get(f.k) || 0) > 0)
    .map(f => ({ ...f, n: r.cant.get(f.k) }));
  if (pedidos.length === 0) { alert('Elegí al menos una talla (tocá la talla o usá +).'); return; }

  // Re-validar contra stock FRESCO al momento de confirmar (todo o nada)
  let stockFresco;
  try {
    const stock = await supaFetchAll('vw_bodega_stock', '?select=nombre_prenda,cod_prenda,talla_key,stock_actual');
    stockFresco = new Map();
    for (const s of stock) {
      const p = s.nombre_prenda || (typeof prendaCanon === 'function' ? prendaCanon(s.cod_prenda) : s.cod_prenda);
      if (p && s.talla_key) stockFresco.set(p + '|' + s.talla_key, Number(s.stock_actual) || 0);
    }
  } catch (e) {
    alert('No se pudo verificar el stock: ' + e.message);
    return;
  }
  const faltantes = pedidos
    .filter(p => p.n > (stockFresco.get(p.k) || 0))
    .map(p => `· ${p.prenda} ${p.talla}: querés ${p.n} pero hay ${stockFresco.get(p.k) || 0}`);
  if (faltantes.length > 0) {
    alert('No se reservó NADA — el stock cambió:\n\n' + faltantes.join('\n'));
    await emqAbrirReserva(escId);
    return;
  }

  const total = pedidos.reduce((s, p) => s + p.n, 0);
  if (!confirm(`¿Reservar ${total} pieza(s) para esta escuela?\n\n${pedidos.map(p => `· ${p.prenda} ${p.talla} × ${p.n}`).join('\n')}\n\nLos alumnos siguen PENDIENTES; al empacarlos, la reserva se consume sola.`)) return;

  try {
    const hoy = new Date().toISOString().slice(0, 10);
    for (const p of pedidos) {
      const cod = (typeof _codPrenda === 'function') ? _codPrenda(p.prenda) : p.prenda;
      const movs = await supaFetch('bodega_movimiento', 'POST', {
        tipo: 'SALIDA_EMPAQUE',
        cod_prenda: cod, nombre_prenda: p.prenda, talla_key: p.talla,
        cantidad: p.n, escuela_id: escId, fecha: hoy,
        observaciones: 'Reservado desde sesión de empaque',
      });
      const movId = Array.isArray(movs) ? movs[0]?.id : movs?.id;
      await supaFetch('escuela_acaparado', 'POST', {
        escuela_id: escId,
        cod_prenda: cod, nombre_prenda: p.prenda, talla_key: p.talla,
        cantidad_acaparada: p.n, cantidad_consumida: 0,
        movimiento_bodega_id: movId,
        observaciones: 'Reserva desde sesión de empaque',
      });
    }
    emqCerrarReserva();
    alert(`✓ ${total} pieza(s) reservadas. Al empacar a los alumnos, la reserva se usa primero, sola.`);
    // Refrescar lo que esté a la vista: sesión (si está abierta) y/o Bodega
    const enBodega = document.getElementById('view-bodega')?.classList.contains('active');
    if (emqState.cargado && document.getElementById('view-empaque')?.classList.contains('active')) {
      await initEmpaque(emqState.escuelaId || escId);
    }
    if (enBodega && typeof cargarBodegaStock === 'function') cargarBodegaStock();
  } catch (e) {
    alert('Error al reservar: ' + e.message);
  }
}

// ── 🚚 Entrega integrada (paso 3) ────────────────────────────────────
// Marca TODOS los empacados de la escuela como entregados (misma
// semántica que el flujo de Bodega) + crea el registro en entrega_escuela.
async function emqEntregar() {
  const escId = emqState.escuelaId;
  const fecha = document.getElementById('emq-ent-fecha').value;
  const receptor = document.getElementById('emq-ent-receptor').value.trim() || null;
  if (!fecha) { alert('Elegí la fecha'); return; }
  const btn = document.getElementById('emq-btn-entregar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Registrando…'; }
  try {
    // Solo alumnos de la temporada activa (los de temporadas cerradas no se tocan)
    const tempF = await emqFiltroTemporadaAlumno();
    const empacados = await supaFetch('alumno', 'GET', null,
      `?escuela_id=eq.${escId}${tempF}&or=(estado_top.eq.empacado,estado_bottom.eq.empacado)&select=id,estado_top,estado_bottom&limit=10000`);
    let n = 0;
    for (const a of empacados) {
      if (a.estado_top === 'empacado') n++;
      if (a.estado_bottom === 'empacado') n++;
    }
    if (n === 0) { alert('No hay piezas empacadas pendientes de entrega.'); return; }
    if (!confirm(`Se van a marcar como ENTREGADAS ${n} pieza(s) empacadas de esta escuela (todas, no solo las de esta sesión). ¿Confirmar?`)) return;

    const nowIso = new Date().toISOString();
    await _bulkPatchAlumno(`?escuela_id=eq.${escId}${tempF}&estado_top=eq.empacado`,
      { estado_top: 'entregado', actualizado_en: nowIso });
    await _bulkPatchAlumno(`?escuela_id=eq.${escId}${tempF}&estado_bottom=eq.empacado`,
      { estado_bottom: 'entregado', actualizado_en: nowIso });
    await supaFetch('entrega_escuela', 'POST', {
      escuela_id: escId, fecha, cantidad_piezas: n, receptor,
      observaciones: 'Registrada desde sesión de empaque',
    });
    emqState.ultimoEmpaque = null;  // ya entregado: el deshacer de sesión no aplica
    alert(`✓ Entrega registrada: ${n} pieza(s) el ${fecha}${receptor ? ' · recibió ' + receptor : ''}.`);
    await initEmpaque(escId);
  } catch (e) {
    alert('Error al registrar la entrega: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🚚 Confirmar entrega'; }
  }
}

// ── Render ───────────────────────────────────────────────────────────

function renderEmpaque() {
  const root = document.getElementById('empaque-contenido');
  if (!root || !emqState.cargado) return;
  if (emqState.paso === 1) { root.innerHTML = emqPaso1Html(); return; }
  const porPedido = emqEsPorPedido(emqState.escuelaId);
  if (emqState.paso === 3) { root.innerHTML = porPedido ? emqPaso3CantHtml() : emqPaso3Html(); return; }
  root.innerHTML = porPedido ? emqPaso2CantHtml() : emqPaso2Html();
}

function emqPaso1Html() {
  const cards = emqState.escuelas.map(e => {
    if (emqEsPorPedido(e.id)) return emqCardCantHtml(e);
    const { empacables, pendientes } = emqEmpacablesEscuela(e.id);
    if (pendientes === 0) return '';
    const color = empacables > 0 ? 'var(--verde)' : '#bbb';
    return `
      <div class="card" style="padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer" onclick="emqState.escuelaId='${e.id}';emqState.paso=2;renderEmpaque()">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700">${e.alias || e.nombre}</div>
          <div style="font-size:12px;color:#666">${pendientes} pieza(s) pendiente(s)</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:700;color:${color}">${empacables}</div>
          <div style="font-size:10px;color:#888">empacables ya</div>
        </div>
        <div style="font-size:18px;color:#bbb">›</div>
      </div>`;
  }).join('');
  return `
    <div class="card" style="padding:10px 12px;margin-bottom:10px">
      <div style="font-weight:700">🧺 Sesión de empaque</div>
      <div style="font-size:12px;color:#666;margin-top:2px">Elegí la escuela. "Empacables ya" = piezas que faltan y se pueden empacar con lo que hay ahora en bodega. 📋 = escuela por pedido (sin nombres).</div>
    </div>
    ${cards || '<div class="alert alert-info">🎉 No hay piezas pendientes en ninguna escuela.</div>'}
    <div style="text-align:center;margin-top:8px">
      <button class="btn btn-ghost btn-sm" onclick="initEmpaque()">🔄 Refrescar</button>
    </div>`;
}

function emqListaHtml() {
  const escId = emqState.escuelaId;
  const q = (emqState.busqueda || '').toLowerCase();
  const rest = emqRestante();
  let alumnos = emqState.alumnos.filter(a => a.escuela_id === escId
    && (emqPend(a, 'top') || emqPend(a, 'bottom')
        || a.estado_top === 'empacado' || a.estado_bottom === 'empacado'));
  if (q) alumnos = alumnos.filter(a => (a.nombre || '').toLowerCase().includes(q));
  alumnos.sort((a, b) => (a.grado || '').localeCompare(b.grado || '', 'es', { numeric: true })
    || (a.nombre || '').localeCompare(b.nombre || '', 'es'));

  const cod = (p) => (typeof _codPrenda === 'function' ? _codPrenda(p) : p) || p;
  const btnPieza = (a, pieza) => {
    const prenda = emqPrenda(a, pieza);
    const talla = pieza === 'top' ? a.talla_top_key : a.talla_bottom_key;
    const estado = pieza === 'top' ? a.estado_top : a.estado_bottom;
    if (!prenda || !talla) return '<span style="display:inline-block;width:74px;text-align:center;color:#ccc">—</span>';
    const base = 'min-width:74px;padding:8px 6px;border-radius:8px;font-size:12px;font-weight:700;border:2px solid;';
    if (estado === 'empacado' || estado === 'entregado') {
      return `<button style="${base}background:#E0F4E5;color:var(--verde);border-color:var(--verde);cursor:default" title="Ya ${estado}">✓ ${talla}</button>`;
    }
    const m = emqState.marcados.get(a.id) || {};
    const alt = emqState.tallasAlt.get(a.id + '|' + pieza);
    if (m[pieza]) {
      const lbl = alt ? `${alt} <s style="opacity:.6;font-size:10px">${talla}</s>` : talla;
      return `<button style="${base}background:var(--verde);color:white;border-color:var(--verde)"
        onclick="emqToggle('${a.id}','${pieza}')" title="Marcada para empacar${alt ? ' con talla alterna' : ''} — tocá para quitar">🧺 ${lbl}</button>`;
    }
    if (emqHay(a, pieza, rest)) {
      return `<button style="${base}background:white;color:var(--azul);border-color:var(--azul)"
        onclick="emqToggle('${a.id}','${pieza}')" title="${cod(prenda)}${talla} disponible — tocá para marcar">${talla}</button>`;
    }
    const enProd = emqState.prodMap ? (emqState.prodMap.get(prenda + '|' + talla) || 0) : 0;
    return `<button style="${base}background:#F5F5F5;color:#999;border-color:#DDD;border-style:dashed;${enProd > 0 ? 'color:#6a5;border-color:#9c8' : ''}"
      onclick="emqToggle('${a.id}','${pieza}')"
      title="Sin stock de ${cod(prenda)}${talla}${enProd > 0 ? ` — 🏭 vienen ${enProd} en producción` : ''} — tocá para elegir talla alterna">${enProd > 0 ? '🏭' : '⚠'} ${talla}</button>`;
  };

  let html = '', gradoAct = null;
  for (const a of alumnos) {
    if ((a.grado || '?') !== gradoAct) {
      gradoAct = a.grado || '?';
      html += `<div style="background:#F5F7FA;padding:4px 12px;font-size:11px;font-weight:700;color:#666;border-top:1px solid var(--borde)">${gradoAct}</div>`;
    }
    html += `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-top:1px solid #F0F0F0">
        <div style="flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.nombre || ''} <span style="color:#aaa;font-size:11px">${a.sexo || ''}</span></div>
        ${btnPieza(a, 'top')}
        ${btnPieza(a, 'bottom')}
      </div>`;
  }
  return html || '<div class="text-muted" style="padding:20px;text-align:center">Sin alumnos que mostrar.</div>';
}

function emqPaso2Html() {
  const esc = emqState.escuelas.find(e => e.id === emqState.escuelaId) || {};
  const { empacables, pendientes } = emqEmpacablesEscuela(emqState.escuelaId);
  let nPiezas = 0, nAlumnos = 0;
  for (const [, m] of emqState.marcados) {
    if (m.top) nPiezas++;
    if (m.bottom) nPiezas++;
    if (m.top || m.bottom) nAlumnos++;
  }
  return `
    <div class="card" style="padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="emqVolverEscuelas()">‹ Escuelas</button>
        <div style="flex:1;min-width:120px">
          <div style="font-weight:700">🧺 ${esc.alias || esc.nombre || ''}</div>
          <div style="font-size:11px;color:#666">${pendientes} pendiente(s) · ${empacables} empacable(s) ya</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="initEmpaque(emqState.escuelaId)" title="Refrescar stock y alumnos">🔄</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px">
        <button class="btn btn-primary btn-sm" onclick="emqMarcarTodos()">☑️ Marcar todos los empacables</button>
        <button class="btn btn-warning btn-sm" onclick="emqAbrirReserva(emqState.escuelaId)"
          title="Apartar stock por TALLA y CANTIDAD para esta escuela, sin empacar. Los niños se eligen al empacar; la reserva se consume sola.">🔒 Reservar tallas</button>
        ${nPiezas > 0 ? '<button class="btn btn-ghost btn-sm" onclick="emqLimpiar()">✕ Limpiar</button>' : ''}
        <label style="display:flex;gap:5px;align-items:center;font-size:12px;cursor:pointer;margin-left:auto" title="Al marcar una pieza, la otra del mismo alumno se marca sola si hay stock">
          <input type="checkbox" ${emqState.parejas ? 'checked' : ''} onchange="emqSetParejas(this.checked)" style="width:18px;height:18px">
          🧷 Parejas
        </label>
      </div>
      <input type="text" placeholder="🔍 Filtrar por nombre…" value="${emqState.busqueda}"
        oninput="emqSetBusqueda(this.value)"
        style="width:100%;margin-top:8px;padding:7px 10px;border:1px solid var(--borde);border-radius:6px;font-size:13px">
      <div style="font-size:11px;color:#888;margin-top:6px">
        Azul = disponible (tocá para marcar) · ⚠ gris = sin stock de esa talla (tocá para talla alterna) · ✓ verde = ya empacada
      </div>
    </div>
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:74px" id="emq-lista-card">
      <div id="emq-lista">${emqListaHtml()}</div>
    </div>
    <div style="position:fixed;bottom:calc(66px + env(safe-area-inset-bottom));left:0;right:0;z-index:900;display:flex;justify-content:center;pointer-events:none">
      <div style="pointer-events:auto;background:white;border:1px solid var(--borde);border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.2);padding:8px 12px;display:flex;gap:8px;align-items:center;margin:0 12px">
        <div style="font-size:13px"><strong>${nPiezas}</strong> pieza(s) · <strong>${nAlumnos}</strong> alumno(s)</div>
        <button id="emq-btn-empacar" class="btn btn-success" ${nPiezas === 0 ? 'disabled' : ''} onclick="emqEmpacar()">📦 Empacar</button>
      </div>
    </div>`;
}

function emqPaso3Html() {
  const esc = emqState.escuelas.find(e => e.id === emqState.escuelaId) || {};
  const u = emqState.ultimoEmpaque;
  return `
    <div class="card" id="emq-exito-panel" style="padding:20px;text-align:center;max-width:440px;margin:20px auto">
      <div style="font-size:40px">✅</div>
      <div style="font-weight:700;font-size:16px;margin:6px 0">Empaque registrado</div>
      <div style="font-size:13px;color:#666">${esc.alias || esc.nombre || ''} · ${u ? u.resumen : ''}</div>
      <div id="emq-undo-status" style="font-size:12px;color:#888;margin-top:4px"></div>

      <!-- Entrega integrada: fecha + receptor acá mismo, sin saltar de vista -->
      <div style="margin-top:16px;padding:12px;background:#F5F9F5;border:1px solid #CDE5CD;border-radius:8px;text-align:left">
        <div style="font-weight:700;font-size:13px;margin-bottom:8px">🚚 ¿Entregar a la escuela ahora?</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end">
          <div class="field" style="margin:0">
            <label>Fecha</label>
            <input type="date" id="emq-ent-fecha" value="${new Date().toISOString().slice(0, 10)}" style="width:150px">
          </div>
          <div class="field" style="margin:0;flex:1;min-width:140px">
            <label>Recibió (opcional)</label>
            <input type="text" id="emq-ent-receptor" placeholder="Nombre de quien recibe">
          </div>
          <button id="emq-btn-entregar" class="btn btn-primary btn-sm" onclick="emqEntregar()">🚚 Confirmar entrega</button>
        </div>
        <div style="font-size:11px;color:#888;margin-top:6px">Marca como entregadas TODAS las piezas empacadas de la escuela y deja el registro con fecha y receptor.</div>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
        <button class="btn btn-ghost" onclick="emqState.paso=2;renderEmpaque()">📋 Seguir en esta escuela</button>
        <button class="btn btn-ghost" onclick="emqVolverEscuelas();renderEmpaque()">🧺 Otra escuela</button>
        ${u ? '<button class="btn btn-ghost" style="color:var(--rojo)" onclick="emqDeshacer()">↩️ Deshacer este empaque</button>' : ''}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════
// 📋 MODO POR CANTIDAD — temporada con pedido SIN nombres (2026)
// El MINED manda solo escuela × prenda × talla × cantidad (tabla `pedido`).
// Una escuela va "por pedido" si tiene filas de pedido en los contratos de
// la temporada activa. El flujo por alumno queda para temporadas con alumnos.
//
// Libro de bodega (el mismo de la reserva de 2025, para no descontar 2 veces):
//   Empacar N  → bodega_movimiento SALIDA_EMPAQUE (N, con pedido_id) +
//                escuela_acaparado (acaparada N, consumida 0). El stock baja
//                UNA vez, acá (vw_bodega_stock resta SALIDA_EMPAQUE).
//   Entregar N → consume N de ese escuela_acaparado (consume_pool_batch),
//                suma N a pedido.cantidad_entregada y deja entrega_escuela.
//                Bodega NO se mueve: ya salió al empacar (en 2025 entregar
//                era solo cambiar el estado del alumno, sin movimiento).
//   "Empacado" de una línea = acaparado − consumido de las filas cuyo
//   movimiento tiene pedido_id de la temporada activa (así se filtra la
//   temporada: escuela_acaparado no tiene columna propia).
//
// Tallas: el pedido usa la talla 2026 (P12 = T12). Bodega guarda claves
// viejas (P1181 = talla vieja 11, largo 81). El cruce es el mismo de
// Prod → 📐 Plan (vw_plan_produccion): vw_bodega_equivalente
// (talla_equivalencia + largo con tolerancia); solo cuenta lo que "sirve".
// Las claves sin equivalencia (B12, CC6, S8, FCE10…) cruzan directo.
// ══════════════════════════════════════════════════════════════════════

const _EMQ_PRENDA_ORD = ['C', 'B', 'CC', 'P', 'PB', 'F', 'FB', 'FCE', 'S'];
const _EMQ_NIVEL_ORD = { PARV: 0, BASICA: 1, BACH: 2 };
let _emqTemporada = null;   // { temporada, contratoIds } — cambia muy poco
let _emqOcupado = false;    // evita doble toque mientras se escribe

function emqEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Fecha local AAAA-MM-DD (toISOString da la de UTC: después de las 6 pm ya es mañana)
function emqHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function emqTemporadaActiva() {
  if (_emqTemporada) return _emqTemporada;
  const t = (await supaFetch('temporada', 'GET', null,
    '?estado=eq.activa&select=id,codigo,anio&order=anio.desc&limit=1'))[0] || null;
  const contratos = t
    ? await supaFetch('contrato', 'GET', null, `?temporada_id=eq.${t.id}&select=id`)
    : [];
  _emqTemporada = { temporada: t, contratoIds: (contratos || []).map(c => c.id) };
  return _emqTemporada;
}

// Filtro de alumnos por temporada activa ('' si no hay temporada activa)
async function emqFiltroTemporadaAlumno() {
  try {
    const { temporada } = await emqTemporadaActiva();
    return temporada ? `&temporada_id=eq.${temporada.id}` : '';
  } catch (e) {
    console.warn('[empaque] temporada activa:', e.message);
    return '';
  }
}

// Clave de bodega → talla 2026 sin la T ("12", "1X"). sirve=false si el
// pantalón queda corto de largo para esa talla (no se cuenta).
function emqTallaDeBodega(cod, key, eqMap) {
  const e = eqMap && eqMap.get(key);
  if (e) return { t: String(e.talla_2026 || '').replace(/^T/, ''), sirve: e.largo_alcanza !== false };
  if (!cod || !key || !key.startsWith(cod)) return null;
  return { t: key.slice(cod.length), sirve: true };
}

function emqLineaKey(cod, tallaKey) {
  return cod + '|' + String(tallaKey || '').slice(cod.length);
}

// Datos del modo por cantidad, siempre frescos. Con escuelaId trae solo el
// pedido y lo empacado de esa escuela (más liviano para modales y escrituras).
async function emqCargarCant(escuelaId) {
  const { temporada, contratoIds } = await emqTemporadaActiva();
  const escF = escuelaId ? `&escuela_id=eq.${escuelaId}` : '';
  const [pedido, acap, stock, eq, plan] = await Promise.all([
    contratoIds.length
      ? supaFetchAll('pedido', `?contrato_id=in.(${contratoIds.join(',')})${escF}` +
          '&select=id,escuela_id,nivel,cod_prenda,nombre_prenda,talla_key,cantidad_solicitada,cantidad_entregada&order=id')
      : Promise.resolve([]),
    supaFetchAll('escuela_acaparado',
      '?select=id,escuela_id,cod_prenda,nombre_prenda,talla_key,cantidad_acaparada,cantidad_consumida,creado_en,bodega_movimiento(pedido_id)' +
      `${escF}&order=creado_en,id`),
    supaFetchAll('vw_bodega_stock', '?select=nombre_prenda,cod_prenda,talla_key,stock_actual'),
    supaFetchAll('vw_bodega_equivalente', '?select=talla_key,talla_2026,largo_alcanza'),
    supaFetch('vw_plan_produccion', 'GET', null, '?select=cod_prenda,talla_2026,en_proceso').catch(() => []),
  ]);
  const ctx = {
    temporada,
    pedido: pedido || [], pedidoById: new Map(), escuelasPedido: new Set(),
    acap: [],        // empacado por pedido, sin entregar (resto > 0)
    acapViejo: [],   // reservas del flujo por alumno (sin pedido_id)
    stockRows: stock || [],
    eqMap: new Map(),
    porLinea: new Map(),   // "cod|talla2026" → { sirve:[claves de bodega], corto:n }
    enProceso: new Map(),  // "cod|talla2026" → piezas en producción (Plan)
  };
  for (const p of ctx.pedido) { ctx.pedidoById.set(p.id, p); ctx.escuelasPedido.add(p.escuela_id); }
  for (const a of acap || []) {
    const pid = a.bodega_movimiento ? a.bodega_movimiento.pedido_id : null;
    if (!pid) { ctx.acapViejo.push(a); continue; }
    if (!ctx.pedidoById.has(pid)) continue;   // pedido de otra temporada
    const resto = Math.max(0, (Number(a.cantidad_acaparada) || 0) - (Number(a.cantidad_consumida) || 0));
    if (resto > 0) ctx.acap.push({ ...a, pedido_id: pid, resto });
  }
  for (const e of eq || []) if (e.talla_key && !ctx.eqMap.has(e.talla_key)) ctx.eqMap.set(e.talla_key, e);
  // Stock por clave de bodega (sumado: la vista agrupa también por nombre)
  const porKey = new Map();
  for (const s of ctx.stockRows) {
    if (!s.cod_prenda || !s.talla_key) continue;
    const k = s.cod_prenda + '|' + s.talla_key;
    const o = porKey.get(k) || {
      cod: s.cod_prenda, nombre: s.nombre_prenda || prendaCanon(s.cod_prenda), talla_key: s.talla_key, stock: 0,
    };
    o.stock += Number(s.stock_actual) || 0;
    porKey.set(k, o);
  }
  for (const o of porKey.values()) {
    if (o.stock <= 0) continue;
    const m = emqTallaDeBodega(o.cod, o.talla_key, ctx.eqMap);
    if (!m || !m.t) continue;
    const lk = o.cod + '|' + m.t;
    const L = ctx.porLinea.get(lk) || { sirve: [], corto: 0 };
    if (m.sirve) L.sirve.push({ ...o, exacta: o.talla_key === o.cod + m.t });
    else L.corto += o.stock;
    ctx.porLinea.set(lk, L);
  }
  // De dónde sacar: primero la clave igual a la del pedido, después la que más tiene
  for (const L of ctx.porLinea.values()) L.sirve.sort((a, b) => (b.exacta - a.exacta) || (b.stock - a.stock));
  for (const p of plan || []) {
    if (!p.cod_prenda || !p.talla_2026) continue;
    ctx.enProceso.set(p.cod_prenda + '|' + String(p.talla_2026).replace(/^T/, ''), Number(p.en_proceso) || 0);
  }
  return ctx;
}

function emqEsPorPedido(escId) {
  return !!(escId && emqState.cant && emqState.cant.escuelasPedido.has(escId));
}

// Líneas del pedido de una escuela: una por prenda+talla (si la misma talla
// viene en dos niveles, se juntan: físicamente es la misma pieza).
function emqLineasEscuela(ctx, escId) {
  if (!ctx || !escId) return [];
  const lineas = new Map();
  for (const p of ctx.pedido) {
    if (p.escuela_id !== escId || !p.cod_prenda) continue;
    const k = emqLineaKey(p.cod_prenda, p.talla_key);
    let L = lineas.get(k);
    if (!L) {
      L = {
        k, cod: p.cod_prenda, t: k.slice(p.cod_prenda.length + 1),
        prenda: p.nombre_prenda || prendaCanon(p.cod_prenda), talla: p.talla_key,
        filas: [], niveles: [], acap: [], pedido: 0, entregado: 0, empacado: 0,
      };
      lineas.set(k, L);
    }
    L.filas.push(p);
    L.pedido += Number(p.cantidad_solicitada) || 0;
    L.entregado += Number(p.cantidad_entregada) || 0;
  }
  for (const a of ctx.acap) {
    if (a.escuela_id !== escId) continue;
    const p = ctx.pedidoById.get(a.pedido_id);
    const L = p && lineas.get(emqLineaKey(p.cod_prenda, p.talla_key));
    if (!L) continue;
    L.acap.push(a);
    L.empacado += a.resto;
  }
  for (const L of lineas.values()) {
    L.filas.sort((a, b) => (_EMQ_NIVEL_ORD[a.nivel] ?? 9) - (_EMQ_NIVEL_ORD[b.nivel] ?? 9));
    L.niveles = [...new Set(L.filas.map(f => f.nivel).filter(Boolean))];
    L.falta = Math.max(0, L.pedido - L.entregado - L.empacado);
    const B = ctx.porLinea.get(L.k) || { sirve: [], corto: 0 };
    L.fuentes = B.sirve;
    L.enBodega = B.sirve.reduce((s, f) => s + f.stock, 0);
    L.corto = B.corto;
    L.enProceso = ctx.enProceso.get(L.k) || 0;
    L.puede = Math.min(L.falta, L.enBodega);   // lo que se puede empacar ya
  }
  const ordP = c => { const i = _EMQ_PRENDA_ORD.indexOf(c); return i < 0 ? 99 : i; };
  return [...lineas.values()].sort((a, b) => (ordP(a.cod) - ordP(b.cod))
    || a.cod.localeCompare(b.cod) || a.t.localeCompare(b.t, 'es', { numeric: true }));
}

function emqSumar(lineas) {
  const s = { pedido: 0, entregado: 0, empacado: 0, falta: 0, puede: 0 };
  for (const L of lineas) for (const k in s) s[k] += L[k] || 0;
  return s;
}

// Fila de pedido a la que se cuelga el movimiento (la primera con saldo)
function emqFilaPrincipal(L) {
  return L.filas.find(f => (Number(f.cantidad_solicitada) || 0) > (Number(f.cantidad_entregada) || 0)) || L.filas[0];
}

// Claves de bodega de las que salen n piezas de la línea
function emqTomarDeBodega(L, n) {
  const out = [];
  let r = n;
  for (const f of L.fuentes) {
    if (r <= 0) break;
    const d = Math.min(r, f.stock);
    if (d > 0) { out.push({ f, d }); r -= d; }
  }
  return out;
}
function emqFuentesTxt(L, n) {
  const t = emqTomarDeBodega(L, n);
  if (!t.length || (t.length === 1 && t[0].f.talla_key === L.talla)) return '';
  return ' (de ' + t.map(x => x.f.talla_key + '×' + x.d).join(' + ') + ')';
}

// Reparte n piezas entregadas entre las filas del pedido de la línea:
// llena cada fila hasta lo solicitado, en orden; si sobra, va a la última.
function emqRepartirEntrega(filas, n) {
  const out = [];
  let resta = n;
  filas.forEach((f, i) => {
    if (resta <= 0) return;
    const ya = Number(f.cantidad_entregada) || 0;
    const cabe = i === filas.length - 1 ? resta
      : Math.max(0, Math.min(resta, (Number(f.cantidad_solicitada) || 0) - ya));
    if (cabe > 0) { out.push({ id: f.id, antes: ya, despues: ya + cabe }); resta -= cabe; }
  });
  return out;
}

// Después de empacar / entregar: refrescar el badge de escuelas esperando
// y los caches que leen escuela_acaparado / bodega (Inicio, Bodega).
function emqAvisarCambio() {
  try {
    if (typeof invalidarCache === 'function') { invalidarCache('bodega'); invalidarCache('pool'); }
    if (typeof refrescarBadgeEsperando === 'function') refrescarBadgeEsperando();
  } catch (e) { console.warn('[empaque] refrescar badges', e.message); }
}

// Suma lo entregado al pedido. Si una fila falla, deja las anteriores como estaban.
async function emqAplicarEntregado(patches) {
  const hechos = [];
  try {
    for (const p of patches) {
      await supaUpdate('pedido', p.id, { cantidad_entregada: p.despues, actualizado_en: new Date().toISOString() });
      hechos.push(p);
    }
  } catch (e) {
    for (const p of hechos.reverse()) {
      try { await supaUpdate('pedido', p.id, { cantidad_entregada: p.antes }); } catch (_) { /* best effort */ }
    }
    throw e;
  }
}

// ── Escrituras ───────────────────────────────────────────────────────

// Empacar por cantidad: items = Map(línea → n). Revalida contra datos
// frescos (todo o nada) y escribe como la 🔒 Reserva: SALIDA_EMPAQUE +
// escuela_acaparado, ahora con pedido_id en el movimiento.
async function emqCantEmpacar(escId, items) {
  const ctx = await emqCargarCant(escId);
  const lineas = emqLineasEscuela(ctx, escId);
  const plan = [], errores = [];
  for (const L of lineas) {
    const n = items.get(L.k) || 0;
    if (n <= 0) continue;
    if (n > L.falta) errores.push(`${L.prenda} ${L.talla}: querés ${n} pero faltan ${L.falta}`);
    else if (n > L.enBodega) errores.push(`${L.prenda} ${L.talla}: querés ${n} pero en bodega hay ${L.enBodega}`);
    else plan.push({ L, n, tomar: emqTomarDeBodega(L, n) });
  }
  if (errores.length) return { errores };
  if (!plan.length) return { errores: ['No hay nada para empacar.'] };

  const hoy = emqHoy();
  const movs = [];
  for (const p of plan) {
    const fila = emqFilaPrincipal(p.L);
    for (const t of p.tomar) {
      movs.push({
        tipo: 'SALIDA_EMPAQUE',
        cod_prenda: t.f.cod, nombre_prenda: t.f.nombre, talla_key: t.f.talla_key,
        cantidad: t.d, escuela_id: escId, pedido_id: fila.id, fecha: hoy,
        observaciones: `Empacado por pedido · ${p.L.talla}${t.f.talla_key !== p.L.talla ? ' (de ' + t.f.talla_key + ')' : ''}`,
      });
    }
  }
  // Un solo INSERT: o salen todas o ninguna
  const creados = await supaFetch('bodega_movimiento', 'POST', movs);
  const idDe = new Map((creados || []).map(m => [m.pedido_id + '|' + m.talla_key, m.id]));
  const acaps = movs.map(m => ({
    escuela_id: escId,
    cod_prenda: m.cod_prenda, nombre_prenda: m.nombre_prenda, talla_key: m.talla_key,
    cantidad_acaparada: m.cantidad, cantidad_consumida: 0,
    movimiento_bodega_id: idDe.get(m.pedido_id + '|' + m.talla_key) || null,
    observaciones: 'Empacado por pedido (sin nombres)',
  }));
  let acapCreados;
  try {
    if (acaps.some(a => !a.movimiento_bodega_id)) throw new Error('No volvió el id del movimiento de bodega');
    acapCreados = await supaFetch('escuela_acaparado', 'POST', acaps);
  } catch (e) {
    // Devolver a bodega lo que salió (mismo criterio que desempacar: ENTRADA_MANUAL)
    try {
      await supaFetch('bodega_movimiento', 'POST', movs.map(m => ({
        ...m, tipo: 'ENTRADA_MANUAL', observaciones: 'Anulado: no se pudo registrar el empaque',
      })));
    } catch (e2) { console.warn('[empaque] no se pudo devolver a bodega', e2.message); }
    throw new Error('No quedó empacado nada: ' + e.message);
  }
  const total = plan.reduce((s, p) => s + p.n, 0);
  emqAvisarCambio();
  return {
    errores: [], total,
    detalle: plan.map(p => `${p.L.talla}×${p.n}`).join(', '),
    acapIds: (acapCreados || []).map(a => a.id).filter(Boolean),
  };
}

// Entregar lo empacado: items = Map(línea → n). No toca bodega.
async function emqCantEntregar(escId, items, fecha, receptor, obs) {
  const ctx = await emqCargarCant(escId);   // fresco
  const lineas = emqLineasEscuela(ctx, escId);
  const plan = [];
  for (const L of lineas) {
    const n = items.get(L.k) || 0;
    if (n <= 0) continue;
    if (n > L.empacado) {
      throw new Error(`${L.prenda} ${L.talla}: querés entregar ${n} pero hay ${L.empacado} empacadas. Refrescá.`);
    }
    // Se consume lo empacado más viejo primero
    const consumos = {};
    let r = n;
    for (const a of L.acap) {
      if (r <= 0) break;
      const d = Math.min(r, a.resto);
      consumos[a.id] = d;
      r -= d;
    }
    plan.push({ L, n, consumos, patches: emqRepartirEntrega(L.filas, n) });
  }
  if (!plan.length) throw new Error('No hay nada para entregar.');
  const total = plan.reduce((s, p) => s + p.n, 0);
  const detalle = plan.map(p => `${p.L.talla}×${p.n}`).join(', ');

  // 1) Registro de la entrega (si falla acá, no se tocó nada)
  const reg = await supaFetch('entrega_escuela', 'POST', {
    escuela_id: escId, fecha, cantidad_piezas: total, receptor: receptor || null,
    observaciones: [obs, 'Por pedido: ' + detalle].filter(Boolean).join(' · '),
  });
  const regId = Array.isArray(reg) ? (reg[0] && reg[0].id) : (reg && reg.id);
  const borrarRegistro = async () => {
    if (regId) { try { await supaFetch('entrega_escuela', 'DELETE', null, `?id=eq.${regId}`); } catch (_) { /* best effort */ } }
  };
  // 2) Lo empacado pasa a entregado: una sola llamada (todo o nada)
  const consumos = {};
  for (const p of plan) Object.assign(consumos, p.consumos);
  try {
    await _consumePoolBatch(consumos);
  } catch (e) {
    await borrarRegistro();
    throw e;
  }
  // 3) Sumar al pedido; si falla, se deshace lo anterior
  try {
    await emqAplicarEntregado(plan.flatMap(p => p.patches));
  } catch (e) {
    const rev = {};
    for (const [id, d] of Object.entries(consumos)) rev[id] = -d;
    try { await _consumePoolBatch(rev); } catch (_) { /* best effort */ }
    await borrarRegistro();
    throw new Error('No se pudo sumar al pedido (no se entregó nada): ' + e.message);
  }
  emqAvisarCambio();
  return { total, detalle };
}

// Deshacer el último empaque por pedido: lo que siga empacado vuelve a bodega
async function emqCantDeshacer(u) {
  const ids = (u && u.acapIds) || [];
  if (!ids.length) return 0;
  const rows = await supaFetch('escuela_acaparado', 'GET', null,
    `?id=in.(${ids.join(',')})&select=id,escuela_id,cod_prenda,nombre_prenda,talla_key,cantidad_acaparada,cantidad_consumida,bodega_movimiento(pedido_id)`);
  let n = 0;
  for (const a of rows || []) {
    const consumida = Number(a.cantidad_consumida) || 0;
    const resto = (Number(a.cantidad_acaparada) || 0) - consumida;
    if (resto <= 0) continue;   // ya entregado: no se toca
    await supaUpdate('escuela_acaparado', a.id, { cantidad_acaparada: consumida, actualizado_en: new Date().toISOString() });
    try {
      await supaFetch('bodega_movimiento', 'POST', {
        tipo: 'ENTRADA_MANUAL', cod_prenda: a.cod_prenda, nombre_prenda: a.nombre_prenda,
        talla_key: a.talla_key, cantidad: resto, escuela_id: a.escuela_id,
        pedido_id: a.bodega_movimiento ? a.bodega_movimiento.pedido_id : null,
        fecha: emqHoy(), observaciones: 'Deshecho: empaque por pedido',
      });
    } catch (e) {
      try { await supaUpdate('escuela_acaparado', a.id, { cantidad_acaparada: consumida + resto }); } catch (_) { /* best effort */ }
      throw e;
    }
    n += resto;
  }
  if (n) emqAvisarCambio();
  return n;
}

// ── Cantidades con − / + ─────────────────────────────────────────────

function emqSelInit(grupo, pares, reset) {
  const prev = (!reset && emqState.sel[grupo]) || new Map();
  const sel = new Map(), max = new Map();
  for (const [k, tope] of pares) {
    max.set(k, tope);
    sel.set(k, prev.has(k) ? Math.max(0, Math.min(tope, prev.get(k))) : tope);
  }
  emqState.sel[grupo] = sel;
  emqState.selMax[grupo] = max;
}
function emqSelGet(grupo, k) { return (emqState.sel[grupo] && emqState.sel[grupo].get(k)) || 0; }
function emqSelTotal(grupo) {
  return emqState.sel[grupo] ? [...emqState.sel[grupo].values()].reduce((s, n) => s + n, 0) : 0;
}
function emqSelItems(grupo, soloK) {
  const out = new Map();
  for (const [k, n] of (emqState.sel[grupo] || new Map())) {
    if (n > 0 && (!soloK || k === soloK)) out.set(k, n);
  }
  return out;
}
function emqStepHtml(grupo, k) {
  const n = emqSelGet(grupo, k);
  const max = (emqState.selMax[grupo] && emqState.selMax[grupo].get(k)) || 0;
  const off = max <= 0 ? 'disabled' : '';
  return `<span style="display:inline-flex;align-items:center;gap:2px;white-space:nowrap">
    <button type="button" class="btn btn-ghost btn-sm" style="min-width:30px;padding:4px 6px" onclick="emqStep('${grupo}','${k}',-1)" ${off}>−</button>
    <input data-emq-step="${grupo}|${k}" type="number" inputmode="numeric" min="0" max="${max}" value="${n}" ${off}
      onchange="emqStepSet('${grupo}','${k}',this.value)" title="Máximo ${max}"
      style="width:54px;text-align:center;padding:4px 2px;font-weight:700">
    <button type="button" class="btn btn-ghost btn-sm" style="min-width:30px;padding:4px 6px" onclick="emqStep('${grupo}','${k}',1)" ${off}>+</button>
  </span>`;
}
function emqStep(grupo, k, d) { emqStepSet(grupo, k, emqSelGet(grupo, k) + d); }
function emqStepSet(grupo, k, v) {
  if (!emqState.sel[grupo]) return;
  const max = (emqState.selMax[grupo] && emqState.selMax[grupo].get(k)) || 0;
  let n = parseInt(v, 10);
  if (isNaN(n)) n = 0;
  n = Math.max(0, Math.min(max, n));
  emqState.sel[grupo].set(k, n);
  // la misma línea puede tener dos − / + (tabla ancha y fila de teléfono)
  document.querySelectorAll(`[data-emq-step="${grupo}|${k}"]`).forEach(inp => { inp.value = n; });
  const tot = emqSelTotal(grupo);
  document.querySelectorAll(`[data-emq-total="${grupo}"]`).forEach(el => { el.textContent = tot; });
  document.querySelectorAll(`[data-emq-btn="${grupo}"]`).forEach(b => { b.disabled = tot === 0; });
}

// ── Pantallas ────────────────────────────────────────────────────────

function emqNombreEscuela(escId) {
  const listas = [emqState.escuelas, emqState._resv && emqState._resv.escuelas,
    typeof entregaCache !== 'undefined' && entregaCache.escuelas,
    typeof salidaCache !== 'undefined' && salidaCache.escuelas];
  for (const l of listas) {
    const e = (l || []).find(x => x.id === escId);
    if (e) return e.alias || e.nombre || 'la escuela';
  }
  return 'la escuela';
}

function emqCardCantHtml(e) {
  const s = emqSumar(emqLineasEscuela(emqState.cant, e.id));
  if (s.falta === 0 && s.empacado === 0) return '';   // pedido completo y entregado
  const color = s.puede > 0 ? 'var(--verde)' : '#bbb';
  return `
    <div class="card" style="padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer" onclick="emqState.escuelaId='${e.id}';emqState.paso=2;renderEmpaque()">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700">📋 ${emqEsc(e.alias || e.nombre)}</div>
        <div style="font-size:12px;color:#666">Faltan ${s.falta} de ${s.pedido}${s.empacado ? ` · <span style="color:#a82">📦 ${s.empacado} empacadas sin entregar</span>` : ''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:700;color:${color}">${s.puede}</div>
        <div style="font-size:10px;color:#888">empacables ya</div>
      </div>
      <div style="font-size:18px;color:#bbb">›</div>
    </div>`;
}

// Tabla del pedido de la escuela (sesión y modal 🔒 Reservar)
function emqTablaCantHtml(lineas, grupo, origen) {
  if (!lineas.length) return '<div class="text-muted" style="padding:16px;text-align:center">Esta escuela no tiene pedido cargado.</div>';
  const th = 'padding:6px 4px;text-align:right;font-weight:600;white-space:nowrap';
  const td = 'padding:6px 4px;text-align:right;border-top:1px solid #F0F0F0';
  // En teléfono, el − / + y «Empacar» van en una fila propia debajo de cada talla
  // (si no, quedan escondidos a la derecha de la tabla).
  let html = `<style>.emq-tc .emq-acc2{display:none}@media (max-width:640px){.emq-tc .emq-acc1{display:none}.emq-tc .emq-acc2{display:table-row}}</style>
    <div style="overflow-x:auto"><table class="emq-tc" style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="background:#FAFAFA;color:#555">
      <th style="${th};text-align:left">Talla</th>
      <th style="${th}">Pedido</th>
      <th style="${th}" title="Empacado y apartado para la escuela, sin entregar">Empacado</th>
      <th style="${th}">Entregado</th>
      <th style="${th}">Falta</th>
      <th style="${th}" title="Libre en bodega que sirve para esta talla">En bodega</th>
      <th class="emq-acc1" style="${th};text-align:center">Empacar</th>
    </tr></thead><tbody>`;
  let prendaAct = null;
  for (const L of lineas) {
    if (L.prenda !== prendaAct) {
      prendaAct = L.prenda;
      html += `<tr><td colspan="7" style="background:#F5F7FA;padding:5px 6px;font-weight:700;border-top:1px solid var(--borde)">${emqEsc(L.prenda)}</td></tr>`;
    }
    const fuentes = L.fuentes.map(f => f.talla_key + '×' + f.stock).join(' · ');
    const accion = L.puede > 0
      ? `${emqStepHtml(grupo, L.k)} <button class="btn btn-success btn-sm" style="padding:5px 8px" onclick="emqCantEmpacarUI('${grupo}','${origen}','${L.k}')">Empacar</button>`
      : `<span style="font-size:11px;color:#999">${L.falta ? 'sin stock' : '✓ cubierto'}</span>`;
    html += `<tr>
      <td style="${td};text-align:left;font-family:monospace;font-weight:700">${emqEsc(L.talla)}${L.niveles.length > 1 ? `<div style="font-family:inherit;font-weight:400;font-size:10px;color:#999">${L.niveles.join(' + ')}</div>` : ''}</td>
      <td style="${td}">${L.pedido}</td>
      <td style="${td};color:${L.empacado ? '#a82' : '#bbb'};font-weight:${L.empacado ? 700 : 400}">${L.empacado}</td>
      <td style="${td};color:${L.entregado ? 'var(--verde)' : '#bbb'}">${L.entregado}</td>
      <td style="${td};font-weight:700;color:${L.falta ? 'var(--naranja)' : 'var(--verde)'}">${L.falta || '✓'}</td>
      <td style="${td}" title="${emqEsc(fuentes || 'Nada en bodega que sirva para esta talla')}">
        <strong style="color:${L.enBodega ? 'var(--azul)' : '#c44'}">${L.enBodega}</strong>
        ${L.corto ? `<div style="font-size:10px;color:#a60" title="Pantalones de bodega más cortos que el largo 2026: no se cuentan">+${L.corto} cortos</div>` : ''}
        ${L.enProceso ? `<div style="font-size:10px;color:#6a5" title="En producción (Prod → 📐 Plan), para todas las escuelas">🏭 ${L.enProceso}</div>` : ''}
      </td>
      <td class="emq-acc1" style="${td};text-align:center;white-space:nowrap">${accion}</td>
    </tr>
    <tr class="emq-acc2"><td colspan="6" style="padding:0 4px 8px;text-align:right;white-space:nowrap">${accion}</td></tr>`;
  }
  return html + '</tbody></table></div>';
}

function emqPaso2CantHtml() {
  const escId = emqState.escuelaId;
  const lineas = emqLineasEscuela(emqState.cant, escId);
  emqSelInit('emp', lineas.map(L => [L.k, L.puede]));
  const s = emqSumar(lineas);
  const tot = emqSelTotal('emp');
  return `
    <div class="card" style="padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="emqVolverEscuelas()">‹ Escuelas</button>
        <div style="flex:1;min-width:120px">
          <div style="font-weight:700">🧺 ${emqEsc(emqNombreEscuela(escId))}</div>
          <div style="font-size:11px;color:#666">📋 Por pedido (sin nombres) · pedido ${s.pedido} · empacado ${s.empacado} · entregado ${s.entregado} · faltan ${s.falta}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="initEmpaque(emqState.escuelaId)" title="Refrescar pedido y bodega">🔄</button>
      </div>
      ${s.empacado > 0 ? `<div style="margin-top:8px"><button class="btn btn-primary btn-sm" onclick="emqState.ultimoEmpaque=null;emqState.sel.ent=null;emqState.paso=3;renderEmpaque()">🚚 Entregar lo empacado (${s.empacado})</button></div>` : ''}
      <div style="font-size:11px;color:#888;margin-top:6px">Empacar = sale de bodega y queda apartado para esta escuela. Ajustá la cantidad con − / + o escribila.</div>
    </div>
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:74px">${emqTablaCantHtml(lineas, 'emp', 'sesion')}</div>
    <div style="position:fixed;bottom:calc(66px + env(safe-area-inset-bottom));left:0;right:0;z-index:900;display:flex;justify-content:center;pointer-events:none">
      <div style="pointer-events:auto;background:white;border:1px solid var(--borde);border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.2);padding:8px 12px;display:flex;gap:8px;align-items:center;margin:0 12px">
        <div style="font-size:13px"><strong data-emq-total="emp">${tot}</strong> pieza(s)</div>
        <button id="emq-btn-empacar" data-emq-btn="emp" class="btn btn-success" ${tot === 0 ? 'disabled' : ''} onclick="emqCantEmpacarUI('emp','sesion')">📦 Empacar todo lo que alcance</button>
      </div>
    </div>`;
}

// Lista de lo empacado con − / + (paso 3 y Bodega → 🚚 Marcar entrega)
function emqListaEntregaHtml(lineas, grupo) {
  return lineas.map(L => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid #E6EFE6">
      <div style="flex:1;min-width:0;font-size:13px">
        ${emqEsc(L.prenda)} <span style="font-family:monospace;font-weight:700">${emqEsc(L.talla)}</span>
        <div style="font-size:11px;color:#666">empacadas ${L.empacado} · pedido ${L.pedido} · entregado ${L.entregado}</div>
      </div>
      ${emqStepHtml(grupo, L.k)}
    </div>`).join('') +
    `<div style="text-align:right;font-size:12px;margin-top:4px">A entregar: <strong data-emq-total="${grupo}">${emqSelTotal(grupo)}</strong> pieza(s)</div>`;
}

function emqPaso3CantHtml() {
  const escId = emqState.escuelaId;
  const nombre = emqEsc(emqNombreEscuela(escId));
  const u = emqState.ultimoEmpaque;
  const lineas = emqLineasEscuela(emqState.cant, escId).filter(L => L.empacado > 0);
  emqSelInit('ent', lineas.map(L => [L.k, L.empacado]));
  const tot = emqSelTotal('ent');
  return `
    <div class="card" id="emq-exito-panel" style="padding:20px;max-width:520px;margin:20px auto">
      ${u ? `
        <div style="text-align:center">
          <div style="font-size:40px">✅</div>
          <div style="font-weight:700;font-size:16px;margin:6px 0">Empaque registrado</div>
          <div style="font-size:13px;color:#666">${nombre} · ${emqEsc(u.resumen)}</div>
          <div id="emq-undo-status" style="font-size:12px;color:#888;margin-top:4px"></div>
        </div>` : `<div style="font-weight:700;font-size:16px">🚚 Entrega · ${nombre}</div>`}
      <div style="margin-top:16px;padding:12px;background:#F5F9F5;border:1px solid #CDE5CD;border-radius:8px">
        <div style="font-weight:700;font-size:13px;margin-bottom:6px">🚚 ¿Entregar a la escuela ahora?</div>
        ${lineas.length ? `
          ${emqListaEntregaHtml(lineas, 'ent')}
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;margin-top:8px">
            <div class="field" style="margin:0">
              <label>Fecha</label>
              <input type="date" id="emq-ent-fecha" value="${emqHoy()}" style="width:150px">
            </div>
            <div class="field" style="margin:0;flex:1;min-width:140px">
              <label>Recibió (opcional)</label>
              <input type="text" id="emq-ent-receptor" placeholder="Nombre de quien recibe">
            </div>
            <button id="emq-btn-entregar" data-emq-btn="ent" class="btn btn-primary btn-sm" ${tot === 0 ? 'disabled' : ''} onclick="emqCantEntregarSesion()">🚚 Entregar lo empacado</button>
          </div>` : '<div class="text-muted" style="font-size:12px">No hay piezas empacadas de esta escuela.</div>'}
        <div style="font-size:11px;color:#888;margin-top:6px">Se suma a lo entregado del pedido y queda el registro con fecha y quién recibió. Bodega no cambia: ya salió al empacar.</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
        <button class="btn btn-ghost" onclick="emqState.paso=2;renderEmpaque()">📋 Seguir en esta escuela</button>
        <button class="btn btn-ghost" onclick="emqVolverEscuelas();renderEmpaque()">🧺 Otra escuela</button>
        ${u ? '<button class="btn btn-ghost" style="color:var(--rojo)" onclick="emqDeshacer()">↩️ Deshacer este empaque</button>' : ''}
      </div>
    </div>`;
}

// ── Acciones de pantalla ─────────────────────────────────────────────

// origen 'sesion' (paso 2) o 'modal' (🔒 Reservar). soloK = una línea.
async function emqCantEmpacarUI(grupo, origen, soloK) {
  if (_emqOcupado) return;
  const enModal = origen === 'modal';
  const escId = enModal ? (emqState._resv && emqState._resv.escuelaId) : emqState.escuelaId;
  const ctx = enModal ? (emqState._resv && emqState._resv.datosCant) : emqState.cant;
  if (!escId || !ctx) return;
  const items = emqSelItems(grupo, soloK);
  if (!items.size) { alert('Poné cuántas empacar (con − / +).'); return; }
  const lineas = emqLineasEscuela(ctx, escId).filter(L => items.has(L.k));
  const total = [...items.values()].reduce((s, n) => s + n, 0);
  const lista = lineas.map(L => `· ${L.prenda} ${L.talla} × ${items.get(L.k)}${emqFuentesTxt(L, items.get(L.k))}`);
  if (!confirm(`¿Empacar ${total} pieza(s) para ${emqNombreEscuela(escId)}?\n\n${lista.join('\n')}\n\nSale de bodega ahora. La entrega se marca después con 🚚.`)) return;

  _emqOcupado = true;
  const btn = enModal ? null : document.getElementById('emq-btn-empacar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Empacando…'; }
  const refrescar = async () => {
    if (enModal) {
      await emqAbrirReserva(escId);
      if (emqState.cargado && document.getElementById('view-empaque')?.classList.contains('active')) await initEmpaque(emqState.escuelaId || escId);
      if (document.getElementById('view-bodega')?.classList.contains('active') && typeof cargarBodegaStock === 'function') cargarBodegaStock();
    } else {
      await initEmpaque(escId);
    }
  };
  try {
    const r = await emqCantEmpacar(escId, items);
    if (r.errores.length) {
      alert('No se empacó NADA:\n\n' + r.errores.join('\n') + '\n\nCambió el stock o el pedido. Se refresca la lista.');
      await refrescar();
      return;
    }
    const u = { cant: true, acapIds: r.acapIds, resumen: `${r.total} pieza(s) · ${r.detalle}` };
    if (enModal) {
      alert(`✓ ${r.total} pieza(s) empacadas para ${emqNombreEscuela(escId)}: ${r.detalle}.\nSe entregan con 🚚 Marcar entrega.`);
      await refrescar();
    } else {
      emqState.sel.emp = null;   // las cantidades vuelven a lo que alcance
      emqState.sel.ent = null;   // y lo a entregar, a todo lo empacado
      await initEmpaque(escId);
      emqState.ultimoEmpaque = u;
      emqState.paso = 3;
      renderEmpaque();
    }
  } catch (e) {
    alert('Error al empacar: ' + e.message);
    try { await refrescar(); } catch (_) { /* nada */ }
  } finally {
    _emqOcupado = false;
  }
}

// Confirma y entrega (sesión y Bodega). Devuelve true si quedó registrada.
async function emqCantConfirmarYEntregar(escId, items, fecha, receptor, obs, ctx) {
  if (_emqOcupado) return false;
  const lineas = emqLineasEscuela(ctx, escId).filter(L => (items.get(L.k) || 0) > 0);
  const total = lineas.reduce((s, L) => s + items.get(L.k), 0);
  if (!total) { alert('Poné cuántas entregar.'); return false; }
  const lista = lineas.map(L => `· ${L.prenda} ${L.talla} × ${items.get(L.k)}`).join('\n');
  if (!confirm(`¿Entregar ${total} pieza(s) a ${emqNombreEscuela(escId)} el ${fecha}?\n\n${lista}\n\nSe suma a lo entregado del pedido. Bodega no cambia (ya salió al empacar).`)) return false;
  _emqOcupado = true;
  try {
    const r = await emqCantEntregar(escId, items, fecha, receptor, obs);
    alert(`✓ Entrega registrada: ${r.total} pieza(s) el ${fecha}${receptor ? ' · recibió ' + receptor : ''}.`);
    return true;
  } catch (e) {
    alert('No se registró la entrega: ' + e.message);
    return false;
  } finally {
    _emqOcupado = false;
  }
}

async function emqCantEntregarSesion() {
  const escId = emqState.escuelaId;
  const fecha = document.getElementById('emq-ent-fecha')?.value;
  const receptor = (document.getElementById('emq-ent-receptor')?.value || '').trim() || null;
  if (!fecha) { alert('Elegí la fecha'); return; }
  const btn = document.getElementById('emq-btn-entregar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Registrando…'; }
  const ok = await emqCantConfirmarYEntregar(escId, emqSelItems('ent'), fecha, receptor, 'Registrada desde sesión de empaque', emqState.cant);
  if (ok) {
    emqState.ultimoEmpaque = null;   // ya entregado: el deshacer no aplica
    emqState.sel.ent = null;
    await initEmpaque(escId);        // vuelve al paso 2 con lo entregado al día
  } else if (btn) {
    btn.disabled = false; btn.textContent = '🚚 Entregar lo empacado';
  }
}

async function emqCantDeshacerUI() {
  const u = emqState.ultimoEmpaque;
  if (!u || !u.cant || _emqOcupado) return;
  if (!confirm('¿Deshacer este empaque? Lo que siga empacado vuelve a bodega.')) return;
  _emqOcupado = true;
  const st = document.getElementById('emq-undo-status');
  if (st) st.textContent = '↩️ Deshaciendo…';
  try {
    const n = await emqCantDeshacer(u);
    emqState.ultimoEmpaque = null;
    alert(`✓ Deshecho: ${n} pieza(s) volvieron a bodega.`);
  } catch (e) {
    alert('No se pudo deshacer todo: ' + e.message + '\n\nRevisá Bodega → Movimientos.');
  } finally {
    _emqOcupado = false;
  }
  await initEmpaque(emqState.escuelaId);
}

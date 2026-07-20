// ══════════════════════════════════════════════════════════════════════
// SESIÓN DE EMPAQUE (beta) — flujo unificado en 3 pasos:
//   1. Elegir escuela (con cuántas piezas se pueden empacar YA)
//   2. Lista tap-para-empacar (verde=lista, gris=sin stock con motivo,
//      ✓=ya empacada). "Marcar todos" + parejas automáticas + talla alterna.
//   3. Confirmar → motor empacarAlumnosDesdeRegistro (pool primero, stock
//      después) → panel de éxito con DESHACER (desempacarPieza en lote).
// El usuario nunca decide entre pool y stock: el motor lo resuelve solo.
// Convive con los flujos viejos hasta validar (Fase 1 del rediseño).
// ══════════════════════════════════════════════════════════════════════

let emqState = {
  paso: 1,
  escuelaId: null,
  escuelas: [],
  alumnos: [],          // todos los activos (objetos completos)
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
    const [escuelas, alumnos, stock, pool] = await Promise.all([
      supaFetchAll('escuela', '?activa=eq.true&select=id,alias,nombre&order=alias'),
      supaFetchAll('alumno',
        '?activo=eq.true&select=id,nombre,grado,sexo,escuela_id,prenda_top,talla_top_key,estado_top,prenda_bottom,talla_bottom_key,estado_bottom&order=nombre&limit=10000'),
      supaFetchAll('vw_bodega_stock', '?select=nombre_prenda,cod_prenda,talla_key,stock_actual'),
      supaFetchAll('escuela_acaparado', '?select=escuela_id,nombre_prenda,talla_key,cantidad_acaparada,cantidad_consumida'),
    ]);
    emqState.escuelas = escuelas;
    emqState.alumnos = alumnos;
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
  document.getElementById('emq-alt-sub').textContent = lista.length
    ? `Para ${a.nombre}. Elegí una talla alterna disponible:`
    : `No hay NINGUNA talla de ${prenda} disponible (ni reservada ni en stock). Esta pieza queda pendiente.`;
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
    emqState.ultimoEmpaque = {
      piezas,
      resumen: `${piezas.length} pieza(s) · ${r.piezasPool} de reserva · ${r.piezasStock} de stock`,
    };
    // Refrescar la foto local sin perder la escuela
    const escId = emqState.escuelaId;
    await initEmpaque(escId);
    emqState.paso = 3;
    renderEmpaque();
  } catch (e) {
    alert('Error al empacar: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '📦 Empacar'; }
  }
}

async function emqDeshacer() {
  const u = emqState.ultimoEmpaque;
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
async function emqAbrirReserva() {
  const escId = emqState.escuelaId;
  const cont = document.getElementById('emq-reserva-contenido');
  const modal = document.getElementById('emq-reserva-modal');
  if (!cont || !modal) return;
  cont.innerHTML = '<div class="text-muted" style="padding:16px;text-align:center">Cruzando necesidad vs bodega…</div>';
  modal.style.display = 'flex';

  // Datos frescos SIEMPRE (mismo estándar que empacar)
  let stockFresco, poolFresco;
  try {
    const [stock, pool] = await Promise.all([
      supaFetchAll('vw_bodega_stock', '?select=nombre_prenda,cod_prenda,talla_key,stock_actual'),
      supaFetchAll('escuela_acaparado', '?select=escuela_id,nombre_prenda,talla_key,cantidad_acaparada,cantidad_consumida'),
    ]);
    stockFresco = new Map();
    for (const s of stock) {
      const p = s.nombre_prenda || (typeof prendaCanon === 'function' ? prendaCanon(s.cod_prenda) : s.cod_prenda);
      if (p && s.talla_key) stockFresco.set(p + '|' + s.talla_key, Number(s.stock_actual) || 0);
    }
    poolFresco = new Map();
    for (const p of pool) {
      if (p.escuela_id !== escId) continue;
      const d = Math.max(0, (Number(p.cantidad_acaparada) || 0) - (Number(p.cantidad_consumida) || 0));
      if (d > 0) {
        const k = p.nombre_prenda + '|' + p.talla_key;
        poolFresco.set(k, (poolFresco.get(k) || 0) + d);
      }
    }
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error">No se pudo leer bodega: ${e.message}</div>`;
    return;
  }

  // Necesidad de la escuela por prenda|talla (tallas PEDIDAS, piezas pendientes)
  const necesidad = new Map();
  for (const a of emqState.alumnos) {
    if (a.escuela_id !== escId) continue;
    for (const pieza of ['top', 'bottom']) {
      if (!emqPend(a, pieza)) continue;
      const k = emqPrenda(a, pieza) + '|' + (pieza === 'top' ? a.talla_top_key : a.talla_bottom_key);
      necesidad.set(k, (necesidad.get(k) || 0) + 1);
    }
  }

  const filas = [...necesidad.entries()]
    .map(([k, pend]) => {
      const [prenda, talla] = k.split('|');
      const reservado = poolFresco.get(k) || 0;
      const stockLibre = stockFresco.get(k) || 0;
      const falta = Math.max(0, pend - reservado);
      const sugerido = Math.min(falta, stockLibre);
      return { k, prenda, talla, pend, reservado, stockLibre, falta, sugerido };
    })
    .sort((a, b) => a.prenda.localeCompare(b.prenda) || a.talla.localeCompare(b.talla, 'es', { numeric: true }));

  emqState._reservaFilas = filas;
  const conAlgo = filas.filter(f => f.falta > 0);
  const totSugerido = filas.reduce((s, f) => s + f.sugerido, 0);

  cont.innerHTML = `
    <div class="text-muted mb8" style="font-size:12px">
      Lo que esta escuela todavía necesita, cruzado con bodega. La cantidad viene
      pre-llenada con lo que falta (nunca más de lo que hay en stock). Ajustá y confirmá.
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:420px">
        <thead><tr style="background:#F5F7FA">
          <th style="padding:5px 8px;text-align:left">Prenda</th>
          <th style="padding:5px 8px;text-align:left">Talla</th>
          <th style="padding:5px 8px;text-align:right" title="Piezas pendientes de esta escuela con esa talla">Pend.</th>
          <th style="padding:5px 8px;text-align:right" title="Ya reservado para esta escuela">🔒 Ya</th>
          <th style="padding:5px 8px;text-align:right" title="Stock libre en bodega ahora">📦 Libre</th>
          <th style="padding:5px 8px;text-align:right">Reservar</th>
        </tr></thead>
        <tbody>
          ${filas.map((f, i) => `
            <tr style="border-top:1px solid #EEE;${f.falta === 0 ? 'opacity:.5' : ''}">
              <td style="padding:5px 8px;font-weight:600">${f.prenda}</td>
              <td style="padding:5px 8px;font-family:monospace;font-weight:600">${f.talla}</td>
              <td style="padding:5px 8px;text-align:right">${f.pend}</td>
              <td style="padding:5px 8px;text-align:right;color:#a82">${f.reservado || '·'}</td>
              <td style="padding:5px 8px;text-align:right;color:${f.stockLibre > 0 ? 'var(--azul)' : '#c44'}">${f.stockLibre}</td>
              <td style="padding:5px 8px;text-align:right">
                <input type="number" id="emq-res-${i}" min="0" max="${f.stockLibre}" value="${f.sugerido}"
                  inputmode="numeric" style="width:64px;text-align:right;padding:4px 6px" ${f.stockLibre === 0 ? 'disabled' : ''}>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${conAlgo.length === 0 ? '<div class="alert alert-info" style="margin-top:8px">🎉 Todo lo pendiente ya está cubierto por reservas (o no hay pendientes).</div>' : ''}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="emqCerrarReserva()">Cancelar</button>
      <button class="btn btn-success btn-sm" onclick="emqConfirmarReserva()" ${totSugerido === 0 && conAlgo.length === 0 ? '' : ''}>🔒 Reservar</button>
    </div>`;
}

function emqCerrarReserva() {
  document.getElementById('emq-reserva-modal').style.display = 'none';
  emqState._reservaFilas = null;
}

async function emqConfirmarReserva() {
  const escId = emqState.escuelaId;
  const filas = emqState._reservaFilas || [];
  const pedidos = [];
  for (let i = 0; i < filas.length; i++) {
    const inp = document.getElementById('emq-res-' + i);
    const n = inp ? parseInt(inp.value, 10) || 0 : 0;
    if (n > 0) pedidos.push({ ...filas[i], n });
  }
  if (pedidos.length === 0) { alert('Poné cantidad en al menos una talla.'); return; }

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
    await emqAbrirReserva();
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
    await initEmpaque(escId);
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
    const empacados = await supaFetch('alumno', 'GET', null,
      `?escuela_id=eq.${escId}&or=(estado_top.eq.empacado,estado_bottom.eq.empacado)&select=id,estado_top,estado_bottom&limit=10000`);
    let n = 0;
    for (const a of empacados) {
      if (a.estado_top === 'empacado') n++;
      if (a.estado_bottom === 'empacado') n++;
    }
    if (n === 0) { alert('No hay piezas empacadas pendientes de entrega.'); return; }
    if (!confirm(`Se van a marcar como ENTREGADAS ${n} pieza(s) empacadas de esta escuela (todas, no solo las de esta sesión). ¿Confirmar?`)) return;

    const nowIso = new Date().toISOString();
    await _bulkPatchAlumno(`?escuela_id=eq.${escId}&estado_top=eq.empacado`,
      { estado_top: 'entregado', actualizado_en: nowIso });
    await _bulkPatchAlumno(`?escuela_id=eq.${escId}&estado_bottom=eq.empacado`,
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
  if (emqState.paso === 3) { root.innerHTML = emqPaso3Html(); return; }
  root.innerHTML = emqPaso2Html();
}

function emqPaso1Html() {
  const cards = emqState.escuelas.map(e => {
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
      <div style="font-size:12px;color:#666;margin-top:2px">Elegí la escuela. "Empacables ya" = piezas pendientes que se pueden empacar con lo que hay ahora (reservas de la escuela + stock libre).</div>
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
    return `<button style="${base}background:#F5F5F5;color:#999;border-color:#DDD;border-style:dashed"
      onclick="emqToggle('${a.id}','${pieza}')" title="Sin stock de ${cod(prenda)}${talla} — tocá para elegir talla alterna">⚠ ${talla}</button>`;
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
        <button class="btn btn-warning btn-sm" onclick="emqAbrirReserva()"
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

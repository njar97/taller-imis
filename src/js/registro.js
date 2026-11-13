// ══════════════════════════════════════════════════════════════════════
// REGISTRO (v23) - reemplaza "Pedidos"
// Módulo central: alumnos, tallaje, empaque, por talla
// ══════════════════════════════════════════════════════════════════════

let registroCache = {
  temporadas: [],
  escuelas: [],
  temporadaActual: null,
  escuelaActual: null,
  vistaDetalle: 'tallaje', // tallaje | alumnos | por_talla | empaque
  pedidosPorEscuela: {},
  alumnos: [],
  stockPorTalla: {},
  gradosConocidos: [],
  // Tallaje actual
  tallajeEscuelaId: null,
  tallajeGrado: null,
};

// Mantener variable "pedidosCache" para compatibilidad con código viejo
let pedidosCache = registroCache; // alias

// Temporadas para el selector (vista chica; cache corto para no pedirla dos
// veces cuando Registro, la lista de alumnos y el buscador arrancan juntos).
async function temporadasRegistro() {
  const temps = await cachedFetch('registro-temporadas',
    () => supaFetch('vw_temporada_resumen', 'GET', null, '?order=anio.desc&limit=20'),
    { ttl: 60_000, group: 'temporada' });
  registroCache.temporadas = temps || [];
  return registroCache.temporadas;
}

// Temporada con la que trabaja Registro: la que se eligió en esta sesión o,
// si no, la ACTIVA. La usan también la lista de alumnos y el buscador.
async function asegurarTemporadaRegistro() {
  if (!registroCache.temporadas || registroCache.temporadas.length === 0) await temporadasRegistro();
  const temps = registroCache.temporadas || [];
  if (!temps.some(t => t.id === registroCache.temporadaActual)) {
    const activa = temps.find(t => t.estado === 'activa') || temps[0];
    registroCache.temporadaActual = activa ? activa.id : null;
  }
  return registroCache.temporadaActual;
}

function temporadaRegistro() {
  return (registroCache.temporadas || []).find(t => t.id === registroCache.temporadaActual) || null;
}

// 2026 en adelante: pedido por cantidades, sin lista de alumnos. Mismo
// criterio que Inicio (dashboard.js): la temporada tiene filas de pedido.
function registroEnModoPedido(t) {
  const temp = t === undefined ? temporadaRegistro() : t;
  return !!temp && Number(temp.num_pedidos) > 0;
}

async function initRegistro() {
  try {
    const [temps, grados] = await Promise.all([
      temporadasRegistro(),
      supaFetch('vw_grados_conocidos', 'GET', null, '?limit=200').catch(() => [])
    ]);
    registroCache.gradosConocidos = grados;
    await asegurarTemporadaRegistro();
    renderRegistroHeader();
    await mostrarRegistroTemporada();
  } catch(e) {
    const cont = document.getElementById('alumnos-global-contenido');
    if (cont) {
      cont.style.display = '';
      cont.innerHTML = `<div class="alert alert-error">Error: ${rcEsc(e.message)}</div>`;
    }
  }
}

// Pinta la temporada elegida: por pedido (2026) o con su lista de alumnos (2025).
async function mostrarRegistroTemporada() {
  const t = temporadaRegistro();
  const porPedido = registroEnModoPedido(t);
  // Elegir 2025 acá vuelve a mostrar en toda la app lo de temporadas con alumnos
  if (typeof tiFijarTemporada === 'function') {
    const temps = registroCache.temporadas || [];
    tiFijarTemporada(temps.find(x => x.estado === 'activa') || temps[0] || null, t);
  }
  const cant = document.getElementById('registro-cant-contenido');
  const alumnos = document.getElementById('alumnos-global-contenido');
  if (cant) cant.style.display = porPedido ? '' : 'none';
  if (alumnos) alumnos.style.display = porPedido ? 'none' : '';
  if (porPedido) {
    await initRegistroCantidad(t.id);
  } else {
    // Atajos del buscador que solo sirven en la vista por pedido
    window._regHintEspecial = window._regHintVista = null;
    if (window._regHintEscuela && typeof alumnosGlobalCache !== 'undefined') {
      alumnosGlobalCache.filtroEscuelas = [window._regHintEscuela];
    }
    window._regHintEscuela = null;
    if (typeof initAlumnosGlobal === 'function') initAlumnosGlobal();
  }
}

// switchSubRegistro: stub para compat con código que aún llama. Ya no hay sub-tabs.
function switchSubRegistro(_sub) {
  if (typeof initAlumnosGlobal === 'function') initAlumnosGlobal();
}

// alias para compat
const initPedidos = initRegistro;

function renderRegistroHeader() {
  const cont = document.getElementById('registro-header');
  if (!cont) return;
  const temps = registroCache.temporadas || [];
  if (temps.length === 0) {
    cont.innerHTML = '<div class="text-muted">Sin temporadas.</div>';
    return;
  }
  cont.innerHTML = `
    <div class="rc-temporadas">
      <span class="rc-temporadas-lbl">📅 Temporada</span>
      ${temps.map(t => `
        <button class="btn btn-sm ${t.id === registroCache.temporadaActual ? 'btn-primary' : 'btn-ghost'}"
          onclick="cambiarTemporadaRegistro('${t.id}')">${rcEsc(t.codigo || t.anio)}${t.estado === 'activa' ? ' · activa' : ''}</button>`).join('')}
    </div>`;
}

async function cambiarTemporadaRegistro(tempId) {
  if (tempId === registroCache.temporadaActual) return;
  registroCache.temporadaActual = tempId;
  if (typeof alumnosGlobalCache !== 'undefined') {
    alumnosGlobalCache.filtroEscuelas = [];
    alumnosGlobalCache.filtroEscuela = '';
    alumnosGlobalCache.filtroTalla = '';
    alumnosGlobalCache.pagina = 1;
  }
  renderRegistroHeader();
  await mostrarRegistroTemporada();
}
const cambiarTemporada = cambiarTemporadaRegistro; // alias

async function cargarEscuelasTemporada() {
  const cont = document.getElementById('registro-lista');
  cont.innerHTML = '<div class="text-muted">Cargando escuelas...</div>';
  try {
    // Obtener escuelas con pedidos O con alumnos en esta temporada
    const [conPedidos, todasEscuelas] = await Promise.all([
      supaFetch('vw_pedido_escuela', 'GET', null, 
        `?temporada_id=eq.${registroCache.temporadaActual}&order=piezas_solicitadas.desc&limit=200`).catch(() => []),
      supaFetch('escuela', 'GET', null, '?activa=eq.true&order=nombre&limit=500').catch(() => [])
    ]);
    
    // Contar alumnos por escuela en esta temporada
    const alumnosCount = await supaFetchAll('alumno',
      `?temporada_id=eq.${registroCache.temporadaActual}&activo=eq.true&select=escuela_id`).catch(() => []);
    const alumnosPorEscuela = {};
    for (const a of alumnosCount) {
      alumnosPorEscuela[a.escuela_id] = (alumnosPorEscuela[a.escuela_id] || 0) + 1;
    }
    
    // Enriquecer
    const escuelasMap = {};
    for (const e of todasEscuelas) {
      escuelasMap[e.id] = {
        escuela_id: e.id,
        escuela_nombre: e.nombre,
        codigo_cde: e.codigo_cde,
        grupo_produccion: e.grupo_produccion,
        piezas_solicitadas: 0,
        piezas_entregadas: 0,
        piezas_pendientes: 0,
        porcentaje_avance: 0,
        lineas_pedido: 0,
        num_alumnos: alumnosPorEscuela[e.id] || 0,
      };
    }
    for (const p of conPedidos) {
      if (escuelasMap[p.escuela_id]) {
        Object.assign(escuelasMap[p.escuela_id], {
          piezas_solicitadas: p.piezas_solicitadas,
          piezas_entregadas: p.piezas_entregadas,
          piezas_pendientes: p.piezas_pendientes,
          porcentaje_avance: p.porcentaje_avance,
          lineas_pedido: p.lineas_pedido,
        });
      }
    }
    
    // Solo escuelas que tienen pedidos O alumnos en esta temporada
    registroCache.escuelas = Object.values(escuelasMap).filter(e => 
      e.piezas_solicitadas > 0 || e.num_alumnos > 0
    );
  } catch(e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

// El grupo de producción de una escuela se edita ahora dentro del modal
// unificado "Editar escuela" (sección 👥 Grupo). El botón 📦 llama a
// editarEscuela() directamente — ya no hay modal de grupo aparte.

// Clic en una escuela = ir al sub-tab Alumnos con el filtro de escuela aplicado.
// Reemplaza el modal de detalle (que duplicaba la edición de alumnos).
// Las funciones avanzadas (Por talla, Empaque, Pedidos) siguen accesibles
// con el botón ⚙️ que mantiene abrirDetalleEscuelaRegistro.
function verAlumnosDeEscuela(escuelaId) {
  if (typeof alumnosGlobalCache !== 'undefined') {
    alumnosGlobalCache.filtroEscuela = escuelaId;
    alumnosGlobalCache.filtroEstado = '';
    alumnosGlobalCache.busqueda = '';
  }
  switchSubRegistro('alumnos');
}

// ─── Detalle de escuela con 4 sub-tabs ──────────────────────────────
async function abrirDetalleEscuelaRegistro(escuelaId) {
  const modal = document.getElementById('registro-detalle-modal');
  if (!modal) return;
  
  const esc = registroCache.escuelas.find(e => e.escuela_id === escuelaId);
  if (!esc) return;
  
  registroCache.escuelaActual = escuelaId;

  document.getElementById('registro-detalle-titulo').textContent = esc.escuela_nombre;
  const grupo = esc.grupo_produccion ? ` · Grupo ${esc.grupo_produccion}` : '';
  document.getElementById('registro-detalle-subt').textContent =
    `CDE ${esc.codigo_cde}${grupo} · ${esc.num_alumnos||0} alumnos · 📏 Captura de tallaje`;

  // Integración v33: este modal quedó SOLO como captura de tallaje.
  // Las otras sub-vistas eran duplicados: Alumnos → lista global filtrada,
  // Por talla → Estadística, Empaque → Sesión de empaque.
  document.getElementById('registro-detalle-subtabs').innerHTML = '';

  modal.style.display = 'flex';
  renderTallajeInicial(escuelaId);
}
// alias
const abrirDetalleEscuela = abrirDetalleEscuelaRegistro;

function cerrarDetalleEscuela() {
  document.getElementById('registro-detalle-modal').style.display = 'none';
}

// ─── Nueva escuela ad-hoc ───────────────────────────────────────────
function abrirNuevaEscuela() {
  const modal = document.getElementById('registro-escuela-modal');
  if (!modal) return;
  ['nesc-nombre','nesc-codigo','nesc-director','nesc-telefono','nesc-grupo'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  modal.style.display = 'flex';
}

function cerrarNuevaEscuela() {
  const modal = document.getElementById('registro-escuela-modal');
  if (modal) modal.style.display = 'none';
}

async function guardarNuevaEscuela() {
  const v = validateForm({
    'nesc-nombre': { required: true, label: 'Nombre' },
  });
  if (!v.valid) {
    showToast(v.firstError, 'error');
    const el = document.getElementById(v.firstInvalidId);
    if (el) el.focus();
    return;
  }
  const nombre = document.getElementById('nesc-nombre').value.trim();
  const codigo = document.getElementById('nesc-codigo').value.trim() || ('ADHOC-' + Date.now().toString(36));
  const director = document.getElementById('nesc-director').value.trim() || null;
  const telefono = document.getElementById('nesc-telefono').value.trim() || null;
  const grupo = document.getElementById('nesc-grupo').value.trim() || null;
  
  try {
    await supaFetch('escuela', 'POST', {
      codigo_cde: codigo, nombre, director, telefono,
      grupo_produccion: grupo, activa: true,
    });
    alert('Escuela agregada. Podés cargar alumnos desde el Tallaje.');
    cerrarNuevaEscuela();
    await cargarEscuelasTemporada();
  } catch(e) { alert('Error: ' + e.message); }
}

// Toggle panel "Todos los alumnos" (v28)
function toggleAlumnosGlobal() {
  const panel = document.getElementById('alumnos-global-panel');
  const txt = document.getElementById('alumnos-global-toggle-txt');
  if (!panel) return;
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    if (txt) txt.textContent = 'Ocultar ▲';
    if (!alumnosGlobalCache.cargado) initAlumnosGlobal();
  } else {
    panel.style.display = 'none';
    if (txt) txt.textContent = 'Mostrar ▼';
  }
}

// ══════════════════════════════════════════════════════════════════════
// BÚSQUEDA GLOBAL EN EL HEADER
// Input en el nav que matchea contra alumnos (nombre) y escuelas
// (nombre/alias/CDE). Click en resultado lleva al destino correspondiente.
// ══════════════════════════════════════════════════════════════════════

let buscadorCache = { alumnos: null, escuelas: null, debounce: null };

// ── Índice de herramientas ───────────────────────────────────────────
// Además de alumnos/escuelas, Ctrl+K encuentra las funciones de la app.
// `kw` = palabras con las que el usuario podría buscarla. `ir()` navega
// (no ejecuta acciones destructivas — solo lleva al lugar).
const HERRAMIENTAS = [
  { icono:'⚡', nombre:'Grilla del padrón (edición tipo Excel)', kw:'grilla excel editar tallas rapido masivo pegar columnas',
    ir: () => { if (typeof alumnosGlobalCache !== 'undefined') alumnosGlobalCache.vistaGrilla = true; _herrTab('registro'); } },
  { icono:'👤', nombre:'Alumnos / tallaje (Registro)', kw:'alumnos registro tallar tallas padron capturar lista',
    ir: () => _herrTab('registro') },
  { icono:'🏷', nombre:'Etiquetas de alumnos (PDF)', kw:'etiquetas imprimir pdf pegatinas',
    ir: () => _herrTab('registro') },
  { icono:'📥', nombre:'Importar alumnos (pegar lista)', kw:'importar pegar lista excel subir alumnos nuevos',
    ir: () => _herrTab('registro') },
  { icono:'📊', nombre:'Resumen por talla (demanda vs corte/prod/bodega)', kw:'resumen talla demanda faltantes criticas balance existencia',
    ir: () => { _herrTab('estadistica'); _herrLuego(() => switchSubEst('tallas')); } },
  { icono:'📋', nombre:'Reporte por escuela (tallaje + contrato + tela)', kw:'escuela contrato avance tela yardas yardaje devolver',
    ir: () => { _herrTab('estadistica'); _herrLuego(() => switchSubEst('escuela')); } },
  { icono:'🔮', nombre:'Pronóstico de tallas', kw:'pronostico distribucion historica proxima temporada proyeccion',
    ir: () => { _herrTab('estadistica'); _herrLuego(() => switchSubEst('pronostico')); } },
  { icono:'📦', nombre:'Stock de bodega / entradas y salidas', kw:'bodega stock inventario entrada salida movimientos kardex',
    ir: () => _herrTab('bodega') },
  { icono:'📄', nombre:'Hoja de entrega para director (PDF)', kw:'hoja entrega director firma pdf recibido',
    ir: () => _herrConfig('Hoja de entrega') },
  { icono:'💰', nombre:'Costos de mano de obra', kw:'costos mano obra precios monto dinero',
    ir: () => _herrConfig('Costos') },
  { icono:'📜', nombre:'Histórico de temporadas', kw:'historico temporadas anteriores archivo años',
    ir: () => _herrConfig('Histórico') },
  { icono:'🗂', nombre:'Reportes administrativos / exportar', kw:'reportes exportar excel csv descargar datos',
    ir: () => _herrConfig('Reportes') },
  { icono:'🎓', nombre:'Catálogo de grados (nivel/ciclo)', kw:'grados nivel ciclo catalogo parvularia basica bachillerato',
    ir: () => { _herrTab('config'); _herrLuego(() => { if (typeof abrirCatalogoGrados === 'function') abrirCatalogoGrados(); }); } },
  { icono:'🏫', nombre:'Grupos de escuelas', kw:'grupos escuelas produccion lpt agrupar',
    ir: () => _herrConfig('Grupos de escuelas') },
  { icono:'👥', nombre:'Usuarios e invitaciones', kw:'usuarios invitar acceso operario admin permisos',
    ir: () => _herrConfig('Usuarios') },
  { icono:'🔄', nombre:'Buscar actualizaciones de la app', kw:'actualizar version nueva pwa update refrescar',
    ir: () => _herrConfig('App (PWA)') },
  { icono:'🧩', nombre:'Módulos avanzados (mostrar/ocultar Corte y Producción)', kw:'modulos avanzados ocultar mostrar menu corte produccion activar',
    ir: () => _herrConfig('App (PWA)') },
  { icono:'🕵️', nombre:'Auditoría de cambios', kw:'auditoria cambios quien hizo log historial modificaciones',
    ir: () => _herrTab('auditoria') },
  { icono:'✂️', nombre:'Corte: trazos, tendidos y bultos (módulo avanzado)', kw:'corte trazo tendido bulto lienzos capas rollos',
    ir: () => _herrTab('corte') },
  { icono:'🏭', nombre:'Producción: captura y operarias (módulo avanzado)', kw:'produccion operarias captura operaciones destajo asignaciones',
    ir: () => _herrTab('produccion') },
];

function _herrTab(tab) {
  const btn = Array.from(document.querySelectorAll('.nav-tab'))
    .find(t => (t.getAttribute('onclick') || '').includes(`switchTab('${tab}'`));
  if (typeof switchTab === 'function') switchTab(tab, btn || null);
}
function _herrLuego(fn) { setTimeout(() => { try { fn(); } catch (_) {} }, 250); }

// Navega a Config y resalta la card cuyo título contiene el texto
function _herrConfig(titulo) {
  _herrTab('config');
  _herrLuego(() => {
    const el = Array.from(document.querySelectorAll('#view-config .card-title, #view-config summary'))
      .find(x => (x.textContent || '').includes(titulo));
    if (!el) return;
    // Config tiene sub-grupos (Reportes/Catálogos/Usuarios/Sistema):
    // activar el grupo donde vive la card antes de scrollear.
    const grupo = el.closest('[id^="cfg-sub-"]');
    if (grupo && typeof switchSubConfig === 'function') {
      switchSubConfig(grupo.id.replace('cfg-sub-', ''));
    }
    const card = el.closest('.card') || el.closest('details') || el;
    if (card.style && card.style.display === 'none') card.style.display = '';
    if (card.tagName === 'DETAILS') card.open = true;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.style.outline = '3px solid var(--azul)';
    setTimeout(() => { card.style.outline = ''; }, 2000);
  });
}

function buscarHerramientas(q) {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  return HERRAMIENTAS.filter(h => {
    const txt = (h.nombre + ' ' + h.kw).toLowerCase();
    return tokens.every(t => txt.includes(t));
  }).slice(0, 6);
}

async function buscadorOnInput(ev) {
  const inp = ev?.target || document.getElementById('buscador-input');
  if (!inp) return;
  const q = inp.value.trim();
  clearTimeout(buscadorCache.debounce);
  if (q.length < 2) {
    const r = document.getElementById('buscador-results');
    if (r) r.style.display = 'none';
    return;
  }
  buscadorCache.debounce = setTimeout(() => buscadorRun(q), 200);
}

async function buscadorRun(q) {
  try {
    if (!buscadorCache.alumnos || !buscadorCache.escuelas) {
      // Reusar lo que ya tenga la app cargado si está disponible
      if (typeof alumnosGlobalCache !== 'undefined'
          && alumnosGlobalCache.cargado && alumnosGlobalCache.alumnos?.length > 0) {
        buscadorCache.alumnos = alumnosGlobalCache.alumnos.map(a => ({
          id: a.id, nombre: a.nombre, grado: a.grado, escuela_id: a.escuela_id,
        }));
        buscadorCache.escuelas = Object.values(alumnosGlobalCache.escuelas || {});
      } else {
        const [als, escs] = await Promise.all([
          supaFetchAll('alumno', '?activo=eq.true&select=id,nombre,grado,escuela_id&limit=10000'),
          supaFetchAll('escuela', '?activa=eq.true&select=id,nombre,alias,codigo_cde&order=alias'),
        ]);
        buscadorCache.alumnos = als;
        buscadorCache.escuelas = escs;
      }
    }
  } catch(e) {
    // Sin datos no hay alumnos/escuelas, pero las herramientas (estáticas)
    // se pueden buscar igual — no abortar.
    console.warn('Buscador init:', e.message);
  }

  const lq = q.toLowerCase();
  const escs = (buscadorCache.escuelas || [])
    .filter(e =>
      (e.nombre || '').toLowerCase().includes(lq) ||
      (e.alias || '').toLowerCase().includes(lq) ||
      (e.codigo_cde || '').toLowerCase().includes(lq))
    .slice(0, 8);
  const escMap = {};
  for (const e of (buscadorCache.escuelas || [])) escMap[e.id] = e;
  const als = (buscadorCache.alumnos || [])
    .filter(a => (a.nombre || '').toLowerCase().includes(lq))
    .slice(0, 20);

  const herr = buscarHerramientas(q);

  const cont = document.getElementById('buscador-results');
  if (!cont) return;
  if (escs.length === 0 && als.length === 0 && herr.length === 0) {
    cont.innerHTML = '<div style="padding:12px;color:#888;font-size:12px">Sin resultados para "'+_buscEsc(q)+'"</div>';
    cont.style.display = 'block';
    return;
  }
  let html = '';
  if (herr.length > 0) {
    html += '<div class="search-section">🧭 Herramientas</div>';
    for (const h of herr) {
      const idx = HERRAMIENTAS.indexOf(h);
      html += `<div class="search-result" onclick="buscadorIrHerramienta(${idx})">
        ${h.icono} <strong>${_buscEsc(h.nombre)}</strong>
      </div>`;
    }
  }
  if (escs.length > 0) {
    html += '<div class="search-section">Escuelas</div>';
    for (const e of escs) {
      html += `<div class="search-result" onclick="buscadorIrEscuela('${e.id}')">
        🏫 <strong>${_buscEsc(e.alias || e.nombre || '')}</strong>
        <span style="color:#888;font-size:11px;margin-left:4px">CDE ${_buscEsc(e.codigo_cde || '?')}</span>
      </div>`;
    }
  }
  if (als.length > 0) {
    html += '<div class="search-section">Alumnos (' + als.length + ')</div>';
    for (const a of als) {
      const e = escMap[a.escuela_id];
      const escLbl = e ? (e.alias || e.nombre || '') : '';
      html += `<div class="search-result" onclick="buscadorIrAlumno('${a.id}')">
        👤 <strong>${_buscEsc(a.nombre || '')}</strong>
        <span style="color:#888;font-size:11px;margin-left:4px">${_buscEsc(a.grado || '')} · ${_buscEsc(escLbl)}</span>
      </div>`;
    }
  }
  cont.innerHTML = html;
  cont.style.display = 'block';
}

function buscadorIrHerramienta(idx) {
  const h = HERRAMIENTAS[idx];
  buscadorCerrar();
  if (h) { try { h.ir(); } catch (e) { console.warn('[buscador] herramienta:', e); } }
}

function buscadorIrEscuela(escId) {
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
  buscadorCerrar();
}

function buscadorIrAlumno(id) {
  if (typeof switchTab === 'function') switchTab('registro');
  setTimeout(() => {
    if (typeof editarAlumnoRapido === 'function') editarAlumnoRapido(id);
  }, 200);
  buscadorCerrar();
}

function buscadorCerrar() {
  const inp = document.getElementById('buscador-input');
  const cont = document.getElementById('buscador-results');
  if (inp) inp.value = '';
  if (cont) cont.style.display = 'none';
}

function _buscEsc(s) {
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Cerrar al click fuera del wrap
document.addEventListener('click', (ev) => {
  const wrap = document.getElementById('buscador-wrap');
  if (!wrap) return;
  if (!wrap.contains(ev.target)) {
    const r = document.getElementById('buscador-results');
    if (r) r.style.display = 'none';
  }
});

// Escape cierra los resultados sin borrar input
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    const r = document.getElementById('buscador-results');
    if (r && r.style.display !== 'none') r.style.display = 'none';
  }
});

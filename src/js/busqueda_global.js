// ══════════════════════════════════════════════════════════════════════
// BÚSQUEDA GLOBAL EN EL HEADER
// Input en el nav que matchea contra alumnos (nombre) y escuelas
// (nombre/alias/CDE). Click en resultado lleva al destino correspondiente.
// ══════════════════════════════════════════════════════════════════════

let buscadorCache = { alumnos: null, escuelas: null, debounce: null };

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
    console.warn('Buscador init:', e.message);
    return;
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

  const cont = document.getElementById('buscador-results');
  if (!cont) return;
  if (escs.length === 0 && als.length === 0) {
    cont.innerHTML = '<div style="padding:12px;color:#888;font-size:12px">Sin resultados para "'+_buscEsc(q)+'"</div>';
    cont.style.display = 'block';
    return;
  }
  let html = '';
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

// ══════════════════════════════════════════════════════════════════════
// RESUMEN POR ESCUELA — portado del sheet "RESUMEN" del BASE 2025
// V1: selector de escuela + tabla conteo alumnos tallados por nivel × sexo
// ══════════════════════════════════════════════════════════════════════

const RESUMEN_NIVELES = [
  { key:'PARV',    label:'Parvularia',   match:(a)=> a.nivel === 'PARV' },
  { key:'1CICLO',  label:'1er Ciclo',    match:(a)=> a.nivel === 'BASICA' && a.ciclo === 1 },
  { key:'2CICLO',  label:'2do Ciclo',    match:(a)=> a.nivel === 'BASICA' && a.ciclo === 2 },
  { key:'3CICLO',  label:'3er Ciclo',    match:(a)=> a.nivel === 'BASICA' && a.ciclo === 3 },
  { key:'BACH',    label:'Bachillerato', match:(a)=> a.nivel === 'BACH' },
];

let resumenEscuelaCache = {
  escuelas: null,
  escuelaSel: null,
  alumnos: null,
  temporadaId: null,
};

async function initResumenEscuela() {
  const cont = document.getElementById('resumen-esc-contenido');
  if (!cont) return;
  cont.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando escuelas...</div>';

  try {
    if (!resumenEscuelaCache.temporadaId) {
      const temps = await supaFetch('temporada', 'GET', null,
        '?estado=eq.activa&select=id,anio,nombre&limit=1');
      const t = temps[0] || (await supaFetch('temporada', 'GET', null,
        '?select=id,anio,nombre&order=anio.desc&limit=1'))[0];
      if (!t) throw new Error('No hay temporada cargada');
      resumenEscuelaCache.temporadaId = t.id;
      resumenEscuelaCache.temporadaNombre = t.nombre || t.anio;
    }
    if (!resumenEscuelaCache.escuelas) {
      const all = await supaFetchAll('escuela',
        '?activa=eq.true&select=id,codigo_cde,nombre,alias,director,distrito,municipio&order=alias.asc');
      resumenEscuelaCache.escuelas = all;
    }
    renderResumenEscuela();
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function renderResumenEscuela() {
  const cont = document.getElementById('resumen-esc-contenido');
  if (!cont) return;
  const escuelas = resumenEscuelaCache.escuelas || [];

  cont.innerHTML = `
    <div class="card" style="padding:12px;margin-bottom:10px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label style="font-weight:600">Escuela:</label>
        <select id="resumen-esc-sel" onchange="onResumenEscuelaSel(this.value)" style="flex:1;min-width:200px;padding:6px">
          <option value="">— Seleccioná una escuela —</option>
          ${escuelas.map(e => `<option value="${e.id}" ${resumenEscuelaCache.escuelaSel === e.id ? 'selected' : ''}>${e.alias || e.nombre}${e.codigo_cde ? ' · ' + e.codigo_cde : ''}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="resumen-esc-detalle">
      <div class="text-muted" style="padding:20px;text-align:center">Elegí una escuela para ver su distribución.</div>
    </div>
  `;

  if (resumenEscuelaCache.escuelaSel) cargarResumenEscuela(resumenEscuelaCache.escuelaSel);
}

async function onResumenEscuelaSel(escuelaId) {
  resumenEscuelaCache.escuelaSel = escuelaId || null;
  resumenEscuelaCache.alumnos = null;
  if (!escuelaId) {
    const det = document.getElementById('resumen-esc-detalle');
    if (det) det.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Elegí una escuela para ver su distribución.</div>';
    return;
  }
  await cargarResumenEscuela(escuelaId);
}

async function cargarResumenEscuela(escuelaId) {
  const det = document.getElementById('resumen-esc-detalle');
  if (!det) return;
  det.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando alumnos...</div>';

  try {
    const tempId = resumenEscuelaCache.temporadaId;
    const params = `?escuela_id=eq.${escuelaId}&temporada_id=eq.${tempId}&activo=eq.true` +
      '&select=nivel,ciclo,sexo,prenda_top,prenda_bottom,grado';
    const alumnos = await supaFetchAll('alumno', params);
    resumenEscuelaCache.alumnos = alumnos;
    renderResumenEscuelaDetalle();
  } catch (e) {
    det.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function renderResumenEscuelaDetalle() {
  const det = document.getElementById('resumen-esc-detalle');
  if (!det) return;

  const escuelas = resumenEscuelaCache.escuelas || [];
  const esc = escuelas.find(e => e.id === resumenEscuelaCache.escuelaSel);
  const alumnos = resumenEscuelaCache.alumnos || [];

  // Agrupar por nivel y por sexo. Tallado = ambos prenda_top y prenda_bottom no nulos.
  // (Excluimos alumnos sin sexo en las columnas M/F pero los contamos en total general.)
  const stats = RESUMEN_NIVELES.map(n => {
    const enNivel = alumnos.filter(n.match);
    const acc = (sexo) => {
      const grupo = enNivel.filter(a => a.sexo === sexo);
      const tallados = grupo.filter(a => a.prenda_top && a.prenda_bottom).length;
      return { total: grupo.length, tallados };
    };
    return { ...n, M: acc('M'), F: acc('F'), totalNivel: enNivel.length };
  });

  const tot = {
    M: { total:0, tallados:0 },
    F: { total:0, tallados:0 },
    cargados: alumnos.length,
    tallados: alumnos.filter(a => a.prenda_top && a.prenda_bottom).length,
  };
  stats.forEach(s => {
    tot.M.total += s.M.total; tot.M.tallados += s.M.tallados;
    tot.F.total += s.F.total; tot.F.tallados += s.F.tallados;
  });

  const pct = (n,d) => d > 0 ? Math.round((n/d)*100) : 0;

  det.innerHTML = `
    <!-- Cabecera escuela -->
    <div class="card" style="padding:14px;margin-bottom:10px;background:linear-gradient(135deg,#0065CC,#004999);color:white">
      <div style="font-size:11px;opacity:0.8">${(resumenEscuelaCache.temporadaNombre || '').toUpperCase()} · ESCUELA</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px">${esc?.nombre || esc?.alias || '—'}</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:12px;opacity:0.95">
        ${esc?.codigo_cde ? `<div>CDE <strong>${esc.codigo_cde}</strong></div>` : ''}
        ${esc?.alias ? `<div>Alias <strong>${esc.alias}</strong></div>` : ''}
        ${esc?.director ? `<div>Director: ${esc.director}</div>` : ''}
        ${esc?.municipio ? `<div>${esc.municipio}${esc.distrito ? ' / '+esc.distrito : ''}</div>` : ''}
      </div>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:10px">
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Cargados</div>
        <div style="font-size:22px;font-weight:700;color:#333">${tot.cargados.toLocaleString()}</div>
      </div>
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Tallados</div>
        <div style="font-size:22px;font-weight:700;color:var(--verde)">${tot.tallados.toLocaleString()}</div>
        <div style="font-size:10px;color:#888">${pct(tot.tallados, tot.cargados)}%</div>
      </div>
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Masculino</div>
        <div style="font-size:22px;font-weight:700;color:var(--azul)">${tot.M.tallados.toLocaleString()}</div>
        <div style="font-size:10px;color:#888">de ${tot.M.total}</div>
      </div>
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Femenino</div>
        <div style="font-size:22px;font-weight:700;color:#c2185b">${tot.F.tallados.toLocaleString()}</div>
        <div style="font-size:10px;color:#888">de ${tot.F.total}</div>
      </div>
    </div>

    <!-- Tabla por nivel × sexo -->
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">
      <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">📊 Tallados por nivel × sexo</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:520px">
          <thead>
            <tr style="background:#FAFAFA">
              <th style="padding:8px;text-align:left">Nivel</th>
              <th style="padding:8px;text-align:right">M tallado</th>
              <th style="padding:8px;text-align:right">M total</th>
              <th style="padding:8px;text-align:right">F tallado</th>
              <th style="padding:8px;text-align:right">F total</th>
              <th style="padding:8px;text-align:right">Total tallado</th>
              <th style="padding:8px;text-align:right">% avance</th>
            </tr>
          </thead>
          <tbody>
            ${stats.map(s => {
              const totalNivelTallado = s.M.tallados + s.F.tallados;
              const totalNivel = s.M.total + s.F.total;
              return `
                <tr style="border-top:1px solid #EEE">
                  <td style="padding:6px 8px;font-weight:600">${s.label}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--azul);font-weight:600">${s.M.tallados}</td>
                  <td style="padding:6px 8px;text-align:right;color:#888">${s.M.total}</td>
                  <td style="padding:6px 8px;text-align:right;color:#c2185b;font-weight:600">${s.F.tallados}</td>
                  <td style="padding:6px 8px;text-align:right;color:#888">${s.F.total}</td>
                  <td style="padding:6px 8px;text-align:right;font-weight:700">${totalNivelTallado}</td>
                  <td style="padding:6px 8px;text-align:right">${pct(totalNivelTallado, totalNivel)}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid #CCC;background:#FAFAFA;font-weight:700">
              <td style="padding:8px">TOTAL</td>
              <td style="padding:8px;text-align:right;color:var(--azul)">${tot.M.tallados}</td>
              <td style="padding:8px;text-align:right">${tot.M.total}</td>
              <td style="padding:8px;text-align:right;color:#c2185b">${tot.F.tallados}</td>
              <td style="padding:8px;text-align:right">${tot.F.total}</td>
              <td style="padding:8px;text-align:right">${tot.tallados}</td>
              <td style="padding:8px;text-align:right">${pct(tot.tallados, tot.cargados)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div style="text-align:center;margin-top:6px">
      <button class="btn btn-ghost btn-sm" onclick="cargarResumenEscuela('${resumenEscuelaCache.escuelaSel}')">🔄 Refrescar</button>
    </div>
  `;
}

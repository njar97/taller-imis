// ══════════════════════════════════════════════════════════════════════
// COSTOS — mano de obra por escuela y nivel (portado del RESUMEN del Excel)
// Tabla por nivel × sexo (M/F), aplica precio_top y precio_bottom según nivel,
// suma costo total por escuela.
// ══════════════════════════════════════════════════════════════════════

// Precios base extraídos del RESUMEN del Excel.
// Cada nivel: precio top × cantidad tallada + precio bottom × cantidad tallada.
// (Si el user los quiere ajustar, viven acá hasta que migremos a tabla.)
const COSTOS_PRECIOS = {
  PARV:    { top: 5.10, bottom: 4.80 },
  BASICA:  { top: 5.40, bottom: 7.20 },
  BACH:    { top: 5.39, bottom: 7.20 },
};

const COSTOS_NIVELES = [
  { key:'PARV',    label:'Parvularia',   match:(a)=> a.nivel === 'PARV',                     precio:'PARV'   },
  { key:'1CICLO',  label:'1er Ciclo',    match:(a)=> a.nivel === 'BASICA' && a.ciclo === 1,  precio:'BASICA' },
  { key:'2CICLO',  label:'2do Ciclo',    match:(a)=> a.nivel === 'BASICA' && a.ciclo === 2,  precio:'BASICA' },
  { key:'3CICLO',  label:'3er Ciclo',    match:(a)=> a.nivel === 'BASICA' && a.ciclo === 3,  precio:'BASICA' },
  { key:'BACH',    label:'Bachillerato', match:(a)=> a.nivel === 'BACH',                     precio:'BACH'   },
];

let costosCache = {
  temporadaId: null,
  escuelas: null,
  alumnos: null,
  escuelaSel: '',
};

async function initCostos() {
  const root = document.getElementById('est-sub-costos-view');
  if (!root) return;
  root.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando costos...</div>';

  try {
    if (!costosCache.temporadaId) {
      const t = (await supaFetch('temporada', 'GET', null,
        '?estado=eq.activa&select=id,anio,nombre&order=anio.desc&limit=1'))[0]
        || (await supaFetch('temporada', 'GET', null,
        '?select=id,anio,nombre&order=anio.desc&limit=1'))[0];
      if (!t) throw new Error('No hay temporada cargada');
      costosCache.temporadaId = t.id;
    }
    if (!costosCache.escuelas) {
      costosCache.escuelas = await supaFetchAll('escuela',
        '?activa=eq.true&select=id,alias,codigo_cde,nombre&order=alias.asc');
    }
    if (!costosCache.alumnos) {
      costosCache.alumnos = await supaFetchAll('alumno',
        `?temporada_id=eq.${costosCache.temporadaId}&activo=eq.true` +
        '&select=escuela_id,nivel,ciclo,sexo,prenda_top,prenda_bottom');
    }
    renderCostos();
  } catch (e) {
    root.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function onCostosEscuelaSel(val) {
  costosCache.escuelaSel = val || '';
  renderCostos();
}

function renderCostos() {
  const root = document.getElementById('est-sub-costos-view');
  if (!root) return;
  const escuelas = costosCache.escuelas || [];
  const todos = costosCache.alumnos || [];
  const alumnos = costosCache.escuelaSel
    ? todos.filter(a => a.escuela_id === costosCache.escuelaSel)
    : todos;

  // Por nivel: M y F, tallado_top y tallado_bottom, costo
  let granTop = 0, granBot = 0, granCosto = 0;
  let granTopP = 0, granBotP = 0;
  const stats = COSTOS_NIVELES.map(n => {
    const enNivel = alumnos.filter(n.match);
    const p = COSTOS_PRECIOS[n.precio];
    const acc = (sexo) => {
      const grupo = enNivel.filter(a => a.sexo === sexo);
      const top = grupo.filter(a => a.prenda_top).length;
      const bot = grupo.filter(a => a.prenda_bottom).length;
      const costo = top * p.top + bot * p.bottom;
      return { total: grupo.length, top, bot, costo };
    };
    const m = acc('M');
    const f = acc('F');
    const subTop = m.top + f.top;
    const subBot = m.bot + f.bot;
    const subCosto = m.costo + f.costo;
    granTop += subTop; granBot += subBot; granCosto += subCosto;
    granTopP += m.top + f.top; granBotP += m.bot + f.bot;
    return { ...n, precio: p, M: m, F: f, total: subTop + subBot, costo: subCosto };
  });

  const escSel = escuelas.find(e => e.id === costosCache.escuelaSel);
  const fmtUSD = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  root.innerHTML = `
    <!-- Selector escuela -->
    <div class="card" style="padding:10px;margin-bottom:10px">
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end">
        <div class="field" style="margin:0">
          <label>Escuela (vacío = todas)</label>
          <select onchange="onCostosEscuelaSel(this.value)">
            <option value="">Todas las escuelas</option>
            ${escuelas.map(e => `<option value="${e.id}" ${costosCache.escuelaSel === e.id ? 'selected' : ''}>${e.alias || e.nombre}${e.codigo_cde ? ' · '+e.codigo_cde : ''}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="initCostos()">🔄 Refrescar</button>
      </div>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:10px">
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Tops tallados</div>
        <div style="font-size:22px;font-weight:700;color:var(--azul)">${granTop.toLocaleString()}</div>
      </div>
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Bottoms tallados</div>
        <div style="font-size:22px;font-weight:700;color:#c2185b">${granBot.toLocaleString()}</div>
      </div>
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Costo total (mano de obra)</div>
        <div style="font-size:22px;font-weight:700;color:var(--verde)">${fmtUSD(granCosto)}</div>
      </div>
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Escuelas</div>
        <div style="font-size:22px;font-weight:700;color:#333">${costosCache.escuelaSel ? 1 : escuelas.length}</div>
      </div>
    </div>

    <!-- Aviso precios -->
    <div class="alert alert-info" style="font-size:11px;margin-bottom:10px">
      <strong>Precios actuales:</strong>
      PARV ${fmtUSD(COSTOS_PRECIOS.PARV.top)}/${fmtUSD(COSTOS_PRECIOS.PARV.bottom)} ·
      BASICA ${fmtUSD(COSTOS_PRECIOS.BASICA.top)}/${fmtUSD(COSTOS_PRECIOS.BASICA.bottom)} ·
      BACH ${fmtUSD(COSTOS_PRECIOS.BACH.top)}/${fmtUSD(COSTOS_PRECIOS.BACH.bottom)}.
      Tomados del RESUMEN del Excel. Si necesitás cambiarlos, los editamos en el código (después podemos llevarlos a tabla en DB).
    </div>

    <!-- Tabla por nivel -->
    <div class="card" style="padding:0;overflow:hidden">
      <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">
        💰 Costo por nivel ${escSel ? '· '+(escSel.alias || escSel.nombre) : '(todas las escuelas)'}
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px">
          <thead>
            <tr style="background:#FAFAFA">
              <th style="padding:8px;text-align:left">Nivel</th>
              <th style="padding:8px;text-align:right">Top $</th>
              <th style="padding:8px;text-align:right">Bot $</th>
              <th style="padding:8px;text-align:right">M tops</th>
              <th style="padding:8px;text-align:right">F tops</th>
              <th style="padding:8px;text-align:right">M bot</th>
              <th style="padding:8px;text-align:right">F bot</th>
              <th style="padding:8px;text-align:right">Costo</th>
            </tr>
          </thead>
          <tbody>
            ${stats.map(s => `
              <tr style="border-top:1px solid #EEE">
                <td style="padding:6px 8px;font-weight:600">${s.label}</td>
                <td style="padding:6px 8px;text-align:right;color:#888">${fmtUSD(s.precio.top)}</td>
                <td style="padding:6px 8px;text-align:right;color:#888">${fmtUSD(s.precio.bottom)}</td>
                <td style="padding:6px 8px;text-align:right;color:var(--azul)">${s.M.top}</td>
                <td style="padding:6px 8px;text-align:right;color:#c2185b">${s.F.top}</td>
                <td style="padding:6px 8px;text-align:right;color:var(--azul)">${s.M.bot}</td>
                <td style="padding:6px 8px;text-align:right;color:#c2185b">${s.F.bot}</td>
                <td style="padding:6px 8px;text-align:right;font-weight:700;color:var(--verde)">${fmtUSD(s.costo)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid #CCC;background:#FAFAFA;font-weight:700">
              <td style="padding:8px" colspan="3">TOTAL</td>
              <td style="padding:8px;text-align:right">${stats.reduce((s,n)=>s+n.M.top,0)}</td>
              <td style="padding:8px;text-align:right">${stats.reduce((s,n)=>s+n.F.top,0)}</td>
              <td style="padding:8px;text-align:right">${stats.reduce((s,n)=>s+n.M.bot,0)}</td>
              <td style="padding:8px;text-align:right">${stats.reduce((s,n)=>s+n.F.bot,0)}</td>
              <td style="padding:8px;text-align:right;color:var(--verde)">${fmtUSD(granCosto)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════════
// ESTADÍSTICA — POR ESCUELA (unificado v32)
// Fusiona en un solo reporte (con selector de escuela compartido):
//   1. Tallaje  — alumnos tallados por nivel × sexo + % avance
//   2. Contrato — piezas y monto contratado vs entregado (vw_contrato_avance)
//   3. Tela     — yardaje necesario vs recibido + balance devolver/solicitar
// Reemplaza a los antiguos resumen_escuela.js, contratos.js y yardaje.js.
// ══════════════════════════════════════════════════════════════════════

const ESCN_NIVELES = [
  { key:'PARV',    label:'Parvularia',   match:(a)=> a.nivel === 'PARV' },
  { key:'1CICLO',  label:'1er Ciclo',    match:(a)=> a.nivel === 'BASICA' && a.ciclo === 1 },
  { key:'2CICLO',  label:'2do Ciclo',    match:(a)=> a.nivel === 'BASICA' && a.ciclo === 2 },
  { key:'3CICLO',  label:'3er Ciclo',    match:(a)=> a.nivel === 'BASICA' && a.ciclo === 3 },
  { key:'BACH',    label:'Bachillerato', match:(a)=> a.nivel === 'BACH' },
];

// Factores yardas/alumno (RESUMEN del Excel). Top = celeste/blanca, Bot = azul/beige.
const ESCN_FACTORES = {
  PARV:    { celeste: { M: 0.75, F: 0.75 }, azul:   { M: 0.75, F: 0.60 } },
  '1CICLO':{ blanca:  { M: 1.00, F: 1.00 }, azul:   { M: 1.00, F: 0.75 } },
  '2CICLO':{ blanca:  { M: 1.25, F: 1.25 }, azul:   { M: 1.25, F: 1.00 } },
  '3CICLO':{ blanca:  { M: 1.50, F: 1.50 }, azul:   { M: 1.50, F: 1.25 } },
  BACH:    { blanca:  { M: 1.50, F: 1.50 }, beige:  { M: 1.65, F: 1.50 } },
};
const ESCN_COLORES = {
  celeste: { label:'Tela Celeste', border:'#6AA5C8' },
  blanca:  { label:'Tela Blanca',  border:'#BBB' },
  azul:    { label:'Tela Azul',    border:'#1F4E79' },
  beige:   { label:'Tela Beige',   border:'#B0A07A' },
};

let estEscuelaCache = {
  temporadaId: null,
  temporadaAnio: null,
  temporadaNombre: '',
  escuelas: null,
  alumnos: null,
  tela: null,      // contrato_escuela: [{escuela_id, tela_*_yd}]
  avance: null,    // vw_contrato_avance: [{codigo_cde, alias, piezas_*, monto_*, porcentaje_avance}]
  escuelaSel: '',
};

async function initEstEscuela() {
  const root = document.getElementById('est-sub-escuela-view');
  if (!root) return;
  root.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando reporte por escuela...</div>';

  try {
    if (!estEscuelaCache.temporadaId) {
      const t = (await supaFetch('temporada', 'GET', null,
        '?estado=eq.activa&select=id,anio,nombre&order=anio.desc&limit=1'))[0]
        || (await supaFetch('temporada', 'GET', null, '?select=id,anio,nombre&order=anio.desc&limit=1'))[0];
      if (!t) throw new Error('No hay temporada cargada');
      estEscuelaCache.temporadaId = t.id;
      estEscuelaCache.temporadaAnio = t.anio;
      estEscuelaCache.temporadaNombre = t.nombre || String(t.anio);
    }
    const [escuelas, alumnos, tela, avance] = await Promise.all([
      estEscuelaCache.escuelas || supaFetchAll('escuela',
        '?activa=eq.true&select=id,alias,codigo_cde,nombre,director,distrito,municipio&order=alias.asc'),
      estEscuelaCache.alumnos || supaFetchAll('alumno',
        `?temporada_id=eq.${estEscuelaCache.temporadaId}&activo=eq.true&select=escuela_id,nivel,ciclo,sexo,prenda_top,prenda_bottom&limit=10000`),
      estEscuelaCache.tela || supaFetchAll('contrato_escuela',
        `?anio=eq.${estEscuelaCache.temporadaAnio}&select=escuela_id,tela_celeste_yd,tela_blanca_yd,tela_azul_yd,tela_beige_yd`),
      estEscuelaCache.avance || supaFetchAll('vw_contrato_avance',
        `?anio=eq.${estEscuelaCache.temporadaAnio}&order=monto_contratado.desc`),
    ]);
    estEscuelaCache.escuelas = escuelas;
    estEscuelaCache.alumnos = alumnos;
    estEscuelaCache.tela = tela;
    estEscuelaCache.avance = avance;
    renderEstEscuela();
  } catch (e) {
    root.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function onEstEscuelaSel(val) {
  estEscuelaCache.escuelaSel = val || '';
  renderEstEscuela();
}
function refrescarEstEscuela() {
  estEscuelaCache.escuelas = null;
  estEscuelaCache.alumnos = null;
  estEscuelaCache.tela = null;
  estEscuelaCache.avance = null;
  initEstEscuela();
}

function renderEstEscuela() {
  const root = document.getElementById('est-sub-escuela-view');
  if (!root) return;
  const c = estEscuelaCache;
  const escuelas = c.escuelas || [];
  const esc = escuelas.find(e => e.id === c.escuelaSel) || null;
  const alumnos = (c.alumnos || []).filter(a => !c.escuelaSel || a.escuela_id === c.escuelaSel);

  const fmtN = (n) => Number(n||0).toLocaleString();
  const fmtUSD = (n) => '$' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtYd = (n) => n > 0 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' yd' : '—';
  const pct = (n,d) => d > 0 ? Math.round((n/d)*100) : 0;

  // ─── Selector compartido + cabecera ────────────────────────────────
  const selectorHtml = `
    <div class="card" style="padding:10px;margin-bottom:10px">
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end">
        <div class="field" style="margin:0">
          <label>Escuela (vacío = todas)</label>
          <select onchange="onEstEscuelaSel(this.value)">
            <option value="">Todas las escuelas</option>
            ${escuelas.map(e => `<option value="${e.id}" ${c.escuelaSel === e.id ? 'selected' : ''}>${e.alias || e.nombre}${e.codigo_cde ? ' · '+e.codigo_cde : ''}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="refrescarEstEscuela()">🔄 Refrescar</button>
      </div>
      ${esc ? `
        <div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:linear-gradient(135deg,#0065CC,#004999);color:white">
          <div style="font-size:11px;opacity:0.8">${(c.temporadaNombre||'').toUpperCase()} · ESCUELA</div>
          <div style="font-size:18px;font-weight:700;margin-top:2px">${esc.nombre || esc.alias || '—'}</div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px;font-size:12px;opacity:0.95">
            ${esc.codigo_cde ? `<div>CDE <strong>${esc.codigo_cde}</strong></div>` : ''}
            ${esc.alias ? `<div>Alias <strong>${esc.alias}</strong></div>` : ''}
            ${esc.director ? `<div>Director: ${esc.director}</div>` : ''}
            ${esc.municipio ? `<div>${esc.municipio}${esc.distrito ? ' / '+esc.distrito : ''}</div>` : ''}
          </div>
        </div>` : ''}
    </div>
  `;

  // ─── SECCIÓN 1: Tallaje (nivel × sexo) ─────────────────────────────
  const tStats = ESCN_NIVELES.map(n => {
    const enNivel = alumnos.filter(n.match);
    const acc = (sexo) => {
      const grupo = enNivel.filter(a => a.sexo === sexo);
      const tallados = grupo.filter(a => a.prenda_top && a.prenda_bottom).length;
      return { total: grupo.length, tallados };
    };
    return { ...n, M: acc('M'), F: acc('F') };
  });
  const tTot = { M:{total:0,tallados:0}, F:{total:0,tallados:0},
    cargados: alumnos.length, tallados: alumnos.filter(a => a.prenda_top && a.prenda_bottom).length };
  tStats.forEach(s => { tTot.M.total+=s.M.total; tTot.M.tallados+=s.M.tallados; tTot.F.total+=s.F.total; tTot.F.tallados+=s.F.tallados; });

  const tallajeHtml = `
    <details open style="margin-bottom:10px">
      <summary style="cursor:pointer;list-style:none;padding:10px 14px;background:white;border:1px solid var(--borde);border-radius:8px;font-weight:600;font-size:13px;color:#1F4E79;display:flex;justify-content:space-between;align-items:center;user-select:none">
        <span>📊 Tallaje por nivel × sexo</span><span style="opacity:0.6;font-size:11px">▼</span>
      </summary>
      <div style="border:1px solid var(--borde);border-top:none;border-radius:0 0 8px 8px;padding:10px;background:white">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:10px">
          <div class="card" style="padding:8px;text-align:center"><div style="font-size:10px;color:#666">Cargados</div><div style="font-size:20px;font-weight:700">${fmtN(tTot.cargados)}</div></div>
          <div class="card" style="padding:8px;text-align:center"><div style="font-size:10px;color:#666">Tallados</div><div style="font-size:20px;font-weight:700;color:var(--verde)">${fmtN(tTot.tallados)}</div><div style="font-size:10px;color:#888">${pct(tTot.tallados,tTot.cargados)}%</div></div>
          <div class="card" style="padding:8px;text-align:center"><div style="font-size:10px;color:#666">M tallado</div><div style="font-size:20px;font-weight:700;color:var(--azul)">${fmtN(tTot.M.tallados)}</div><div style="font-size:10px;color:#888">de ${tTot.M.total}</div></div>
          <div class="card" style="padding:8px;text-align:center"><div style="font-size:10px;color:#666">F tallado</div><div style="font-size:20px;font-weight:700;color:#c2185b">${fmtN(tTot.F.tallados)}</div><div style="font-size:10px;color:#888">de ${tTot.F.total}</div></div>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:520px">
            <thead><tr style="background:#FAFAFA">
              <th style="padding:8px;text-align:left">Nivel</th>
              <th style="padding:8px;text-align:right">M tallado</th><th style="padding:8px;text-align:right">M total</th>
              <th style="padding:8px;text-align:right">F tallado</th><th style="padding:8px;text-align:right">F total</th>
              <th style="padding:8px;text-align:right">Total tallado</th><th style="padding:8px;text-align:right">% avance</th>
            </tr></thead>
            <tbody>
              ${tStats.map(s => {
                const tt = s.M.tallados + s.F.tallados, tn = s.M.total + s.F.total;
                return `<tr style="border-top:1px solid #EEE">
                  <td style="padding:6px 8px;font-weight:600">${s.label}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--azul);font-weight:600">${s.M.tallados}</td>
                  <td style="padding:6px 8px;text-align:right;color:#888">${s.M.total}</td>
                  <td style="padding:6px 8px;text-align:right;color:#c2185b;font-weight:600">${s.F.tallados}</td>
                  <td style="padding:6px 8px;text-align:right;color:#888">${s.F.total}</td>
                  <td style="padding:6px 8px;text-align:right;font-weight:700">${tt}</td>
                  <td style="padding:6px 8px;text-align:right">${pct(tt,tn)}%</td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot><tr style="border-top:2px solid #CCC;background:#FAFAFA;font-weight:700">
              <td style="padding:8px">TOTAL</td>
              <td style="padding:8px;text-align:right;color:var(--azul)">${tTot.M.tallados}</td>
              <td style="padding:8px;text-align:right">${tTot.M.total}</td>
              <td style="padding:8px;text-align:right;color:#c2185b">${tTot.F.tallados}</td>
              <td style="padding:8px;text-align:right">${tTot.F.total}</td>
              <td style="padding:8px;text-align:right">${tTot.tallados}</td>
              <td style="padding:8px;text-align:right">${pct(tTot.tallados,tTot.cargados)}%</td>
            </tr></tfoot>
          </table>
        </div>
      </div>
    </details>
  `;

  // ─── SECCIÓN 2: Contrato (piezas + monto vs entregado) ─────────────
  const avance = c.avance || [];
  const avanceFilt = esc
    ? avance.filter(r => (esc.codigo_cde && r.codigo_cde === esc.codigo_cde)
        || (esc.alias && r.alias && r.alias === esc.alias))
    : avance;
  const sumA = (k) => avanceFilt.reduce((s,r)=> s + (Number(r[k])||0), 0);
  const cTot = {
    contratado: sumA('piezas_contratadas'), solicitadas: sumA('piezas_solicitadas'),
    entregadas: sumA('piezas_entregadas'), pendientes: sumA('piezas_pendientes'),
    monto: sumA('monto_contratado'), montoL1: sumA('monto_lote1'), montoL2: sumA('monto_lote2'),
  };
  const contratoHtml = `
    <details ${esc ? 'open' : ''} class="dato-sensible" style="margin-bottom:10px">
      <summary style="cursor:pointer;list-style:none;padding:10px 14px;background:white;border:1px solid var(--borde);border-radius:8px;font-weight:600;font-size:13px;color:#1F4E79;display:flex;justify-content:space-between;align-items:center;user-select:none">
        <span>📑 Contrato vs entregado <span style="font-weight:400;color:#888;font-size:11px">(${c.temporadaAnio})</span></span><span style="opacity:0.6;font-size:11px">▼</span>
      </summary>
      <div style="border:1px solid var(--borde);border-top:none;border-radius:0 0 8px 8px;padding:10px;background:white">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:${esc?'0':'10px'}">
          <div class="card" style="padding:8px;text-align:center"><div style="font-size:10px;color:#666">Piezas contratadas</div><div style="font-size:20px;font-weight:700">${fmtN(cTot.contratado)}</div></div>
          <div class="card" style="padding:8px;text-align:center"><div style="font-size:10px;color:#666">Entregadas</div><div style="font-size:20px;font-weight:700;color:var(--verde)">${fmtN(cTot.entregadas)}</div><div style="font-size:10px;color:#888">${fmtN(cTot.solicitadas)} solicitadas</div></div>
          <div class="card" style="padding:8px;text-align:center"><div style="font-size:10px;color:#666">Pendientes</div><div style="font-size:20px;font-weight:700;color:var(--naranja)">${fmtN(cTot.pendientes)}</div></div>
          <div class="card" style="padding:8px;text-align:center"><div style="font-size:10px;color:#666">Monto contratado</div><div style="font-size:20px;font-weight:700;color:var(--azul)">${fmtUSD(cTot.monto)}</div><div style="font-size:10px;color:#888">L1 ${fmtUSD(cTot.montoL1)} · L2 ${fmtUSD(cTot.montoL2)}</div></div>
        </div>
        ${esc ? (avanceFilt.length === 0
          ? `<div class="text-muted" style="padding:10px;text-align:center;font-size:12px">Sin contrato cargado para esta escuela en ${c.temporadaAnio}.</div>`
          : '')
        : `<div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px">
              <thead><tr style="background:#FAFAFA">
                <th style="padding:8px;text-align:left">Escuela</th><th style="padding:8px;text-align:left">Proveedor</th>
                <th style="padding:8px;text-align:right">$ Total</th><th style="padding:8px;text-align:right">Solicit.</th>
                <th style="padding:8px;text-align:right">Entreg.</th><th style="padding:8px;text-align:right">Pend.</th><th style="padding:8px;text-align:right">% Av.</th>
              </tr></thead>
              <tbody>
                ${avanceFilt.length === 0 ? `<tr><td colspan="7" style="padding:16px;text-align:center;color:#888">Sin contratos para ${c.temporadaAnio}.</td></tr>`
                : avanceFilt.map(r => {
                  const p = Number(r.porcentaje_avance)||0;
                  const cp = p >= 80 ? 'var(--verde)' : (p >= 40 ? 'var(--naranja)' : '#888');
                  return `<tr style="border-top:1px solid #EEE">
                    <td style="padding:6px 8px"><div style="font-weight:600">${r.alias || r.escuela_nombre}</div>${r.codigo_cde?`<div style="font-size:10px;color:#888">CDE ${r.codigo_cde}</div>`:''}</td>
                    <td style="padding:6px 8px;color:#555">${r.persona || '—'}</td>
                    <td style="padding:6px 8px;text-align:right;color:var(--azul);font-weight:600">${fmtUSD(r.monto_contratado)}</td>
                    <td style="padding:6px 8px;text-align:right">${fmtN(r.piezas_solicitadas)}</td>
                    <td style="padding:6px 8px;text-align:right;color:var(--verde);font-weight:600">${fmtN(r.piezas_entregadas)}</td>
                    <td style="padding:6px 8px;text-align:right;color:${p<100?'var(--naranja)':'#888'}">${fmtN(r.piezas_pendientes)}</td>
                    <td style="padding:6px 8px;text-align:right;color:${cp};font-weight:700">${p}%</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`}
      </div>
    </details>
  `;

  // ─── SECCIÓN 3: Tela / Yardaje (necesaria vs recibida) ─────────────
  const yardasPorColor = { celeste:0, blanca:0, azul:0, beige:0 };
  for (const n of ESCN_NIVELES) {
    const enNivel = alumnos.filter(n.match);
    const m = enNivel.filter(a => a.sexo === 'M');
    const f = enNivel.filter(a => a.sexo === 'F');
    const mTop = m.filter(a=>a.prenda_top).length, fTop = f.filter(a=>a.prenda_top).length;
    const mBot = m.filter(a=>a.prenda_bottom).length, fBot = f.filter(a=>a.prenda_bottom).length;
    const fact = ESCN_FACTORES[n.key] || {};
    for (const [color, factor] of Object.entries(fact)) {
      const esTop = color === 'celeste' || color === 'blanca';
      yardasPorColor[color] += (esTop?mTop:mBot)*factor.M + (esTop?fTop:fBot)*factor.F;
    }
  }
  const telaFilt = (c.tela || []).filter(t => !c.escuelaSel || t.escuela_id === c.escuelaSel);
  const recibida = { celeste:0, blanca:0, azul:0, beige:0 };
  for (const t of telaFilt) {
    recibida.celeste += Number(t.tela_celeste_yd)||0;
    recibida.blanca  += Number(t.tela_blanca_yd)||0;
    recibida.azul    += Number(t.tela_azul_yd)||0;
    recibida.beige   += Number(t.tela_beige_yd)||0;
  }
  const totalUtil = Object.values(yardasPorColor).reduce((s,v)=>s+v,0);
  const totalRecib = Object.values(recibida).reduce((s,v)=>s+v,0);
  const fmtDiff = (n) => Math.abs(n) < 0.01 ? '—' : (n>0?'+':'') + n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' yd';
  const telaHtml = `
    <details style="margin-bottom:10px">
      <summary style="cursor:pointer;list-style:none;padding:10px 14px;background:white;border:1px solid var(--borde);border-radius:8px;font-weight:600;font-size:13px;color:#1F4E79;display:flex;justify-content:space-between;align-items:center;user-select:none">
        <span>📐 Tela / Yardaje — necesaria vs recibida</span><span style="opacity:0.6;font-size:11px">▼</span>
      </summary>
      <div style="border:1px solid var(--borde);border-top:none;border-radius:0 0 8px 8px;padding:10px;background:white">
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:520px">
            <thead><tr style="background:#FAFAFA">
              <th style="padding:8px;text-align:left">Color</th><th style="padding:8px;text-align:right">Recibida</th>
              <th style="padding:8px;text-align:right">Utilizada (cálculo)</th><th style="padding:8px;text-align:right">Diferencia</th><th style="padding:8px;text-align:left">Acción</th>
            </tr></thead>
            <tbody>
              ${Object.entries(ESCN_COLORES).map(([k,col]) => {
                const diff = recibida[k] - yardasPorColor[k];
                const acc = diff > 0.5 ? '↩ devolver' : (diff < -0.5 ? '➕ solicitar' : '✓');
                const ac = diff > 0.5 ? 'var(--verde)' : (diff < -0.5 ? 'var(--naranja)' : '#888');
                return `<tr style="border-top:1px solid #EEE">
                  <td style="padding:6px 8px;border-left:4px solid ${col.border};font-weight:600">${col.label}</td>
                  <td style="padding:6px 8px;text-align:right">${fmtYd(recibida[k])}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--azul)">${fmtYd(yardasPorColor[k])}</td>
                  <td style="padding:6px 8px;text-align:right;font-weight:700;color:${ac}">${fmtDiff(diff)}</td>
                  <td style="padding:6px 8px;color:${ac}">${acc}</td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot><tr style="border-top:2px solid #CCC;background:#FAFAFA;font-weight:700">
              <td style="padding:8px">TOTAL</td>
              <td style="padding:8px;text-align:right">${fmtYd(totalRecib)}</td>
              <td style="padding:8px;text-align:right;color:var(--azul)">${fmtYd(totalUtil)}</td>
              <td style="padding:8px;text-align:right;color:${(totalRecib-totalUtil)>0?'var(--verde)':((totalRecib-totalUtil)<0?'var(--naranja)':'#888')}">${fmtDiff(totalRecib-totalUtil)}</td>
              <td></td>
            </tr></tfoot>
          </table>
        </div>
        <div style="padding:8px 4px 0;font-size:11px;color:#666">
          💡 <strong>↩ devolver</strong>: sobra tela · <strong>➕ solicitar</strong>: falta pedir.
          Si la tela recibida está en 0, cargala en 📋 Registro → ✏️ escuela → "Tela recibida".
        </div>
      </div>
    </details>
  `;

  root.innerHTML = selectorHtml + tallajeHtml + contratoHtml + telaHtml;
}

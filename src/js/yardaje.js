// ══════════════════════════════════════════════════════════════════════
// YARDAJE — tela necesaria por color (portado del RESUMEN del Excel)
// Factor de yardaje por nivel × sexo × color de tela. Suma yardas
// necesarias para cubrir la demanda tallada.
// ══════════════════════════════════════════════════════════════════════

// Factores yardas/alumno extraídos del RESUMEN del Excel (rows 15-24).
// Estructura: { nivel: { color: { M: factor, F: factor } } }
// Top = camisas/blusas (color celeste o blanca según nivel)
// Bot = pantalones/faldas (color azul o beige según nivel)
const YARDAJE_FACTORES = {
  // PARV usa celeste para top y azul para bot
  PARV:    { celeste: { M: 0.75, F: 0.75 }, azul:   { M: 0.75, F: 0.60 } },
  '1CICLO':{ blanca:  { M: 1.00, F: 1.00 }, azul:   { M: 1.00, F: 0.75 } },
  '2CICLO':{ blanca:  { M: 1.25, F: 1.25 }, azul:   { M: 1.25, F: 1.00 } },
  '3CICLO':{ blanca:  { M: 1.50, F: 1.50 }, azul:   { M: 1.50, F: 1.25 } },
  BACH:    { blanca:  { M: 1.50, F: 1.50 }, beige:  { M: 1.65, F: 1.50 } },
};

const YARDAJE_NIVELES = [
  { key:'PARV',    label:'Parvularia',   match:(a)=> a.nivel === 'PARV' },
  { key:'1CICLO',  label:'1er Ciclo',    match:(a)=> a.nivel === 'BASICA' && a.ciclo === 1 },
  { key:'2CICLO',  label:'2do Ciclo',    match:(a)=> a.nivel === 'BASICA' && a.ciclo === 2 },
  { key:'3CICLO',  label:'3er Ciclo',    match:(a)=> a.nivel === 'BASICA' && a.ciclo === 3 },
  { key:'BACH',    label:'Bachillerato', match:(a)=> a.nivel === 'BACH' },
];

const YARDAJE_COLORES = {
  celeste: { label:'Tela Celeste', hex:'#8EC5E8', border:'#6AA5C8' },
  blanca:  { label:'Tela Blanca',  hex:'#FFFFFF', border:'#BBB' },
  azul:    { label:'Tela Azul',    hex:'#1F4E79', border:'#1F4E79', textWhite: true },
  beige:   { label:'Tela Beige',   hex:'#D4C59E', border:'#B0A07A' },
};

let yardajeCache = {
  temporadaId: null,
  temporadaAnio: null,
  escuelas: null,
  alumnos: null,
  contratos: null,  // [{escuela_id, tela_celeste_yd, tela_blanca_yd, tela_azul_yd, tela_beige_yd}]
  escuelaSel: '',
};

async function initYardaje() {
  const root = document.getElementById('est-sub-yardaje-view');
  if (!root) return;
  root.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando yardaje...</div>';

  try {
    if (!yardajeCache.temporadaId) {
      const t = (await supaFetch('temporada', 'GET', null,
        '?estado=eq.activa&select=id,anio,nombre&order=anio.desc&limit=1'))[0]
        || (await supaFetch('temporada', 'GET', null,
        '?select=id,anio,nombre&order=anio.desc&limit=1'))[0];
      if (!t) throw new Error('No hay temporada cargada');
      yardajeCache.temporadaId = t.id;
      yardajeCache.temporadaAnio = t.anio;
    }
    if (!yardajeCache.escuelas) {
      yardajeCache.escuelas = await supaFetchAll('escuela',
        '?activa=eq.true&select=id,alias,codigo_cde,nombre&order=alias.asc');
    }
    if (!yardajeCache.alumnos) {
      yardajeCache.alumnos = await supaFetchAll('alumno',
        `?temporada_id=eq.${yardajeCache.temporadaId}&activo=eq.true` +
        '&select=escuela_id,nivel,ciclo,sexo,prenda_top,prenda_bottom');
    }
    if (!yardajeCache.contratos) {
      yardajeCache.contratos = await supaFetchAll('contrato_escuela',
        `?anio=eq.${yardajeCache.temporadaAnio}&select=escuela_id,tela_celeste_yd,tela_blanca_yd,tela_azul_yd,tela_beige_yd`);
    }
    renderYardaje();
  } catch (e) {
    root.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function onYardajeEscuelaSel(val) {
  yardajeCache.escuelaSel = val || '';
  renderYardaje();
}

// Permite que initYardaje refresque todo (incluyendo contratos)
// Usado por el botón "🔄 Refrescar".
function refrescarYardaje() {
  yardajeCache.escuelas = null;
  yardajeCache.alumnos = null;
  yardajeCache.contratos = null;
  initYardaje();
}

function renderYardaje() {
  const root = document.getElementById('est-sub-yardaje-view');
  if (!root) return;
  const escuelas = yardajeCache.escuelas || [];
  const alumnos = (yardajeCache.alumnos || []).filter(a =>
    !yardajeCache.escuelaSel || a.escuela_id === yardajeCache.escuelaSel);

  // ─── Calcular yardaje por nivel × color × sexo ─────────────────────
  // Para cada nivel agrupamos por sexo, contamos los tallados (top/bot),
  // y aplicamos el factor por color según las reglas del Excel.
  const yardasPorColor = { celeste: 0, blanca: 0, azul: 0, beige: 0 };
  const detalle = [];
  for (const n of YARDAJE_NIVELES) {
    const enNivel = alumnos.filter(n.match);
    const m = enNivel.filter(a => a.sexo === 'M');
    const f = enNivel.filter(a => a.sexo === 'F');
    const mTop = m.filter(a => a.prenda_top).length;
    const fTop = f.filter(a => a.prenda_top).length;
    const mBot = m.filter(a => a.prenda_bottom).length;
    const fBot = f.filter(a => a.prenda_bottom).length;
    const fact = YARDAJE_FACTORES[n.key] || {};
    const row = { ...n, M: m.length, F: f.length, mTop, fTop, mBot, fBot, yardas: {} };
    for (const [color, factor] of Object.entries(fact)) {
      // Top o bottom según el color: celeste/blanca = top, azul/beige = bottom
      const esTop = color === 'celeste' || color === 'blanca';
      const cantM = esTop ? mTop : mBot;
      const cantF = esTop ? fTop : fBot;
      const yd = cantM * factor.M + cantF * factor.F;
      row.yardas[color] = { M: cantM * factor.M, F: cantF * factor.F, total: yd, factor };
      yardasPorColor[color] += yd;
    }
    detalle.push(row);
  }

  const escSel = escuelas.find(e => e.id === yardajeCache.escuelaSel);
  const fmtYd = (n) => n > 0 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' yd' : '—';
  const fmtDiff = (n) => {
    if (Math.abs(n) < 0.01) return '—';
    const sign = n > 0 ? '+' : '';
    return sign + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' yd';
  };
  const totalGeneral = Object.values(yardasPorColor).reduce((s, v) => s + v, 0);

  // ─── Tela recibida según contrato — filtrada por escuela si aplica ──
  const contratos = (yardajeCache.contratos || []).filter(c =>
    !yardajeCache.escuelaSel || c.escuela_id === yardajeCache.escuelaSel);
  const telaRecibida = { celeste: 0, blanca: 0, azul: 0, beige: 0 };
  for (const c of contratos) {
    telaRecibida.celeste += Number(c.tela_celeste_yd) || 0;
    telaRecibida.blanca  += Number(c.tela_blanca_yd)  || 0;
    telaRecibida.azul    += Number(c.tela_azul_yd)    || 0;
    telaRecibida.beige   += Number(c.tela_beige_yd)   || 0;
  }
  const totalRecibida = Object.values(telaRecibida).reduce((s, v) => s + v, 0);
  const balance = {
    celeste: telaRecibida.celeste - yardasPorColor.celeste,
    blanca:  telaRecibida.blanca  - yardasPorColor.blanca,
    azul:    telaRecibida.azul    - yardasPorColor.azul,
    beige:   telaRecibida.beige   - yardasPorColor.beige,
  };
  const totalBalance = totalRecibida - totalGeneral;

  root.innerHTML = `
    <!-- Selector escuela -->
    <div class="card" style="padding:10px;margin-bottom:10px">
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end">
        <div class="field" style="margin:0">
          <label>Escuela (vacío = todas)</label>
          <select onchange="onYardajeEscuelaSel(this.value)">
            <option value="">Todas las escuelas</option>
            ${escuelas.map(e => `<option value="${e.id}" ${yardajeCache.escuelaSel === e.id ? 'selected' : ''}>${e.alias || e.nombre}${e.codigo_cde ? ' · '+e.codigo_cde : ''}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="refrescarYardaje()">🔄 Refrescar</button>
      </div>
    </div>

    <!-- Resumen por color (las KPIs grandes) -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:10px">
      ${Object.entries(YARDAJE_COLORES).map(([key, c]) => `
        <div class="card" style="padding:10px;text-align:center;border-top:4px solid ${c.border}">
          <div style="font-size:10px;color:#666">${c.label}</div>
          <div style="font-size:22px;font-weight:700;color:#333">${fmtYd(yardasPorColor[key])}</div>
        </div>
      `).join('')}
    </div>

    <!-- Total y aviso -->
    <div class="alert alert-info" style="font-size:11px;margin-bottom:10px">
      <strong>Utilizado total: ${fmtYd(totalGeneral)}</strong> ${escSel ? 'para '+(escSel.alias || escSel.nombre) : 'para todas las escuelas'}.
      Factores del RESUMEN del Excel (yardas por alumno tallado).
      Solo considera alumnos con prenda cargada — si subís el % de tallaje, sube el consumo.
    </div>

    <!-- Balance: Recibida vs Utilizada vs Diferencia -->
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px">
      <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">⚖️ Balance: tela recibida vs utilizada</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:520px">
          <thead>
            <tr style="background:#FAFAFA">
              <th style="padding:8px;text-align:left">Color</th>
              <th style="padding:8px;text-align:right">Recibida</th>
              <th style="padding:8px;text-align:right">Utilizada (cálculo)</th>
              <th style="padding:8px;text-align:right">Diferencia</th>
              <th style="padding:8px;text-align:left">Acción</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(YARDAJE_COLORES).map(([k, c]) => {
              const diff = balance[k];
              const acc = diff > 0.5 ? '↩ devolver' : (diff < -0.5 ? '➕ solicitar' : '✓');
              const accColor = diff > 0.5 ? 'var(--verde)' : (diff < -0.5 ? 'var(--naranja)' : '#888');
              return `
                <tr style="border-top:1px solid #EEE">
                  <td style="padding:6px 8px;border-left:4px solid ${c.border};font-weight:600">${c.label}</td>
                  <td style="padding:6px 8px;text-align:right">${fmtYd(telaRecibida[k])}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--azul)">${fmtYd(yardasPorColor[k])}</td>
                  <td style="padding:6px 8px;text-align:right;font-weight:700;color:${accColor}">${fmtDiff(diff)}</td>
                  <td style="padding:6px 8px;color:${accColor}">${acc}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid #CCC;background:#FAFAFA;font-weight:700">
              <td style="padding:8px">TOTAL</td>
              <td style="padding:8px;text-align:right">${fmtYd(totalRecibida)}</td>
              <td style="padding:8px;text-align:right;color:var(--azul)">${fmtYd(totalGeneral)}</td>
              <td style="padding:8px;text-align:right;color:${totalBalance>0?'var(--verde)':(totalBalance<0?'var(--naranja)':'#888')}">${fmtDiff(totalBalance)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div style="padding:8px 12px;font-size:11px;color:#666;background:#FAFAFA">
        💡 <strong>↩ devolver</strong>: sobra en bodega · <strong>➕ solicitar</strong>: falta pedir.
        Si no hay datos de tela recibida (todo en 0), cargalos en 📋 Registro → ✏️ escuela → sección "Tela recibida".
      </div>
    </div>


    <!-- Tabla detalle por nivel × color -->
    <div class="card" style="padding:0;overflow:hidden">
      <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">📐 Yardaje por nivel × color</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px">
          <thead>
            <tr style="background:#FAFAFA">
              <th style="padding:8px;text-align:left">Nivel</th>
              <th style="padding:8px;text-align:right">M</th>
              <th style="padding:8px;text-align:right">F</th>
              <th style="padding:8px;text-align:right">Celeste</th>
              <th style="padding:8px;text-align:right">Blanca</th>
              <th style="padding:8px;text-align:right">Azul</th>
              <th style="padding:8px;text-align:right">Beige</th>
              <th style="padding:8px;text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${detalle.map(d => {
              const yds = d.yardas;
              const totalNivel = Object.values(yds).reduce((s,y)=>s+y.total,0);
              return `
                <tr style="border-top:1px solid #EEE">
                  <td style="padding:6px 8px;font-weight:600">${d.label}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--azul)">${d.M}</td>
                  <td style="padding:6px 8px;text-align:right;color:#c2185b">${d.F}</td>
                  <td style="padding:6px 8px;text-align:right">${yds.celeste ? fmtYd(yds.celeste.total) : '—'}</td>
                  <td style="padding:6px 8px;text-align:right">${yds.blanca ? fmtYd(yds.blanca.total) : '—'}</td>
                  <td style="padding:6px 8px;text-align:right">${yds.azul ? fmtYd(yds.azul.total) : '—'}</td>
                  <td style="padding:6px 8px;text-align:right">${yds.beige ? fmtYd(yds.beige.total) : '—'}</td>
                  <td style="padding:6px 8px;text-align:right;font-weight:700;color:var(--verde)">${fmtYd(totalNivel)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid #CCC;background:#FAFAFA;font-weight:700">
              <td style="padding:8px" colspan="3">TOTAL</td>
              <td style="padding:8px;text-align:right">${fmtYd(yardasPorColor.celeste)}</td>
              <td style="padding:8px;text-align:right">${fmtYd(yardasPorColor.blanca)}</td>
              <td style="padding:8px;text-align:right">${fmtYd(yardasPorColor.azul)}</td>
              <td style="padding:8px;text-align:right">${fmtYd(yardasPorColor.beige)}</td>
              <td style="padding:8px;text-align:right;color:var(--verde)">${fmtYd(totalGeneral)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

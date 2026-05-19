// ══════════════════════════════════════════════════════════════════════
// CONTRATOS — cruce contrato (Excel CONTRATO sheet) vs producido/entregado
// Lee vw_contrato_avance: piezas/monto contratados + solicitadas/entregadas
// ══════════════════════════════════════════════════════════════════════

let contratosCache = {
  rows: null,
  anioFiltro: 2025,
  personaFiltro: '',
};

async function initContratos() {
  const root = document.getElementById('est-sub-contratos-view');
  if (!root) return;
  root.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando contratos...</div>';

  try {
    contratosCache.rows = await supaFetchAll('vw_contrato_avance',
      `?anio=eq.${contratosCache.anioFiltro}&order=monto_contratado.desc`);
    renderContratos();
  } catch (e) {
    root.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function onContratosPersonaFiltro(val) {
  contratosCache.personaFiltro = val || '';
  renderContratos();
}

function renderContratos() {
  const root = document.getElementById('est-sub-contratos-view');
  if (!root) return;
  const all = contratosCache.rows || [];
  const rows = contratosCache.personaFiltro
    ? all.filter(r => r.persona === contratosCache.personaFiltro)
    : all;

  // KPIs agregados
  const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const tot = {
    escuelas: rows.length,
    contratado: sum('piezas_contratadas'),
    solicitadas: sum('piezas_solicitadas'),
    entregadas: sum('piezas_entregadas'),
    pendientes: sum('piezas_pendientes'),
    monto: sum('monto_contratado'),
    montoL1: sum('monto_lote1'),
    montoL2: sum('monto_lote2'),
  };

  // Personas únicas para filtro
  const personas = [...new Set(all.map(r => r.persona).filter(Boolean))].sort();

  const fmtUSD = (n) => '$' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtN = (n) => Number(n||0).toLocaleString();

  root.innerHTML = `
    <!-- Filtros -->
    <div class="card" style="padding:10px;margin-bottom:10px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;align-items:end">
        <div class="field" style="margin:0">
          <label>Año</label>
          <select onchange="contratosCache.anioFiltro=parseInt(this.value); initContratos()">
            <option value="2025" ${contratosCache.anioFiltro===2025?'selected':''}>2025</option>
            <option value="2026" ${contratosCache.anioFiltro===2026?'selected':''}>2026</option>
          </select>
        </div>
        <div class="field" style="margin:0">
          <label>Proveedor</label>
          <select onchange="onContratosPersonaFiltro(this.value)">
            <option value="">Todos</option>
            ${personas.map(p => `<option value="${p}" ${contratosCache.personaFiltro===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
        <div style="text-align:right">
          <button class="btn btn-ghost btn-sm" onclick="initContratos()">🔄 Refrescar</button>
        </div>
      </div>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:10px">
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Escuelas con contrato</div>
        <div style="font-size:22px;font-weight:700;color:#333">${tot.escuelas}</div>
      </div>
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Piezas contratadas</div>
        <div style="font-size:22px;font-weight:700;color:#333">${fmtN(tot.contratado)}</div>
      </div>
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Piezas entregadas</div>
        <div style="font-size:22px;font-weight:700;color:var(--verde)">${fmtN(tot.entregadas)}</div>
        <div style="font-size:10px;color:#888">${tot.solicitadas} solicitadas</div>
      </div>
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Pendientes</div>
        <div style="font-size:22px;font-weight:700;color:var(--naranja)">${fmtN(tot.pendientes)}</div>
      </div>
      <div class="card" style="padding:10px;text-align:center">
        <div style="font-size:10px;color:#666">Monto contratado</div>
        <div style="font-size:22px;font-weight:700;color:var(--azul)">${fmtUSD(tot.monto)}</div>
        <div style="font-size:10px;color:#888">L1 ${fmtUSD(tot.montoL1)} · L2 ${fmtUSD(tot.montoL2)}</div>
      </div>
    </div>

    <!-- Tabla por escuela -->
    <div class="card" style="padding:0;overflow:hidden">
      <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">📑 Contrato vs avance por escuela (${contratosCache.anioFiltro})</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:900px">
          <thead>
            <tr style="background:#FAFAFA">
              <th style="padding:8px;text-align:left">Escuela</th>
              <th style="padding:8px;text-align:left">Proveedor</th>
              <th style="padding:8px;text-align:right">Pz L1</th>
              <th style="padding:8px;text-align:right">Pz L2</th>
              <th style="padding:8px;text-align:right">$ L1</th>
              <th style="padding:8px;text-align:right">$ L2</th>
              <th style="padding:8px;text-align:right">$ Total</th>
              <th style="padding:8px;text-align:right">Solicit.</th>
              <th style="padding:8px;text-align:right">Entreg.</th>
              <th style="padding:8px;text-align:right">Pend.</th>
              <th style="padding:8px;text-align:right">% Avance</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 ? `
              <tr><td colspan="11" style="padding:20px;text-align:center;color:#888">Sin contratos cargados para ${contratosCache.anioFiltro}.</td></tr>
            ` : rows.map(r => {
              const pct = Number(r.porcentaje_avance) || 0;
              const colorPct = pct >= 80 ? 'var(--verde)' : (pct >= 40 ? 'var(--naranja)' : '#888');
              return `
                <tr style="border-top:1px solid #EEE">
                  <td style="padding:6px 8px">
                    <div style="font-weight:600">${r.alias || r.escuela_nombre}</div>
                    ${r.codigo_cde ? `<div style="font-size:10px;color:#888">CDE ${r.codigo_cde}</div>` : ''}
                  </td>
                  <td style="padding:6px 8px;color:#555">${r.persona || '—'}</td>
                  <td style="padding:6px 8px;text-align:right">${fmtN(r.piezas_lote1)}</td>
                  <td style="padding:6px 8px;text-align:right">${fmtN(r.piezas_lote2)}</td>
                  <td style="padding:6px 8px;text-align:right;color:#888">${fmtUSD(r.monto_lote1)}</td>
                  <td style="padding:6px 8px;text-align:right;color:#888">${fmtUSD(r.monto_lote2)}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--azul);font-weight:600">${fmtUSD(r.monto_contratado)}</td>
                  <td style="padding:6px 8px;text-align:right">${fmtN(r.piezas_solicitadas)}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--verde);font-weight:600">${fmtN(r.piezas_entregadas)}</td>
                  <td style="padding:6px 8px;text-align:right;color:${pct<100?'var(--naranja)':'#888'}">${fmtN(r.piezas_pendientes)}</td>
                  <td style="padding:6px 8px;text-align:right;color:${colorPct};font-weight:700">${pct}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid #CCC;background:#FAFAFA;font-weight:700">
              <td style="padding:8px" colspan="6">TOTAL</td>
              <td style="padding:8px;text-align:right;color:var(--azul)">${fmtUSD(tot.monto)}</td>
              <td style="padding:8px;text-align:right">${fmtN(tot.solicitadas)}</td>
              <td style="padding:8px;text-align:right;color:var(--verde)">${fmtN(tot.entregadas)}</td>
              <td style="padding:8px;text-align:right;color:var(--naranja)">${fmtN(tot.pendientes)}</td>
              <td style="padding:8px;text-align:right">${tot.solicitadas > 0 ? Math.round(tot.entregadas/tot.solicitadas*100) : 0}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div class="alert alert-info" style="font-size:11px;margin-top:10px">
      <strong>Pz L1/L2:</strong> piezas contratadas por lote (del Excel CONTRATO).
      <strong>Solicit/Entreg/Pend:</strong> derivado de la tabla <code>pedido</code> y entregas.
      <strong>% Avance:</strong> entregadas / solicitadas. El Lote 2 está sin piezas explícitas en el Excel — la cantidad real corresponde a los 6,423 alumnos tallados en BASE.
    </div>
  `;
}

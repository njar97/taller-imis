// ══════════════════════════════════════════════════════════════════════
// DASHBOARD HISTÓRICO (v29)
// Comparativo entre temporadas: 2024 vs 2025 vs 2026...
// ══════════════════════════════════════════════════════════════════════

let historicoCache = {
  temporadas: [],
  datosPorTemporada: {}, // temp_id -> { alumnos, pedidos, escuelas }
  cargando: false,
};

async function initHistorico() {
  if (historicoCache.cargando) return;
  historicoCache.cargando = true;
  
  const cont = document.getElementById('historico-contenido');
  if (!cont) { historicoCache.cargando = false; return; }
  cont.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando datos históricos...</div>';
  
  try {
    // Cargar temporadas + sus resúmenes
    const temporadas = await supaFetch('vw_temporada_resumen', 'GET', null, '?order=anio.asc&limit=20');
    historicoCache.temporadas = temporadas;
    
    // Para cada temporada: total alumnos y distribución por nivel
    await Promise.all(temporadas.map(async t => {
      try {
        const alumnos = await supaFetch('alumno', 'GET', null, 
          `?temporada_id=eq.${t.id}&activo=eq.true&select=nivel,sexo,estado_top,estado_bottom,escuela_id&limit=50000`);
        historicoCache.datosPorTemporada[t.id] = { alumnos };
      } catch(e) {
        historicoCache.datosPorTemporada[t.id] = { alumnos: [] };
      }
    }));
    
    historicoCache.cargando = false;
    renderHistorico();
  } catch(e) {
    historicoCache.cargando = false;
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function renderHistorico() {
  const cont = document.getElementById('historico-contenido');
  if (!cont) return;
  
  const temps = historicoCache.temporadas;
  if (temps.length === 0) {
    cont.innerHTML = '<div class="alert alert-info">No hay temporadas cargadas aún.</div>';
    return;
  }
  
  // Stats por temporada
  const statsPorTemp = temps.map(t => {
    const alumnos = historicoCache.datosPorTemporada[t.id]?.alumnos || [];
    const escuelasUnicas = new Set(alumnos.map(a => a.escuela_id)).size;
    const porNivel = { PARV: 0, BASICA: 0, BACH: 0, OTRO: 0 };
    const porSexo = { F: 0, M: 0, NA: 0 };
    let completos = 0, entregados = 0;
    for (const a of alumnos) {
      porNivel[a.nivel || 'OTRO'] = (porNivel[a.nivel || 'OTRO'] || 0) + 1;
      porSexo[a.sexo || 'NA'] = (porSexo[a.sexo || 'NA'] || 0) + 1;
      if (a.estado_top === 'empacado' && a.estado_bottom === 'empacado') completos++;
      if (a.estado_top === 'entregado' && a.estado_bottom === 'entregado') entregados++;
    }
    return {
      ...t,
      num_alumnos_real: alumnos.length,
      escuelas_con_alumnos: escuelasUnicas,
      porNivel, porSexo, completos, entregados,
    };
  });
  
  const maxAlumnos = Math.max(1, ...statsPorTemp.map(s => s.num_alumnos_real));
  const maxPiezas = Math.max(1, ...statsPorTemp.map(s => s.piezas_solicitadas || 0));
  
  // Tarjetas comparativas
  const tarjetas = statsPorTemp.map(s => {
    const color = s.estado === 'activa' ? 'var(--azul)' : (s.estado === 'cerrada' ? '#888' : '#f80');
    const pctAlumnos = (s.num_alumnos_real / maxAlumnos) * 100;
    const pctPiezas = ((s.piezas_solicitadas || 0) / maxPiezas) * 100;
    
    return `
      <div class="card" style="padding:12px;border-top:4px solid ${color}">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
          <div>
            <div style="font-size:22px;font-weight:700">${s.codigo}</div>
            <div style="font-size:10px;color:#888;text-transform:uppercase">${s.estado}</div>
          </div>
          <div style="text-align:right;font-size:11px;color:#666">
            <div>${s.escuelas_con_alumnos || s.num_escuelas || 0} escuelas</div>
          </div>
        </div>
        
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">
            <span>Alumnos</span>
            <strong>${(s.num_alumnos_real||0).toLocaleString()}</strong>
          </div>
          <div style="background:#EEE;height:4px;border-radius:2px;overflow:hidden">
            <div style="background:${color};height:100%;width:${pctAlumnos}%"></div>
          </div>
        </div>
        
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">
            <span>Piezas contratadas</span>
            <strong>${(s.piezas_solicitadas||0).toLocaleString()}</strong>
          </div>
          <div style="background:#EEE;height:4px;border-radius:2px;overflow:hidden">
            <div style="background:${color};height:100%;width:${pctPiezas}%"></div>
          </div>
        </div>
        
        <div style="border-top:1px solid var(--borde);padding-top:6px;margin-top:6px;font-size:11px">
          <div style="display:flex;justify-content:space-between;margin-bottom:2px">
            <span>Por nivel:</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:10px">
            ${s.porNivel.PARV > 0 ? `<span style="background:#FFE;padding:1px 6px;border-radius:3px">PARV ${s.porNivel.PARV}</span>` : ''}
            ${s.porNivel.BASICA > 0 ? `<span style="background:#EEF;padding:1px 6px;border-radius:3px">BÁSICA ${s.porNivel.BASICA}</span>` : ''}
            ${s.porNivel.BACH > 0 ? `<span style="background:#FEF;padding:1px 6px;border-radius:3px">BACH ${s.porNivel.BACH}</span>` : ''}
          </div>
        </div>
        
        <div style="border-top:1px solid var(--borde);padding-top:6px;margin-top:6px;font-size:11px">
          <div style="display:flex;justify-content:space-between">
            <span>Sexo:</span>
            <span>♀ ${s.porSexo.F || 0} · ♂ ${s.porSexo.M || 0}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:2px;color:var(--verde)">
            <span>Completos:</span>
            <strong>${s.completos}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;color:var(--azul)">
            <span>Entregados:</span>
            <strong>${s.entregados}</strong>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Tabla comparativa resumida
  const tablaComp = `
    <div class="card" style="padding:0;overflow:auto;margin-top:12px">
      <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">📊 Resumen comparativo</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#FAFAFA">
            <th style="padding:6px 8px;text-align:left">Temporada</th>
            <th style="padding:6px 8px;text-align:right">Escuelas</th>
            <th style="padding:6px 8px;text-align:right">Alumnos</th>
            <th style="padding:6px 8px;text-align:right">Piezas</th>
            <th style="padding:6px 8px;text-align:right">Entregadas</th>
            <th style="padding:6px 8px;text-align:right">% avance</th>
            <th style="padding:6px 8px;text-align:right">Completos</th>
          </tr>
        </thead>
        <tbody>
          ${statsPorTemp.map(s => `
            <tr style="border-top:1px solid #EEE">
              <td style="padding:6px 8px">
                <strong>${s.codigo}</strong>
                <span style="font-size:10px;color:#888;margin-left:4px">${s.estado}</span>
              </td>
              <td style="padding:6px 8px;text-align:right">${s.escuelas_con_alumnos || s.num_escuelas || 0}</td>
              <td style="padding:6px 8px;text-align:right">${(s.num_alumnos_real||0).toLocaleString()}</td>
              <td style="padding:6px 8px;text-align:right">${(s.piezas_solicitadas||0).toLocaleString()}</td>
              <td style="padding:6px 8px;text-align:right;color:var(--verde)">${(s.piezas_entregadas||0).toLocaleString()}</td>
              <td style="padding:6px 8px;text-align:right">${s.porcentaje_avance || 0}%</td>
              <td style="padding:6px 8px;text-align:right">${s.completos.toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  
  // Comparativo entre temporadas (variación %)
  let comparativo = '';
  if (statsPorTemp.length >= 2) {
    const pares = [];
    for (let i = 1; i < statsPorTemp.length; i++) {
      const prev = statsPorTemp[i-1];
      const cur = statsPorTemp[i];
      const deltaAlum = cur.num_alumnos_real - prev.num_alumnos_real;
      const deltaPct = prev.num_alumnos_real > 0 ? Math.round(100 * deltaAlum / prev.num_alumnos_real) : 0;
      const deltaPiezas = (cur.piezas_solicitadas||0) - (prev.piezas_solicitadas||0);
      const deltaPctPiezas = (prev.piezas_solicitadas||0) > 0 ? Math.round(100 * deltaPiezas / prev.piezas_solicitadas) : 0;
      pares.push({ prev, cur, deltaAlum, deltaPct, deltaPiezas, deltaPctPiezas });
    }
    
    comparativo = `
      <div class="card" style="padding:0;overflow:hidden;margin-top:12px">
        <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">📈 Variación entre temporadas</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#FAFAFA">
              <th style="padding:6px 8px;text-align:left">Comparación</th>
              <th style="padding:6px 8px;text-align:right">Δ Alumnos</th>
              <th style="padding:6px 8px;text-align:right">Δ %</th>
              <th style="padding:6px 8px;text-align:right">Δ Piezas</th>
              <th style="padding:6px 8px;text-align:right">Δ %</th>
            </tr>
          </thead>
          <tbody>
            ${pares.map(p => `
              <tr style="border-top:1px solid #EEE">
                <td style="padding:6px 8px">${p.prev.codigo} → ${p.cur.codigo}</td>
                <td style="padding:6px 8px;text-align:right;color:${p.deltaAlum>=0?'var(--verde)':'#c44'}">${p.deltaAlum>=0?'+':''}${p.deltaAlum.toLocaleString()}</td>
                <td style="padding:6px 8px;text-align:right;color:${p.deltaPct>=0?'var(--verde)':'#c44'}">${p.deltaPct>=0?'+':''}${p.deltaPct}%</td>
                <td style="padding:6px 8px;text-align:right;color:${p.deltaPiezas>=0?'var(--verde)':'#c44'}">${p.deltaPiezas>=0?'+':''}${p.deltaPiezas.toLocaleString()}</td>
                <td style="padding:6px 8px;text-align:right;color:${p.deltaPctPiezas>=0?'var(--verde)':'#c44'}">${p.deltaPctPiezas>=0?'+':''}${p.deltaPctPiezas}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  cont.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px">
      ${tarjetas}
    </div>
    ${tablaComp}
    ${comparativo}
    <div style="text-align:center;margin-top:10px">
      <button class="btn btn-ghost btn-sm" onclick="initHistorico()">🔄 Refrescar</button>
    </div>
  `;
}

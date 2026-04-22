// ══════════════════════════════════════════════════════════════════════
// MATCHER: SUGERENCIAS DE EMPAQUE (v27)
// Cuando hay stock de una talla, sugiere qué alumnos esperan esa talla
// ══════════════════════════════════════════════════════════════════════

let matcherCache = {
  sugerencias: [],
  cargando: false,
};

async function cargarSugerenciasEmpaque(escuelaId) {
  const cont = document.getElementById('sugerencias-empaque-area');
  if (!cont) return;
  cont.innerHTML = '<div class="text-muted" style="padding:10px">Analizando stock vs alumnos...</div>';
  
  try {
    const [stock, alumnosEscuela] = await Promise.all([
      supaFetch('vw_bodega_stock', 'GET', null, '?limit=2000'),
      supaFetch('alumno', 'GET', null, 
        `?escuela_id=eq.${escuelaId}&temporada_id=eq.${registroCache.temporadaActual}&activo=eq.true&limit=2000`),
    ]);
    
    // Indexar stock disponible por talla_key
    const stockPorTalla = {};
    for (const s of stock) {
      stockPorTalla[s.talla_key] = s.stock_disponible || 0;
    }
    
    // Para cada alumno con estado_top o _bottom pendiente, ver si hay stock
    const sugerencias = [];
    const stockUsadoSimulado = {...stockPorTalla};
    
    for (const a of alumnosEscuela) {
      const necesidadT = a.estado_top === 'pendiente' && a.talla_top_key;
      const necesidadB = a.estado_bottom === 'pendiente' && a.talla_bottom_key;
      
      const stockT = necesidadT ? (stockUsadoSimulado[a.talla_top_key] || 0) : 0;
      const stockB = necesidadB ? (stockUsadoSimulado[a.talla_bottom_key] || 0) : 0;
      
      const puedeT = stockT > 0;
      const puedeB = stockB > 0;
      
      if ((necesidadT && puedeT) || (necesidadB && puedeB)) {
        sugerencias.push({
          alumno: a,
          puedeTop: puedeT && necesidadT,
          puedeBottom: puedeB && necesidadB,
          completo: (puedeT || !necesidadT) && (puedeB || !necesidadB),
        });
        // Reservar el stock simuladamente
        if (puedeT && necesidadT) stockUsadoSimulado[a.talla_top_key]--;
        if (puedeB && necesidadB) stockUsadoSimulado[a.talla_bottom_key]--;
      }
    }
    
    matcherCache.sugerencias = sugerencias;
    renderSugerenciasEmpaque();
  } catch(e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function renderSugerenciasEmpaque() {
  const cont = document.getElementById('sugerencias-empaque-area');
  if (!cont) return;
  
  const sug = matcherCache.sugerencias;
  if (sug.length === 0) {
    cont.innerHTML = `
      <div class="alert alert-info">
        No hay alumnos que se puedan empacar con el stock actual. Esto puede ser porque: 
        ① no hay alumnos pendientes, ② no hay stock de las tallas que necesitan, ③ los pendientes ya fueron empacados.
      </div>
    `;
    return;
  }
  
  const completos = sug.filter(s => s.completo).length;
  const parciales = sug.length - completos;
  
  cont.innerHTML = `
    <div class="alert alert-info" style="font-size:12px;margin-bottom:10px">
      <strong>${sug.length}</strong> alumnos podrían empacarse con el stock actual · 
      <strong style="color:var(--verde)">${completos}</strong> completos · 
      <strong style="color:var(--naranja)">${parciales}</strong> parciales
    </div>
    
    ${sug.length > 1 ? `
      <div style="margin-bottom:10px;text-align:right">
        <button class="btn btn-success btn-sm" onclick="empacarTodosSugeridos()" ${completos === 0 ? 'disabled' : ''}>
          ✓ Empacar ${completos} completos
        </button>
      </div>
    ` : ''}
    
    <div class="card" style="padding:0;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#F5F7FA">
            <th style="padding:6px 8px;text-align:left">Alumno</th>
            <th style="padding:6px 8px;text-align:center">Top</th>
            <th style="padding:6px 8px;text-align:center">Bottom</th>
            <th style="padding:6px 8px;text-align:center">Estado</th>
            <th style="padding:6px 8px;text-align:center">Acción</th>
          </tr>
        </thead>
        <tbody>
          ${sug.map((s, i) => {
            const a = s.alumno;
            const bg = s.completo ? '#DCF5E0' : '#FFF4D6';
            const estadoIcon = s.completo ? '✅✅' : (s.puedeTop ? '✅⏳' : '⏳✅');
            return `
              <tr style="border-top:1px solid #EEE;background:${bg}">
                <td style="padding:6px 8px">
                  <div style="font-weight:600">${a.nombre}</div>
                  <div style="font-size:10px;color:#666">${a.grado || '-'}</div>
                </td>
                <td style="padding:6px 8px;text-align:center">
                  <div style="font-family:monospace;font-weight:${s.puedeTop?'700':'400'};color:${s.puedeTop?'var(--azul)':'#888'}">${a.talla_top_key || '-'}</div>
                  ${s.puedeTop ? '<div style="font-size:10px;color:var(--verde)">✓ disponible</div>' : ''}
                </td>
                <td style="padding:6px 8px;text-align:center">
                  <div style="font-family:monospace;font-weight:${s.puedeBottom?'700':'400'};color:${s.puedeBottom?'var(--azul)':'#888'}">${a.talla_bottom_key || '-'}</div>
                  ${s.puedeBottom ? '<div style="font-size:10px;color:var(--verde)">✓ disponible</div>' : ''}
                </td>
                <td style="padding:6px 8px;text-align:center;font-size:14px">${estadoIcon}</td>
                <td style="padding:6px 8px;text-align:center">
                  <button class="btn-mini btn-mini-success" onclick="empacarSugerencia(${i})">📦 Empacar</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function empacarSugerencia(idx) {
  const sug = matcherCache.sugerencias[idx];
  if (!sug) return;
  const a = sug.alumno;
  
  const codMap = {
    'CAMISA':'C','BLUSA':'B','CAMISA_CELESTE':'CC','PANTALON':'P','PANTALON_BEIGE':'PB',
    'FALDA':'F','FALDA_BEIGE':'FB','FALDA_C.E':'FCE','SHORT':'S'
  };
  
  try {
    const now = new Date().toISOString();
    const patch = { actualizado_en: now };
    const movs = [];
    
    if (sug.puedeTop && a.prenda_top) {
      patch.estado_top = 'empacado';
      patch.empacado_top_en = now;
      movs.push({
        tipo: 'SALIDA_EMPAQUE',
        cod_prenda: codMap[a.prenda_top] || a.prenda_top.slice(0,3),
        nombre_prenda: a.prenda_top,
        talla_key: a.talla_top_key,
        cantidad: 1,
        alumno_id: a.id,
        escuela_id: a.escuela_id,
        observaciones: `Empacado para ${a.nombre}`
      });
    }
    if (sug.puedeBottom && a.prenda_bottom) {
      patch.estado_bottom = 'empacado';
      patch.empacado_bottom_en = now;
      movs.push({
        tipo: 'SALIDA_EMPAQUE',
        cod_prenda: codMap[a.prenda_bottom] || a.prenda_bottom.slice(0,3),
        nombre_prenda: a.prenda_bottom,
        talla_key: a.talla_bottom_key,
        cantidad: 1,
        alumno_id: a.id,
        escuela_id: a.escuela_id,
        observaciones: `Empacado para ${a.nombre}`
      });
    }
    
    await supaUpdate('alumno', a.id, patch);
    for (const m of movs) {
      await supaFetch('bodega_movimiento', 'POST', m);
    }
    
    // Refrescar
    await cargarSugerenciasEmpaque(a.escuela_id);
  } catch(e) { alert('Error: ' + e.message); }
}

async function empacarTodosSugeridos() {
  const completos = matcherCache.sugerencias.filter(s => s.completo);
  if (completos.length === 0) return;
  
  if (!confirm(`¿Empacar ${completos.length} alumnos completos automáticamente?\n\nEsto descontará el stock y los marcará como empacados.`)) return;
  
  let exitosos = 0;
  for (let i = 0; i < matcherCache.sugerencias.length; i++) {
    if (matcherCache.sugerencias[i].completo) {
      try {
        await empacarSugerencia(i);
        exitosos++;
      } catch(e) { /* sigue con el siguiente */ }
    }
  }
  alert(`✓ ${exitosos} alumnos empacados`);
}

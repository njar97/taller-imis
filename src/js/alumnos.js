// ══════════════════════════════════════════════════════════════════════
// ALUMNOS + EMPAQUE (v22)
// Se monta como sub-tab dentro de 📚 Pedidos
// ══════════════════════════════════════════════════════════════════════

let alumnosCache = {
  escuelaId: null,
  alumnos: [],
  filtroGrado: '',
  filtroNivel: '',
  filtroEstado: '', // 'pendiente'|'parcial'|'completo'|'entregado'
  busqueda: '',
  stockPorTalla: {}, // talla_key -> stock disponible
};

async function mostrarAlumnos(escuelaId) {
  alumnosCache.escuelaId = escuelaId;
  const cont = document.getElementById('registro-detalle-tabla');
  cont.innerHTML = '<div class="text-muted">Cargando alumnos...</div>';
  try {
    const [alumnos, stock] = await Promise.all([
      supaFetch('alumno', 'GET', null, 
        `?escuela_id=eq.${escuelaId}&temporada_id=eq.${registroCache.temporadaActual}&order=nivel,grado,nombre&limit=2000`),
      supaFetch('vw_bodega_stock', 'GET', null, '?limit=1000')
    ]);
    alumnosCache.alumnos = alumnos;
    // Indexar stock por talla_key
    alumnosCache.stockPorTalla = {};
    for (const s of stock) {
      alumnosCache.stockPorTalla[s.talla_key] = s.stock_disponible || 0;
    }
    renderAlumnosLista();
  } catch(e) {
    cont.innerHTML = `<div style="color:red">Error: ${e.message}</div>`;
  }
}

function renderAlumnosLista() {
  const cont = document.getElementById('registro-detalle-tabla');
  let list = alumnosCache.alumnos;
  
  // Filtros
  if (alumnosCache.filtroGrado) list = list.filter(a => a.grado === alumnosCache.filtroGrado);
  if (alumnosCache.filtroNivel) list = list.filter(a => a.nivel === alumnosCache.filtroNivel);
  if (alumnosCache.busqueda) {
    const q = alumnosCache.busqueda.toLowerCase();
    list = list.filter(a => (a.nombre||'').toLowerCase().includes(q));
  }
  if (alumnosCache.filtroEstado) {
    list = list.filter(a => {
      const t = a.estado_top, b = a.estado_bottom;
      if (alumnosCache.filtroEstado === 'pendiente') return t==='pendiente' && b==='pendiente';
      if (alumnosCache.filtroEstado === 'parcial') 
        return (t==='empacado' && b!=='empacado') || (b==='empacado' && t!=='empacado');
      if (alumnosCache.filtroEstado === 'completo') return t==='empacado' && b==='empacado';
      if (alumnosCache.filtroEstado === 'entregado') return t==='entregado' && b==='entregado';
      return true;
    });
  }
  
  // Estadísticas
  const tot = alumnosCache.alumnos.length;
  const completos = alumnosCache.alumnos.filter(a => a.estado_top==='empacado' && a.estado_bottom==='empacado').length;
  const parciales = alumnosCache.alumnos.filter(a => 
    (a.estado_top==='empacado' && a.estado_bottom!=='empacado') ||
    (a.estado_bottom==='empacado' && a.estado_top!=='empacado')
  ).length;
  
  // Grados únicos
  const grados = [...new Set(alumnosCache.alumnos.map(a => a.grado).filter(Boolean))].sort();
  const niveles = [...new Set(alumnosCache.alumnos.map(a => a.nivel).filter(Boolean))].sort();
  
  const header = `
    <div style="background:white;padding:8px;border-radius:8px;margin-bottom:10px">
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;margin-bottom:8px">
        <div>Total: <strong>${tot}</strong></div>
        <div style="color:var(--verde)">Completos: <strong>${completos}</strong></div>
        <div style="color:var(--naranja)">Parciales: <strong>${parciales}</strong></div>
        <div style="color:#888">Mostrando: <strong>${list.length}</strong></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <input type="text" placeholder="Buscar por nombre..." value="${alumnosCache.busqueda}"
          oninput="alumnosCache.busqueda = this.value; renderAlumnosLista()"
          style="flex:1;min-width:140px;padding:4px 8px;border:1px solid var(--borde);border-radius:4px">
        <select onchange="alumnosCache.filtroNivel = this.value; renderAlumnosLista()" style="padding:4px">
          <option value="">Todo nivel</option>
          ${niveles.map(n => `<option value="${n}" ${n===alumnosCache.filtroNivel?'selected':''}>${n}</option>`).join('')}
        </select>
        <select onchange="alumnosCache.filtroGrado = this.value; renderAlumnosLista()" style="padding:4px">
          <option value="">Todo grado</option>
          ${grados.map(g => `<option value="${g}" ${g===alumnosCache.filtroGrado?'selected':''}>${g}</option>`).join('')}
        </select>
        <select onchange="alumnosCache.filtroEstado = this.value; renderAlumnosLista()" style="padding:4px">
          <option value="">Todo estado</option>
          <option value="pendiente" ${alumnosCache.filtroEstado==='pendiente'?'selected':''}>❌❌ Pendiente</option>
          <option value="parcial" ${alumnosCache.filtroEstado==='parcial'?'selected':''}>✅❌ Parcial</option>
          <option value="completo" ${alumnosCache.filtroEstado==='completo'?'selected':''}>✅✅ Completo</option>
          <option value="entregado" ${alumnosCache.filtroEstado==='entregado'?'selected':''}>🚚 Entregado</option>
        </select>
      </div>
    </div>
  `;
  
  if (list.length === 0) {
    cont.innerHTML = header + '<div class="text-muted">Sin resultados.</div>';
    return;
  }
  
  // Limitar a 100 visibles para performance
  const visible = list.slice(0, 100);
  const hayMas = list.length > 100;
  
  const iconEstado = (e) => {
    if (e === 'empacado') return '✅';
    if (e === 'entregado') return '🚚';
    if (e === 'reservado') return '⏳';
    return '⬜';
  };
  
  const colorEstado = (t, b) => {
    if (t === 'entregado' && b === 'entregado') return '#EEE';
    if (t === 'empacado' && b === 'empacado') return '#DCF5E0';
    if (t === 'empacado' || b === 'empacado') return '#FFF4D6';
    return 'white';
  };
  
  const rows = visible.map(a => {
    const stockT = alumnosCache.stockPorTalla[a.talla_top_key] || 0;
    const stockB = alumnosCache.stockPorTalla[a.talla_bottom_key] || 0;
    const puedeT = stockT > 0 || a.estado_top === 'empacado' || a.estado_top === 'entregado';
    const puedeB = stockB > 0 || a.estado_bottom === 'empacado' || a.estado_bottom === 'entregado';
    const bg = colorEstado(a.estado_top, a.estado_bottom);
    
    return `
      <tr style="border-top:1px solid #EEE;background:${bg}">
        <td style="padding:4px 8px;font-size:12px">
          <div style="font-weight:600">${a.nombre}</div>
          <div style="color:#666;font-size:10px">${a.grado||'-'} · ${a.sexo==='F'?'♀':'♂'}</div>
        </td>
        <td style="padding:4px 8px;text-align:center">
          <div style="font-size:14px">${iconEstado(a.estado_top)}</div>
          <div style="font-size:10px;color:#666">${a.talla_top_key||'-'}</div>
          <div style="font-size:9px;color:${stockT>0?'var(--verde)':'#ccc'}">stock: ${stockT}</div>
        </td>
        <td style="padding:4px 8px;text-align:center">
          <div style="font-size:14px">${iconEstado(a.estado_bottom)}</div>
          <div style="font-size:10px;color:#666">${a.talla_bottom_key||'-'}</div>
          <div style="font-size:9px;color:${stockB>0?'var(--verde)':'#ccc'}">stock: ${stockB}</div>
        </td>
        <td style="padding:4px 8px;text-align:center">
          <button class="btn-mini btn-mini-primary" onclick="abrirEmpaqueAlumno('${a.id}')">📦</button>
        </td>
      </tr>
    `;
  }).join('');
  
  cont.innerHTML = header + `
    <div class="card" style="padding:0;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#F5F7FA">
            <th style="padding:6px 8px;text-align:left">Alumno</th>
            <th style="padding:6px 8px;text-align:center">Top</th>
            <th style="padding:6px 8px;text-align:center">Bottom</th>
            <th style="padding:6px 8px;text-align:center">Empacar</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${hayMas ? `<div style="padding:8px;text-align:center;color:#888;font-size:12px">... ${list.length-100} alumnos más. Usá filtros para ver más.</div>` : ''}
    </div>
  `;
}

// ─── Modal empaque individual ──────────────────────────────────────
let empaqueCache = { alumnoActual: null };

async function abrirEmpaqueAlumno(alumnoId) {
  const alumno = alumnosCache.alumnos.find(a => a.id === alumnoId);
  if (!alumno) return;
  empaqueCache.alumnoActual = alumno;
  
  const stockT = alumnosCache.stockPorTalla[alumno.talla_top_key] || 0;
  const stockB = alumnosCache.stockPorTalla[alumno.talla_bottom_key] || 0;
  
  document.getElementById('emp-alumno-nombre').textContent = alumno.nombre;
  document.getElementById('emp-alumno-info').textContent = 
    `${alumno.grado || ''} · ${alumno.nivel || ''} · ${alumno.sexo === 'F' ? '♀ Niña' : '♂ Niño'}`;
  
  const estadoLabel = {pendiente:'⬜ Pendiente',reservado:'⏳ Reservado',empacado:'✅ Empacado',entregado:'🚚 Entregado',cancelado:'✗ Cancelado'};
  
  document.getElementById('emp-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="card" style="padding:10px;border:2px solid ${alumno.estado_top==='empacado'?'var(--verde)':'var(--borde)'}">
        <div style="font-weight:600;font-size:13px">👕 ${alumno.prenda_top || 'Top'}</div>
        <div style="font-size:20px;margin:6px 0;font-family:monospace;color:var(--azul);font-weight:700">${alumno.talla_top_key || '-'}</div>
        <div style="font-size:11px;margin-bottom:4px">Estado: ${estadoLabel[alumno.estado_top]||alumno.estado_top}</div>
        <div style="font-size:11px;color:${stockT>0?'var(--verde)':'#c44'};margin-bottom:8px">Stock: <strong>${stockT}</strong></div>
        ${alumno.estado_top === 'pendiente' ? 
          (stockT > 0 
            ? `<button class="btn btn-success btn-sm" style="width:100%" onclick="marcarEmpacado('top')">✅ Empacar top</button>`
            : `<button class="btn btn-sm" style="width:100%" disabled>Sin stock</button>`) :
         alumno.estado_top === 'empacado' ? 
          `<button class="btn btn-primary btn-sm" style="width:100%" onclick="marcarEntregado('top')">🚚 Marcar entregado</button>` :
          `<button class="btn btn-ghost btn-sm" style="width:100%" disabled>Ya ${alumno.estado_top}</button>`}
      </div>
      
      <div class="card" style="padding:10px;border:2px solid ${alumno.estado_bottom==='empacado'?'var(--verde)':'var(--borde)'}">
        <div style="font-weight:600;font-size:13px">👖 ${alumno.prenda_bottom || 'Bottom'}</div>
        <div style="font-size:20px;margin:6px 0;font-family:monospace;color:var(--azul);font-weight:700">${alumno.talla_bottom_key || '-'}</div>
        <div style="font-size:11px;margin-bottom:4px">Estado: ${estadoLabel[alumno.estado_bottom]||alumno.estado_bottom}</div>
        <div style="font-size:11px;color:${stockB>0?'var(--verde)':'#c44'};margin-bottom:8px">Stock: <strong>${stockB}</strong></div>
        ${alumno.estado_bottom === 'pendiente' ? 
          (stockB > 0 
            ? `<button class="btn btn-success btn-sm" style="width:100%" onclick="marcarEmpacado('bottom')">✅ Empacar bottom</button>`
            : `<button class="btn btn-sm" style="width:100%" disabled>Sin stock</button>`) :
         alumno.estado_bottom === 'empacado' ? 
          `<button class="btn btn-primary btn-sm" style="width:100%" onclick="marcarEntregado('bottom')">🚚 Marcar entregado</button>` :
          `<button class="btn btn-ghost btn-sm" style="width:100%" disabled>Ya ${alumno.estado_bottom}</button>`}
      </div>
    </div>
    ${(alumno.estado_top==='pendiente' && alumno.estado_bottom==='pendiente' && stockT>0 && stockB>0) ? `
      <div style="margin-top:10px;text-align:center">
        <button class="btn btn-success" onclick="empacarAmbos()">✅✅ Empacar completo (ambos)</button>
      </div>` : ''}
  `;
  
  document.getElementById('bodega-empaque-modal').style.display = 'flex';
}

function cerrarEmpaque() {
  document.getElementById('bodega-empaque-modal').style.display = 'none';
  empaqueCache.alumnoActual = null;
}

async function marcarEmpacado(tipo) {
  const a = empaqueCache.alumnoActual;
  if (!a) return;
  
  const prenda = tipo === 'top' ? a.prenda_top : a.prenda_bottom;
  const talla = tipo === 'top' ? a.talla_top_key : a.talla_bottom_key;
  if (!prenda || !talla) { alert('El alumno no tiene talla asignada'); return; }
  
  const codMap = {
    'CAMISA':'C','BLUSA':'B','CAMISA_CELESTE':'CC','PANTALON':'P','PANTALON_BEIGE':'PB',
    'FALDA':'F','FALDA_BEIGE':'FB','FALDA_C.E':'FCE','SHORT':'S'
  };
  const codPrenda = codMap[prenda] || prenda.slice(0,3);
  
  try {
    // 1. Actualizar alumno
    const patch = tipo === 'top' 
      ? { estado_top: 'empacado', empacado_top_en: new Date().toISOString() }
      : { estado_bottom: 'empacado', empacado_bottom_en: new Date().toISOString() };
    patch.actualizado_en = new Date().toISOString();
    await supaUpdate('alumno', a.id, patch);
    
    // 2. Registrar salida de bodega
    await supaFetch('bodega_movimiento', 'POST', {
      tipo: 'SALIDA_EMPAQUE',
      cod_prenda: codPrenda, nombre_prenda: prenda, talla_key: talla,
      cantidad: 1, alumno_id: a.id, escuela_id: a.escuela_id,
      observaciones: `Empacado para ${a.nombre}`
    });
    
    // Actualizar cache local
    Object.assign(a, patch);
    alumnosCache.stockPorTalla[talla] = Math.max(0, (alumnosCache.stockPorTalla[talla]||0) - 1);
    
    cerrarEmpaque();
    renderAlumnosLista();
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

async function marcarEntregado(tipo) {
  const a = empaqueCache.alumnoActual;
  if (!a) return;
  const prenda = tipo === 'top' ? a.prenda_top : a.prenda_bottom;
  const talla = tipo === 'top' ? a.talla_top_key : a.talla_bottom_key;
  const codMap = {
    'CAMISA':'C','BLUSA':'B','CAMISA_CELESTE':'CC','PANTALON':'P','PANTALON_BEIGE':'PB',
    'FALDA':'F','FALDA_BEIGE':'FB','FALDA_C.E':'FCE','SHORT':'S'
  };
  const codPrenda = codMap[prenda] || prenda.slice(0,3);
  
  try {
    const patch = tipo === 'top' ? { estado_top: 'entregado' } : { estado_bottom: 'entregado' };
    patch.actualizado_en = new Date().toISOString();
    await supaUpdate('alumno', a.id, patch);
    await supaFetch('bodega_movimiento', 'POST', {
      tipo: 'SALIDA_ENTREGA',
      cod_prenda: codPrenda, nombre_prenda: prenda, talla_key: talla,
      cantidad: 1, alumno_id: a.id, escuela_id: a.escuela_id,
      observaciones: `Entregado a ${a.nombre}`
    });
    Object.assign(a, patch);
    cerrarEmpaque();
    renderAlumnosLista();
  } catch(e) { alert('Error: ' + e.message); }
}

async function empacarAmbos() {
  const a = empaqueCache.alumnoActual;
  if (!a) return;
  await marcarEmpacado('top');
  // Recuperar actualizado
  empaqueCache.alumnoActual = alumnosCache.alumnos.find(x => x.id === a.id);
  if (empaqueCache.alumnoActual && empaqueCache.alumnoActual.estado_bottom === 'pendiente') {
    await marcarEmpacado('bottom');
  }
}

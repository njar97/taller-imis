// ══════════════════════════════════════════════════════════════════════
// EXPORTADOR (v30)
// Exportar datos a CSV (Excel-compatible)
// ══════════════════════════════════════════════════════════════════════

function escapeCSVValue(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Si contiene coma, comilla o salto de linea, envolver en comillas
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function arrayToCSV(rows, columns) {
  // columns: [{key, label}]
  const header = columns.map(c => escapeCSVValue(c.label)).join(',');
  const data = rows.map(r => 
    columns.map(c => escapeCSVValue(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(',')
  );
  // BOM para UTF-8 en Excel
  return '\uFEFF' + header + '\n' + data.join('\n');
}

function descargarArchivo(nombre, contenido, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([contenido], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fechaHoyISO() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

// ─── EXPORTAR ALUMNOS (replica de la hoja BASE del Excel original) ──
async function exportarAlumnos(filtros = {}) {
  try {
    let query = '?activo=eq.true&order=nombre&limit=50000';
    if (filtros.escuelaId) query += `&escuela_id=eq.${filtros.escuelaId}`;
    if (filtros.temporadaId) query += `&temporada_id=eq.${filtros.temporadaId}`;
    
    const [alumnos, escuelas] = await Promise.all([
      supaFetch('alumno', 'GET', null, query),
      supaFetch('escuela', 'GET', null, '?limit=500'),
    ]);
    
    const escMap = {};
    for (const e of escuelas) escMap[e.id] = e;
    
    if (alumnos.length === 0) { alert('No hay alumnos para exportar con esos filtros'); return; }
    
    const cols = [
      { key: 'estado_top_display', label: 'EstadoT', get: r => r.estado_top === 'empacado' || r.estado_top === 'entregado' ? 'OK' : (r.talla_top_key || '') },
      { key: 'estado_bottom_display', label: 'EstadoP', get: r => r.estado_bottom === 'empacado' || r.estado_bottom === 'entregado' ? 'OK' : (r.talla_bottom_key || '') },
      { key: 'sexo_flag', label: 'SexoFlag', get: r => r.sexo === 'F' ? '.' : '' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'prenda_top', label: 'PRENDAT' },
      { key: 'talla_top', label: 'TALLAT', get: r => extraerTallaNum(r.talla_top_key, r.prenda_top) },
      { key: 'largo_top', label: 'LARGOT', get: r => '' },
      { key: 'key_top', label: 'KEYT', get: r => r.talla_top_key || '' },
      { key: 'prenda_bottom', label: 'PRENDAP' },
      { key: 'talla_bottom', label: 'TALLAP', get: r => extraerTallaNum(r.talla_bottom_key, r.prenda_bottom) },
      { key: 'largo_bottom', label: 'LargoP', get: r => extraerLargo(r.talla_bottom_key, r.prenda_bottom) },
      { key: 'key_bottom', label: 'KEYP', get: r => r.talla_bottom_key || '' },
      { key: 'grado', label: 'Grado' },
      { key: 'centro', label: 'Centro', get: r => { const e = escMap[r.escuela_id]; return e ? (e.alias || e.nombre) : ''; } },
      { key: 'codigo_cde', label: 'CDE', get: r => { const e = escMap[r.escuela_id]; return e ? e.codigo_cde : ''; } },
      { key: 'nivel', label: 'NIVEL' },
      { key: 'ciclo', label: 'CICLO' },
      { key: 'grupo_prod', label: 'C.E', get: r => { const e = escMap[r.escuela_id]; return e ? (e.grupo_produccion || '') : ''; } },
      { key: 'observaciones', label: 'Observaciones' },
    ];
    
    const csv = arrayToCSV(alumnos, cols);
    const nombre = `alumnos_${fechaHoyISO()}.csv`;
    descargarArchivo(nombre, csv);
  } catch(e) { alert('Error: ' + e.message); }
}

// Extraer parte numérica de una KEY (ej: "C14" -> "14", "P1075" -> "10")
function extraerTallaNum(key, prenda) {
  if (!key) return '';
  const codMap = {
    'CAMISA':'C','BLUSA':'B','CAMISA_CELESTE':'CC',
    'PANTALON':'P','PANTALON_BEIGE':'PB',
    'FALDA':'F','FALDA_BEIGE':'FB','FALDA_C.E':'FCE','SHORT':'S',
  };
  const cod = codMap[prenda] || '';
  let resto = cod ? key.slice(cod.length) : key.replace(/^[A-Z]+/, '');
  // Para bottoms (pantalon/falda) con largo: la primera parte es talla, resto es largo
  // Ej: P1075 -> talla 10, largo 75. Heurística: 4 dígitos = 2+2, 5 dígitos = 2+3 o 3+2
  if (prenda === 'PANTALON' || prenda === 'PANTALON_BEIGE' || prenda === 'FALDA' || prenda === 'FALDA_BEIGE' || prenda === 'FALDA_C.E') {
    if (resto.length >= 4) {
      // Asumir talla 2 dígitos + largo resto
      return resto.slice(0, 2);
    }
    if (resto.length === 3) {
      // Ej: F635 -> talla 6, largo 35
      return resto.slice(0, 1);
    }
  }
  return resto;
}

function extraerLargo(key, prenda) {
  if (!key) return '';
  if (prenda !== 'PANTALON' && prenda !== 'PANTALON_BEIGE' && prenda !== 'FALDA' && prenda !== 'FALDA_BEIGE' && prenda !== 'FALDA_C.E') return '';
  const codMap = {
    'PANTALON':'P','PANTALON_BEIGE':'PB',
    'FALDA':'F','FALDA_BEIGE':'FB','FALDA_C.E':'FCE',
  };
  const cod = codMap[prenda] || '';
  const resto = cod ? key.slice(cod.length) : key;
  if (resto.length >= 4) return resto.slice(2);
  if (resto.length === 3) return resto.slice(1);
  return '';
}

// ─── EXPORTAR PEDIDOS (por talla) ───────────────────────────────────
async function exportarPedidos(filtros = {}) {
  try {
    let query = '?order=nivel,cod_prenda,talla_key&limit=5000';
    if (filtros.escuelaId) query += `&escuela_id=eq.${filtros.escuelaId}`;
    
    const [pedidos, escuelas] = await Promise.all([
      supaFetch('pedido', 'GET', null, query),
      supaFetch('escuela', 'GET', null, '?limit=500'),
    ]);
    
    const escMap = {};
    for (const e of escuelas) escMap[e.id] = e;
    
    if (pedidos.length === 0) { alert('No hay pedidos para exportar'); return; }
    
    const cols = [
      { key: 'escuela', label: 'Escuela', get: r => { const e = escMap[r.escuela_id]; return e ? e.nombre : ''; } },
      { key: 'codigo_cde', label: 'CDE', get: r => { const e = escMap[r.escuela_id]; return e ? e.codigo_cde : ''; } },
      { key: 'nivel', label: 'Nivel' },
      { key: 'nombre_prenda', label: 'Prenda' },
      { key: 'cod_prenda', label: 'CodPrenda' },
      { key: 'talla_key', label: 'Talla' },
      { key: 'cantidad_solicitada', label: 'Solicitada' },
      { key: 'cantidad_entregada', label: 'Entregada' },
      { key: 'pendiente', label: 'Pendiente', get: r => (r.cantidad_solicitada||0) - (r.cantidad_entregada||0) },
      { key: 'uniforme', label: 'Uniforme' },
      { key: 'fuente', label: 'Fuente' },
    ];
    
    const csv = arrayToCSV(pedidos, cols);
    descargarArchivo(`pedidos_${fechaHoyISO()}.csv`, csv);
  } catch(e) { alert('Error: ' + e.message); }
}

// ─── EXPORTAR BODEGA STOCK ──────────────────────────────────────────
async function exportarStockBodega() {
  try {
    const stock = await supaFetch('vw_bodega_stock', 'GET', null, '?order=nombre_prenda,talla_key&limit=5000');
    if (stock.length === 0) { alert('No hay stock para exportar'); return; }
    
    const cols = [
      { key: 'nombre_prenda', label: 'Prenda' },
      { key: 'cod_prenda', label: 'Código' },
      { key: 'talla_key', label: 'Talla' },
      { key: 'total_entrado', label: 'Entrado' },
      { key: 'total_salido', label: 'Salido' },
      { key: 'reservado_empaque', label: 'Reservado' },
      { key: 'stock_actual', label: 'Stock' },
      { key: 'stock_disponible', label: 'Disponible' },
    ];
    
    descargarArchivo(`bodega_stock_${fechaHoyISO()}.csv`, arrayToCSV(stock, cols));
  } catch(e) { alert('Error: ' + e.message); }
}

// ─── EXPORTAR MOVIMIENTOS BODEGA ────────────────────────────────────
async function exportarMovimientosBodega() {
  try {
    const movs = await supaFetch('bodega_movimiento', 'GET', null, '?order=creado_en.desc&limit=5000');
    if (movs.length === 0) { alert('No hay movimientos para exportar'); return; }
    
    const cols = [
      { key: 'fecha', label: 'Fecha' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'nombre_prenda', label: 'Prenda' },
      { key: 'talla_key', label: 'Talla' },
      { key: 'cantidad', label: 'Cantidad' },
      { key: 'usuario', label: 'Usuario' },
      { key: 'observaciones', label: 'Observaciones' },
      { key: 'creado_en', label: 'CreadoEn' },
    ];
    
    descargarArchivo(`bodega_movimientos_${fechaHoyISO()}.csv`, arrayToCSV(movs, cols));
  } catch(e) { alert('Error: ' + e.message); }
}

// ─── MODAL DE EXPORTACIONES (centralizado) ──────────────────────────
function abrirModalExport() {
  const modal = document.getElementById('export-modal');
  if (!modal) return;
  
  // Llenar selectores con escuelas y temporadas actuales
  const selEsc = document.getElementById('export-escuela');
  const selTemp = document.getElementById('export-temporada');
  
  if (selEsc) {
    const escs = Object.values(alumnosGlobalCache.escuelas || {}).sort((a,b) => a.nombre.localeCompare(b.nombre));
    selEsc.innerHTML = '<option value="">— Todas las escuelas —</option>' + 
      escs.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');
  }
  if (selTemp) {
    const temps = registroCache.temporadas || [];
    selTemp.innerHTML = '<option value="">— Toda temporada —</option>' + 
      temps.map(t => `<option value="${t.id}">${t.codigo}</option>`).join('');
  }
  
  modal.style.display = 'flex';
}

function cerrarModalExport() {
  const modal = document.getElementById('export-modal');
  if (modal) modal.style.display = 'none';
}

function ejecutarExport(tipo) {
  const escuelaId = document.getElementById('export-escuela')?.value || null;
  const temporadaId = document.getElementById('export-temporada')?.value || null;
  
  if (tipo === 'alumnos') exportarAlumnos({ escuelaId, temporadaId });
  else if (tipo === 'pedidos') exportarPedidos({ escuelaId });
  else if (tipo === 'stock') exportarStockBodega();
  else if (tipo === 'movimientos') exportarMovimientosBodega();
  
  cerrarModalExport();
}

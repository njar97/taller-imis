// ══════════════════════════════════════════════════════════════════════
// IMPORTACION MASIVA DE ALUMNOS (v24)
// Pega desde Excel/CSV o carga archivo. Valida y carga en lote.
// ══════════════════════════════════════════════════════════════════════

let importCache = {
  filas: [],           // filas parseadas (preview)
  errores: [],         // problemas detectados por fila
  columnas: {},        // mapeo col Excel -> campo sistema
  encabezados: [],     // headers detectados
  escuelaId: null,
};

function abrirImportacion(escuelaId) {
  importCache = { filas: [], errores: [], columnas: {}, encabezados: [], escuelaId };
  const modal = document.getElementById('import-alumnos-modal');
  if (!modal) return;
  document.getElementById('import-paso1').style.display = 'block';
  document.getElementById('import-paso2').style.display = 'none';
  document.getElementById('import-paso3').style.display = 'none';
  document.getElementById('import-textarea').value = '';
  document.getElementById('import-file').value = '';
  modal.style.display = 'flex';
}

function cerrarImportacion() {
  const modal = document.getElementById('import-alumnos-modal');
  if (modal) modal.style.display = 'none';
}

// Parsear texto pegado (TSV o CSV)
function parsearTexto(texto) {
  const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lineas.length === 0) return { headers: [], filas: [] };
  
  // Detectar separador: tab (más común al pegar de Excel) o coma
  const prim = lineas[0];
  const sep = prim.includes('\t') ? '\t' : (prim.split(',').length > prim.split(';').length ? ',' : ';');
  
  const headers = lineas[0].split(sep).map(h => h.trim().toLowerCase());
  const filas = lineas.slice(1).map(l => {
    const cols = l.split(sep).map(c => c.trim());
    const obj = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = cols[i] || '';
    return obj;
  });
  return { headers, filas };
}

async function procesarArchivo() {
  const fileInput = document.getElementById('import-file');
  const file = fileInput.files[0];
  if (!file) { alert('Elegí un archivo'); return; }
  
  try {
    const texto = await file.text();
    document.getElementById('import-textarea').value = texto;
    procesarTexto();
  } catch(e) { alert('Error al leer archivo: ' + e.message); }
}

function procesarTexto() {
  const texto = document.getElementById('import-textarea').value;
  if (!texto.trim()) { alert('Pegá los datos primero'); return; }
  
  const { headers, filas } = parsearTexto(texto);
  
  if (filas.length === 0) { alert('No se detectaron filas de datos'); return; }
  
  importCache.encabezados = headers;
  importCache.filas = filas;
  
  // Mapeo automático por nombre de columna (flexible)
  const mapeo = detectarMapeo(headers);
  importCache.columnas = mapeo;
  
  document.getElementById('import-paso1').style.display = 'none';
  document.getElementById('import-paso2').style.display = 'block';
  renderPaso2Mapeo();
}

function detectarMapeo(headers) {
  // Mapeo inteligente: intenta matchear nombres comunes
  const mapa = {};
  const patronesCampo = {
    nombre:           ['nombre', 'nombres', 'alumno', 'name', 'estudiante'],
    sexo:             ['sexo', 'sexoflag', 'sexo_flag', 'genero', 'sex'],
    grado:            ['grado', 'grade', 'curso', 'seccion'],
    prenda_top:       ['prendat', 'prenda_top', 'prenda t', 'prendat', 'prenda_t'],
    talla_top:        ['tallat', 'talla_top', 'talla t', 'tallat', 'talla_t'],
    largo_top:        ['largot', 'largo_top', 'largo t'],
    prenda_bottom:    ['prendap', 'prenda_bottom', 'prenda p', 'prenda_p'],
    talla_bottom:     ['tallap', 'talla_bottom', 'talla p', 'talla_p'],
    largo_bottom:     ['largop', 'largo_p', 'largo bottom', 'largo_bottom'],
    key_top:          ['keyt', 'key_top', 'key t'],
    key_bottom:       ['keyp', 'key_bottom', 'key p'],
    observaciones:    ['obs', 'observaciones', 'observacion', 'notas', 'detallet', 'detallep', 'detalle'],
    estado_top:       ['estadot', 'estado_top', 'estado_t'],
    estado_bottom:    ['estadop', 'estado_bottom', 'estado_p'],
  };
  
  for (const [campo, patrones] of Object.entries(patronesCampo)) {
    for (const h of headers) {
      const hn = h.toLowerCase().replace(/[._\s-]/g, '');
      if (patrones.some(p => hn === p.replace(/[._\s-]/g, '') || hn.includes(p.replace(/[._\s-]/g, '')))) {
        mapa[campo] = h;
        break;
      }
    }
  }
  return mapa;
}

function renderPaso2Mapeo() {
  const cont = document.getElementById('import-mapeo-contenido');
  const { encabezados, columnas, filas } = importCache;
  
  const opts = '<option value="">— ignorar —</option>' + 
    encabezados.map(h => `<option value="${h}">${h}</option>`).join('');
  
  const campos = [
    { k:'nombre',        l:'Nombre',              req:true },
    { k:'sexo',          l:'Sexo (F/M o . = niña)', req:false },
    { k:'grado',         l:'Grado',               req:false },
    { k:'prenda_top',    l:'Prenda TOP',          req:false },
    { k:'talla_top',     l:'Talla TOP (num)',     req:false },
    { k:'largo_top',     l:'Largo TOP',           req:false },
    { k:'key_top',       l:'KEY TOP (completo)',  req:false, note:'Si lo das, ignora prenda+talla arriba' },
    { k:'prenda_bottom', l:'Prenda BOTTOM',       req:false },
    { k:'talla_bottom',  l:'Talla BOTTOM',        req:false },
    { k:'largo_bottom',  l:'Largo BOTTOM',        req:false },
    { k:'key_bottom',    l:'KEY BOTTOM',          req:false, note:'Si lo das, ignora prenda+talla arriba' },
    { k:'observaciones', l:'Observaciones',       req:false },
    { k:'estado_top',    l:'Estado TOP (OK=empacado)', req:false },
    { k:'estado_bottom', l:'Estado BOTTOM',       req:false },
  ];
  
  const defaultGrado = (tallajeCache && tallajeCache.grado) || '';
  
  cont.innerHTML = `
    <div class="alert alert-info" style="font-size:12px;margin-bottom:10px">
      ${filas.length} filas detectadas. Revisá el mapeo de columnas y luego previsualizá.
    </div>
    
    <div class="card" style="padding:10px;margin-bottom:10px">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Valores por defecto (si faltan en las filas)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="field">
          <label style="font-size:11px">Grado por defecto</label>
          <input type="text" id="import-default-grado" value="${defaultGrado}" placeholder="ej: 1A">
        </div>
        <div class="field">
          <label style="font-size:11px">Nivel por defecto</label>
          <select id="import-default-nivel">
            <option value="">— auto desde grado —</option>
            <option value="PARV">PARV</option>
            <option value="BASICA">BASICA</option>
            <option value="BACH">BACH</option>
            <option value="OTRO">OTRO</option>
          </select>
        </div>
      </div>
    </div>
    
    <div class="card" style="padding:10px">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Mapeo de columnas</div>
      <table style="width:100%;font-size:12px">
        ${campos.map(c => `
          <tr>
            <td style="padding:4px 6px;width:40%">
              ${c.l}${c.req ? ' <span style="color:#c44">*</span>' : ''}
              ${c.note ? `<div style="font-size:10px;color:#888">${c.note}</div>` : ''}
            </td>
            <td style="padding:4px 6px">
              <select onchange="importCache.columnas['${c.k}']=this.value" style="width:100%;padding:4px">
                ${opts.replace(`value="${columnas[c.k]||''}"`, `value="${columnas[c.k]||''}" selected`)}
              </select>
            </td>
          </tr>
        `).join('')}
      </table>
    </div>
    
    <div style="margin-top:10px;display:flex;gap:8px">
      <button class="btn btn-ghost" onclick="volverPaso1()">← Volver</button>
      <button class="btn btn-primary" style="flex:1" onclick="previsualizarImportacion()">👁 Previsualizar y validar →</button>
    </div>
  `;
  
  // Aplicar valores seleccionados correctamente (el replace de arriba es tricky)
  for (const c of campos) {
    const sel = cont.querySelector(`select[onchange*="${c.k}"]`);
    if (sel && columnas[c.k]) sel.value = columnas[c.k];
  }
}

function volverPaso1() {
  document.getElementById('import-paso1').style.display = 'block';
  document.getElementById('import-paso2').style.display = 'none';
  document.getElementById('import-paso3').style.display = 'none';
}

function previsualizarImportacion() {
  const { filas, columnas } = importCache;
  const defaultGrado = document.getElementById('import-default-grado').value.trim();
  const defaultNivel = document.getElementById('import-default-nivel').value;
  
  if (!columnas.nombre) { alert('El campo Nombre es obligatorio'); return; }
  
  const procesadas = [];
  const errores = [];
  
  filas.forEach((fila, idx) => {
    const getCol = (campo) => {
      const colName = columnas[campo];
      return colName ? (fila[colName] || '').trim() : '';
    };
    
    const nombre = getCol('nombre');
    if (!nombre) {
      errores.push({ fila: idx + 1, error: 'Sin nombre' });
      return;
    }
    
    // Sexo: '.' = niña en Excel legacy
    let sexo = getCol('sexo');
    if (sexo === '.') sexo = 'F';
    else if (sexo.toUpperCase() === 'F' || sexo.toLowerCase() === 'niña' || sexo.toLowerCase() === 'niñ') sexo = 'F';
    else if (sexo.toUpperCase() === 'M' || sexo.toLowerCase() === 'niño' || sexo.toLowerCase() === 'nino') sexo = 'M';
    else sexo = null;
    
    const grado = getCol('grado') || defaultGrado || null;
    const nivel = defaultNivel || (grado ? nivelDesdeGrado(grado) : null);
    
    // Top
    let prenda_top = getCol('prenda_top').toUpperCase() || null;
    let talla_top_key = getCol('key_top') || null;
    if (!talla_top_key && prenda_top) {
      const t = getCol('talla_top');
      const l = getCol('largo_top');
      talla_top_key = calcularKey(prenda_top, t, l);
    } else if (talla_top_key) {
      // Si dieron la KEY directa, derivar prenda desde el prefijo
      if (!prenda_top) prenda_top = prendaDesdeKey(talla_top_key);
    }
    
    // Bottom
    let prenda_bottom = getCol('prenda_bottom').toUpperCase() || null;
    let talla_bottom_key = getCol('key_bottom') || null;
    if (!talla_bottom_key && prenda_bottom) {
      const t = getCol('talla_bottom');
      const l = getCol('largo_bottom');
      talla_bottom_key = calcularKey(prenda_bottom, t, l);
    } else if (talla_bottom_key) {
      if (!prenda_bottom) prenda_bottom = prendaDesdeKey(talla_bottom_key);
    }
    
    // Estados (del Excel: "OK" = empacado, cualquier otro = pendiente)
    const est_t = getCol('estado_top');
    const est_b = getCol('estado_bottom');
    const estado_top = est_t === 'OK' ? 'empacado' : 'pendiente';
    const estado_bottom = est_b === 'OK' ? 'empacado' : 'pendiente';
    
    procesadas.push({
      fila: idx + 1,
      nombre, sexo, grado, nivel,
      prenda_top, talla_top_key: talla_top_key || null,
      prenda_bottom, talla_bottom_key: talla_bottom_key || null,
      estado_top, estado_bottom,
      observaciones: getCol('observaciones') || null,
    });
  });
  
  importCache.procesadas = procesadas;
  importCache.errores = errores;
  
  document.getElementById('import-paso2').style.display = 'none';
  document.getElementById('import-paso3').style.display = 'block';
  renderPaso3Preview();
}

// Derivar prenda desde una KEY tipo "C14", "PB1795", "FCE635"
function prendaDesdeKey(key) {
  if (!key) return null;
  const k = key.toUpperCase();
  if (k.startsWith('CC')) return 'CAMISA_CELESTE';
  if (k.startsWith('PB')) return 'PANTALON_BEIGE';
  if (k.startsWith('FB')) return 'FALDA_BEIGE';
  if (k.startsWith('FCE')) return 'FALDA_C.E';
  if (k.startsWith('C')) return 'CAMISA';
  if (k.startsWith('B')) return 'BLUSA';
  if (k.startsWith('P')) return 'PANTALON';
  if (k.startsWith('F')) return 'FALDA';
  if (k.startsWith('S')) return 'SHORT';
  return null;
}

function renderPaso3Preview() {
  const cont = document.getElementById('import-preview-contenido');
  const { procesadas, errores } = importCache;
  
  const ok = procesadas.length;
  const err = errores.length;
  
  const previewRows = procesadas.slice(0, 20);
  
  cont.innerHTML = `
    <div class="alert alert-info" style="font-size:12px">
      <strong>${ok}</strong> filas OK ${err > 0 ? `· <span style="color:#c44"><strong>${err}</strong> con errores</span>` : ''}
    </div>
    
    ${err > 0 ? `
      <div class="card" style="padding:8px;margin-bottom:10px;background:#FFF4F0">
        <div style="font-weight:600;font-size:12px;color:#c44;margin-bottom:6px">Errores (se omiten):</div>
        ${errores.slice(0, 10).map(e => `<div style="font-size:11px">Fila ${e.fila}: ${e.error}</div>`).join('')}
        ${err > 10 ? `<div style="font-size:11px;color:#888">...y ${err-10} más</div>` : ''}
      </div>
    ` : ''}
    
    <div class="card" style="padding:0;overflow:auto;max-height:400px">
      <div style="background:#F5F7FA;padding:6px 10px;font-weight:600;font-size:13px">Preview (primeras 20 filas)</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="background:#FAFAFA;position:sticky;top:0">
            <th style="padding:4px 6px;text-align:left">Nombre</th>
            <th style="padding:4px 6px">Sexo</th>
            <th style="padding:4px 6px">Grado</th>
            <th style="padding:4px 6px">Top</th>
            <th style="padding:4px 6px">Bottom</th>
          </tr>
        </thead>
        <tbody>
          ${previewRows.map(p => `
            <tr style="border-top:1px solid #EEE">
              <td style="padding:3px 6px;font-size:11px">${p.nombre}</td>
              <td style="padding:3px 6px;text-align:center">${p.sexo === 'F' ? '♀' : (p.sexo === 'M' ? '♂' : '—')}</td>
              <td style="padding:3px 6px;text-align:center">${p.grado || '—'}</td>
              <td style="padding:3px 6px;font-family:monospace;color:${p.talla_top_key?'var(--azul)':'#ccc'}">${p.talla_top_key || '—'}</td>
              <td style="padding:3px 6px;font-family:monospace;color:${p.talla_bottom_key?'var(--azul)':'#ccc'}">${p.talla_bottom_key || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${ok > 20 ? `<div style="padding:6px;text-align:center;color:#888;font-size:11px">...y ${ok-20} filas más</div>` : ''}
    </div>
    
    <div style="margin-top:12px;display:flex;gap:8px">
      <button class="btn btn-ghost" onclick="volverPaso2()">← Volver al mapeo</button>
      <button class="btn btn-success" style="flex:1" onclick="ejecutarImportacion()">✓ Importar ${ok} alumnos</button>
    </div>
  `;
}

function volverPaso2() {
  document.getElementById('import-paso2').style.display = 'block';
  document.getElementById('import-paso3').style.display = 'none';
}

async function ejecutarImportacion() {
  const { procesadas, escuelaId } = importCache;
  if (!procesadas || procesadas.length === 0) { alert('Nada para importar'); return; }
  if (!escuelaId) { alert('Falta la escuela'); return; }
  if (!registroCache.temporadaActual) { alert('Falta la temporada'); return; }
  
  if (!confirm(`¿Importar ${procesadas.length} alumnos a esta escuela?`)) return;
  
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Importando...';
  
  let exitosos = 0;
  let fallidos = 0;
  const fallos = [];
  
  // Procesar en batches de 50 para no saturar
  const BATCH = 50;
  for (let i = 0; i < procesadas.length; i += BATCH) {
    const batch = procesadas.slice(i, i + BATCH);
    const payloads = batch.map(p => ({
      temporada_id: registroCache.temporadaActual,
      escuela_id: escuelaId,
      nombre: p.nombre,
      sexo: p.sexo,
      grado: p.grado,
      nivel: p.nivel,
      prenda_top: p.prenda_top,
      talla_top_key: p.talla_top_key,
      estado_top: p.estado_top,
      prenda_bottom: p.prenda_bottom,
      talla_bottom_key: p.talla_bottom_key,
      estado_bottom: p.estado_bottom,
      observaciones: p.observaciones,
      activo: true,
    }));
    
    try {
      await supaFetch('alumno', 'POST', payloads);
      exitosos += batch.length;
      btn.textContent = `Importando... ${exitosos}/${procesadas.length}`;
    } catch(e) {
      fallidos += batch.length;
      fallos.push(`Batch ${i/BATCH+1}: ${e.message}`);
    }
  }
  
  btn.disabled = false;
  btn.textContent = `✓ Importar ${procesadas.length} alumnos`;
  
  let msg = `✓ ${exitosos} alumnos importados.`;
  if (fallidos > 0) msg += `\n\n✗ ${fallidos} fallidos:\n` + fallos.join('\n');
  alert(msg);
  
  if (exitosos > 0) {
    cerrarImportacion();
    await cargarEscuelasTemporada();
    await mostrarAlumnos(escuelaId);
  }
}

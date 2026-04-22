// ══════════════════════════════════════════════════════════════════════
// TALLAJE (v23)
// Captura de alumnos con sus tallas, alumno por alumno
// ══════════════════════════════════════════════════════════════════════

let tallajeCache = {
  escuelaId: null,
  grado: '',
  nivelSugerido: null,
  ultimosCargados: [], // últimos alumnos cargados en esta sesión
  editandoId: null,
};

// Sugerencia prenda por sexo + nivel
function sugerenciaPrenda(sexo, nivel) {
  const M = {
    'F_PARV':   { top: 'CAMISA_CELESTE', bottom: 'FALDA_C.E' },
    'M_PARV':   { top: 'CAMISA_CELESTE', bottom: 'SHORT' },
    'F_BASICA': { top: 'BLUSA',          bottom: 'FALDA' },
    'M_BASICA': { top: 'CAMISA',         bottom: 'PANTALON' },
    'F_BACH':   { top: 'BLUSA',          bottom: 'FALDA_BEIGE' },
    'M_BACH':   { top: 'CAMISA',         bottom: 'PANTALON_BEIGE' },
  };
  return M[`${sexo}_${nivel}`] || { top: 'CAMISA', bottom: 'PANTALON' };
}

// Inferir nivel desde el grado
function nivelDesdeGrado(grado) {
  if (!grado) return null;
  const g = grado.toString().toUpperCase().trim();
  if (g.startsWith('P')) return 'PARV';
  if (g.match(/^[1-9][ABCDÉ]/) || g.match(/^[1-9]°?[ABCDEFG]/)) {
    // si empieza con 1-9 y la primera es básica (1A-9C) vs bach (1°A1, etc)
    // Bach: tiene "°" o es patrón tipo "1°X"
    if (g.includes('°') || g.match(/^[12]°/) || g.includes('SALUD') || g.includes('TÉCNICO') || g.includes('GENERAL')) {
      return 'BACH';
    }
    // Numeros 1-9 simples = básica
    return 'BASICA';
  }
  if (g.match(/^ACELERADA/i)) return 'BASICA';
  return 'OTRO';
}

// ─── Pantalla inicial del tallaje ─────────────────────────────────
function renderTallajeInicial(escuelaId) {
  const cont = document.getElementById('registro-detalle-tabla');
  tallajeCache.escuelaId = escuelaId;
  
  // Grados conocidos para autocomplete
  const gradosHtml = registroCache.gradosConocidos.slice(0, 50).map(g => `<option value="${g.grado}">`).join('');
  
  cont.innerHTML = `
    <datalist id="grados-datalist">${gradosHtml}</datalist>
    
    <div class="card" style="padding:14px;margin-bottom:10px">
      <div style="font-weight:600;margin-bottom:10px">📏 Iniciar tallaje por grado</div>
      <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">
        <div style="flex:1;min-width:120px">
          <label style="font-size:11px;color:#666;display:block">Grado</label>
          <input type="text" id="tall-grado" list="grados-datalist" 
                 placeholder="ej: P4A, 1A, 3°SALUD_A"
                 style="width:100%;padding:6px 10px;border:1px solid var(--borde);border-radius:4px"
                 value="${tallajeCache.grado || ''}">
        </div>
        <button class="btn btn-primary" onclick="iniciarCapturaTallaje()">📝 Capturar alumnos</button>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--borde);text-align:center">
        <div style="font-size:11px;color:#888;margin-bottom:6px">¿Tenés muchos alumnos en un Excel?</div>
        <button class="btn btn-ghost btn-sm" onclick="abrirImportacion('${escuelaId}')">📥 Importar desde Excel/CSV</button>
      </div>
    </div>
    
    <div id="tallaje-captura-area"></div>
    <div id="tallaje-recientes"></div>
  `;
  
  // Cargar últimos alumnos de este escuela
  cargarUltimosCargados(escuelaId);
}

async function cargarUltimosCargados(escuelaId) {
  try {
    const recientes = await supaFetch('alumno', 'GET', null, 
      `?escuela_id=eq.${escuelaId}&temporada_id=eq.${registroCache.temporadaActual}&order=creado_en.desc&limit=10`);
    tallajeCache.ultimosCargados = recientes;
    renderRecientes();
  } catch(e) { /* silencioso */ }
}

function renderRecientes() {
  const cont = document.getElementById('tallaje-recientes');
  if (!cont) return;
  const lista = tallajeCache.ultimosCargados;
  if (lista.length === 0) {
    cont.innerHTML = '';
    return;
  }
  cont.innerHTML = `
    <div class="card" style="padding:10px">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">⏱ Últimos cargados</div>
      ${lista.map(a => `
        <div style="padding:6px;border-bottom:1px solid #EEE;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:600;font-size:12px">${a.nombre}</div>
            <div style="font-size:10px;color:#888">${a.grado || '-'} · ${a.talla_top_key || '?'} / ${a.talla_bottom_key || '?'}</div>
          </div>
          <button class="btn-mini" onclick="editarAlumno('${a.id}')">✏ Editar</button>
        </div>
      `).join('')}
    </div>
  `;
}

function iniciarCapturaTallaje() {
  const grado = document.getElementById('tall-grado').value.trim();
  if (!grado) { alert('Escribí un grado'); return; }
  tallajeCache.grado = grado;
  tallajeCache.nivelSugerido = nivelDesdeGrado(grado);
  renderFormularioTallaje();
}

// ─── Formulario principal de tallaje ─────────────────────────────
function renderFormularioTallaje(datos = null) {
  const area = document.getElementById('tallaje-captura-area');
  if (!area) return;
  
  const esc = registroCache.escuelas.find(e => e.escuela_id === tallajeCache.escuelaId);
  const escNombre = esc ? esc.escuela_nombre : '';
  const editando = !!datos;
  tallajeCache.editandoId = datos?.id || null;
  
  // Valores por defecto o de edición
  const d = datos || {};
  const nombre = d.nombre || '';
  const sexo = d.sexo || '';
  const prenda_top = d.prenda_top || '';
  const talla_top = d.talla_top_key || '';
  const prenda_bottom = d.prenda_bottom || '';
  const talla_bottom = d.talla_bottom_key || '';
  const largo_bottom = ''; // extraer de la key si hay
  const obs = d.observaciones || '';
  
  area.innerHTML = `
    <div class="card" style="padding:14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <div style="font-weight:700;font-size:14px">${escNombre} · ${tallajeCache.grado}</div>
          <div style="font-size:11px;color:#666">
            ${editando ? '✏ Editando alumno' : '➕ Alumno nuevo'} · Nivel sugerido: <strong>${tallajeCache.nivelSugerido}</strong>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="cancelarTallaje()">← Volver</button>
      </div>
      
      <!-- NOMBRE -->
      <div class="field">
        <label>Nombre *</label>
        <input type="text" id="tall-nombre" placeholder="Ej: PEREZ GONZALEZ, ANA MARIA" 
               style="width:100%;font-size:14px" value="${nombre}" autofocus>
      </div>
      
      <!-- SEXO -->
      <div class="field">
        <label>Sexo *</label>
        <div style="display:flex;gap:10px">
          <label style="flex:1;padding:8px;border:2px solid ${sexo==='F'?'var(--azul)':'var(--borde)'};border-radius:6px;cursor:pointer;text-align:center;background:${sexo==='F'?'#E6F0FF':'white'}">
            <input type="radio" name="tall-sexo" value="F" ${sexo==='F'?'checked':''} onchange="actualizarSugerencias()" style="margin-right:6px">
            ♀ Niña
          </label>
          <label style="flex:1;padding:8px;border:2px solid ${sexo==='M'?'var(--azul)':'var(--borde)'};border-radius:6px;cursor:pointer;text-align:center;background:${sexo==='M'?'#E6F0FF':'white'}">
            <input type="radio" name="tall-sexo" value="M" ${sexo==='M'?'checked':''} onchange="actualizarSugerencias()" style="margin-right:6px">
            ♂ Niño
          </label>
        </div>
      </div>
      
      <!-- TOP -->
      <div style="border:1px solid var(--borde);border-radius:8px;padding:10px;margin:10px 0">
        <div style="font-weight:600;font-size:13px;margin-bottom:8px">👕 TOP</div>
        <div class="field">
          <label>Prenda</label>
          <select id="tall-prenda-t" onchange="actualizarKey('top')">
            <option value="">— elegir —</option>
            <option value="CAMISA" ${prenda_top==='CAMISA'?'selected':''}>CAMISA</option>
            <option value="BLUSA" ${prenda_top==='BLUSA'?'selected':''}>BLUSA</option>
            <option value="CAMISA_CELESTE" ${prenda_top==='CAMISA_CELESTE'?'selected':''}>CAMISA_CELESTE (parv)</option>
          </select>
        </div>
        <div style="display:flex;gap:8px">
          <div class="field" style="flex:1">
            <label>Talla *</label>
            <input type="text" id="tall-talla-t" placeholder="4, 6, 8, 10, 12..." 
                   oninput="actualizarKey('top')" value="${talla_top.replace(/^(CC|C|B)/,'')}">
          </div>
          <div class="field" style="flex:1">
            <label>Largo (opcional)</label>
            <input type="text" id="tall-largo-t" placeholder="vacío" oninput="actualizarKey('top')">
          </div>
        </div>
        <div id="tall-key-t" style="font-size:11px;color:#888;font-family:monospace">Código: —</div>
      </div>
      
      <!-- BOTTOM -->
      <div style="border:1px solid var(--borde);border-radius:8px;padding:10px;margin:10px 0">
        <div style="font-weight:600;font-size:13px;margin-bottom:8px">👖 BOTTOM</div>
        <div class="field">
          <label>Prenda</label>
          <select id="tall-prenda-b" onchange="actualizarKey('bottom')">
            <option value="">— elegir —</option>
            <option value="PANTALON" ${prenda_bottom==='PANTALON'?'selected':''}>PANTALON</option>
            <option value="PANTALON_BEIGE" ${prenda_bottom==='PANTALON_BEIGE'?'selected':''}>PANTALON_BEIGE</option>
            <option value="FALDA" ${prenda_bottom==='FALDA'?'selected':''}>FALDA</option>
            <option value="FALDA_BEIGE" ${prenda_bottom==='FALDA_BEIGE'?'selected':''}>FALDA_BEIGE</option>
            <option value="FALDA_C.E" ${prenda_bottom==='FALDA_C.E'?'selected':''}>FALDA_C.E (parv)</option>
            <option value="SHORT" ${prenda_bottom==='SHORT'?'selected':''}>SHORT</option>
          </select>
        </div>
        <div style="display:flex;gap:8px">
          <div class="field" style="flex:1">
            <label>Talla *</label>
            <input type="text" id="tall-talla-b" placeholder="4, 8, 10, 12..." 
                   oninput="actualizarKey('bottom')" value="${talla_bottom.replace(/^(PB|P|FB|FCE|F|S)/,'').replace(/\d+$/,match => talla_bottom.match(/\d+\d+$/) ? '' : match)}">
          </div>
          <div class="field" style="flex:1">
            <label>Largo</label>
            <input type="text" id="tall-largo-b" placeholder="30, 35, 40, 70, 75..." 
                   oninput="actualizarKey('bottom')">
          </div>
        </div>
        <div id="tall-key-b" style="font-size:11px;color:#888;font-family:monospace">Código: —</div>
      </div>
      
      <!-- OBSERVACIONES -->
      <div class="field">
        <label>Observaciones (opcional)</label>
        <textarea id="tall-obs" rows="2">${obs}</textarea>
      </div>
      
      <!-- BOTONES -->
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn btn-ghost" style="flex:1" onclick="cancelarTallaje()">✗ Cancelar</button>
        ${editando 
          ? `<button class="btn btn-success" style="flex:2" onclick="guardarTallaje(false)">✓ Guardar cambios</button>`
          : `<button class="btn btn-success" style="flex:2" onclick="guardarTallaje(true)">✓ Guardar y siguiente →</button>`}
      </div>
    </div>
  `;
  
  // Autocompletar sugerencias si hay sexo
  if (sexo) setTimeout(actualizarSugerencias, 50);
  else setTimeout(() => document.getElementById('tall-nombre')?.focus(), 50);
  
  // Re-calcular KEYs iniciales
  setTimeout(() => { actualizarKey('top'); actualizarKey('bottom'); }, 100);
}

function actualizarSugerencias() {
  const sexoEl = document.querySelector('input[name="tall-sexo"]:checked');
  if (!sexoEl) return;
  const sexo = sexoEl.value;
  const sug = sugerenciaPrenda(sexo, tallajeCache.nivelSugerido);
  
  const pt = document.getElementById('tall-prenda-t');
  const pb = document.getElementById('tall-prenda-b');
  // Solo sugerir si está vacío
  if (pt && !pt.value) pt.value = sug.top;
  if (pb && !pb.value) pb.value = sug.bottom;
  
  actualizarKey('top');
  actualizarKey('bottom');
}

const COD_PRENDA = {
  'CAMISA': 'C', 'BLUSA': 'B', 'CAMISA_CELESTE': 'CC',
  'PANTALON': 'P', 'PANTALON_BEIGE': 'PB',
  'FALDA': 'F', 'FALDA_BEIGE': 'FB', 'FALDA_C.E': 'FCE',
  'SHORT': 'S',
};

function calcularKey(prenda, talla, largo) {
  if (!prenda || !talla) return '';
  const cod = COD_PRENDA[prenda] || prenda.slice(0,3);
  const t = talla.toString().trim();
  const l = largo ? largo.toString().trim() : '';
  return cod + t + l;
}

function actualizarKey(tipo) {
  if (tipo === 'top') {
    const p = document.getElementById('tall-prenda-t')?.value || '';
    const t = document.getElementById('tall-talla-t')?.value || '';
    const l = document.getElementById('tall-largo-t')?.value || '';
    const k = calcularKey(p, t, l);
    const el = document.getElementById('tall-key-t');
    if (el) el.innerHTML = `Código: <strong style="color:${k?'var(--azul)':'#888'}">${k || '—'}</strong>`;
  } else {
    const p = document.getElementById('tall-prenda-b')?.value || '';
    const t = document.getElementById('tall-talla-b')?.value || '';
    const l = document.getElementById('tall-largo-b')?.value || '';
    const k = calcularKey(p, t, l);
    const el = document.getElementById('tall-key-b');
    if (el) el.innerHTML = `Código: <strong style="color:${k?'var(--azul)':'#888'}">${k || '—'}</strong>`;
  }
}

function cancelarTallaje() {
  tallajeCache.editandoId = null;
  renderTallajeInicial(tallajeCache.escuelaId);
}

async function guardarTallaje(continuar) {
  const nombre = document.getElementById('tall-nombre').value.trim();
  const sexoEl = document.querySelector('input[name="tall-sexo"]:checked');
  const sexo = sexoEl?.value || null;
  const prenda_top = document.getElementById('tall-prenda-t').value || null;
  const talla_top_num = document.getElementById('tall-talla-t').value.trim();
  const largo_top = document.getElementById('tall-largo-t').value.trim();
  const prenda_bottom = document.getElementById('tall-prenda-b').value || null;
  const talla_bottom_num = document.getElementById('tall-talla-b').value.trim();
  const largo_bottom = document.getElementById('tall-largo-b').value.trim();
  const obs = document.getElementById('tall-obs').value.trim() || null;
  
  if (!nombre) { alert('El nombre es obligatorio'); return; }
  
  const talla_top_key = calcularKey(prenda_top, talla_top_num, largo_top);
  const talla_bottom_key = calcularKey(prenda_bottom, talla_bottom_num, largo_bottom);
  
  const payload = {
    temporada_id: registroCache.temporadaActual,
    escuela_id: tallajeCache.escuelaId,
    nombre, sexo,
    grado: tallajeCache.grado,
    nivel: tallajeCache.nivelSugerido,
    prenda_top: prenda_top,
    talla_top_key: talla_top_key || null,
    prenda_bottom: prenda_bottom,
    talla_bottom_key: talla_bottom_key || null,
    observaciones: obs,
    activo: true,
    actualizado_en: new Date().toISOString(),
  };
  
  try {
    if (tallajeCache.editandoId) {
      await supaUpdate('alumno', tallajeCache.editandoId, payload);
    } else {
      await supaFetch('alumno', 'POST', payload);
    }
    tallajeCache.editandoId = null;
    
    if (continuar) {
      renderFormularioTallaje(); // reset
      await cargarUltimosCargados(tallajeCache.escuelaId);
    } else {
      cancelarTallaje();
      await cargarUltimosCargados(tallajeCache.escuelaId);
    }
  } catch(e) {
    alert('Error al guardar: ' + e.message);
  }
}

async function editarAlumno(alumnoId) {
  try {
    const res = await supaFetch('alumno', 'GET', null, `?id=eq.${alumnoId}&limit=1`);
    if (!res || res.length === 0) { alert('Alumno no encontrado'); return; }
    const a = res[0];
    tallajeCache.grado = a.grado || '';
    tallajeCache.nivelSugerido = a.nivel || nivelDesdeGrado(a.grado);
    renderFormularioTallaje(a);
  } catch(e) { alert('Error: ' + e.message); }
}

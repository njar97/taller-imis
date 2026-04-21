// ══════════════════════════════════════════════════════════════════════
async function initTrazo() {
  document.getElementById('t-fecha').value = new Date().toISOString().split('T')[0];
  ['t-letra-corte','t-capas','t-yardas','t-video-url','t-observaciones'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('t-yd-por-lienzo').value = '4';
  document.getElementById('t-foto-preview').style.display = 'none';
  document.getElementById('t-foto-label').textContent = 'Toca para tomar o adjuntar foto';
  document.getElementById('t-tallas-container').innerHTML = '';
  tallasCount = 0;
  fotoBlob = null;
  coloresSeleccionados = new Set();
  await cargarCatalogoCustom();
  renderColorChips();
  agregarTallaTrazo();
}

async function cargarCatalogoCustom() {
  CATALOGO = JSON.parse(JSON.stringify(CATALOGO_BASE));
  try {
    const customs = await supaFetch('catalogo_key','GET',null,'?activo=eq.true&limit=500');
    customs.forEach(c => {
      if (CATALOGO[c.cod_prenda] && !CATALOGO[c.cod_prenda].keys.includes(c.key)) {
        CATALOGO[c.cod_prenda].keys.push(c.key);
      }
    });
  } catch(e) {
    console.warn('Sin catalogo_key:', e.message);
  }
}

function renderColorChips() {
  const cont = document.getElementById('t-color-chips');
  const ids = ['blanco','celeste','azul','beige'];
  cont.innerHTML = ids.map(id => {
    const c = COLORES[id];
    const activo = coloresSeleccionados.has(id);
    const incompatible = esIncompatible(id);
    const cls = 'color-chip' + (activo ? ' active' : '') + (incompatible ? ' disabled' : '');
    return `<div class="${cls}" onclick="toggleColor('${id}')">
      <span class="color-swatch" style="background:${c.hex};border-color:${c.border}"></span>
      ${c.nombre}
    </div>`;
  }).join('');
}

function esIncompatible(colorId) {
  if (coloresSeleccionados.size === 0) return false;
  if (coloresSeleccionados.has(colorId)) return false;
  // Solo se permite si todos los actuales lo aceptan
  for (const c of coloresSeleccionados) {
    if (!COMPATIBLES[c]?.includes(colorId)) return true;
  }
  return false;
}

function toggleColor(id) {
  if (coloresSeleccionados.has(id)) {
    coloresSeleccionados.delete(id);
  } else {
    if (esIncompatible(id)) return; // bloqueado
    coloresSeleccionados.add(id);
  }
  renderColorChips();
  // Refrescar prendas permitidas en todas las tallas abiertas
  actualizarPrendasPermitidasTodas();
}

function prendasPermitidas() {
  // Unión de las prendas de todos los colores seleccionados
  const set = new Set();
  for (const c of coloresSeleccionados) {
    (COLORES[c]?.prendas || []).forEach(p => set.add(p));
  }
  return [...set];
}

function recalcYardas() {
  const capas = parseFloat(document.getElementById('t-capas').value) || 0;
  const ydLienzo = parseFloat(document.getElementById('t-yd-por-lienzo').value) || 0;
  const calc = capas * ydLienzo;
  const hint = document.getElementById('t-yardas-hint');
  if (capas > 0 && ydLienzo > 0) {
    hint.innerHTML = `Cálculo: ${capas} × ${ydLienzo} = <strong>${calc.toFixed(1)} yd</strong>. Tocá "🧮 Calc" para aplicar.`;
  } else {
    hint.textContent = 'Tip: capas × yardas por lienzo. Editable si preferís otro valor.';
  }
}

function aplicarYardasCalc() {
  const capas = parseFloat(document.getElementById('t-capas').value) || 0;
  const ydLienzo = parseFloat(document.getElementById('t-yd-por-lienzo').value) || 0;
  if (capas <= 0 || ydLienzo <= 0) { mostrarAlerta('trazo','error','Ingresá capas y yardas por lienzo primero.'); return; }
  document.getElementById('t-yardas').value = (capas * ydLienzo).toFixed(1);
}

function letraSugeridaTalla() {
  const corte = (document.getElementById('t-letra-corte').value || '').toUpperCase();
  const usadas = new Set();
  document.querySelectorAll('[data-ttrazo-letra]').forEach(el => {
    const v = (el.value||'').toUpperCase();
    if (v) usadas.add(v);
  });
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const l of alfabeto) if (!usadas.has(l) && l !== corte) return l;
  for (const l of alfabeto) if (!usadas.has(l)) return l;
  return '';
}

function sugerirLetrasTallas() {
  document.querySelectorAll('[data-ttrazo-letra]').forEach(el => {
    if (!el.value.trim()) el.value = letraSugeridaTalla();
    marcarColisionLetraTrazo(el);
  });
}

function marcarColisionLetraTrazo(input) {
  const corte = (document.getElementById('t-letra-corte').value||'').toUpperCase();
  const v = (input.value||'').toUpperCase();
  if (v && v === corte) input.classList.add('letra-warning');
  else input.classList.remove('letra-warning');
}

function agregarTallaTrazo() {
  tallasCount++;
  const id = tallasCount;
  const letra = letraSugeridaTalla();
  const permitidas = prendasPermitidas();
  const prendaOptions = `<option value="">— Prenda —</option>` + permitidas.map(p => 
    `<option value="${p}">${CATALOGO[p].nombre}</option>`).join('');

  const row = document.createElement('div');
  row.className = 'talla-row';
  row.id = `ttrazo-${id}`;
  row.dataset.ttId = id;
  row.innerHTML = `
    <div class="talla-row-head2">
      <div>
        <label>Letra</label>
        <input type="text" class="letra-input" maxlength="1" data-tt-id="${id}" data-ttrazo-letra="1" value="${letra}" oninput="this.value=this.value.toUpperCase();marcarColisionLetraTrazo(this);actualizarComplementosVisibles()">
      </div>
      <div>
        <label>Prenda</label>
        <select data-tt-id="${id}" data-ttrazo-prenda="1" onchange="onPrendaTallaChange(${id})">${prendaOptions}</select>
      </div>
      <div class="key-wrap">
        <label>Talla (KEY)</label>
        <input type="text" data-tt-id="${id}" data-ttrazo-key="1" placeholder="Elegí prenda primero"
               oninput="onKeyInput(${id})"
               onfocus="onKeyInput(${id})"
               onblur="setTimeout(()=>cerrarDropdownKey(${id}),200)"
               autocomplete="off"
               disabled>
        <div class="key-dropdown" id="keydrop-${id}"></div>
      </div>
      <div>
        <label style="visibility:hidden">x</label>
        <button class="btn-mini btn-mini-danger" onclick="eliminarTallaTrazo(${id})">✕</button>
      </div>
    </div>
    <div class="talla-row-tipo">
      <div><label style="margin:0">Tipo:</label></div>
      <div class="tipo-opt active" data-tt-id="${id}" data-ttrazo-tipo="completa" onclick="setTipoTalla(${id},'completa')">completa</div>
      <div class="tipo-opt" data-tt-id="${id}" data-ttrazo-tipo="par" onclick="setTipoTalla(${id},'par')">par</div>
    </div>
    <div class="talla-row-hint" id="hint-${id}">completa: 1 lienzo = 1 pieza</div>
    <div class="talla-complemento" id="comp-${id}" style="display:none">
      <label>Complementa con (otra talla par):</label>
      <select data-tt-id="${id}" data-ttrazo-complemento="1" onchange="onComplementoChange(${id})">
        <option value="">— Elegí primero una KEY —</option>
      </select>
      <div class="complemento-info"></div>
    </div>
  `;
  document.getElementById('t-tallas-container').appendChild(row);
  actualizarPrendasPermitidasTodas(); // por si cambió algo
}

function eliminarTallaTrazo(id) {
  const row = document.getElementById(`ttrazo-${id}`);
  if (row) row.remove();
}

function setTipoTalla(id, tipo) {
  const row = document.getElementById(`ttrazo-${id}`);
  if (!row) return;
  row.querySelectorAll('[data-ttrazo-tipo]').forEach(el => {
    el.classList.toggle('active', el.dataset.ttrazoTipo === tipo);
  });
  const hint = document.getElementById(`hint-${id}`);
  if (hint) hint.textContent = tipo === 'par' ? 'par: 2 lienzos = 1 pieza' : 'completa: 1 lienzo = 1 pieza';
  // Mostrar/ocultar complemento
  const comp = document.getElementById(`comp-${id}`);
  if (comp) comp.style.display = (tipo === 'par') ? 'block' : 'none';
  // Si cambia a completa, limpiar complemento
  if (tipo !== 'par') {
    const sel = row.querySelector('[data-ttrazo-complemento]');
    if (sel) sel.value = '';
    limpiarComplemento(id);
  } else {
    // Al entrar a par, cargar sugerencias
    actualizarSugerenciasComplemento(id);
  }
}

function onPrendaTallaChange(id) {
  const row = document.getElementById(`ttrazo-${id}`);
  if (!row) return;
  const prenda = row.querySelector('[data-ttrazo-prenda]').value;
  const keyInp = row.querySelector('[data-ttrazo-key]');
  if (prenda) {
    keyInp.disabled = false;
    keyInp.placeholder = 'Buscar o escribir (ej: P1595)';
    keyInp.value = ''; // limpiar selección previa porque cambió la prenda
    cerrarDropdownKey(id);
  } else {
    keyInp.disabled = true;
    keyInp.value = '';
    keyInp.placeholder = 'Elegí prenda primero';
  }
}

function actualizarPrendasPermitidasTodas() {
  const permitidas = prendasPermitidas();
  document.querySelectorAll('[data-ttrazo-prenda]').forEach(sel => {
    const actual = sel.value;
    const opts = `<option value="">— Prenda —</option>` + permitidas.map(p => 
      `<option value="${p}" ${actual===p?'selected':''}>${CATALOGO[p].nombre}</option>`).join('');
    // Si la prenda actual ya no está permitida, queda vacía
    if (actual && !permitidas.includes(actual)) {
      sel.innerHTML = opts;
      sel.value = '';
      // limpiar KEY asociada
      const id = sel.dataset.ttId;
      const row = document.getElementById(`ttrazo-${id}`);
      if (row) {
        const keyInp = row.querySelector('[data-ttrazo-key]');
        if (keyInp) { keyInp.value = ''; keyInp.disabled = true; keyInp.placeholder = 'Elegí prenda primero'; }
      }
    } else {
      sel.innerHTML = opts;
    }
  });
}

// Dropdown KEY: filtra solo por la prenda de ESA fila
function onKeyInput(id) {
  const row = document.getElementById(`ttrazo-${id}`);
  if (!row) return;
  const prenda = row.querySelector('[data-ttrazo-prenda]').value;
  if (!prenda) return;
  const inp = row.querySelector('[data-ttrazo-key]');
  const drop = document.getElementById(`keydrop-${id}`);
  if (!inp || !drop) return;
  const q = (inp.value || '').trim().toUpperCase();

  // Armar opciones con talla/largo parseados + puntuación de relevancia
  let opcionesRaw = (CATALOGO[prenda]?.keys || [])
    .map(k => {
      const p = parsearKey(k);
      let score = 0;
      if (q) {
        const matchKey = k.toUpperCase().includes(q);
        if (!matchKey) return null;
        // Priorizar: si la query matchea la TALLA exacta, score alto
        if (p && p.talla !== null && String(p.talla) === q) score = 1000;
        // Si la query aparece como prefijo de la talla, score medio
        else if (p && p.talla !== null && String(p.talla).startsWith(q)) score = 500;
        // Si matchea en cualquier otra parte, score bajo
        else score = 100;
      }
      return { key: k, cod: prenda, nombre: CATALOGO[prenda].nombre, talla: p?.talla ?? 999, largo: p?.largo ?? 0, score };
    })
    .filter(x => x !== null);

  // Ordenar: score desc → talla asc → largo desc
  opcionesRaw.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.talla !== b.talla) return a.talla - b.talla;
    return b.largo - a.largo;
  });

  // Límite más generoso
  const LIMITE = 100;
  const totalMatches = opcionesRaw.length;
  const opciones = opcionesRaw.slice(0, LIMITE);

  const existeExacta = opciones.some(o => o.key.toUpperCase() === q);
  let html = '';
  if (opciones.length === 0 && !q) {
    html = '<div class="key-option text-muted" style="font-style:italic">Escribí para buscar o elegí de la lista...</div>';
  } else {
    html = opciones.map(o => `
      <div class="key-option" onmousedown="seleccionarKey(${id},'${o.key.replace(/'/g,"\\'")}')">
        <strong>${o.key}</strong>
      </div>
    `).join('');
    if (totalMatches > LIMITE) {
      html += `<div class="key-option text-muted" style="font-style:italic;font-size:11px">... y ${totalMatches - LIMITE} más. Escribí más para filtrar.</div>`;
    }
  }
  if (q && !existeExacta) {
    html += `
      <div class="key-option nueva" onmousedown="agregarKeyCatalogo(${id},'${q.replace(/'/g,"\\'")}','${prenda}')">
        ➕ Agregar "${q}" al catálogo de ${CATALOGO[prenda].nombre}
      </div>
    `;
  }
  drop.innerHTML = html;
  drop.classList.add('active');
}

function detectarPrendaDeKey(key) {
  const codigos = Object.keys(CATALOGO).sort((a,b) => b.length - a.length);
  for (const c of codigos) {
    if (key.startsWith(c)) return c;
  }
  return null;
}

function seleccionarKey(id, key) {
  const row = document.getElementById(`ttrazo-${id}`);
  if (!row) return;
  const inp = row.querySelector('[data-ttrazo-key]');
  if (inp) inp.value = key;
  cerrarDropdownKey(id);
  actualizarComplementosVisibles(); // actualizar dropdowns de complemento (para que muestren KEY)
}

function cerrarDropdownKey(id) {
  const drop = document.getElementById(`keydrop-${id}`);
  if (drop) drop.classList.remove('active');
}

async function agregarKeyCatalogo(id, key, codPrenda) {
  if (!codPrenda) return;
  try {
    await supaFetch('catalogo_key','POST',{ cod_prenda: codPrenda, key });
    if (CATALOGO[codPrenda] && !CATALOGO[codPrenda].keys.includes(key)) {
      CATALOGO[codPrenda].keys.push(key);
    }
    seleccionarKey(id, key);
  } catch(e) {
    if (CATALOGO[codPrenda] && !CATALOGO[codPrenda].keys.includes(key)) {
      CATALOGO[codPrenda].keys.push(key);
    }
    seleccionarKey(id, key);
    console.warn('catalogo_key no disponible, usando local:', e.message);
  }
}

// Complementos: ahora sugieren del CATÁLOGO basándose en la KEY principal
// Parsea una KEY tipo "P1595", "F2055CINT.17", "C10" → {cod, talla, largo, detalle}
function parsearKey(key) {
  if (!key) return null;
  const codigos = Object.keys(CATALOGO).sort((a,b) => b.length - a.length);
  let cod = null;
  for (const c of codigos) {
    if (key.startsWith(c)) { cod = c; break; }
  }
  if (!cod) return null;
  const resto = key.substring(cod.length); // ej: "1595" o "2055CINT.17"
  const mDetalle = resto.match(/^(\d+)(.*)$/);
  if (!mDetalle) return { cod, talla: null, largo: null, detalle: null };
  const numeros = mDetalle[1];
  const detalle = mDetalle[2] || null;

  let talla = null, largo = null;
  if (['C','B','CC','S'].includes(cod)) {
    // Prendas sin largo: todo es talla
    talla = parseInt(numeros);
  } else {
    // Prendas con talla+largo. Estrategia: preferir la división donde la talla pertenezca
    // al catálogo conocido para esa prenda. Si hay empate, preferir talla mayor.
    const tallasCatalogo = new Set();
    (CATALOGO[cod]?.keys || []).forEach(k => {
      // Parseo rápido solo para extraer tallas conocidas (prefijos posibles)
      const m = k.substring(cod.length).match(/^(\d+)/);
      if (!m) return;
      const nums = m[1];
      // Probar splits de 1 a 2 dígitos para talla
      for (let s = 1; s <= Math.min(2, nums.length - 1); s++) {
        const t = parseInt(nums.substring(0, s));
        const l = parseInt(nums.substring(s));
        if (t >= 2 && t <= 40 && l >= 20 && l <= 120) tallasCatalogo.add(t);
      }
    });

    // Buscar la división óptima
    const candidatos = [];
    for (let split = 1; split < numeros.length; split++) {
      const t = parseInt(numeros.substring(0, split));
      const l = parseInt(numeros.substring(split));
      if (t >= 2 && t <= 40 && l >= 20 && l <= 120) {
        candidatos.push({ t, l, split, enCatalogo: tallasCatalogo.has(t) });
      }
    }
    if (candidatos.length > 0) {
      // Preferir (1) los que están en el catálogo, (2) talla mayor
      candidatos.sort((a, b) => {
        if (a.enCatalogo !== b.enCatalogo) return b.enCatalogo - a.enCatalogo;
        return b.t - a.t;
      });
      talla = candidatos[0].t;
      largo = candidatos[0].l;
    } else {
      talla = parseInt(numeros);
    }
  }
  return { cod, talla, largo, detalle };
}

// Construir KEY a partir de componentes
function construirKey(cod, talla, largo, detalle) {
  let k = cod + (talla !== null && talla !== undefined ? talla : '');
  if (largo !== null && largo !== undefined) k += largo;
  if (detalle) k += detalle;
  return k;
}

// Generar sugerencias de complemento para una KEY principal
// Retorna array de grupos: [{talla: N, keys: [{key, largo, detalle, existeEnCatalogo}]}, ...]
function generarSugerenciasComplemento(keyPrincipal) {
  const p = parsearKey(keyPrincipal);
  if (!p || p.talla === null) return [];

  // Buscar en el catálogo de la misma prenda (cod)
  const allKeys = CATALOGO[p.cod]?.keys || [];
  // Parsear todas, filtrar por talla < principal
  const parsed = allKeys
    .map(k => ({ key: k, ...parsearKey(k) }))
    .filter(x => x && x.cod === p.cod && x.talla !== null && x.talla < p.talla);

  // Agrupar por talla, ordenar tallas descendente (más cercana a la principal primero)
  const grupos = {};
  parsed.forEach(x => {
    if (!grupos[x.talla]) grupos[x.talla] = [];
    grupos[x.talla].push(x);
  });
  // Ordenar dentro de cada talla: largo mayor→menor, luego por detalle
  Object.keys(grupos).forEach(t => {
    grupos[t].sort((a, b) => {
      if (a.largo !== b.largo) return (b.largo||0) - (a.largo||0);
      return (a.detalle||'').localeCompare(b.detalle||'');
    });
  });
  // Tomar las 2 tallas más cercanas (más grandes entre las menores)
  const tallasOrdenadas = Object.keys(grupos).map(Number).sort((a,b) => b - a);
  const top2 = tallasOrdenadas.slice(0, 2);
  return top2.map(t => ({ talla: t, keys: grupos[t] }));
}

// Actualizar un <select> de complemento de una fila específica
function actualizarSugerenciasComplemento(idFila) {
  const row = document.getElementById(`ttrazo-${idFila}`);
  if (!row) return;
  const sel = row.querySelector('[data-ttrazo-complemento]');
  if (!sel) return;
  const keyPrincipal = row.querySelector('[data-ttrazo-key]')?.value.trim() || '';
  const prevVal = sel.value;

  if (!keyPrincipal) {
    sel.innerHTML = '<option value="">— Elegí primero una KEY —</option>';
    return;
  }

  const p = parsearKey(keyPrincipal);
  if (!p) {
    sel.innerHTML = '<option value="">— KEY no reconocida —</option>';
    return;
  }

  const grupos = generarSugerenciasComplemento(keyPrincipal);

  // Construir opciones agrupadas
  let html = '<option value="">— Sin asignar —</option>';
  if (grupos.length === 0) {
    html += `<option value="__nueva__" data-cod="${p.cod}" data-mas-chica="1">+ No hay menores · Agregar talla nueva...</option>`;
  } else {
    grupos.forEach(g => {
      html += `<optgroup label="Talla ${g.talla}">`;
      g.keys.forEach(x => {
        const desc = [x.largo?`largo ${x.largo}`:null, x.detalle].filter(Boolean).join(' · ') || 'sola';
        html += `<option value="KEY::${x.key}">${x.key}  (${desc})</option>`;
      });
      html += `</optgroup>`;
    });
    // Opción "otra talla del catálogo completo"
    html += `<option value="__otra__" data-cod="${p.cod}">— Otra talla del catálogo —</option>`;
    // Opción "registrar talla más grande"
    html += `<option value="__mas_grande__" data-cod="${p.cod}">+ Registrar talla más grande...</option>`;
  }

  sel.innerHTML = html;

  // Restaurar selección previa si sigue siendo válida
  if (prevVal && prevVal.startsWith('KEY::')) {
    const stillThere = sel.querySelector(`option[value="${CSS.escape(prevVal)}"]`);
    if (stillThere) sel.value = prevVal;
  }
}

// Refrescar TODOS los complementos visibles (cuando cambia la KEY de alguna fila)
function actualizarComplementosVisibles() {
  document.querySelectorAll('.talla-row').forEach(row => {
    const id = row.dataset.ttId;
    const tipoEl = row.querySelector('[data-ttrazo-tipo].active');
    const tipo = tipoEl ? tipoEl.dataset.ttrazoTipo : 'completa';
    if (tipo === 'par') actualizarSugerenciasComplemento(id);
  });
}

async function onComplementoChange(id) {
  const row = document.getElementById(`ttrazo-${id}`);
  if (!row) return;
  const sel = row.querySelector('[data-ttrazo-complemento]');
  if (!sel) return;
  const val = sel.value;

  if (!val) {
    // "sin asignar" - limpiar
    limpiarComplemento(id);
    return;
  }

  // Opciones especiales
  if (val === '__otra__') {
    await abrirSelectorOtraTalla(id);
    return;
  }
  if (val === '__mas_grande__' || val === '__nueva__') {
    const cod = sel.selectedOptions[0]?.dataset?.cod;
    const masChica = sel.selectedOptions[0]?.dataset?.masChica === '1';
    await abrirModalKeyNueva(id, cod, masChica ? 'menor' : 'mayor');
    return;
  }

  // Es una KEY del catálogo: "KEY::F1855"
  if (val.startsWith('KEY::')) {
    const keyComp = val.substring(5);
    await asignarComplementoPorKey(id, keyComp);
  }
}

// Asignar complemento: guarda la KEY como segundo campo de la MISMA fila
// (NO crea fila nueva, NO vincula a otra fila existente)
async function asignarComplementoPorKey(idPrincipal, keyComp) {
  const row = document.getElementById(`ttrazo-${idPrincipal}`);
  if (!row) return;

  // Guardar la KEY complemento en un atributo data de la fila
  row.dataset.keyComplemento = keyComp;

  // Actualizar el texto visual
  const info = row.querySelector('.complemento-info');
  if (info) info.textContent = `↔ complementa con ${keyComp}`;

  // El select del complemento queda mostrando la KEY elegida
  const sel = row.querySelector('[data-ttrazo-complemento]');
  if (sel) {
    // Asegurar que la opción exista en el dropdown (si fue de "otra" o "nueva")
    let optExiste = Array.from(sel.options).some(o => o.value === `KEY::${keyComp}`);
    if (!optExiste) {
      const opt = document.createElement('option');
      opt.value = `KEY::${keyComp}`;
      opt.textContent = keyComp;
      sel.appendChild(opt);
    }
    sel.value = `KEY::${keyComp}`;
  }
}

// Limpiar el complemento (cuando cambia a tipo completa o se elige "sin asignar")
function limpiarComplemento(idFila) {
  const row = document.getElementById(`ttrazo-${idFila}`);
  if (!row) return;
  delete row.dataset.keyComplemento;
  const info = row.querySelector('.complemento-info');
  if (info) info.textContent = '';
}

// ── Modal para crear KEY nueva (mas grande o mas chica) ──────────────
let miniModalContext = null;

function abrirModalKeyNueva(idFila, cod, direccion /* 'mayor' | 'menor' */) {
  miniModalContext = { tipo: 'keyNueva', idFila, cod, direccion };
  const prenda = CATALOGO[cod];
  const rowActual = document.getElementById(`ttrazo-${idFila}`);
  const keyActual = rowActual?.querySelector('[data-ttrazo-key]')?.value || '';
  const pActual = parsearKey(keyActual) || {};

  document.getElementById('mm-title').textContent = `Agregar talla ${direccion === 'mayor' ? 'más grande' : 'nueva'} · ${prenda.nombre}`;
  const body = document.getElementById('mm-body');
  body.innerHTML = `
    <div class="field">
      <label>Talla</label>
      <input type="number" id="mm-talla" min="1" max="50" placeholder="Ej: ${(pActual.talla||14)+(direccion==='mayor'?2:-2)}">
    </div>
    <div class="field">
      <label>Largo (opcional)</label>
      <input type="number" id="mm-largo" min="1" max="150" placeholder="Ej: ${pActual.largo||''}" ${pActual.largo?`value="${pActual.largo}"`:''}>
    </div>
    <div class="field">
      <label>Detalle (opcional, ej: CINT.17)</label>
      <input type="text" id="mm-detalle" placeholder="Vacío si no tiene" ${pActual.detalle?`value="${pActual.detalle}"`:''}>
    </div>
    <div class="text-muted">Se generará una KEY como "${cod}<span id="mm-preview-talla">?</span><span id="mm-preview-largo"></span><span id="mm-preview-detalle"></span>"</div>
  `;
  // Listeners para preview
  ['mm-talla','mm-largo','mm-detalle'].forEach(id => {
    document.getElementById(id).addEventListener('input', actualizarPreviewKey);
  });
  document.getElementById('mini-modal').classList.add('active');
  setTimeout(() => document.getElementById('mm-talla').focus(), 50);
}

function actualizarPreviewKey() {
  const t = document.getElementById('mm-talla').value;
  const l = document.getElementById('mm-largo').value;
  const d = document.getElementById('mm-detalle').value;
  document.getElementById('mm-preview-talla').textContent = t || '?';
  document.getElementById('mm-preview-largo').textContent = l || '';
  document.getElementById('mm-preview-detalle').textContent = d || '';
}

async function abrirSelectorOtraTalla(idFila) {
  const row = document.getElementById(`ttrazo-${idFila}`);
  const keyPrincipal = row?.querySelector('[data-ttrazo-key]')?.value.trim();
  const p = parsearKey(keyPrincipal);
  if (!p) return;

  miniModalContext = { tipo: 'otraTalla', idFila, cod: p.cod };
  const prenda = CATALOGO[p.cod];

  // Mostrar todas las keys del mismo cod agrupadas por talla, excluyendo la principal
  const todas = (prenda.keys || [])
    .map(k => ({ key: k, ...parsearKey(k) }))
    .filter(x => x && x.cod === p.cod && x.key !== keyPrincipal);
  const grupos = {};
  todas.forEach(x => {
    const t = x.talla || 0;
    if (!grupos[t]) grupos[t] = [];
    grupos[t].push(x);
  });
  const tallas = Object.keys(grupos).map(Number).sort((a,b) => b - a);

  document.getElementById('mm-title').textContent = `Elegir otra talla · ${prenda.nombre}`;
  const body = document.getElementById('mm-body');
  let html = '<div class="field"><label>Elegir talla del catálogo</label><select id="mm-select" size="10" style="height:auto">';
  tallas.forEach(t => {
    html += `<optgroup label="Talla ${t}">`;
    grupos[t].sort((a,b) => (b.largo||0) - (a.largo||0));
    grupos[t].forEach(x => {
      const desc = [x.largo?`largo ${x.largo}`:null, x.detalle].filter(Boolean).join(' · ') || 'sola';
      html += `<option value="${x.key}">${x.key}  (${desc})</option>`;
    });
    html += `</optgroup>`;
  });
  html += '</select></div>';
  body.innerHTML = html;
  document.getElementById('mini-modal').classList.add('active');
}

async function confirmarMiniModal() {
  if (!miniModalContext) return;
  const ctx = miniModalContext;

  if (ctx.tipo === 'keyNueva') {
    const t = parseInt(document.getElementById('mm-talla').value);
    const l = document.getElementById('mm-largo').value ? parseInt(document.getElementById('mm-largo').value) : null;
    const d = document.getElementById('mm-detalle').value.trim() || null;
    if (!t) { alert('Talla es obligatoria'); return; }
    const nuevaKey = construirKey(ctx.cod, t, l, d);
    // Guardar en catálogo
    try {
      await supaFetch('catalogo_key','POST',{ cod_prenda: ctx.cod, key: nuevaKey });
    } catch(e) { console.warn('catalogo_key:', e.message); }
    if (!CATALOGO[ctx.cod].keys.includes(nuevaKey)) CATALOGO[ctx.cod].keys.push(nuevaKey);

    cerrarMiniModal();
    // Resetear el select y asignar
    const row = document.getElementById(`ttrazo-${ctx.idFila}`);
    const sel = row?.querySelector('[data-ttrazo-complemento]');
    if (sel) sel.value = '';
    await asignarComplementoPorKey(ctx.idFila, nuevaKey);
    return;
  }

  if (ctx.tipo === 'otraTalla') {
    const sel = document.getElementById('mm-select');
    if (!sel || !sel.value) { alert('Elegí una talla'); return; }
    const keyElegida = sel.value;
    cerrarMiniModal();
    const rowSel = document.getElementById(`ttrazo-${ctx.idFila}`).querySelector('[data-ttrazo-complemento]');
    if (rowSel) rowSel.value = '';
    await asignarComplementoPorKey(ctx.idFila, keyElegida);
    return;
  }

  if (ctx.tipo === 'unirBultos') {
    await ejecutarUnion();
    return;
  }
}

function cerrarMiniModal() {
  document.getElementById('mini-modal').classList.remove('active');
  // Restaurar texto por defecto del botón OK
  const btnOk = document.getElementById('mm-ok');
  if (btnOk) btnOk.textContent = 'Agregar';
  // Si el select de complemento quedó con valor especial y no se confirmó, volver a vacío
  if (miniModalContext?.idFila) {
    const row = document.getElementById(`ttrazo-${miniModalContext.idFila}`);
    const sel = row?.querySelector('[data-ttrazo-complemento]');
    if (sel && ['__otra__','__mas_grande__','__nueva__'].includes(sel.value)) {
      sel.value = '';
    }
  }
  miniModalContext = null;
}

function recolectarTallasTrazo() {
  const tallas = [];
  document.querySelectorAll('.talla-row').forEach(row => {
    const idLocal = row.dataset.ttId;
    const letra = (row.querySelector('[data-ttrazo-letra]')?.value || '').toUpperCase().trim();
    const prenda = row.querySelector('[data-ttrazo-prenda]')?.value || null;
    const key = row.querySelector('[data-ttrazo-key]')?.value.trim() || '';
    const tipoEl = row.querySelector('[data-ttrazo-tipo].active');
    const tipo = tipoEl ? tipoEl.dataset.ttrazoTipo : 'completa';
    // Complemento: solo aplica si es par y está en el dataset
    const complementoKey = (tipo === 'par') ? (row.dataset.keyComplemento || null) : null;
    if (letra && key) tallas.push({ idLocal, letra, key, tipo, prenda, complementoKey, orden: tallas.length + 1 });
  });
  return tallas;
}

async function guardarTrazo() {
  const fecha = document.getElementById('t-fecha').value;
  const letraCorte = (document.getElementById('t-letra-corte').value||'').toUpperCase().trim();
  if (!fecha) { mostrarAlerta('trazo','error','Fecha es obligatoria.'); return; }
  if (!letraCorte) { mostrarAlerta('trazo','error','Letra del corte es obligatoria.'); return; }
  if (coloresSeleccionados.size === 0) { mostrarAlerta('trazo','error','Elegí al menos un color de tela.'); return; }

  const tallas = recolectarTallasTrazo();
  if (tallas.length === 0) { mostrarAlerta('trazo','error','Agregá al menos 1 talla marcada con letra y KEY.'); return; }

  const letras = tallas.map(t => t.letra);
  if (new Set(letras).size !== letras.length) { mostrarAlerta('trazo','error','Las letras de tallas deben ser únicas.'); return; }

  const parsSinComp = tallas.filter(t => t.tipo === 'par' && !t.complementoKey);
  if (parsSinComp.length > 0) {
    if (!confirm(`Hay ${parsSinComp.length} talla(s) "par" sin complemento asignado. ¿Guardar igual?`)) return;
  }

  const btn = document.getElementById('btn-guardar-trazo');
  btn.textContent = '⏳ Guardando...';
  btn.disabled = true;

  try {
    const [trazo] = await supaFetch('trazo','POST',{
      fecha,
      codigo_corte: letraCorte,
      letra_corte: letraCorte,
      colores_tela: [...coloresSeleccionados],
      capas: parseInt(document.getElementById('t-capas').value) || null,
      yardas_estimadas: parseFloat(document.getElementById('t-yardas').value) || null,
      tallas_tendido: tallas.map(t=>t.key).join(', '),
      observaciones: document.getElementById('t-observaciones').value || null,
      video_url: document.getElementById('t-video-url').value.trim() || null,
    });

    // Insertar todas las tallas con complemento en una sola pasada
    for (const t of tallas) {
      await supaFetch('trazo_talla_marcada','POST',{
        trazo_id: trazo.id,
        letra_local: t.letra,
        talla_key_original: t.key,
        talla_key_complemento: (t.tipo === 'par' && t.complementoKey) ? t.complementoKey : null,
        tipo: t.tipo,
        multiplicidad: 1,
        cod_prenda: t.prenda,
        orden: t.orden,
      });
    }

    if (fotoBlob) {
      try {
        const fotoUrl = await supaUploadFoto(fotoBlob, trazo.id);
        await supaUpdate('trazo', trazo.id, { foto_url: fotoUrl });
      } catch(e) { console.warn('Foto:', e); }
    }

    mostrarAlerta('trazo','success',`✅ Trazo ${letraCorte} guardado con ${tallas.length} talla(s).`);
    setTimeout(() => { btn.textContent='💾 Guardar trazo'; btn.disabled=false; initTrazo(); }, 1800);
  } catch(e) {
    mostrarAlerta('trazo','error','Error: ' + e.message);
    btn.textContent = '💾 Guardar trazo';
    btn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════════════
// TENDIDO

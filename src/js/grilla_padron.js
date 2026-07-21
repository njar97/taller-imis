// ══════════════════════════════════════════════════════════════════════
// GRILLA DEL PADRÓN — vista tipo Excel para captura/corrección masiva
// Toggle "⚡ Grilla" en Registro→Alumnos. Reusa header/filtros/orden de
// alumnos_global.js (renderAlumnosGlobal delega acá cuando vistaGrilla).
//   · Edición inline: click o empezar a escribir. Enter baja, Tab avanza,
//     Shift+Tab retrocede, ↑/↓ navegan, Esc cancela.
//   · Pegar desde Excel: un bloque multilínea en una celda rellena hacia
//     abajo la misma columna (sobre las filas visibles).
//   · Guardado automático por celda (optimista, chip de estado arriba).
//   · Talla fuera de catálogo → celda amarilla (se guarda igual, criterio
//     de la app: combinaciones nuevas permitidas).
//   · Panel lateral con resumen vivo de tallas del filtro actual.
// ══════════════════════════════════════════════════════════════════════

// Página adaptativa: en el celular menos filas (DOM 4× más liviano)
function gpPageSize() { return window.innerWidth <= 640 ? 50 : 200; }

let gpState = {
  pendientes: 0,     // guardados en vuelo
  errores: 0,        // guardados fallidos (se limpia al reintentar)
  resumenAbierto: window.innerWidth >= 900,
  largoDraft: {},    // alumnoId → largo tecleado cuando aún falta talla (o viceversa)
};

function toggleVistaGrilla() {
  alumnosGlobalCache.vistaGrilla = !alumnosGlobalCache.vistaGrilla;
  renderAlumnosGlobal();
}

function gpEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Valores mostrados por columna ────────────────────────────────────

// La KEY menos el prefijo de prenda ("P1075" → "1075"). Si la KEY no se
// puede descomponer en talla+largo estándar (sufijos tipo "12-3L", "65X"),
// la celda de talla muestra/edita el resto VERBATIM y largo queda vacío —
// así nunca se pierde información al reguardar.
function gpRestKey(prenda, key) {
  const pref = AE_PRENDA_PREFIX[prenda] || '';
  return key.startsWith(pref) ? key.slice(pref.length) : key;
}
function gpBotDescompuesta(a) {
  if (!a.talla_bottom_key) return { talla: '', largo: '', raw: false };
  const rest = gpRestKey(a.prenda_bottom, a.talla_bottom_key);
  const p = aeParsearKey(a.prenda_bottom, a.talla_bottom_key);
  const rearmada = (p.tallaNum || '') + (p.largo || '');
  if (aeUsaLargo(a.prenda_bottom) && p.tallaNum && rearmada === rest) {
    return { talla: p.tallaNum, largo: p.largo, raw: false };
  }
  if (!aeUsaLargo(a.prenda_bottom) && p.tallaNum === rest) {
    return { talla: rest, largo: '', raw: false };
  }
  return { talla: rest, largo: '', raw: true };  // no estándar → verbatim
}
function gpTallaTop(a) {
  if (!a.talla_top_key) return '';
  return gpRestKey(a.prenda_top, a.talla_top_key);
}
function gpTallaBot(a) { return gpBotDescompuesta(a).talla; }
function gpLargoBot(a) {
  if (!a.talla_bottom_key) return gpState.largoDraft[a.id] || '';
  return gpBotDescompuesta(a).largo;
}

// El nombre NO se edita inline: tap en el nombre abre la FICHA COMPLETA
// (modal con observaciones, prenda manual, estado de empaque y desempacar
// — todo lo que la vista de tarjetas daba). Columna congelada a la izquierda.
const GP_COLS_DEF = [
  { k: 'nombre',     label: 'Nombre',  edit: false, ficha: true, sticky: true, min: '130px',
    get: a => a.nombre || '' },
  { k: 'grado',      label: 'Grado',   edit: true,  min: '58px',  get: a => a.grado || '' },
  { k: 'sexo',       label: 'Sexo',    edit: true,  min: '44px',  soloPC: true, get: a => a.sexo || '' },
  { k: 'escuela',    label: 'Escuela', edit: false, min: '80px',  soloPC: true,
    get: a => { const e = alumnosGlobalCache.escuelas[a.escuela_id]; return e ? (e.alias || e.nombre) : ''; } },
  { k: 'prenda_top', label: 'Prenda top', labelMovil: 'P.', edit: false, min: '96px', minMovil: '34px',
    get: a => a.prenda_top || '',
    getMovil: a => (a.prenda_top && typeof _codPrenda === 'function') ? _codPrenda(a.prenda_top) : (a.prenda_top || '') },
  { k: 'talla_top',  label: 'T. top',  edit: true,  min: '52px',  get: gpTallaTop },
  { k: 'prenda_bot', label: 'Prenda bot', labelMovil: 'P.', edit: false, min: '96px', minMovil: '34px',
    get: a => a.prenda_bottom || '',
    getMovil: a => (a.prenda_bottom && typeof _codPrenda === 'function') ? _codPrenda(a.prenda_bottom) : (a.prenda_bottom || '') },
  { k: 'talla_bot',  label: 'T. bot',  edit: true,  min: '52px',  get: gpTallaBot },
  { k: 'largo_bot',  label: 'Largo',   edit: true,  min: '52px',  get: gpLargoBot },
  { k: 'estados',    label: '📦',      edit: false, min: '52px',
    get: a => {
      const ic = e => e === 'empacado' ? '✅' : (e === 'entregado' ? '🚚' : '⬜');
      return ic(a.estado_top) + ic(a.estado_bottom);
    } },
];

// Columnas activas según pantalla (en móvil: sin sexo/escuela, prendas abreviadas)
function gpColsActivas() {
  const movil = window.innerWidth <= 640;
  return GP_COLS_DEF
    .filter(c => !(movil && c.soloPC))
    .map(c => movil ? {
      ...c,
      label: c.labelMovil || c.label,
      min: c.minMovil || c.min,
      get: c.getMovil || c.get,
    } : c);
}

// ── Validación visual: ¿la talla está en el catálogo de la prenda? ───

function gpTallaEnCatalogo(prenda, talla) {
  if (!prenda || !talla) return true;
  const opts = aeOpcionesParaPrenda(prenda);
  return opts.tallas.length === 0 || opts.tallas.includes(String(talla));
}

function gpCeldaEstilo(a, col) {
  // rojo suave = incompleto/inguardable, amarillo = fuera de catálogo
  if (col.k === 'talla_top' && a.talla_top_key &&
      !gpTallaEnCatalogo(a.prenda_top, gpTallaTop(a))) return 'background:#FFF7D6';
  if (col.k === 'talla_bot' && a.talla_bottom_key &&
      !gpTallaEnCatalogo(a.prenda_bottom, gpTallaBot(a))) return 'background:#FFF7D6';
  if (col.k === 'talla_top' && !a.talla_top_key) return 'background:#FFF1EC';
  if ((col.k === 'talla_bot' || col.k === 'largo_bot') && !a.talla_bottom_key) return 'background:#FFF1EC';
  return '';
}

// ── Render principal (llamado desde renderAlumnosGlobal) ─────────────

function renderGrillaPadron(cont, header, lista) {
  const c = alumnosGlobalCache;

  // Catálogo de grados en background (para mapear grado→nivel/ciclo al editar)
  if (!window._gradoCatalogoCache && typeof _cargarCatalogoGradosCache === 'function') {
    _cargarCatalogoGradosCache().catch(() => {});
  }
  // Tallas custom registradas en catalogo_key → que salgan en los plegables
  if (!window._gpCatCustomOk && typeof cargarCatalogoCustom === 'function') {
    window._gpCatCustomOk = true;
    Promise.resolve(cargarCatalogoCustom()).catch(() => {});
  }

  if (typeof c.pagina !== 'number' || c.pagina < 1) c.pagina = 1;
  const PAG = gpPageSize();
  gpState._lista = lista;          // para "🎯 próximo sin tallar"
  gpState._cols = gpColsActivas(); // columnas según pantalla
  const totalPaginas = Math.max(1, Math.ceil(lista.length / PAG));
  if (c.pagina > totalPaginas) c.pagina = totalPaginas;
  const inicio = (c.pagina - 1) * PAG;
  const visible = lista.slice(inicio, inicio + PAG);

  const filas = visible.map(a => `<tr data-id="${a.id}">${gpRowCeldas(a)}</tr>`).join('');

  const paginacion = totalPaginas > 1 ? `
    <div style="display:flex;gap:8px;align-items:center;justify-content:center;padding:8px">
      <button class="btn btn-sm btn-ghost" ${c.pagina<=1?'disabled':''} onclick="irPaginaAlumnos(${c.pagina-1})">◀</button>
      <span style="font-size:12px;color:#666">Página ${c.pagina}/${totalPaginas} · ${lista.length.toLocaleString()} filas</span>
      <button class="btn btn-sm btn-ghost" ${c.pagina>=totalPaginas?'disabled':''} onclick="irPaginaAlumnos(${c.pagina+1})">▶</button>
    </div>` : '';

  cont.innerHTML = header + `
    <div class="card" style="padding:8px 10px;margin-bottom:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-sm btn-ghost" onclick="toggleVistaGrilla()">📇 Volver a tarjetas</button>
      <button class="btn btn-sm btn-primary" onclick="gpIrProximoSinTallar()" title="Salta al primer alumno del filtro al que le falta alguna talla y abre el editor ahí">🎯 Próximo sin tallar</button>
      <span id="gp-status" style="font-size:12px;color:#888">${gpStatusTxt()}</span>
      <button class="btn btn-sm btn-ghost" style="margin-left:auto" onclick="gpToggleResumen()">
        ${gpState.resumenAbierto ? '▤ Ocultar resumen' : '▤ Resumen de tallas'}</button>
      <span style="font-size:11px;color:#aaa;flex-basis:100%">
        ✏️ Celda = editar (Enter ↓ · Tab →) · <strong>tap en el nombre = ficha completa</strong> (observaciones, empaque) · pegá columnas de Excel</span>
    </div>
    <div style="display:flex;gap:10px;align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div class="card" style="padding:0;overflow-x:auto">
          <table id="gp-tabla" style="border-collapse:collapse;width:100%;font-size:13px">
            <thead><tr>
              ${gpState._cols.map(col => `<th style="position:sticky;top:0;${col.sticky ? 'left:0;z-index:3;' : 'z-index:1;'}background:#F5F7FA;border-bottom:2px solid var(--borde);padding:6px 8px;text-align:left;min-width:${col.min};white-space:nowrap">${col.label}</th>`).join('')}
            </tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
        ${paginacion}
      </div>
      <div id="gp-resumen" style="${gpState.resumenAbierto ? '' : 'display:none;'}width:230px;flex-shrink:0;position:sticky;top:8px;max-height:80vh;overflow-y:auto">
        ${gpResumenHtml(lista)}
      </div>
    </div>`;

  const tabla = document.getElementById('gp-tabla');
  if (tabla) tabla.addEventListener('mousedown', gpOnCeldaClick);
}

const GP_TD_BASE = 'border-bottom:1px solid #EEE;padding:4px 8px;white-space:nowrap;';

function gpRowCeldas(a) {
  const cols = gpState._cols || gpColsActivas();
  return cols.map(col => {
    const v = col.get(a);
    const st = gpCeldaEstilo(a, col);
    if (col.ficha) {
      // Nombre: congelado a la izquierda; tap = ficha completa del alumno
      return `<td style="${GP_TD_BASE}position:sticky;left:0;background:white;z-index:1;cursor:pointer;font-weight:600;max-width:150px;overflow:hidden;text-overflow:ellipsis"
        onclick="editarAlumnoRapido('${a.id}')"
        title="Abrir ficha completa (observaciones, empaque, prenda manual)">${gpEsc(v)}</td>`;
    }
    return col.edit
      ? `<td data-col="${col.k}" style="${GP_TD_BASE}cursor:text;${st}" title="Click para editar">${gpEsc(v)}</td>`
      : `<td style="${GP_TD_BASE}color:#888;${st}">${gpEsc(v)}</td>`;
  }).join('');
}

function gpStatusTxt() {
  if (gpState.errores > 0) return `⚠️ ${gpState.errores} error(es) al guardar — celda roja, reintentá`;
  if (gpState.pendientes > 0) return `💾 Guardando ${gpState.pendientes}…`;
  return '✓ Todo guardado';
}
function gpRefreshStatus() {
  const el = document.getElementById('gp-status');
  if (el) el.textContent = gpStatusTxt();
}
function gpToggleResumen() {
  gpState.resumenAbierto = !gpState.resumenAbierto;
  renderAlumnosGlobal();
}

// ── Resumen vivo de tallas (sobre TODO el filtro, no solo la página) ─

function gpResumenHtml(lista) {
  // Misma definición que Estadística→Por talla: el conteo principal son las
  // piezas PENDIENTES (sin empacar/entregar); las ya listas se muestran
  // aparte por prenda — así los números cuadran entre los dos menús.
  const conteo = {};      // prenda → talla → n pendientes
  const listas = {};      // prenda → n empacadas/entregadas
  const pieza = (a, prenda, talla, estado) => {
    if (!prenda || !talla) return;
    if (estado === 'empacado' || estado === 'entregado') {
      listas[prenda] = (listas[prenda] || 0) + 1;
      return;
    }
    (conteo[prenda] = conteo[prenda] || {})[talla] = (conteo[prenda][talla] || 0) + 1;
  };
  for (const a of lista) {
    pieza(a, a.prenda_top, gpTallaTop(a), a.estado_top);
    pieza(a, a.prenda_bottom, gpTallaBot(a), a.estado_bottom);
  }
  const sinTop = lista.filter(x => !x.talla_top_key).length;
  const sinBot = lista.filter(x => !x.talla_bottom_key).length;
  const prendas = [...new Set([...Object.keys(conteo), ...Object.keys(listas)])].sort();
  const bloques = prendas.map(p => {
    const tallas = Object.entries(conteo[p] || {})
      .sort((x, y) => (parseInt(x[0], 10) || 999) - (parseInt(y[0], 10) || 999));
    const tot = tallas.reduce((s, t) => s + t[1], 0);
    return `
      <div style="margin-bottom:10px">
        <div style="font-weight:700;font-size:12px;border-bottom:1px solid var(--borde);padding-bottom:2px;margin-bottom:4px">${gpEsc(p)} <span style="color:#888;font-weight:400">· ${tot} pend.</span></div>
        ${tallas.map(([t, n]) => `
          <div style="display:flex;justify-content:space-between;font-size:12px;padding:1px 2px">
            <span>${gpEsc(t)}</span><strong>${n}</strong>
          </div>`).join('') || '<div style="color:#aaa;font-size:11px;padding:1px 2px">sin pendientes</div>'}
        ${listas[p] ? `<div style="font-size:11px;color:var(--verde);padding:1px 2px">✓ ${listas[p]} ya empacada(s)</div>` : ''}
      </div>`;
  }).join('');
  return `
    <div class="card" style="padding:10px">
      <div style="font-weight:700;font-size:13px;margin-bottom:2px">▤ Tallas pendientes</div>
      <div style="font-size:10px;color:#888;margin-bottom:8px">Del filtro actual · misma cuenta que Estadística→Por talla</div>
      ${bloques || '<div style="color:#aaa;font-size:12px">Sin tallas aún</div>'}
      ${(sinTop || sinBot) ? `<div style="font-size:11px;color:#c44;border-top:1px dashed var(--borde);padding-top:6px">⚠️ Falta top: ${sinTop} · bottom: ${sinBot}</div>` : ''}
    </div>`;
}

function gpRefreshResumen() {
  const el = document.getElementById('gp-resumen');
  if (!el || !gpState.resumenAbierto) return;
  el.innerHTML = gpResumenHtml(aplicarFiltrosAlumnos(alumnosGlobalCache));
}

// ── Edición inline ───────────────────────────────────────────────────

function gpOnCeldaClick(ev) {
  const td = ev.target.closest('td[data-col]');
  if (!td || td.querySelector('input')) return;
  ev.preventDefault();
  gpAbrirEditor(td);
}

function gpAbrirEditor(td, valorInicial) {
  const valor = valorInicial != null ? valorInicial : td.textContent;
  td.dataset.prev = td.textContent;
  td.innerHTML = `<input type="text" value="${gpEsc(valor)}"
    style="width:100%;min-width:40px;border:2px solid var(--azul);border-radius:3px;padding:3px 5px;font-size:13px;box-sizing:border-box">`;
  const input = td.querySelector('input');
  input.focus();
  if (valorInicial == null) input.select();
  input.addEventListener('keydown', e => gpTeclado(e, td));
  input.addEventListener('paste', e => gpPegar(e, td));
  input.addEventListener('input', () => { if (_gpPicker) _gpPicker.render(input.value.trim()); });
  input.addEventListener('blur', () => {
    gpPickerCerrar();
    // blur sin tecla (tap fuera en móvil) = commit sin mover
    if (td.querySelector('input')) gpCommitCelda(td, 0, 0);
  });
  // Plegable de tallas/largos válidos para la prenda del alumno
  const col = td.dataset.col;
  if (col === 'talla_top' || col === 'talla_bot' || col === 'largo_bot') {
    const a = gpAlumno(td.closest('tr').dataset.id);
    if (a) gpPickerAbrir(td, col, a, input);
  }
}

// ── Plegable de tallas (tap en celda de talla → chips del catálogo) ──
// Lo que se escriba a mano y no esté, se guarda igual (celda 🟡) y se
// REGISTRA en catalogo_key → aparece en las listas desde ese momento.
let _gpPicker = null;

function gpPickerCerrar() {
  if (_gpPicker) { _gpPicker.el.remove(); _gpPicker = null; }
}

function gpPickerAbrir(td, col, a, input) {
  gpPickerCerrar();
  const prenda = col === 'talla_top' ? a.prenda_top : a.prenda_bottom;
  if (!prenda) return;  // sin prenda no hay catálogo (el commit ya avisa)
  const opts = aeOpcionesParaPrenda(prenda);
  const lista = col === 'largo_bot' ? opts.largos : opts.tallas;
  if (!lista || lista.length === 0) return;

  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;z-index:3000;background:white;border:1px solid var(--borde);border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,0.25);padding:8px;width:264px';
  document.body.appendChild(el);
  const rect = td.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 280));
  el.style.left = left + 'px';
  // Debajo de la celda; si no cabe, arriba
  if (rect.bottom + 230 < window.innerHeight) el.style.top = (rect.bottom + 4) + 'px';
  else el.style.bottom = (window.innerHeight - rect.top + 4) + 'px';

  const render = (filtro) => {
    const fil = filtro ? lista.filter(t => String(t).startsWith(filtro)) : lista;
    el.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:4px;max-height:170px;overflow-y:auto">
        ${fil.map(t => `<button data-val="${gpEsc(t)}" style="min-width:46px;padding:7px 8px;border:1px solid var(--borde);border-radius:8px;background:${String(t) === (td.dataset.prev || '').trim() ? '#E8F0FE' : '#F8FAFC'};font-weight:600;font-size:13px;font-family:monospace">${gpEsc(t)}</button>`).join('')
          || '<span style="color:#aaa;font-size:12px;padding:4px">Ninguna empieza con eso…</span>'}
      </div>
      <div style="font-size:10px;color:#888;border-top:1px dashed var(--borde);margin-top:6px;padding-top:5px">
        ¿No está? Escribila igual y Enter — se guarda 🟡 y <strong>se agrega al catálogo</strong> para la próxima.
      </div>`;
  };
  // mousedown (no click): evita robarle el foco al input
  el.addEventListener('mousedown', ev => {
    ev.preventDefault();
    const b = ev.target.closest('button[data-val]');
    if (!b) return;
    input.value = b.dataset.val;
    gpPickerCerrar();
    gpCommitCelda(td, 1, 0);  // igual que Enter: guarda y baja a la siguiente fila
  });
  render((input.value || '').trim() && valorInicialDistinto(td, input) ? input.value.trim() : '');
  _gpPicker = { el, render };
}

// Si el editor abrió con el valor existente (seleccionado), no filtrar de entrada
function valorInicialDistinto(td, input) {
  return (td.dataset.prev || '').trim() !== input.value.trim();
}

// Registrar una talla/KEY nueva en el catálogo compartido (tabla catalogo_key,
// la misma que usa Trazo) — desde entonces sale en todos los plegables.
async function gpRegistrarTallaNueva(prenda, key) {
  const cod = AE_PRENDA_PREFIX[prenda];
  if (!cod || !key) return;
  const cat = (typeof CATALOGO !== 'undefined' ? CATALOGO : CATALOGO_BASE)[cod];
  if (!cat || cat.keys.includes(key)) return;
  cat.keys.push(key);
  try {
    await supaFetch('catalogo_key', 'POST', { cod_prenda: cod, key });
    console.log('[grilla] talla nueva registrada en catálogo:', key);
  } catch (e) {
    console.warn('[grilla] catalogo_key:', e.message);
  }
}

function gpTeclado(e, td) {
  if (e.key === 'Enter')  { e.preventDefault(); gpCommitCelda(td, e.shiftKey ? -1 : 1, 0); }
  else if (e.key === 'Tab') { e.preventDefault(); gpCommitCelda(td, 0, e.shiftKey ? -1 : 1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); gpCommitCelda(td, 1, 0); }
  else if (e.key === 'ArrowUp')   { e.preventDefault(); gpCommitCelda(td, -1, 0); }
  else if (e.key === 'Escape') {
    e.preventDefault();
    gpPickerCerrar();
    td.innerHTML = gpEsc(td.dataset.prev || '');
  }
}

// Commit del valor de la celda + mover el cursor (dr filas, dc columnas)
function gpCommitCelda(td, dr, dc) {
  gpPickerCerrar();
  const input = td.querySelector('input');
  if (!input) return;
  const valor = input.value.trim();
  const tr = td.closest('tr');
  const id = tr.dataset.id;
  const col = td.dataset.col;

  td.innerHTML = gpEsc(valor);  // pintar ya (optimista); gpGuardar corrige después

  if (valor !== (td.dataset.prev || '').trim()) {
    gpGuardar(id, col, valor, td);
  }
  if (dr || dc) gpMover(tr, td, dr, dc);
}

function gpMover(tr, td, dr, dc) {
  const editables = Array.from(tr.querySelectorAll('td[data-col]'));
  let idx = editables.indexOf(td);
  let objetivo = null;
  if (dc) {
    idx += dc;
    if (idx >= 0 && idx < editables.length) objetivo = editables[idx];
    else {
      // salto de fila al pasar del borde
      const trN = dc > 0 ? tr.nextElementSibling : tr.previousElementSibling;
      if (trN) {
        const eds = trN.querySelectorAll('td[data-col]');
        objetivo = dc > 0 ? eds[0] : eds[eds.length - 1];
      }
    }
  } else if (dr) {
    let trN = dr > 0 ? tr.nextElementSibling : tr.previousElementSibling;
    if (trN) {
      const eds = Array.from(trN.querySelectorAll('td[data-col]'));
      objetivo = eds[editables.indexOf(td)] || eds[0];
    }
  }
  if (objetivo) {
    objetivo.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    gpAbrirEditor(objetivo);
  }
}

// Pegado multilínea: rellena hacia abajo la misma columna
function gpPegar(e, td) {
  const texto = (e.clipboardData || window.clipboardData).getData('text');
  if (!texto || !/[\r\n]/.test(texto.trim())) return;  // una sola celda → paste normal
  e.preventDefault();
  const valores = texto.split(/\r?\n/).map(s => s.trim()).filter((s, i, arr) => !(s === '' && i === arr.length - 1));
  const col = td.dataset.col;
  let tr = td.closest('tr');
  let n = 0;
  for (const v of valores) {
    if (!tr) break;
    const celda = Array.from(tr.querySelectorAll('td[data-col]')).find(x => x.dataset.col === col);
    if (celda) {
      const inp = celda.querySelector('input');
      if (inp) celda.innerHTML = gpEsc(v);
      else celda.textContent = v;
      gpGuardar(tr.dataset.id, col, v, celda);
      n++;
    }
    tr = tr.nextElementSibling;
  }
  console.log(`[grilla] pegadas ${n} celda(s) en columna ${col}`);
  const st = document.getElementById('gp-status');
  if (st) st.textContent = `📋 Pegadas ${n} celda(s)…`;
}

// ── Guardado ─────────────────────────────────────────────────────────

function gpAlumno(id) {
  return alumnosGlobalCache.alumnos.find(a => a.id === id);
}

// Construye el payload para la columna editada. Devuelve null si el valor
// no alcanza para guardar (ej: talla de pantalón sin largo todavía).
function gpPayload(a, col, valor) {
  const p = { actualizado_en: new Date().toISOString() };
  if (col === 'nombre') {
    if (!valor) return { error: 'El nombre no puede quedar vacío' };
    p.nombre = valor;
    return { payload: p };
  }
  if (col === 'grado') {
    p.grado = valor || null;
    const cat = (window._gradoCatalogoCache || []).find(g => g.grado === valor);
    if (cat) { p.nivel = cat.nivel; p.ciclo = cat.ciclo; }
    else if (valor && typeof nivelDesdeGrado === 'function') p.nivel = nivelDesdeGrado(valor);
    gpSugerirPrendas(a, p);
    return { payload: p };
  }
  if (col === 'sexo') {
    const s = valor.toUpperCase();
    if (valor && s !== 'M' && s !== 'F') return { error: 'Sexo: M o F' };
    p.sexo = valor ? s : null;
    gpSugerirPrendas(a, p);
    return { payload: p };
  }
  if (col === 'talla_top') {
    if (!valor) { p.talla_top_key = null; return { payload: p }; }
    const prenda = a.prenda_top || gpSugerirPrendas(a, p, 'top');
    if (!prenda) return { error: 'Definí sexo y grado primero (para saber la prenda)' };
    p.talla_top_key = (AE_PRENDA_PREFIX[prenda] || '') + valor;
    return { payload: p, warn: !gpTallaEnCatalogo(prenda, valor) };
  }
  if (col === 'talla_bot' || col === 'largo_bot') {
    const prenda = a.prenda_bottom || gpSugerirPrendas(a, p, 'bottom');
    if (!prenda) return { error: 'Definí sexo y grado primero (para saber la prenda)' };
    const actual = gpBotDescompuesta(a);
    const talla = col === 'talla_bot' ? valor : actual.talla;
    const largo = col === 'largo_bot' ? valor : (actual.largo || gpState.largoDraft[a.id] || '');
    if (col === 'largo_bot') gpState.largoDraft[a.id] = valor;
    if (!talla) { p.talla_bottom_key = null; return { payload: p }; }
    // Talla con letras/sufijo → KEY verbatim (prefijo + lo tecleado), sin
    // exigir largo. Solo el formato numérico estándar arma talla+largo.
    const esNumerica = /^\d+$/.test(talla);
    if (esNumerica && aeUsaLargo(prenda) && !largo) {
      return { pendiente: 'Falta el largo para armar la KEY (celda naranja)' };
    }
    p.talla_bottom_key = (AE_PRENDA_PREFIX[prenda] || '') + talla +
      (esNumerica && aeUsaLargo(prenda) ? largo : '');
    delete gpState.largoDraft[a.id];
    return { payload: p, warn: !esNumerica || !gpTallaEnCatalogo(prenda, talla) };
  }
  return { error: 'Columna desconocida' };
}

// Si el alumno no tiene prenda definida, sugerirla por sexo+nivel (mismo
// criterio que el modal de edición). Muta el payload y devuelve la prenda.
function gpSugerirPrendas(a, payload, slot) {
  const sexo = payload.sexo !== undefined ? payload.sexo : a.sexo;
  const nivel = payload.nivel !== undefined ? payload.nivel : a.nivel;
  if (!sexo || !nivel) return '';
  const sug = aeSugerirPrenda(sexo, nivel);
  if (!a.prenda_top && sug.top) payload.prenda_top = sug.top;
  if (!a.prenda_bottom && sug.bottom) payload.prenda_bottom = sug.bottom;
  if (slot === 'top') return a.prenda_top || sug.top || '';
  if (slot === 'bottom') return a.prenda_bottom || sug.bottom || '';
  return '';
}

async function gpGuardar(id, col, valor, td) {
  const a = gpAlumno(id);
  if (!a) return;
  const r = gpPayload(a, col, valor);

  if (r.error) {
    td.style.background = '#FDDCDC';
    td.title = r.error;
    return;
  }
  if (r.pendiente) {
    td.style.background = '#FFE8CC';
    td.title = r.pendiente;
    // guardar el borrador en memoria ya quedó en gpState.largoDraft
    return;
  }

  gpState.pendientes++;
  gpRefreshStatus();
  try {
    await supaUpdate('alumno', id, r.payload);
    Object.assign(a, r.payload);
    if (typeof _persistAlumnosCache === 'function') _persistAlumnosCache();
    // Talla fuera de catálogo guardada → registrarla para que salga en los
    // plegables de toda la app (grilla, trazo, entrada de bodega) desde ya
    if (r.warn) {
      const prendaKey = (col === 'talla_top') ? a.prenda_top : a.prenda_bottom;
      const keyNueva = (col === 'talla_top') ? r.payload.talla_top_key : r.payload.talla_bottom_key;
      if (prendaKey && keyNueva) gpRegistrarTallaNueva(prendaKey, keyNueva);
    }
    td.style.background = r.warn ? '#FFF7D6' : '#E7F6EA';
    td.title = r.warn ? 'Talla fuera del catálogo (guardada igual)' : '';
    setTimeout(() => { if (!r.warn) td.style.background = ''; }, 900);
    // refrescar celdas derivadas de la fila (prenda sugerida, KEY, estados)
    gpRefrescarFila(id);
    gpRefreshResumen();
  } catch (e) {
    console.error('[grilla] guardar', col, e);
    gpState.errores++;
    td.style.background = '#FDDCDC';
    td.title = 'Error al guardar: ' + e.message + ' — editá la celda de nuevo para reintentar';
  } finally {
    gpState.pendientes--;
    gpRefreshStatus();
  }
}

// 🎯 Salta al primer alumno del filtro con alguna talla faltante y abre el
// editor en esa celda — captura en cadena sin buscar a mano (el equivalente
// grilla del "Guardar y siguiente" del modal).
function gpIrProximoSinTallar() {
  const lista = gpState._lista || [];
  const idx = lista.findIndex(a => !a.talla_top_key || !a.talla_bottom_key);
  if (idx < 0) {
    if (typeof showToast === 'function') showToast('🎉 Todos los alumnos del filtro tienen sus tallas', 'success');
    else alert('🎉 Todos los alumnos del filtro tienen sus tallas.');
    return;
  }
  const a = lista[idx];
  const c = alumnosGlobalCache;
  c.pagina = Math.floor(idx / gpPageSize()) + 1;
  renderAlumnosGlobal();
  setTimeout(() => {
    const col = !a.talla_top_key ? 'talla_top' : 'talla_bot';
    const td = document.querySelector(`#gp-tabla tr[data-id="${a.id}"] td[data-col="${col}"]`);
    if (td) {
      td.scrollIntoView({ block: 'center', inline: 'nearest' });
      gpAbrirEditor(td);
    }
  }, 80);
}

function gpRefrescarFila(id) {
  const tr = document.querySelector(`#gp-tabla tr[data-id="${id}"]`);
  const a = gpAlumno(id);
  if (!tr || !a) return;
  if (tr.querySelector('input')) return;  // no pisar una edición en curso
  tr.innerHTML = gpRowCeldas(a);
}

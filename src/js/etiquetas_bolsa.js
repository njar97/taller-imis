// ══════════════════════════════════════════════════════════════════════
// ETIQUETAS DE BOLSA (v3.58) — Brother TD-4210D, rollo 51 × 26 mm
// Una etiqueta por bolsa (2 prendas de la misma talla). Cada etiqueta lleva
// un n.º de control que sirve para CONTAR las bolsas: correlativo por
// empresa + prenda + color + talla. La base reparte los números
// (rpc/etiqueta_bolsa_imprimir); reponer repite el número y no suma.
// El dibujo copia punto por punto el de etiqueta_bolsa.py (382 × 156 puntos,
// 203 dpi, blanco y negro). No rediseñar: es la etiqueta ya aprobada.
// ══════════════════════════════════════════════════════════════════════

const ETQ_W = 382, ETQ_H = 156, ETQ_M = 4;
const ETQ_MM_W = 51, ETQ_MM_H = 26;                 // la etiqueta del rollo
const ETQ_DIB_MM_W = +(ETQ_W / 203 * 25.4).toFixed(2); // 47.80 mm: lo que ocupa el dibujo
const ETQ_DIB_MM_H = +(ETQ_H / 203 * 25.4).toFixed(2); // 19.52 mm
const ETQ_EMPRESA = { NELSON: 'JAV', IMIS: 'IMIS', AMERICA: 'AME' };
const ETQ_ORDEN_EMP = ['NELSON', 'IMIS', 'AMERICA'];   // JAV primero, luego IMIS, por último AME

let etq = {
  temporadaId: null, provs: [], cuenta: [], hist: [],
  emp: null,          // id de la empresa elegida
  sel: null,          // clave «prenda|color|talla» abierta
  recien: null,       // tanda recién mandada: se pregunta si salió bien
  ocupado: false,
};

function etqOrdenEmp(cod) { const i = ETQ_ORDEN_EMP.indexOf(cod); return i < 0 ? 99 : i; }
function etqEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function etqNum(n) { return (Number(n) || 0).toLocaleString('es-SV'); }
function etqCtl(n) { return String(n).padStart(3, '0'); }
function etqClave(f) { return `${f.prenda}|${f.color}|${f.talla}`; }
function etqProv() { return etq.provs.find(p => p.id === etq.emp) || null; }
function etqFila() { return etq.cuenta.find(f => f.proveedor_id === etq.emp && f.activo && etqClave(f) === etq.sel) || null; }
// La última bolsa de un pedido impar lleva 1 prenda.
function etqCantidad(f, control) { return (control === f.bolsas && f.piezas % 2 === 1) ? 1 : 2; }

// ── Dibujo de la etiqueta (igual que etiqueta_bolsa.py) ──────────────────
function etqFuente(tam, negrita) { return `${negrita ? 'bold ' : ''}${tam}px Arial, "Liberation Sans", Helvetica, sans-serif`; }
// Alto de la letra sobre la línea base, como lo redondea el programa original.
function etqSube(tam) { return Math.ceil(tam * 0.9053); }
function etqAjustar(ctx, txt, tam, maxAncho, negrita = true, minimo = 10) {
  ctx.font = etqFuente(tam, negrita);
  while (ctx.measureText(txt).width > maxAncho && tam > minimo) { tam--; ctx.font = etqFuente(tam, negrita); }
  return tam;
}
function etqTexto(ctx, txt, x, y, tam, negrita = true) {
  ctx.font = etqFuente(tam, negrita);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(txt, x, y + etqSube(tam));
}

// d = { nombre, control, prenda, color, talla, codigo, cantidad, marca }
function etqDibujar(d) {
  const cv = document.createElement('canvas');
  cv.width = ETQ_W; cv.height = ETQ_H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ETQ_W, ETQ_H);
  ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';

  // Fila 1: nombre del proveedor estirado + n.º de control en recuadro
  let anchoNombre = ETQ_W - 2 * ETQ_M;
  if (d.control) {
    ctx.font = etqFuente(13, false);
    const cw = ctx.measureText(d.control).width;
    const x0 = Math.round(ETQ_W - cw - 10);
    ctx.fillRect(x0, 2, ETQ_W - x0, 1); ctx.fillRect(x0, 20, ETQ_W - x0, 1);
    ctx.fillRect(x0, 2, 1, 19); ctx.fillRect(ETQ_W - 1, 2, 1, 19);
    etqTexto(ctx, d.control, ETQ_W - cw - 6, 4, 13, false);
    anchoNombre = ETQ_W - cw - 24 - ETQ_M;
  }
  if (d.nombre) {
    const tmp = document.createElement('canvas');
    const tc = tmp.getContext('2d');
    tc.font = etqFuente(40, true);
    const m = tc.measureText(d.nombre);
    const izq = m.actualBoundingBoxLeft, ancho = Math.ceil(izq + m.actualBoundingBoxRight);
    const alto = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
    tmp.width = ancho + 4; tmp.height = alto + 4;
    tc.fillStyle = '#fff'; tc.fillRect(0, 0, tmp.width, tmp.height);
    tc.fillStyle = '#000'; tc.font = etqFuente(40, true); tc.textBaseline = 'alphabetic';
    tc.fillText(d.nombre, 2 + izq, 2 + m.actualBoundingBoxAscent);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tmp, ETQ_M, 3, Math.floor(anchoNombre), 28);
  }
  ctx.fillRect(0, 34, ETQ_W, 2);

  // Fila 2: prenda + color a la izquierda, talla grande a la derecha
  const tamTalla = etqAjustar(ctx, d.talla, 78, 150);
  const xt = ETQ_W - ETQ_M - ctx.measureText(d.talla).width;
  etqTexto(ctx, d.talla, xt, 26, tamTalla);
  const prenda = String(d.prenda || '').toUpperCase();
  etqTexto(ctx, prenda, ETQ_M, 38, etqAjustar(ctx, prenda, 36, xt - 2 * ETQ_M));
  if (d.color) {
    const color = String(d.color).toUpperCase();
    etqTexto(ctx, color, ETQ_M, 76, etqAjustar(ctx, color, 30, xt - 2 * ETQ_M));
  }
  ctx.fillRect(0, 112, ETQ_W, 2);

  // Fila 3: código del proveedor | cantidad
  etqTexto(ctx, 'CÓD.', ETQ_M, 116, 14, false);
  if (d.codigo) etqTexto(ctx, d.codigo, ETQ_M + 40, 114, 36);
  else ctx.fillRect(ETQ_M + 40, 150, 206, 1);
  ctx.fillRect(262, 112, 2, ETQ_H - 112);
  etqTexto(ctx, 'CANT.', 268, 116, 14, false);
  etqTexto(ctx, String(d.cantidad), 326, 114, 36);

  // Todo a blanco y negro puro (la Brother no imprime grises)
  const img = ctx.getImageData(0, 0, ETQ_W, ETQ_H), px = img.data;
  // Franja negra que distingue a la empresa: arriba = IMIS, abajo = AME
  const y0 = d.marca === 'franja_arriba' ? 0 : d.marca === 'franja_abajo' ? 111 : -1;
  const y1 = d.marca === 'franja_arriba' ? 36 : ETQ_H;
  for (let y = 0; y < ETQ_H; y++) {
    const invertir = y0 >= 0 && y >= y0 && y < y1;
    for (let x = 0; x < ETQ_W; x++) {
      const i = (y * ETQ_W + x) * 4;
      const lum = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
      let negro = lum < 140;
      if (invertir) negro = !negro;
      px[i] = px[i + 1] = px[i + 2] = negro ? 0 : 255; px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function etqDatos(f, control) {
  const p = etq.provs.find(x => x.id === f.proveedor_id) || {};
  return {
    nombre: p.nombre_etiqueta || '', control: etqCtl(control),
    prenda: f.prenda, color: f.color, talla: f.talla,
    codigo: p.codigo_mined || '', cantidad: etqCantidad(f, control), marca: p.marca_etiqueta || null,
  };
}

// ── Carga ────────────────────────────────────────────────────────────────
async function initEtiquetasBolsa() {
  const cont = document.getElementById('etq-contenido');
  if (!cont) return;
  if (!etq.cuenta.length) cont.innerHTML = '<div class="card text-muted" style="padding:20px;text-align:center">Cargando etiquetas...</div>';
  try {
    if (!etq.temporadaId) {
      const t = await supaFetch('temporada', 'GET', null, '?estado=eq.activa&select=id,anio&order=anio.desc&limit=1');
      etq.temporadaId = t[0] ? t[0].id : null;
    }
    if (!etq.temporadaId) { cont.innerHTML = '<div class="alert alert-error">No hay una temporada activa.</div>'; return; }
    await etqCargar();
    etqRender();
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error">No se pudo cargar: ${etqEsc(e.message)}</div>`;
  }
}

async function etqCargar() {
  const [provs, cuenta] = await Promise.all([
    supaFetch('proveedor', 'GET', null, '?activo=eq.true&select=id,codigo,nombre,codigo_mined,nombre_etiqueta,marca_etiqueta'),
    supaFetch('vw_etiqueta_bolsa_cuenta', 'GET', null, `?temporada_id=eq.${etq.temporadaId}&limit=1000`),
  ]);
  const conPedido = new Set(cuenta.map(f => f.proveedor_id));
  etq.provs = provs.filter(p => conPedido.has(p.id))
    .sort((a, b) => etqOrdenEmp(a.codigo) - etqOrdenEmp(b.codigo));
  etq.cuenta = cuenta.sort((a, b) => (a.orden - b.orden) || a.color.localeCompare(b.color) ||
    (parseInt(a.talla.slice(1), 10) || 0) - (parseInt(b.talla.slice(1), 10) || 0));
  if (!etq.emp || !etq.provs.some(p => p.id === etq.emp)) {
    let guardada = null;
    try { guardada = localStorage.getItem('etq-empresa'); } catch (_) { /* sin almacenamiento */ }
    etq.emp = (etq.provs.find(p => p.id === guardada) || etq.provs[0] || {}).id || null;
  }
  if (etq.sel) await etqCargarHistorial();
}

async function etqCargarHistorial() {
  const f = etqFila();
  if (!f) { etq.hist = []; return; }
  etq.hist = await supaFetch('etiqueta_bolsa_impresion', 'GET', null,
    `?temporada_id=eq.${etq.temporadaId}&proveedor_id=eq.${f.proveedor_id}` +
    `&prenda=eq.${encodeURIComponent(f.prenda)}&color=eq.${encodeURIComponent(f.color)}&talla=eq.${encodeURIComponent(f.talla)}` +
    '&order=creado_en.desc&limit=200');
}

// ── Pantalla ─────────────────────────────────────────────────────────────
function etqRender() {
  const cont = document.getElementById('etq-contenido');
  if (!cont) return;
  const p = etqProv();
  const filas = etq.cuenta.filter(f => f.proveedor_id === etq.emp);
  const activas = filas.filter(f => f.activo), pend = filas.filter(f => !f.activo);
  const totB = activas.reduce((s, f) => s + f.bolsas, 0), totI = activas.reduce((s, f) => s + f.impresas, 0);
  const ayuda = typeof ayudaHtml === 'function'
    ? ayudaHtml('etiquetas', 'Cada bolsa lleva una etiqueta con su número. Elegí la empresa y la prenda con su talla: ahí dice cuántas bolsas lleva el pedido, cuántas etiquetas van impresas y cuántas faltan. «Imprimir» saca las que siguen. «Reponer» vuelve a sacar una que se dañó o se perdió, con su mismo número. Se imprime desde la computadora del taller, que es la que tiene la impresora de etiquetas.')
    : '';

  const empresas = etq.provs.map(x => `
    <button type="button" class="btn ${x.id === etq.emp ? 'btn-primary' : 'btn-ghost'}" aria-pressed="${x.id === etq.emp}"
      onclick="etqElegirEmpresa('${x.id}')">${etqEsc(ETQ_EMPRESA[x.codigo] || x.codigo)}</button>`).join('');

  const lista = activas.map(f => {
    const faltan = f.bolsas - f.ultimo, abierta = etqClave(f) === etq.sel;
    const pct = f.bolsas ? Math.round(f.ultimo * 100 / f.bolsas) : 0;
    return `
      <div class="etq-fila${abierta ? ' abierta' : ''}">
        <button type="button" class="etq-fila-btn" aria-expanded="${abierta}" onclick="etqAbrir('${etqEsc(etqClave(f)).replace(/'/g, "\\'")}')">
          <span class="etq-fila-tit"><strong>${etqEsc(f.prenda)} ${etqEsc(f.color)}</strong> <span class="etq-talla">${etqEsc(f.talla)}</span></span>
          <span class="etq-fila-num">${faltan > 0 ? `faltan <strong>${etqNum(faltan)}</strong>` : '<strong style="color:#0a7">completas</strong>'}
            <small>${etqNum(f.ultimo)} de ${etqNum(f.bolsas)}</small></span>
          <span class="etq-barra"><i style="width:${pct}%"></i></span>
        </button>
        ${abierta ? etqPanelHtml(f, p) : ''}
      </div>`;
  }).join('');

  const pendientes = pend.length ? `
    <div class="etq-pend"><strong>Todavía no se imprimen:</strong>
      ${[...new Set(pend.map(f => f.nota || `${f.prenda} ${f.color}`))].map(n => `<div>· ${etqEsc(n)}</div>`).join('')}
      <small>${pend.map(f => `${etqEsc(f.talla)}: ${etqNum(f.bolsas)} bolsas`).join(' · ')}</small>
    </div>` : '';

  cont.innerHTML = `
    <div class="card" style="padding:14px">
      ${ayuda}
      <div style="font-size:17px;font-weight:700;margin-bottom:10px">Etiquetas de bolsa</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${empresas}</div>
      ${p ? `<div class="etq-emp">${etqEsc(p.nombre_etiqueta || p.nombre)} · código <strong>${etqEsc(p.codigo_mined || 'falta')}</strong>
        · ${etqNum(totI)} de ${etqNum(totB)} bolsas con etiqueta</div>` : ''}
      ${p && !p.codigo_mined ? etqFaltaCodigoHtml(p) : ''}
      ${etq.recien ? etqRecienHtml() : ''}
      <div class="etq-lista">${lista || '<div class="text-muted" style="padding:12px">Esta empresa no tiene prendas en el pedido.</div>'}</div>
      ${pendientes}
    </div>`;
  const prev = document.getElementById('etq-vista');
  const f = etqFila();
  if (prev && f) {
    const cv = etqDibujar(etqDatos(f, Math.min(f.ultimo + 1, f.bolsas)));
    cv.className = 'etq-canvas';
    prev.appendChild(cv);
  }
}

function etqFaltaCodigoHtml(p) {
  return `
    <div class="alert alert-error" style="margin-bottom:10px">
      Falta el código de proveedor de ${etqEsc(ETQ_EMPRESA[p.codigo] || p.codigo)}. Sin el código no se imprime.
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <input type="text" id="etq-codigo-nuevo" placeholder="00-000" inputmode="numeric" maxlength="12" style="max-width:130px" aria-label="Código de proveedor">
        <button type="button" class="btn btn-primary btn-sm" onclick="etqGuardarCodigo()">Guardar código</button>
      </div>
    </div>`;
}

// Panel de la prenda y talla elegida: vista, imprimir, reponer, historial.
function etqPanelHtml(f, p) {
  const faltan = f.bolsas - f.ultimo, sinCodigo = !p || !p.codigo_mined;
  const sugerido = Math.min(faltan, 50);
  const impar = f.piezas % 2 === 1;
  const imprimir = faltan <= 0
    ? '<div class="etq-ok">Ya están todas las etiquetas de este pedido.</div>'
    : `
      <div class="etq-bloque">
        <div class="etq-bloque-tit">Imprimir las que siguen</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <label for="etq-n">¿Cuántas?</label>
          <input type="number" id="etq-n" min="1" max="${Math.min(faltan, 500)}" value="${sugerido}" inputmode="numeric" style="width:90px;font-size:18px"
            oninput="etqActualizarRango()">
          ${faltan > sugerido ? `<button type="button" class="btn btn-ghost btn-sm" onclick="etqPonerN(${Math.min(faltan, 500)})">Todas (${etqNum(Math.min(faltan, 500))})</button>` : ''}
        </div>
        <button type="button" class="btn btn-primary etq-btn-grande" id="etq-btn-imprimir" ${sinCodigo || etq.ocupado ? 'disabled' : ''} onclick="etqImprimirSiguientes()">
          ${typeof ico === 'function' ? ico('imprimir') : ''} <span id="etq-rango"></span>
        </button>
      </div>`;
  const reponer = f.ultimo > 0 ? `
      <div class="etq-bloque">
        <div class="etq-bloque-tit">Reponer una que salió mal o se perdió</div>
        <div class="solo-asistencia" style="font-size:12px;color:#666;margin-bottom:6px">Sale con su mismo número y no cambia la cuenta. Varias: 52, 60-63</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input type="text" id="etq-reponer" placeholder="Número: 52" inputmode="text" style="flex:1;min-width:140px;font-size:16px" aria-label="Números a reponer">
          <button type="button" class="btn btn-ghost" ${sinCodigo || etq.ocupado ? 'disabled' : ''} onclick="etqReponer()">Reponer</button>
        </div>
      </div>` : '';
  const hist = etq.hist.length ? `
      <div class="etq-bloque">
        <div class="etq-bloque-tit">Lo que se ha impreso</div>
        ${etq.hist.map(h => etqHistFilaHtml(h, f)).join('')}
      </div>` : '';
  return `
    <div class="etq-panel">
      <div class="etq-resumen">
        <div><strong>${etqNum(f.bolsas)}</strong><small>bolsas del pedido</small></div>
        <div><strong>${etqNum(f.ultimo)}</strong><small>impresas</small></div>
        <div><strong>${etqNum(Math.max(faltan, 0))}</strong><small>faltan</small></div>
      </div>
      <div style="font-size:12px;color:#666;margin:4px 0 8px">${etqNum(f.piezas)} prendas, 2 por bolsa${impar ? `. La última bolsa (la ${etqCtl(f.bolsas)}) lleva 1` : ''}${f.repuestas ? ` · ${etqNum(f.repuestas)} repuestas` : ''}</div>
      <div id="etq-vista" class="etq-vista" aria-label="Así sale la etiqueta que sigue"></div>
      ${imprimir}${reponer}${hist}
    </div>`;
}

function etqHistFilaHtml(h, f) {
  const fecha = new Date(h.creado_en).toLocaleString('es-SV', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const que = h.tipo === 'nueva'
    ? `${etqCtl(h.desde)}${h.hasta > h.desde ? '–' + etqCtl(h.hasta) : ''} <small>(${etqNum(h.hasta - h.desde + 1)})</small>`
    : `Reposición: ${etqResumirLista(h.controles)}`;
  const esUltima = h.tipo === 'nueva' && !h.anulada && h.hasta === f.ultimo;
  return `
    <div class="etq-hist${h.anulada ? ' anulada' : ''}">
      <div><strong>${que}</strong>${h.anulada ? ' · anulada' : ''}
        <small>${etqEsc(fecha)} · ${etqEsc(String(h.usuario || '').split('@')[0])}${h.nota ? ' · ' + etqEsc(h.nota) : ''}</small></div>
      ${esUltima ? `<button type="button" class="btn btn-ghost btn-sm" onclick="etqCorregirDesdeHistorial('${h.id}')">No salió bien</button>` : ''}
    </div>`;
}

// 51,52,53,60 → «051–053, 060»
function etqResumirLista(nums) {
  const a = [...(nums || [])].sort((x, y) => x - y), partes = [];
  for (let i = 0; i < a.length; i++) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    partes.push(j > i ? `${etqCtl(a[i])}–${etqCtl(a[j])}` : etqCtl(a[i]));
    i = j;
  }
  return partes.join(', ');
}
// «52, 60-63» → [52,60,61,62,63]; null si hay algo que no se entiende.
function etqLeerLista(txt) {
  const out = new Set();
  for (const parte of String(txt || '').split(/[,;\s]+/).filter(Boolean)) {
    const m = parte.match(/^(\d{1,4})(?:[-–](\d{1,4}))?$/);
    if (!m) return null;
    const a = parseInt(m[1], 10), b = m[2] ? parseInt(m[2], 10) : a;
    if (a < 1 || b < a || b - a > 500) return null;
    for (let n = a; n <= b; n++) out.add(n);
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}

// Pregunta después de mandar una tanda: ¿salió bien?
function etqRecienHtml() {
  const r = etq.recien;
  const varias = r.hasta > r.desde;
  return `
    <div class="etq-recien" role="status">
      <div style="font-weight:700;margin-bottom:6px">Se mandó ${etqEsc(r.titulo)} · ${varias ? `de la ${etqCtl(r.desde)} a la ${etqCtl(r.hasta)}` : `la ${etqCtl(r.desde)}`}. ¿${varias ? 'Salieron todas' : 'Salió bien'}?</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button type="button" class="btn btn-primary" onclick="etqRecienListo()">Sí${varias ? ', todas' : ''}</button>
        <button type="button" class="btn btn-ghost" onclick="etqMandarDeNuevo()">Mandar otra vez</button>
        <button type="button" class="btn btn-ghost" onclick="etqCorregir('${r.id}', null)">No salió ninguna</button>
        ${varias ? `<span style="display:inline-flex;gap:6px;align-items:center">Salieron hasta la
          <input type="number" id="etq-salio-hasta" min="${r.desde}" max="${r.hasta - 1}" style="width:84px" inputmode="numeric" aria-label="Último número que salió">
          <button type="button" class="btn btn-ghost btn-sm" onclick="etqCorregirHasta('${r.id}')">Anotar</button></span>` : ''}
      </div>
    </div>`;
}

// ── Acciones ─────────────────────────────────────────────────────────────
function etqElegirEmpresa(id) {
  etq.emp = id; etq.sel = null; etq.hist = [];
  try { localStorage.setItem('etq-empresa', id); } catch (_) { /* nada */ }
  etqRender();
}

async function etqAbrir(clave) {
  etq.sel = etq.sel === clave ? null : clave;
  etq.hist = [];
  etqRender();
  if (!etq.sel) return;
  try { await etqCargarHistorial(); etqRender(); etqActualizarRango(); }
  catch (e) { showToast('No se pudo cargar lo impreso: ' + e.message, 'error'); }
  etqActualizarRango();
}

function etqPonerN(n) {
  const inp = document.getElementById('etq-n');
  if (inp) { inp.value = n; etqActualizarRango(); }
}
function etqLeerN(f) {
  const inp = document.getElementById('etq-n');
  const n = inp ? parseInt(inp.value, 10) : NaN;
  const faltan = f.bolsas - f.ultimo;
  return (Number.isInteger(n) && n >= 1 && n <= Math.min(faltan, 500)) ? n : null;
}
function etqActualizarRango() {
  const f = etqFila(), el = document.getElementById('etq-rango'), btn = document.getElementById('etq-btn-imprimir');
  if (!f || !el) return;
  const n = etqLeerN(f), p = etqProv();
  if (!n) { el.textContent = `Escribí de 1 a ${Math.min(f.bolsas - f.ultimo, 500)}`; if (btn) btn.disabled = true; return; }
  el.textContent = n === 1 ? `Imprimir la ${etqCtl(f.ultimo + 1)}` : `Imprimir de la ${etqCtl(f.ultimo + 1)} a la ${etqCtl(f.ultimo + n)}`;
  if (btn) btn.disabled = etq.ocupado || !p || !p.codigo_mined;
}

async function etqImprimirSiguientes() {
  const f = etqFila();
  if (!f || etq.ocupado) return;
  const n = etqLeerN(f);
  if (!n) { showToast('Escribí cuántas etiquetas', 'warn'); return; }
  if (etq.recien) { showToast('Primero decí si la tanda anterior salió bien', 'warn'); return; }
  etq.ocupado = true; etqActualizarRango();
  try {
    const r = await supaFetch('rpc/etiqueta_bolsa_imprimir', 'POST', {
      p_temporada: etq.temporadaId, p_proveedor: f.proveedor_id,
      p_prenda: f.prenda, p_color: f.color, p_talla: f.talla, p_n: n,
    });
    const nums = [];
    for (let c = r.desde; c <= r.hasta; c++) nums.push(c);
    // La cuenta que devolvió la base manda (otro aparato pudo cambiarla).
    const fila = { ...f, bolsas: r.bolsas, piezas: r.piezas };
    etq.recien = { id: r.id, desde: r.desde, hasta: r.hasta, titulo: `${f.prenda} ${f.color} ${f.talla}`, fila, nums };
    await etqMandarAImpresora(fila, nums);
    await etqCargar();
  } catch (e) {
    showToast('No se imprimió: ' + e.message, 'error', 8000);
  } finally {
    etq.ocupado = false; etqRender(); etqActualizarRango();
  }
}

async function etqReponer() {
  const f = etqFila();
  if (!f || etq.ocupado) return;
  const nums = etqLeerLista((document.getElementById('etq-reponer') || {}).value);
  if (!nums) { showToast('Escribí los números así: 52, 60-63', 'warn'); return; }
  const fuera = nums.find(n => n > f.ultimo);
  if (fuera) { showToast(`La ${etqCtl(fuera)} no se ha impreso todavía (van hasta la ${etqCtl(f.ultimo)})`, 'warn', 7000); return; }
  etq.ocupado = true;
  try {
    const r = await supaFetch('rpc/etiqueta_bolsa_reponer', 'POST', {
      p_temporada: etq.temporadaId, p_proveedor: f.proveedor_id,
      p_prenda: f.prenda, p_color: f.color, p_talla: f.talla, p_controles: nums,
    });
    await etqMandarAImpresora({ ...f, bolsas: r.bolsas, piezas: r.piezas }, r.controles);
    showToast(`Reposición mandada: ${etqResumirLista(r.controles)}`, 'success');
    await etqCargar();
  } catch (e) {
    showToast('No se repuso: ' + e.message, 'error', 8000);
  } finally {
    etq.ocupado = false; etqRender(); etqActualizarRango();
  }
}

function etqRecienListo() { etq.recien = null; etqRender(); etqActualizarRango(); }
// Vuelve a abrir la impresión de la misma tanda (sin anotar nada nuevo).
async function etqMandarDeNuevo() {
  const r = etq.recien;
  if (!r) return;
  try { await etqMandarAImpresora(r.fila, r.nums); } catch (e) { showToast('No se pudo imprimir: ' + e.message, 'error'); }
}
function etqCorregirHasta(id) {
  const r = etq.recien, inp = document.getElementById('etq-salio-hasta');
  const n = inp ? parseInt(inp.value, 10) : NaN;
  if (!r || !Number.isInteger(n) || n < r.desde || n >= r.hasta) {
    showToast(r ? `Escribí un número de la ${etqCtl(r.desde)} a la ${etqCtl(r.hasta - 1)}` : 'No hay tanda que corregir', 'warn');
    return;
  }
  etqCorregir(id, n);
}
async function etqCorregir(id, salioHasta) {
  if (etq.ocupado) return;
  etq.ocupado = true;
  try {
    const r = await supaFetch('rpc/etiqueta_bolsa_corregir', 'POST', { p_id: id, p_salio_hasta: salioHasta, p_motivo: null });
    etq.recien = null;
    showToast(r.anulada ? 'Tanda anulada: esos números quedan libres' : `Anotado: salió hasta la ${etqCtl(r.hasta)}`, 'success');
    await etqCargar();
  } catch (e) {
    showToast('No se pudo corregir: ' + e.message, 'error', 8000);
  } finally {
    etq.ocupado = false; etqRender(); etqActualizarRango();
  }
}
// Desde el historial: la última tanda vuelve a quedar en «¿salió bien?».
function etqCorregirDesdeHistorial(id) {
  const h = etq.hist.find(x => x.id === id), f = etqFila();
  if (!h || !f) return;
  const nums = [];
  for (let c = h.desde; c <= h.hasta; c++) nums.push(c);
  etq.recien = { id: h.id, desde: h.desde, hasta: h.hasta, titulo: `${f.prenda} ${f.color} ${f.talla}`, fila: f, nums };
  etqRender(); etqActualizarRango();
  window.scrollTo(0, 0);
}

async function etqGuardarCodigo() {
  const p = etqProv(), inp = document.getElementById('etq-codigo-nuevo');
  const cod = inp ? inp.value.trim() : '';
  if (!p || !/^\d{2}-\d{3}$/.test(cod)) { showToast('El código va así: 03-073', 'warn'); return; }
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/proveedor?id=eq.${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${await authTokenFresh()}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ codigo_mined: cod }),
    });
    if (!res.ok) throw new Error((await res.text()).slice(0, 200));
    showToast('Código guardado', 'success');
    await etqCargar(); etqRender();
  } catch (e) { showToast('No se guardó: ' + e.message, 'error'); }
}

// ── Impresión: una etiqueta por página de 51 × 26 mm, sin márgenes ───────
function etqHojaHtml(fila, nums) {
  const paginas = nums.map(c => `<div class="e"><img src="${etqDibujar(etqDatos(fila, c)).toDataURL('image/png')}" alt=""></div>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas de bolsa</title><style>
    @page { size: ${ETQ_MM_W}mm ${ETQ_MM_H}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .e { width: ${ETQ_MM_W}mm; height: ${ETQ_MM_H - 0.2}mm; display: flex; align-items: center; justify-content: center; overflow: hidden; break-after: page; page-break-after: always; }
    .e:last-child { break-after: auto; page-break-after: auto; }
    .e img { width: ${ETQ_DIB_MM_W}mm; height: ${ETQ_DIB_MM_H}mm; display: block; image-rendering: pixelated; }
  </style></head><body>${paginas}</body></html>`;
}

function etqMandarAImpresora(fila, nums) {
  return new Promise((resolve, reject) => {
    let viejo = document.getElementById('etq-iframe');
    if (viejo) viejo.remove();
    const iframe = document.createElement('iframe');
    iframe.id = 'etq-iframe';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);
    let html;
    try { html = etqHojaHtml(fila, nums); } catch (e) { reject(e); return; }
    const doc = iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    const imprimir = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        resolve();
      } catch (e) { reject(e); }
    };
    const imgs = [...doc.images];
    Promise.all(imgs.map(i => i.complete ? null : new Promise(ok => { i.onload = i.onerror = ok; })))
      .then(() => setTimeout(imprimir, 150));
  });
}

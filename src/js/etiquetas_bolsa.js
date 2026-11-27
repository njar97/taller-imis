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
  n: null,            // cuántas se van a imprimir
  reponer: null,      // números tocados para reponer (null = cerrado)
  verHist: false,
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
// Dos vistas: la LISTA (empresa → tarjetas de prenda con sus tallas) y la
// TALLA elegida (etiqueta a la vista, cuántas imprimir, reponer tocando).
const ETQ_COLOR = { BLANCA: '#FFFFFF', AZUL: '#1F3A6E', CELESTE: '#9CC9EE', BEIGE: '#D8C3A0' };
function etqPunto(color) {
  return `<i class="etq-punto" style="background:${ETQ_COLOR[color] || '#999'}" aria-hidden="true"></i>`;
}
function etqIco(n) { return typeof ico === 'function' ? ico(n) : ''; }

function etqRender() {
  const cont = document.getElementById('etq-contenido');
  if (!cont) return;
  const f = etqFila();
  cont.innerHTML = `<div class="card etq" style="padding:14px">${f ? etqTallaHtml(f) : etqListaHtml()}</div>`;
  const prev = document.getElementById('etq-vista');
  if (prev && f) {
    const cv = etqDibujar(etqDatos(f, Math.min(f.ultimo + 1, f.bolsas)));
    cv.className = 'etq-canvas';
    prev.appendChild(cv);
  }
  etqPintarN();
}

// ── Vista 1: empresa y sus prendas ──
function etqListaHtml() {
  const p = etqProv();
  const filas = etq.cuenta.filter(f => f.proveedor_id === etq.emp);
  const activas = filas.filter(f => f.activo), pend = filas.filter(f => !f.activo);
  const ayuda = typeof ayudaHtml === 'function'
    ? ayudaHtml('etiquetas', 'Cada bolsa lleva una etiqueta con su número. Tocá la empresa y después la talla de la prenda: ahí se imprimen las que faltan y se repone la que se dañó o se perdió. Se imprime desde la computadora del taller, que es la que tiene la impresora de etiquetas.')
    : '';

  const empresas = etq.provs.map(x => {
    const suyas = etq.cuenta.filter(f => f.proveedor_id === x.id && f.activo);
    const b = suyas.reduce((s, f) => s + f.bolsas, 0), i = suyas.reduce((s, f) => s + f.ultimo, 0);
    return `
    <button type="button" class="etq-emp-btn${x.id === etq.emp ? ' activa' : ''}" aria-pressed="${x.id === etq.emp}" onclick="etqElegirEmpresa('${x.id}')">
      <strong>${etqEsc(ETQ_EMPRESA[x.codigo] || x.codigo)}</strong>
      <small>${b ? Math.floor(i * 100 / b) : 0} %</small>
      <span class="etq-barra"><i style="width:${b ? i * 100 / b : 0}%"></i></span>
    </button>`;
  }).join('');

  // Una tarjeta por prenda + color; adentro, un botón por talla.
  const grupos = new Map();
  for (const f of activas) {
    const k = `${f.prenda}|${f.color}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(f);
  }
  const tarjetas = [...grupos.values()].map(g => {
    const faltan = g.reduce((s, f) => s + (f.bolsas - f.ultimo), 0);
    return `
    <section class="etq-prenda">
      <header>${etqPunto(g[0].color)}<strong>${etqEsc(g[0].prenda)} ${etqEsc(g[0].color)}</strong>
        <span>${faltan > 0 ? `faltan ${etqNum(faltan)}` : 'completa'}</span></header>
      <div class="etq-tallas">${g.map(etqTallaBtnHtml).join('')}</div>
    </section>`;
  }).join('');

  const pendientes = pend.length ? `
    <section class="etq-prenda etq-pend">
      <header><strong>Todavía no se imprimen</strong></header>
      ${[...new Set(pend.map(f => f.nota || `${f.prenda} ${f.color}`))].map(n => `<div>${etqEsc(n)}</div>`).join('')}
      <small>${pend.map(f => `${etqEsc(f.talla)}: ${etqNum(f.bolsas)} bolsas`).join(' · ')}</small>
    </section>` : '';

  return `
    ${ayuda}
    <div class="etq-titulo">${etqIco('etiqueta')} Etiquetas de bolsa</div>
    <div class="etq-paso">1 · ¿De qué empresa?</div>
    <div class="etq-empresas">${empresas}</div>
    ${p ? `<div class="etq-emp-dato">${etqEsc(p.nombre_etiqueta || p.nombre)} · código <strong>${etqEsc(p.codigo_mined || 'falta')}</strong></div>` : ''}
    ${p && !p.codigo_mined ? etqFaltaCodigoHtml(p) : ''}
    ${etq.recien ? etqRecienHtml() : ''}
    <div class="etq-paso">2 · Tocá la talla</div>
    ${tarjetas || '<div class="text-muted" style="padding:12px">Esta empresa no tiene prendas en el pedido.</div>'}
    ${pendientes}`;
}

function etqTallaBtnHtml(f) {
  const faltan = f.bolsas - f.ultimo, pct = f.bolsas ? f.ultimo * 100 / f.bolsas : 0;
  const estado = faltan <= 0 ? 'lista' : f.ultimo > 0 ? 'empezada' : 'nueva';
  return `
    <button type="button" class="etq-talla-btn ${estado}" onclick="etqAbrir('${etqEsc(etqClave(f))}')"
      aria-label="${etqEsc(f.prenda)} ${etqEsc(f.color)} ${etqEsc(f.talla)}: ${faltan > 0 ? 'faltan ' + faltan : 'completa'}">
      <strong>${etqEsc(f.talla)}</strong>
      <small>${faltan > 0 ? `faltan ${etqNum(faltan)}` : '✔ lista'}</small>
      <span class="etq-barra"><i style="width:${pct}%"></i></span>
    </button>`;
}

function etqFaltaCodigoHtml(p) {
  return `
    <div class="alert alert-error" style="margin:10px 0">
      Falta el código de proveedor de ${etqEsc(ETQ_EMPRESA[p.codigo] || p.codigo)}. Sin el código no se imprime.
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <input type="text" id="etq-codigo-nuevo" placeholder="00-000" inputmode="numeric" maxlength="12" style="max-width:130px" aria-label="Código de proveedor">
        <button type="button" class="btn btn-primary btn-sm" onclick="etqGuardarCodigo()">Guardar código</button>
      </div>
    </div>`;
}

// ── Vista 2: una prenda y talla ──
function etqTallaHtml(f) {
  const p = etqProv();
  const faltan = Math.max(f.bolsas - f.ultimo, 0), pct = f.bolsas ? f.ultimo * 100 / f.bolsas : 0;
  const sinCodigo = !p || !p.codigo_mined, impar = f.piezas % 2 === 1;
  const tope = Math.min(faltan, 500);
  if (etq.n == null || etq.n > tope || etq.n < 1) etq.n = Math.min(tope, 50);
  const rapidas = [10, 25, 50, 100].filter(n => n < tope);

  const imprimir = faltan <= 0
    ? '<div class="etq-ok">✔ Ya están todas las etiquetas de este pedido.</div>'
    : sinCodigo ? '<div class="alert alert-error">Falta el código de proveedor: se pone en la pantalla anterior.</div>'
    : `
    <div class="etq-bloque">
      <div class="etq-paso">¿Cuántas imprimo?</div>
      <div class="etq-contador">
        <button type="button" class="etq-mm" onclick="etqCambiarN(-10)" aria-label="Quitar 10">−10</button>
        <button type="button" class="etq-mm" onclick="etqCambiarN(-1)" aria-label="Quitar 1">−</button>
        <input type="number" id="etq-n" min="1" max="${tope}" value="${etq.n}" inputmode="numeric" aria-label="Cuántas etiquetas" oninput="etqEscribirN(this.value)">
        <button type="button" class="etq-mm" onclick="etqCambiarN(1)" aria-label="Agregar 1">+</button>
        <button type="button" class="etq-mm" onclick="etqCambiarN(10)" aria-label="Agregar 10">+10</button>
      </div>
      <div class="etq-rapidas">
        ${rapidas.map(n => `<button type="button" class="etq-chip" data-n="${n}" onclick="etqFijarN(${n})">${n}</button>`).join('')}
        <button type="button" class="etq-chip" data-n="${tope}" onclick="etqFijarN(${tope})">Todas · ${etqNum(tope)}</button>
      </div>
      <button type="button" class="etq-btn-imprimir" id="etq-btn-imprimir" onclick="etqImprimirSiguientes()">
        ${etqIco('imprimir')}<span><strong id="etq-btn-tit"></strong><small id="etq-btn-sub"></small></span>
      </button>
    </div>`;

  const reponer = f.ultimo > 0 && !sinCodigo ? (etq.reponer ? etqReponerHtml(f) : `
    <button type="button" class="etq-btn-sec" onclick="etqReponerAbrir()">${etqIco('recargar')} Volver a sacar una que se dañó o se perdió</button>`) : '';

  const hist = etq.hist.length ? `
    <details class="etq-hist-caja"${etq.verHist ? ' open' : ''} ontoggle="etq.verHist = this.open">
      <summary>Lo que se ha impreso (${etq.hist.length})</summary>
      ${etq.hist.map(h => etqHistFilaHtml(h, f)).join('')}
    </details>` : '';

  return `
    <button type="button" class="etq-volver" onclick="etqCerrar()">${etqIco('volver')} Otra prenda</button>
    <div class="etq-cabeza">${etqPunto(f.color)}<span><small>${etqEsc(ETQ_EMPRESA[(p || {}).codigo] || '')}</small>
      <strong>${etqEsc(f.prenda)} ${etqEsc(f.color)}</strong></span><b>${etqEsc(f.talla)}</b></div>
    ${etq.recien ? etqRecienHtml() : ''}
    <div id="etq-vista" class="etq-vista" aria-label="Así sale la etiqueta que sigue"></div>
    <div class="etq-avance">
      <span class="etq-barra grande"><i style="width:${pct}%"></i></span>
      <div><span><strong>${etqNum(f.ultimo)}</strong> impresas</span><span>de <strong>${etqNum(f.bolsas)}</strong> bolsas</span><span class="falta"><strong>${etqNum(faltan)}</strong> faltan</span></div>
      <small>${etqNum(f.piezas)} prendas, 2 por bolsa${impar ? ` · la última bolsa (${etqCtl(f.bolsas)}) lleva 1` : ''}</small>
    </div>
    ${etq.recien || etq.reponer ? '' : imprimir}
    ${etq.recien ? '' : reponer}
    ${hist}`;
}

// Reponer: se tocan los números ya impresos.
function etqReponerHtml(f) {
  const sel = etq.reponer;
  let botones = '';
  for (let c = 1; c <= f.ultimo; c++) {
    botones += `<button type="button" class="etq-num${sel.has(c) ? ' sel' : ''}" aria-pressed="${sel.has(c)}" onclick="etqReponerTocar(${c}, this)">${etqCtl(c)}</button>`;
  }
  return `
    <div class="etq-bloque etq-reponer">
      <div class="etq-paso">Tocá las que hay que volver a sacar</div>
      <div class="solo-asistencia" style="font-size:12px;color:#667;margin-bottom:6px">Salen con su mismo número y la cuenta no cambia.</div>
      <div class="etq-nums">${botones}</div>
      <div class="etq-reponer-pie">
        <button type="button" class="btn btn-ghost" onclick="etqReponerCerrar()">Cancelar</button>
        <button type="button" class="btn btn-primary" id="etq-btn-reponer" onclick="etqReponer()" ${sel.size ? '' : 'disabled'}>${etqReponerTxt()}</button>
      </div>
    </div>`;
}
function etqReponerTxt() {
  const n = etq.reponer ? etq.reponer.size : 0;
  return n ? `Volver a sacar ${n}: ${etqResumirLista([...etq.reponer])}` : 'Tocá un número';
}

function etqHistFilaHtml(h, f) {
  const fecha = new Date(h.creado_en).toLocaleString('es-SV', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const que = h.tipo === 'nueva'
    ? `${etqCtl(h.desde)}${h.hasta > h.desde ? ' a ' + etqCtl(h.hasta) : ''} <small class="en-linea">(${etqNum(h.hasta - h.desde + 1)})</small>`
    : `Repuestas: ${etqResumirLista(h.controles)}`;
  const esUltima = h.tipo === 'nueva' && !h.anulada && h.hasta === f.ultimo;
  return `
    <div class="etq-hist${h.anulada ? ' anulada' : ''}">
      <div><strong>${que}</strong>${h.anulada ? ' · anulada' : ''}
        <small>${etqEsc(fecha)} · ${etqEsc(String(h.usuario || '').split('@')[0])}${h.nota ? ' · ' + etqEsc(h.nota) : ''}</small></div>
      ${esUltima && !etq.recien ? `<button type="button" class="btn btn-ghost btn-sm" onclick="etqCorregirDesdeHistorial('${h.id}')">No salió bien</button>` : ''}
    </div>`;
}

// 51,52,53,60 → «051 a 053, 060»
function etqResumirLista(nums) {
  const a = [...(nums || [])].sort((x, y) => x - y), partes = [];
  for (let i = 0; i < a.length; i++) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    partes.push(j > i ? `${etqCtl(a[i])} a ${etqCtl(a[j])}` : etqCtl(a[i]));
    i = j;
  }
  return partes.join(', ');
}

// Después de mandar una tanda: ¿salió bien? Si no, se toca la última buena.
function etqRecienHtml() {
  const r = etq.recien, cuantas = r.hasta - r.desde + 1, varias = cuantas > 1;
  const cuales = varias ? `${cuantas} etiquetas · de la ${etqCtl(r.desde)} a la ${etqCtl(r.hasta)}` : `la etiqueta ${etqCtl(r.desde)}`;
  if (!r.problema) {
    return `
    <div class="etq-recien" role="status">
      <div class="etq-recien-tit">¿${varias ? 'Salieron bien' : 'Salió bien'}?</div>
      <div class="etq-recien-sub">${etqEsc(r.titulo)} · ${cuales}</div>
      <div class="etq-recien-btns">
        <button type="button" class="etq-si" onclick="etqRecienListo()">✔ Sí${varias ? ', todas' : ''}</button>
        <button type="button" class="etq-no" onclick="etqRecienProblema()">✖ No</button>
      </div>
    </div>`;
  }
  let botones = '';
  for (let c = r.desde; c < r.hasta; c++) {
    botones += `<button type="button" class="etq-num${r.ultimaBuena === c ? ' sel' : ''}" aria-pressed="${r.ultimaBuena === c}" onclick="etqRecienTocar(${c})">${etqCtl(c)}</button>`;
  }
  return `
    <div class="etq-recien problema" role="status">
      <div class="etq-recien-tit">¿Qué pasó?</div>
      <div class="etq-recien-sub">${etqEsc(r.titulo)} · ${cuales}</div>
      <button type="button" class="etq-btn-sec" onclick="etqMandarDeNuevo()">${etqIco('imprimir')} Mandar otra vez a la impresora</button>
      <button type="button" class="etq-btn-sec" onclick="etqCorregir('${r.id}', null)">✖ No salió ninguna</button>
      ${varias ? `
      <div class="etq-paso" style="margin-top:12px">Salieron solo algunas: tocá la ÚLTIMA que salió bien</div>
      <div class="etq-nums">${botones}</div>
      ${r.ultimaBuena ? `<button type="button" class="etq-btn-imprimir" onclick="etqCorregir('${r.id}', ${r.ultimaBuena})"><span><strong>Anotar: salió hasta la ${etqCtl(r.ultimaBuena)}</strong>
        <small>La que sigue será la ${etqCtl(r.ultimaBuena + 1)}</small></span></button>` : ''}` : ''}
      <button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="etqRecienVolver()">Volver</button>
    </div>`;
}

// ── Acciones ─────────────────────────────────────────────────────────────
function etqElegirEmpresa(id) {
  etq.emp = id; etq.sel = null; etq.hist = []; etq.reponer = null; etq.n = null;
  try { localStorage.setItem('etq-empresa', id); } catch (_) { /* nada */ }
  etqRender();
}

async function etqAbrir(clave) {
  etq.sel = clave; etq.hist = []; etq.reponer = null; etq.n = null; etq.verHist = false;
  etqRender();
  window.scrollTo(0, 0);
  try { await etqCargarHistorial(); etqRender(); }
  catch (e) { showToast('No se pudo cargar lo impreso: ' + e.message, 'error'); }
}
function etqCerrar() {
  etq.sel = null; etq.hist = []; etq.reponer = null; etq.n = null;
  etqRender();
  window.scrollTo(0, 0);
}

// Cantidad a imprimir: botones − / +, cantidades rápidas o escrita.
function etqTope() { const f = etqFila(); return f ? Math.min(Math.max(f.bolsas - f.ultimo, 0), 500) : 0; }
function etqFijarN(n) {
  const tope = etqTope();
  etq.n = Math.max(1, Math.min(tope, Math.round(Number(n) || 1)));
  const inp = document.getElementById('etq-n');
  if (inp) inp.value = etq.n;
  etqPintarN();
}
function etqCambiarN(d) { etqFijarN((etq.n || 0) + d); }
function etqEscribirN(txt) {
  const n = parseInt(txt, 10);
  etq.n = (Number.isInteger(n) && n >= 1 && n <= etqTope()) ? n : null;
  etqPintarN();
}
// Pone en el botón grande qué va a salir, sin redibujar la pantalla.
function etqPintarN() {
  const f = etqFila(), btn = document.getElementById('etq-btn-imprimir');
  if (!f || !btn) return;
  const tit = document.getElementById('etq-btn-tit'), sub = document.getElementById('etq-btn-sub');
  if (!tit || !sub) return;
  const n = etq.n;
  btn.disabled = !n || etq.ocupado;
  if (etq.ocupado) { tit.textContent = 'Mandando a la impresora…'; sub.textContent = ''; }
  else if (!n) { tit.textContent = `Escribí de 1 a ${etqTope()}`; sub.textContent = ''; }
  else {
    tit.textContent = n === 1 ? 'Imprimir 1 etiqueta' : `Imprimir ${etqNum(n)} etiquetas`;
    sub.textContent = n === 1 ? `la ${etqCtl(f.ultimo + 1)}` : `de la ${etqCtl(f.ultimo + 1)} a la ${etqCtl(f.ultimo + n)}`;
  }
  document.querySelectorAll('.etq-chip').forEach(c => c.classList.toggle('sel', Number(c.dataset.n) === n));
}

async function etqImprimirSiguientes() {
  const f = etqFila();
  if (!f || etq.ocupado) return;
  const n = etq.n;
  if (!n) { showToast('Poné cuántas etiquetas', 'warn'); return; }
  if (etq.recien) { showToast('Primero decí si la tanda anterior salió bien', 'warn'); return; }
  etq.ocupado = true; etqPintarN();
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
    etq.n = null;
    await etqMandarAImpresora(fila, nums);
    await etqCargar();
  } catch (e) {
    showToast('No se imprimió: ' + e.message, 'error', 8000);
  } finally {
    etq.ocupado = false; etqRender();
    window.scrollTo(0, 0);
  }
}

function etqReponerAbrir() { etq.reponer = new Set(); etqRender(); }
function etqReponerCerrar() { etq.reponer = null; etqRender(); }
function etqReponerTocar(c, btn) {
  if (!etq.reponer) return;
  if (etq.reponer.has(c)) etq.reponer.delete(c); else etq.reponer.add(c);
  if (btn) { btn.classList.toggle('sel', etq.reponer.has(c)); btn.setAttribute('aria-pressed', etq.reponer.has(c)); }
  const b = document.getElementById('etq-btn-reponer');
  if (b) { b.textContent = etqReponerTxt(); b.disabled = !etq.reponer.size; }
}
async function etqReponer() {
  const f = etqFila();
  if (!f || etq.ocupado || !etq.reponer || !etq.reponer.size) return;
  const nums = [...etq.reponer].sort((a, b) => a - b);
  etq.ocupado = true;
  try {
    const r = await supaFetch('rpc/etiqueta_bolsa_reponer', 'POST', {
      p_temporada: etq.temporadaId, p_proveedor: f.proveedor_id,
      p_prenda: f.prenda, p_color: f.color, p_talla: f.talla, p_controles: nums,
    });
    await etqMandarAImpresora({ ...f, bolsas: r.bolsas, piezas: r.piezas }, r.controles);
    showToast(`Mandadas otra vez: ${etqResumirLista(r.controles)}`, 'success');
    etq.reponer = null;
    await etqCargar();
  } catch (e) {
    showToast('No se repuso: ' + e.message, 'error', 8000);
  } finally {
    etq.ocupado = false; etqRender();
  }
}

function etqRecienListo() { etq.recien = null; etqRender(); }
function etqRecienProblema() { if (etq.recien) { etq.recien.problema = true; etqRender(); } }
function etqRecienVolver() { if (etq.recien) { etq.recien.problema = false; etq.recien.ultimaBuena = null; etqRender(); } }
function etqRecienTocar(c) { if (etq.recien) { etq.recien.ultimaBuena = etq.recien.ultimaBuena === c ? null : c; etqRender(); } }
// Vuelve a abrir la impresión de la misma tanda (sin anotar nada nuevo).
async function etqMandarDeNuevo() {
  const r = etq.recien;
  if (!r) return;
  try { await etqMandarAImpresora(r.fila, r.nums); r.problema = false; etqRender(); }
  catch (e) { showToast('No se pudo imprimir: ' + e.message, 'error'); }
}
async function etqCorregir(id, salioHasta) {
  if (etq.ocupado) return;
  etq.ocupado = true;
  try {
    const r = await supaFetch('rpc/etiqueta_bolsa_corregir', 'POST', { p_id: id, p_salio_hasta: salioHasta, p_motivo: null });
    etq.recien = null;
    showToast(r.anulada ? 'Anotado: no salió ninguna. Esos números quedan libres' : `Anotado: salió hasta la ${etqCtl(r.hasta)}`, 'success');
    await etqCargar();
  } catch (e) {
    showToast('No se pudo anotar: ' + e.message, 'error', 8000);
  } finally {
    etq.ocupado = false; etqRender();
  }
}
// Desde lo impreso: la última tanda vuelve a quedar en «¿qué pasó?».
function etqCorregirDesdeHistorial(id) {
  const h = etq.hist.find(x => x.id === id), f = etqFila();
  if (!h || !f) return;
  const nums = [];
  for (let c = h.desde; c <= h.hasta; c++) nums.push(c);
  etq.recien = { id: h.id, desde: h.desde, hasta: h.hasta, titulo: `${f.prenda} ${f.color} ${f.talla}`, fila: f, nums, problema: true };
  etqRender();
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

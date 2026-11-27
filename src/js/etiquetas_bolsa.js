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
  busca: '',          // lo escrito en el buscador
  tipo: null,         // selector de prenda: CAMISA, PANTALÓN, FALDA, SHORT (null = todas)
  abierta: null,      // prenda desplegada en la lista (una a la vez)
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
  etqPintarFoco();
  etqVigilarImpresora();
}

// ── ¿Este aparato tiene la impresora? ──
// La Brother está por USB en la computadora del taller. En un celular no se
// imprime ni se anota nada: solo se ve la cuenta. Se puede cambiar a mano
// (queda guardado en ese aparato).
function etqTieneImpresora() {
  let v = null;
  try { v = localStorage.getItem('etq-impresora'); } catch (_) { /* sin almacenamiento */ }
  if (v === '1') return true;
  if (v === '0') return false;
  return !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}
function etqPonerImpresora(si) {
  try { localStorage.setItem('etq-impresora', si ? '1' : '0'); } catch (_) { /* nada */ }
  etq.reponer = null;
  etqRender();
}
// ── ¿La impresora está lista? ──
// Una página web no puede ver las impresoras. En la compu del taller corre un
// ayudante (herramientas/ayudante_etiquetas) que lee el estado que da Windows
// y contesta en http://127.0.0.1:17651/estado. Si dice que la impresora está
// apagada, desconectada o con error, NO se manda nada ni se anota ningún
// número. Si el ayudante no contesta, se avisa y se deja imprimir como antes.
const ETQ_AYUDANTE = 'http://127.0.0.1:17651/estado';
const ETQ_IMP_MALA = ['desconectada', 'error', 'no_instalada'];
let etqImp = { estado: null, mensaje: '', t: 0, reloj: null, enCurso: null, modo: null };
function etqImpresoraMala() { return ETQ_IMP_MALA.includes(etqImp.estado); }
// Formas de pedirle al ayudante: Chrome nuevo exige decir que la dirección es
// de esta misma computadora. Se recuerda la que funcionó.
const ETQ_MODOS = [{}, { targetAddressSpace: 'loopback' }, { targetAddressSpace: 'local' }];
async function etqPreguntarAyudante() {
  const pedir = async extra => {
    const ctl = new AbortController(), tope = setTimeout(() => ctl.abort(), 1500);
    try {
      const r = await fetch(ETQ_AYUDANTE, { cache: 'no-store', signal: ctl.signal, ...extra });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(tope); }
  };
  if (etqImp.modo != null) {
    try { return await pedir(ETQ_MODOS[etqImp.modo]); } catch (_) { etqImp.modo = null; }
  }
  let ultimo;
  for (let i = 0; i < ETQ_MODOS.length; i++) {
    try { const j = await pedir(ETQ_MODOS[i]); etqImp.modo = i; return j; } catch (e) { ultimo = e; }
  }
  throw ultimo;
}
// Revisa la impresora y repinta el aviso. Devuelve true si se puede imprimir.
// Si ya hay una revisión en camino se espera esa (no se cruzan respuestas).
function etqRevisarImpresora() {
  if (!etqTieneImpresora()) return Promise.resolve(false);
  if (etqImp.enCurso) return etqImp.enCurso;
  etqImp.enCurso = (async () => {
    let nuevo;
    try {
      const j = await etqPreguntarAyudante();
      nuevo = { estado: j.estado || 'error', mensaje: j.mensaje || '' };
    } catch (_) {
      nuevo = { estado: 'sin_ayudante', mensaje: 'No se pudo revisar la impresora' };
    }
    etqImp.estado = nuevo.estado; etqImp.mensaje = nuevo.mensaje; etqImp.t = Date.now();
    etqImp.enCurso = null;
    etqPintarFoco();
    return !etqImpresoraMala();
  })();
  return etqImp.enCurso;
}
// Revisión fresca justo antes de mandar algo.
async function etqRevisarAhora() {
  if (etqImp.enCurso) await etqImp.enCurso;
  return etqRevisarImpresora();
}
function etqFocoHtml() {
  if (!etqTieneImpresora()) return '';
  const e = etqImp.estado;
  const clase = !e ? 'gris' : e === 'lista' ? 'verde' : e === 'sin_ayudante' ? 'ambar' : 'rojo';
  const txt = !e ? 'Revisando la impresora…' : e === 'lista' ? 'Impresora lista' : etqImp.mensaje || 'La impresora no está lista';
  return `<span class="etq-foco ${clase}"><i aria-hidden="true"></i>${etqEsc(txt)}${clase === 'rojo' ? ' · no se manda nada' : ''}</span>
    ${clase === 'verde' || clase === 'gris' ? '' : '<button type="button" class="etq-chip" onclick="etqRevisarImpresora()">Revisar otra vez</button>'}`;
}
// Repinta solo el aviso y los botones (sin redibujar la pantalla ni perder lo escrito).
function etqPintarFoco() {
  const c = document.getElementById('etq-foco');
  if (c) c.innerHTML = etqFocoHtml();
  etqPintarN();
  const mala = etqImpresoraMala();
  document.querySelectorAll('.etq-necesita-impresora').forEach(b => { b.disabled = mala || etq.ocupado; });
  const br = document.getElementById('etq-btn-reponer');
  if (br) br.disabled = mala || !etq.reponer || !etq.reponer.size;
}
// Mientras la pantalla de etiquetas está abierta, revisa cada 6 segundos.
function etqVigilarImpresora() {
  if (etqImp.reloj || !etqTieneImpresora()) return;
  etqRevisarImpresora();
  etqImp.reloj = setInterval(() => {
    const v = document.getElementById('view-etiquetas');
    if (!v || !v.classList.contains('active')) { clearInterval(etqImp.reloj); etqImp.reloj = null; return; }
    if (document.visibilityState === 'visible' && !etq.ocupado) etqRevisarImpresora();
  }, 6000);
}

function etqSinImpresoraHtml() {
  return `<div class="etq-aviso">${etqIco('imprimir')}<span>Aquí solo se ve la cuenta. Las etiquetas se imprimen en la <strong>computadora del taller</strong>, que es la que tiene la impresora.</span></div>`;
}
function etqCambioImpresoraHtml() {
  return etqTieneImpresora()
    ? `<button type="button" class="etq-cambio" onclick="etqPonerImpresora(false)">Este aparato no tiene la impresora de etiquetas</button>`
    : `<button type="button" class="etq-cambio" onclick="etqPonerImpresora(true)">Este aparato sí tiene la impresora de etiquetas</button>`;
}

// ── Vista 1: empresa y sus prendas ──
// Compacta: buscador + selector de prenda arriba; una línea por prenda con
// sus tallas al lado.
function etqSinTilde(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function etqTipo(f) { return f.prenda.split(' ')[0]; }   // CAMISA, PANTALÓN, FALDA, SHORT
// Tallas de la empresa elegida que pasan el selector y lo escrito en el buscador.
// «pan 16» → pantalones talla 16. Un número solo busca esa talla exacta.
function etqFiltradas() {
  const palabras = etqSinTilde(etq.busca).split(/\s+/).filter(Boolean);
  return etq.cuenta.filter(f => {
    if (f.proveedor_id !== etq.emp || !f.activo) return false;
    if (etq.tipo && etqTipo(f) !== etq.tipo) return false;
    const texto = etqSinTilde(`${f.prenda} ${f.color}`), num = f.talla.replace(/\D/g, '');
    return palabras.every(w => /^t?\d+$/.test(w) ? w.replace('t', '') === num : texto.includes(w));
  });
}

function etqListaHtml() {
  const p = etqProv();
  const filas = etq.cuenta.filter(f => f.proveedor_id === etq.emp);
  const activas = filas.filter(f => f.activo), pend = filas.filter(f => !f.activo);
  const totB = activas.reduce((s, f) => s + f.bolsas, 0), totI = activas.reduce((s, f) => s + f.ultimo, 0);
  const ayuda = typeof ayudaHtml === 'function'
    ? ayudaHtml('etiquetas', 'Cada bolsa lleva una etiqueta con su número. Elegí la empresa, y buscá la prenda: escribí por ejemplo «pantalón 16» o tocá Camisa, Pantalón, Falda o Short. Después tocá la talla: ahí se imprimen las que faltan y se repone la que se dañó o se perdió. El número al lado de la talla es cuántas faltan. Se imprime desde la computadora del taller, que es la que tiene la impresora de etiquetas; en el celular solo se ve la cuenta.')
    : '';

  const empresas = etq.provs.map(x => `<button type="button" class="${x.id === etq.emp ? 'activa' : ''}" aria-pressed="${x.id === etq.emp}"
      onclick="etqElegirEmpresa('${x.id}')">${etqEsc(ETQ_EMPRESA[x.codigo] || x.codigo)}</button>`).join('');

  const tipos = [...new Set(activas.map(etqTipo))];
  if (etq.tipo && !tipos.includes(etq.tipo)) etq.tipo = null;
  const selector = tipos.length > 1 ? `
    <span class="etq-tipos" role="group" aria-label="Prenda">
      <button type="button" class="etq-chip${!etq.tipo ? ' sel' : ''}" onclick="etqElegirTipo('')">Todas</button>
      ${tipos.map(t => `<button type="button" class="etq-chip${etq.tipo === t ? ' sel' : ''}" onclick="etqElegirTipo('${etqEsc(t)}')">${etqEsc(t.charAt(0) + t.slice(1).toLowerCase())}</button>`).join('')}
    </span>` : '';

  const pendientes = pend.length
    ? `<div class="etq-nota">Todavía no se imprimen: ${[...new Set(pend.map(f => f.nota || `${f.prenda} ${f.color}`))].map(etqEsc).join(' · ')}</div>` : '';

  return `
    ${ayuda}
    <div class="etq-top">
      <strong>Etiquetas de bolsa</strong>
      <span class="etq-seg" role="group" aria-label="Empresa">${empresas}</span>
    </div>
    ${p ? `<div class="etq-linea"><span>Código <strong>${etqEsc(p.codigo_mined || 'falta')}</strong> · ${etqNum(totI)} de ${etqNum(totB)} bolsas</span>
      <span class="etq-barra"><i style="width:${totB ? totI * 100 / totB : 0}%"></i></span></div>` : ''}
    ${p && !p.codigo_mined ? etqFaltaCodigoHtml(p) : ''}
    ${etq.recien ? etqRecienHtml() : ''}
    <div id="etq-foco" class="etq-foco-caja"></div>
    <div class="etq-buscar">
      <span class="etq-buscar-caja">${etqIco('buscar')}
        <input type="search" id="etq-busca" value="${etqEsc(etq.busca)}" placeholder="Buscar: pantalón 16" autocomplete="off" enterkeyhint="go"
          aria-label="Buscar prenda y talla" oninput="etqBuscar(this.value)" onkeydown="if (event.key === 'Enter') etqBuscarAbrir()"></span>
      ${selector}
    </div>
    <div id="etq-renglones">${etqRenglonesHtml()}</div>
    ${pendientes}`;
}

// Los renglones (se repintan solos al escribir en el buscador).
function etqRenglonesHtml() {
  const lista = etqFiltradas();
  const filtrando = !!(etq.tipo || etq.busca.trim());
  if (!lista.length) {
    return `<div class="etq-nota" style="padding:10px 0">${filtrando ? 'No hay ninguna prenda así en esta empresa.' : 'Esta empresa no tiene prendas en el pedido.'}
      ${filtrando ? '<button type="button" class="etq-chip" onclick="etqLimpiarFiltro()">Ver todas</button>' : ''}</div>`;
  }
  // Atajo: lo que ya está empezado y no se ha terminado.
  const empezadas = filtrando ? [] : lista.filter(f => f.ultimo > 0 && f.ultimo < f.bolsas);
  const seguir = empezadas.length ? `
    <div class="etq-seguir"><span>Seguir con</span>
      ${empezadas.map(f => `<button type="button" onclick="etqAbrir('${etqEsc(etqClave(f))}')">${etqPunto(f.color)}${etqEsc(f.prenda)} <b>${etqEsc(f.talla)}</b> · faltan ${etqNum(f.bolsas - f.ultimo)}</button>`).join('')}
    </div>` : '';
  const grupos = new Map();
  for (const f of lista) {
    const k = `${f.prenda}|${f.color}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(f);
  }
  // Lista plegable: cada prenda es un renglón; al tocarla se abren sus tallas.
  // Buscando o con una prenda elegida, se muestran abiertas.
  return seguir + [...grupos.entries()].map(([k, g]) => {
    const faltan = g.reduce((t, f) => t + (f.bolsas - f.ultimo), 0);
    const abierta = filtrando || etq.abierta === k;
    return `
    <div class="etq-ren${abierta ? ' abierta' : ''}">
      <button type="button" class="etq-ren-nom" aria-expanded="${abierta}" onclick="etqPlegar('${etqEsc(k)}')">
        <span>${etqPunto(g[0].color)}${etqEsc(g[0].prenda)} ${etqEsc(g[0].color)}</span>
        <small>${faltan > 0 ? `faltan ${etqNum(faltan)}` : '✔ completa'}</small><i class="etq-flecha" aria-hidden="true"></i>
      </button>
      ${abierta ? `<div class="etq-ren-tallas">${g.map(etqTallaBtnHtml).join('')}</div>` : ''}
    </div>`;
  }).join('');
}
function etqPlegar(k) {
  etq.abierta = etq.abierta === k ? null : k;
  const c = document.getElementById('etq-renglones');
  if (c) c.innerHTML = etqRenglonesHtml();
}
function etqBuscar(txt) {
  etq.busca = txt;
  const c = document.getElementById('etq-renglones');
  if (c) c.innerHTML = etqRenglonesHtml();
}
// Enter en el buscador: si quedó una sola talla, la abre.
function etqBuscarAbrir() {
  const lista = etqFiltradas();
  if (lista.length === 1) etqAbrir(etqClave(lista[0]));
}
function etqElegirTipo(t) { etq.tipo = t || null; etqRender(); }
function etqLimpiarFiltro() { etq.tipo = null; etq.busca = ''; etqRender(); }

function etqTallaBtnHtml(f) {
  const faltan = f.bolsas - f.ultimo;
  const estado = faltan <= 0 ? 'lista' : f.ultimo > 0 ? 'empezada' : 'nueva';
  return `<button type="button" class="etq-t ${estado}" onclick="etqAbrir('${etqEsc(etqClave(f))}')"
      aria-label="${etqEsc(f.prenda)} ${etqEsc(f.color)} ${etqEsc(f.talla)}: ${faltan > 0 ? 'faltan ' + faltan : 'completa'}"><b>${etqEsc(f.talla)}</b>${faltan > 0 ? etqNum(faltan) : '✔'}</button>`;
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
    : !etqTieneImpresora() ? etqSinImpresoraHtml()
    : sinCodigo ? '<div class="alert alert-error">Falta el código de proveedor: se pone en la pantalla anterior.</div>'
    : `
    <div class="etq-cuantas">
      <button type="button" class="etq-mm" onclick="etqCambiarN(-1)" aria-label="Una menos">−</button>
      <input type="number" id="etq-n" min="1" max="${tope}" value="${etq.n}" inputmode="numeric" aria-label="Cuántas etiquetas" oninput="etqEscribirN(this.value)">
      <button type="button" class="etq-mm" onclick="etqCambiarN(1)" aria-label="Una más">+</button>
      ${rapidas.map(n => `<button type="button" class="etq-chip" data-n="${n}" onclick="etqFijarN(${n})">${n}</button>`).join('')}
      <button type="button" class="etq-chip" data-n="${tope}" onclick="etqFijarN(${tope})">Todas</button>
    </div>
    <button type="button" class="etq-btn-imprimir" id="etq-btn-imprimir" onclick="etqImprimirSiguientes()">
      ${etqIco('imprimir')}<strong id="etq-btn-tit"></strong><small id="etq-btn-sub"></small>
    </button>`;

  const puedeReponer = f.ultimo > 0 && !sinCodigo && etqTieneImpresora();
  const hist = etq.verHist && etq.hist.length ? `<div class="etq-hist-caja">${etq.hist.map(h => etqHistFilaHtml(h, f)).join('')}</div>` : '';

  return `
    <div class="etq-top">
      <button type="button" class="etq-volver" onclick="etqCerrar()" aria-label="Volver a las prendas">${etqIco('volver')}</button>
      <strong>${etqPunto(f.color)}${etqEsc(f.prenda)} ${etqEsc(f.color)} ${etqEsc(f.talla)}</strong>
      <span class="etq-emp-chico">${etqEsc(ETQ_EMPRESA[(p || {}).codigo] || '')}</span>
    </div>
    <div class="etq-linea"><span><strong>${etqNum(f.ultimo)}</strong> de ${etqNum(f.bolsas)} bolsas · faltan <strong class="falta">${etqNum(faltan)}</strong>${impar ? ` · la ${etqCtl(f.bolsas)} lleva 1` : ''}</span>
      <span class="etq-barra"><i style="width:${pct}%"></i></span></div>
    ${etq.recien ? etqRecienHtml() : ''}
    <div id="etq-vista" class="etq-vista" aria-label="Así sale la etiqueta que sigue"></div>
    <div id="etq-foco" class="etq-foco-caja"></div>
    ${etq.recien || etq.reponer ? '' : imprimir}
    ${etq.recien ? '' : (etq.reponer ? etqReponerHtml(f) : `
    <div class="etq-enlaces">
      ${puedeReponer ? `<button type="button" class="etq-necesita-impresora" onclick="etqReponerAbrir()">${etqIco('recargar')} Reponer una</button>` : ''}
      ${etq.hist.length ? `<button type="button" onclick="etqVerHist()">${etqIco('lista')} ${etq.verHist ? 'Ocultar' : 'Ver'} lo impreso</button>` : ''}
    </div>`)}
    ${hist}
    ${etq.recien || etq.reponer ? '' : etqCambioImpresoraHtml()}`;
}

// Reponer: se tocan los números ya impresos.
function etqReponerHtml(f) {
  const sel = etq.reponer;
  let botones = '';
  for (let c = 1; c <= f.ultimo; c++) {
    botones += `<button type="button" class="etq-num${sel.has(c) ? ' sel' : ''}" aria-pressed="${sel.has(c)}" onclick="etqReponerTocar(${c}, this)">${etqCtl(c)}</button>`;
  }
  return `
    <div class="etq-guia">Tocá las que hay que volver a sacar (salen con su mismo número)</div>
    <div class="etq-nums">${botones}</div>
    <div class="etq-pie">
      <button type="button" class="btn btn-ghost" onclick="etqReponerCerrar()">Cancelar</button>
      <button type="button" class="btn btn-primary" id="etq-btn-reponer" onclick="etqReponer()" ${sel.size ? '' : 'disabled'}>${etqReponerTxt()}</button>
    </div>`;
}
function etqReponerTxt() {
  const n = etq.reponer ? etq.reponer.size : 0;
  return n ? `Volver a sacar ${n}: ${etqResumirLista([...etq.reponer])}` : 'Tocá un número';
}

function etqHistFilaHtml(h, f) {
  const fecha = new Date(h.creado_en).toLocaleString('es-SV', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const que = h.tipo === 'nueva'
    ? `${etqCtl(h.desde)}${h.hasta > h.desde ? ' a ' + etqCtl(h.hasta) : ''} (${etqNum(h.hasta - h.desde + 1)})`
    : `Repuestas: ${etqResumirLista(h.controles)}`;
  const esUltima = h.tipo === 'nueva' && !h.anulada && h.hasta === f.ultimo;
  return `
    <div class="etq-hist${h.anulada ? ' anulada' : ''}">
      <div><strong>${que}</strong>${h.anulada ? ' · anulada' : ''}<small>${etqEsc(fecha)} · ${etqEsc(String(h.usuario || '').split('@')[0])}${h.nota ? ' · ' + etqEsc(h.nota) : ''}</small></div>
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
  const cuales = varias ? `${etqCtl(r.desde)} a ${etqCtl(r.hasta)}` : etqCtl(r.desde);
  if (!r.problema) {
    return `
    <div class="etq-recien" role="status">
      <span><strong>¿${varias ? 'Salieron bien' : 'Salió bien'}?</strong> ${etqEsc(r.titulo)} · ${cuales}</span>
      <button type="button" class="etq-si" onclick="etqRecienListo()">✔ Sí</button>
      <button type="button" class="etq-no" onclick="etqRecienProblema()">No</button>
    </div>`;
  }
  let botones = '';
  for (let c = r.desde; c < r.hasta; c++) {
    botones += `<button type="button" class="etq-num${r.ultimaBuena === c ? ' sel' : ''}" aria-pressed="${r.ultimaBuena === c}" onclick="etqRecienTocar(${c})">${etqCtl(c)}</button>`;
  }
  return `
    <div class="etq-recien problema" role="status">
      <span><strong>¿Qué pasó?</strong> ${etqEsc(r.titulo)} · ${cuales}</span>
      <div class="etq-pie">
        <button type="button" class="btn btn-ghost etq-necesita-impresora" onclick="etqMandarDeNuevo()">Mandar otra vez</button>
        <button type="button" class="btn btn-ghost" onclick="etqCorregir('${r.id}', null)">No salió ninguna</button>
        <button type="button" class="btn btn-ghost" onclick="etqRecienVolver()">Volver</button>
      </div>
      ${varias ? `
      <div class="etq-guia">¿Salieron solo algunas? Tocá la ÚLTIMA que salió bien</div>
      <div class="etq-nums">${botones}</div>
      ${r.ultimaBuena ? `<button type="button" class="etq-btn-imprimir" onclick="etqCorregir('${r.id}', ${r.ultimaBuena})">
        <strong>Anotar: salió hasta la ${etqCtl(r.ultimaBuena)}</strong><small>sigue la ${etqCtl(r.ultimaBuena + 1)}</small></button>` : ''}` : ''}
    </div>`;
}

// ── Acciones ─────────────────────────────────────────────────────────────
function etqElegirEmpresa(id) {
  etq.emp = id; etq.sel = null; etq.hist = []; etq.reponer = null; etq.n = null; etq.busca = ''; etq.tipo = null; etq.abierta = null;
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
function etqVerHist() { etq.verHist = !etq.verHist; etqRender(); }
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
  btn.disabled = !n || etq.ocupado || etqImpresoraMala();
  if (etq.ocupado) { tit.textContent = 'Mandando a la impresora…'; sub.textContent = ''; }
  else if (!n) { tit.textContent = `Escribí de 1 a ${etqTope()}`; sub.textContent = ''; }
  else {
    tit.textContent = `Imprimir ${etqNum(n)}`;
    sub.textContent = n === 1 ? `· la ${etqCtl(f.ultimo + 1)}` : `· de la ${etqCtl(f.ultimo + 1)} a la ${etqCtl(f.ultimo + n)}`;
  }
  document.querySelectorAll('.etq-chip').forEach(c => c.classList.toggle('sel', Number(c.dataset.n) === n));
}

async function etqImprimirSiguientes() {
  const f = etqFila();
  if (!f || etq.ocupado) return;
  const n = etq.n;
  if (!etqTieneImpresora()) { showToast('Las etiquetas se imprimen en la computadora del taller', 'warn'); return; }
  if (!n) { showToast('Poné cuántas etiquetas', 'warn'); return; }
  if (etq.recien) { showToast('Primero decí si la tanda anterior salió bien', 'warn'); return; }
  etq.ocupado = true; etqPintarN();
  try {
    if (!(await etqRevisarAhora())) { showToast((etqImp.mensaje || 'La impresora no está lista') + '. No se mandó nada.', 'error', 8000); return; }
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
  if (!etqTieneImpresora()) { showToast('Las etiquetas se imprimen en la computadora del taller', 'warn'); return; }
  const nums = [...etq.reponer].sort((a, b) => a - b);
  etq.ocupado = true;
  try {
    if (!(await etqRevisarAhora())) { showToast((etqImp.mensaje || 'La impresora no está lista') + '. No se mandó nada.', 'error', 8000); return; }
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
  if (!(await etqRevisarAhora())) { showToast((etqImp.mensaje || 'La impresora no está lista') + '. No se mandó nada.', 'error', 8000); return; }
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

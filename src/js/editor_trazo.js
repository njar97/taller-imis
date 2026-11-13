// ══════════════════════════════════════════════════════════════════════
// EDITOR DE TRAZO (v3.36) — mover, girar y voltear las piezas sobre la tela.
// Portado del artefacto «Trazo corte 3 azul · mesa de Imelda» (app_trazo/plantilla.html).
// Javier 12-nov-2026: «el artefacto (mover/girar piezas sobre la foto) que quede
// disponible para cada trazo que se cargue, y cargado con las tallas ya escaladas».
//
// Tela: x = largo (0 = INICIO, a la izquierda) · y = ancho (PARED arriba, y = 0; tiras abajo).
// Pieza: puntos locales `pts` [[x,y]…] en cm + translate(cx cy) rotate(ang) scale(fx fy).
// Cada «Guardar versión» inserta una fila NUEVA en trazo_layout (version = máx + 1);
// las versiones viejas no se tocan nunca.
// Se abre desde la ficha del corte: abrirEditorTrazo(trazoId).
// Todo va dentro de una función para no chocar con los nombres globales de la app.
// ══════════════════════════════════════════════════════════════════════
;(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const S = 4;                 // px de rejilla por cm (0.25 cm) para detectar choques
  const ANCHO_DEF = 151;
  const LARGO_DEF = 300;       // tela vacía cuando el trazo no trae largo
  const MAX_DESHACER = 80;
  const COLOR = {
    D: '#a9cbe8', T: '#6fa6d6', PR: '#d9d4ec', BD: '#f6c48f', BT: '#9fd6a2', TA: '#f3a99b', BR: '#f4e27a', BF: '#e98bc0',
    'F-DEL': '#c7b3ea', 'F-TRAS': '#a68bd6', 'F-PRET': '#e7def7',
    'S-DEL': '#9ad9cf', 'S-TRAS': '#5fb7aa', 'S-PRET': '#cdeee8', 'S-BOLSA': '#f6b3cf'
  };
  const GRIS = '#c4c9ce';
  const NOMBRE = {
    D: 'delantero', T: 'trasero', PR: 'pretina', BD: 'bolsa delantera', BT: 'bolsa trasera', TA: 'tapadera',
    BR: 'bragueta', BF: 'bolsa de falda', 'F-DEL': 'delantero de falda', 'F-TRAS': 'trasero de falda',
    'F-PRET': 'pretina de falda', 'S-DEL': 'delantero de short', 'S-TRAS': 'trasero de short',
    'S-PRET': 'pretina de short', 'S-BOLSA': 'bolsa de short'
  };
  const ORDEN_PIEZA = Object.keys(COLOR);
  const PRENDA = { P: 'Pantalón', F: 'Falda', S: 'Short' };
  const AYUDA = 'Tocá una pieza para elegirla y arrastrala. Arrastrá el fondo para recorrer la tela; con dos dedos acercás o alejás.';

  const ED = {
    abierto: false, cargando: false, guardando: false,
    trazoId: null, trazo: null, versiones: [], filaId: null, version: 0, ultima: 0, soloVista: false,
    ancho: ANCHO_DEF, largoRef: null, foto: null, fotoW: null, conFoto: true,
    piezas: [], sel: null, zoom: 2, deshacer: [], sucio: false, msgGuard: '',
    moldes: null, apPrenda: null, apTalla: null, ultimo: null
  };
  let ov = null, svg = null, mesa = null;
  let grupos = [], etiquetas = [], capaPiezas = null, telaRect = null, reglaG = null, fotoImg = null;
  let ultimoL = 0, sigK = 1, moldesProm = null, cuerpoOverflow = '';
  const $ = id => document.getElementById(id);

  // ---------- utilidades ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const r4 = v => Math.round(v * 4) / 4;
  const r2 = v => Math.round(v * 100) / 100;
  const techo4 = v => Math.ceil(v * 4 - 1e-6) / 4;
  function fmtNum(v) { return Number.isInteger(+v) ? String(+v) : (+v).toFixed(1); }
  function fechaCorta(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('es-SV', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }
  function json(v) { if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return null; } } return v; }
  function caja(pts) {
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    for (const [x, y] of pts) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
    return [a, b, c, d];
  }
  function areaPts(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
    return Math.abs(a / 2);
  }
  function ptsMundo(p, s) {
    s = s || p;
    const a = s.ang * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    return p.pts.map(([x, y]) => { x *= s.fx; y *= s.fy; return [s.cx + x * c - y * sn, s.cy + x * sn + y * c]; });
  }
  function svgEl(t, at, padre) {
    const e = document.createElementNS(NS, t);
    for (const k in (at || {})) e.setAttribute(k, at[k]);
    if (padre) padre.appendChild(e);
    return e;
  }
  function cmpTalla(a, b) {
    const v = t => /^\d+(\.\d+)?$/.test(t) ? +t : (/^(\d)X$/i.test(t) ? 100 + +t[0] : 1000);
    return v(a) - v(b) || String(a).localeCompare(String(b));
  }
  function cmpPieza(a, b) {
    const v = p => { const i = ORDEN_PIEZA.indexOf(p); return i < 0 ? 999 : i; };
    return v(a.pieza) - v(b.pieza) || String(a.pieza).localeCompare(String(b.pieza));
  }

  // Pieza guardada → pieza de trabajo (acepta también el formato viejo del artefacto: cod = pieza, t = talla).
  function normPieza(p) {
    if (!p) return null;
    const crudos = json(p.pts);
    if (!Array.isArray(crudos)) return null;
    const pts = crudos.map(q => [+q[0], +q[1]]).filter(q => isFinite(q[0]) && isFinite(q[1]));
    if (pts.length < 3) return null;
    const pieza = String(p.pieza || p.cod || '?');
    const talla = p.talla != null ? String(p.talla) : (p.t != null ? String(p.t) : '');
    return {
      _k: sigK++, cod: p.cod != null ? String(p.cod) : '', talla, pieza,
      nombre: p.nombre || NOMBRE[pieza] || pieza, pts,
      cx: +p.cx || 0, cy: +p.cy || 0, ang: +p.ang || 0, fx: +p.fx < 0 ? -1 : 1, fy: +p.fy < 0 ? -1 : 1,
      area: areaPts(pts)
    };
  }
  function piezasParaGuardar() {
    return ED.piezas.map(p => ({
      cod: p.cod, talla: p.talla, pieza: p.pieza, nombre: p.nombre, pts: p.pts,
      cx: r2(p.cx), cy: r2(p.cy), ang: r2(p.ang), fx: p.fx, fy: p.fy
    }));
  }

  // ---------- choques: máscara de rejilla por pieza (achicada 0.15 cm para que tocarse no cuente) ----------
  const cvs = document.createElement('canvas');
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  let mascaras = new Map();
  function mascara(p) {
    const k = p.ang.toFixed(2) + '|' + p.fx + '|' + p.fy;
    const m0 = mascaras.get(p._k);
    if (m0 && m0.k === k) return m0;
    const loc = ptsMundo(p, { cx: 0, cy: 0, ang: p.ang, fx: p.fx, fy: p.fy });
    const [x0, y0, x1, y1] = caja(loc);
    const w = Math.ceil((x1 - x0) * S) + 3, h = Math.ceil((y1 - y0) * S) + 3;
    cvs.width = w; cvs.height = h; ctx.clearRect(0, 0, w, h);
    ctx.setTransform(S, 0, 0, S, -x0 * S + 1, -y0 * S + 1);
    ctx.beginPath(); loc.forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fill();
    ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 0.3; ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
    const img = ctx.getImageData(0, 0, w, h).data, idx = [];
    for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) if (img[(r * w + q) * 4 + 3] > 127) idx.push(r, q);
    const m = { k, ox: x0 * S - 1, oy: y0 * S - 1, idx: Int16Array.from(idx) };
    mascaras.set(p._k, m);
    return m;
  }
  let GW = 0, GH = 0, cuenta = null;
  function rejilla(largoCm) {
    const gh = Math.ceil(ED.ancho * S), gw = Math.ceil((Math.max(largoCm, LARGO_DEF) + 120) * S);
    if (!cuenta || gh !== GH || gw > GW) { GH = gh; GW = gw + 400; cuenta = new Uint8Array(GW * GH); }
  }
  function origen(p, m) { return [Math.round(p.cx * S + m.ox), Math.round(p.cy * S + m.oy)]; }
  function sumar(i, signo) {
    const p = ED.piezas[i], m = mascara(p), [bx, by] = origen(p, m);
    for (let j = 0; j < m.idx.length; j += 2) {
      const r = by + m.idx[j], q = bx + m.idx[j + 1];
      if (r >= 0 && r < GH && q >= 0 && q < GW) cuenta[r * GW + q] += signo;
    }
  }
  function choca(i, dpx, dpy) {   // con la pieza i ya restada de la cuenta
    const p = ED.piezas[i], m = mascara(p), [bx, by] = origen(p, m);
    for (let j = 0; j < m.idx.length; j += 2) {
      const r = by + dpy + m.idx[j], q = bx + dpx + m.idx[j + 1];
      if (r < 0 || r >= GH || q < 0) return true;
      if (q < GW && cuenta[r * GW + q]) return true;
    }
    return false;
  }
  function estado() {
    const cajas = ED.piezas.map(p => caja(ptsMundo(p)));
    const x1max = cajas.reduce((m, c) => Math.max(m, c[2]), 0);
    rejilla(Math.max(x1max, ED.largoRef || 0));
    cuenta.fill(0);
    ED.piezas.forEach((_, i) => sumar(i, 1));
    return ED.piezas.map((p, i) => {
      const m = mascara(p), [bx, by] = origen(p, m);
      let n = 0;
      for (let j = 0; j < m.idx.length; j += 2) {
        const r = by + m.idx[j], q = bx + m.idx[j + 1];
        if (r < 0 || r >= GH || q < 0 || q >= GW || cuenta[r * GW + q] > 1) n++;
      }
      const c = cajas[i];
      const fuera = c[1] < -0.1 || c[3] > ED.ancho + 0.1 || c[0] < -0.1;
      return { mont: n > 6 || fuera, fuera, x0: c[0], y0: c[1], x1: c[2], y1: c[3] };
    });
  }

  // ---------- pantalla ----------
  function construir() {
    if (ov) return;
    ov = document.createElement('div');
    ov.id = 'editor-trazo';
    ov.className = 'modal ed-overlay';
    ov.style.display = 'none';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Editor de trazo');
    const B = (id, txt, title, extra) => `<button type="button" class="ed-b${extra ? ' ' + extra : ''}" id="${id}"${title ? ` title="${title}"` : ''}>${txt}</button>`;
    ov.innerHTML = `
      <div class="modal-header ed-top">
        <button type="button" class="btn btn-ghost btn-sm ed-cerrar" id="ed-cerrar" onclick="cerrarEditorTrazo()" aria-label="Cerrar el editor">✕</button>
        <div class="ed-titulo" id="ed-titulo">Editor de trazo</div>
        <select id="ed-versiones" class="ed-versiones" title="Versiones guardadas" aria-label="Versiones guardadas"></select>
      </div>
      <div class="ed-datos" id="ed-datos"></div>
      <div class="ed-barra" role="toolbar" aria-label="Herramientas del trazo">
        <div class="ed-grupo"><span>Girar</span>
          ${B('ed-g90i', '↺ 90°', 'Girar 90° a la izquierda (Mayús + R)')}${B('ed-g90d', '↻ 90°', 'Girar 90° a la derecha (R)')}
          ${B('ed-g1i', '↺ 1°', 'Girar 1° a la izquierda')}${B('ed-g1d', '↻ 1°', 'Girar 1° a la derecha')}
        </div>
        <div class="ed-grupo"><span>Espejo</span>
          ${B('ed-eh', '↔', 'Espejo de lado a lado (E)')}${B('ed-ev', '↕', 'Espejo de arriba a abajo')}
        </div>
        <div class="ed-grupo ed-arrimar"><span class="ed-lbl-arrimar">Arrimar<span class="ed-largo"> hasta tocar</span></span>
          ${B('ed-ai', '← inicio', 'Correr hacia el inicio hasta tocar')}${B('ed-af', 'final →', 'Correr hacia el final hasta tocar')}
          ${B('ed-ap', '↑ pared', 'Correr hacia la pared hasta tocar')}${B('ed-at', '↓ tiras', 'Correr hacia las tiras hasta tocar')}
        </div>
        <div class="ed-grupo"><span>Piezas</span>
          ${B('ed-agregar', '➕ Agregar piezas', 'Agregar piezas de los moldes escalados')}${B('ed-quitar', '🗑 Quitar pieza', 'Quitar la pieza elegida', 'peligro')}
        </div>
        <div class="ed-grupo"><span>Vista</span>
          ${B('ed-zm', '−', 'Alejar')}${B('ed-zp', '+', 'Acercar')}${B('ed-zt', 'Ver todo', 'Ver toda la tela')}
          ${B('ed-foto', 'Foto: sí', 'Mostrar u ocultar la foto de la mesa debajo de las piezas')}
        </div>
        <div class="ed-grupo">${B('ed-undo', '↶ Deshacer', 'Deshacer (Ctrl + Z)')}</div>
        <div class="ed-grupo ed-guardar">
          <input type="text" id="ed-nota" maxlength="120" placeholder="Nota (opcional)" aria-label="Nota de esta versión">
          ${B('ed-guardar', '💾 Guardar versión', 'Guardar como versión nueva', 'primario')}
        </div>
      </div>
      <div class="ed-panel" id="ed-panel" hidden>
        <div class="ed-panel-tit">➕ Agregar piezas <span class="ed-largo">(salen después del final; después las arrastrás)</span></div>
        <div class="ed-fila">
          <label>Prenda <select id="ed-ap-prenda"></select></label>
          <label>Talla <select id="ed-ap-talla"></select></label>
          <label class="ed-ap-pz">Pieza <select id="ed-ap-pieza"></select></label>
        </div>
        <div class="ed-fila">
          ${B('ed-ap-una', '➕ Agregar<span class="ed-largo"> esta pieza</span>', '', 'primario')}${B('ed-ap-todo', '👖 Prenda completa', 'Todas las piezas de esa prenda y talla')}${B('ed-ap-listo', 'Listo', 'Cerrar este panel')}
        </div>
        <div class="ed-ap-msg" id="ed-ap-msg"></div>
      </div>
      <div class="ed-vieja" id="ed-vieja" hidden>
        <span id="ed-vieja-txt"></span>
        ${B('ed-editar-vieja', '✏️ Editar desde esta')}
      </div>
      <div class="ed-info" id="ed-info" aria-live="polite"></div>
      <div class="ed-mesa" id="ed-mesa"><svg id="ed-svg" xmlns="${NS}"></svg></div>
      <div class="ed-ayuda">Inicio a la izquierda, pared arriba, tiras abajo. Raya roja: largo del trazo. En rojo: pieza montada o fuera de la tela. Teclado: flechas mueven 0.5 cm (con Mayús 5 cm), R gira 90°, E espejo, Ctrl+Z deshace, Esc suelta la pieza.</div>`;
    document.body.appendChild(ov);
    svg = $('ed-svg'); mesa = $('ed-mesa');

    const on = (id, f) => $(id).addEventListener('click', f);
    on('ed-g90i', () => girar(-90)); on('ed-g90d', () => girar(90)); on('ed-g1i', () => girar(-1)); on('ed-g1d', () => girar(1));
    on('ed-eh', () => espejo('fx')); on('ed-ev', () => espejo('fy'));
    on('ed-ai', () => arrimar(-1, 0)); on('ed-af', () => arrimar(1, 0)); on('ed-ap', () => arrimar(0, -1)); on('ed-at', () => arrimar(0, 1));
    on('ed-agregar', alternarPanel); on('ed-quitar', quitar);
    on('ed-zm', () => ponerZoom(ED.zoom / 1.3)); on('ed-zp', () => ponerZoom(ED.zoom * 1.3)); on('ed-zt', verTodo);
    on('ed-foto', () => ponerFoto(!ED.conFoto));
    on('ed-undo', deshacerUno); on('ed-guardar', guardar);
    on('ed-editar-vieja', editarDesdeVieja);
    on('ed-ap-una', () => agregar(false)); on('ed-ap-todo', () => agregar(true)); on('ed-ap-listo', alternarPanel);
    $('ed-ap-prenda').addEventListener('change', llenarTallas);
    $('ed-ap-talla').addEventListener('change', llenarPiezasSel);
    $('ed-versiones').addEventListener('change', e => elegirVersion(e.target.value));
    $('ed-nota').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } });

    mesa.addEventListener('pointerdown', alBajar);
    mesa.addEventListener('pointermove', alMover);
    mesa.addEventListener('pointerup', alSoltar);
    mesa.addEventListener('pointercancel', alSoltar);
    mesa.addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      ponerZoom(ED.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
    }, { passive: false });
  }

  function titulo() {
    const t = ED.trazo || {};
    const v = ED.version ? `v${ED.version}${ED.soloVista ? ' (vieja)' : ''}` : 'nuevo';
    $('ed-titulo').textContent = `Editor · Corte ${t.letra_corte || '—'} · ${v}`;
  }

  function armar() {
    svg.textContent = '';
    telaRect = svgEl('rect', { x: 0, y: 0, width: 100, height: ED.ancho, fill: '#2f4a7a', stroke: '#1d3157', 'stroke-width': 0.5 }, svg);
    fotoImg = null;
    if (ED.foto) {
      fotoImg = svgEl('image', { x: 0, y: 0, width: ED.fotoW || ED.largoRef || 360, height: ED.ancho, preserveAspectRatio: 'none' }, svg);
      fotoImg.setAttribute('href', ED.foto);
    }
    reglaG = svgEl('g', {}, svg);
    if (ED.largoRef) {
      const x = ED.largoRef;
      svgEl('line', { x1: x, x2: x, y1: -6, y2: ED.ancho + 6, stroke: '#d93025', 'stroke-width': 0.6, 'stroke-dasharray': '2 1.2' }, svg);
      svgEl('text', { x: x + 1, y: -2, class: 'ed-regla', fill: '#d93025' }, svg).textContent = `trazo ${(x / 100).toFixed(2)} m`;
    }
    capaPiezas = svgEl('g', {}, svg);
    grupos = ED.piezas.map((p, i) => {
      const g = svgEl('g', { class: 'ed-pieza', 'data-i': i }, capaPiezas);
      svgEl('polygon', { points: p.pts.map(q => q[0] + ',' + q[1]).join(' '), fill: COLOR[p.pieza] || GRIS }, g);
      return g;
    });
    const capaE = svgEl('g', {}, svg);
    etiquetas = ED.piezas.map(p => {
      const t = svgEl('text', { class: 'ed-etq' + (p.area < 400 ? ' chica' : '') }, capaE);
      t.textContent = p.pieza + p.talla;
      return t;
    });
    ultimoL = 0;
    ponerFoto(ED.conFoto);
  }

  function dibujarRegla(L) {
    reglaG.textContent = '';
    for (let x = 0; x <= L; x += 10) {
      svgEl('line', { x1: x, x2: x, y1: 0, y2: ED.ancho, stroke: 'rgba(255,255,255,.10)', 'stroke-width': x % 50 ? 0.2 : 0.45 }, reglaG);
      if (x % 20 === 0) svgEl('text', { x, y: ED.ancho + 6, class: 'ed-regla', 'text-anchor': 'middle' }, reglaG).textContent = x;
    }
    svgEl('text', { x: 0, y: -3, class: 'ed-regla' }, reglaG).textContent = 'INICIO · pared arriba';
    svgEl('text', { x: 0, y: ED.ancho + 12, class: 'ed-regla' }, reglaG).textContent = 'tiras';
  }

  function tamano() {
    const L = ultimoL || LARGO_DEF;
    svg.setAttribute('viewBox', `-4 -10 ${L + 8} ${ED.ancho + 24}`);
    svg.setAttribute('width', Math.round((L + 8) * ED.zoom));
    svg.setAttribute('height', Math.round((ED.ancho + 24) * ED.zoom));
  }

  function ponerTransform(i) {
    const p = ED.piezas[i];
    grupos[i].setAttribute('transform', `translate(${p.cx} ${p.cy}) rotate(${p.ang}) scale(${p.fx} ${p.fy})`);
    etiquetas[i].setAttribute('x', p.cx); etiquetas[i].setAttribute('y', p.cy);
  }

  function dibujar() {
    if (!svg || !telaRect) return;
    const res = estado();
    const largo = res.reduce((m, r) => Math.max(m, r.x1), 0);
    const L = Math.max((ED.largoRef || LARGO_DEF) + 30, Math.ceil(largo / 10) * 10 + 20, ED.foto && ED.fotoW ? Math.ceil(ED.fotoW) : 0);
    if (L !== ultimoL) { ultimoL = L; telaRect.setAttribute('width', L); dibujarRegla(L); }
    tamano();
    let nm = 0;
    ED.piezas.forEach((p, i) => {
      ponerTransform(i);
      grupos[i].classList.toggle('montada', res[i].mont);
      grupos[i].classList.toggle('sel', ED.sel === i);
      if (res[i].mont) nm++;
    });
    if (ED.sel !== null && grupos[ED.sel]) capaPiezas.appendChild(grupos[ED.sel]);
    ED.ultimo = { largo, nm };
    pintarDatos(largo, nm);
    pintarInfo(res);
    pintarBotones();
  }

  function pintarDatos(largo, nm) {
    const ref = ED.largoRef, hay = ED.piezas.length > 0;
    const claseL = hay && ref ? (largo <= ref + 0.05 ? 'ok' : 'malo') : '';
    $('ed-datos').innerHTML =
      `<span class="ed-dato ${claseL}">Largo del acomodo <b>${(largo / 100).toFixed(2)} m</b></span>` +
      (ref ? `<span class="ed-dato">Trazo <b>${(ref / 100).toFixed(2)} m</b></span>` : '') +
      `<span class="ed-dato ${nm ? 'malo' : (hay ? 'ok' : '')}">Montadas <b>${nm}</b></span>` +
      `<span class="ed-dato">Piezas <b>${ED.piezas.length}</b></span>` +
      `<span class="ed-dato">Ancho <b>${fmtNum(ED.ancho)} cm</b></span>` +
      `<span class="ed-dato ed-guard${ED.sucio ? ' malo' : ''}">${esc(ED.sucio ? 'Cambios sin guardar' : ED.msgGuard)}</span>`;
  }

  let avisoT = null;
  function avisar(t) {
    const inf = $('ed-info');
    clearTimeout(avisoT);
    inf.textContent = t;
    avisoT = setTimeout(() => { avisoT = null; dibujar(); }, 3500);
  }
  function pintarInfo(res) {
    if (avisoT) return;
    const inf = $('ed-info');
    const p = ED.sel !== null ? ED.piezas[ED.sel] : null;
    if (!p) {
      inf.textContent = ED.soloVista ? 'Versión vieja: solo vista. Tocá una pieza para ver dónde va.'
        : (ED.piezas.length ? AYUDA : 'La tela está vacía: tocá «➕ Agregar piezas» para poner los moldes.');
      return;
    }
    const r = res[ED.sel];
    const giro = (((p.ang % 360) + 360) % 360);
    inf.innerHTML = `<b>${esc(p.pieza + p.talla)} · ${esc(p.nombre)}${p.talla ? ' talla ' + esc(p.talla) : ''}</b>` +
      ` — desde el inicio ${r.x0.toFixed(1)} a ${r.x1.toFixed(1)} cm · de las tiras ${(ED.ancho - r.y1).toFixed(1)} a ${(ED.ancho - r.y0).toFixed(1)} cm` +
      ` · giro ${Number.isInteger(giro) ? giro : giro.toFixed(2)}°${p.fx < 0 ? ' · espejo ↔' : ''}${p.fy < 0 ? ' · espejo ↕' : ''}` +
      (r.mont ? ` · <b class="ed-malo">${r.fuera ? 'FUERA DE LA TELA' : 'MONTADA'}</b>` : '');
  }

  function pintarBotones() {
    const sinSel = ED.sel === null || ED.soloVista || ED.cargando;
    ['ed-g90i', 'ed-g90d', 'ed-g1i', 'ed-g1d', 'ed-eh', 'ed-ev', 'ed-ai', 'ed-af', 'ed-ap', 'ed-at', 'ed-quitar']
      .forEach(id => { $(id).disabled = sinSel; });
    $('ed-agregar').disabled = ED.soloVista || ED.cargando;
    $('ed-undo').disabled = ED.soloVista || ED.cargando || !ED.deshacer.length;
    $('ed-guardar').disabled = ED.guardando || ED.cargando;
    $('ed-foto').hidden = !ED.foto;
    $('ed-vieja').hidden = !ED.soloVista;
    if (ED.soloVista) {
      $('ed-vieja-txt').textContent = `Estás viendo la versión ${ED.version} (vieja): solo vista. Si la guardás, queda como versión ${ED.ultima + 1}.`;
    }
    if (ED.soloVista && !$('ed-panel').hidden) cerrarPanel();
    titulo();
  }

  function ponerFoto(v) {
    ED.conFoto = !!v && !!ED.foto;
    if (fotoImg) fotoImg.style.display = ED.conFoto ? '' : 'none';
    svg.classList.toggle('con-foto', ED.conFoto);
    const b = $('ed-foto');
    b.innerHTML = 'Foto<span class="ed-largo"> de la mesa</span>: ' + (ED.conFoto ? 'sí' : 'no');
    b.setAttribute('aria-pressed', String(ED.conFoto));
  }
  function medirFoto(url) {
    const im = new Image();
    im.onload = () => {
      if (ED.foto !== url || !im.naturalHeight) return;
      ED.fotoW = ED.ancho * im.naturalWidth / im.naturalHeight;   // la foto cubre todo el ancho de la tela
      if (fotoImg) fotoImg.setAttribute('width', ED.fotoW);
      if (ED.abierto) dibujar();
    };
    im.src = url;
  }

  function ponerZoom(z, ax, ay) {
    z = Math.min(14, Math.max(0.4, z));
    const r = mesa.getBoundingClientRect();
    const px = ax == null ? r.width / 2 : ax - r.left, py = ay == null ? r.height / 2 : ay - r.top;
    const ux = (mesa.scrollLeft + px) / ED.zoom, uy = (mesa.scrollTop + py) / ED.zoom;
    ED.zoom = z;
    tamano();
    mesa.scrollLeft = ux * z - px;
    mesa.scrollTop = uy * z - py;
  }
  function verTodo() {
    if (!ED.abierto) return;
    dibujar();
    const L = ultimoL || LARGO_DEF;
    const zw = (mesa.clientWidth - 4) / (L + 8), zh = (mesa.clientHeight - 4) / (ED.ancho + 24);
    ED.zoom = Math.min(14, Math.max(0.4, Math.min(zw, zh > 0 ? zh : zw)));
    tamano();
    mesa.scrollLeft = 0; mesa.scrollTop = 0;
  }
  // Al abrir: en el celular la tela llena el alto de la mesa (piezas más grandes para tocarlas) y se recorre a lo largo.
  function vistaInicial() {
    verTodo();
    if (mesa.clientWidth < 700) {
      const zh = (mesa.clientHeight - 4) / (ED.ancho + 24);
      if (zh > ED.zoom) { ED.zoom = Math.min(14, zh); tamano(); mesa.scrollLeft = 0; mesa.scrollTop = 0; }
    }
  }

  // ---------- cambios ----------
  const instantanea = () => JSON.stringify(ED.piezas);
  function pasoDeshacer(snap) {
    ED.deshacer.push(snap || instantanea());
    if (ED.deshacer.length > MAX_DESHACER) ED.deshacer.shift();
    marcarSucio();
  }
  function marcarSucio() { ED.sucio = true; desarmarCerrar(); }
  function puede() { return !ED.soloVista && !ED.cargando && ED.sel !== null && !!ED.piezas[ED.sel]; }
  function girar(d) {
    if (!puede()) return;
    pasoDeshacer();
    const p = ED.piezas[ED.sel];
    p.ang = r2((((p.ang + d) % 360) + 360) % 360);
    dibujar();
  }
  function espejo(eje) {
    if (!puede()) return;
    pasoDeshacer();
    ED.piezas[ED.sel][eje] *= -1;
    dibujar();
  }
  function mover(dx, dy) {
    if (!puede()) return;
    pasoDeshacer();
    const p = ED.piezas[ED.sel];
    p.cx = r4(p.cx + dx); p.cy = r4(p.cy + dy);
    dibujar();
  }
  function arrimar(dx, dy) {
    if (!puede()) return;
    const i = ED.sel;
    estado(); sumar(i, -1);
    if (choca(i, 0, 0)) { avisar('La pieza está montada o fuera de la tela: movela a un lugar libre y después arrimala.'); return; }
    const tope = dx ? GW : GH;
    let n = 0;
    for (const paso of [8, 1]) while (n + paso <= tope && !choca(i, dx * (n + paso), dy * (n + paso))) n += paso;
    if (!n) { avisar('Ya está tocando hacia ese lado.'); return; }
    if (n >= tope) { avisar('No hay nada contra qué arrimarla hacia ese lado.'); return; }
    pasoDeshacer();
    const p = ED.piezas[i];
    p.cx = r4(p.cx + dx * n / S); p.cy = r4(p.cy + dy * n / S);
    dibujar();
    avisar(`Se corrió ${(n / S).toFixed(2)} cm hasta tocar.`);
  }
  function quitar() {
    if (!puede()) return;
    pasoDeshacer();
    const p = ED.piezas.splice(ED.sel, 1)[0];
    ED.sel = null;
    armar(); dibujar();
    avisar(`Se quitó ${p.pieza}${p.talla}. Si fue sin querer, tocá «↶ Deshacer».`);
  }
  function deshacerUno() {
    if (ED.soloVista || !ED.deshacer.length) return;
    ED.piezas = JSON.parse(ED.deshacer.pop());
    if (ED.sel !== null && ED.sel >= ED.piezas.length) ED.sel = null;
    marcarSucio();
    armar(); dibujar();
  }

  // ---------- arrastre, recorrido y pellizco ----------
  const punteros = new Map();
  let arr = null, pinch = null;
  function aSvg(e) {
    const p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  function distancia(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function alBajar(e) {
    if (!ED.abierto || ED.cargando) return;
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { mesa.setPointerCapture(e.pointerId); } catch (_) { /* puntero sintético */ }
    if (punteros.size >= 2) {        // dos dedos: acercar / alejar
      if (arr && arr.modo === 'pieza' && arr.movio) {
        const p = ED.piezas[arr.i]; p.cx = arr.cx; p.cy = arr.cy; ponerTransform(arr.i);
      }
      arr = null; mesa.classList.remove('arrastrando');
      const [a, b] = [...punteros.values()];
      pinch = { d: distancia(a, b), z: ED.zoom };
      e.preventDefault();
      return;
    }
    const g = e.target && e.target.closest ? e.target.closest('.ed-pieza') : null;
    if (g) {
      const i = +g.getAttribute('data-i');
      ED.sel = i;
      const pt = aSvg(e), p = ED.piezas[i];
      arr = { modo: ED.soloVista ? 'ver' : 'pieza', i, x: pt.x, y: pt.y, cx: p.cx, cy: p.cy, movio: false, antes: instantanea() };
      dibujar();
    } else {
      arr = { modo: 'vista', x: e.clientX, y: e.clientY, sl: mesa.scrollLeft, st: mesa.scrollTop, movio: false };
      mesa.classList.add('arrastrando');
    }
    e.preventDefault();
  }
  function alMover(e) {
    if (!punteros.has(e.pointerId)) return;
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) {
      if (punteros.size >= 2) {
        const [a, b] = [...punteros.values()];
        const d = distancia(a, b);
        if (pinch.d > 10) ponerZoom(pinch.z * d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      return;
    }
    if (!arr) return;
    if (arr.modo === 'vista') {
      const dx = e.clientX - arr.x, dy = e.clientY - arr.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) arr.movio = true;
      mesa.scrollLeft = arr.sl - dx; mesa.scrollTop = arr.st - dy;
      return;
    }
    if (arr.modo !== 'pieza') return;
    const pt = aSvg(e), p = ED.piezas[arr.i];
    p.cx = r4(arr.cx + pt.x - arr.x); p.cy = r4(arr.cy + pt.y - arr.y);
    if (p.cx !== arr.cx || p.cy !== arr.cy) arr.movio = true;
    ponerTransform(arr.i);
  }
  function alSoltar(e) {
    punteros.delete(e.pointerId);
    if (pinch) { if (punteros.size < 2) pinch = null; arr = null; mesa.classList.remove('arrastrando'); return; }
    if (!arr) return;
    if (arr.modo === 'pieza' && arr.movio) { pasoDeshacer(arr.antes); dibujar(); }
    else if (arr.modo === 'vista' && !arr.movio && ED.sel !== null) { ED.sel = null; dibujar(); }
    arr = null;
    mesa.classList.remove('arrastrando');
  }

  // ---------- teclado (solo con el editor abierto; antes que los atajos globales) ----------
  window.addEventListener('keydown', e => {
    if (!ED.abierto) return;
    const t = e.target;
    if (t && t.closest && t.closest('input,textarea,select')) return;
    let hecho = true;
    const k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') deshacerUno();
    else if (e.key === 'Escape') {
      if (ED.sel !== null) { ED.sel = null; dibujar(); } else hecho = false;   // sin pieza elegida, Esc cierra (atajos globales)
    } else if (ED.sel === null || e.ctrlKey || e.metaKey || e.altKey) hecho = false;
    else {
      const d = e.shiftKey ? 5 : 0.5;
      const flecha = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (flecha) mover(flecha[0], flecha[1]);
      else if (k === 'r') girar(e.shiftKey ? -90 : 90);
      else if (k === 'e') espejo('fx');
      else hecho = false;
    }
    if (hecho) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // ---------- agregar piezas de los moldes escalados ----------
  function cargarMoldes() {
    if (!moldesProm) {
      const q = '?activo=eq.true&select=cod_prenda,talla,pieza,nombre,contorno,por_prenda,giro_libre&order=cod_prenda,talla,pieza';
      moldesProm = (typeof supaFetchAll === 'function' ? supaFetchAll('molde_pieza', q) : supaFetch('molde_pieza', 'GET', null, q))
        .catch(err => { moldesProm = null; throw err; });
    }
    return moldesProm;
  }
  function cerrarPanel() { $('ed-panel').hidden = true; $('ed-agregar').setAttribute('aria-pressed', 'false'); }
  async function alternarPanel() {
    const pn = $('ed-panel');
    if (!pn.hidden) { cerrarPanel(); return; }
    if (ED.soloVista) return;
    pn.hidden = false;
    $('ed-agregar').setAttribute('aria-pressed', 'true');
    const msg = $('ed-ap-msg');
    if (!ED.moldes) {
      msg.textContent = 'Cargando moldes…';
      try { ED.moldes = (await cargarMoldes()) || []; }
      catch (err) { msg.textContent = 'No se pudieron leer los moldes: ' + err.message; return; }
    }
    llenarPrendas();
  }
  function llenarPrendas() {
    const filas = ED.moldes || [];
    const sel = $('ed-ap-prenda');
    const ord = c => { const i = 'PFS'.indexOf(c); return i < 0 ? 9 : i; };
    const prendas = [...new Set(filas.map(f => f.cod_prenda))].sort((a, b) => ord(a) - ord(b) || String(a).localeCompare(String(b)));
    const hay = prendas.length > 0;
    ['ed-ap-prenda', 'ed-ap-talla', 'ed-ap-pieza', 'ed-ap-una', 'ed-ap-todo'].forEach(id => { $(id).disabled = !hay; });
    if (!hay) { sel.innerHTML = ''; $('ed-ap-talla').innerHTML = ''; $('ed-ap-pieza').innerHTML = ''; $('ed-ap-msg').textContent = 'Todavía no hay moldes cargados en la app.'; return; }
    sel.innerHTML = prendas.map(c => `<option value="${esc(c)}">${esc(PRENDA[c] || c)}</option>`).join('');
    if (ED.apPrenda && prendas.includes(ED.apPrenda)) sel.value = ED.apPrenda;
    llenarTallas();
  }
  function llenarTallas() {
    const c = $('ed-ap-prenda').value;
    ED.apPrenda = c;
    const tallas = [...new Set((ED.moldes || []).filter(f => f.cod_prenda === c).map(f => String(f.talla)))].sort(cmpTalla);
    const sel = $('ed-ap-talla');
    sel.innerHTML = tallas.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    if (ED.apTalla && tallas.includes(ED.apTalla)) sel.value = ED.apTalla;
    llenarPiezasSel();
  }
  function moldesDe(c, t) { return (ED.moldes || []).filter(f => f.cod_prenda === c && String(f.talla) === t).sort(cmpPieza); }
  function llenarPiezasSel() {
    const t = $('ed-ap-talla').value;
    ED.apTalla = t;
    const lista = moldesDe($('ed-ap-prenda').value, t);
    $('ed-ap-pieza').innerHTML = lista.map((f, j) =>
      `<option value="${j}">${esc(f.pieza)} · ${esc(f.nombre || NOMBRE[f.pieza] || '')}${+f.por_prenda > 1 ? ' (lleva ' + (+f.por_prenda) + ')' : ''}</option>`).join('');
    const total = lista.reduce((s, f) => s + Math.max(1, +f.por_prenda || 1), 0);
    $('ed-ap-todo').innerHTML = `👖 Prenda completa (${total}<span class="ed-largo"> pieza${total === 1 ? '' : 's'}</span>)`;
    $('ed-ap-msg').textContent = '';
  }
  // Las nuevas salen después de la pieza más a la derecha (largo + 5 cm), apiladas hacia las tiras.
  function colocar(nuevas) {
    const res = estado();
    const largo = res.reduce((m, r) => Math.max(m, r.x1), 0);
    let colX = ED.piezas.length ? largo + 5 : 0, y = 0, colW = 0;
    for (const p of nuevas) {
      const [x0, y0, x1, y1] = caja(p.pts);
      const w = x1 - x0, h = y1 - y0;
      if (y > 0 && y + h > ED.ancho) { colX += colW + 2; y = 0; colW = 0; }
      p.cx = techo4(colX - x0); p.cy = techo4(y - y0);
      y += h + 1; colW = Math.max(colW, w);
    }
  }
  function agregar(todo) {
    if (ED.soloVista || ED.cargando) return;
    const lista = moldesDe($('ed-ap-prenda').value, $('ed-ap-talla').value);
    const elegidas = todo
      ? lista.flatMap(f => Array.from({ length: Math.max(1, +f.por_prenda || 1) }, () => f))
      : [lista[+$('ed-ap-pieza').value]].filter(Boolean);
    const nuevas = elegidas.map(f => normPieza({
      cod: f.cod_prenda, talla: String(f.talla), pieza: f.pieza, nombre: f.nombre || NOMBRE[f.pieza], pts: json(f.contorno), cx: 0, cy: 0
    })).filter(Boolean);
    if (!nuevas.length) { $('ed-ap-msg').textContent = 'Ese molde no tiene contorno guardado.'; return; }
    pasoDeshacer();
    colocar(nuevas);
    const desde = ED.piezas.length;
    ED.piezas.push(...nuevas);
    ED.sel = desde;
    armar(); dibujar();
    const x0 = caja(ptsMundo(nuevas[0]))[0];
    mesa.scrollLeft = Math.max(0, (x0 + 4) * ED.zoom - 40);
    const txt = `Se agregaron ${nuevas.length} pieza${nuevas.length === 1 ? '' : 's'} después del final. Arrastralas a su lugar.`;
    $('ed-ap-msg').textContent = txt;
    avisar(txt);
  }

  // ---------- versiones ----------
  function ponerFila(fila) {
    let piezas = fila ? json(fila.piezas) : [];
    ED.filaId = fila ? fila.id : null;
    ED.version = fila ? +fila.version : 0;
    ED.ultima = ED.versiones.length ? +ED.versiones[0].version : 0;
    ED.soloVista = !!fila && ED.version !== ED.ultima;
    ED.ancho = fila && +fila.ancho_cm > 0 ? +fila.ancho_cm : ANCHO_DEF;
    ED.foto = fila && fila.foto_fondo_url ? fila.foto_fondo_url : null;
    ED.fotoW = null;
    ED.conFoto = !!ED.foto;
    ED.piezas = (Array.isArray(piezas) ? piezas : []).map(normPieza).filter(Boolean);
    ED.sel = null; ED.deshacer = []; ED.sucio = false;
    mascaras = new Map();
    ED.msgGuard = fila ? `Versión ${ED.version} · ${fechaCorta(fila.creado_en)}` : 'Todavía sin guardar';
    cuenta = null;
    if (ED.foto) medirFoto(ED.foto);
  }
  function llenarVersiones() {
    const s = $('ed-versiones');
    if (!ED.versiones.length) { s.innerHTML = '<option value="">Sin versiones guardadas</option>'; s.disabled = true; return; }
    s.disabled = false;
    s.innerHTML = ED.versiones.map((v, j) =>
      `<option value="${esc(v.id)}">v${esc(v.version)}${j === 0 ? ' (última)' : ''} · ${esc(fechaCorta(v.creado_en))}${v.nota ? ' · ' + esc(String(v.nota).slice(0, 40)) : ''}</option>`).join('');
    s.value = ED.filaId || '';
  }
  let descartarId = null, descartarT = null;
  async function elegirVersion(id) {
    const s = $('ed-versiones');
    if (!id || id === ED.filaId) return;
    if (ED.sucio && descartarId !== id) {
      descartarId = id;
      clearTimeout(descartarT);
      descartarT = setTimeout(() => { descartarId = null; }, 8000);
      s.value = ED.filaId || '';
      avisar('Tenés cambios sin guardar. Guardalos primero, o elegí esa versión otra vez para dejarlos.');
      return;
    }
    descartarId = null;
    s.disabled = true;
    try {
      const [fila] = await supaFetch('trazo_layout', 'GET', null, `?id=eq.${encodeURIComponent(id)}`);
      if (!fila) throw new Error('no se encontró esa versión');
      ponerFila(fila);
      armar(); verTodo();
      avisar(ED.soloVista ? `Versión ${ED.version}: solo vista.` : `Versión ${ED.version} (la última).`);
    } catch (err) {
      avisar('No se pudo abrir esa versión: ' + err.message);
    } finally {
      s.disabled = false;
      s.value = ED.filaId || '';
    }
  }
  function editarDesdeVieja() {
    if (!ED.soloVista) return;
    ED.soloVista = false;
    marcarSucio();
    dibujar();
    avisar(`Ya podés moverla. Al guardar queda como versión ${ED.ultima + 1}.`);
  }

  async function guardar() {
    if (ED.guardando || ED.cargando || !ED.trazoId) return;
    ED.guardando = true;
    const b = $('ed-guardar');
    b.disabled = true; b.textContent = 'Guardando…';
    try {
      const res = estado();
      const largo = res.reduce((m, r) => Math.max(m, r.x1), 0);
      const nota = ($('ed-nota').value || '').trim() || null;
      const fila = {
        trazo_id: ED.trazoId, ancho_cm: ED.ancho, largo_cm: Math.round(largo * 10) / 10,
        piezas: piezasParaGuardar(), foto_fondo_url: ED.foto, nota
      };
      let hecha = null;
      for (let intento = 0; intento < 3 && !hecha; intento++) {
        const ult = await supaFetch('trazo_layout', 'GET', null, `?trazo_id=eq.${ED.trazoId}&select=version&order=version.desc&limit=1`);
        fila.version = (ult && ult[0] ? +ult[0].version : 0) + 1;
        try {
          const r = await supaFetch('trazo_layout', 'POST', fila);
          hecha = (Array.isArray(r) ? r[0] : r) || { version: fila.version };
        } catch (err) {
          // otra persona guardó al mismo tiempo: se toma el número siguiente
          if (intento === 2 || !/duplicate|unique|23505/i.test(err.message)) throw err;
        }
      }
      const v = +hecha.version || fila.version;
      const resumen = { id: hecha.id || null, version: v, creado_en: hecha.creado_en || new Date().toISOString(), nota, largo_cm: fila.largo_cm };
      ED.versiones = [resumen, ...ED.versiones.filter(x => +x.version !== v)];
      ED.filaId = resumen.id; ED.version = v; ED.ultima = v; ED.soloVista = false; ED.sucio = false;
      ED.msgGuard = `Guardado versión ${v}`;
      $('ed-nota').value = '';
      llenarVersiones();
      dibujar();
      avisar(`Guardado versión ${v}.`);
      if (typeof showToast === 'function') showToast(`Trazo guardado: versión ${v}`, 'success', 3000);
      const f = $('ficha-ed-ver');
      if (f) f.textContent = `Último acomodo guardado: v${v} · ${fechaCorta(resumen.creado_en)} · ${(fila.largo_cm / 100).toFixed(2)} m`;
    } catch (err) {
      avisar('No se guardó: ' + err.message);
      if (typeof showToast === 'function') showToast('No se guardó el trazo: ' + err.message, 'error');
    } finally {
      ED.guardando = false;
      b.textContent = '💾 Guardar versión';
      pintarBotones();
    }
  }

  // ---------- abrir / cerrar ----------
  let cerrarArmado = null;
  function desarmarCerrar() {
    if (cerrarArmado) { clearTimeout(cerrarArmado); cerrarArmado = null; }
    const b = $('ed-cerrar');
    if (b) b.textContent = '✕';
  }
  function cerrarEditorTrazo() {
    if (!ov || !ED.abierto) return;
    if (ED.sucio && !cerrarArmado) {
      $('ed-cerrar').textContent = '✕ Salir sin guardar';
      avisar('Tenés cambios sin guardar. Tocá «💾 Guardar versión», o tocá «✕ Salir sin guardar» para salir igual.');
      cerrarArmado = setTimeout(desarmarCerrar, 6000);
      return;
    }
    desarmarCerrar();
    ov.style.display = 'none';
    ED.abierto = false;
    document.body.style.overflow = cuerpoOverflow;
    punteros.clear(); arr = null; pinch = null;
  }

  async function abrirEditorTrazo(trazoId) {
    construir();
    if (!ED.abierto) cuerpoOverflow = document.body.style.overflow;
    ED.abierto = true; ED.cargando = true; ED.trazoId = trazoId; ED.trazo = null;
    ED.versiones = []; ED.piezas = []; ED.sel = null; ED.deshacer = []; ED.sucio = false; ED.soloVista = false;
    ED.filaId = null; ED.version = 0; ED.foto = null; ED.fotoW = null; ED.largoRef = null;
    desarmarCerrar(); cerrarPanel();
    clearTimeout(avisoT); avisoT = null;
    ov.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    svg.textContent = ''; telaRect = null;
    $('ed-titulo').textContent = 'Editor de trazo · cargando…';
    $('ed-datos').textContent = '';
    $('ed-info').textContent = 'Cargando el trazo…';
    $('ed-nota').value = '';
    pintarBotones();
    $('ed-titulo').textContent = 'Editor de trazo · cargando…';
    $('ed-versiones').innerHTML = ''; $('ed-versiones').disabled = true;
    try {
      const [tr, vers] = await Promise.all([
        supaFetch('trazo', 'GET', null, `?id=eq.${encodeURIComponent(trazoId)}&select=id,letra_corte,codigo_corte,largo_cm,fecha`),
        supaFetch('trazo_layout', 'GET', null, `?trazo_id=eq.${encodeURIComponent(trazoId)}&select=id,version,creado_en,creado_por,nota,largo_cm&order=version.desc`)
      ]);
      if (ED.trazoId !== trazoId) return;            // se abrió otro mientras cargaba
      ED.trazo = (tr && tr[0]) || { id: trazoId };
      ED.largoRef = +ED.trazo.largo_cm > 0 ? +ED.trazo.largo_cm : null;
      ED.versiones = vers || [];
      let fila = null;
      if (ED.versiones.length) {
        const r = await supaFetch('trazo_layout', 'GET', null, `?id=eq.${encodeURIComponent(ED.versiones[0].id)}`);
        fila = r && r[0];
      }
      if (ED.trazoId !== trazoId) return;
      ponerFila(fila);
    } catch (err) {
      // se queda «cargando» para que las herramientas sigan apagadas; solo sirve ✕
      $('ed-info').innerHTML = `<span class="ed-malo">No se pudo abrir el editor: ${esc(err.message)}</span>`;
      $('ed-titulo').textContent = 'Editor de trazo';
      return;
    }
    ED.cargando = false;
    llenarVersiones();
    armar();
    dibujar();
    requestAnimationFrame(vistaInicial);
  }

  window.abrirEditorTrazo = abrirEditorTrazo;
  window.cerrarEditorTrazo = cerrarEditorTrazo;
  window._editorTrazo = ED;   // para revisar desde la consola
})();

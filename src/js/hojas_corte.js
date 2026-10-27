// ══════════════════════════════════════════════════════════════════════
// CORTE → 📐 Hojas: hojas para imprimir y pegar en la mesa de corte.
// Hoja 1: bolsa delantera del pantalón (tabla MINED 2026).
//   A = separación del costado en la cintura ("posición de bolsa de costado")
//   B = abertura de la boca ("abertura de bolsa delantera")
//   Punta de abajo a 0.6 cm del costado (criterio IMIS, 20-oct-2026).
// Formato aprobado por Javier el 27-oct-2026: blanco y negro, letras y
// números grandes, dibujo hecho con Gemini.
// ══════════════════════════════════════════════════════════════════════

const HC_BOLSA_DEL = {
  '4': [3, 13], '6': [3, 13], '8': [3, 13], '10': [4, 15], '12': [4, 15],
  '14': [5, 17], '16': [5, 17], '18': [5, 18], '20': [5, 18], '22': [5, 18],
  '1X': [5, 18], '2X': [5, 18], '3X': [5, 18],
};
// Tallas de pantalón de la temporada (lote 1 MINED 2026)
const HC_TEMPORADA = ['8', '10', '12', '14', '16', '20'];
const HC_STORAGE = 'hc_tallas_bolsa_del';

// Dibujo del delantero (Gemini, recortado, 580 × 630 px, B/N)
const HC_IMG_BOLSA = 'data:image/png;base64,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';

function hcTallasElegidas() {
  try {
    const v = JSON.parse(localStorage.getItem(HC_STORAGE) || 'null');
    if (Array.isArray(v) && v.length) return v.filter(t => HC_BOLSA_DEL[t]);
  } catch (_) {}
  return HC_TEMPORADA.slice();
}

function hcGuardarTallas(arr) {
  try { localStorage.setItem(HC_STORAGE, JSON.stringify(arr)); } catch (_) {}
}

function initHojasCorte() {
  const cont = document.getElementById('corte-hojas-content');
  if (!cont) return;
  const sel = new Set(hcTallasElegidas());
  const chips = Object.keys(HC_BOLSA_DEL).map(t =>
    `<button type="button" class="btn btn-sm ${sel.has(t) ? 'btn-primary' : 'btn-ghost'}" style="min-width:52px" onclick="hcToggleTalla('${t}')">T${t}</button>`
  ).join('');
  cont.innerHTML = `
    <div class="card">
      <div class="card-title">👖 Bolsa delantera · pantalón</div>
      <div class="card-sub">Separación (A) y abertura (B) según la tabla MINED 2026. Hoja carta, blanco y negro, números grandes.</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">${chips}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="hcSetTallas(HC_TEMPORADA)">Tallas de la temporada</button>
        <button class="btn btn-ghost btn-sm" onclick="hcSetTallas(Object.keys(HC_BOLSA_DEL))">Todas</button>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:12px" onclick="hcImprimirBolsaDelantera()">🖨 Imprimir hoja</button>
    </div>`;
}

function hcToggleTalla(t) {
  const sel = new Set(hcTallasElegidas());
  if (sel.has(t)) sel.delete(t); else sel.add(t);
  const orden = Object.keys(HC_BOLSA_DEL).filter(x => sel.has(x));
  hcGuardarTallas(orden.length ? orden : HC_TEMPORADA.slice());
  initHojasCorte();
}

function hcSetTallas(arr) { hcGuardarTallas(arr.slice()); initHojasCorte(); }

function hcHtmlBolsaDelantera(tallas) {
  const n = tallas.length;
  const rh = Math.min(2.1, 12.4 / n);              // alto de fila en cm (≈12.4 cm para la tabla)
  const fs = Math.round(rh * Math.min(0.72, 0.62 + (2.1 - rh) * 0.1) * 28.35);        // tamaño de número en pt
  const filas = tallas.map((t, i) => {
    const [a, b] = HC_BOLSA_DEL[t];
    return `<tr${i % 2 === 0 ? ' class="g"' : ''} style="height:${rh}cm;font-size:${fs}pt"><td>T${t}</td><td>${a}</td><td>${b}</td></tr>`;
  }).join('');
  // Puntos del dibujo (px del recorte): cintura y=27; boca arriba x=363;
  // costado en la cintura x=489; punta de abajo (517, 390).
  const xa = 363, ya = 27, xc = 489, xb = 517, yb = 390;
  const L = Math.hypot(xb - xa, yb - ya);
  const nx = -(yb - ya) / L, ny = (xb - xa) / L;   // perpendicular a la boca
  const off = 50, offG = 110;                     // flecha B y su globo, del lado de afuera
  const gx = (xa + xb) / 2 + nx * offG, gy = (ya + yb) / 2 + ny * offG;
  const svg = `
    <svg viewBox="-20 -110 620 750" xmlns="http://www.w3.org/2000/svg">
      <defs><marker id="p" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="#000"/></marker></defs>
      <image href="${HC_IMG_BOLSA}" x="0" y="0" width="580" height="630"/>
      <line x1="${xa}" y1="${ya}" x2="${xa}" y2="-45" stroke="#000" stroke-width="2"/>
      <line x1="${xc}" y1="${ya}" x2="${xc}" y2="-45" stroke="#000" stroke-width="2"/>
      <line x1="${xa + 4}" y1="-38" x2="${xc - 4}" y2="-38" stroke="#000" stroke-width="5" marker-start="url(#p)" marker-end="url(#p)"/>
      <circle cx="${xa - 55}" cy="-38" r="42" fill="#000"/>
      <text x="${xa - 55}" y="-20" font-size="52" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial">A</text>
      <line x1="${xa + nx * off}" y1="${ya + ny * off}" x2="${xb + nx * off}" y2="${yb + ny * off}" stroke="#000" stroke-width="5" marker-start="url(#p)" marker-end="url(#p)"/>
      <circle cx="${gx}" cy="${gy}" r="42" fill="#000"/>
      <text x="${gx}" y="${gy + 18}" font-size="52" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial">B</text>
      <text x="${xb + 48}" y="${yb + 10}" font-size="40" font-weight="700" font-family="Arial">← 0.6</text>
    </svg>`;
  const gl = l => `<span class="gl">${l}</span>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Bolsa delantera - corte</title><style>
    @page{size:letter;margin:1.2cm}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0}
    h1{font-size:30pt;text-align:center;margin:0}
    .sub{text-align:center;color:#555;font-size:14pt;margin:2px 0 8px}
    .top{display:flex;align-items:center;gap:10px;height:8.2cm}
    .top svg{height:8.2cm;width:9.5cm;flex:0 0 auto}
    .ley{flex:1}.ley div{display:flex;align-items:center;gap:10px;margin:0 0 16px}
    .ley b{display:block;font-size:17pt}.ley small{font-size:11pt}
    .gl{display:inline-flex;align-items:center;justify-content:center;width:1.1cm;height:1.1cm;border-radius:50%;background:#000;color:#fff;font-weight:700;font-size:20pt;flex:0 0 auto}
    .gl.n{background:none;color:#000;font-size:15pt}
    table{width:100%;border-collapse:collapse;border:2.5px solid #000;margin-top:8px}
    th{background:#000;color:#fff;font-size:17pt;height:1.4cm}
    th .gl{background:#fff;color:#000;width:.9cm;height:.9cm;font-size:16pt;margin-right:6px;vertical-align:middle}
    td{text-align:center;font-weight:700;border-left:2px solid #000;border-top:1px solid #888;width:33%}
    tr.g td{background:#e0e0e0}
    .pie{text-align:center;color:#555;font-size:10.5pt;margin-top:8px}
  </style></head><body>
    <h1>BOLSA DELANTERA · PANTALÓN</h1>
    <div class="sub">Tabla MINED 2026 · medidas en centímetros</div>
    <div class="top">${svg}<div class="ley">
      <div>${gl('A')}<span><b>SEPARACIÓN</b><small>del costado, en la cintura</small></span></div>
      <div>${gl('B')}<span><b>ABERTURA</b><small>largo de la boca (en diagonal)</small></span></div>
      <div><span class="gl n">0.6</span><span><b>PUNTA DE ABAJO</b><small>a 0.6 cm del costado (todas)</small></span></div>
    </div></div>
    <table><thead><tr><th>TALLA</th><th>${gl('A')}SEPARACIÓN</th><th>${gl('B')}ABERTURA</th></tr></thead>
    <tbody>${filas}</tbody></table>
    <div class="pie">Delantero SIN costura en el costado. La punta de abajo de la boca siempre a 0.6 cm del costado.</div>
  </body></html>`;
}

async function hcImprimirBolsaDelantera() {
  const now = Date.now();
  if (now - (window._hcLastTry || 0) < 1000) return;   // evita doble toque
  window._hcLastTry = now;
  const docHtml = hcHtmlBolsaDelantera(hcTallasElegidas());
  let iframe = null;
  try {
    // iframe con srcdoc: el método que sí imprime en la PWA del celular
    iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('sandbox', 'allow-same-origin allow-modals allow-scripts');
    const loaded = new Promise(res => {
      iframe.addEventListener('load', () => res(), { once: true });
      setTimeout(res, 4000);
    });
    iframe.srcdoc = docHtml;
    document.body.appendChild(iframe);
    await loaded;
    await new Promise(r => setTimeout(r, 250));
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  } catch (e) {
    const win = window.open('', '_blank');
    if (win) {
      win.document.open(); win.document.write(docHtml); win.document.close();
      setTimeout(() => { try { win.print(); } catch (_) {} }, 500);
    } else {
      alert('No se pudo abrir la hoja para imprimir: ' + (e && e.message || e));
    }
  } finally {
    setTimeout(() => { try { iframe && iframe.remove(); } catch (_) {} }, 30000);
  }
}

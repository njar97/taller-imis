// ══════════════════════════════════════════════════════════════════════
// ESTADÍSTICA — PRONÓSTICO DE TALLAS (porteado de 2026 PRONOSTICO.xlsm)
// Toma la distribución histórica de tallas de una temporada (por prenda,
// opcionalmente filtrando escuelas) y la aplica a una cantidad nueva a
// producir. Reparto por resto mayor: los redondeos siempre suman exacto
// el objetivo.
// ══════════════════════════════════════════════════════════════════════

let pronCache = {
  temporadas: null,      // [{id, codigo, nombre, anio, estado}]
  temporadaId: null,
  escuelas: null,        // [{id, alias, nombre}]
  alumnos: null,         // filas crudas de la temporada seleccionada
  filtros: {
    prenda: '',          // nombre canónico; '' = aún sin elegir
    escuelas: [],        // ids; vacío = todas
    objetivo: '',        // cantidad nueva a producir (string del input)
  },
};

async function initPronostico() {
  const root = document.getElementById('est-sub-pronostico-view');
  if (!root) return;
  root.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando datos históricos...</div>';

  try {
    if (!pronCache.temporadas) {
      pronCache.temporadas = await supaFetchAll('temporada', '?select=id,codigo,nombre,anio,estado&order=anio.desc');
      if (!pronCache.temporadas.length) throw new Error('No hay temporadas cargadas');
      const activa = pronCache.temporadas.find(t => t.estado === 'activa');
      pronCache.temporadaId = (activa || pronCache.temporadas[0]).id;
    }
    if (!pronCache.escuelas) {
      pronCache.escuelas = await supaFetchAll('escuela', '?select=id,alias,nombre&order=alias.asc');
    }
    if (!pronCache.alumnos) {
      pronCache.alumnos = await supaFetchAll('alumno',
        `?temporada_id=eq.${pronCache.temporadaId}&activo=eq.true&select=escuela_id,prenda_top,talla_top_key,prenda_bottom,talla_bottom_key&limit=10000`);
    }
    renderPronostico();
  } catch (e) {
    console.error('[pronostico]', e);
    root.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

async function pronCambiarTemporada(id) {
  pronCache.temporadaId = id;
  pronCache.alumnos = null;
  await initPronostico();
}

function pronToggleEscuela(id) {
  const f = pronCache.filtros;
  const i = f.escuelas.indexOf(id);
  if (i >= 0) f.escuelas.splice(i, 1); else f.escuelas.push(id);
  renderPronostico();
}

function pronSetPrenda(nombre) {
  pronCache.filtros.prenda = nombre;
  renderPronostico();
}

function pronSetObjetivo(v) {
  pronCache.filtros.objetivo = v;
  // Solo re-render de la tabla para no perder el foco del input
  const cont = document.getElementById('pron-tabla');
  if (cont) cont.innerHTML = pronTablaHtml();
}

// ── Cálculo ──────────────────────────────────────────────────────────

// Filas históricas de la prenda elegida: [{talla, n}] ordenadas por talla.
function pronConteos() {
  const f = pronCache.filtros;
  const escSet = f.escuelas.length ? new Set(f.escuelas) : null;
  const counts = {};
  for (const a of (pronCache.alumnos || [])) {
    if (escSet && !escSet.has(a.escuela_id)) continue;
    if (a.prenda_top === f.prenda && a.talla_top_key) {
      counts[a.talla_top_key] = (counts[a.talla_top_key] || 0) + 1;
    }
    if (a.prenda_bottom === f.prenda && a.talla_bottom_key) {
      counts[a.talla_bottom_key] = (counts[a.talla_bottom_key] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([talla, n]) => ({ talla, n }))
    .sort((a, b) => pronOrdenTalla(a.talla) - pronOrdenTalla(b.talla)
                    || a.talla.localeCompare(b.talla));
}

// Orden natural: número inicial de la talla (8, 10, 12-3L, 38...) — las que
// no empiezan con número van al final en orden alfabético.
function pronOrdenTalla(t) {
  const m = String(t).match(/^\d+/);
  return m ? parseInt(m[0], 10) : 9999;
}

// Reparto por resto mayor: round() ingenuo puede sumar ≠ objetivo.
function pronRepartir(conteos, objetivo) {
  const total = conteos.reduce((s, c) => s + c.n, 0);
  if (!total) return conteos.map(c => ({ ...c, pct: 0, forecast: 0 }));
  if (!objetivo) return conteos.map(c => ({ ...c, pct: c.n / total, forecast: 0 }));
  const exactos = conteos.map(c => ({ ...c, pct: c.n / total, exacto: c.n / total * objetivo }));
  let asignado = 0;
  for (const e of exactos) { e.forecast = Math.floor(e.exacto); asignado += e.forecast; }
  const restos = exactos.map((e, i) => ({ i, frac: e.exacto - e.forecast }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < objetivo - asignado; k++) exactos[restos[k % restos.length].i].forecast++;
  return exactos;
}

// ── Render ───────────────────────────────────────────────────────────

function renderPronostico() {
  const root = document.getElementById('est-sub-pronostico-view');
  if (!root) return;
  const f = pronCache.filtros;

  // Prendas disponibles con su conteo total (en la temporada, sin filtro escuela)
  const prendaTot = {};
  for (const a of (pronCache.alumnos || [])) {
    if (a.prenda_top && a.talla_top_key) prendaTot[a.prenda_top] = (prendaTot[a.prenda_top] || 0) + 1;
    if (a.prenda_bottom && a.talla_bottom_key) prendaTot[a.prenda_bottom] = (prendaTot[a.prenda_bottom] || 0) + 1;
  }
  const prendas = Object.keys(prendaTot).sort();
  if (f.prenda && !prendas.includes(f.prenda)) f.prenda = '';
  if (!f.prenda && prendas.length) f.prenda = prendas[0];

  const tempOpts = pronCache.temporadas.map(t =>
    `<option value="${t.id}" ${t.id === pronCache.temporadaId ? 'selected' : ''}>${t.nombre || t.codigo} (${t.anio})${t.estado === 'activa' ? ' · activa' : ''}</option>`).join('');

  const prendaChips = prendas.map(p =>
    `<button class="btn btn-sm ${p === f.prenda ? 'btn-primary' : 'btn-ghost'}"
      onclick="pronSetPrenda('${p.replace(/'/g, "\\'")}')">${p} <span style="opacity:.6">${prendaTot[p]}</span></button>`).join(' ');

  const escChips = pronCache.escuelas.map(e => {
    const on = f.escuelas.includes(e.id);
    return `<button class="btn btn-sm ${on ? 'btn-primary' : 'btn-ghost'}" style="font-size:11px;padding:3px 8px"
      onclick="pronToggleEscuela('${e.id}')" title="${(e.nombre || '').replace(/"/g, '&quot;')}">${e.alias || e.nombre}</button>`;
  }).join(' ');

  root.innerHTML = `
    <div class="card" style="padding:12px;margin-bottom:10px">
      <div style="font-size:13px;color:#666;margin-bottom:10px">
        🔮 <strong>Pronóstico de tallas</strong>: usa la distribución de tallas de una temporada
        pasada para repartir una cantidad nueva a producir (p. ej. la contratada para la próxima
        temporada). Reemplaza al libro <em>2026 PRONOSTICO.xlsm</em>.
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
        <label style="font-size:12px">Temporada base:
          <select onchange="pronCambiarTemporada(this.value)">${tempOpts}</select>
        </label>
        <label style="font-size:12px">Cantidad a producir:
          <input id="pron-objetivo" type="number" min="1" inputmode="numeric" value="${f.objetivo}"
            oninput="pronSetObjetivo(this.value)" style="width:110px" placeholder="p. ej. 1200">
        </label>
      </div>
      <div style="margin-bottom:8px"><span style="font-size:12px;color:#888">Prenda:</span> ${prendaChips}</div>
      <div><span style="font-size:12px;color:#888">Escuelas (ninguna = todas):</span> ${escChips}</div>
    </div>
    <div id="pron-tabla">${pronTablaHtml()}</div>`;
}

function pronTablaHtml() {
  const f = pronCache.filtros;
  if (!f.prenda) return '<div class="text-muted" style="padding:20px;text-align:center">No hay prendas con tallas en esta temporada.</div>';

  const conteos = pronConteos();
  const total = conteos.reduce((s, c) => s + c.n, 0);
  if (!total) return '<div class="text-muted" style="padding:20px;text-align:center">Sin datos históricos para esta prenda con el filtro actual.</div>';

  const objetivo = Math.max(0, parseInt(f.objetivo, 10) || 0);
  const filas = pronRepartir(conteos, objetivo);
  const totF = filas.reduce((s, x) => s + x.forecast, 0);

  const escTxt = f.escuelas.length
    ? pronCache.escuelas.filter(e => f.escuelas.includes(e.id)).map(e => e.alias || e.nombre).join(', ')
    : 'todas las escuelas';

  const rows = filas.map(x => `
    <tr>
      <td style="font-weight:600">${x.talla}</td>
      <td style="text-align:right">${x.n}</td>
      <td style="text-align:right;color:#888">${(x.pct * 100).toFixed(1)}%</td>
      <td style="text-align:right;font-weight:700;${objetivo ? '' : 'color:#bbb'}">${objetivo ? x.forecast : '—'}</td>
    </tr>`).join('');

  const aviso = total < 30
    ? `<div class="alert" style="margin-top:8px;font-size:12px">⚠️ Solo ${total} dato(s) histórico(s) — la distribución puede no ser representativa.</div>`
    : '';

  return `
    <div class="card" style="padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <div style="font-size:13px"><strong>${f.prenda}</strong> · base: ${total} pieza(s) de ${escTxt}</div>
        <button class="btn btn-sm btn-ghost" onclick="pronPDF()" ${objetivo ? '' : 'disabled title="Ingresá la cantidad a producir"'}>🖨️ PDF</button>
      </div>
      <div style="overflow-x:auto">
        <table class="table" style="width:100%;min-width:340px">
          <thead><tr>
            <th>Talla</th><th style="text-align:right">Histórico</th>
            <th style="text-align:right">%</th><th style="text-align:right">Pronóstico</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr style="border-top:2px solid #999;font-weight:700">
            <td>TOTAL</td><td style="text-align:right">${total}</td><td style="text-align:right">100%</td>
            <td style="text-align:right">${objetivo ? totF : '—'}</td>
          </tr></tfoot>
        </table>
      </div>
      ${aviso}
    </div>`;
}

// ── PDF (mismo approach iframe srcdoc que el resumen por talla) ──────

async function pronPDF() {
  const f = pronCache.filtros;
  const objetivo = Math.max(0, parseInt(f.objetivo, 10) || 0);
  if (!f.prenda || !objetivo) return;

  const conteos = pronConteos();
  const total = conteos.reduce((s, c) => s + c.n, 0);
  const filas = pronRepartir(conteos, objetivo);
  const temp = pronCache.temporadas.find(t => t.id === pronCache.temporadaId) || {};
  const escTxt = f.escuelas.length
    ? pronCache.escuelas.filter(e => f.escuelas.includes(e.id)).map(e => e.alias || e.nombre).join(', ')
    : 'todas las escuelas';
  const hoy = new Date().toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' });

  const rows = filas.map(x => `
    <tr>
      <td style="border:1px solid #999;padding:4px 8px;font-weight:600">${x.talla}</td>
      <td style="border:1px solid #999;padding:4px 8px;text-align:right">${x.n}</td>
      <td style="border:1px solid #999;padding:4px 8px;text-align:right">${(x.pct * 100).toFixed(1)}%</td>
      <td style="border:1px solid #999;padding:4px 8px;text-align:right;font-weight:700">${x.forecast}</td>
    </tr>`).join('');

  const docHtml = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>pronostico-${f.prenda}-${objetivo}</title>
<style>
  @page { size: letter portrait; margin: 0.5in; }
  html, body { margin:0; padding:0; color:#222; font-family: Arial, sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  table { border-collapse: collapse; width:100%; font-size:12px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
</style></head>
<body>
  <h2 style="margin:0 0 2px">Pronóstico de tallas — ${f.prenda}</h2>
  <div style="font-size:11px;color:#555;margin-bottom:10px">
    Base histórica: temporada ${temp.nombre || temp.codigo || ''} (${temp.anio || ''}) · ${escTxt} · ${total} pieza(s)<br>
    Cantidad a producir: <strong>${objetivo}</strong> · Generado: ${hoy} · Taller IMIS
  </div>
  <table>
    <thead><tr>
      <th style="border:1px solid #999;padding:4px 8px;background:#eee;text-align:left">Talla</th>
      <th style="border:1px solid #999;padding:4px 8px;background:#eee;text-align:right">Histórico</th>
      <th style="border:1px solid #999;padding:4px 8px;background:#eee;text-align:right">%</th>
      <th style="border:1px solid #999;padding:4px 8px;background:#eee;text-align:right">Pronóstico</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="font-weight:700">
      <td style="border:1px solid #999;padding:4px 8px">TOTAL</td>
      <td style="border:1px solid #999;padding:4px 8px;text-align:right">${total}</td>
      <td style="border:1px solid #999;padding:4px 8px;text-align:right">100%</td>
      <td style="border:1px solid #999;padding:4px 8px;text-align:right">${filas.reduce((s, x) => s + x.forecast, 0)}</td>
    </tr></tfoot>
  </table>
</body></html>`;

  const now = Date.now();
  if (now - (window._pronPdfLastTry || 0) < 1000) return;
  window._pronPdfLastTry = now;

  let iframe = null;
  try {
    iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('sandbox', 'allow-same-origin allow-modals allow-scripts');
    const loaded = new Promise((resolve, reject) => {
      iframe.addEventListener('load', () => resolve('load'), { once: true });
      iframe.addEventListener('error', () => reject(new Error('Falló la carga del iframe')), { once: true });
      setTimeout(() => resolve('timeout'), 4000);
    });
    iframe.srcdoc = docHtml;
    document.body.appendChild(iframe);
    await loaded;
    await new Promise(r => setTimeout(r, 250));
    if (!iframe.contentWindow) throw new Error('contentWindow no disponible');
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  } catch (e) {
    console.error('[pronostico PDF]', e);
    try {
      const win = window.open('', '_blank');
      if (win) {
        win.document.open(); win.document.write(docHtml); win.document.close();
        win.focus();
        setTimeout(() => { try { win.print(); } catch (_) {} }, 500);
      } else {
        alert('No se pudo abrir el PDF: ' + (e && e.message || e));
      }
    } catch (e2) {
      alert('Error al generar el PDF: ' + (e && e.message || e));
    }
  } finally {
    setTimeout(() => { if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 30000);
  }
}

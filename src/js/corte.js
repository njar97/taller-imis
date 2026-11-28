// ══════════════════════════════════════════════════════════════════════
// CORTE — tab unificado: Lo que sigue + Nuevo (Trazo/Tendido/Bulto) + Historial
// ══════════════════════════════════════════════════════════════════════

let corteSubActual = 'sigue';

function initCorte() {
  // Si veníamos de otra sub-tab, dejarla. Si es la primera entrada, 'sigue'.
  switchSubCorte(corteSubActual || 'sigue');
}

function switchSubCorte(sub) {
  corteSubActual = sub;
  const subs = ['sigue', 'nuevo', 'trazos', 'tendidos', 'bultos', 'hojas'];
  subs.forEach(s => {
    const btn = document.getElementById('corte-sub-' + s);
    if (btn) {
      btn.classList.toggle('btn-primary', s === sub);
      btn.classList.toggle('btn-ghost', s !== sub);
    }
  });

  const sigueView = document.getElementById('corte-sub-sigue-view');
  const nuevoView = document.getElementById('corte-sub-nuevo-view');
  const listaView = document.getElementById('corte-sub-lista-view');
  const hojasView = document.getElementById('corte-sub-hojas-view');
  if (!nuevoView || !listaView) return;
  if (hojasView) hojasView.style.display = sub === 'hojas' ? '' : 'none';
  if (sigueView) sigueView.style.display = sub === 'sigue' ? '' : 'none';

  if (sub === 'sigue') {
    nuevoView.style.display = 'none';
    listaView.style.display = 'none';
    cargarLoQueSigue();
    return;
  }

  if (sub === 'nuevo') {
    nuevoView.style.display = '';
    listaView.style.display = 'none';
    return;
  }

  if (sub === 'hojas') {
    nuevoView.style.display = 'none';
    listaView.style.display = 'none';
    if (typeof initHojasCorte === 'function') initHojasCorte();
    return;
  }

  // sub ∈ {trazos, tendidos, bultos}
  nuevoView.style.display = 'none';
  listaView.style.display = '';

  const titulos = { trazos: '<span class="tj-ico tj-azul"><svg class="ico" aria-hidden="true"><use href="#i-tijera"/></svg></span> Trazos', tendidos: '<span class="tj-ico tj-azul"><svg class="ico" aria-hidden="true"><use href="#i-capas"/></svg></span> Tendidos', bultos: '<span class="tj-ico tj-azul"><svg class="ico" aria-hidden="true"><use href="#i-caja"/></svg></span> Bultos' };
  const tipos   = { trazos: 'trazo',     tendidos: 'tendido',     bultos: 'bulto' };
  const tit = document.getElementById('corte-lista-titulo');
  if (tit) tit.innerHTML = titulos[sub] || '';

  // Reutilizamos historial.js: renderea dentro de #historial-content.
  // Como ese div vive en otra view, lo puenteamos creando el div temporal.
  const cont = document.getElementById('corte-lista-content');
  if (cont) {
    cont.innerHTML = '<div id="historial-content"><div class="loading">Cargando...</div></div>';
  }
  if (typeof cargarHistorial === 'function') cargarHistorial(tipos[sub]);
}

// ── ▶ Lo que sigue: trazos pendientes de tender, en orden ─────────────
function corteEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function cargarLoQueSigue() {
  const cont = document.getElementById('corte-sigue-content');
  if (!cont) return;
  cont.innerHTML = '<div class="loading">Cargando...</div>';
  try {
    const [pend, hechos] = await Promise.all([
      supaFetch('vw_trazos_sin_tendido', 'GET', null, '?limit=50'),
      cargarYaTendidos().catch(() => '')
    ]);
    if (!pend.length) {
      cont.innerHTML = `<div class="empty"><div class="empty-icon"><svg class="ico" aria-hidden="true"><use href="#i-listo"/></svg></div>No hay tendidos pendientes.<br>
        <button class="btn btn-ghost btn-sm mt8" onclick="switchSubCorte('nuevo')"><svg class="ico" aria-hidden="true"><use href="#i-sumar"/></svg> Anotar un trazo nuevo</button></div>` + hechos;
      return;
    }
    const ids = pend.map(p => p.id).join(',');
    const trazos = await supaFetch('trazo', 'GET', null,
      `?id=in.(${ids})&select=id,codigo_corte,fecha,capas,largo_cm,tallas_tendido,foto_url,orden`);
    // Primero el orden que fijó Javier; los demás por nombre (Plan T1, T2 … T10)
    trazos.sort(ordenPlanes);
    _sigueOrden = trazos.map(t => t.id);

    cont.innerHTML = trazos.map((t, i) => {
      const datos = [
        t.tallas_tendido ? corteEsc(tallasTendidoBonito(t.tallas_tendido)) : '',
        t.capas ? `${t.capas} lienzos` : '',
        t.largo_cm ? `${(t.largo_cm / 100).toFixed(2)} m` : ''
      ].filter(Boolean).join(' · ');
      const primero = i === 0;
      return `
        <div class="sigue-item${primero ? ' sigue-primero' : ''}">
          ${t.foto_url ? `<img class="sigue-foto" src="${corteEsc(t.foto_url)}" alt="" loading="lazy" onclick="verDetalle('trazo','${t.id}')">` : ''}
          <div class="sigue-info">
            ${primero ? '<div class="sigue-etiqueta">SIGUE ESTE</div>' : ''}
            <div class="sigue-titulo">${corteEsc(t.codigo_corte || t.fecha)}</div>
            <div class="sigue-datos">${datos}</div>
            <div class="sigue-botones">
              <button class="btn ${primero ? 'btn-success' : 'btn-ghost'} btn-sm" onclick="tenderTrazo('${t.id}')"><svg class="ico" aria-hidden="true"><use href="#i-tijera"/></svg> Tender este</button>
              <button class="btn btn-ghost btn-sm" onclick="verDetalle('trazo','${t.id}')">Ver ficha</button>
              ${i > 0 ? `<button class="btn btn-ghost btn-sm dato-sensible" onclick="corteMoverPlan('${t.id}',-1)" title="Tender antes">▲ Antes</button>` : ''}
              ${i < trazos.length - 1 ? `<button class="btn btn-ghost btn-sm dato-sensible" onclick="corteMoverPlan('${t.id}',1)" title="Tender después">▼ Después</button>` : ''}
            </div>
          </div>
        </div>`;
    }).join('') + hechos;
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${corteEsc(e.message)}</div>`;
  }
}

// Mover un plan en la lista «Sigue». Guarda el orden de todos los pendientes
// (1, 2, 3…) para que Inicio, Corte y Tendido digan lo mismo.
let _sigueOrden = [];
let _sigueMoviendo = false;
async function corteMoverPlan(id, dir) {
  if (_sigueMoviendo) return;
  const lista = _sigueOrden.slice();
  const i = lista.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  _sigueMoviendo = true;
  try {
    for (let k = 0; k < lista.length; k++) {
      await supaUpdate('trazo', lista[k], { orden: k + 1 });
    }
    if (typeof _hoySigue !== 'undefined') _hoySigue.t = 0;   // Inicio vuelve a preguntar
    showToast('Orden guardado', 'success');
  } catch (e) {
    showToast('No se pudo guardar el orden: ' + e.message, 'error');
  } finally {
    _sigueMoviendo = false;
    cargarLoQueSigue();
  }
}

// ── Ya tendidos: los trazos de la temporada que ya se tendieron (registro) ──
// Javier 18-nov: «los trazos que ya se tendieron no aparecen como historial».
async function cargarYaTendidos() {
  const desde = typeof CORTES_DESDE === 'string' ? CORTES_DESDE : '2026-10-01';
  const tends = await supaFetch('tendido', 'GET', null,
    `?select=id,fecha,trazo_id,letra_corte&trazo_id=not.is.null&fecha=gte.${desde}&order=fecha.desc&limit=40`);
  if (!tends || !tends.length) return '';
  const ids = [...new Set(tends.map(t => t.trazo_id))];
  const trazos = await supaFetch('trazo', 'GET', null,
    `?id=in.(${ids.join(',')})&select=id,codigo_corte,letra_corte,capas,largo_cm,tallas_tendido,foto_url`);
  const porId = new Map((trazos || []).map(t => [t.id, t]));
  const vistos = new Set();
  const filas = tends.filter(td => porId.has(td.trazo_id) && !vistos.has(td.trazo_id) && vistos.add(td.trazo_id)).map(td => {
    const t = porId.get(td.trazo_id);
    const datos = [
      t.tallas_tendido ? corteEsc(tallasTendidoBonito(t.tallas_tendido)) : '',
      t.capas ? `${t.capas} lienzos` : '',
      t.largo_cm ? `${(t.largo_cm / 100).toFixed(2)} m` : ''
    ].filter(Boolean).join(' · ');
    const fecha = new Date(td.fecha + 'T12:00:00').toLocaleDateString('es-SV', { day: 'numeric', month: 'short' });
    return `
      <div class="sigue-item">
        ${t.foto_url ? `<img class="sigue-foto" src="${corteEsc(t.foto_url)}" alt="" loading="lazy" onclick="verDetalle('trazo','${t.id}')">` : ''}
        <div class="sigue-info">
          <div class="sigue-etiqueta" style="background:#6b7280">TENDIDO ${corteEsc(fecha)}</div>
          <div class="sigue-titulo">${corteEsc(t.codigo_corte || 'Corte ' + (td.letra_corte || ''))}</div>
          <div class="sigue-datos">${datos}</div>
          <div class="sigue-botones">
            <button class="btn btn-ghost btn-sm" onclick="verDetalle('trazo','${t.id}')">Ver ficha</button>
            <button class="btn btn-ghost btn-sm" onclick="abrirEditorTrazo('${t.id}')"><svg class="ico" aria-hidden="true"><use href="#i-lapiz"/></svg> Ver trazo</button>
          </div>
        </div>
      </div>`;
  });
  if (!filas.length) return '';
  return `<div class="card-title" style="margin-top:18px"><span class="tj-ico tj-azul"><svg class="ico" aria-hidden="true"><use href="#i-capas"/></svg></span> Ya tendidos</div>` + filas.join('');
}

// Abre el asistente de tendido con el trazo ya elegido.
function tenderTrazo(trazoId) {
  if (typeof cerrarDetalle === 'function') {
    const ov = document.getElementById('detalle-overlay');
    if (ov && ov.classList.contains('active')) cerrarDetalle();
  }
  window._tdPreseleccion = trazoId;
  irA('tendido');
}

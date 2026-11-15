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

  const titulos = { trazos: '✂️ Trazos', tendidos: '📋 Tendidos', bultos: '📦 Bultos' };
  const tipos   = { trazos: 'trazo',     tendidos: 'tendido',     bultos: 'bulto' };
  const tit = document.getElementById('corte-lista-titulo');
  if (tit) tit.textContent = titulos[sub] || '';

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
    const pend = await supaFetch('vw_trazos_sin_tendido', 'GET', null, '?limit=50');
    if (!pend.length) {
      cont.innerHTML = `<div class="empty"><div class="empty-icon">✅</div>No hay tendidos pendientes.<br>
        <button class="btn btn-ghost btn-sm mt8" onclick="switchSubCorte('nuevo')">➕ Anotar un trazo nuevo</button></div>`;
      return;
    }
    const ids = pend.map(p => p.id).join(',');
    const trazos = await supaFetch('trazo', 'GET', null,
      `?id=in.(${ids})&select=id,codigo_corte,fecha,capas,largo_cm,tallas_tendido,foto_url`);
    // Orden natural por nombre: Plan T1, Plan T2 … Plan T10
    trazos.sort((a, b) => String(a.codigo_corte || '').localeCompare(String(b.codigo_corte || ''), 'es', { numeric: true }));

    cont.innerHTML = trazos.map((t, i) => {
      const datos = [
        t.tallas_tendido ? corteEsc(t.tallas_tendido) : '',
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
              <button class="btn ${primero ? 'btn-success' : 'btn-ghost'} btn-sm" onclick="tenderTrazo('${t.id}')">▶ Tender este</button>
              <button class="btn btn-ghost btn-sm" onclick="verDetalle('trazo','${t.id}')">Ver ficha</button>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${corteEsc(e.message)}</div>`;
  }
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

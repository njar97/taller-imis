// ══════════════════════════════════════════════════════════════════════
// FICHA DEL CORTE (v3.35) — toda la secuencia en un solo lugar:
// imagen del trazo → datos → tendido y rollos → bultos y su avance → seguimiento.
// Javier 12-nov-2026: «que quede la evidencia de los trazos, que después entró a
// producción, y el seguimiento que yo te voy dando».
// Se abre desde Corte → ✂️ Trazos (verDetalle('trazo', id) en historial.js).
// ══════════════════════════════════════════════════════════════════════
function escH(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function renderFichaCorte(trazoId) {
  const cont = document.getElementById('det-contenido');
  const [trazo] = await supaFetch('trazo', 'GET', null, `?id=eq.${trazoId}`);
  const [tallas, tendidos] = await Promise.all([
    supaFetch('trazo_talla_marcada', 'GET', null, `?trazo_id=eq.${trazoId}&order=orden`),
    supaFetch('tendido', 'GET', null, `?trazo_id=eq.${trazoId}&order=fecha`)
  ]);
  document.getElementById('det-titulo').textContent = `Corte ${trazo.letra_corte || '—'} · ${trazo.codigo_corte || trazo.fecha}`;

  const talla = t => `${t.talla ? 'T' + t.talla : ''} <span class="text-muted">(${escH(t.talla_key_original)})</span>`;
  let html = '';
  if (trazo.foto_url) {
    html += `<div class="detalle-seccion"><div class="detalle-seccion-titulo">✂️ Trazo</div>
      <a href="${escH(trazo.foto_url)}" target="_blank" rel="noopener"><img src="${escH(trazo.foto_url)}" style="width:100%;border-radius:8px;border:1px solid #ddd" alt="Trazo del corte ${escH(trazo.letra_corte)}"></a>
      <div class="text-muted" style="font-size:11px;margin-top:4px">Tocá la imagen para verla grande.</div></div>`;
  }
  html += `<div class="detalle-seccion">
      <div class="detalle-seccion-titulo">Datos del trazo</div>
      <div class="detalle-campo"><span>Fecha</span><span>${escH(trazo.fecha)}</span></div>
      <div class="detalle-campo"><span>Letra del corte</span><span><strong>${escH(trazo.letra_corte || '—')}</strong></span></div>
      ${trazo.largo_cm ? `<div class="detalle-campo"><span>Largo del lienzo</span><span>${(trazo.largo_cm / 100).toFixed(2)} m</span></div>` : ''}
      <div class="detalle-campo"><span>Lienzos</span><span>${trazo.capas || '—'}</span></div>
      <div class="detalle-campo"><span>Yardas</span><span>${trazo.yardas_estimadas || '—'}</span></div>
    </div>
    <div class="detalle-seccion">
      <div class="detalle-seccion-titulo">Tallas en el lienzo (2.ª letra del código)</div>
      ${tallas.map(t => `<div class="detalle-campo"><span><strong style="color:var(--azul)">${escH(t.letra_local)}</strong> · ${talla(t)}</span><span>${escH(t.tipo)}${t.multiplicidad > 1 ? ' ×' + t.multiplicidad : ''}</span></div>`).join('')}
    </div>`;
  if (trazo.observaciones) html += `<div class="detalle-seccion"><div class="detalle-seccion-titulo">Observaciones</div><p style="font-size:13px">${escH(trazo.observaciones)}</p></div>`;

  if (!tendidos.length) {
    html += `<div class="detalle-seccion"><div class="alert alert-info">Este trazo todavía no se tiende.</div></div>`;
  }
  for (const tend of tendidos) {
    const [rollos, bultos] = await Promise.all([
      supaFetch('tendido_rollo', 'GET', null, `?tendido_id=eq.${tend.id}&order=numero_rollo`),
      supaFetch('vw_produccion_estado', 'GET', null, `?tendido_id=eq.${tend.id}&order=numero_rollo,letra_talla`).catch(() => [])
    ]);
    const paresDe = r => (r.pares != null ? r.pares : Math.floor((r.lienzos_salidos || 0) / 2));
    const yd = rollos.reduce((s, r) => s + (Number(r.yardas_rollo) || 0), 0);
    const lz = rollos.reduce((s, r) => s + (r.lienzos_salidos || 0), 0);
    const pares = rollos.reduce((s, r) => s + paresDe(r), 0);
    html += `<div class="detalle-seccion">
      <div class="detalle-seccion-titulo">📋 Tendido · ${escH(tend.fecha)}${tend.equipo ? ' · ' + escH(tend.equipo) : ''}</div>
      <div class="row3" style="font-size:12px;margin-bottom:6px">
        <div><div class="text-muted">Rollos</div><strong>${rollos.length}</strong></div>
        <div><div class="text-muted">Pares / lienzos</div><strong>${pares} / ${lz}</strong></div>
        <div><div class="text-muted">Yardas</div><strong>${Math.round(yd)}</strong></div>
      </div>
      <div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse">
        <tr style="text-align:left;color:#666"><th>Bulto</th><th>Rollo</th><th style="text-align:right">Yd</th><th style="text-align:right">Pares</th></tr>
        ${rollos.map(r => `<tr style="border-top:1px solid #eee"><td><strong>${r.numero_rollo}</strong></td><td>${escH(r.codigo_rollo || '—')}</td><td style="text-align:right">${r.yardas_rollo != null ? Number(r.yardas_rollo) : '—'}</td><td style="text-align:right">${paresDe(r)}</td></tr>`).join('')}
      </table></div>
      ${tend.observaciones_generales ? `<p class="text-muted" style="font-size:12px;margin-top:6px">${escH(tend.observaciones_generales)}</p>` : ''}
    </div>`;

    if (bultos.length) {
      const porTalla = {};
      bultos.forEach(b => {
        const k = b.letra_talla + '|' + b.talla_key_salida;
        if (!porTalla[k]) porTalla[k] = { letra: b.letra_talla, key: b.talla_key_salida, bultos: [], piezas: 0 };
        porTalla[k].bultos.push(b);
        porTalla[k].piezas += (b.cantidad_final != null ? b.cantidad_final : b.cantidad_original) || 0;
      });
      const color = e => e === 'terminado' ? '#d4edda' : e === 'en_proceso' ? '#fff3cd' : '#eef2f7';
      const est = { pendiente: 0, en_proceso: 0, terminado: 0 };
      bultos.forEach(b => { const e = b.estado_manual || 'pendiente'; est[e] = (est[e] || 0) + 1; });
      html += `<div class="detalle-seccion">
        <div class="detalle-seccion-titulo">📦 Bultos → producción (${bultos.length})</div>
        <div class="text-muted" style="font-size:12px;margin-bottom:6px">⬜ pendiente ${est.pendiente} · 🟨 en proceso ${est.en_proceso} · 🟩 terminado ${est.terminado}</div>
        ${Object.values(porTalla).map(g => `
          <div style="margin-bottom:8px">
            <div style="font-size:12px"><strong style="color:var(--azul)">${escH(g.letra)}</strong> · ${escH(g.key)} · <strong>${g.piezas}</strong> piezas en ${g.bultos.length} bulto(s)</div>
            <div class="tallas-inline">${g.bultos.map(b => `<span class="talla-pill" style="background:${color(b.estado_manual)}" title="${b.etapas_hechas || 0}/${b.total_etapas || 0} operaciones">${escH(b.codigo_bulto)}${b.total_etapas ? ' · ' + (b.etapas_hechas || 0) + '/' + b.total_etapas : ''}</span>`).join('')}</div>
          </div>`).join('')}
        <div class="text-muted" style="font-size:11px">El avance de cada bulto (operaciones hechas) se marca en 🏭 Producción.</div>
      </div>`;
    } else {
      html += `<div class="detalle-seccion"><div class="alert alert-info">Bultos de este tendido pendientes de capturar.</div></div>`;
    }
  }
  html += `<div id="seg-corte-box"></div>`;
  cont.innerHTML = html;
  renderSeguimientoCorte(document.getElementById('seg-corte-box'), { trazo_id: trazoId, tendido_id: tendidos.length === 1 ? tendidos[0].id : null });
}

// Seguimiento del corte: lo que se va diciendo y haciendo, con fecha, quién y foto.
async function renderSeguimientoCorte(box, ref) {
  if (!box) return;
  box.innerHTML = '<div class="detalle-seccion"><div class="detalle-seccion-titulo">📝 Seguimiento</div><div class="loading">Cargando...</div></div>';
  const filtro = ref.trazo_id && ref.tendido_id ? `?or=(trazo_id.eq.${ref.trazo_id},tendido_id.eq.${ref.tendido_id})`
               : ref.trazo_id ? `?trazo_id=eq.${ref.trazo_id}` : `?tendido_id=eq.${ref.tendido_id}`;
  let notas = [];
  try { notas = await supaFetch('corte_seguimiento', 'GET', null, `${filtro}&order=fecha,creado_en`); } catch (e) { notas = []; }
  const tz = ref.trazo_id ? `'${ref.trazo_id}'` : 'null';
  const td = ref.tendido_id ? `'${ref.tendido_id}'` : 'null';
  box.innerHTML = `<div class="detalle-seccion">
    <div class="detalle-seccion-titulo">📝 Seguimiento (${notas.length})</div>
    ${notas.length ? notas.map(n => `
      <div style="border-left:3px solid var(--azul);padding:4px 0 6px 8px;margin-bottom:8px">
        <div class="text-muted" style="font-size:11px">${escH(n.fecha)}${n.quien ? ' · <strong>' + escH(n.quien) + '</strong>' : ''}</div>
        <div style="font-size:13px">${escH(n.texto)}</div>
        ${n.foto_url ? `<a href="${escH(n.foto_url)}" target="_blank" rel="noopener"><img src="${escH(n.foto_url)}" style="max-width:160px;max-height:120px;border-radius:6px;margin-top:4px" alt="evidencia"></a>` : ''}
      </div>`).join('') : '<div class="text-muted" style="font-size:12px">Todavía no hay notas.</div>'}
    <div style="margin-top:8px">
      <textarea id="seg-texto" placeholder="¿Qué pasó? (ej.: «se cambió el rollo de 85 por el de 102»)" style="width:100%;min-height:60px"></textarea>
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
        <input id="seg-quien" placeholder="Quién lo dijo (Javier, Imelda…)" style="flex:1;min-width:120px">
        <input id="seg-fecha" type="date" value="${new Date().toISOString().slice(0, 10)}" style="width:140px">
      </div>
      <input id="seg-foto" type="file" accept="image/*" style="margin-top:6px">
      <button class="btn btn-primary btn-sm btn-block" style="margin-top:6px" id="seg-btn" onclick="agregarSeguimientoCorte(${tz}, ${td})">➕ Agregar al seguimiento</button>
    </div>
  </div>`;
}

async function agregarSeguimientoCorte(trazoId, tendidoId) {
  const texto = (document.getElementById('seg-texto').value || '').trim();
  if (!texto) { if (typeof showToast === 'function') showToast('Escribí qué pasó.', 'warn'); return; }
  const btn = document.getElementById('seg-btn');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    let foto_url = null;
    const f = document.getElementById('seg-foto').files[0];
    if (f) {
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `cortes/seg/${Date.now()}.${ext}`;
      const tok = authToken() || SUPA_KEY;
      const res = await fetch(`${SUPA_URL}/storage/v1/object/trazo-fotos/${path}`, {
        method: 'POST', headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${tok}`, 'Content-Type': f.type }, body: f
      });
      if (!res.ok) throw new Error('No se pudo subir la foto');
      foto_url = `${SUPA_URL}/storage/v1/object/public/trazo-fotos/${path}`;
    }
    await supaFetch('corte_seguimiento', 'POST', {
      trazo_id: trazoId, tendido_id: tendidoId, texto,
      quien: (document.getElementById('seg-quien').value || '').trim() || null,
      fecha: document.getElementById('seg-fecha').value || null, foto_url
    });
    renderSeguimientoCorte(document.getElementById('seg-corte-box'), { trazo_id: trazoId, tendido_id: tendidoId });
  } catch (e) {
    btn.disabled = false; btn.textContent = '➕ Agregar al seguimiento';
    if (typeof showToast === 'function') showToast('Error: ' + e.message, 'error'); else alert(e.message);
  }
}

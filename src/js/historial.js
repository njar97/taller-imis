// ══════════════════════════════════════════════════════════════════════
function switchHistorial(tipo) {
  historialTipo = tipo;
  ['trazo','tendido','bulto'].forEach(t => {
    const btn = document.getElementById(`hist-btn-${t}`);
    if (btn) btn.className = (t === tipo ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm');
  });
  cargarHistorial(tipo);
}

async function cargarHistorial(tipo) {
  historialTipo = tipo;
  const container = document.getElementById('historial-content');
  container.innerHTML = '<div class="loading">Cargando...</div>';
  try {
    if (tipo === 'bulto') {
      const data = await supaFetch('vw_bulto_derivado','GET',null,'?order=fecha.desc,numero_rollo,letra_talla&limit=100');
      if (!data.length) {
        container.innerHTML = `<div class="empty"><div class="empty-icon">📭</div>Sin bultos todavía</div>`;
        return;
      }
      // Agrupar por tendido
      const porTendido = {};
      data.forEach(b => {
        if (!porTendido[b.tendido_id]) porTendido[b.tendido_id] = { codigo: b.codigo_corte, fecha: b.fecha, bultos: [] };
        porTendido[b.tendido_id].bultos.push(b);
      });
      container.innerHTML = Object.entries(porTendido).map(([tid, g]) => `
        <div class="registro-item" onclick="verDetalle('tendido','${tid}')">
          <div class="registro-codigo">${g.codigo}</div>
          <div class="registro-meta">${g.fecha} · ${g.bultos.length} bulto(s)</div>
          <div class="tallas-inline">
            ${g.bultos.slice(0,10).map(b => `<span class="talla-pill ${b.tipo_salida==='sustitucion'?'par':''}">${b.codigo_bulto}</span>`).join('')}
            ${g.bultos.length>10?`<span class="text-muted">+${g.bultos.length-10} más</span>`:''}
          </div>
        </div>
      `).join('');
      return;
    }

    const data = await supaFetch(tipo,'GET',null,'?order=creado_en.desc&limit=50');
    if (!data.length) {
      container.innerHTML = `<div class="empty"><div class="empty-icon">📭</div>Sin registros</div>`;
      return;
    }
    container.innerHTML = data.map(r => {
      let meta = '';
      if (tipo === 'trazo') meta = `${r.fecha} · ${r.capas||'?'} capas · Corte ${r.letra_corte||'—'}`;
      if (tipo === 'tendido') meta = `${r.fecha} · ${r.equipo||'sin equipo'} · Corte ${r.letra_corte||'—'}`;
      return `
        <div class="registro-item" onclick="verDetalle('${tipo}','${r.id}')">
          <div class="registro-codigo">${r.codigo_corte}</div>
          <div class="registro-meta">${meta}</div>
          <div class="registro-badges">
            <span class="rbadge rbadge-${tipo}">${tipo}</span>
            ${r.foto_url?'<span class="rbadge rbadge-foto">📷</span>':''}
            ${r.video_url?'<span class="rbadge rbadge-video">🎥</span>':''}
          </div>
        </div>
      `;
    }).join('');
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

async function verDetalle(tipo, id) {
  detalleActual = { tipo, id };
  document.getElementById('detalle-overlay').classList.add('active');
  document.getElementById('det-contenido').innerHTML = '<div class="loading">Cargando...</div>';
  // Mostrar botones editar/eliminar solo para trazo y tendido
  const btnEditar = document.getElementById('det-btn-editar');
  const btnEliminar = document.getElementById('det-btn-eliminar');
  if (btnEditar && btnEliminar) {
    const muestra = (tipo === 'trazo' || tipo === 'tendido');
    btnEditar.style.display = muestra ? 'inline-flex' : 'none';
    btnEliminar.style.display = muestra ? 'inline-flex' : 'none';
  }
  try {
    if (tipo === 'trazo') {
      const [trazo] = await supaFetch('trazo','GET',null,`?id=eq.${id}`);
      const tallas = await supaFetch('trazo_talla_marcada','GET',null,`?trazo_id=eq.${id}&order=orden`);
      document.getElementById('det-titulo').textContent = `Trazo ${trazo.codigo_corte} · Corte ${trazo.letra_corte||'—'}`;
      let html = `
        <div class="detalle-seccion">
          <div class="detalle-seccion-titulo">Datos</div>
          <div class="detalle-campo"><span>Fecha</span><span>${trazo.fecha}</span></div>
          <div class="detalle-campo"><span>Código</span><span>${trazo.codigo_corte}</span></div>
          <div class="detalle-campo"><span>Letra corte</span><span>${trazo.letra_corte||'—'}</span></div>
          <div class="detalle-campo"><span>Capas planeadas</span><span>${trazo.capas||'—'}</span></div>
          <div class="detalle-campo"><span>Yardas</span><span>${trazo.yardas_estimadas||'—'}</span></div>
        </div>
        <div class="detalle-seccion">
          <div class="detalle-seccion-titulo">Tallas marcadas</div>
          ${tallas.map(t => `
            <div class="detalle-campo">
              <span><strong style="color:var(--azul)">${t.letra_local}</strong> · ${t.talla_key_original}${t.talla_key_complemento?' ↔ '+t.talla_key_complemento:''}</span>
              <span>${t.tipo}</span>
            </div>
          `).join('')}
        </div>
      `;
      if (trazo.observaciones) html += `<div class="detalle-seccion"><div class="detalle-seccion-titulo">Observaciones</div><p style="font-size:13px">${trazo.observaciones}</p></div>`;
      if (trazo.foto_url) html += `<div class="detalle-seccion"><div class="detalle-seccion-titulo">Foto</div><img src="${trazo.foto_url}" style="width:100%;border-radius:8px"></div>`;
      document.getElementById('det-contenido').innerHTML = html;
    } else {
      // tendido
      const [tend] = await supaFetch('tendido','GET',null,`?id=eq.${id}`);
      const rollos = await supaFetch('tendido_rollo','GET',null,`?tendido_id=eq.${id}&order=numero_rollo`);
      const tallas = await supaFetch('tendido_talla_marcada','GET',null,`?tendido_id=eq.${id}&order=orden`);
      let bultos = [];
      try {
        bultos = await supaFetch('vw_bulto_derivado','GET',null,`?tendido_id=eq.${id}&order=numero_rollo,letra_talla`);
      } catch(e) {}
      document.getElementById('det-titulo').textContent = `Tendido ${tend.codigo_corte} · Corte ${tend.letra_corte||'—'}`;
      let totalCapas=0, totalPares=0;
      rollos.forEach(r => {
        const c = r.lienzos_salidos || 0;
        totalCapas += c;
        totalPares += Math.floor(c/2);
      });
      let html = `
        <div class="detalle-seccion">
          <div class="detalle-seccion-titulo">Datos</div>
          <div class="detalle-campo"><span>Fecha</span><span>${tend.fecha}</span></div>
          <div class="detalle-campo"><span>Equipo</span><span>${tend.equipo||'—'}</span></div>
          <div class="detalle-campo"><span>Total capas</span><span>${totalCapas}</span></div>
          <div class="detalle-campo"><span>Total pares</span><span>${totalPares}</span></div>
        </div>
        <div class="detalle-seccion">
          <div class="detalle-seccion-titulo">Tallas marcadas heredadas</div>
          ${tallas.map(t => `
            <div class="detalle-campo">
              <span><strong style="color:var(--azul)">${t.letra_local}</strong> · ${t.talla_key_original}${t.talla_key_complemento?' ↔ '+t.talla_key_complemento:''}</span>
              <span>${t.tipo}</span>
            </div>
          `).join('')}
        </div>
        <div class="detalle-seccion">
          <div class="detalle-seccion-titulo">Rollos</div>
          ${rollos.map(r => `
            <div class="rollo-card" style="margin-bottom:8px">
              <strong>Rollo / Bulto #${r.numero_rollo}</strong>${r.codigo_rollo?` · ${r.codigo_rollo}`:''}
              <div class="row3 mt8" style="font-size:12px">
                <div><div class="text-muted">Capas</div><strong>${r.lienzos_salidos||0}</strong></div>
                <div><div class="text-muted">Pares</div><strong>${Math.floor((r.lienzos_salidos||0)/2)}</strong></div>
                <div><div class="text-muted">Yardas</div><strong>${r.yardas_rollo||'—'}</strong></div>
              </div>
              ${r.observacion_tono?`<div class="text-muted mt8">⚠️ ${r.observacion_tono}</div>`:''}
            </div>
          `).join('')}
        </div>
      `;
      if (bultos.length) {
        const sust = bultos.filter(b => b.tipo_salida === 'sustitucion').length;
        html += `
          <div class="detalle-seccion">
            <div class="detalle-seccion-titulo">Bultos (${bultos.length}, ${sust} con sustitución)</div>
            <div class="tallas-inline">
              ${bultos.map(b => `<span class="talla-pill ${b.tipo_salida==='sustitucion'?'par':''}">${b.codigo_bulto}</span>`).join('')}
            </div>
          </div>
        `;
      } else {
        html += `<div class="detalle-seccion"><div class="alert alert-info">Bultos pendientes de capturar (usá el asistente de Bulto).</div></div>`;
      }
      if (tend.observaciones_generales) html += `<div class="detalle-seccion"><div class="detalle-seccion-titulo">Observaciones</div><p>${tend.observaciones_generales}</p></div>`;
      document.getElementById('det-contenido').innerHTML = html;
    }
  } catch(e) {
    document.getElementById('det-contenido').innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

function cerrarDetalle() {
  document.getElementById('detalle-overlay').classList.remove('active');
  detalleActual = null;
}

// ══════════════════════════════════════════════════════════════════════
// ELIMINAR REGISTRO (con aviso de cascada)
// ══════════════════════════════════════════════════════════════════════
async function eliminarRegistro() {
  if (!detalleActual) return;
  const { tipo, id } = detalleActual;

  try {
    // Contar qué se va a borrar en cascada
    let aviso = '';
    if (tipo === 'trazo') {
      const tallas = await supaFetch('trazo_talla_marcada','GET',null,`?trazo_id=eq.${id}&select=id`);
      const tendidos = await supaFetch('tendido','GET',null,`?trazo_id=eq.${id}&select=id`);
      let nRollos = 0, nSalidas = 0, nTendTallas = 0;
      for (const t of tendidos) {
        const rollos = await supaFetch('tendido_rollo','GET',null,`?tendido_id=eq.${t.id}&select=id`);
        nRollos += rollos.length;
        const tms = await supaFetch('tendido_talla_marcada','GET',null,`?tendido_id=eq.${t.id}&select=id`);
        nTendTallas += tms.length;
        for (const r of rollos) {
          const sal = await supaFetch('tendido_rollo_salida','GET',null,`?tendido_rollo_id=eq.${r.id}&select=id`);
          nSalidas += sal.length;
        }
      }
      aviso = `⚠️ ELIMINAR TRAZO\n\nSe van a borrar en cascada:\n\n`
            + `• 1 trazo\n`
            + `• ${tallas.length} talla(s) marcada(s)\n`
            + `• ${tendidos.length} tendido(s) asociado(s)\n`
            + `• ${nRollos} rollo(s)\n`
            + `• ${nTendTallas} talla(s) heredada(s) en tendidos\n`
            + `• ${nSalidas} bulto(s) capturado(s)\n\n`
            + `Esta acción NO se puede deshacer. ¿Continuar?`;
    } else if (tipo === 'tendido') {
      const rollos = await supaFetch('tendido_rollo','GET',null,`?tendido_id=eq.${id}&select=id`);
      const tms = await supaFetch('tendido_talla_marcada','GET',null,`?tendido_id=eq.${id}&select=id`);
      let nSalidas = 0;
      for (const r of rollos) {
        const sal = await supaFetch('tendido_rollo_salida','GET',null,`?tendido_rollo_id=eq.${r.id}&select=id`);
        nSalidas += sal.length;
      }
      aviso = `⚠️ ELIMINAR TENDIDO\n\nSe van a borrar en cascada:\n\n`
            + `• 1 tendido\n`
            + `• ${rollos.length} rollo(s)\n`
            + `• ${tms.length} talla(s) heredada(s)\n`
            + `• ${nSalidas} bulto(s) capturado(s)\n\n`
            + `El trazo NO se borra.\n\nEsta acción NO se puede deshacer. ¿Continuar?`;
    }

    if (!confirm(aviso)) return;

    // Ejecutar DELETE (cascade se encarga del resto)
    await supaFetch(tipo, 'DELETE', null, `?id=eq.${id}`);

    alert('✅ Registro eliminado.');
    cerrarDetalle();
    cargarHistorial(historialTipo);
  } catch(e) {
    alert('Error al eliminar: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════
// EDITAR REGISTRO
// ══════════════════════════════════════════════════════════════════════
async function editarRegistro() {
  if (!detalleActual) return;
  const { tipo, id } = detalleActual;
  if (tipo === 'trazo') await editarTrazo(id);
  else if (tipo === 'tendido') await editarTendido(id);
}

// ── EDITAR TRAZO ─────────────────────────────────────────────────────
async function editarTrazo(id) {
  try {
    const [trazo] = await supaFetch('trazo','GET',null,`?id=eq.${id}`);
    const tallas = await supaFetch('trazo_talla_marcada','GET',null,`?trazo_id=eq.${id}&order=orden`);

    // Abrir la pestaña Trazo con datos precargados
    cerrarDetalle();
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-trazo').classList.add('active');
    window.scrollTo(0, 0);

    // Cargar catálogo primero
    await cargarCatalogoCustom();

    // Setear campos básicos
    document.getElementById('t-fecha').value = trazo.fecha || '';
    document.getElementById('t-letra-corte').value = trazo.letra_corte || '';
    document.getElementById('t-capas').value = trazo.capas || '';
    document.getElementById('t-yardas').value = trazo.yardas_estimadas || '';
    document.getElementById('t-observaciones').value = trazo.observaciones || '';
    document.getElementById('t-video-url').value = trazo.video_url || '';

    // Colores
    coloresSeleccionados = new Set(trazo.colores_tela || []);
    renderColorChips();

    // Limpiar tallas y recrear desde las existentes
    document.getElementById('t-tallas-container').innerHTML = '';
    tallasCount = 0;
    for (const t of tallas) {
      agregarTallaTrazo();
      const fid = tallasCount;
      const row = document.getElementById(`ttrazo-${fid}`);
      if (!row) continue;
      // Letra
      row.querySelector('[data-ttrazo-letra]').value = t.letra_local;
      // Prenda (disparar onchange para habilitar KEY)
      const selPrenda = row.querySelector('[data-ttrazo-prenda]');
      if (selPrenda) {
        selPrenda.value = t.cod_prenda || '';
        onPrendaTallaChange(fid);
      }
      // KEY
      const inpKey = row.querySelector('[data-ttrazo-key]');
      if (inpKey) inpKey.value = t.talla_key_original;
      // Tipo
      setTipoTalla(fid, t.tipo || 'completa');
      // Complemento
      if (t.tipo === 'par' && t.talla_key_complemento) {
        row.dataset.keyComplemento = t.talla_key_complemento;
        const info = row.querySelector('.complemento-info');
        if (info) info.textContent = `↔ complementa con ${t.talla_key_complemento}`;
        actualizarSugerenciasComplemento(fid);
        const sel = row.querySelector('[data-ttrazo-complemento]');
        if (sel) {
          // Si no está en las opciones, agregarla
          if (!Array.from(sel.options).some(o => o.value === `KEY::${t.talla_key_complemento}`)) {
            const opt = document.createElement('option');
            opt.value = `KEY::${t.talla_key_complemento}`;
            opt.textContent = t.talla_key_complemento;
            sel.appendChild(opt);
          }
          sel.value = `KEY::${t.talla_key_complemento}`;
        }
      }
    }

    // Cambiar el botón guardar para que sepa que es edición
    const btn = document.getElementById('btn-guardar-trazo');
    btn.textContent = '💾 Guardar cambios';
    btn.dataset.editandoId = id;
    // Listener temporal: usamos onclick distinto
    btn.onclick = () => guardarEdicionTrazo(id);

    mostrarAlerta('trazo','success','Editando trazo. Hacé cambios y guardá.');
  } catch(e) {
    alert('Error al cargar trazo: ' + e.message);
  }
}

async function guardarEdicionTrazo(id) {
  const fecha = document.getElementById('t-fecha').value;
  const letraCorte = (document.getElementById('t-letra-corte').value||'').toUpperCase().trim();
  if (!fecha) { mostrarAlerta('trazo','error','Fecha es obligatoria.'); return; }
  if (!letraCorte) { mostrarAlerta('trazo','error','Letra del corte es obligatoria.'); return; }
  if (coloresSeleccionados.size === 0) { mostrarAlerta('trazo','error','Elegí al menos un color.'); return; }

  const tallas = recolectarTallasTrazo();
  if (tallas.length === 0) { mostrarAlerta('trazo','error','Agregá al menos 1 talla.'); return; }
  const letras = tallas.map(t => t.letra);
  if (new Set(letras).size !== letras.length) { mostrarAlerta('trazo','error','Letras de tallas deben ser únicas.'); return; }

  const btn = document.getElementById('btn-guardar-trazo');
  btn.textContent = '⏳ Guardando...';
  btn.disabled = true;

  try {
    // Actualizar el trazo
    await supaUpdate('trazo', id, {
      fecha,
      codigo_corte: letraCorte,
      letra_corte: letraCorte,
      colores_tela: [...coloresSeleccionados],
      capas: parseInt(document.getElementById('t-capas').value) || null,
      yardas_estimadas: parseFloat(document.getElementById('t-yardas').value) || null,
      tallas_tendido: tallas.map(t=>t.key).join(', '),
      observaciones: document.getElementById('t-observaciones').value || null,
      video_url: document.getElementById('t-video-url').value.trim() || null,
    });

    // Estrategia simple para tallas: borrar todas las existentes y reinsertar
    await supaFetch('trazo_talla_marcada','DELETE',null,`?trazo_id=eq.${id}`);
    for (const t of tallas) {
      await supaFetch('trazo_talla_marcada','POST',{
        trazo_id: id,
        letra_local: t.letra,
        talla_key_original: t.key,
        talla_key_complemento: (t.tipo === 'par' && t.complementoKey) ? t.complementoKey : null,
        tipo: t.tipo,
        multiplicidad: 1,
        cod_prenda: t.prenda,
        orden: t.orden,
      });
    }

    mostrarAlerta('trazo','success','✅ Cambios guardados.');
    // Restaurar botón y volver a estado normal
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '💾 Guardar trazo';
      btn.onclick = () => guardarTrazo();
      delete btn.dataset.editandoId;
      initTrazo();
      volverNuevo();
    }, 1500);
  } catch(e) {
    mostrarAlerta('trazo','error','Error: ' + e.message);
    btn.textContent = '💾 Guardar cambios';
    btn.disabled = false;
  }
}

// ── EDITAR TENDIDO ───────────────────────────────────────────────────
async function editarTendido(id) {
  try {
    const [tend] = await supaFetch('tendido','GET',null,`?id=eq.${id}`);
    const rollos = await supaFetch('tendido_rollo','GET',null,`?tendido_id=eq.${id}&order=numero_rollo`);
    const tallas = await supaFetch('tendido_talla_marcada','GET',null,`?tendido_id=eq.${id}&order=orden`);

    // Necesitamos el trazo asociado para cargar en trazoSeleccionado
    let trazoData = null;
    if (tend.trazo_id) {
      const [tz] = await supaFetch('trazo','GET',null,`?id=eq.${tend.trazo_id}`);
      trazoData = tz;
    }

    cerrarDetalle();
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-tendido').classList.add('active');
    window.scrollTo(0, 0);

    // Setear trazoSeleccionado (usado por onElegirTrazo)
    trazoSeleccionado = { trazo: trazoData || { codigo_corte: tend.codigo_corte, letra_corte: tend.letra_corte, id: tend.trazo_id }, tallas };

    // Simular UI del paso 1 (elegir trazo) ya resuelto
    const sel = document.getElementById('td-trazo-select');
    if (trazoData) {
      sel.innerHTML = `<option value="${trazoData.id}" selected>${trazoData.codigo_corte} · ${trazoData.fecha} (EDITANDO)</option>`;
      sel.value = trazoData.id;
    } else {
      sel.innerHTML = `<option value="" selected>${tend.codigo_corte} · ${tend.fecha} (EDITANDO - sin trazo asociado)</option>`;
    }
    sel.disabled = true;

    // Mostrar info del trazo
    document.getElementById('td-trazo-info').innerHTML = `
      <div class="trazo-card">
        <div class="trazo-code">${tend.codigo_corte} · Corte ${tend.letra_corte || '?'}</div>
        <div class="trazo-meta">${tallas.length} talla(s) heredada(s)</div>
        <div class="tallas-inline">
          ${tallas.map(t => `<span class="talla-pill ${t.tipo==='par'?'par':''}">${t.letra_local}: ${t.talla_key_original}${t.talla_key_complemento?' ↔ '+t.talla_key_complemento:''}${t.tipo==='par'?' (par)':''}</span>`).join('')}
        </div>
      </div>
    `;

    // Mostrar paso 2
    document.getElementById('td-paso-2').style.display = 'block';

    // Cargar datos del tendido
    document.getElementById('td-fecha').value = tend.fecha || '';
    document.getElementById('td-equipo').value = tend.equipo || '';
    document.getElementById('td-observaciones').value = tend.observaciones_generales || '';
    document.getElementById('td-completo').value = tend.completo_en_un_dia ? 'true' : 'false';
    document.getElementById('td-cont-field').style.display = tend.completo_en_un_dia ? 'none' : 'block';
    if (tend.fecha_continuacion) document.getElementById('td-continuacion').value = tend.fecha_continuacion;

    // Limpiar y recargar rollos (manteniendo numero_rollo)
    document.getElementById('td-rollos-container').innerHTML = '';
    rollosCountTd = 0;
    for (const r of rollos) {
      agregarRolloTendido();
      const rid = rollosCountTd;
      const rowEl = document.getElementById(`trollo-${rid}`);
      if (!rowEl) continue;
      // Guardar el número de rollo original para no invertir numeración al guardar
      rowEl.dataset.numeroOriginal = r.numero_rollo;
      rowEl.dataset.rolloIdRemoto = r.id;
      // Mostrar número real en lugar de "orden"
      const rnumEl = rowEl.querySelector('.rollo-num');
      if (rnumEl) rnumEl.innerHTML = `Rollo / Bulto #${r.numero_rollo} <span class="text-muted" style="font-weight:400">(EDITANDO)</span>`;
      // Poblar campos
      rowEl.querySelectorAll('[data-trollo]').forEach(inp => {
        const f = inp.dataset.tfield;
        if (r[f] !== null && r[f] !== undefined) inp.value = r[f];
      });
      onCapasChange(rid);
    }

    recalcTotalesTendido();

    // Cambiar botón
    const btn = document.getElementById('btn-guardar-tendido');
    btn.textContent = '💾 Guardar cambios';
    btn.onclick = () => guardarEdicionTendido(id);

    mostrarAlerta('tendido','success','Editando tendido. Hacé cambios y guardá.');
  } catch(e) {
    alert('Error al cargar tendido: ' + e.message);
  }
}

async function guardarEdicionTendido(id) {
  const fecha = document.getElementById('td-fecha').value;
  if (!fecha) { mostrarAlerta('tendido','error','Fecha obligatoria.'); return; }
  const rollos = document.querySelectorAll('.rollo-card');
  if (!rollos.length) { mostrarAlerta('tendido','error','Agregá al menos 1 rollo.'); return; }

  const btn = document.getElementById('btn-guardar-tendido');
  btn.textContent = '⏳ Guardando...';
  btn.disabled = true;

  try {
    const completo = document.getElementById('td-completo').value === 'true';
    await supaUpdate('tendido', id, {
      fecha,
      equipo: document.getElementById('td-equipo').value || null,
      completo_en_un_dia: completo,
      fecha_continuacion: (!completo && document.getElementById('td-continuacion').value) ? document.getElementById('td-continuacion').value : null,
      observaciones_generales: document.getElementById('td-observaciones').value || null,
    });

    // Actualizar rollos existentes, crear los nuevos
    // (En edición no invertimos numeración; respetamos la existente si hay, y asignamos nuevos para los agregados)
    const rolloElems = Array.from(rollos);
    let nextNumero = Math.max(0, ...rolloElems.map(el => parseInt(el.dataset.numeroOriginal || 0))) + 1;

    for (const el of rolloElems) {
      const remoteId = el.dataset.rolloIdRemoto;
      const numero = el.dataset.numeroOriginal ? parseInt(el.dataset.numeroOriginal) : nextNumero++;
      const campos = { tendido_id: id, numero_rollo: numero };
      el.querySelectorAll('[data-trollo]').forEach(inp => {
        const f = inp.dataset.tfield;
        const v = inp.value;
        campos[f] = ['yardas_rollo','lienzos_salidos','yardas_sobrantes'].includes(f) ? (v ? parseFloat(v) : null) : (v || null);
      });
      if (remoteId) {
        await supaUpdate('tendido_rollo', remoteId, campos);
      } else {
        await supaFetch('tendido_rollo','POST', campos);
      }
    }

    mostrarAlerta('tendido','success','✅ Cambios guardados.');
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '💾 Guardar tendido (invierte numeración)';
      btn.onclick = () => guardarTendido();
      const sel = document.getElementById('td-trazo-select');
      if (sel) sel.disabled = false;
      volverNuevo();
    }, 1500);
  } catch(e) {
    mostrarAlerta('tendido','error','Error: ' + e.message);
    btn.textContent = '💾 Guardar cambios';
    btn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════════════
// PRODUCCIÓN (Fase 1)

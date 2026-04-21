// ══════════════════════════════════════════════════════════════════════
let produccionFiltro = 'todos';
let produccionData = [];
let cortesExpandidos = new Set();

async function initProduccion() {
  // Mostrar u ocultar sub-pestañas según Fase 2 activa
  const navSub = document.querySelector('#view-produccion > .card:first-of-type');
  if (navSub) {
    // El primer card es el subnav — ocultarlo si Fase 2 no está activa
    if (!FASE2_ACTIVA) {
      navSub.style.display = 'none';
    } else {
      navSub.style.display = 'block';
    }
  }
  // Si Fase 2 OFF, forzar dashboard
  if (!FASE2_ACTIVA) {
    document.getElementById('prod-sub-dashboard-view').style.display = 'block';
    document.getElementById('prod-sub-captura-view').style.display = 'none';
    document.getElementById('prod-sub-operarias-view').style.display = 'none';
    await cargarProduccion();
    return;
  }
  switchSubProd('dashboard');
}

async function cargarProduccion() {
  try {
    document.getElementById('prod-resumen-hoy').textContent = 'Cargando...';
    document.getElementById('prod-cortes-container').innerHTML = '';

    produccionData = await supaFetch('vw_produccion_estado','GET',null,'?limit=2000');

    // Auto-crear produccion_bulto para salidas sin seguimiento aún
    const sinRegistro = produccionData.filter(b => !b.produccion_bulto_id);
    for (const b of sinRegistro) {
      try {
        const [nuevo] = await supaFetch('produccion_bulto','POST',{
          tendido_rollo_salida_id: b.salida_id,
          estado: 'pendiente',
        });
        b.produccion_bulto_id = nuevo.id;
        b.estado = 'pendiente';
      } catch(e) {
        console.warn('No se pudo crear produccion_bulto:', e.message);
      }
    }

    // Cargar progreso Fase 2 (solo si está activa)
    if (FASE2_ACTIVA) {
      await cargarProgreso();
    } else {
      progresoCache = {};
    }

    renderProduccion();
  } catch(e) {
    document.getElementById('prod-resumen-hoy').textContent = 'Error: ' + e.message;
  }
}

function renderProduccion() {
  const hoy = new Date().toISOString().split('T')[0];
  // Función local: calcular estado efectivo
  function estadoEf(b) {
    if (FASE2_ACTIVA && b.total_etapas > 0) {
      if (b.etapas_hechas === 0) return 'pendiente';
      if (b.etapas_hechas >= b.total_etapas) return 'terminado';
      return 'en_proceso';
    }
    return b.estado_manual || b.estado || 'pendiente';
  }

  const terminadosHoy = produccionData.filter(b => b.fecha_terminado === hoy && estadoEf(b) === 'terminado');
  const piezasHoy = terminadosHoy.reduce((s,b) => s + (b.cantidad_final || b.cantidad_original || 0), 0);
  const totalBultos = produccionData.length;
  const totalTerminados = produccionData.filter(b => estadoEf(b) === 'terminado').length;
  const totalPiezasOrig = produccionData.reduce((s,b) => s + (b.cantidad_original || 0), 0);
  const totalPiezasTerm = produccionData.filter(b => estadoEf(b) === 'terminado').reduce((s,b) => s + (b.cantidad_final || b.cantidad_original || 0), 0);
  const pctGeneral = totalPiezasOrig > 0 ? Math.round(100 * totalPiezasTerm / totalPiezasOrig) : 0;

  document.getElementById('prod-resumen-hoy').innerHTML = `
    <div><strong>Hoy:</strong> ${terminadosHoy.length} bulto(s) · ${piezasHoy} pieza(s)</div>
    <div style="margin-top:4px"><strong>General:</strong> ${totalPiezasTerm}/${totalPiezasOrig} piezas (${pctGeneral}%) · ${totalTerminados}/${totalBultos} bultos</div>
  `;

  // Actualizar opciones de filtros (corte + prenda)
  actualizarFiltrosProd();

  // Aplicar filtros
  const fCorte = document.getElementById('prod-filtro-corte')?.value || '';
  const fPrenda = document.getElementById('prod-filtro-prenda')?.value || '';

  let filtrados = produccionData;
  if (produccionFiltro === 'pendientes') {
    filtrados = filtrados.filter(b => estadoEf(b) !== 'terminado');
  } else if (produccionFiltro === 'terminados') {
    filtrados = filtrados.filter(b => estadoEf(b) === 'terminado');
  }
  if (fCorte) filtrados = filtrados.filter(b => (b.codigo_corte + '||' + (b.letra_corte||'')) === fCorte);
  if (fPrenda) filtrados = filtrados.filter(b => b.cod_prenda === fPrenda);

  // Estilizar botones de estado
  ['todos','pendientes','terminados'].forEach(f => {
    const btn = document.getElementById(`prod-filtro-${f}`);
    if (btn) btn.className = (f === produccionFiltro) ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
  });

  // Agrupar por KEY (talla_key_salida = la KEY real del bulto, no la original del trazo)
  const porKey = {};
  filtrados.forEach(b => {
    const k = b.talla_key_salida;
    if (!porKey[k]) {
      const p = parsearKey(k) || { cod: null, talla: null, largo: null, detalle: null };
      porKey[k] = {
        key: k,
        cod_prenda: b.cod_prenda || p.cod,
        nombre_prenda: (b.cod_prenda && CATALOGO[b.cod_prenda]?.nombre) || (p.cod && CATALOGO[p.cod]?.nombre) || '?',
        talla: p.talla,
        largo: p.largo,
        detalle: p.detalle,
        bultos: [],
      };
    }
    porKey[k].bultos.push(b);
  });

  // Orden: prenda → talla asc → largo asc → detalle
  const ordenPrenda = { 'C':1, 'B':2, 'CC':3, 'F':4, 'FB':5, 'FCE':6, 'P':7, 'PB':8, 'S':9 };
  const keys = Object.keys(porKey).sort((a, b) => {
    const A = porKey[a], B = porKey[b];
    const oa = ordenPrenda[A.cod_prenda] || 99;
    const ob = ordenPrenda[B.cod_prenda] || 99;
    if (oa !== ob) return oa - ob;
    if ((A.talla||0) !== (B.talla||0)) return (A.talla||0) - (B.talla||0);
    if ((A.largo||0) !== (B.largo||0)) return (A.largo||0) - (B.largo||0);
    return (A.detalle||'').localeCompare(B.detalle||'');
  });

  const cont = document.getElementById('prod-cortes-container');
  if (keys.length === 0) {
    cont.innerHTML = '<div class="alert alert-info">No hay bultos con ese filtro.</div>';
    return;
  }

  cont.innerHTML = keys.map(k => {
    const grupo = porKey[k];
    const total = grupo.bultos.length;
    const terminados = grupo.bultos.filter(b => estadoEf(b) === 'terminado').length;
    const piezasOrig = grupo.bultos.reduce((s,b) => s + (b.cantidad_original || 0), 0);
    const piezasTerm = grupo.bultos.filter(b => estadoEf(b) === 'terminado').reduce((s,b) => s + (b.cantidad_final || b.cantidad_original || 0), 0);
    const pct = piezasOrig > 0 ? Math.round(100 * piezasTerm / piezasOrig) : 0;
    const expandido = cortesExpandidos.has(k);

    // Línea descriptiva de la talla
    const desc = [];
    if (grupo.talla !== null && grupo.talla !== undefined) desc.push(`talla ${grupo.talla}`);
    if (grupo.largo !== null && grupo.largo !== undefined) desc.push(`largo ${grupo.largo}`);
    if (grupo.detalle) desc.push(grupo.detalle);

    return `
      <div class="prod-corte-card ${expandido?'expandido':''}">
        <div class="prod-corte-header" onclick="toggleCorte('${k.replace(/'/g,"\\'")}')">
          <div style="flex:1">
            <div class="prod-corte-titulo">${grupo.key}</div>
            <div class="prod-corte-prenda">${grupo.nombre_prenda}${desc.length?' · '+desc.join(' · '):''}</div>
            <div class="prod-corte-meta">
              <strong>${piezasTerm}/${piezasOrig} piezas (${pct}%)</strong> · ${terminados}/${total} bultos
            </div>
            <div class="prod-progress"><div class="prod-progress-bar" style="width:${pct}%"></div></div>
          </div>
          <div style="font-size:20px;margin-left:8px">${expandido?'▼':'▶'}</div>
        </div>
        <div class="prod-bultos-list">
          ${grupo.bultos.map(b => renderProdBulto(b)).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function actualizarFiltrosProd() {
  // Cortes únicos
  const cortes = new Map();
  produccionData.forEach(b => {
    const k = b.codigo_corte + '||' + (b.letra_corte||'');
    const label = `Corte ${b.letra_corte||'?'} · ${b.codigo_corte}`;
    cortes.set(k, label);
  });
  const selCorte = document.getElementById('prod-filtro-corte');
  if (selCorte) {
    const prev = selCorte.value;
    let html = '<option value="">Todos los cortes</option>';
    [...cortes.entries()].sort((a,b) => a[1].localeCompare(b[1])).forEach(([k, l]) => {
      html += `<option value="${k}">${l}</option>`;
    });
    selCorte.innerHTML = html;
    if (prev && [...cortes.keys()].includes(prev)) selCorte.value = prev;
  }

  // Prendas únicas
  const prendas = new Set();
  produccionData.forEach(b => { if (b.cod_prenda) prendas.add(b.cod_prenda); });
  const selPrenda = document.getElementById('prod-filtro-prenda');
  if (selPrenda) {
    const prev = selPrenda.value;
    let html = '<option value="">Todas las prendas</option>';
    [...prendas].sort().forEach(p => {
      const nombre = CATALOGO[p]?.nombre || p;
      html += `<option value="${p}">${nombre}</option>`;
    });
    selPrenda.innerHTML = html;
    if (prev && prendas.has(prev)) selPrenda.value = prev;
  }
}

function renderProdBulto(b) {
  // Estado efectivo: si Fase 2 ON y hay etapas, se deriva
  let estadoEfectivo = b.estado_manual || b.estado || 'pendiente';
  if (FASE2_ACTIVA && b.total_etapas > 0) {
    if (b.etapas_hechas === 0) estadoEfectivo = 'pendiente';
    else if (b.etapas_hechas >= b.total_etapas) estadoEfectivo = 'terminado';
    else estadoEfectivo = 'en_proceso';
  }

  const clase = estadoEfectivo === 'terminado' ? 'terminado' : (estadoEfectivo === 'en_proceso' ? 'proceso' : '');
  const cantActual = b.cantidad_original;
  const cantFinal = b.cantidad_final && b.cantidad_final !== cantActual
    ? `${b.cantidad_final}/${cantActual} pz`
    : `${cantActual} pz`;

  // Progreso
  let progresoHtml = '';
  if (FASE2_ACTIVA && b.total_etapas > 0) {
    const pct = Math.round(100 * b.etapas_hechas / b.total_etapas);
    progresoHtml = `
      <div style="margin-top:4px;font-size:11px;color:#555">
        Etapas: ${b.etapas_hechas}/${b.total_etapas}
        <div style="width:100%;height:4px;background:#E0E0E0;border-radius:2px;overflow:hidden;margin-top:2px">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#4CAF50,#8BC34A)"></div>
        </div>
      </div>
    `;
  }

  // Badges de trazabilidad
  let badges = '';
  if (b.sufijo_division) {
    badges += `<span class="prod-badge prod-badge-div">✂️ derivado ${b.sufijo_division}</span>`;
  }

  // Acciones
  let acciones = '';
  if (estadoEfectivo === 'terminado') {
    acciones = `<button class="prod-btn-accion prod-btn-revertir" onclick="revertirBulto('${b.produccion_bulto_id}')">↶ Revertir</button>`;
  } else {
    // Con Fase 2 activa, el "terminar" es atajo con confirmación
    const onclickTerm = FASE2_ACTIVA
      ? `terminarBultoAtajo('${b.produccion_bulto_id}', ${cantActual})`
      : `terminarBulto('${b.produccion_bulto_id}', ${cantActual})`;
    acciones = `<button class="prod-btn-accion prod-btn-terminar" onclick="${onclickTerm}">✓ Terminar</button>`;
  }
  if (estadoEfectivo !== 'terminado' && cantActual > 1) {
    acciones += `<button class="prod-btn-accion prod-btn-dividir" onclick="abrirDividir('${b.produccion_bulto_id}', ${cantActual}, '${b.codigo_bulto}')">✂️ Dividir</button>`;
  }
  if (estadoEfectivo !== 'terminado') {
    acciones += `<button class="prod-btn-accion prod-btn-unir" onclick="abrirUnir('${b.produccion_bulto_id}', '${b.talla_key_salida}', '${b.codigo_bulto}')">🔗 Unir</button>`;
  }
  // Botón expandir etapas (solo si Fase 2 activa)
  if (FASE2_ACTIVA && b.total_etapas > 0) {
    acciones += `<button class="prod-btn-accion" onclick="toggleEtapasBulto('${b.produccion_bulto_id}')">▾ Etapas</button>`;
  }

  const fechaInfo = estadoEfectivo === 'terminado' && b.fecha_terminado ? ` · ${b.fecha_terminado}` : '';
  const obsInfo = b.observaciones ? `<div style="font-size:11px;color:#856404;margin-top:4px">⚠️ ${b.observaciones}</div>` : '';

  return `
    <div class="prod-bulto-row ${clase}" id="bulto-row-${b.produccion_bulto_id}">
      <div style="flex:1;min-width:0">
        <div>
          <span class="prod-bulto-codigo">${b.codigo_bulto}</span>
          <span class="prod-bulto-cant">${cantFinal}</span>
        </div>
        <div class="prod-bulto-corte">Corte ${b.letra_corte||'?'} · ${b.codigo_corte}${fechaInfo}</div>
        ${progresoHtml}
        ${badges?`<div class="prod-bulto-badges">${badges}</div>`:''}
        ${obsInfo}
        <div id="etapas-${b.produccion_bulto_id}" style="display:none;margin-top:8px"></div>
      </div>
      <div class="prod-bulto-acciones">${acciones}</div>
    </div>
  `;
}

function toggleCorte(k) {
  if (cortesExpandidos.has(k)) cortesExpandidos.delete(k);
  else cortesExpandidos.add(k);
  renderProduccion();
}

function cambiarFiltroProduccion(filtro) {
  produccionFiltro = filtro;
  renderProduccion();
}

async function terminarBulto(produccionBultoId, cantidadOriginal) {
  const cantStr = prompt(
    `¿Cuántas piezas terminaron?\n\nCantidad original: ${cantidadOriginal}\n\n(Enter para usar el original, o escribí otra cantidad si hubo defectos)`,
    cantidadOriginal
  );
  if (cantStr === null) return;
  const cantidadFinal = parseInt(cantStr) || cantidadOriginal;

  let observaciones = null;
  if (cantidadFinal !== cantidadOriginal) {
    observaciones = prompt(`Hubo diferencia (${cantidadFinal} vs ${cantidadOriginal}). ¿Qué pasó? (opcional)`) || null;
  }

  try {
    await supaUpdate('produccion_bulto', produccionBultoId, {
      estado: 'terminado',
      fecha_terminado: new Date().toISOString().split('T')[0],
      cantidad_final: cantidadFinal,
      observaciones,
      actualizado_en: new Date().toISOString(),
    });
    const b = produccionData.find(x => x.produccion_bulto_id === produccionBultoId);
    if (b) {
      b.estado = 'terminado';
      b.fecha_terminado = new Date().toISOString().split('T')[0];
      b.cantidad_final = cantidadFinal;
      b.observaciones = observaciones;
    }
    renderProduccion();
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

async function revertirBulto(produccionBultoId) {
  if (!confirm('¿Revertir a pendiente? Se borrará la fecha de terminación.')) return;
  try {
    await supaUpdate('produccion_bulto', produccionBultoId, {
      estado: 'pendiente',
      fecha_terminado: null,
      cantidad_final: null,
      actualizado_en: new Date().toISOString(),
    });
    await cargarProduccion();
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

// Atajo: marcar terminado con confirmación (cuando Fase 2 está activa)
async function terminarBultoAtajo(produccionBultoId, cantidadOriginal) {
  if (!confirm('¿Marcar este bulto como terminado sin registrar etapas?\n\nSe perderá el detalle de operaciones. Usalo solo cuando no puedas capturar el detalle.')) return;
  await terminarBulto(produccionBultoId, cantidadOriginal);
}

// Expandir/contraer las etapas de un bulto en el dashboard
async function toggleEtapasBulto(produccionBultoId) {
  const cont = document.getElementById(`etapas-${produccionBultoId}`);
  if (!cont) return;
  if (cont.style.display === 'block') {
    cont.style.display = 'none';
    return;
  }
  // Cargar etapas
  cont.style.display = 'block';
  cont.innerHTML = '<div class="text-muted" style="font-size:11px">Cargando etapas...</div>';
  try {
    const etapas = await supaFetch('vw_bulto_etapas','GET',null,
      `?produccion_bulto_id=eq.${produccionBultoId}&order=orden&limit=20`);
    renderEtapasBulto(produccionBultoId, etapas);
  } catch(e) {
    cont.innerHTML = `<div class="text-muted" style="color:#B00">Error: ${e.message}</div>`;
  }
}

function renderEtapasBulto(bultoId, etapas) {
  const cont = document.getElementById(`etapas-${bultoId}`);
  if (!cont) return;
  if (!etapas || etapas.length === 0) {
    cont.innerHTML = '<div class="text-muted" style="font-size:11px">Este bulto no tiene operaciones configuradas.</div>';
    return;
  }
  cont.innerHTML = etapas.map(e => {
    const hecha = !!e.registro_id;
    const info = hecha
      ? `<span style="color:#155724;font-size:11px">✓ ${e.operaria_nombre||'?'} · ${e.fecha_hecha||''} · ${e.cantidad_hecha||'?'}pz</span>`
      : `<span style="color:#999;font-size:11px">pendiente</span>`;
    const btn = hecha
      ? `<button class="btn-mini btn-mini-danger" onclick="desmarcarEtapa('${e.registro_id}','${bultoId}')">↶ Deshacer</button>`
      : `<button class="btn-mini btn-mini-success" onclick="marcarEtapaRapida('${bultoId}','${e.operacion_id}')">✓ Marcar</button>`;
    const reprocesos = e.n_reprocesos > 0 ? ` <span style="color:#B58900;font-size:10px">(${e.n_reprocesos} reproc.)</span>` : '';
    return `
      <div style="padding:6px;border:1px solid #E8E8E8;border-radius:4px;margin-bottom:3px;display:flex;justify-content:space-between;align-items:center;background:${hecha?'#F1F8F1':'#FAFAFA'}">
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600">${e.orden}. ${e.operacion_nombre}${reprocesos}</div>
          <div>${info}</div>
        </div>
        ${btn}
      </div>
    `;
  }).join('');
}

// Marcar etapa hecha rápidamente desde el dashboard
async function marcarEtapaRapida(bultoId, operacionId) {
  // Necesitamos operaria y cantidad
  if (operariasCache.length === 0) {
    operariasCache = await supaFetch('operaria','GET',null,'?activo=eq.true&order=nombre&limit=100');
  }
  const activas = operariasCache.filter(o => o.activo);
  if (activas.length === 0) { alert('No hay operarias activas. Andá a Operarias y agregá.'); return; }

  // Preguntar operaria
  const nombres = activas.map((o,i) => `${i+1}. ${o.nombre}`).join('\n');
  const idxStr = prompt(`¿Quién hizo esta etapa?\n\n${nombres}\n\nEscribí el número:`, '1');
  if (idxStr === null) return;
  const idx = parseInt(idxStr) - 1;
  if (idx < 0 || idx >= activas.length) { alert('Número inválido'); return; }
  const operaria = activas[idx];

  // Buscar bulto para obtener cantidad
  const bulto = produccionData.find(b => b.produccion_bulto_id === bultoId);
  const cantDefault = bulto?.cantidad_original || 0;
  const cantStr = prompt(`Cantidad de piezas (Enter = ${cantDefault}):`, cantDefault);
  if (cantStr === null) return;
  const cantidad = parseInt(cantStr) || cantDefault;

  try {
    await supaFetch('produccion_registro_operacion','POST',{
      produccion_bulto_id: bultoId,
      operacion_id: operacionId,
      operaria_id: operaria.id,
      fecha: new Date().toISOString().split('T')[0],
      cantidad_realizada: cantidad,
      tipo: 'normal',
    });
    // Refrescar etapas y dashboard
    await toggleEtapasBulto(bultoId); // cerrar
    await cargarProduccion();
    await toggleEtapasBulto(bultoId); // reabrir con datos frescos
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

async function desmarcarEtapa(registroId, bultoId) {
  if (!confirm('¿Deshacer esta etapa? Se elimina el registro de captura.')) return;
  try {
    await supaFetch('produccion_registro_operacion','DELETE',null,`?id=eq.${registroId}`);
    await toggleEtapasBulto(bultoId); // cerrar
    await cargarProduccion();
    await toggleEtapasBulto(bultoId); // reabrir
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

// ══ DIVIDIR ══════════════════════════════════════════════════════════
async function abrirDividir(produccionBultoId, cantidadActual, codigoBulto) {
  const cantStr = prompt(
    `Dividir bulto ${codigoBulto} (${cantidadActual} piezas)\n\n¿Cuántas piezas separar en un bulto derivado?\n(El resto queda en el bulto original con la misma KEY)`,
    Math.floor(cantidadActual / 2)
  );
  if (cantStr === null) return;
  const piezasAPartir = parseInt(cantStr);
  if (!piezasAPartir || piezasAPartir <= 0 || piezasAPartir >= cantidadActual) {
    alert(`Cantidad inválida. Debe ser entre 1 y ${cantidadActual - 1}.`);
    return;
  }

  const motivo = prompt('Motivo de la división (opcional, ej: "defectos", "agilizar entrega"):') || null;

  try {
    // 1. Encontrar el bulto original para obtener su salida_id
    const original = produccionData.find(x => x.produccion_bulto_id === produccionBultoId);
    if (!original) throw new Error('No se encontró el bulto original');

    // 2. Contar hermanos de división para asignar sufijo correcto
    const hermanos = await supaFetch('produccion_bulto','GET',null,
      `?or=(id.eq.${produccionBultoId},bulto_origen_id.eq.${produccionBultoId})&select=id,sufijo_division`);
    const yaUsados = new Set(['']); // '' = original sin sufijo
    hermanos.forEach(h => { if (h.sufijo_division) yaUsados.add(h.sufijo_division); });
    let n = 2;
    while (yaUsados.has(`/${n}`)) n++;
    const sufijoNuevo = `/${n}`;

    // 3. Actualizar cantidad del original
    const cantidadOriginalNueva = original.cantidad_original - piezasAPartir;
    await supaUpdate('produccion_bulto', produccionBultoId, {
      cantidad_ajustada: cantidadOriginalNueva,
      actualizado_en: new Date().toISOString(),
    });

    // 4. Crear bulto derivado (mismo tendido_rollo_salida, con sufijo)
    await supaFetch('produccion_bulto','POST',{
      tendido_rollo_salida_id: original.salida_id,
      estado: 'pendiente',
      cantidad_ajustada: piezasAPartir,
      bulto_origen_id: produccionBultoId,
      sufijo_division: sufijoNuevo,
      observaciones: motivo,
    });

    alert(`✅ Dividido: ${cantidadOriginalNueva} + ${piezasAPartir} piezas (derivado${sufijoNuevo})`);
    await cargarProduccion(); // recargar desde BD porque cambió estructura
  } catch(e) {
    alert('Error al dividir: ' + e.message);
  }
}

// ══ UNIR ═════════════════════════════════════════════════════════════
async function abrirUnir(produccionBultoId, tallaKeySalida, codigoBulto) {
  // Buscar otros bultos con misma KEY, no terminados, no fusionados, no este mismo
  const candidatos = produccionData.filter(b => 
    b.talla_key_salida === tallaKeySalida &&
    b.produccion_bulto_id !== produccionBultoId &&
    b.estado !== 'terminado'
  );

  if (candidatos.length === 0) {
    alert(`No hay otros bultos pendientes con la KEY ${tallaKeySalida} para unir.`);
    return;
  }

  // Abrir mini-modal con lista
  miniModalContext = { tipo: 'unirBultos', principalId: produccionBultoId, principalCodigo: codigoBulto, candidatos };
  document.getElementById('mm-title').textContent = `Unir bultos a ${codigoBulto}`;
  const body = document.getElementById('mm-body');
  body.innerHTML = `
    <div class="text-muted" style="margin-bottom:10px;font-size:12px">
      Elegí uno o más bultos con KEY <strong>${tallaKeySalida}</strong> para fusionar en <strong>${codigoBulto}</strong>.
      Los fusionados pasan a formar parte del principal.
    </div>
    <div style="max-height:300px;overflow-y:auto">
      ${candidatos.map(c => `
        <label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--borde);border-radius:6px;margin-bottom:4px;cursor:pointer">
          <input type="checkbox" data-unir-id="${c.produccion_bulto_id}" data-unir-cant="${c.cantidad_original}">
          <div style="flex:1">
            <div style="font-family:monospace;font-weight:700;color:var(--azul)">${c.codigo_bulto}</div>
            <div style="font-size:11px;color:#666">${c.cantidad_original} pz · Corte ${c.letra_corte||'?'} · ${c.codigo_corte}</div>
          </div>
        </label>
      `).join('')}
    </div>
  `;
  document.getElementById('mm-ok').textContent = 'Unir seleccionados';
  document.getElementById('mini-modal').classList.add('active');
}

async function ejecutarUnion() {
  const ctx = miniModalContext;
  if (!ctx || ctx.tipo !== 'unirBultos') return;

  const seleccionados = Array.from(document.querySelectorAll('[data-unir-id]:checked'))
    .map(el => ({ id: el.dataset.unirId, cant: parseInt(el.dataset.unirCant) || 0 }));

  if (seleccionados.length === 0) {
    alert('Elegí al menos un bulto para unir.');
    return;
  }

  // Confirmar
  const totalSumar = seleccionados.reduce((s, x) => s + x.cant, 0);
  const principal = produccionData.find(x => x.produccion_bulto_id === ctx.principalId);
  const nuevaCantidad = (principal?.cantidad_original || 0) + totalSumar;
  
  if (!confirm(`Unir ${seleccionados.length} bulto(s) a ${ctx.principalCodigo}.\n\nEl principal pasa de ${principal?.cantidad_original} → ${nuevaCantidad} piezas.\n\n¿Continuar?`)) return;

  try {
    // 1. Actualizar cantidad del principal
    await supaUpdate('produccion_bulto', ctx.principalId, {
      cantidad_ajustada: nuevaCantidad,
      actualizado_en: new Date().toISOString(),
    });

    // 2. Marcar los otros como unidos al principal
    for (const sel of seleccionados) {
      await supaUpdate('produccion_bulto', sel.id, {
        unido_a_id: ctx.principalId,
        actualizado_en: new Date().toISOString(),
      });
    }

    cerrarMiniModal();
    alert(`✅ ${seleccionados.length} bulto(s) unido(s). Total: ${nuevaCantidad} piezas en ${ctx.principalCodigo}.`);
    await cargarProduccion();
  } catch(e) {
    alert('Error al unir: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════
// PRODUCCIÓN FASE 2: sub-pestañas, captura, operarias
// ══════════════════════════════════════════════════════════════════════
let operariasCache = [];
let operacionesCache = {}; // cod_prenda -> [operaciones]
let registrosHoyCache = [];
let progresoCache = {}; // produccion_bulto_id -> { total, registradas }

// Features opt-in: se activan desde Config
let FASE2_ACTIVA = localStorage.getItem('fase2_activa') === 'true';
let FASE3_ACTIVA = localStorage.getItem('fase3_activa') === 'true';

function switchSubProd(sub) {
  ['dashboard','captura','operarias'].forEach(s => {
    document.getElementById(`prod-sub-${s}-view`).style.display = (s===sub) ? 'block' : 'none';
    const btn = document.getElementById(`prod-sub-${s}`);
    if (btn) btn.className = (s===sub) ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    if (btn) btn.style.flex = '1';
  });
  if (sub === 'dashboard') cargarProduccion();
  if (sub === 'captura') initCaptura();
  if (sub === 'operarias') cargarOperarias();
}

// ─── Operarias ────────────────────────────────────────────────────
async function cargarOperarias() {
  try {
    operariasCache = await supaFetch('operaria','GET',null,'?order=nombre&limit=100');
    renderOperarias();
  } catch(e) {
    console.error('Error cargando operarias:', e);
  }
}

function renderOperarias() {
  const cont = document.getElementById('operarias-lista');
  if (!cont) return;
  if (operariasCache.length === 0) {
    cont.innerHTML = '<div class="text-muted">No hay operarias todavía. Agregá una.</div>';
    return;
  }
  cont.innerHTML = operariasCache.map(op => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border:1px solid var(--borde);border-radius:6px;margin-bottom:4px;${op.activo?'':'opacity:0.5;background:#F5F5F5'}">
      <div>
        <strong>${op.nombre}</strong>
        ${op.activo?'':'<span class="text-muted" style="font-size:11px"> · inactiva</span>'}
      </div>
      <div style="display:flex;gap:4px">
        <button class="btn-mini" onclick="renombrarOperaria('${op.id}','${op.nombre.replace(/'/g,"\\'")}')">✏️</button>
        <button class="btn-mini ${op.activo?'btn-mini-danger':'btn-mini-success'}" onclick="toggleOperaria('${op.id}',${!op.activo})">
          ${op.activo?'🚫 Desactivar':'✓ Activar'}
        </button>
      </div>
    </div>
  `).join('');
}

async function agregarOperaria() {
  const nombre = document.getElementById('nueva-operaria').value.trim();
  if (!nombre) return;
  try {
    await supaFetch('operaria','POST',{ nombre, activo: true });
    document.getElementById('nueva-operaria').value = '';
    await cargarOperarias();
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

async function renombrarOperaria(id, nombreActual) {
  const nuevo = prompt('Nuevo nombre:', nombreActual);
  if (!nuevo || nuevo.trim() === nombreActual) return;
  try {
    await supaUpdate('operaria', id, { nombre: nuevo.trim() });
    await cargarOperarias();
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

async function toggleOperaria(id, activar) {
  try {
    await supaUpdate('operaria', id, { activo: activar });
    await cargarOperarias();
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

// ─── Captura ──────────────────────────────────────────────────────
async function initCaptura() {
  // Fecha de hoy
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('cap-fecha').value = hoy;
  document.getElementById('lote-fecha').value = hoy;
  document.getElementById('cap-piezas').value = '';
  document.getElementById('cap-observaciones').value = '';
  document.getElementById('cap-tipo').value = 'normal';

  // Cargar operarias activas
  if (operariasCache.length === 0) {
    operariasCache = await supaFetch('operaria','GET',null,'?order=nombre&limit=100');
  }
  const optsOp = '<option value="">— Elegir operaria —</option>' +
    operariasCache.filter(o => o.activo).map(o => `<option value="${o.id}">${o.nombre}</option>`).join('');
  document.getElementById('cap-operaria').innerHTML = optsOp;
  document.getElementById('lote-operaria').innerHTML = optsOp;

  // Cargar bultos
  if (!produccionData || produccionData.length === 0) {
    produccionData = await supaFetch('vw_produccion_estado','GET',null,'?limit=2000');
  }
  const selBulto = document.getElementById('cap-bulto');
  const bultosDisponibles = produccionData.filter(b => b.estado_manual !== 'terminado' && b.produccion_bulto_id);
  selBulto.innerHTML = '<option value="">— Elegir bulto —</option>' +
    bultosDisponibles.map(b => `<option value="${b.produccion_bulto_id}" data-prenda="${b.cod_prenda||''}" data-cant="${b.cantidad_original}">${b.codigo_bulto} (${b.cantidad_original}pz · ${b.letra_corte||'?'})</option>`).join('');

  // Cargar operaciones
  if (Object.keys(operacionesCache).length === 0) {
    const ops = await supaFetch('produccion_operacion','GET',null,'?activo=eq.true&order=cod_prenda,orden&limit=200');
    ops.forEach(o => {
      if (!operacionesCache[o.cod_prenda]) operacionesCache[o.cod_prenda] = [];
      operacionesCache[o.cod_prenda].push(o);
    });
  }

  // Filtros del modo lote
  actualizarFiltrosLote();

  // Registros del día y resumen
  await cargarRegistrosHoy();
}

function cambiarModoCap(modo) {
  document.getElementById('cap-modo-rapido').style.display = (modo === 'rapido') ? 'block' : 'none';
  document.getElementById('cap-modo-lote').style.display = (modo === 'lote') ? 'block' : 'none';
}

function actualizarFiltrosLote() {
  // Cortes
  const cortes = new Map();
  produccionData.forEach(b => {
    if (b.estado_manual === 'terminado' || !b.produccion_bulto_id) return;
    const k = b.codigo_corte + '||' + (b.letra_corte||'');
    cortes.set(k, `${b.letra_corte||'?'} · ${b.codigo_corte}`);
  });
  const selC = document.getElementById('lote-corte');
  selC.innerHTML = '<option value="">— Todos —</option>' + 
    [...cortes.entries()].sort((a,b)=>a[1].localeCompare(b[1])).map(([k,l]) => `<option value="${k}">Corte ${l}</option>`).join('');

  // Prendas
  const prendas = new Set();
  produccionData.forEach(b => { if (b.cod_prenda && b.estado_manual !== 'terminado') prendas.add(b.cod_prenda); });
  const selP = document.getElementById('lote-prenda');
  selP.innerHTML = '<option value="">— Todas —</option>' +
    [...prendas].sort().map(p => `<option value="${p}">${CATALOGO[p]?.nombre || p}</option>`).join('');

  // Operaciones (al inicio todas)
  llenarOperacionesLote();
}

function llenarOperacionesLote() {
  // Operaciones disponibles según la prenda elegida
  const prenda = document.getElementById('lote-prenda').value;
  const sel = document.getElementById('lote-operacion');
  let html = '<option value="">— Elegir operación —</option>';
  if (prenda && operacionesCache[prenda]) {
    html += operacionesCache[prenda].map(o => `<option value="${o.id}">${o.orden}. ${o.nombre}</option>`).join('');
  } else {
    // Mostrar todas agrupadas por prenda
    for (const cod in operacionesCache) {
      const nombrePrenda = CATALOGO[cod]?.nombre || cod;
      html += `<optgroup label="${nombrePrenda}">`;
      html += operacionesCache[cod].map(o => `<option value="${o.id}" data-prenda="${cod}">${o.orden}. ${o.nombre}</option>`).join('');
      html += `</optgroup>`;
    }
  }
  sel.innerHTML = html;
}

function refrescarBultosLote() {
  llenarOperacionesLote();
  const selCorte = document.getElementById('lote-corte').value;
  const selPrenda = document.getElementById('lote-prenda').value;
  const selOpEl = document.getElementById('lote-operacion');
  const selOp = selOpEl.value;
  const selOpData = selOpEl.selectedOptions[0]?.dataset?.prenda;
  const prendaEfectiva = selPrenda || selOpData;

  const cont = document.getElementById('lote-bultos-lista');
  if (!selOp) {
    cont.innerHTML = '<div class="text-muted" style="font-size:12px">Elegí operación primero...</div>';
    document.getElementById('lote-cuenta').textContent = '';
    return;
  }

  // Filtrar bultos candidatos
  let candidatos = produccionData.filter(b => 
    b.estado_manual !== 'terminado' && 
    b.produccion_bulto_id
  );
  if (selCorte) {
    candidatos = candidatos.filter(b => (b.codigo_corte + '||' + (b.letra_corte||'')) === selCorte);
  }
  if (prendaEfectiva) {
    candidatos = candidatos.filter(b => b.cod_prenda === prendaEfectiva);
  }

  if (candidatos.length === 0) {
    cont.innerHTML = '<div class="text-muted" style="font-size:12px">No hay bultos con esos filtros.</div>';
    document.getElementById('lote-cuenta').textContent = '';
    return;
  }

  cont.innerHTML = candidatos.map(b => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid #F0F0F0;cursor:pointer">
      <input type="checkbox" class="lote-check" data-bulto-id="${b.produccion_bulto_id}" data-cantidad="${b.cantidad_original}" onchange="actualizarCuentaLote()" checked>
      <div style="flex:1;font-size:12px">
        <div style="font-family:monospace;font-weight:700;color:var(--azul)">${b.codigo_bulto}</div>
        <div style="color:#666">${b.cantidad_original}pz · ${CATALOGO[b.cod_prenda]?.nombre || '?'}</div>
      </div>
    </label>
  `).join('');
  actualizarCuentaLote();
}

function actualizarCuentaLote() {
  const marcados = document.querySelectorAll('.lote-check:checked');
  const totalPiezas = Array.from(marcados).reduce((s, el) => s + (parseInt(el.dataset.cantidad) || 0), 0);
  const cuentaEl = document.getElementById('lote-cuenta');
  if (cuentaEl) cuentaEl.textContent = marcados.length > 0 ? `· ${marcados.length} bulto(s), ${totalPiezas}pz` : '';
}

async function guardarLote() {
  const operariaId = document.getElementById('lote-operaria').value;
  const fecha = document.getElementById('lote-fecha').value;
  const operacionId = document.getElementById('lote-operacion').value;
  const marcados = Array.from(document.querySelectorAll('.lote-check:checked'));

  if (!operariaId) { alert('Elegí operaria'); return; }
  if (!fecha) { alert('Elegí fecha'); return; }
  if (!operacionId) { alert('Elegí operación'); return; }
  if (marcados.length === 0) { alert('Marcá al menos un bulto'); return; }

  if (!confirm(`Guardar ${marcados.length} registro(s) como hechos hoy?\n\nSe registrará la misma operación para todos los bultos seleccionados.`)) return;

  let ok = 0, err = 0;
  for (const el of marcados) {
    try {
      await supaFetch('produccion_registro_operacion','POST',{
        produccion_bulto_id: el.dataset.bultoId,
        operacion_id: operacionId,
        operaria_id: operariaId,
        fecha,
        cantidad_realizada: parseInt(el.dataset.cantidad) || 0,
        tipo: 'normal',
      });
      ok++;
    } catch(e) { err++; console.warn(e); }
  }
  alert(`✅ Lote guardado: ${ok} registro(s)${err>0?` (${err} con error)`:''}`);
  await cargarRegistrosHoy();
  await cargarProduccion(); // refrescar dashboard
}

function onBultoCapChange() {
  const sel = document.getElementById('cap-bulto');
  const prenda = sel.selectedOptions[0]?.dataset?.prenda;
  const selOp = document.getElementById('cap-operacion');
  if (!prenda || !operacionesCache[prenda]) {
    selOp.innerHTML = '<option value="">— Elegí un bulto primero —</option>';
    return;
  }
  // Pre-llenar piezas con la cantidad del bulto
  const bultoId = sel.value;
  const bulto = produccionData.find(b => b.produccion_bulto_id === bultoId);
  if (bulto) {
    document.getElementById('cap-piezas').value = bulto.cantidad_original;
  }
  // Listar operaciones de la prenda
  selOp.innerHTML = '<option value="">— Elegir operación —</option>' +
    operacionesCache[prenda].map(o => `<option value="${o.id}">${o.orden}. ${o.nombre}</option>`).join('');
}

async function guardarCaptura() {
  const operariaId = document.getElementById('cap-operaria').value;
  const fecha = document.getElementById('cap-fecha').value;
  const bultoId = document.getElementById('cap-bulto').value;
  const operacionId = document.getElementById('cap-operacion').value;
  const piezas = parseInt(document.getElementById('cap-piezas').value) || 0;
  const tipo = document.getElementById('cap-tipo').value || 'normal';
  const observaciones = document.getElementById('cap-observaciones').value.trim() || null;

  if (!operariaId) { alert('Elegí una operaria'); return; }
  if (!fecha) { alert('Elegí una fecha'); return; }
  if (!bultoId) { alert('Elegí un bulto'); return; }
  if (!operacionId) { alert('Elegí una operación'); return; }
  if (piezas <= 0) { alert('Cantidad inválida'); return; }

  try {
    await supaFetch('produccion_registro_operacion','POST',{
      produccion_bulto_id: bultoId,
      operacion_id: operacionId,
      operaria_id: operariaId,
      fecha,
      cantidad_realizada: piezas,
      tipo,
      observaciones,
    });
    document.getElementById('cap-bulto').value = '';
    document.getElementById('cap-operacion').innerHTML = '<option value="">— Elegí un bulto primero —</option>';
    document.getElementById('cap-piezas').value = '';
    document.getElementById('cap-observaciones').value = '';
    document.getElementById('cap-tipo').value = 'normal';
    await cargarRegistrosHoy();
    await cargarProduccion(); // refrescar progreso de bultos
    mostrarAlerta('produccion','success','✅ Registro guardado.');
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

async function cargarRegistrosHoy() {
  const fecha = document.getElementById('cap-fecha').value || new Date().toISOString().split('T')[0];
  try {
    registrosHoyCache = await supaFetch('produccion_registro_operacion','GET',null,
      `?fecha=eq.${fecha}&order=creado_en.desc&limit=200`);
    renderResumenHoy();
    renderRegistrosHoy();
  } catch(e) {
    console.error('Error cargando registros:', e);
  }
}

function renderResumenHoy() {
  const cont = document.getElementById('cap-resumen-hoy');
  if (!cont) return;
  const fecha = document.getElementById('cap-fecha').value || new Date().toISOString().split('T')[0];
  const registros = registrosHoyCache || [];
  // Agrupar por operaria
  const porOperaria = {};
  let piezasTotal = 0;
  registros.forEach(r => {
    const op = operariasCache.find(o => o.id === r.operaria_id);
    const nom = op ? op.nombre : '?';
    if (!porOperaria[nom]) porOperaria[nom] = { registros: 0, piezas: 0 };
    porOperaria[nom].registros++;
    porOperaria[nom].piezas += r.cantidad_realizada || 0;
    piezasTotal += r.cantidad_realizada || 0;
  });
  if (registros.length === 0) {
    cont.innerHTML = `Sin registros del ${fecha}. Empezá capturando abajo.`;
    return;
  }
  const resumen = Object.entries(porOperaria)
    .sort((a,b) => b[1].piezas - a[1].piezas)
    .map(([nom, r]) => `<strong>${nom}</strong>: ${r.piezas}pz`)
    .join(' · ');
  cont.innerHTML = `
    <div><strong>${registros.length}</strong> registro(s) · <strong>${piezasTotal}</strong> pz total</div>
    <div style="margin-top:4px;font-size:12px">${resumen}</div>
  `;
}

function renderRegistrosHoy() {
  const cont = document.getElementById('cap-registros');
  if (!cont) return;
  if (registrosHoyCache.length === 0) {
    cont.innerHTML = '<div class="text-muted" style="font-size:12px">Sin registros todavía hoy.</div>';
    return;
  }
  // Enriquecer con nombres
  cont.innerHTML = registrosHoyCache.map(r => {
    const op = operariasCache.find(o => o.id === r.operaria_id);
    const opName = op ? op.nombre : '?';
    // Buscar operación
    let operacionName = '?';
    for (const cod in operacionesCache) {
      const found = operacionesCache[cod].find(x => x.id === r.operacion_id);
      if (found) { operacionName = found.nombre; break; }
    }
    // Buscar bulto
    const bulto = produccionData.find(b => b.produccion_bulto_id === r.produccion_bulto_id);
    const bultoCode = bulto ? bulto.codigo_bulto : '?';

    return `
      <div style="padding:8px;border:1px solid var(--borde);border-radius:6px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px"><strong>${opName}</strong> · ${operacionName}</div>
          <div style="font-size:11px;color:#666;font-family:monospace">${bultoCode} · ${r.cantidad_realizada}pz</div>
          ${r.observaciones?`<div style="font-size:11px;color:#856404">⚠️ ${r.observaciones}</div>`:''}
        </div>
        <button class="btn-mini btn-mini-danger" onclick="eliminarRegistro2('${r.id}')">🗑</button>
      </div>
    `;
  }).join('');
}

async function eliminarRegistro2(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  try {
    await supaFetch('produccion_registro_operacion','DELETE',null,`?id=eq.${id}`);
    await cargarRegistrosHoy();
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

// ─── Progreso (barras en dashboard) ───────────────────────────────
async function cargarProgreso() {
  try {
    const progr = await supaFetch('vw_produccion_progreso','GET',null,'?limit=3000');
    progresoCache = {};
    progr.forEach(p => {
      progresoCache[p.produccion_bulto_id] = {
        total: p.total_operaciones || 0,
        hechas: p.operaciones_registradas || 0,
      };
    });
  } catch(e) {
    console.warn('Sin progreso (vista vw_produccion_progreso):', e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════
// CONFIG

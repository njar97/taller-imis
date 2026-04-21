// ══════════════════════════════════════════════════════════════════════
async function initBulto() {
  document.getElementById('bu-paso-2').style.display = 'none';
  document.getElementById('bu-bultos-container').innerHTML = '';
  tendidoSeleccionado = null;
  bultosState = [];

  const sel = document.getElementById('bu-tendido-select');
  sel.innerHTML = '<option value="">— Cargando... —</option>';
  try {
    // Cargar tendidos que no tienen salidas registradas aún
    const tendidos = await supaFetch('vw_tendidos_sin_bultos','GET',null,'?n_salidas=eq.0&order=fecha.desc&limit=50');
    if (!tendidos.length) {
      sel.innerHTML = '<option value="">— No hay tendidos pendientes —</option>';
      document.getElementById('bu-tendido-info').innerHTML = '<div class="alert alert-warn">No hay tendidos pendientes de capturar bultos. Todos los tendidos ya tienen salidas registradas.</div>';
      return;
    }
    sel.innerHTML = '<option value="">— Elegir un tendido —</option>' + 
      tendidos.map(t => `<option value="${t.id}">${t.codigo_corte} · ${t.fecha} · ${t.n_rollos} rollo(s)</option>`).join('');
  } catch(e) {
    sel.innerHTML = '<option value="">— Error —</option>';
    mostrarAlerta('bulto','error','Error: ' + e.message);
  }
}

async function onElegirTendido() {
  const id = document.getElementById('bu-tendido-select').value;
  if (!id) {
    document.getElementById('bu-tendido-info').innerHTML = '';
    document.getElementById('bu-paso-2').style.display = 'none';
    return;
  }
  try {
    const [tend] = await supaFetch('tendido','GET',null,`?id=eq.${id}`);
    const rollos = await supaFetch('tendido_rollo','GET',null,`?tendido_id=eq.${id}&order=numero_rollo`);
    const tallas = await supaFetch('tendido_talla_marcada','GET',null,`?tendido_id=eq.${id}&order=orden`);
    const propuestos = await supaFetch('vw_bulto_propuesto','GET',null,`?tendido_id=eq.${id}&order=numero_rollo,letra_local`);

    tendidoSeleccionado = { tendido: tend, rollos, tallas };

    const info = `
      <div class="trazo-card">
        <div class="trazo-code">${tend.codigo_corte} · Corte ${tend.letra_corte || '?'}</div>
        <div class="trazo-meta">Tendido el ${tend.fecha} · ${rollos.length} rollo(s) · ${tallas.length} talla(s)</div>
        <div class="tallas-inline">
          ${tallas.map(t => `<span class="talla-pill ${t.tipo==='par'?'par':''}">${t.letra_local}: ${t.talla_key_original}${t.talla_key_complemento?' ↔ '+t.talla_key_complemento:''}${t.tipo==='par'?' (par)':''}</span>`).join('')}
        </div>
      </div>
    `;
    document.getElementById('bu-tendido-info').innerHTML = info;
    document.getElementById('bu-paso-2').style.display = 'block';

    // Inicializar estado de bultos propuestos
    bultosState = propuestos.map((p, idx) => ({
      uid: 'b' + idx,
      rollo_id: p.rollo_id,
      numero_rollo: p.numero_rollo,
      talla_marcada_id: p.talla_marcada_id,
      letra_talla: p.letra_local,
      tipo_talla: p.tipo,
      talla_original: p.talla_key,
      multiplicidad: p.multiplicidad,
      capas: p.capas,
      estado: 'propuesto',  // propuesto | confirmado | dividido | sustituido
      cantidad: p.cantidad_propuesta,
      talla_salida: p.talla_key,
      partidas: null,
      lienzo_sobrante: p.lienzo_sobrante,
      rol_par: p.rol_par || null,          // 'principal' | 'complemento' | null
      hermano_key: p.hermano_talla_key || null,
    }));

    renderBultos();
  } catch(e) {
    mostrarAlerta('bulto','error','Error: ' + e.message);
  }
}

function renderBultos() {
  const cont = document.getElementById('bu-bultos-container');
  const letraCorte = tendidoSeleccionado?.tendido?.letra_corte || '?';

  // Agrupar por rollo
  const porRollo = {};
  bultosState.forEach(b => {
    if (!porRollo[b.numero_rollo]) porRollo[b.numero_rollo] = [];
    porRollo[b.numero_rollo].push(b);
  });

  cont.innerHTML = Object.entries(porRollo).map(([num, bultos]) => `
    <div style="margin-bottom:16px">
      <div style="font-weight:700;color:var(--azul);margin-bottom:8px;font-size:13px">🧻 Rollo / Bulto #${num} (${bultos[0].capas} capas)</div>
      ${bultos.map(b => renderBulto(b, letraCorte)).join('')}
    </div>
  `).join('');

  // Totales
  const propuestos = bultosState.filter(b => b.estado === 'propuesto').length;
  const confirmados = bultosState.filter(b => b.estado === 'confirmado' || b.estado === 'sustituido').length;
  const divididos = bultosState.filter(b => b.estado === 'dividido');
  let totalPz = 0;
  bultosState.forEach(b => {
    if (b.estado === 'dividido' && b.partidas) {
      b.partidas.forEach(p => totalPz += p.cantidad || 0);
    } else if (b.estado !== 'dividido') {
      totalPz += b.cantidad || 0;
    }
  });
  document.getElementById('bu-total-propuestos').textContent = propuestos;
  document.getElementById('bu-total-confirmados').textContent = confirmados + divididos.length;
  document.getElementById('bu-total-pz').textContent = totalPz;
}

function renderBulto(b, letraCorte) {
  // Código del bulto: remover punto del detalle (ej: CINT.17 → CINT17) como en el Excel
  const talla = b.estado === 'dividido' ? b.talla_original : b.talla_salida;
  const tallaLimpia = (talla || '').replace(/\./g, '');
  const codigoActual = `${b.numero_rollo}${letraCorte}${b.letra_talla}${b.cantidad}-${tallaLimpia}`;
  
  const claseEstado = 'bulto-' + b.estado;
  const hint = b.tipo_talla === 'par' ? `(par: ${b.capas}÷2×${b.multiplicidad})` : `(completa: ${b.capas}×${b.multiplicidad})`;

  // Badge de rol en par complementado
  let badgeRol = '';
  if (b.rol_par === 'principal' && b.hermano_key) {
    badgeRol = `<span class="rbadge rbadge-trazo" title="Bulto principal del par, hermano: ${b.hermano_key}">🔗 par-P</span>`;
  } else if (b.rol_par === 'complemento' && b.hermano_key) {
    badgeRol = `<span class="rbadge rbadge-trazo" title="Bulto complemento del par, hermano: ${b.hermano_key}">🔗 par-C</span>`;
  }

  let acciones = '';
  if (b.estado === 'propuesto') {
    acciones = `
      <button class="btn-mini btn-mini-success" onclick="confirmarBulto('${b.uid}')">✓ Confirmar</button>
      <button class="btn-mini btn-mini-primary" onclick="sustituirBulto('${b.uid}')">🔄 Sustituir</button>
      <button class="btn-mini" onclick="dividirBulto('${b.uid}')">✂️ Dividir</button>
    `;
  } else if (b.estado === 'sustituido') {
    acciones = `<button class="btn-mini btn-mini-danger" onclick="resetBulto('${b.uid}')">↶ Revertir</button>`;
  } else if (b.estado === 'dividido') {
    acciones = `<button class="btn-mini btn-mini-danger" onclick="resetBulto('${b.uid}')">↶ Unir de vuelta</button>`;
  } else if (b.estado === 'confirmado') {
    acciones = `<button class="btn-mini btn-mini-danger" onclick="resetBulto('${b.uid}')">↶ Revertir</button>`;
  }

  let partidasHtml = '';
  if (b.estado === 'dividido' && b.partidas) {
    partidasHtml = `
      <div class="bulto-partidas">
        ${b.partidas.map((p, i) => `
          <div class="partida-child">
            <input type="number" min="0" value="${p.cantidad||''}" placeholder="pz" 
                   oninput="actualizarPartida('${b.uid}',${i},'cantidad',this.value)">
            <input type="text" value="${p.talla||''}" placeholder="Talla (KEY)" 
                   oninput="actualizarPartida('${b.uid}',${i},'talla',this.value)">
            <button class="btn-mini btn-mini-danger" onclick="quitarPartida('${b.uid}',${i})">✕</button>
          </div>
        `).join('')}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
          <button class="btn-mini" onclick="agregarPartidaBulto('${b.uid}')">+ partida</button>
          <div style="font-size:11px;color:#856404">Total partidas: ${b.partidas.reduce((s,p)=>s+(parseInt(p.cantidad)||0),0)} / ${b.cantidad}</div>
        </div>
      </div>
    `;
  }

  return `
    <div class="bulto-card ${claseEstado}" id="bcard-${b.uid}">
      <div class="bulto-head">
        <span class="bulto-codigo">${codigoActual}</span>
        ${badgeRol}
        <span class="bulto-meta">${hint} ${b.lienzo_sobrante?'· ⚠ 1 lienzo desperdicio':''}</span>
      </div>
      <div class="bulto-acciones">${acciones}</div>
      ${partidasHtml}
    </div>
  `;
}

function confirmarBulto(uid) {
  const b = bultosState.find(x => x.uid === uid);
  if (!b) return;
  b.estado = 'confirmado';
  renderBultos();
}

function sustituirBulto(uid) {
  const b = bultosState.find(x => x.uid === uid);
  if (!b) return;
  const nueva = prompt(`Sustituir talla de salida.\nOriginal: ${b.talla_original}\nCantidad: ${b.cantidad}\n\nEscribí la nueva talla (KEY):`, b.talla_salida);
  if (nueva === null) return;
  const trimmed = nueva.trim();
  if (!trimmed) return;
  b.talla_salida = trimmed;
  b.estado = trimmed === b.talla_original ? 'confirmado' : 'sustituido';
  renderBultos();
}

function dividirBulto(uid) {
  const b = bultosState.find(x => x.uid === uid);
  if (!b) return;
  b.estado = 'dividido';
  b.partidas = [
    { cantidad: '', talla: b.talla_original },
    { cantidad: '', talla: b.talla_original },
  ];
  renderBultos();
}

function agregarPartidaBulto(uid) {
  const b = bultosState.find(x => x.uid === uid);
  if (!b || !b.partidas) return;
  b.partidas.push({ cantidad: '', talla: b.talla_original });
  renderBultos();
}

function quitarPartida(uid, idx) {
  const b = bultosState.find(x => x.uid === uid);
  if (!b || !b.partidas) return;
  b.partidas.splice(idx, 1);
  if (b.partidas.length === 0) {
    b.partidas = null;
    b.estado = 'propuesto';
  }
  renderBultos();
}

function actualizarPartida(uid, idx, campo, valor) {
  const b = bultosState.find(x => x.uid === uid);
  if (!b || !b.partidas) return;
  if (campo === 'cantidad') b.partidas[idx].cantidad = parseInt(valor) || 0;
  else b.partidas[idx].talla = valor;
  // Actualizar solo los totales (no re-renderizar completo para no perder el foco)
  const total = b.partidas.reduce((s,p)=>s+(parseInt(p.cantidad)||0),0);
  const totEl = document.querySelector(`#bcard-${uid} .bulto-partidas > div:last-child > div`);
  if (totEl) totEl.textContent = `Total partidas: ${total} / ${b.cantidad}`;
}

function resetBulto(uid) {
  const b = bultosState.find(x => x.uid === uid);
  if (!b) return;
  b.estado = 'propuesto';
  b.talla_salida = b.talla_original;
  b.partidas = null;
  renderBultos();
}

async function guardarBultos() {
  if (!tendidoSeleccionado) { mostrarAlerta('bulto','error','Elegí un tendido.'); return; }
  // Validar: no quede nada 'propuesto' sin decidir
  const pendientes = bultosState.filter(b => b.estado === 'propuesto');
  if (pendientes.length) {
    if (!confirm(`Hay ${pendientes.length} bulto(s) sin decidir. ¿Querés confirmarlos tal cual como están propuestos?`)) return;
    pendientes.forEach(b => b.estado = 'confirmado');
  }
  // Validar: divididos deben sumar la cantidad original
  for (const b of bultosState) {
    if (b.estado === 'dividido') {
      const sum = b.partidas.reduce((s,p)=>s+(parseInt(p.cantidad)||0),0);
      if (sum !== b.cantidad) {
        if (!confirm(`El bulto ${b.numero_rollo}${tendidoSeleccionado.tendido.letra_corte}${b.letra_talla} se dividió en partidas que suman ${sum} pero el bulto original tenía ${b.cantidad}. ¿Guardar igual? (diferencia: ${b.cantidad-sum})`)) return;
      }
      for (const p of b.partidas) {
        if (!p.talla || !p.talla.trim()) { mostrarAlerta('bulto','error','Hay partidas sin talla asignada.'); return; }
        if (!p.cantidad || p.cantidad <= 0) { mostrarAlerta('bulto','error','Hay partidas sin cantidad.'); return; }
      }
    }
  }

  const btn = document.getElementById('btn-guardar-bulto');
  btn.textContent = '⏳ Guardando...';
  btn.disabled = true;

  try {
    let total = 0;
    // uid del bultosState → id UUID insertado en tendido_rollo_salida (solo para no-divididos)
    const uidToSalidaId = {};
    for (const b of bultosState) {
      if (b.estado === 'dividido' && b.partidas) {
        let ord = 1;
        for (const p of b.partidas) {
          await supaFetch('tendido_rollo_salida','POST',{
            tendido_rollo_id: b.rollo_id,
            tendido_talla_marcada_id: b.talla_marcada_id,
            talla_key_salida: p.talla.trim(),
            cantidad: parseInt(p.cantidad),
            orden: ord++,
          });
          total++;
        }
      } else {
        const [inserted] = await supaFetch('tendido_rollo_salida','POST',{
          tendido_rollo_id: b.rollo_id,
          tendido_talla_marcada_id: b.talla_marcada_id,
          talla_key_salida: b.talla_salida,
          cantidad: b.cantidad,
          orden: 1,
        });
        if (inserted?.id) uidToSalidaId[b.uid] = inserted.id;
        total++;
      }
    }

    // Segunda pasada: vincular bulto_hermano_id entre principal y complemento
    // Dos bultos son hermanos si comparten (rollo_id, talla_marcada_id) y son
    // uno principal + uno complemento (ambos no divididos).
    const parejas = {}; // key "rollo_id|talla_marcada_id" → {principal: uid, complemento: uid}
    for (const b of bultosState) {
      if (!uidToSalidaId[b.uid]) continue;       // solo los no divididos
      if (!b.rol_par || !b.hermano_key) continue; // solo los pares
      const k = `${b.rollo_id}|${b.talla_marcada_id}`;
      if (!parejas[k]) parejas[k] = {};
      parejas[k][b.rol_par] = b.uid;
    }
    for (const k of Object.keys(parejas)) {
      const par = parejas[k];
      if (par.principal && par.complemento) {
        const idP = uidToSalidaId[par.principal];
        const idC = uidToSalidaId[par.complemento];
        if (idP && idC) {
          await supaUpdate('tendido_rollo_salida', idP, { bulto_hermano_id: idC });
          await supaUpdate('tendido_rollo_salida', idC, { bulto_hermano_id: idP });
        }
      }
    }

    mostrarAlerta('bulto','success',`✅ ${total} bulto(s) guardado(s).`);
    setTimeout(() => { btn.textContent='💾 Guardar bultos confirmados'; btn.disabled=false; volverNuevo(); }, 2000);
  } catch(e) {
    mostrarAlerta('bulto','error','Error: ' + e.message);
    btn.textContent = '💾 Guardar bultos confirmados';
    btn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════════════
// HISTORIAL

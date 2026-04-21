// ══════════════════════════════════════════════════════════════════════
async function initTendido() {
  document.getElementById('td-fecha').value = new Date().toISOString().split('T')[0];
  ['td-equipo','td-observaciones'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('td-rollos-container').innerHTML = '';
  document.getElementById('td-paso-2').style.display = 'none';
  document.getElementById('td-warnings').innerHTML = '';
  trazoSeleccionado = null;
  rollosCountTd = 0;

  // Cargar trazos sin tendido
  const sel = document.getElementById('td-trazo-select');
  sel.innerHTML = '<option value="">— Cargando... —</option>';
  try {
    const trazos = await supaFetch('vw_trazos_sin_tendido','GET',null,'?limit=50');
    if (!trazos.length) {
      sel.innerHTML = '<option value="">— No hay trazos pendientes —</option>';
      document.getElementById('td-trazo-info').innerHTML = '<div class="alert alert-warn">No hay trazos pendientes de tender. Registrá un trazo primero.</div>';
      return;
    }
    sel.innerHTML = '<option value="">— Elegir un trazo —</option>' + 
      trazos.map(t => `<option value="${t.id}">${t.codigo_corte} · ${t.fecha} · ${t.n_tallas_marcadas} talla(s)</option>`).join('');
  } catch(e) {
    sel.innerHTML = '<option value="">— Error —</option>';
    mostrarAlerta('tendido','error','Error cargando trazos: ' + e.message);
  }
}

async function onElegirTrazo() {
  const id = document.getElementById('td-trazo-select').value;
  if (!id) {
    document.getElementById('td-trazo-info').innerHTML = '';
    document.getElementById('td-paso-2').style.display = 'none';
    trazoSeleccionado = null;
    return;
  }
  try {
    const [trazo] = await supaFetch('trazo','GET',null,`?id=eq.${id}`);
    const tallas = await supaFetch('trazo_talla_marcada','GET',null,`?trazo_id=eq.${id}&order=orden`);
    trazoSeleccionado = { trazo, tallas };

    const info = `
      <div class="trazo-card">
        <div class="trazo-code">${trazo.codigo_corte} · Corte ${trazo.letra_corte || '?'}</div>
        <div class="trazo-meta">Trazado el ${trazo.fecha} · ${tallas.length} talla(s) marcada(s) · ${trazo.capas || '?'} capas planeadas</div>
        <div class="tallas-inline">
          ${tallas.map(t => `<span class="talla-pill ${t.tipo==='par'?'par':''}">${t.letra_local}: ${t.talla_key_original}${t.talla_key_complemento?' ↔ '+t.talla_key_complemento:''}${t.tipo==='par'?' (par)':''}</span>`).join('')}
        </div>
      </div>
    `;
    document.getElementById('td-trazo-info').innerHTML = info;
    document.getElementById('td-paso-2').style.display = 'block';

    // Agregar primer rollo si no hay ninguno
    if (document.querySelectorAll('.rollo-card').length === 0) {
      agregarRolloTendido();
    }
    recalcTotalesTendido();
  } catch(e) {
    mostrarAlerta('tendido','error','Error: ' + e.message);
  }
}

function agregarRolloTendido() {
  rollosCountTd++;
  const id = rollosCountTd;
  const div = document.createElement('div');
  div.className = 'rollo-card';
  div.id = `trollo-${id}`;
  div.innerHTML = `
    <div class="rollo-header">
      <div>
        <div class="rollo-num">Rollo #${id} <span class="text-muted" style="font-weight:400">(orden de tendido)</span></div>
        <div class="equivalencia-pares" id="pares-${id}">0 pares</div>
      </div>
      ${id>1?`<button class="btn btn-danger" onclick="document.getElementById('trollo-${id}').remove();recalcTotalesTendido()">✕</button>`:''}
    </div>
    <div class="row3">
      <div class="field"><label>Yardas del rollo</label><input type="number" step="0.5" data-trollo="${id}" data-tfield="yardas_rollo" oninput="recalcTotalesTendido()"></div>
      <div class="field"><label>Capas (lienzos)</label><input type="number" min="0" data-trollo="${id}" data-tfield="lienzos_salidos" oninput="onCapasChange(${id})"></div>
      <div class="field"><label>Yardas sobrantes</label><input type="number" step="0.5" data-trollo="${id}" data-tfield="yardas_sobrantes" oninput="recalcTotalesTendido()"></div>
    </div>
    <div class="field"><label>Observaciones del rollo</label><textarea data-trollo="${id}" data-tfield="observacion_tono" placeholder="Tono, detalles, código físico si lo hay..."></textarea></div>
  `;
  document.getElementById('td-rollos-container').appendChild(div);
  recalcTotalesTendido();
}

function onCapasChange(rolloId) {
  const capas = parseInt(document.querySelector(`[data-trollo="${rolloId}"][data-tfield="lienzos_salidos"]`).value) || 0;
  const pares = Math.floor(capas / 2);
  const sobra = capas % 2;
  const paresText = `${pares} pares${sobra? ' + 1 lienzo sobrante':''}`;
  document.getElementById(`pares-${rolloId}`).textContent = paresText;
  recalcTotalesTendido();
  revisarWarnings();
}

function recalcTotalesTendido() {
  let capas=0, pares=0;
  const seen = new Set();
  document.querySelectorAll('[data-trollo]').forEach(el => {
    seen.add(el.dataset.trollo);
    if (el.dataset.tfield === 'lienzos_salidos') {
      const v = parseInt(el.value) || 0;
      capas += v;
      pares += Math.floor(v / 2);
    }
  });
  document.getElementById('td-total-capas').textContent = capas;
  document.getElementById('td-total-pares').textContent = pares;
  document.getElementById('td-total-rollos').textContent = seen.size;
}

function revisarWarnings() {
  const cont = document.getElementById('td-warnings');
  cont.innerHTML = '';
  if (!trazoSeleccionado) return;
  const tieneParTallas = trazoSeleccionado.tallas.some(t => t.tipo === 'par');
  if (!tieneParTallas) return;
  const rollosImpares = [];
  document.querySelectorAll('[data-tfield="lienzos_salidos"]').forEach(el => {
    const capas = parseInt(el.value) || 0;
    if (capas > 0 && capas % 2 !== 0) rollosImpares.push(el.dataset.trollo);
  });
  if (rollosImpares.length) {
    cont.innerHTML = `<div class="alert alert-warn">⚠️ Hay rollo(s) con capas impares (#${rollosImpares.join(', #')}) y el trazo tiene tallas en par. Se perdería 1 lienzo por rollo como desperdicio.</div>`;
  }
}

async function guardarTendido() {
  if (!trazoSeleccionado) { mostrarAlerta('tendido','error','Elegí un trazo primero.'); return; }
  const fecha = document.getElementById('td-fecha').value;
  if (!fecha) { mostrarAlerta('tendido','error','Fecha es obligatoria.'); return; }
  const rollos = document.querySelectorAll('.rollo-card');
  if (!rollos.length) { mostrarAlerta('tendido','error','Agregá al menos 1 rollo.'); return; }

  const btn = document.getElementById('btn-guardar-tendido');
  btn.textContent = '⏳ Guardando...';
  btn.disabled = true;

  try {
    const completo = document.getElementById('td-completo').value === 'true';
    // Heredar código, prendas y letra del trazo
    const [tendido] = await supaFetch('tendido','POST',{
      fecha,
      codigo_corte: trazoSeleccionado.trazo.codigo_corte,
      letra_corte: trazoSeleccionado.trazo.letra_corte,
      trazo_id: trazoSeleccionado.trazo.id,
      prendas: null, // se puede inferir de las tallas
      equipo: document.getElementById('td-equipo').value || null,
      completo_en_un_dia: completo,
      fecha_continuacion: (!completo && document.getElementById('td-continuacion').value) ? document.getElementById('td-continuacion').value : null,
      observaciones_generales: document.getElementById('td-observaciones').value || null,
    });

    // Copiar tallas marcadas del trazo al tendido (con vinculación)
    const tmRemoteMap = {}; // letra_local -> id en tendido_talla_marcada
    for (const t of trazoSeleccionado.tallas) {
      const [inserted] = await supaFetch('tendido_talla_marcada','POST',{
        tendido_id: tendido.id,
        trazo_talla_marcada_id: t.id,
        letra_local: t.letra_local,
        talla_key_original: t.talla_key_original,
        talla_key_complemento: t.talla_key_complemento || null,
        tipo: t.tipo,
        multiplicidad: t.multiplicidad,
        orden: t.orden,
      });
      tmRemoteMap[t.letra_local] = inserted.id;
    }

    // Rollos con numeración invertida: último capturado = rollo #1
    // Orden de captura: trollo-1, trollo-2, ..., trollo-N
    // Numeración final: el último capturado es rollo 1, el primero es rollo N
    const rolloElems = Array.from(rollos);
    const n = rolloElems.length;
    for (let i = 0; i < n; i++) {
      const el = rolloElems[i];
      const id = el.id.replace('trollo-','');
      const numeroFinal = n - i; // i=0 (primer capturado) → rollo #N; i=n-1 (último) → rollo #1
      const campos = { tendido_id: tendido.id, numero_rollo: numeroFinal };
      el.querySelectorAll('[data-trollo]').forEach(inp => {
        const f = inp.dataset.tfield;
        const v = inp.value;
        campos[f] = ['yardas_rollo','lienzos_salidos','yardas_sobrantes'].includes(f) ? (v ? parseFloat(v) : null) : (v || null);
      });
      await supaFetch('tendido_rollo','POST',campos);
    }

    mostrarAlerta('tendido','success',`✅ Tendido guardado. ${n} rollo(s) renumerados (último tendido = bulto #1).`);
    setTimeout(() => { btn.textContent='💾 Guardar tendido (invierte numeración)'; btn.disabled=false; volverNuevo(); }, 2200);
  } catch(e) {
    mostrarAlerta('tendido','error','Error: ' + e.message);
    btn.textContent = '💾 Guardar tendido (invierte numeración)';
    btn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════════════
// BULTO (asistente)

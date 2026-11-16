// ══════════════════════════════════════════════════════════════════════
// ── Rollos de bodega (tela_rollo) ─────────────────────────────────────
// Al tender se elige el rollo de una lista: las yardas se llenan solas y,
// al guardar, al rollo se le deja lo que sobró (0 = agotado, ya no sale).
const TD_TOPE_TELAS = 320;          // máximo de telas por tendido
let tdRollosBodega = [];            // rollos con yardas disponibles
function tdEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function tdNombreRollo(r) {
  const quien = r.persona === 'Javier' ? 'JAV' : (r.persona || '');
  return [quien, r._escuela || '', r.numero_rollo || ''].filter(Boolean).join(' ');
}
async function tdCargarRollosBodega() {
  try {
    const [rollos, escuelas] = await Promise.all([
      supaFetchAll('tela_rollo', '?estado=eq.en_bodega&yardas_disponibles=gt.0' +
        '&select=id,persona,escuela_id,numero_rollo,color,yardas,yardas_disponibles&order=color,persona,numero_rollo'),
      supaFetchAll('escuela', '?select=id,alias,nombre'),
    ]);
    const esc = new Map((escuelas || []).map(e => [e.id, e.alias || e.nombre || '']));
    tdRollosBodega = (rollos || []).map(r => ({ ...r, _escuela: esc.get(r.escuela_id) || '' }));
  } catch (e) {
    tdRollosBodega = [];
    console.warn('[tendido] no se pudieron cargar los rollos de bodega:', e && e.message || e);
  }
}
// Rollos que sirven para el trazo elegido (por color de tela).
function tdRollosDelTrazo() {
  const cols = ((trazoSeleccionado && trazoSeleccionado.trazo.colores_tela) || []).map(c => String(c).toUpperCase());
  return cols.length ? tdRollosBodega.filter(r => cols.includes(String(r.color || '').toUpperCase())) : tdRollosBodega;
}
// Yardas que gasta una tela (lienzo) del trazo elegido.
function tdYardasPorTela() {
  const cm = trazoSeleccionado ? Number(trazoSeleccionado.trazo.largo_cm) || 0 : 0;
  return cm > 0 ? cm / 91.44 : 0;
}
function tdOpcionesRollo(rolloId) {
  const usados = new Set([...document.querySelectorAll('.rollo-card')]
    .filter(c => c.id !== 'trollo-' + rolloId).map(c => c.dataset.telaId).filter(Boolean));
  const mio = (document.getElementById('trollo-' + rolloId) || {}).dataset || {};
  const porColor = new Map();
  for (const r of tdRollosDelTrazo()) {
    if (usados.has(r.id)) continue;
    const c = String(r.color || '').toUpperCase();
    if (!porColor.has(c)) porColor.set(c, []);
    porColor.get(c).push(r);
  }
  let html = '<option value="">— Elegir rollo —</option>';
  for (const [color, lista] of porColor) {
    html += `<optgroup label="${tdEsc(color)}">` + lista.map(r =>
      `<option value="${r.id}"${mio.telaId === r.id ? ' selected' : ''}>${tdEsc(tdNombreRollo(r))} · ${Number(r.yardas_disponibles)} yd</option>`).join('') + '</optgroup>';
  }
  return html + `<option value="otro"${mio.telaOtro ? ' selected' : ''}>Otro (no está en la lista)</option>`;
}
function tdRefrescarListas() {
  document.querySelectorAll('.rollo-card').forEach(c => {
    const sel = c.querySelector('[data-tsel]');
    if (sel) sel.innerHTML = tdOpcionesRollo(c.id.replace('trollo-', ''));
  });
}
function onElegirRolloBodega(rolloId) {
  const card = document.getElementById('trollo-' + rolloId);
  const sel = card.querySelector('[data-tsel]');
  const yd = card.querySelector('[data-tfield="yardas_rollo"]');
  const r = tdRollosBodega.find(x => x.id === sel.value);
  delete card.dataset.telaId; delete card.dataset.telaOtro; delete card.dataset.telaColor;
  if (r) {
    card.dataset.telaId = r.id;
    card.dataset.telaColor = String(r.color || '').toUpperCase();
    yd.value = Number(r.yardas_disponibles);
    yd.readOnly = true;
  } else {
    if (sel.value === 'otro') card.dataset.telaOtro = '1';
    yd.readOnly = false;
    if (sel.value !== 'otro') yd.value = '';
  }
  tdRefrescarListas();
  tdSobranteAuto(rolloId);
  recalcTotalesTendido();
}
// Sobrante = yardas del rollo − telas × largo del trazo (de media en media
// yarda, hacia abajo). Si la persona lo escribe a mano, se respeta.
function tdSobranteAuto(rolloId) {
  const card = document.getElementById('trollo-' + rolloId);
  if (!card) return;
  const get = f => card.querySelector(`[data-tfield="${f}"]`);
  const yd = parseFloat(get('yardas_rollo').value) || 0;
  const capas = parseInt(get('lienzos_salidos').value) || 0;
  const porTela = tdYardasPorTela();
  const pista = card.querySelector('[data-tpista]');
  if (pista) pista.textContent = (yd > 0 && porTela > 0) ? `Da para ${Math.floor(yd / porTela)} telas` : '';
  const sob = get('yardas_sobrantes');
  if (sob.dataset.manual === '1' || !(yd > 0 && porTela > 0 && capas > 0)) return;
  sob.value = Math.max(0, Math.floor((yd - capas * porTela) * 2) / 2);
}
function tdPintarContador() {
  const el = document.getElementById('td-contador');
  if (!el) return;
  const plan = trazoSeleccionado ? Number(trazoSeleccionado.trazo.capas) || 0 : 0;
  let van = 0; const porColor = new Map();
  document.querySelectorAll('.rollo-card').forEach(c => {
    const n = parseInt(c.querySelector('[data-tfield="lienzos_salidos"]').value) || 0;
    van += n;
    const col = c.dataset.telaColor || '';
    if (n && col) porColor.set(col, (porColor.get(col) || 0) + n);
  });
  const meta = plan || TD_TOPE_TELAS;
  const pct = Math.min(100, meta ? 100 * van / meta : 0);
  const pasaTope = van > TD_TOPE_TELAS, llego = plan > 0 && van >= plan;
  const color = pasaTope ? '#C0392B' : (llego ? '#2E9E5B' : 'var(--azul)');
  const colores = [...porColor].map(([c, n]) => `${tdEsc(c.charAt(0) + c.slice(1).toLowerCase())} ${n}`).join(' · ');
  let aviso = '';
  if (pasaTope) aviso = `⚠ Pasa el tope de ${TD_TOPE_TELAS} telas`;
  else if (plan && van > plan) aviso = `Van ${van - plan} de más`;
  else if (llego) aviso = '✓ Completo';
  else if (plan) aviso = `Faltan ${plan - van}`;
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
      <span style="font-size:20px;font-weight:700;color:${color}">${van}${plan ? ` de ${plan}` : ''} telas</span>
      <span style="font-size:13px;font-weight:700;color:${color}">${aviso}</span>
    </div>
    <div style="height:10px;border-radius:5px;background:#D9DEE5;overflow:hidden;margin:6px 0 4px"><div style="height:100%;width:${pct.toFixed(1)}%;background:${color}"></div></div>
    ${colores ? `<div style="font-size:12px;color:#555">${colores}</div>` : ''}`;
}

async function initTendido() {
  tdCargarRollosBodega().then(() => tdRefrescarListas());
  document.getElementById('td-fecha').value = hoyLocal();
  ['td-equipo','td-observaciones'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('td-rollos-container').innerHTML = '';
  document.getElementById('td-paso-2').style.display = 'none';
  document.getElementById('td-warnings').innerHTML = '';
  trazoSeleccionado = null;
  rollosCountTd = 0;
  document.getElementById('td-letra').value = '';
  tdLetrasUsadas = [];
  const preId = window._tdPreseleccion || null;
  window._tdPreseleccion = null;

  // Letras ya usadas (para sugerir la que sigue y avisar si se repite)
  supaFetch('tendido','GET',null,'?select=letra_corte,codigo_corte,fecha&letra_corte=not.is.null&order=fecha.desc&limit=40')
    .then(r => { tdLetrasUsadas = r || []; sugerirLetraTendido(); })
    .catch(() => {});

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
    trazos.sort((a, b) => String(a.codigo_corte || '').localeCompare(String(b.codigo_corte || ''), 'es', { numeric: true }));
    sel.innerHTML = '<option value="">— Elegir un trazo —</option>' + 
      trazos.map(t => `<option value="${t.id}">${t.codigo_corte} · ${t.fecha} · ${t.n_tallas_marcadas} talla(s)</option>`).join('');
    if (preId && trazos.some(t => t.id === preId)) {
      sel.value = preId;
      await onElegirTrazo();
    }
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
        <div class="trazo-code">${trazo.codigo_corte} · Corte <span id="td-trazo-letra">${trazo.letra_corte || '?'}</span></div>
        <div class="trazo-meta">Trazado el ${trazo.fecha} · ${tallas.length} talla(s) marcada(s) · ${trazo.capas || '?'} capas planeadas</div>
        <div class="tallas-inline">
          ${tallas.map(t => `<span class="talla-pill ${t.tipo==='par'?'par':''}">${t.letra_local}: ${tallasTendidoBonito(t.talla_key_original)}${t.talla_key_complemento?' ↔ '+tallasTendidoBonito(t.talla_key_complemento):''}${t.tipo==='par'?' (par)':''}</span>`).join('')}
        </div>
      </div>
    `;
    document.getElementById('td-trazo-info').innerHTML = info;
    document.getElementById('td-paso-2').style.display = 'block';
    document.getElementById('td-letra').value = trazo.letra_corte || '';
    sugerirLetraTendido();

    // Agregar primer rollo si no hay ninguno
    if (document.querySelectorAll('.rollo-card').length === 0) {
      agregarRolloTendido();
    }
    tdRefrescarListas();   // la lista depende del color de tela del trazo
    recalcTotalesTendido();
  } catch(e) {
    mostrarAlerta('tendido','error','Error: ' + e.message);
  }
}

// ── Letra del corte: se pone al tender ────────────────────────────────
let tdLetrasUsadas = [];

// Si el trazo no trae letra, propone la que sigue a la del último corte.
function sugerirLetraTendido() {
  const inp = document.getElementById('td-letra');
  if (!inp || !trazoSeleccionado) return;
  if (!inp.value && !trazoSeleccionado.trazo.letra_corte && tdLetrasUsadas.length) {
    const ult = String(tdLetrasUsadas[0].letra_corte || '').toUpperCase();
    if (/^[A-Y]$/.test(ult)) inp.value = String.fromCharCode(ult.charCodeAt(0) + 1);
  }
  revisarLetraTendido();
}

function revisarLetraTendido() {
  const inp = document.getElementById('td-letra');
  const ay = document.getElementById('td-letra-ayuda');
  if (!inp || !ay) return;
  const letra = inp.value.trim().toUpperCase();
  const ult = tdLetrasUsadas[0];
  const base = 'Va en el código de cada bulto.' + (ult ? ` El último corte fue el ${ult.letra_corte} (${ult.fecha}).` : '');
  const rep = letra && tdLetrasUsadas.find(t => String(t.letra_corte).toUpperCase() === letra);
  if (rep) {
    ay.innerHTML = `⚠️ La letra <b>${letra}</b> ya se usó en «${rep.codigo_corte}» (${rep.fecha}). Mejor otra, para que los bultos no se confundan.`;
    ay.style.color = '#b45309';
  } else {
    ay.textContent = base;
    ay.style.color = '';
  }
  const cab = document.getElementById('td-trazo-letra');
  if (cab) cab.textContent = letra || '?';
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
      ${id>1?`<button class="btn btn-danger" onclick="document.getElementById('trollo-${id}').remove();tdRefrescarListas();recalcTotalesTendido()">✕</button>`:''}
    </div>
    <div class="field">
      <label>Rollo de bodega</label>
      <select data-tsel="${id}" onchange="onElegirRolloBodega(${id})">${tdOpcionesRollo(id)}</select>
      <div class="text-muted" data-tpista style="font-size:12px;margin-top:3px"></div>
    </div>
    <div class="row3">
      <div class="field"><label>Yardas del rollo</label><input type="number" step="0.5" data-trollo="${id}" data-tfield="yardas_rollo" oninput="tdSobranteAuto(${id});recalcTotalesTendido()"></div>
      <div class="field"><label>Telas tendidas</label><input type="number" min="0" data-trollo="${id}" data-tfield="lienzos_salidos" oninput="onCapasChange(${id})"></div>
      <div class="field"><label>Yardas sobrantes</label><input type="number" step="0.5" data-trollo="${id}" data-tfield="yardas_sobrantes" oninput="this.dataset.manual=this.value===''?'':'1';recalcTotalesTendido()"></div>
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
  tdSobranteAuto(rolloId);
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
  tdPintarContador();
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
  const letra = document.getElementById('td-letra').value.trim().toUpperCase();
  if (!/^[A-Z]$/.test(letra)) {
    mostrarAlerta('tendido','error','Falta la letra del corte (una sola letra). Va en el código de cada bulto.');
    document.getElementById('td-letra').focus();
    return;
  }
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
      letra_corte: letra,
      trazo_id: trazoSeleccionado.trazo.id,
      prendas: null, // se puede inferir de las tallas
      equipo: document.getElementById('td-equipo').value || null,
      completo_en_un_dia: completo,
      fecha_continuacion: (!completo && document.getElementById('td-continuacion').value) ? document.getElementById('td-continuacion').value : null,
      observaciones_generales: document.getElementById('td-observaciones').value || null,
    });

    // El trazo queda con la misma letra (si no la tenía o se cambió)
    if (trazoSeleccionado.trazo.letra_corte !== letra) {
      await supaFetch('trazo','PATCH',{ letra_corte: letra },`?id=eq.${trazoSeleccionado.trazo.id}`);
      trazoSeleccionado.trazo.letra_corte = letra;
    }

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
      const tela = el.dataset.telaId ? tdRollosBodega.find(r => r.id === el.dataset.telaId) : null;
      if (tela) campos.codigo_rollo = tdNombreRollo(tela);
      await supaFetch('tendido_rollo','POST',campos);
      // Descontar de bodega: al rollo le queda lo que sobró; con 0 queda agotado.
      if (tela) {
        const queda = Math.max(0, Number(campos.yardas_sobrantes) || 0);
        await supaFetch('tela_rollo','PATCH',{
          yardas_disponibles: queda,
          estado: queda > 0 ? 'en_bodega' : 'agotado',
          actualizado_en: new Date().toISOString(),
        },`?id=eq.${tela.id}`);
      }
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

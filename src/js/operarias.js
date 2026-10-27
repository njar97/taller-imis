// ══════════════════════════════════════════════════════════════════════
// OPERARIAS Y CANDIDATAS (Producción → Operarias, o Config → Catálogos)
// Quién trabaja, desde cuándo, cómo llegó, si ya tenemos su DUI, y las
// candidatas: citadas, en prueba y las que ya no vinieron.
// La columna `activo` (la usan Captura/Asignar/Grupos) la mantiene la base
// según el estado: solo «trabajando» queda activa.
// ══════════════════════════════════════════════════════════════════════
const OP_ESTADOS = {
  trabajando: { t: 'Trabajando',              c: '#1E7B4F' },
  aceptada:   { t: 'Pasó la prueba, por empezar', c: '#1C5CAB' },
  en_prueba:  { t: 'Vino a la prueba, falta decidir', c: '#1C5CAB' },
  citada:     { t: 'Citada a prueba',         c: '#B36B00' },
  candidata:  { t: 'Conversando',             c: '#B36B00' },
  no_vino:    { t: 'No vino a la prueba',     c: '#888' },
  no_siguio:  { t: 'Dejó de contestar',       c: '#888' },
  descartada: { t: 'Descartada',              c: '#888' },
  retirada:   { t: 'Ya no trabaja',           c: '#888' },
};
const OP_GRUPOS = [
  { t: '👷 Trabajando', e: ['trabajando'] },
  { t: '🧪 En proceso', e: ['aceptada', 'en_prueba', 'citada', 'candidata'] },
  { t: '🚪 Ya no vinieron / no siguieron', e: ['no_vino', 'no_siguio', 'descartada', 'retirada'] },
];
const OP_DUI = { guardado: '🪪 DUI ✓', falta: '⚠ falta DUI', menor: '🪪 menor (partida)' };
const OP_MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function opEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function opFecha(f) {
  if (!f) return '';
  const [a, m, d] = String(f).slice(0, 10).split('-');
  return `${+d}-${OP_MESES[+m - 1]}-${a}`;
}

async function cargarOperarias() {
  const cont = document.getElementById('operarias-lista');
  if (cont) cont.innerHTML = '<div class="text-muted">Cargando…</div>';
  try {
    operariasCache = await supaFetch('operaria', 'GET', null, '?order=nombre&limit=300');
    renderOperarias();
  } catch (e) {
    console.error('Error cargando operarias:', e);
    if (cont) cont.innerHTML = '<div class="text-muted">No se pudo cargar: ' + opEsc(e.message) + '</div>';
  }
}

function opFila(op) {
  const est = OP_ESTADOS[op.estado] || { t: op.estado, c: '#888' };
  const lineas = [];
  if (op.estado === 'trabajando') {
    lineas.push(op.fecha_inicio ? 'Desde ' + opFecha(op.fecha_inicio) : '<span style="color:#B36B00">¿desde cuándo?</span>');
  } else if (op.fecha_prueba) {
    lineas.push('Prueba ' + opFecha(op.fecha_prueba));
  }
  if (op.fecha_salida) lineas.push('Salió ' + opFecha(op.fecha_salida));
  if (op.como_llego) lineas.push('Llegó: ' + opEsc(op.como_llego));
  const duiColor = op.dui === 'falta' ? '#C0392B' : '#1E7B4F';
  return `
    <div onclick="opAbrirFicha('${op.id}')" style="cursor:pointer;padding:10px;border:1px solid var(--borde);border-radius:8px;margin-bottom:6px;border-left:4px solid ${est.c}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
        <strong style="font-size:15px">${opEsc(op.nombre_completo || op.nombre)}</strong>
        <span style="font-size:11px;font-weight:700;color:${duiColor};white-space:nowrap">${['trabajando','aceptada','en_prueba'].includes(op.estado) || op.dui !== 'falta' ? (OP_DUI[op.dui] || '') : ''}</span>
      </div>
      <div style="font-size:12px;color:${est.c};font-weight:600">${opEsc(est.t)}${op.puesto ? ' · ' + opEsc(op.puesto) : ''}</div>
      <div style="font-size:12px;color:#666">${lineas.join(' · ')}</div>
      ${op.nota ? `<div style="font-size:12px;color:#555;margin-top:2px">${opEsc(op.nota)}</div>` : ''}
    </div>`;
}

function renderOperarias() {
  const cont = document.getElementById('operarias-lista');
  if (!cont) return;
  const lista = operariasCache || [];
  if (!lista.length) { cont.innerHTML = '<div class="text-muted">Todavía no hay nadie. Toque «+ Agregar».</div>'; return; }
  const trabajando = lista.filter(o => o.estado === 'trabajando');
  const sinDui = trabajando.filter(o => o.dui === 'falta').map(o => o.nombre);
  let html = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <div style="flex:1;min-width:120px;background:#F4F4F2;border-radius:8px;padding:8px">
        <div style="font-size:26px;font-weight:800">${trabajando.length}</div><div style="font-size:12px">trabajando</div></div>
      <div style="flex:1;min-width:120px;background:#F4F4F2;border-radius:8px;padding:8px">
        <div style="font-size:26px;font-weight:800;color:#C0392B">${sinDui.length}</div><div style="font-size:12px">sin DUI guardado</div></div>
    </div>
    ${sinDui.length ? `<div style="font-size:12px;color:#C0392B;margin-bottom:10px">⚠ Pedir DUI a: ${sinDui.map(opEsc).join(', ')}</div>` : ''}`;
  for (const g of OP_GRUPOS) {
    const items = lista.filter(o => g.e.includes(o.estado))
      .sort((a, b) => g.e.indexOf(a.estado) - g.e.indexOf(b.estado) || String(a.fecha_prueba || a.fecha_inicio || '').localeCompare(String(b.fecha_prueba || b.fecha_inicio || '')));
    if (!items.length) continue;
    html += `<div style="font-weight:700;margin:12px 0 6px">${g.t} <span class="text-muted">(${items.length})</span></div>` + items.map(opFila).join('');
  }
  cont.innerHTML = html;
}

// ─── Ficha (agregar / editar) ─────────────────────────────────────
const OP_CAMPOS = [
  ['nombre', 'Nombre corto (el que se usa en el taller)', 'text'],
  ['nombre_completo', 'Nombre completo', 'text'],
  ['estado', 'Estado', 'estado'],
  ['puesto', 'Puesto', 'text', 'Operaria, Ayudante, Mesa de corte…'],
  ['fecha_inicio', 'Empezó a trabajar', 'date'],
  ['como_llego', '¿Cómo llegó?', 'text', 'Convocatoria Facebook, recomendación de…, llamó…'],
  ['dui', 'DUI', 'dui'],
  ['telefono', 'Teléfono', 'tel'],
  ['zona', 'De dónde es', 'text'],
  ['maquinas', 'Máquinas que maneja', 'text', 'Plana, rana, cover…'],
  ['experiencia', 'Dónde trabajó antes', 'text'],
  ['fecha_prueba', 'Día de la prueba', 'date'],
  ['fecha_salida', 'Dejó de trabajar', 'date'],
  ['nota', 'Nota', 'area'],
];

function opAbrirFicha(id) {
  const op = id ? (operariasCache || []).find(o => o.id === id) : { estado: 'trabajando', dui: 'falta' };
  if (!op) return;
  document.getElementById('op-ficha-modal')?.remove();
  const campo = ([k, label, tipo, ph]) => {
    const v = op[k] == null ? '' : op[k];
    let input;
    if (tipo === 'estado') input = `<select id="opf-${k}">${Object.entries(OP_ESTADOS).map(([e, x]) => `<option value="${e}" ${e === v ? 'selected' : ''}>${x.t}</option>`).join('')}</select>`;
    else if (tipo === 'dui') input = `<select id="opf-${k}">${Object.entries({ guardado: 'Guardado (foto en Google Fotos)', falta: 'Falta pedirlo', menor: 'Menor de edad (partida + permiso)' }).map(([e, t]) => `<option value="${e}" ${e === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    else if (tipo === 'area') input = `<textarea id="opf-${k}" rows="3" style="width:100%">${opEsc(v)}</textarea>`;
    else input = `<input id="opf-${k}" type="${tipo}" value="${opEsc(String(v).slice(0, tipo === 'date' ? 10 : 999))}" placeholder="${opEsc(ph || '')}" style="width:100%">`;
    return `<div style="margin-bottom:8px"><label style="font-size:12px;color:#666;display:block">${label}</label>${input}</div>`;
  };
  const m = document.createElement('div');
  m.id = 'op-ficha-modal';
  m.className = 'modal';
  m.style.display = 'flex';
  m.innerHTML = `
    <div class="modal-content">
      <div class="modal-header"><strong>${id ? opEsc(op.nombre) : 'Agregar persona'}</strong>
        <button class="btn btn-ghost btn-sm" onclick="opCerrarFicha()">✕</button></div>
      <div class="modal-body">${OP_CAMPOS.map(campo).join('')}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="opCerrarFicha()">Cancelar</button>
        <button class="btn btn-primary" id="opf-guardar" onclick="opGuardarFicha(${id ? `'${id}'` : 'null'})">Guardar</button>
      </div>
    </div>`;
  m.addEventListener('click', e => { if (e.target === m) opCerrarFicha(); });
  document.body.appendChild(m);
}

function opCerrarFicha() {
  document.getElementById('op-ficha-modal')?.remove();
}

async function opGuardarFicha(id) {
  const datos = {};
  for (const [k, , tipo] of OP_CAMPOS) {
    const v = (document.getElementById('opf-' + k)?.value || '').trim();
    datos[k] = v === '' ? null : v;
    if (tipo === 'dui' && !datos[k]) datos[k] = 'falta';
  }
  if (!datos.nombre) datos.nombre = (datos.nombre_completo || '').split(' ')[0] || null;
  if (!datos.nombre) { showToast('Falta el nombre', 'error'); return; }
  const btn = document.getElementById('opf-guardar');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    if (id) await supaUpdate('operaria', id, datos);
    else await supaFetch('operaria', 'POST', datos);
    opCerrarFicha();
    showToast('Guardado', 'success', 2000);
    await cargarOperarias();
  } catch (e) {
    showToast('No se pudo guardar: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

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
    await opCargarPrivado();
    renderOperarias();
    cargarPlanilla();
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
  if (op.telefono) lineas.push('📞 ' + opEsc(opTel(op.telefono)));
  else if (op.estado === 'trabajando') lineas.push('<span style="color:#B36B00">📞 falta teléfono</span>');
  const nDocs = (opDocsCache || []).filter(d => d.operaria_id === op.id).length;
  if (nDocs) lineas.push('📎 ' + nDocs + ' doc.');
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
      <div class="modal-body">${OP_CAMPOS.map(campo).join('')}${id && opPrivadoOk ? opHtmlPrivado(id) : ''}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="opCerrarFicha()">Cancelar</button>
        <button class="btn btn-primary" id="opf-guardar" onclick="opGuardarFicha(${id ? `'${id}'` : 'null'})">Guardar</button>
      </div>
    </div>`;
  m.addEventListener('click', e => { if (e.target === m) opCerrarFicha(); });
  document.body.appendChild(m);
  if (id && opPrivadoOk) opPintarDocs(id);
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
    if (id && opPrivadoOk) await opGuardarPrivado(id);
    opCerrarFicha();
    showToast('Guardado', 'success', 2000);
    await cargarOperarias();
  } catch (e) {
    showToast('No se pudo guardar: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

// ══════════════════════════════════════════════════════════════════════
// DATOS PRIVADOS, DOCUMENTOS CON FOTO, PLANILLA Y RECIBOS (solo admin)
// Tablas: operaria_privado, operaria_documento, planilla_periodo,
// planilla_linea. Fotos en el bucket privado `personal-docs` (se ven con
// enlace firmado de 1 hora). Si el usuario no es admin, nada de esto aparece.
// ══════════════════════════════════════════════════════════════════════
var opPrivadoCache = [];
var opDocsCache = [];
var opPrivadoOk = false;
const OP_DOC_TIPOS = { dui_frente: 'DUI (frente)', dui_atras: 'DUI (atrás)', nit: 'NIT', partida: 'Partida de nacimiento', permiso: 'Permiso de los papás', otro: 'Otro' };
const OP_PRIV_CAMPOS = [
  ['dui_numero', 'Número de DUI', 'text'],
  ['dui_vence', 'DUI vence', 'date'],
  ['nit', 'NIT', 'text'],
  ['fecha_nacimiento', 'Fecha de nacimiento', 'date'],
  ['direccion', 'Dirección', 'text'],
  ['sueldo_quincena', 'Sueldo por quincena ($)', 'number'],
  ['pago_dia', 'Pago por día ($), si gana por día', 'number'],
  ['pago_sabado', 'Pago por sábado ($)', 'number'],
  ['nota_pago', 'Nota de pago', 'area'],
];

function opTel(t) {
  const d = String(t || '').replace(/\D/g, '').replace(/^503/, '');
  return d.length === 8 ? d.slice(0, 4) + '-' + d.slice(4) : t;
}

async function opCargarPrivado() {
  try {
    const [priv, docs] = await Promise.all([
      supaFetch('operaria_privado', 'GET', null, '?limit=500'),
      supaFetch('operaria_documento', 'GET', null, '?order=creado_en&limit=1000'),
    ]);
    opPrivadoCache = priv || []; opDocsCache = docs || []; opPrivadoOk = true;
  } catch (e) {
    opPrivadoOk = false; opPrivadoCache = []; opDocsCache = [];
  }
}

function opHtmlPrivado(id) {
  const p = opPrivadoCache.find(x => x.operaria_id === id) || {};
  const campo = ([k, label, tipo]) => {
    const v = p[k] == null ? '' : p[k];
    const input = tipo === 'area'
      ? `<textarea id="opp-${k}" rows="2" style="width:100%">${opEsc(v)}</textarea>`
      : `<input id="opp-${k}" type="${tipo}" step="0.01" value="${opEsc(String(v).slice(0, tipo === 'date' ? 10 : 999))}" style="width:100%">`;
    return `<div style="margin-bottom:8px"><label style="font-size:12px;color:#666;display:block">${label}</label>${input}</div>`;
  };
  const hoy = new Date().toISOString().slice(0, 10);
  const en30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const venc = p.dui_vence && p.dui_vence < en30
    ? `<div style="color:#C0392B;font-size:12px;margin-bottom:6px">⚠ DUI ${p.dui_vence < hoy ? 'VENCIDO' : 'por vencer'} (${opFecha(p.dui_vence)}): pedir el renovado.</div>` : '';
  return `
    <div style="border-top:2px solid var(--borde);margin-top:10px;padding-top:8px">
      <div style="font-weight:700;margin-bottom:6px">🔒 Datos privados (solo admin)</div>
      ${venc}
      ${OP_PRIV_CAMPOS.map(campo).join('')}
      <label style="font-size:13px;display:block;margin-bottom:8px"><input type="checkbox" id="opp-trabaja_sabado" ${p.trabaja_sabado === false ? '' : 'checked'}> Viene los sábados</label>
      <div style="font-weight:700;margin:10px 0 6px">📎 Documentos</div>
      <div id="opp-docs" class="text-muted" style="font-size:12px">Cargando…</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">
        <select id="opp-doc-tipo">${Object.entries(OP_DOC_TIPOS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
        <input type="file" id="opp-doc-file" accept="image/*,application/pdf" style="max-width:100%">
        <button class="btn btn-ghost btn-sm" onclick="opSubirDoc('${id}')">Subir</button>
      </div>
    </div>`;
}

async function opGuardarPrivado(id) {
  const d = { operaria_id: id, actualizado_en: new Date().toISOString() };
  for (const [k, , tipo] of OP_PRIV_CAMPOS) {
    const v = (document.getElementById('opp-' + k)?.value || '').trim();
    d[k] = v === '' ? null : (tipo === 'number' ? Number(v) : v);
  }
  d.trabaja_sabado = !!document.getElementById('opp-trabaja_sabado')?.checked;
  const res = await fetch(`${SUPA_URL}/rest/v1/operaria_privado?on_conflict=operaria_id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${authToken() || SUPA_KEY}`, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(d),
  });
  if (!res.ok) throw new Error('datos privados: ' + (await res.text()));
  await opCargarPrivado();
}

async function opUrlFirmada(path) {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/sign/personal-docs/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${authToken() || SUPA_KEY}` },
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  return j.signedURL ? `${SUPA_URL}/storage/v1${j.signedURL}` : null;
}

async function opPintarDocs(id) {
  const cont = document.getElementById('opp-docs');
  if (!cont) return;
  const docs = opDocsCache.filter(d => d.operaria_id === id);
  if (!docs.length) { cont.innerHTML = 'Sin documentos todavía.'; return; }
  const items = await Promise.all(docs.map(async d => {
    const url = d.archivo ? await opUrlFirmada(d.archivo) : null;
    const esPdf = /\.pdf$/i.test(d.archivo || '');
    const vista = !url ? '<div style="height:90px;display:flex;align-items:center;justify-content:center;background:#eee">sin archivo</div>'
      : esPdf ? `<a href="${url}" target="_blank" style="display:flex;height:90px;align-items:center;justify-content:center;background:#eee">📄 PDF</a>`
      : `<a href="${url}" target="_blank"><img src="${url}" style="width:100%;height:90px;object-fit:cover;border-radius:4px"></a>`;
    return `<div style="width:130px;font-size:11px;color:#333">${vista}<div><strong>${opEsc(OP_DOC_TIPOS[d.tipo] || d.tipo)}</strong></div>${d.fuente ? `<div class="text-muted">${opEsc(d.fuente)}</div>` : ''}${d.nota ? `<div>${opEsc(d.nota)}</div>` : ''}</div>`;
  }));
  cont.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap">${items.join('')}</div>`;
}

async function opSubirArchivoDoc(id, tipo, blob, nombre, fuente, nota) {
  const ext = (String(nombre || '').split('.').pop() || 'jpg').toLowerCase();
  const path = `${id}/${tipo}-${Date.now()}.${ext}`;
  const res = await fetch(`${SUPA_URL}/storage/v1/object/personal-docs/${path}`, {
    method: 'POST',
    headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${authToken() || SUPA_KEY}`, 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  if (!res.ok) throw new Error(await res.text());
  const [doc] = await supaFetch('operaria_documento', 'POST', { operaria_id: id, tipo, archivo: path, fuente: fuente || 'Subido desde la app', nota: nota || null });
  opDocsCache.push(doc);
  return doc;
}

async function opSubirDoc(id) {
  const f = document.getElementById('opp-doc-file')?.files?.[0];
  if (!f) { showToast('Elija la foto o el PDF primero', 'error'); return; }
  const tipo = document.getElementById('opp-doc-tipo').value;
  try {
    await opSubirArchivoDoc(id, tipo, f, f.name);
    document.getElementById('opp-doc-file').value = '';
    showToast('Documento guardado', 'success', 2000);
    opPintarDocs(id);
  } catch (e) {
    showToast('No se pudo subir: ' + e.message, 'error');
  }
}

// ─── Planilla por quincena ─────────────────────────────────────────
var planillaCache = { periodos: [], lineas: [] };

async function cargarPlanilla() {
  const card = document.getElementById('planilla-card');
  const cont = document.getElementById('planilla-cont');
  if (!card || !cont) return;
  if (!opPrivadoOk) { card.style.display = 'none'; return; }
  card.style.display = '';
  try {
    const periodos = await supaFetch('planilla_periodo', 'GET', null, '?order=inicio.desc&limit=24');
    const ids = (periodos || []).map(p => p.id);
    const lineas = ids.length ? await supaFetch('planilla_linea', 'GET', null, `?periodo_id=in.(${ids.join(',')})&order=orden&limit=2000`) : [];
    planillaCache = { periodos: periodos || [], lineas: lineas || [] };
    renderPlanilla();
  } catch (e) {
    cont.innerHTML = '<div class="text-muted">No se pudo cargar la planilla: ' + opEsc(e.message) + '</div>';
  }
}

const PL_ESTADO = { borrador: '📝 Borrador', enviada: '📤 Mandada a Henry', pagada: '✅ Pagada' };
function plMoney(n) {
  const v = Number(n || 0);
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

function renderPlanilla() {
  const cont = document.getElementById('planilla-cont');
  if (!cont) return;
  const { periodos, lineas } = planillaCache;
  if (!periodos.length) { cont.innerHTML = '<div class="text-muted">Todavía no hay planillas.</div>'; return; }
  cont.innerHTML = periodos.map((p, i) => {
    const ls = lineas.filter(l => l.periodo_id === p.id);
    const total = ls.reduce((s, l) => s + Number(l.total || 0), 0);
    const filas = ls.map(l => `
      <tr style="border-bottom:1px solid #eee">
        <td>${opEsc(l.nombre)}${Number(l.horas_faltadas) > 0 ? `<div class="text-muted">−${+l.horas_faltadas} h</div>` : ''}</td>
        <td>${+l.dias}</td><td>${l.sabados || 0}</td><td>${plMoney(l.base)}</td><td>${plMoney(l.monto_sabados)}</td>
        <td><strong>${plMoney(l.total)}</strong></td>
        <td><button class="btn btn-ghost btn-sm" title="Recibo" onclick="plRecibos('${p.id}','${l.id}')">🧾</button></td>
      </tr>
      ${l.detalle ? `<tr><td colspan="7" style="font-size:11px;color:#666;padding:0 0 6px">${opEsc(l.detalle)}</td></tr>` : ''}`).join('');
    return `
      <details ${i === 0 ? 'open' : ''} style="border:1px solid var(--borde);border-radius:8px;padding:8px;margin-bottom:8px">
        <summary style="cursor:pointer;font-weight:700">Quincena ${opFecha(p.inicio)} al ${opFecha(p.fin)} · ${plMoney(total)} · ${PL_ESTADO[p.estado] || opEsc(p.estado)}</summary>
        <div style="overflow-x:auto;margin-top:6px">
          <table style="width:100%;font-size:12px;border-collapse:collapse">
            <tr style="text-align:left;border-bottom:1px solid var(--borde)"><th>Nombre</th><th>Días</th><th>Sáb.</th><th>Base</th><th>Sábados</th><th>Total</th><th></th></tr>
            ${filas}
            <tr><td colspan="5" style="text-align:right;font-weight:700;padding-top:6px">Total</td><td style="font-weight:800;padding-top:6px">${plMoney(total)}</td><td></td></tr>
          </table>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          <button class="btn btn-primary btn-sm" onclick="plRecibos('${p.id}')">🧾 Imprimir todos los recibos</button>
          ${p.estado !== 'pagada' ? `<button class="btn btn-ghost btn-sm" onclick="plMarcarPagada('${p.id}')">✅ Marcar pagada</button>` : ''}
        </div>
        ${p.criterio ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;font-weight:600">📏 Criterios de pago</summary><div style="white-space:pre-wrap;font-size:12px;margin-top:4px">${opEsc(p.criterio)}</div></details>` : ''}
        ${p.enviada_a || p.nota ? `<div style="font-size:11px;color:#666;margin-top:6px">${p.enviada_a ? 'Enviada a: ' + opEsc(p.enviada_a) + '. ' : ''}${opEsc(p.nota || '')}</div>` : ''}
      </details>`;
  }).join('');
}

async function plMarcarPagada(id) {
  try {
    await supaUpdate('planilla_periodo', id, { estado: 'pagada' });
    showToast('Planilla marcada como pagada', 'success', 2000);
    cargarPlanilla();
  } catch (e) { showToast('No se pudo: ' + e.message, 'error'); }
}

function plEnLetras(n) {
  const U = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
  const D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  const menos100 = x => x < 30 ? U[x] : D[Math.floor(x / 10)] + (x % 10 ? ' Y ' + U[x % 10] : '');
  const menos1000 = x => x === 100 ? 'CIEN' : (C[Math.floor(x / 100)] + (x % 100 ? ' ' + menos100(x % 100) : '')).trim();
  const ent = Math.floor(n), cts = Math.round((n - ent) * 100);
  let txt;
  if (ent === 0) txt = 'CERO';
  else if (ent < 1000) txt = menos1000(ent);
  else { const m = Math.floor(ent / 1000), r = ent % 1000; txt = (m === 1 ? 'MIL' : menos1000(m) + ' MIL') + (r ? ' ' + menos1000(r) : ''); }
  return `${txt} ${String(cts).padStart(2, '0')}/100 DÓLARES`;
}

function plRecibos(periodoId, lineaId) {
  const p = planillaCache.periodos.find(x => x.id === periodoId);
  if (!p) return;
  const ls = planillaCache.lineas.filter(l => l.periodo_id === periodoId && (!lineaId || l.id === lineaId));
  const hoy = new Date();
  const fechaHoy = `${hoy.getDate()}-${OP_MESES[hoy.getMonth()]}-${hoy.getFullYear()}`;
  const recibo = l => {
    const priv = opPrivadoCache.find(x => x.operaria_id === l.operaria_id) || {};
    const dui = priv.dui_numero || (priv.trabaja_sabado === false && !priv.dui_numero ? 'menor de edad' : '________________');
    return `
      <div class="rec">
        <div class="enc"><div><strong>CONFECCIONES IMIS</strong><br><span>Col. Santa Marta, Sonsonate</span></div><div class="tit">RECIBO DE PAGO</div></div>
        <p>Recibí de <strong>Confecciones IMIS</strong> la cantidad de <strong>${plMoney(l.total)}</strong>
        (${plEnLetras(Number(l.total))}) en efectivo, en concepto de pago de la quincena del
        <strong>${opFecha(p.inicio)}</strong> al <strong>${opFecha(p.fin)}</strong>.</p>
        <table>
          <tr><td>Días trabajados</td><td>${+l.dias}${Number(l.horas_faltadas) > 0 ? ` (menos ${+l.horas_faltadas} h)` : ''}</td><td>${plMoney(l.base)}</td></tr>
          <tr><td>Sábados</td><td>${l.sabados || 0}</td><td>${plMoney(l.monto_sabados)}</td></tr>
          <tr class="tot"><td colspan="2">TOTAL RECIBIDO</td><td>${plMoney(l.total)}</td></tr>
        </table>
        <div class="pie">
          <div>Fecha: ${fechaHoy}</div>
          <div class="firma"><div class="linea"></div>${opEsc(l.nombre)}<br>DUI: ${opEsc(dui)}</div>
        </div>
      </div>`;
  };
  const w = window.open('', '_blank');
  if (!w) { showToast('El navegador bloqueó la ventana de impresión', 'error'); return; }
  const css = `
      @page { size: letter; margin: 10mm; }
      body { font-family: Arial, sans-serif; font-size: 12px; color: #000; margin: 0; }
      .rec { height: 125mm; box-sizing: border-box; border: 1px dashed #999; padding: 8mm; margin-bottom: 4mm; page-break-inside: avoid; }
      .rec:nth-child(2n) { page-break-after: always; }
      .enc { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 8px; }
      .enc span { font-size: 10px; } .tit { font-size: 16px; font-weight: 800; }
      p { line-height: 1.5; }
      table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
      td { border-bottom: 1px solid #ccc; padding: 3px 4px; } td:last-child { text-align: right; }
      .tot td { font-weight: 800; border-top: 2px solid #000; }
      .pie { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 18mm; }
      .firma { text-align: center; width: 55%; } .linea { border-top: 1px solid #000; margin-bottom: 3px; }`;
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Recibos ' + opFecha(p.inicio) + ' al ' + opFecha(p.fin) + '</title><style>' + css + '</style></head><body>' + ls.map(recibo).join('') + '</body></html>');
  w.document.close();
  setTimeout(() => w.print(), 400);
}

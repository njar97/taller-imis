// ══════════════════════════════════════════════════════════════════════
// MATERIALES (avíos) — sub-tab de Bodega (v3.32)
// Hilo, botón, zipper, elástico, entretela: qué hay, qué pide el lote 1,
// qué está pedido al proveedor y qué falta. Stock = último CONTEO +
// COMPRA/AJUSTE − SALIDA posteriores (vista vw_material_stock).
// ══════════════════════════════════════════════════════════════════════

let matCache = {
  stock: [],            // filas de vw_material_stock
  abierto: null,        // id del material con historial desplegado
  movs: {},             // material_id → movimientos cargados
  filtroCat: '',
  soloFaltan: false,
};

const MAT_CATEGORIAS = {
  HILO: '🧵 Hilo', BOTON: '🔘 Botón', ZIPPER: '🤐 Zipper', ELASTICO: '➰ Elástico',
  ENTRETELA: '🩹 Entretela', ETIQUETA: '🏷 Etiqueta', EMPAQUE: '📦 Empaque', OTRO: '• Otro',
};
const MAT_TIPO_LBL = {
  CONTEO: '📊 Conteo', COMPRA: '🛒 Compra', SALIDA: '↗ Salida', AJUSTE: '⚖ Ajuste',
};
const MAT_TIPO_COLOR = { CONTEO: '#f80', COMPRA: '#0a7', SALIDA: '#c44', AJUSTE: '#888' };

function matEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function matNum(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? v.toLocaleString('es-SV') : v.toLocaleString('es-SV', { maximumFractionDigits: 1 });
}
function matUsuario() {
  return (typeof supaSession !== 'undefined' && supaSession && supaSession.user) ? supaSession.user.email : null;
}

async function cargarMateriales() {
  const cont = document.getElementById('bodega-contenido');
  if (cont) cont.innerHTML = '<div class="text-muted">Cargando materiales...</div>';
  try {
    matCache.stock = await supaFetch('vw_material_stock', 'GET', null,
      '?activo=eq.true&order=orden,nombre&limit=500');
    renderMateriales();
  } catch (e) {
    if (cont) cont.innerHTML = `<div class="alert alert-error">Error: ${matEsc(e.message)}</div>`;
  }
}

function renderMateriales() {
  const cont = document.getElementById('bodega-contenido');
  if (!cont) return;
  let filas = matCache.stock;
  if (matCache.filtroCat) filas = filas.filter(m => m.categoria === matCache.filtroCat);
  if (matCache.soloFaltan) filas = filas.filter(m => (Number(m.faltante) || 0) > 0);

  const totFaltan = matCache.stock.filter(m => (Number(m.faltante) || 0) > 0).length;
  const totPedidos = matCache.stock.filter(m => (Number(m.pedido) || 0) > 0).length;
  const cats = [...new Set(matCache.stock.map(m => m.categoria))];

  const barra = `
    <div style="background:white;padding:8px 10px;border-radius:8px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px">
        <span><strong>${matCache.stock.length}</strong> materiales</span>
        <span style="color:var(--naranja)"><strong>${totFaltan}</strong> con faltante</span>
        <span style="color:var(--azul)"><strong>${totPedidos}</strong> pedidos al proveedor</span>
        <label style="display:flex;align-items:center;gap:4px;margin:0 0 0 auto">
          <select onchange="matCache.filtroCat=this.value;renderMateriales()" style="padding:4px 8px;width:auto">
            <option value="">Todas</option>
            ${cats.map(c => `<option value="${c}" ${c===matCache.filtroCat?'selected':''}>${MAT_CATEGORIAS[c]||c}</option>`).join('')}
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:4px;margin:0">
          <input type="checkbox" ${matCache.soloFaltan?'checked':''} onchange="matCache.soloFaltan=this.checked;renderMateriales()" style="width:auto"> Solo faltantes
        </label>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px">
        <button class="btn btn-success btn-sm" onclick="abrirMatMov('CONTEO')" title="Anotar lo que contaste: el stock queda en ese número">📊 Conteo</button>
        <button class="btn btn-primary btn-sm" onclick="abrirMatMov('COMPRA')" title="Llegó material del proveedor">🛒 Compra recibida</button>
        <button class="btn btn-warning btn-sm" onclick="abrirMatMov('SALIDA')" title="Se sacó material para producción">↗ Salida</button>
        <button class="btn btn-ghost btn-sm" onclick="abrirMatEditar(null)" title="Agregar un material al catálogo">+ Material</button>
        <button class="btn btn-ghost btn-sm" onclick="cargarMateriales()" title="Refrescar">🔄</button>
      </div>
    </div>`;

  if (filas.length === 0) {
    cont.innerHTML = barra + '<div class="alert alert-info">Sin materiales que mostrar.</div>';
    return;
  }

  // Agrupar por categoría, respetando el orden
  const grupos = {};
  for (const m of filas) (grupos[m.categoria] ||= []).push(m);

  const html = Object.entries(grupos).map(([cat, items]) => `
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:8px">
      <div style="background:#F5F7FA;padding:8px 12px;font-weight:600">${MAT_CATEGORIAS[cat] || cat}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#FAFAFA">
            <th style="padding:6px 8px;text-align:left">Material</th>
            <th style="padding:6px 8px;text-align:right" title="Lo que hay en bodega">Hay</th>
            <th style="padding:6px 8px;text-align:right" title="Pedido al proveedor, no recibido">Pedido</th>
            <th style="padding:6px 8px;text-align:right" title="Lo que pide el lote 1 (ya con merma)">Lote 1</th>
            <th style="padding:6px 8px;text-align:right" title="Lote 1 − hay − pedido">Falta</th>
            <th style="padding:6px 4px"></th>
          </tr>
        </thead>
        <tbody>
          ${items.map(m => matFilaHtml(m)).join('')}
        </tbody>
      </table>
    </div>`).join('');

  cont.innerHTML = barra + html;
}

function matFilaHtml(m) {
  const falta = Number(m.faltante) || 0;
  const abierto = matCache.abierto === m.id;
  const fila = `
    <tr style="border-top:1px solid #EEE;cursor:pointer" onclick="matToggleHistorial('${m.id}')">
      <td style="padding:5px 8px">
        <div style="font-weight:600">${matEsc(m.nombre)}</div>
        <div style="font-size:11px;color:#666">${matEsc(m.nombre_factura || '')}${m.proveedor ? ' · ' + matEsc(m.proveedor) : ''}</div>
      </td>
      <td style="padding:5px 8px;text-align:right;font-weight:700;color:${(Number(m.stock)||0)>0?'var(--azul)':'#999'}">${matNum(m.stock)} <span style="font-weight:400;color:#888;font-size:11px">${matEsc(m.unidad)}</span></td>
      <td style="padding:5px 8px;text-align:right;color:#666">${(Number(m.pedido)||0) > 0 ? matNum(m.pedido) : '—'}</td>
      <td style="padding:5px 8px;text-align:right">${matNum(m.necesidad_lote1)}</td>
      <td style="padding:5px 8px;text-align:right;font-weight:700;color:${falta>0?'var(--naranja)':'var(--verde)'}">${falta > 0 ? matNum(falta) : '✓'}</td>
      <td style="padding:5px 4px;text-align:center;white-space:nowrap" onclick="event.stopPropagation()">
        <button class="btn-mini" onclick="abrirMatEditar('${m.id}')" title="Editar material (nombre, lote 1, pedido)">✏️</button>
      </td>
    </tr>`;
  if (!abierto) return fila;
  const movs = matCache.movs[m.id];
  const detalle = !movs
    ? '<div class="text-muted" style="padding:6px 12px">Cargando historial…</div>'
    : movs.length === 0
      ? '<div class="text-muted" style="padding:6px 12px">Sin movimientos.</div>'
      : `<table style="width:100%;border-collapse:collapse;font-size:11px">
          ${movs.map(v => `
            <tr>
              <td style="padding:3px 12px;color:#666;width:80px">${matEsc(v.fecha || '')}</td>
              <td style="padding:3px 8px;color:${MAT_TIPO_COLOR[v.tipo]||'#666'};width:90px">${MAT_TIPO_LBL[v.tipo] || v.tipo}</td>
              <td style="padding:3px 8px;text-align:right;font-weight:600;width:70px">${v.tipo==='SALIDA'?'−':''}${matNum(v.cantidad)}</td>
              <td style="padding:3px 8px;color:#666">${matEsc(v.observaciones || '')}</td>
            </tr>`).join('')}
        </table>`;
  return fila + `
    <tr><td colspan="6" style="padding:0;background:#FBFBFD;border-top:1px dashed #E5E5E5">
      <div style="display:flex;gap:6px;padding:6px 12px;flex-wrap:wrap;align-items:center">
        <span style="font-size:11px;color:#666">${m.presentacion ? 'Se compra por ' + matEsc(m.presentacion) + ' · ' : ''}${m.precio_ref ? '$' + matNum(m.precio_ref) + '/' + matEsc(m.unidad) + ' · ' : ''}último conteo ${matEsc(m.ultimo_conteo || '—')}</span>
        <span style="margin-left:auto;display:flex;gap:4px">
          <button class="btn-mini" onclick="abrirMatMov('CONTEO','${m.id}')">📊</button>
          <button class="btn-mini" onclick="abrirMatMov('COMPRA','${m.id}')">🛒</button>
          <button class="btn-mini" onclick="abrirMatMov('SALIDA','${m.id}')">↗</button>
        </span>
      </div>
      ${detalle}
    </td></tr>`;
}

async function matToggleHistorial(id) {
  matCache.abierto = matCache.abierto === id ? null : id;
  renderMateriales();
  if (matCache.abierto && !matCache.movs[id]) {
    try {
      matCache.movs[id] = await supaFetch('material_movimiento', 'GET', null,
        `?material_id=eq.${id}&select=tipo,cantidad,fecha,observaciones,creado_en&order=creado_en.desc&limit=50`);
    } catch (e) {
      matCache.movs[id] = [];
      showToast('No se pudo cargar el historial: ' + e.message, 'error');
    }
    if (matCache.abierto === id) renderMateriales();
  }
}

// ─── Modal: movimiento (conteo / compra / salida / ajuste) ──────────
function abrirMatMov(tipo, materialId) {
  const modal = document.getElementById('mat-mov-modal');
  if (!modal) return;
  const sel = document.getElementById('matmov-material');
  sel.innerHTML = '<option value="">— Elegí material —</option>' +
    matCache.stock.map(m => `<option value="${m.id}" ${m.id===materialId?'selected':''}>${matEsc(m.nombre)} (${matNum(m.stock)} ${matEsc(m.unidad)})</option>`).join('');
  document.getElementById('matmov-tipo').value = tipo || 'CONTEO';
  document.getElementById('matmov-cantidad').value = '';
  document.getElementById('matmov-fecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('matmov-obs').value = '';
  matMovTipoCambio();
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById(materialId ? 'matmov-cantidad' : 'matmov-material').focus(), 50);
}
function cerrarMatMov() { document.getElementById('mat-mov-modal').style.display = 'none'; }

function matMovTipoCambio() {
  const tipo = document.getElementById('matmov-tipo').value;
  const lbl = document.getElementById('matmov-cantidad-lbl');
  const ayuda = document.getElementById('matmov-ayuda');
  const txt = {
    CONTEO: ['Cantidad contada (total) *', 'El stock queda exactamente en este número. Lo anterior se conserva en el historial.'],
    COMPRA: ['Cantidad recibida *', 'Se suma al stock. Si estaba en «Pedido», bajá el pedido al editar el material.'],
    SALIDA: ['Cantidad que sale *', 'Se resta del stock.'],
    AJUSTE: ['Ajuste (+ o −) *', 'Corrección: positivo suma, negativo resta.'],
  }[tipo] || ['Cantidad *', ''];
  if (lbl) lbl.textContent = txt[0];
  if (ayuda) ayuda.textContent = txt[1];
}

async function guardarMatMov() {
  const material_id = document.getElementById('matmov-material').value;
  const tipo = document.getElementById('matmov-tipo').value;
  const cantidad = parseFloat(document.getElementById('matmov-cantidad').value);
  const fecha = document.getElementById('matmov-fecha').value || null;
  const obs = document.getElementById('matmov-obs').value.trim() || null;
  if (!material_id) return alert('Elegí el material');
  if (isNaN(cantidad)) return alert('Poné la cantidad');
  if (tipo !== 'AJUSTE' && cantidad < 0) return alert('La cantidad no puede ser negativa (usá Ajuste)');
  if ((tipo === 'COMPRA' || tipo === 'SALIDA') && cantidad === 0) return alert('La cantidad debe ser mayor que 0');
  const btn = document.getElementById('matmov-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando…'; }
  try {
    await supaFetch('material_movimiento', 'POST', {
      material_id, tipo, cantidad, fecha, observaciones: obs, usuario: matUsuario(),
    });
    // Una compra recibida descuenta lo pedido al proveedor
    if (tipo === 'COMPRA') {
      const m = matCache.stock.find(x => x.id === material_id);
      if (m && (Number(m.pedido) || 0) > 0) {
        await supaUpdate('material', material_id, {
          pedido: Math.max(0, (Number(m.pedido) || 0) - cantidad), actualizado_en: new Date().toISOString(),
        });
      }
    }
    delete matCache.movs[material_id];
    cerrarMatMov();
    showToast('✓ Movimiento guardado', 'success', 2500);
    await cargarMateriales();
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Guardar'; }
  }
}

// ─── Modal: material nuevo / editar ─────────────────────────────────
function abrirMatEditar(id) {
  const modal = document.getElementById('mat-edit-modal');
  if (!modal) return;
  const m = id ? matCache.stock.find(x => x.id === id) : null;
  document.getElementById('matedit-id').value = m ? m.id : '';
  document.getElementById('mat-edit-titulo').textContent = m ? '✏️ Editar material' : '+ Material nuevo';
  document.getElementById('matedit-nombre').value = m ? m.nombre : '';
  document.getElementById('matedit-factura').value = m ? (m.nombre_factura || '') : '';
  document.getElementById('matedit-categoria').value = m ? m.categoria : 'HILO';
  document.getElementById('matedit-unidad').value = m ? m.unidad : '';
  document.getElementById('matedit-presentacion').value = m ? (m.presentacion || '') : '';
  document.getElementById('matedit-proveedor').value = m ? (m.proveedor || '') : '';
  document.getElementById('matedit-precio').value = m && m.precio_ref != null ? m.precio_ref : '';
  document.getElementById('matedit-necesidad').value = m ? m.necesidad_lote1 : '';
  document.getElementById('matedit-pedido').value = m ? m.pedido : '';
  document.getElementById('matedit-obs').value = m ? (m.observaciones || '') : '';
  document.getElementById('matedit-btn-baja').style.display = m ? '' : 'none';
  modal.style.display = 'flex';
}
function cerrarMatEditar() { document.getElementById('mat-edit-modal').style.display = 'none'; }

async function guardarMatEditar() {
  const id = document.getElementById('matedit-id').value;
  const nombre = document.getElementById('matedit-nombre').value.trim();
  const unidad = document.getElementById('matedit-unidad').value.trim();
  if (!nombre) return alert('Poné el nombre');
  if (!unidad) return alert('Poné la unidad (cono, gruesa, yd, rollo…)');
  const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const data = {
    nombre,
    nombre_factura: document.getElementById('matedit-factura').value.trim() || null,
    categoria: document.getElementById('matedit-categoria').value,
    unidad,
    presentacion: document.getElementById('matedit-presentacion').value.trim() || null,
    proveedor: document.getElementById('matedit-proveedor').value.trim() || null,
    precio_ref: num(document.getElementById('matedit-precio').value),
    necesidad_lote1: num(document.getElementById('matedit-necesidad').value) ?? 0,
    pedido: num(document.getElementById('matedit-pedido').value) ?? 0,
    observaciones: document.getElementById('matedit-obs').value.trim() || null,
    actualizado_en: new Date().toISOString(),
  };
  try {
    if (id) {
      await supaUpdate('material', id, data);
    } else {
      data.codigo = nombre.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || ('MAT_' + Date.now());
      data.orden = 100 + matCache.stock.length;
      await supaFetch('material', 'POST', data);
    }
    cerrarMatEditar();
    await cargarMateriales();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

async function darBajaMaterial() {
  const id = document.getElementById('matedit-id').value;
  if (!id) return;
  if (!confirm('¿Ocultar este material de la lista? El historial se conserva.')) return;
  try {
    await supaUpdate('material', id, { activo: false, actualizado_en: new Date().toISOString() });
    cerrarMatEditar();
    await cargarMateriales();
  } catch (e) { alert('Error: ' + e.message); }
}

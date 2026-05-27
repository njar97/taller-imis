// ══════════════════════════════════════════════════════════════════════
function initConfig() {
  document.getElementById('cfg-url').value = SUPA_URL;
  document.getElementById('cfg-key').value = SUPA_KEY;
  document.getElementById('cfg-url-display').textContent = SUPA_URL;
  // Estado de features
  const f2 = document.getElementById('cfg-fase2');
  const f3 = document.getElementById('cfg-fase3');
  if (f2) f2.checked = FASE2_ACTIVA;
  if (f3) { f3.checked = FASE3_ACTIVA; f3.disabled = !FASE2_ACTIVA; }
  // Mostrar cards de admin solo si admin (reusa role cacheado por initAuditRoleTab)
  const rol = (typeof auditCache !== 'undefined' && auditCache.rolDelUser) || null;
  const isAdmin = (rol === 'admin');
  const cardInv = document.getElementById('cfg-invitar-card');
  if (cardInv) cardInv.style.display = isAdmin ? '' : 'none';
  const cardUsr = document.getElementById('cfg-usuarios-card');
  if (cardUsr) cardUsr.style.display = isAdmin ? '' : 'none';
  const cardBack = document.getElementById('cfg-backups-card');
  if (cardBack) cardBack.style.display = isAdmin ? '' : 'none';
  const btnAudit = document.getElementById('cfg-acceso-audit');
  if (btnAudit) btnAudit.style.display = isAdmin ? '' : 'none';
  if (isAdmin) {
    cargarUsuarios();
    cargarListaBackups();
  }
}

// ─── Backups automáticos ──────────────────────────────────────────────
async function ejecutarBackupAhora() {
  if (!confirm('¿Ejecutar backup ahora?\n\nVa a tomar un snapshot de todas las tablas y subirlo al bucket.')) return;
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/rpc/trigger_backup`, {
      method: 'POST',
      headers: {
        'Content-Type':'application/json',
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${supaSession?.access_token || SUPA_KEY}`,
      },
      body: '{}',
    });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    alert('✓ Backup iniciado. Se va a ver en la lista en unos segundos.\n\nrequest_id: ' + (r?.request_id || '?'));
    // Esperar 5s y refrescar lista
    setTimeout(cargarListaBackups, 5000);
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

async function cargarListaBackups() {
  const cont = document.getElementById('cfg-backups-lista');
  if (!cont) return;
  cont.innerHTML = '<div class="text-muted" style="font-size:12px">Cargando...</div>';
  try {
    const tok = supaSession?.access_token || SUPA_KEY;
    // Listar via storage API (POST /list)
    const res = await fetch(`${SUPA_URL}/storage/v1/object/list/backups`, {
      method: 'POST',
      headers: {
        'Content-Type':'application/json',
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${tok}`,
      },
      body: JSON.stringify({ limit: 20, sortBy: { column: 'created_at', order: 'desc' } }),
    });
    if (!res.ok) throw new Error(await res.text());
    const files = await res.json();
    if (!Array.isArray(files) || files.length === 0) {
      cont.innerHTML = '<div class="alert alert-info">Sin backups todavía. Tocá "Ejecutar backup ahora" para hacer el primero.</div>';
      return;
    }
    cont.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#FAFAFA">
          <th style="padding:6px 8px;text-align:left">Archivo</th>
          <th style="padding:6px 8px;text-align:right">Tamaño</th>
          <th style="padding:6px 8px;text-align:left">Fecha</th>
          <th style="padding:6px 8px"></th>
        </tr></thead>
        <tbody>
          ${files.map(f => {
            const size = f.metadata?.size || 0;
            const sizeLbl = size > 1024*1024
              ? (size/1024/1024).toFixed(2) + ' MB'
              : (size/1024).toFixed(1) + ' KB';
            const fechaLbl = f.created_at
              ? new Date(f.created_at).toLocaleString('es-SV', { dateStyle:'medium', timeStyle:'short' })
              : '—';
            return `
              <tr style="border-top:1px solid #EEE">
                <td style="padding:6px 8px;font-family:monospace;font-size:11px">${f.name}</td>
                <td style="padding:6px 8px;text-align:right;color:#666">${sizeLbl}</td>
                <td style="padding:6px 8px">${fechaLbl}</td>
                <td style="padding:6px 8px;text-align:right">
                  <button class="btn-mini btn-mini-primary" onclick="descargarBackup('${f.name.replace(/'/g,"\\'")}')">↓ Descargar</button>
                  <button class="btn-mini" onclick="borrarBackup('${f.name.replace(/'/g,"\\'")}')">🗑</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch(e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

async function descargarBackup(name) {
  try {
    const tok = supaSession?.access_token || SUPA_KEY;
    const res = await fetch(`${SUPA_URL}/storage/v1/object/backups/${encodeURIComponent(name)}`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${tok}` },
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

async function borrarBackup(name) {
  if (!confirm(`¿Borrar "${name}"?\n\nNo se puede deshacer.`)) return;
  try {
    const tok = supaSession?.access_token || SUPA_KEY;
    const res = await fetch(`${SUPA_URL}/storage/v1/object/backups/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${tok}` },
    });
    if (!res.ok) throw new Error(await res.text());
    cargarListaBackups();
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

// Accesos rápidos a sub-tabs que vivían en Producción.
// Navega a Producción y activa la sub-tab correspondiente.
function abrirCatalogoOperarias() {
  switchTab('produccion');
  if (typeof switchSubProd === 'function') setTimeout(() => switchSubProd('operarias'), 50);
}
function abrirCatalogoGrupos() {
  switchTab('produccion');
  if (typeof switchSubProd === 'function') setTimeout(() => switchSubProd('grupos'), 50);
}

// ─── Catálogo de grados ────────────────────────────────────────────
let gradosCatalogoCache = [];
function abrirCatalogoGrados() {
  document.getElementById('cfg-grados-card').style.display = '';
  cargarGradosCatalogo();
}
async function cargarGradosCatalogo() {
  const cont = document.getElementById('cfg-grados-lista');
  if (!cont) return;
  cont.innerHTML = '<div class="loading">Cargando...</div>';
  try {
    gradosCatalogoCache = await supaFetchAll('grado_catalogo',
      '?select=grado,nivel,ciclo,orden,activo&order=nivel,ciclo,orden,grado');
    renderGradosCatalogo();
  } catch (e) { cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`; }
}
function renderGradosCatalogo() {
  const cont = document.getElementById('cfg-grados-lista');
  if (!cont) return;
  const filas = gradosCatalogoCache.map(g => `
    <tr style="border-top:1px solid #EEE;${g.activo?'':'opacity:0.5;background:#F5F5F5'}">
      <td style="padding:4px 8px;font-weight:600;font-family:monospace">${g.grado}</td>
      <td style="padding:4px 8px"><span class="badge" style="background:${g.nivel==='PARV'?'#E8F4FD':g.nivel==='BASICA'?'#E8F8E8':g.nivel==='BACH'?'#FDF4E8':'#EEE'};padding:2px 6px;border-radius:4px;font-size:11px">${g.nivel}</span></td>
      <td style="padding:4px 8px;text-align:center;font-weight:600">${g.ciclo}</td>
      <td style="padding:4px 8px;text-align:right">
        <button class="btn-mini" onclick="editarGrado('${g.grado.replace(/'/g,"\\'")}')">✏</button>
      </td>
    </tr>
  `).join('');
  cont.innerHTML = `
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:380px">
      <thead><tr style="background:#FAFAFA">
        <th style="padding:6px 8px;text-align:left">Grado</th>
        <th style="padding:6px 8px;text-align:left">Nivel</th>
        <th style="padding:6px 8px;text-align:center">Ciclo</th>
        <th></th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    <div style="font-size:11px;color:#888;margin-top:6px">${gradosCatalogoCache.length} grados en el catálogo.</div>
  `;
}
function nuevoGrado() { editarGrado(null); }
function editarGrado(grado) {
  document.getElementById('grado-edit-titulo').textContent = grado ? `Editar grado ${grado}` : 'Nuevo grado';
  document.getElementById('grad-orig').value = grado || '';
  if (grado) {
    const g = gradosCatalogoCache.find(x => x.grado === grado);
    if (!g) return alert('Grado no encontrado');
    document.getElementById('grad-codigo').value = g.grado;
    document.getElementById('grad-nivel').value = g.nivel;
    document.getElementById('grad-ciclo').value = String(g.ciclo);
    document.getElementById('grad-activo').checked = !!g.activo;
  } else {
    document.getElementById('grad-codigo').value = '';
    document.getElementById('grad-nivel').value = 'BASICA';
    document.getElementById('grad-ciclo').value = '1';
    document.getElementById('grad-activo').checked = true;
  }
  document.getElementById('grado-edit-modal').style.display = 'flex';
}
function cerrarGradoEdit() {
  document.getElementById('grado-edit-modal').style.display = 'none';
  // Si había callback pendiente del flujo de alumno, llamarlo con null
  if (typeof window._gradoPendienteCallback === 'function') {
    try { window._gradoPendienteCallback(null); } catch (_) {}
    window._gradoPendienteCallback = null;
  }
}
async function guardarGradoEdit() {
  const orig = document.getElementById('grad-orig').value;
  const codigo = document.getElementById('grad-codigo').value.trim();
  if (!codigo) return alert('El código del grado es obligatorio');
  const payload = {
    grado: codigo,
    nivel: document.getElementById('grad-nivel').value,
    ciclo: parseInt(document.getElementById('grad-ciclo').value, 10) || 0,
    activo: document.getElementById('grad-activo').checked,
    actualizado_en: new Date().toISOString(),
  };
  try {
    if (!orig) {
      // Nuevo
      await supaFetch('grado_catalogo', 'POST', payload);
    } else if (orig === codigo) {
      // Update
      const tok = (typeof authToken === 'function' ? authToken() : null) || SUPA_KEY;
      const res = await fetch(`${SUPA_URL}/rest/v1/grado_catalogo?grado=eq.${encodeURIComponent(orig)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${tok}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
    } else {
      // Renombrar (delete + insert para no romper FK si hubiera)
      await supaFetch('grado_catalogo', 'POST', payload);
      const tok = (typeof authToken === 'function' ? authToken() : null) || SUPA_KEY;
      await fetch(`${SUPA_URL}/rest/v1/grado_catalogo?grado=eq.${encodeURIComponent(orig)}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${tok}` },
      });
    }
    cerrarGradoEdit();
    // Si vino del flujo de alumno (callback pendiente), notificar
    if (typeof window._gradoPendienteCallback === 'function') {
      try { window._gradoPendienteCallback({ grado: codigo, nivel: payload.nivel, ciclo: payload.ciclo, activo: payload.activo }); }
      catch (_) { /* ignore */ }
    } else {
      // Caso normal: estamos en Config gestionando el catálogo
      await cargarGradosCatalogo();
    }
  } catch (e) { alert('Error al guardar: ' + e.message); }
}

// ─── Backup / Exportar a Excel ─────────────────────────────────────
// Lazy-load de SheetJS (xlsx) — solo se descarga cuando el user toca
// el botón. Reusa la misma estrategia que html2pdf.
function cargarSheetJS() {
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  if (window._sheetjsPromise) return window._sheetjsPromise;
  window._sheetjsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar SheetJS (verificá conexión).'));
    document.head.appendChild(s);
  });
  return window._sheetjsPromise;
}

// Tablas a incluir en el backup, con la query (puede traer joins).
const BACKUP_TABLAS = [
  { nombre: 'alumno',             query: '?select=*&order=nombre&limit=10000' },
  { nombre: 'escuela',            query: '?select=*&order=alias' },
  { nombre: 'contrato_escuela',   query: '?select=*&order=anio.desc,escuela_id' },
  { nombre: 'temporada',          query: '?select=*&order=anio.desc' },
  { nombre: 'grado_catalogo',     query: '?select=*&order=nivel,ciclo,grado' },
  { nombre: 'prenda',             query: '?select=*&order=codigo' },
  { nombre: 'talla',              query: '?select=*&limit=5000' },
  { nombre: 'bodega_movimiento',  query: '?select=*&order=fecha.desc&limit=10000' },
  { nombre: 'pedido',             query: '?select=*&limit=10000' },
  { nombre: 'produccion_bulto',   query: '?select=*&order=creado_en.desc&limit=2000' },
  { nombre: 'trazo',              query: '?select=*&order=fecha.desc&limit=2000' },
  { nombre: 'grupo_produccion',   query: '?select=*' },
  { nombre: 'operaria',           query: '?select=*&order=nombre' },
];

// ─── Gestor de grupos de escuelas (asigna escuela.grupo_produccion) ───
// Lista las escuelas activas agrupadas por su grupo actual, con un input
// editable inline por escuela. Al cambiar el valor (onchange) persiste y
// muestra feedback verde breve. Datalist sugiere grupos ya usados.
async function cargarGruposEscuelas() {
  const cont = document.getElementById('cfg-grupos-escuelas-lista');
  if (!cont) return;
  cont.innerHTML = '<div class="text-muted" style="font-size:12px;padding:6px">Cargando escuelas…</div>';
  try {
    const escuelas = await supaFetch('escuela', 'GET', null,
      '?activa=eq.true&select=id,nombre,alias,codigo_cde,grupo_produccion&order=alias.asc&limit=500');

    // Datalist con grupos existentes (para autocompletar)
    const gruposExistentes = [...new Set(
      escuelas.map(e => e.grupo_produccion).filter(Boolean)
    )].sort();

    // Agrupar visualmente por grupo actual
    const groupMap = new Map();
    for (const e of escuelas) {
      const g = e.grupo_produccion || '__SIN_GRUPO__';
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g).push(e);
    }
    const gruposOrden = [...groupMap.keys()].filter(g => g !== '__SIN_GRUPO__').sort();
    if (groupMap.has('__SIN_GRUPO__')) gruposOrden.push('__SIN_GRUPO__');

    const datalistHtml = `<datalist id="grupos-esc-datalist">${
      gruposExistentes.map(g => `<option value="${g.replace(/"/g, '&quot;')}">`).join('')
    }</datalist>`;

    const escItemHtml = (e) => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid #EEE">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.alias || e.nombre}</div>
          <div style="font-size:10px;color:#888">${e.codigo_cde || '—'}</div>
        </div>
        <input type="text" id="ge-input-${e.id}" value="${(e.grupo_produccion||'').replace(/"/g,'&quot;')}"
          list="grupos-esc-datalist" placeholder="Sin grupo"
          style="padding:5px 8px;width:110px;font-size:12px;border:1px solid #CCC;border-radius:6px"
          onchange="guardarGrupoEscuelaConfig('${e.id}', this.value)">
      </div>
    `;

    const gruposHtml = gruposOrden.map(g => {
      const nombre = g === '__SIN_GRUPO__'
        ? '<span style="color:#888">⚪ Sin grupo</span>'
        : `<span style="color:#1F4E79">📦 ${g}</span>`;
      const items = groupMap.get(g);
      return `
        <div style="margin-top:8px;padding:6px 8px;background:#F5F7FA;border-radius:6px">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">${nombre} <span style="color:#888;font-weight:400;font-size:11px">(${items.length})</span></div>
          ${items.map(escItemHtml).join('')}
        </div>
      `;
    }).join('');

    cont.innerHTML = datalistHtml + gruposHtml +
      `<div style="margin-top:8px;font-size:11px;color:#888">
        💡 El campo guarda al perder el foco (tocá afuera del input). Borde verde = guardado OK.
      </div>`;
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

async function guardarGrupoEscuelaConfig(escuelaId, valor) {
  const grupo = String(valor || '').trim() || null;
  const inp = document.getElementById('ge-input-' + escuelaId);
  try {
    await supaUpdate('escuela', escuelaId, { grupo_produccion: grupo });
    // Invalida caches dependientes para que la pestaña Tallas tome el cambio
    if (typeof tiCacheClearAll === 'function') tiCacheClearAll();
    if (typeof invalidarCache === 'function') invalidarCache('escuelas');
    // Visual: borde verde temporal
    if (inp) {
      inp.style.borderColor = 'var(--verde)';
      inp.style.background = '#E8F5E9';
      setTimeout(() => {
        if (inp) {
          inp.style.borderColor = '#CCC';
          inp.style.background = 'white';
        }
      }, 1200);
    }
  } catch (e) {
    if (inp) { inp.style.borderColor = 'var(--rojo)'; inp.style.background = '#FDEAEA'; }
    alert('Error al guardar grupo: ' + (e && e.message || e));
  }
}

async function descargarBackupExcel() {
  const btn = document.getElementById('btn-backup-excel');
  const status = document.getElementById('backup-status');
  const setStatus = (s) => { if (status) status.textContent = s; };
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando…'; }
  try {
    setStatus('Cargando librería Excel…');
    await cargarSheetJS();

    setStatus('Descargando datos de Supabase…');
    // Fetch todas las tablas en paralelo
    const resultados = await Promise.all(BACKUP_TABLAS.map(async (t) => {
      try {
        const data = await supaFetchAll(t.nombre, t.query);
        return { nombre: t.nombre, data, ok: true };
      } catch (e) {
        return { nombre: t.nombre, data: [{ error: e.message }], ok: false };
      }
    }));

    setStatus('Armando archivo Excel…');
    const wb = XLSX.utils.book_new();
    let totalRows = 0;
    for (const r of resultados) {
      const rows = Array.isArray(r.data) ? r.data : [];
      totalRows += rows.length;
      // Para hojas vacías, agregar fila de placeholder con headers conocidos
      const ws = rows.length > 0
        ? XLSX.utils.json_to_sheet(rows)
        : XLSX.utils.aoa_to_sheet([['(sin datos)']]);
      // Nombre de hoja max 31 chars
      const sheetName = (r.ok ? '' : '⚠️ ') + r.nombre.slice(0, 30);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    // Hoja de metadata
    const meta = [
      ['Backup taller-imis'],
      ['Generado', new Date().toISOString()],
      ['Total filas', totalRows],
      [],
      ['Tabla', 'Filas', 'Estado'],
      ...resultados.map(r => [r.nombre, Array.isArray(r.data) ? r.data.length : 0, r.ok ? 'OK' : 'ERROR']),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), '_meta');

    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `taller-imis-backup-${fecha}.xlsx`);
    setStatus(`✓ Descargado · ${totalRows.toLocaleString()} filas en ${resultados.length} hojas.`);
  } catch (e) {
    setStatus('❌ ' + e.message);
    alert('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📥 Descargar respaldo (Excel)'; }
  }
}

async function aplicarCatalogoAExistentes() {
  if (!confirm('Esto va a actualizar el nivel/ciclo de TODOS los alumnos según el catálogo actual. Es seguro (no borra ni cambia tallas). ¿Continuar?')) return;
  try {
    const sql = `
      UPDATE public.alumno a
      SET nivel = g.nivel, ciclo = g.ciclo, actualizado_en = now()
      FROM public.grado_catalogo g
      WHERE a.grado = g.grado
        AND (a.nivel IS DISTINCT FROM g.nivel OR a.ciclo IS DISTINCT FROM g.ciclo);
      SELECT (SELECT count(*) FROM public.alumno a JOIN public.grado_catalogo g ON g.grado = a.grado
         WHERE a.nivel = g.nivel AND a.ciclo = g.ciclo) AS alineados;
    `;
    const tok = (typeof authToken === 'function' ? authToken() : null) || SUPA_KEY;
    const res = await fetch(`${SUPA_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${tok}` },
      body: JSON.stringify({ sql }),
    });
    if (!res.ok) throw new Error(await res.text());
    alert('✓ Catálogo aplicado a todos los alumnos.');
  } catch (e) { alert('Error: ' + e.message); }
}

// ── Gestión de usuarios ────────────────────────────────────────────
async function callUsersAdmin(body) {
  if (!supaSession || !supaSession.access_token) {
    throw new Error('Sin sesión válida. Volvé a loguearte.');
  }
  const res = await fetch(`${SUPA_URL}/functions/v1/users-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${supaSession.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function cargarUsuarios() {
  const cont = document.getElementById('cfg-usuarios-lista');
  const alertEl = document.getElementById('cfg-usuarios-alert');
  cont.innerHTML = '<div class="text-muted" style="padding:6px">Cargando...</div>';
  alertEl.innerHTML = '';
  try {
    const { users } = await callUsersAdmin({ action: 'list' });
    renderUsuarios(users || []);
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

function renderUsuarios(users) {
  const cont = document.getElementById('cfg-usuarios-lista');
  if (!users.length) {
    cont.innerHTML = '<div class="text-muted" style="padding:6px">No hay usuarios.</div>';
    return;
  }
  const rows = users.map(u => {
    const created = u.created_at ? new Date(u.created_at).toISOString().slice(0,10) : '—';
    const lastLogin = u.last_sign_in_at
      ? new Date(u.last_sign_in_at).toISOString().slice(0,16).replace('T',' ')
      : '—';
    const role = u.role || 'sin role';
    const selfBadge = u.is_self ? ' <span style="background:var(--ambar-claro);color:#856404;padding:1px 5px;border-radius:3px;font-size:10px">vos</span>' : '';
    const disableDel = u.is_self ? 'disabled title="No podés eliminarte a vos mismo"' : '';
    const selectHtml = `
      <select onchange="cambiarRolUsuario('${u.id}', this.value, '${u.email.replace(/'/g,"&#39;")}')" style="padding:4px 6px;font-size:12px;border-radius:4px;border:1px solid var(--borde)">
        <option value="operador" ${role==='operador'?'selected':''}>operador</option>
        <option value="admin" ${role==='admin'?'selected':''}>admin</option>
      </select>`;
    return `
      <tr>
        <td style="font-size:12px;padding:6px 4px;word-break:break-all">${escapeHtmlSafe(u.email||'')}${selfBadge}</td>
        <td style="font-size:11px;padding:6px 4px;color:#666;white-space:nowrap">${lastLogin}</td>
        <td style="padding:6px 4px">${selectHtml}</td>
        <td style="padding:6px 4px"><button class="btn-mini btn-mini-danger" onclick="eliminarUsuario('${u.id}', '${u.email.replace(/'/g,"&#39;")}')" ${disableDel}>🗑</button></td>
      </tr>
    `;
  }).join('');
  cont.innerHTML = `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead style="background:var(--gris)">
          <tr>
            <th style="text-align:left;padding:6px 4px;font-size:11px;color:#555;text-transform:uppercase">Email</th>
            <th style="text-align:left;padding:6px 4px;font-size:11px;color:#555;text-transform:uppercase">Último login</th>
            <th style="text-align:left;padding:6px 4px;font-size:11px;color:#555;text-transform:uppercase">Rol</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function escapeHtmlSafe(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

async function cambiarRolUsuario(userId, newRole, email) {
  const alertEl = document.getElementById('cfg-usuarios-alert');
  alertEl.innerHTML = '';
  try {
    await callUsersAdmin({ action: 'set-role', user_id: userId, role: newRole });
    alertEl.innerHTML = `<div class="alert alert-success">${email} → ${newRole}</div>`;
    setTimeout(() => { alertEl.innerHTML = ''; }, 3000);
  } catch (e) {
    alertEl.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    cargarUsuarios();  // recargar para mostrar el role real
  }
}

async function eliminarUsuario(userId, email) {
  if (!confirm(`¿Eliminar a ${email}? Esta acción no se puede deshacer.`)) return;
  const alertEl = document.getElementById('cfg-usuarios-alert');
  alertEl.innerHTML = '';
  try {
    await callUsersAdmin({ action: 'delete', user_id: userId });
    alertEl.innerHTML = `<div class="alert alert-success">${email} eliminado.</div>`;
    cargarUsuarios();
  } catch (e) {
    alertEl.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

async function invitarUsuario() {
  const emailEl = document.getElementById('cfg-inv-email');
  const roleEl = document.getElementById('cfg-inv-role');
  const alertEl = document.getElementById('cfg-inv-alert');
  const email = emailEl.value.trim().toLowerCase();
  const role = roleEl.value;
  alertEl.innerHTML = '';
  if (!email) {
    alertEl.innerHTML = '<div class="alert alert-error">Ingresá un email.</div>';
    return;
  }
  if (!supaSession || !supaSession.access_token) {
    alertEl.innerHTML = '<div class="alert alert-error">Sin sesión válida. Volvé a loguearte.</div>';
    return;
  }
  const btn = alertEl.parentElement.querySelector('button.btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  try {
    const redirectTo = window.location.origin + window.location.pathname;
    const res = await fetch(`${SUPA_URL}/functions/v1/invite-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${supaSession.access_token}`,
      },
      body: JSON.stringify({ email, role, redirectTo }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const warn = data.warning ? `<br><small>${data.warning}</small>` : '';
    alertEl.innerHTML = `<div class="alert alert-success">Invitación enviada a <strong>${email}</strong> (${role}).${warn}</div>`;
    emailEl.value = '';
    roleEl.value = 'operador';
  } catch (e) {
    alertEl.innerHTML = `<div class="alert alert-error">${e.message || 'Error al invitar'}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar invitación'; }
  }
}

function toggleFase(n, activar) {
  if (n === 2) {
    FASE2_ACTIVA = activar;
    localStorage.setItem('fase2_activa', String(activar));
    // Si desactivo Fase 2, también desactivo Fase 3
    if (!activar) {
      FASE3_ACTIVA = false;
      localStorage.setItem('fase3_activa', 'false');
      const f3 = document.getElementById('cfg-fase3');
      if (f3) { f3.checked = false; f3.disabled = true; }
    } else {
      const f3 = document.getElementById('cfg-fase3');
      if (f3) f3.disabled = false;
    }
  } else if (n === 3) {
    if (!FASE2_ACTIVA) {
      alert('Primero activá la Fase 2.');
      document.getElementById('cfg-fase3').checked = false;
      return;
    }
    FASE3_ACTIVA = activar;
    localStorage.setItem('fase3_activa', String(activar));
  }
  // Confirmación visual simple
  console.log(`Fase ${n} ${activar?'activada':'desactivada'}`);
}

function guardarConfig() {
  SUPA_URL = document.getElementById('cfg-url').value.trim();
  SUPA_KEY = document.getElementById('cfg-key').value.trim();
  localStorage.setItem('supa_url', SUPA_URL);
  localStorage.setItem('supa_key', SUPA_KEY);
  document.getElementById('cfg-url-display').textContent = SUPA_URL;
  alert('Config guardada');
}

async function verificarConexion() {
  const badge = document.getElementById('cfg-estado');
  badge.textContent = 'Verificando...';
  badge.className = 'badge';
  try {
    await supaFetch('trazo','GET',null,'?limit=1');
    badge.textContent = 'Conectado ✓';
    badge.className = 'badge badge-ok';
  } catch(e) {
    badge.textContent = 'Error';
    badge.className = 'badge badge-err';
  }
}


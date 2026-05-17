// ══════════════════════════════════════════════════════════════════════
// AUDITORÍA — visor del audit log (tabla public.app_audit)
// ══════════════════════════════════════════════════════════════════════
// Listado paginado con filtros (tabla, fecha desde/hasta) + modal de
// detalle con row_before/row_after/changed_cols.
//
// Solo visible para admin. El tab del nav se oculta para operador (ver
// initAuditRoleTab abajo, llamado al bootear desde core.js).
// El SELECT sobre app_audit está protegido por RLS (admin-only) — un
// operador que llegue acá igual recibe [] del backend.
// ══════════════════════════════════════════════════════════════════════

let auditCache = {
  filas: [],
  porId: {},
  rolDelUser: null, // 'admin' | 'operador' | null
};

const AUDIT_LIMIT = 200;

async function initAuditoria() {
  document.getElementById('audit-meta').textContent = 'Cargando...';
  await cargarAuditoria();
}

async function cargarAuditoria() {
  const tabla = document.getElementById('audit-f-tabla').value;
  const desde = document.getElementById('audit-f-desde').value;
  const hasta = document.getElementById('audit-f-hasta').value;

  const params = ['select=*', `order=happened_at.desc`, `limit=${AUDIT_LIMIT}`];
  if (tabla) params.push(`table_name=eq.${encodeURIComponent(tabla)}`);
  if (desde) params.push(`happened_at=gte.${desde}`);
  if (hasta) params.push(`happened_at=lte.${hasta}T23:59:59`);

  const cont = document.getElementById('audit-lista');
  cont.innerHTML = '<div class="text-muted" style="padding:12px">Cargando registros...</div>';

  try {
    const filas = await supaFetch('app_audit', 'GET', null, '?' + params.join('&'));
    auditCache.filas = filas;
    auditCache.porId = {};
    for (const f of filas) auditCache.porId[f.id] = f;
    renderAuditoria();
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
    document.getElementById('audit-meta').textContent = '';
  }
}

function limpiarFiltrosAuditoria() {
  document.getElementById('audit-f-tabla').value = '';
  document.getElementById('audit-f-desde').value = '';
  document.getElementById('audit-f-hasta').value = '';
  cargarAuditoria();
}

function renderAuditoria() {
  const filas = auditCache.filas;
  const meta = document.getElementById('audit-meta');
  const cont = document.getElementById('audit-lista');

  if (filas.length === 0) {
    cont.innerHTML = '<div class="alert alert-info">Sin registros para esos filtros.</div>';
    meta.textContent = '0 registros';
    return;
  }

  meta.textContent = `${filas.length} registros${filas.length >= AUDIT_LIMIT ? ` (límite ${AUDIT_LIMIT}, refiná filtros para ver más)` : ''}`;

  const rows = filas.map(f => {
    const fecha = formatFechaAudit(f.happened_at);
    const actor = f.actor_email || '(sistema)';
    const op = opBadge(f.op);
    const cols = (f.changed_cols && f.changed_cols.length)
      ? f.changed_cols.slice(0, 4).join(', ') + (f.changed_cols.length > 4 ? ` +${f.changed_cols.length - 4}` : '')
      : '<span style="color:#999">—</span>';
    const pk = f.row_pk ? `<code style="font-size:11px">${shortPk(f.row_pk)}</code>` : '<span style="color:#999">—</span>';
    return `
      <tr>
        <td style="font-size:12px;white-space:nowrap">${fecha}</td>
        <td style="font-size:12px">${escapeHtml(actor)}</td>
        <td style="font-size:12px"><strong>${escapeHtml(f.table_name)}</strong></td>
        <td>${op}</td>
        <td>${pk}</td>
        <td style="font-size:11px;color:#555">${cols}</td>
        <td><button class="btn-mini btn-mini-primary" onclick="verDetalleAudit(${f.id})">ver</button></td>
      </tr>
    `;
  }).join('');

  cont.innerHTML = `
    <div class="card" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead style="background:var(--gris)">
          <tr>
            <th style="text-align:left;padding:8px;font-size:11px;text-transform:uppercase;color:#555">Cuando</th>
            <th style="text-align:left;padding:8px;font-size:11px;text-transform:uppercase;color:#555">Quien</th>
            <th style="text-align:left;padding:8px;font-size:11px;text-transform:uppercase;color:#555">Tabla</th>
            <th style="text-align:left;padding:8px;font-size:11px;text-transform:uppercase;color:#555">Op</th>
            <th style="text-align:left;padding:8px;font-size:11px;text-transform:uppercase;color:#555">PK</th>
            <th style="text-align:left;padding:8px;font-size:11px;text-transform:uppercase;color:#555">Columnas</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function opBadge(op) {
  const colors = {
    INSERT: 'background:var(--verde-claro);color:#155724',
    UPDATE: 'background:var(--azul-claro);color:#0C5460',
    DELETE: 'background:var(--rojo-claro);color:#721C24'
  };
  const style = colors[op] || 'background:var(--gris)';
  return `<span style="${style};padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700">${op}</span>`;
}

function shortPk(pk) {
  if (!pk) return '';
  // UUIDs son largos; mostramos los primeros 8 chars con tooltip
  if (pk.length > 12) return `<span title="${escapeHtml(pk)}">${pk.slice(0, 8)}…</span>`;
  return escapeHtml(pk);
}

function formatFechaAudit(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function verDetalleAudit(id) {
  const f = auditCache.porId[id];
  if (!f) return;
  document.getElementById('audit-detalle-titulo').textContent =
    `${f.table_name} · ${f.op}`;
  document.getElementById('audit-detalle-subt').textContent =
    `${formatFechaAudit(f.happened_at)} · ${f.actor_email || '(sistema)'}${f.actor_role ? ` (${f.actor_role})` : ''} · pk=${f.row_pk || '—'}`;

  const body = document.getElementById('audit-detalle-body');

  let html = '';
  if (f.changed_cols && f.changed_cols.length) {
    html += `<div style="margin-bottom:12px">
      <div style="font-size:11px;text-transform:uppercase;color:#555;font-weight:600;margin-bottom:4px">Columnas modificadas</div>
      <div>${f.changed_cols.map(c => `<code style="background:var(--amarillo);padding:2px 6px;border-radius:4px;margin-right:4px;font-size:11px">${escapeHtml(c)}</code>`).join('')}</div>
    </div>`;
  }

  // Antes y después en columnas (si caben) o apilados
  if (f.op === 'UPDATE') {
    html += `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <div style="font-size:11px;text-transform:uppercase;color:#555;font-weight:600;margin-bottom:4px">Antes</div>
          ${jsonBox(f.row_before, f.changed_cols, 'before')}
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;color:#555;font-weight:600;margin-bottom:4px">Después</div>
          ${jsonBox(f.row_after, f.changed_cols, 'after')}
        </div>
      </div>
    `;
  } else if (f.op === 'INSERT') {
    html += `<div style="font-size:11px;text-transform:uppercase;color:#555;font-weight:600;margin-bottom:4px">Fila creada</div>${jsonBox(f.row_after)}`;
  } else if (f.op === 'DELETE') {
    html += `<div style="font-size:11px;text-transform:uppercase;color:#555;font-weight:600;margin-bottom:4px">Fila borrada</div>${jsonBox(f.row_before)}`;
  }

  body.innerHTML = html;
  document.getElementById('audit-detalle-modal').style.display = 'flex';
}

function jsonBox(obj, changedCols, mode) {
  if (!obj) return '<div class="text-muted">(vacío)</div>';
  const set = new Set(changedCols || []);
  const lines = Object.keys(obj).sort().map(k => {
    const highlight = set.has(k) ? 'background:var(--amarillo)' : '';
    const v = obj[k];
    const vStr = v == null ? '<span style="color:#999">null</span>' : escapeHtml(JSON.stringify(v));
    return `<div style="${highlight};padding:2px 4px;border-radius:3px;font-family:monospace;font-size:11px;white-space:pre-wrap;word-break:break-word"><strong>${escapeHtml(k)}:</strong> ${vStr}</div>`;
  });
  return `<div style="border:1px solid var(--borde);border-radius:6px;padding:6px;background:white;max-height:50vh;overflow-y:auto">${lines.join('')}</div>`;
}

function cerrarDetalleAudit() {
  document.getElementById('audit-detalle-modal').style.display = 'none';
}

// Mostrar el tab "Audit" en el nav solo si el user logueado es admin.
// Se llama desde bootApp() en core.js después de validar la sesión.
async function initAuditRoleTab() {
  if (!supaSession || !supaSession.user) return;
  try {
    const res = await supaFetch(
      'app_user_role', 'GET', null,
      `?user_id=eq.${supaSession.user.id}&select=role`
    );
    const role = (res && res[0] && res[0].role) || null;
    auditCache.rolDelUser = role;
    if (role === 'admin') {
      const tab = document.getElementById('nav-tab-audit');
      if (tab) tab.style.display = '';
    }
  } catch (e) {
    // sin role visible (operador o no encontrado) — el tab queda oculto
  }
}

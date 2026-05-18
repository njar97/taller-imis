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
  const btnAudit = document.getElementById('cfg-acceso-audit');
  if (btnAudit) btnAudit.style.display = isAdmin ? '' : 'none';
  if (isAdmin) cargarUsuarios();
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


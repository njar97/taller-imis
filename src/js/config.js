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
  // Mostrar card de invitar solo si admin (reusa role cacheado por initAuditRoleTab)
  const card = document.getElementById('cfg-invitar-card');
  if (card) {
    const rol = (typeof auditCache !== 'undefined' && auditCache.rolDelUser) || null;
    card.style.display = (rol === 'admin') ? '' : 'none';
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


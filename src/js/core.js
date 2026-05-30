let SUPA_URL = localStorage.getItem('supa_url') || 'https://kszdievqesveluzcnzsh.supabase.co';
let SUPA_KEY = localStorage.getItem('supa_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzemRpZXZxZXN2ZWx1emNuenNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTgwMTgsImV4cCI6MjA5MDM5NDAxOH0.r28goEyUxZeKK9j0efu1BXC8ssU9lYxRK7dp3BGix1M';

// Cliente Supabase (SDK cargado por CDN en head.html). Maneja sesión + refresh de tokens.
let supaClient = null;
let supaSession = null;
function initSupaClient() {
  if (supaClient || typeof supabase === 'undefined') return supaClient;
  supaClient = supabase.createClient(SUPA_URL, SUPA_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'taller-imis-auth' }
  });
  supaClient.auth.onAuthStateChange((event, session) => {
    supaSession = session;
    renderUserChip();
    // Recovery: user vuelve desde "olvidé contraseña". Supabase emite
    // PASSWORD_RECOVERY y deja una sesión temporal lista para updateUser.
    if (event === 'PASSWORD_RECOVERY') {
      setAuthMode('reset');
      showAuthOverlay(true);
      return;
    }
    // Invite: user nuevo recién aceptó la invitación. La URL trae
    // #type=invite (o lo trajo, ya consumida por el SDK). El user está
    // logueado pero necesita setear una password. Lo forzamos al modo
    // "reset" en lugar de dejarlo entrar a la app sin password.
    if (event === 'SIGNED_IN' && urlHashIndicatesInvite()) {
      setAuthMode('reset');
      showAuthOverlay(true);
    }
  });
  return supaClient;
}
// Devuelve true si la URL actual venía con type=invite (link de
// inviteUserByEmail). El SDK ya consumió el hash al inicializar, pero
// guardamos pista en sessionStorage al detectarlo en bootApp.
function urlHashIndicatesInvite() {
  try {
    const h = window.location.hash || '';
    if (h.includes('type=invite')) return true;
    return sessionStorage.getItem('taller-imis-invite-pending') === '1';
  } catch (_e) { return false; }
}

function authToken() {
  // JWT del usuario logueado, o null. Usado por supaFetch para Authorization.
  return supaSession && supaSession.access_token ? supaSession.access_token : null;
}

// Catálogo base de KEYs por prenda (extraído del BASE_2025)
// Se puede extender con la tabla catalogo_key de Supabase
const CATALOGO_BASE = {
  "C":{"nombre":"Camisa","codigo":"C","keys":["C2","C4","C6","C8","C10","C12","C14","C16","C17","C20","C22","C24","C26","C28","C30"]},
  "B":{"nombre":"Blusa","codigo":"B","keys":["B8","B10","B12","B14","B16","B17","B20","B22","B24","B26","B28","B30"]},
  "CC":{"nombre":"Camisa celeste","codigo":"CC","keys":["CC2","CC3","CC4","CC6","CC8","CC10","CC12","CC14","CC16"]},
  "F":{"nombre":"Falda","codigo":"F","keys":["F465","F460","F458","F455","F450","F445","F440","F435","F665","F660","F658","F655","F650","F645","F640","F635","F765","F760","F758","F755","F750","F745","F740","F735","F865","F860","F858","F855","F850","F845","F840","F835","F1065","F1060","F1058","F1055","F1050","F1045","F1040","F1035","F1265","F1260","F1258","F1255","F1250","F1245","F1240","F1235","F1465","F1460","F1458","F1455","F1450","F1445","F1440","F1435","F1665","F1660","F1658","F1655","F1650","F1645","F1640","F1635","F1765","F1760","F1758","F1755","F1750","F1745","F1740","F1735","F1865","F1860","F1858","F1855","F1850","F1845","F1840","F1835","F2065","F2060","F2058","F2055","F2050","F2045","F2040","F2035","F2265","F2260","F2258","F2255","F2250","F2245","F2240","F2235","F2365","F2360","F2358","F2355","F2350","F2345","F2340","F2335","F2465","F2460","F2458","F2455","F2450","F2445","F2440","F2435","F2565","F2560","F2558","F2555","F2550","F2545","F2540","F2535","F2665","F2660","F2658","F2655","F2650","F2645","F2640","F2635","F2865","F2860","F2858","F2855","F2850","F2845","F2840","F2835","F3065","F3060","F3058","F3055","F3050","F3045","F3040","F3035"]},
  "FB":{"nombre":"Falda beige","codigo":"FB","keys":["FB770","FB765","FB760","FB758","FB755","FB750","FB745","FB870","FB865","FB860","FB858","FB855","FB850","FB845","FB1070","FB1065","FB1060","FB1058","FB1055","FB1050","FB1045","FB1270","FB1265","FB1260","FB1258","FB1255","FB1250","FB1245","FB1470","FB1465","FB1460","FB1458","FB1455","FB1450","FB1445","FB1670","FB1665","FB1660","FB1658","FB1655","FB1650","FB1645","FB1770","FB1765","FB1760","FB1758","FB1755","FB1750","FB1745","FB1870","FB1865","FB1860","FB1858","FB1855","FB1850","FB1845","FB2070","FB2065","FB2060","FB2058","FB2055","FB2050","FB2045","FB2270","FB2265","FB2260","FB2258","FB2255","FB2250","FB2245","FB2370","FB2365","FB2360","FB2358","FB2355","FB2350","FB2345","FB2470","FB2465","FB2460","FB2458","FB2455","FB2450","FB2445","FB2570","FB2565","FB2560","FB2558","FB2555","FB2550","FB2545","FB2670","FB2665","FB2660","FB2658","FB2655","FB2650","FB2645","FB2870","FB2865","FB2860","FB2858","FB2855","FB2850","FB2845","FB3070","FB3065","FB3060","FB3058","FB3055","FB3050","FB3045","FB3270","FB3265","FB3260","FB3258","FB3255","FB3250","FB3245"]},
  "P":{"nombre":"Pantalón","codigo":"P","keys":["P4110","P4105","P4100","P495","P490","P485","P480","P475","P470","P465","P460","P6110","P6105","P6100","P695","P690","P685","P680","P675","P670","P665","P660","P7110","P7105","P7100","P795","P790","P785","P780","P775","P770","P765","P760","P8110","P8105","P8100","P895","P890","P885","P880","P875","P870","P865","P860","P10110","P10105","P10100","P1095","P1090","P1085","P1080","P1075","P1070","P1065","P1060","P11110","P11105","P11100","P1195","P1190","P1185","P1180","P1175","P1170","P1165","P1160","P12110","P12105","P12100","P1295","P1290","P1285","P1280","P1275","P1270","P1265","P1260","P14110","P14105","P14100","P1495","P1490","P1485","P1480","P1475","P1470","P1465","P1460","P15110","P15105","P15100","P1595","P1590","P1585","P1580","P1575","P1570","P1565","P1560","P16110","P16105","P16100","P1695","P1690","P1685","P1680","P1675","P1670","P1665","P1660","P17110","P17105","P17100","P1795","P1790","P1785","P1780","P1775","P1770","P1765","P1760","P19110","P19105","P19100","P1995","P1990","P1985","P1980","P1975","P1970","P1965","P1960","P20110","P20105","P20100","P2095","P2090","P2085","P2080","P2075","P2070","P2065","P2060","P22110","P22105","P22100","P2295","P2290","P2285","P2280","P2275","P2270","P2265","P2260","P24110","P24105","P24100","P2495","P2490","P2485","P2480","P2475","P2470","P2465","P2460","P25110","P25105","P25100","P2595","P2590","P2585","P2580","P2575","P2570","P2565","P2560","P26110","P26105","P26100","P2695","P2690","P2685","P2680","P2675","P2670","P2665","P2660","P28110","P28105","P28100","P2895","P2890","P2885","P2880","P2875","P2870","P2865","P2860","P30110","P30105","P30100","P3095","P3090","P3085","P3080","P3075","P3070","P3065","P3060","P32110","P32105","P32100","P3295","P3290","P3285","P3280","P3275","P3270","P3265","P3260"]},
  "PB":{"nombre":"Pantalón beige","codigo":"PB","keys":["PB12110","PB12105","PB12100","PB1295","PB1290","PB14110","PB14105","PB14100","PB1495","PB1490","PB15110","PB15105","PB15100","PB1595","PB1590","PB16110","PB16105","PB16100","PB1695","PB1690","PB17110","PB17105","PB17100","PB1795","PB1790","PB19110","PB19105","PB19100","PB1995","PB1990","PB20110","PB20105","PB20100","PB2095","PB2090","PB22110","PB22105","PB22100","PB2295","PB2290","PB24110","PB24105","PB24100","PB2495","PB2490","PB25110","PB25105","PB25100","PB2595","PB2590","PB26110","PB26105","PB26100","PB2695","PB2690","PB28110","PB28105","PB28100","PB2895","PB2890","PB30110","PB30105","PB30100","PB3095","PB3090"]},
  "S":{"nombre":"Short","codigo":"S","keys":["S3","S4","S6","S8","S10","S12","S14","S16"]},
  "FCE":{"nombre":"Falda C.E.","codigo":"FCE","keys":["FCE350","FCE345","FCE340","FCE335","FCE330","FCE325","FCE450","FCE445","FCE440","FCE435","FCE430","FCE425","FCE650","FCE645","FCE640","FCE635","FCE630","FCE625","FCE750","FCE745","FCE740","FCE735","FCE730","FCE725","FCE850","FCE845","FCE840","FCE835","FCE830","FCE825","FCE1050","FCE1045","FCE1040","FCE1035","FCE1030","FCE1025","FCE1250","FCE1245","FCE1240","FCE1235","FCE1230","FCE1225","FCE1450","FCE1445","FCE1440","FCE1435","FCE1430","FCE1425","FCE1650","FCE1645","FCE1640","FCE1635","FCE1630","FCE1625"]}
};
// Catálogo combinado (base + custom desde Supabase). Se carga al abrir Trazo.
let CATALOGO = JSON.parse(JSON.stringify(CATALOGO_BASE));

// Mapping cod_prenda → nombre canónico (mismo casing que la base de datos:
// alumno.prenda_top, bodega_movimiento.nombre_prenda, escuela_acaparado.nombre_prenda).
// Usar SIEMPRE este helper cuando se necesite comparar/agrupar nombre de prenda
// que viene de un cod_prenda contra valores almacenados.
// El CATALOGO_BASE.nombre es "Camisa" (Title) para display; este helper devuelve
// "CAMISA" (UPPER_WITH_UNDERSCORES) que es lo guardado.
const _PRENDA_CANON_MAP = {
  C:'CAMISA', B:'BLUSA', CC:'CAMISA_CELESTE',
  P:'PANTALON', PB:'PANTALON_BEIGE',
  F:'FALDA',    FB:'FALDA_BEIGE', FCE:'FALDA_C.E',
  S:'SHORT',
};
function prendaCanon(cod) {
  if (!cod) return '';
  return _PRENDA_CANON_MAP[cod] || String(cod).toUpperCase();
}

// Estado global
let historialTipo = 'trazo';
let detalleActual = null; // { tipo, id } para editar/eliminar
let trazoSeleccionado = null;      // para Tendido
let tendidoSeleccionado = null;    // para Bulto
let trazoTallasBuffer = [];        // tallas del trazo en el form
let tallasCount = 0;
let rollosCountTd = 0;
let bultosState = [];              // estado del asistente de bulto
let fotoBlob = null;
let coloresSeleccionados = new Set(); // 'blanco', 'celeste', 'azul', 'beige'

// Mapeo color → prendas permitidas
const COLORES = {
  blanco:  { nombre: 'Blanco',  hex: '#FFFFFF', border: '#BBB', prendas: ['C','B'] },
  celeste: { nombre: 'Celeste', hex: '#8EC5E8', border: '#6AA5C8', prendas: ['CC','FCE'] },
  azul:    { nombre: 'Azul',    hex: '#1F4E79', border: '#1F4E79', prendas: ['P','F'] },
  beige:   { nombre: 'Beige',   hex: '#D4C59E', border: '#B0A07A', prendas: ['PB','FB'] },
};

// Compatibilidad: cuáles colores se pueden combinar
const COMPATIBLES = {
  blanco:  ['celeste'],
  celeste: ['blanco'],
  azul:    ['beige'],
  beige:   ['azul'],
};

// Debounce: agrupa llamadas rápidas y solo ejecuta la última tras `ms` ms
// de inactividad. Útil para handlers oninput/onchange que disparan fetch
// (filtros que el usuario cambia varios seguidos).
//   const refrescarLoteDeb = debounce(refrescarLote, 300);
//   <select onchange="refrescarLoteDeb()">
function debounce(fn, ms = 300) {
  let timer = null;
  return function debounced(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn.apply(this, args); }, ms);
  };
}

// ══════════════════════════════════════════════════════════════════════
// TOAST + ERROR BOUNDARIES
// ══════════════════════════════════════════════════════════════════════
// showToast: mensaje no bloqueante que aparece bottom-right por N segundos.
// type: 'error' | 'warn' | 'success' | 'info'. Click para descartar manual.
function showToast(msg, type = 'info', ms = 5000) {
  let cont = document.getElementById('toast-container');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'toast-container';
    cont.style.cssText = 'position:fixed;bottom:16px;right:16px;left:16px;z-index:99999;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none';
    document.body.appendChild(cont);
  }
  const palette = {
    error:   { bg: '#FEE', border: '#C00',     text: '#7A0000' },
    warn:    { bg: '#FEF4D6', border: '#C90',  text: '#7A4D00' },
    success: { bg: '#E8F5E9', border: '#2a8f4a', text: '#1B5E20' },
    info:    { bg: '#E3F2FD', border: '#1F4E79', text: '#1F4E79' },
  };
  const c = palette[type] || palette.info;
  const toast = document.createElement('div');
  toast.style.cssText = `pointer-events:auto;background:${c.bg};border-left:4px solid ${c.border};color:${c.text};padding:10px 14px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:13px;max-width:420px;width:auto;cursor:pointer;font-family:Arial,sans-serif;line-height:1.4`;
  toast.textContent = msg;
  toast.title = 'Tocá para cerrar';
  toast.onclick = () => toast.remove();
  cont.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, ms);
}

// Modal helper: centraliza apertura/cierre + manejo de tecla Esc +
// click-en-backdrop para cerrar. Reemplaza los patrones repetidos
// `document.getElementById('xxx').style.display = 'flex'/'none'`.
//
// Uso:
//   openModal('mi-modal');            // mostrar
//   closeModal('mi-modal');           // ocultar
//   openModal('mi-modal', { onClose: () => limpiarFormulario() });
//
// Los modales viejos siguen funcionando — esto es un helper opcional.
// Migración incremental: cuando toques un modal, podés cambiarlo.
const _modalState = new Map();  // id → { onClose }

function openModal(id, opts = {}) {
  const el = document.getElementById(id);
  if (!el) { console.warn('[openModal] no encontré', id); return; }
  el.style.display = 'flex';
  _modalState.set(id, { onClose: opts.onClose || null });
  // Si es la primera vez, instalar listener global de Esc + backdrop
  if (!window._modalListeners) {
    window._modalListeners = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      // Cerrar el último modal abierto (mayor z-index)
      const abiertos = [..._modalState.keys()].filter(mid => {
        const m = document.getElementById(mid);
        return m && m.style.display !== 'none';
      });
      if (abiertos.length) closeModal(abiertos[abiertos.length - 1]);
    });
  }
  // Click en backdrop cierra (si el modal lo soporta — chequea si el
  // click cayó EXACTAMENTE en el contenedor .modal, no en .modal-content)
  if (!el._backdropListenerAdded) {
    el._backdropListenerAdded = true;
    el.addEventListener('click', (e) => {
      if (e.target === el) closeModal(id);
    });
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'none';
  const state = _modalState.get(id);
  if (state && state.onClose) {
    try { state.onClose(); } catch (e) { console.error('[closeModal onClose]', e); }
  }
  _modalState.delete(id);
}

// validateForm: valida inputs por id según un spec declarativo.
// Devuelve { valid, errors[], firstError, firstInvalidId }.
// Spec por id:
//   { required: true, label: 'Operaria' }    // string no vacío
//   { required: true, min: 1, label: 'Cantidad' }  // número >= min
//   { email: true, label: 'Email' }          // formato email si tiene valor
// Uso:
//   const r = validateForm({ 'asig-operaria': {required:true,label:'Operaria'} });
//   if (!r.valid) { showToast(r.firstError, 'error');
//                   const el = document.getElementById(r.firstInvalidId);
//                   if (el) el.focus(); return; }
function validateForm(spec) {
  const errors = [];
  let firstInvalidId = null;
  const markInvalid = (id, msg) => {
    errors.push(msg);
    if (!firstInvalidId) firstInvalidId = id;
  };
  for (const [id, rules] of Object.entries(spec || {})) {
    const el = document.getElementById(id);
    if (!el) { console.warn('[validateForm]', id, 'no existe en el DOM'); continue; }
    const raw = el.value;
    const val = typeof raw === 'string' ? raw.trim() : raw;
    const label = rules.label || id;
    if (rules.required && (val === '' || val === null || val === undefined)) {
      markInvalid(id, `${label} es obligatorio`);
      continue;
    }
    if (val === '' || val === null || val === undefined) continue;  // opcional vacío
    if (rules.min !== undefined && Number(val) < rules.min) {
      markInvalid(id, `${label} debe ser ≥ ${rules.min}`);
    }
    if (rules.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      markInvalid(id, `${label} debe ser un email válido`);
    }
    if (rules.pattern && !rules.pattern.test(val)) {
      markInvalid(id, `${label} tiene formato inválido`);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    firstError: errors[0] || null,
    firstInvalidId,
  };
}

// tryInit: ejecuta una función init() con error boundary. Si falla
// (sync o async), loguea + muestra toast — pero NO bloquea la nav.
// Usar en switchTab/irA para que un init roto no deje UI vacío sin pista.
function tryInit(name, fn) {
  if (typeof fn !== 'function') {
    console.warn('[init]', name, 'no está definida');
    return;
  }
  try {
    const result = fn();
    if (result && typeof result.catch === 'function') {
      result.catch(err => {
        console.error('[init]', name, 'falló (async):', err);
        showToast(`No se pudo cargar "${name}": ${err.message || 'error desconocido'}`, 'error', 6000);
      });
    }
  } catch (err) {
    console.error('[init]', name, 'falló (sync):', err);
    showToast(`Error al cargar "${name}": ${err.message || 'error desconocido'}`, 'error', 6000);
  }
}

// ══════════════════════════════════════════════════════════════════════
// NAV
// ══════════════════════════════════════════════════════════════════════
function switchTab(tab, el) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const view = document.getElementById('view-' + tab);
  if (view) view.classList.add('active');
  if (el) el.classList.add('active');
  // Cada init wrappeado en tryInit — si una falla, las otras tabs siguen
  // funcionando y el usuario ve un toast en vez de UI vacío silencioso.
  if (tab === 'corte')       tryInit('Corte',        typeof initCorte === 'function'      ? initCorte      : null);
  if (tab === 'estadistica') tryInit('Estadística',  typeof initEstadistica === 'function'? initEstadistica: null);
  if (tab === 'config')      tryInit('Configuración', initConfig);
  if (tab === 'produccion')  tryInit('Producción',   initProduccion);
  if (tab === 'registro')    tryInit('Registro',     typeof initRegistro === 'function'   ? initRegistro   : null);
  if (tab === 'bodega')      tryInit('Bodega',       typeof initBodega === 'function'     ? initBodega     : null);
  if (tab === 'inicio')      tryInit('Inicio',       typeof initDashboard === 'function'  ? initDashboard  : null);
  if (tab === 'auditoria')   tryInit('Auditoría',    typeof initAuditoria === 'function'  ? initAuditoria  : null);
  window.scrollTo(0, 0);
}

function irA(seccion) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + seccion).classList.add('active');
  window.scrollTo(0, 0);
  if (seccion === 'trazo')   tryInit('Trazo',   typeof initTrazo === 'function'   ? initTrazo   : null);
  if (seccion === 'tendido') tryInit('Tendido', typeof initTendido === 'function' ? initTendido : null);
  if (seccion === 'bulto')   tryInit('Bulto',   typeof initBulto === 'function'   ? initBulto   : null);
}

function volverNuevo() {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-nuevo').classList.add('active');
  document.querySelectorAll('.nav-tab')[0].classList.add('active');
  window.scrollTo(0, 0);
}

// ══════════════════════════════════════════════════════════════════════
// SUPABASE
// ══════════════════════════════════════════════════════════════════════
async function supaFetch(table, method = 'GET', body = null, params = '') {
  const url = `${SUPA_URL}/rest/v1/${table}${params}`;
  const tok = authToken() || SUPA_KEY;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${tok}`, 'Prefer': method === 'POST' ? 'return=representation' : '' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const errText = await res.text();
    // 401 = token expirado o inválido. En vez de mostrar "JWT expired"
    // críptico, hacer logout + toast claro. Solo si había una sesión real
    // (no estamos en anon mode con SUPA_KEY pública).
    if (res.status === 401 && authToken()) {
      console.warn('[supaFetch] 401 — sesión expirada en', table);
      if (typeof showToast === 'function') {
        showToast('Tu sesión expiró. Iniciá sesión de nuevo para seguir.', 'warn', 6000);
      }
      if (typeof doLogout === 'function') {
        // Disparar logout async sin esperarlo para no agregar latencia
        Promise.resolve().then(() => doLogout()).catch(() => {});
      }
      throw new Error('Sesión expirada. Iniciá sesión de nuevo.');
    }
    // Otros errores: intentar extraer .message del JSON. Si no es JSON,
    // usar el texto directo (limitado para no inundar al usuario).
    let msg = errText;
    try { const j = JSON.parse(errText); msg = j.message || j.error || errText; } catch (_) {}
    throw new Error(msg.slice(0, 300));
  }
  return method === 'DELETE' ? null : res.json();
}

// Pagina en chunks para sortear el max-rows del backend (1000 por defecto).
// Uso: supaFetchAll('alumno', '?escuela_id=eq.X&order=nombre')
// `params` no debe traer limit/offset; se inyectan acá. pageSize <= max-rows.
//
// Trae la primera página secuencial; las siguientes en batches paralelos
// (4 a la vez). Para tabla alumno (~6k filas): 7 round-trips secuenciales
// → 2 batches paralelos. Reduce el tiempo de carga ~3-4x en red móvil.
async function supaFetchAll(table, params = '', pageSize = 1000, parallel = 4) {
  const sep = params.includes('?') ? '&' : '?';
  const fetchPage = (offset) =>
    supaFetch(table, 'GET', null, `${params}${sep}limit=${pageSize}&offset=${offset}`);

  // Primera página: si trae menos que pageSize ya está todo.
  const first = await fetchPage(0);
  if (!Array.isArray(first) || first.length < pageSize) return first || [];

  const out = [...first];
  let nextOffset = pageSize;
  while (true) {
    const offsets = Array.from({ length: parallel }, (_, i) => nextOffset + i * pageSize);
    const pages = await Promise.all(offsets.map(fetchPage));
    let alcanzoFin = false;
    for (const page of pages) {
      if (!Array.isArray(page) || page.length === 0) { alcanzoFin = true; break; }
      out.push(...page);
      if (page.length < pageSize) { alcanzoFin = true; break; }
    }
    if (alcanzoFin) break;
    nextOffset += parallel * pageSize;
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════
// Cache local de datos (localStorage). Acelera 2ª+ aperturas de la app:
// initAlumnosGlobal puede pintar instantáneo desde acá mientras refresca
// en background contra Supabase (patrón stale-while-revalidate).
//
// **Bumpear TI_CACHE_VERSION cuando cambie el shape de los datos cacheados**
// (ej: agregar columnas que el render asume presentes). Caches viejos
// quedan inválidos automáticamente — no se rompe nada en updates de la app.
// ══════════════════════════════════════════════════════════════════════
const TI_CACHE_PREFIX = 'ti_data_';
const TI_CACHE_VERSION = 2;  // bump: select de escuelas ahora incluye grupo_produccion
const TI_CACHE_TTL_DEFAULT = 24 * 60 * 60 * 1000;  // 24h

function tiCacheSet(key, data, ttlMs = TI_CACHE_TTL_DEFAULT) {
  const payload = JSON.stringify({ v: TI_CACHE_VERSION, ts: Date.now(), ttl: ttlMs, data });
  try {
    localStorage.setItem(TI_CACHE_PREFIX + key, payload);
  } catch (e) {
    // QuotaExceeded → tirar todos los caches y reintentar una vez
    tiCacheClearAll();
    try { localStorage.setItem(TI_CACHE_PREFIX + key, payload); } catch (_) {}
  }
}

function tiCacheGet(key) {
  try {
    const raw = localStorage.getItem(TI_CACHE_PREFIX + key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj.v !== TI_CACHE_VERSION) return null;
    if (Date.now() - obj.ts > (obj.ttl || TI_CACHE_TTL_DEFAULT)) return null;
    return obj.data;
  } catch (e) { return null; }
}

function tiCacheClearAll() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(TI_CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
  } catch (_) {}
}

// Helper genérico stale-while-revalidate:
//  1) Si hay cache, llama onData(cached, fromCache=true) inmediatamente.
//  2) Dispara fetchFn(), persiste y llama onData(fresh, fromCache=false).
//  3) Si fetchFn falla y había cache → log silencioso (offline-tolerante).
//
// Uso típico desde una init de vista:
//   await tiSWR('mi_vista_v1', async () => {
//     const [a, b] = await Promise.all([fetchA(), fetchB()]);
//     return { a, b };
//   }, (data, fromCache) => {
//     miCache.a = data.a; miCache.b = data.b;
//     renderMiVista();
//   }, { ttl: 60 * 60 * 1000 });  // 1h
async function tiSWR(cacheKey, fetchFn, onData, opts = {}) {
  const cached = tiCacheGet(cacheKey);
  let mostradoDesdeCache = false;
  if (cached !== null && cached !== undefined) {
    try { onData(cached, true); mostradoDesdeCache = true; }
    catch (e) { console.warn(`[SWR ${cacheKey}] onData(cached) falló:`, e); }
  }
  try {
    const fresh = await fetchFn();
    tiCacheSet(cacheKey, fresh, opts.ttl);
    onData(fresh, false);
    return fresh;
  } catch (e) {
    if (mostradoDesdeCache) {
      console.warn(`[SWR ${cacheKey}] refresh falló, usando cache:`, e.message);
      return cached;
    }
    throw e;
  }
}

async function supaUploadFoto(file, trazoId) {
  const ext = file.name.split('.').pop();
  const path = `${trazoId}.${ext}`;
  const tok = authToken() || SUPA_KEY;
  const res = await fetch(`${SUPA_URL}/storage/v1/object/trazo-fotos/${path}`, {
    method: 'POST',
    headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${tok}`, 'Content-Type': file.type },
    body: file
  });
  if (!res.ok) throw new Error('Error subiendo foto');
  return `${SUPA_URL}/storage/v1/object/public/trazo-fotos/${path}`;
}

async function supaUpdate(table, id, data) {
  const tok = authToken() || SUPA_KEY;
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${tok}` },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
}

// ══════════════════════════════════════════════════════════════════════
// AUTH (Supabase Auth + login overlay)
// ══════════════════════════════════════════════════════════════════════
function showAuthOverlay(show) {
  const ov = document.getElementById('auth-overlay');
  if (!ov) return;
  ov.classList.toggle('active', !!show);
}

function renderUserChip() {
  // El correo y "cerrar sesión" viven ahora en la tarjeta de Sesión de Config
  // (el encabezado quedó limpio, solo con el buscador).
  const card = document.getElementById('cfg-session-card');
  const emailEl = document.getElementById('cfg-session-email');
  if (!card || !emailEl) return;
  if (supaSession && supaSession.user) {
    emailEl.textContent = supaSession.user.email || 'logueado';
    card.style.display = '';
  } else {
    card.style.display = 'none';
  }
}

// ── Multi-mode auth overlay ──────────────────────────────────────────
// 'login'  → email + password, signInWithPassword
// 'forgot' → email, resetPasswordForEmail (mail con link de recovery)
// 'reset'  → nueva password, updateUser (después de clicar el link)
let authMode = 'login';

function setAuthMode(mode) {
  authMode = mode;
  const fE = document.getElementById('auth-field-email');
  const fP = document.getElementById('auth-field-pass');
  const fN = document.getElementById('auth-field-newpass');
  const btn = document.getElementById('auth-submit');
  const sub = document.getElementById('auth-sub');
  const lF = document.getElementById('auth-link-forgot');
  const lL = document.getElementById('auth-link-login');
  const al = document.getElementById('auth-alert');
  if (al) al.innerHTML = '';
  if (mode === 'login') {
    fE.style.display = ''; fP.style.display = ''; fN.style.display = 'none';
    btn.textContent = 'Entrar';
    sub.textContent = 'Iniciá sesión para continuar';
    lF.style.display = ''; lL.style.display = 'none';
    document.getElementById('auth-pass').required = true;
    document.getElementById('auth-email').required = true;
    document.getElementById('auth-newpass').required = false;
  } else if (mode === 'forgot') {
    fE.style.display = ''; fP.style.display = 'none'; fN.style.display = 'none';
    btn.textContent = 'Enviar instrucciones';
    sub.textContent = 'Te enviamos un email con un link para resetear tu contraseña';
    lF.style.display = 'none'; lL.style.display = '';
    document.getElementById('auth-pass').required = false;
    document.getElementById('auth-email').required = true;
    document.getElementById('auth-newpass').required = false;
  } else if (mode === 'reset') {
    fE.style.display = 'none'; fP.style.display = 'none'; fN.style.display = '';
    btn.textContent = 'Guardar nueva contraseña';
    sub.textContent = 'Ingresá tu nueva contraseña';
    lF.style.display = 'none'; lL.style.display = '';
    document.getElementById('auth-pass').required = false;
    document.getElementById('auth-email').required = false;
    document.getElementById('auth-newpass').required = true;
  }
}

function doAuthSubmit(ev) {
  if (ev) ev.preventDefault();
  if (authMode === 'login')  return doLogin(ev);
  if (authMode === 'forgot') return doForgotPassword(ev);
  if (authMode === 'reset')  return doSetNewPassword(ev);
  return false;
}

async function doLogin(ev) {
  if (ev) ev.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-pass').value;
  const alertEl = document.getElementById('auth-alert');
  const btn = document.getElementById('auth-submit');
  alertEl.innerHTML = '';
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  try {
    const cli = initSupaClient();
    if (!cli) throw new Error('SDK de Supabase no cargado');
    const { data, error } = await cli.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    supaSession = data.session;
    showAuthOverlay(false);
    renderUserChip();
    document.getElementById('auth-pass').value = '';
    if (typeof initDashboard === 'function') initDashboard();
    if (typeof initAuditRoleTab === 'function') initAuditRoleTab();
  } catch (e) {
    alertEl.innerHTML = `<div class="alert alert-error">${e.message || 'Error de login'}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
  return false;
}

async function doForgotPassword(ev) {
  if (ev) ev.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const alertEl = document.getElementById('auth-alert');
  const btn = document.getElementById('auth-submit');
  alertEl.innerHTML = '';
  if (!email) {
    alertEl.innerHTML = '<div class="alert alert-error">Ingresá tu email</div>';
    return false;
  }
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  try {
    const cli = initSupaClient();
    if (!cli) throw new Error('SDK de Supabase no cargado');
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await cli.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    alertEl.innerHTML = '<div class="alert alert-success">Listo. Revisá tu email — el link expira en 1 hora.</div>';
  } catch (e) {
    alertEl.innerHTML = `<div class="alert alert-error">${e.message || 'No se pudo enviar el mail'}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar instrucciones';
  }
  return false;
}

async function doSetNewPassword(ev) {
  if (ev) ev.preventDefault();
  const newPass = document.getElementById('auth-newpass').value;
  const alertEl = document.getElementById('auth-alert');
  const btn = document.getElementById('auth-submit');
  alertEl.innerHTML = '';
  if (!newPass || newPass.length < 6) {
    alertEl.innerHTML = '<div class="alert alert-error">Mínimo 6 caracteres</div>';
    return false;
  }
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    const cli = initSupaClient();
    if (!cli) throw new Error('SDK de Supabase no cargado');
    const { error } = await cli.auth.updateUser({ password: newPass });
    if (error) throw error;
    // Limpiamos el hash del recovery (token en la URL) y cerramos el overlay.
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    try { sessionStorage.removeItem('taller-imis-invite-pending'); } catch (_e) {}
    document.getElementById('auth-newpass').value = '';
    alertEl.innerHTML = '<div class="alert alert-success">Contraseña actualizada. Entrando...</div>';
    setTimeout(() => {
      showAuthOverlay(false);
      setAuthMode('login');
      renderUserChip();
      if (typeof initDashboard === 'function') initDashboard();
      if (typeof initAuditRoleTab === 'function') initAuditRoleTab();
    }, 800);
  } catch (e) {
    alertEl.innerHTML = `<div class="alert alert-error">${e.message || 'No se pudo actualizar la contraseña'}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar nueva contraseña';
  }
  return false;
}

async function doLogout() {
  try {
    const cli = initSupaClient();
    if (cli) await cli.auth.signOut();
  } catch (e) { /* ignore */ }
  // Limpiar cache local de datos para que el próximo login no vea
  // info del usuario anterior (en caso de uso compartido del browser).
  if (typeof tiCacheClearAll === 'function') tiCacheClearAll();
  supaSession = null;
  renderUserChip();
  const auditTab = document.getElementById('nav-tab-audit');
  if (auditTab) auditTab.style.display = 'none';
  showAuthOverlay(true);
}

async function gateApp() {
  // Llamado al arranque. Si hay sesión válida, deja pasar; si no, muestra el login.
  const cli = initSupaClient();
  if (!cli) {
    // SDK no cargó (offline / CDN bloqueado): dejá pasar con anon key como fallback.
    console.warn('Supabase SDK no disponible — modo legacy con anon key');
    return;
  }
  const { data } = await cli.auth.getSession();
  supaSession = data.session;
  if (supaSession) {
    showAuthOverlay(false);
    renderUserChip();
  } else {
    showAuthOverlay(true);
  }
}

function mostrarAlerta(sec, tipo, msg) {
  const el = document.getElementById(`alert-${sec}`);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${tipo==='error'?'error':(tipo==='warn'?'warn':'success')}">${msg}</div>`;
  setTimeout(() => el.innerHTML='', 5000);
}

function previewFoto(input, previewId, labelId) {
  const file = input.files[0];
  if (!file) return;
  fotoBlob = file;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById(previewId);
    img.src = e.target.result;
    img.style.display = 'block';
    document.getElementById(labelId).textContent = file.name;
  };
  reader.readAsDataURL(file);
}

// ══════════════════════════════════════════════════════════════════════
// TRAZO
// ══════════════════════════════════════════════════════════════════════
// ARRANQUE
// ══════════════════════════════════════════════════════════════════════
// Gate de auth + dashboard. Si no hay sesión, gateApp muestra el overlay
// de login y bloquea la app hasta que el usuario se loguee.
async function bootApp() {
  // Si la URL trae type=invite, persistimos la pista antes de que el
  // SDK consuma el hash. onAuthStateChange la usa para forzar el
  // overlay de "setear password inicial" cuando emita SIGNED_IN.
  try {
    if ((window.location.hash || '').includes('type=invite')) {
      sessionStorage.setItem('taller-imis-invite-pending', '1');
    }
  } catch (_e) {}
  await gateApp();
  if (supaSession && typeof initDashboard === 'function') initDashboard();
  if (supaSession && typeof initAuditRoleTab === 'function') initAuditRoleTab();
  if (supaSession && typeof actualizarBadgeEscuelasEsperando === 'function') {
    actualizarBadgeEscuelasEsperando();
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else {
  setTimeout(bootApp, 100);
}

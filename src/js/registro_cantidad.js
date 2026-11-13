// ══════════════════════════════════════════════════════════════════════
// REGISTRO POR CANTIDAD (temporada 2026 en adelante)
// El MINED manda el pedido por escuela × prenda × talla (tabla `pedido`),
// SIN lista de alumnos. Registro muestra, por escuela:
//   · el pedido por prenda y talla: pedido · empacado · entregado · falta
//   · los alumnos de TALLA ESPECIAL (tabla `talla_especial`, los únicos con
//     nombre): talla, medidas, estado y observaciones, editables fila por fila.
// Más una vista global «📏 Especiales» con filtros y descarga en CSV.
//
// Las cuentas son las de Inicio (dashboard.js): pedidoDeTemporada,
// acaparadoTodo, tallaEquivalencias y avancePedidoTemporada. Acá no se
// recalcula nada por otro camino.
// Las temporadas CON alumnos (2025) siguen en alumnos_global.js.
// ══════════════════════════════════════════════════════════════════════

const TESP_ESTADOS = [
  { val: 'pendiente',     txt: 'Pendiente',     sing: 'pendiente',     plural: 'pendientes',    ico: '⏳', bg: '#FFF4E6', fg: '#8A5300' },
  { val: 'tallado',       txt: 'Tallado',       sing: 'tallado',       plural: 'tallados',      ico: '📏', bg: '#E8F0FA', fg: '#1F4E79' },
  { val: 'en_confeccion', txt: 'En confección', sing: 'en confección', plural: 'en confección', ico: '🧵', bg: '#F3E8FD', fg: '#6A1B9A' },
  { val: 'entregado',     txt: 'Entregado',     sing: 'entregado',     plural: 'entregados',    ico: '✅', bg: '#E0F4E5', fg: '#1B5E20' },
];
const TESP_MEDIDAS = [
  { campo: 'cintura',      txt: 'Cintura',      corto: 'Cint.' },
  { campo: 'cadera',       txt: 'Cadera',       corto: 'Cad.' },
  { campo: 'largo_abajo',  txt: 'Largo abajo',  corto: 'L. abajo' },
  { campo: 'pecho',        txt: 'Pecho',        corto: 'Pecho' },
  { campo: 'largo_arriba', txt: 'Largo arriba', corto: 'L. arriba' },
];
const TESP_EMPRESAS = ['IMIS', 'JAV', 'AME'];
const TESP_SELECT = 'id,temporada_id,escuela_id,empresa,grado,sexo,nie,nombre,talla,' +
  'cintura,cadera,largo_abajo,pecho,largo_arriba,estado,observaciones,creado_en,actualizado_en';

let regCant = {
  temporadaId: null,
  vista: 'escuelas',        // 'escuelas' | 'especiales'
  escuelaSel: null,         // escuela con la ficha abierta (null = lista)
  busqEsc: '',
  lineas: [],               // avancePedidoTemporada: escuela × prenda × talla
  contratos: [],
  escuelas: new Map(),      // id → escuela
  esp: [],                  // filas de talla_especial de la temporada
  fallidos: [],
  filtroEstado: '',
  filtroEmpresa: '',
  busqEsp: '',
  abiertos: new Set(),      // filas especiales con el formulario abierto
  borradores: new Map(),    // id → { campo: valor } todavía sin guardar
  guardando: new Set(),
  nuevoPara: null,          // escuela con el formulario «Agregar» abierto
  nuevo: {},
  cargado: false,
  seq: 0,
  scrollLista: 0,
  enfocar: null,            // fila a resaltar después de pintar
};

function rcEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Para buscar sin importar tildes ni mayúsculas (PEÑATE = penate)
function rcNorm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
function rcNum(n) {
  return typeof dashNum === 'function' ? dashNum(n) : String(Number(n) || 0);
}

// ── Carga ─────────────────────────────────────────────────────────────

async function initRegistroCantidad(tempId) {
  const cont = document.getElementById('registro-cant-contenido');
  if (!cont) return;
  if (regCant.temporadaId !== tempId) {
    Object.assign(regCant, {
      vista: 'escuelas', escuelaSel: null, busqEsc: '', busqEsp: '',
      filtroEstado: '', filtroEmpresa: '', abiertos: new Set(), borradores: new Map(),
      nuevoPara: null, nuevo: {}, cargado: false, esp: [], lineas: [],
    });
  }
  regCant.temporadaId = tempId;
  const seq = ++regCant.seq;
  if (!regCant.cargado) {
    cont.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center">Cargando pedido y tallas especiales…</div>';
  }

  const tareas = [
    ['pedido',   () => pedidoDeTemporada(tempId)],
    ['acap',     () => acaparadoTodo()],
    ['equiv',    () => tallaEquivalencias()],
    ['escuelas', () => cachedFetch('registro-escuelas',
      () => supaFetchAll('escuela', '?select=id,alias,nombre,codigo_cde&order=nombre'),
      { ttl: 300_000, group: 'escuelas' })],
    ['esp',      () => supaFetchAll('talla_especial', `?temporada_id=eq.${tempId}&select=${TESP_SELECT}&order=nombre`)],
  ];
  const res = await Promise.allSettled(tareas.map(([, fn]) => fn()));
  if (seq !== regCant.seq) return;   // hubo una carga más nueva: esa manda

  const d = {};
  const fallidos = [];
  tareas.forEach(([k], i) => {
    if (res[i].status === 'fulfilled') d[k] = res[i].value;
    else {
      fallidos.push(k);
      console.warn('[registro 2026]', k, 'falló:', res[i].reason && res[i].reason.message || res[i].reason);
    }
  });
  regCant.fallidos = fallidos;
  if (d.pedido || !regCant.cargado) {
    regCant.lineas = avancePedidoTemporada(d.pedido ? d.pedido.pedido : [], d.acap || [], d.equiv || []);
    regCant.contratos = d.pedido ? (d.pedido.contratos || []) : [];
  }
  if (d.escuelas) regCant.escuelas = new Map(d.escuelas.map(e => [e.id, e]));
  if (d.esp) regCant.esp = d.esp;
  regCant.cargado = true;

  regCantAplicarAtajos();
  renderRegistroCantidad();
}

function regCantRefrescar() {
  if (typeof invalidarCache === 'function') {
    invalidarCache('pedido');
    invalidarCache('pool');
    invalidarCache('escuelas');
  }
  if (regCant.temporadaId) initRegistroCantidad(regCant.temporadaId);
}

// Atajos desde el buscador (Ctrl+K): abrir una escuela, un alumno especial
// o la vista de especiales apenas termina de cargar.
function regCantAplicarAtajos() {
  const hEsp = window._regHintEspecial;
  const hEsc = window._regHintEscuela;
  const hVista = window._regHintVista;
  window._regHintEspecial = window._regHintEscuela = window._regHintVista = null;
  if (hEsp) {
    const r = tespFila(hEsp);
    if (r) {
      regCant.escuelaSel = r.escuela_id;
      regCant.abiertos.add(r.id);
      regCant.enfocar = r.id;
      return;
    }
  }
  if (hEsc && regCantEscuelasLista().some(o => o.id === hEsc)) {
    regCant.escuelaSel = hEsc;
    return;
  }
  if (hVista === 'especiales' || hVista === 'escuelas') {
    regCant.vista = hVista;
    regCant.escuelaSel = null;
  }
}

// ── Datos derivados ───────────────────────────────────────────────────

function regCantNombreEscuela(id) {
  const e = regCant.escuelas.get(id);
  return e ? (e.alias || e.nombre || 'Escuela sin nombre') : 'Escuela sin nombre';
}

// Escuelas de la temporada = las del pedido + las que tienen tallas especiales
function regCantEscuelasLista() {
  const by = new Map();
  const de = (id) => {
    let o = by.get(id);
    if (!o) {
      o = { id, sol: 0, emp: 0, ent: 0, pend: 0, lineas: [], esp: [] };
      by.set(id, o);
    }
    return o;
  };
  for (const l of regCant.lineas) {
    const o = de(l.escuela_id);
    o.sol += l.sol; o.emp += l.emp; o.ent += l.ent; o.pend += l.pend;
    o.lineas.push(l);
  }
  for (const r of regCant.esp) de(r.escuela_id).esp.push(r);
  for (const o of by.values()) {
    o.escuela = regCant.escuelas.get(o.id) || { id: o.id };
    o.nombre = regCantNombreEscuela(o.id);
    o.pct = o.sol > 0 ? Math.round(100 * o.ent / o.sol) : 0;
    o.pctEmp = o.sol > 0 ? Math.round(100 * o.emp / o.sol) : 0;
  }
  return [...by.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function tespFila(id) { return regCant.esp.find(r => r.id === id) || null; }
function tespEstado(val) { return TESP_ESTADOS.find(e => e.val === val) || TESP_ESTADOS[0]; }
function tespTxt(v) { return String(v == null ? '' : v).trim(); }

function tespConteo(filas) {
  const c = { total: filas.length };
  for (const e of TESP_ESTADOS) c[e.val] = 0;
  for (const r of filas) if (r.estado in c) c[r.estado]++;
  return c;
}
// «1 pendiente», «3 pendientes»
function tespCuenta(e, n) { return n + ' ' + (n === 1 ? e.sing : e.plural); }
function tespConteoHtml(c) {
  return TESP_ESTADOS.map(e => `<span class="rc-chip" style="background:${e.bg};color:${e.fg};${c[e.val] ? '' : 'opacity:.45'}">${e.ico} ${tespCuenta(e, c[e.val])}</span>`).join('');
}

// ── Pantalla ──────────────────────────────────────────────────────────

const _RC_FALLIDOS = { pedido: 'pedido', acap: 'empacado', equiv: 'equivalencias de talla', escuelas: 'escuelas', esp: 'tallas especiales' };

function renderRegistroCantidad() {
  const cont = document.getElementById('registro-cant-contenido');
  if (!cont) return;
  const aviso = regCant.fallidos.length
    ? `<div class="alert alert-warn" style="font-size:12px">⚠ No se pudo cargar: ${regCant.fallidos.map(k => _RC_FALLIDOS[k] || k).join(', ')}. Probá 🔄.</div>`
    : '';
  if (regCant.escuelaSel) {
    cont.innerHTML = aviso + regCantFichaHtml(regCant.escuelaSel);
  } else {
    const escuelas = regCantEscuelasLista();
    const tabs = `
      <div class="rc-tabs">
        <button class="btn btn-sm ${regCant.vista === 'escuelas' ? 'btn-primary' : 'btn-ghost'}" onclick="regCantVista('escuelas')">🏫 Escuelas (${escuelas.length})</button>
        <button class="btn btn-sm ${regCant.vista === 'especiales' ? 'btn-primary' : 'btn-ghost'}" onclick="regCantVista('especiales')">📏 Especiales (${regCant.esp.length})</button>
        <button class="btn btn-sm btn-ghost" onclick="regCantRefrescar()" title="Volver a cargar" aria-label="Volver a cargar">🔄</button>
      </div>`;
    cont.innerHTML = aviso + tabs + (regCant.vista === 'especiales'
      ? regCantEspecialesHtml()
      : regCantResumenHtml(escuelas) + regCantEscuelasHtml());
  }
  if (regCant.enfocar) {
    const id = regCant.enfocar;
    regCant.enfocar = null;
    const el = document.getElementById('tesp-' + id);
    if (el) {
      if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
      tespResaltar(id);
    }
  }
}

function regCantVista(v) {
  regCant.vista = v;
  regCant.escuelaSel = null;
  renderRegistroCantidad();
}

function regCantTemporada() {
  return ((typeof registroCache !== 'undefined' && registroCache.temporadas) || [])
    .find(t => t.id === regCant.temporadaId) || null;
}

function regCantResumenHtml(escuelas) {
  const t = regCant.temporadaId ? regCantTemporada() : null;
  const tot = escuelas.reduce((s, o) => {
    s.sol += o.sol; s.emp += o.emp; s.ent += o.ent; s.pend += o.pend; return s;
  }, { sol: 0, emp: 0, ent: 0, pend: 0 });
  const pct = tot.sol > 0 ? Math.round(100 * tot.ent / tot.sol) : 0;
  const pctEmp = tot.sol > 0 ? Math.round(100 * tot.emp / tot.sol) : 0;
  const codigos = [...new Set(regCant.contratos.map(c => c.codigo).filter(Boolean))];
  const ce = tespConteo(regCant.esp);
  return `
    <div class="card rc-card">
      <div class="rc-resumen-tit">${rcEsc(t ? (t.nombre || 'Temporada ' + t.codigo) : 'Temporada')}${codigos.length ? ` <span class="rc-sub">· Contrato ${codigos.map(rcEsc).join(', ')}</span>` : ''}</div>
      <div class="rc-sub" style="margin-bottom:6px">Sin lista de alumnos: el pedido viene por talla. Con nombre van solo las tallas especiales.</div>
      <div class="rc-kpis">
        <div><b>${rcNum(tot.sol)}</b><span>pedido</span></div>
        <div style="color:var(--success-text)"><b>${rcNum(tot.emp)}</b><span>empacado</span></div>
        <div style="color:var(--azul2)"><b>${rcNum(tot.ent)}</b><span>entregado</span></div>
        <div style="color:#C2660A"><b>${rcNum(tot.pend)}</b><span>falta empacar</span></div>
      </div>
      <div class="rc-barra" title="${pct}% entregado · ${pctEmp}% empacado">
        <div style="background:var(--azul2);width:${pct}%"></div><div style="background:var(--verde);width:${pctEmp}%"></div>
      </div>
      ${regCant.esp.length ? `
      <button class="rc-link" onclick="regCantVista('especiales')">📏 ${ce.total} ${ce.total === 1 ? 'talla especial' : 'tallas especiales'}: ${TESP_ESTADOS.map(e => tespCuenta(e, ce[e.val])).join(' · ')} ›</button>` : ''}
    </div>`;
}

function regCantEscuelasHtml() {
  return `
    <input type="search" class="rc-buscar" placeholder="🔍 Buscar escuela o CDE…" value="${rcEsc(regCant.busqEsc)}"
      oninput="regCantBuscarEsc(this.value)" aria-label="Buscar escuela">
    <div id="rc-esc-lista">${regCantListaEscHtml()}</div>`;
}

function regCantBuscarEsc(v) {
  regCant.busqEsc = v;
  const el = document.getElementById('rc-esc-lista');
  if (el) el.innerHTML = regCantListaEscHtml();
}

function regCantListaEscHtml() {
  const q = rcNorm(regCant.busqEsc);
  const lista = regCantEscuelasLista().filter(o => !q ||
    rcNorm(o.escuela.nombre).includes(q) || rcNorm(o.escuela.alias).includes(q) ||
    rcNorm(o.escuela.codigo_cde).includes(q));
  if (!regCant.lineas.length && !regCant.esp.length) {
    return '<div class="alert alert-info">Esta temporada todavía no tiene pedido ni tallas especiales.</div>';
  }
  if (!lista.length) return '<div class="alert alert-info">Ninguna escuela coincide.</div>';
  return lista.map(o => {
    const e = o.escuela;
    const colorPct = o.pct >= 100 ? 'var(--verde)' : (o.pct > 0 ? 'var(--azul2)' : '#999');
    const cEsp = tespConteo(o.esp);
    return `
      <button type="button" class="rc-esc" onclick="regCantAbrirEscuela('${o.id}')">
        <span class="rc-esc-top">
          <span class="rc-esc-nom">🏫 ${rcEsc(o.nombre)}</span>
          ${o.sol ? `<span class="rc-pct" style="color:${colorPct}">${o.pct}%<small>entregado</small></span>` : ''}
        </span>
        <span class="rc-sub">${e.codigo_cde ? 'CDE ' + rcEsc(e.codigo_cde) + ' · ' : ''}${o.sol ? rcNum(o.sol) + ' piezas pedidas' : 'sin pedido'}</span>
        <span class="rc-chips">
          ${o.sol ? `
          <span class="rc-chip rc-chip-falta"><b>${rcNum(o.pend)}</b> falta</span>
          <span class="rc-chip rc-chip-emp"><b>${rcNum(o.emp)}</b> empacado</span>
          <span class="rc-chip rc-chip-ent"><b>${rcNum(o.ent)}</b> entregado</span>` : ''}
          ${o.esp.length ? `<span class="rc-chip rc-chip-esp">📏 <b>${o.esp.length}</b> ${o.esp.length === 1 ? 'especial' : 'especiales'}${cEsp.pendiente ? ` · ${cEsp.pendiente} pend.` : ''}</span>` : ''}
        </span>
        ${o.sol ? `<span class="rc-barra"><span style="background:var(--azul2);width:${o.pct}%"></span><span style="background:var(--verde);width:${o.pctEmp}%"></span></span>` : ''}
      </button>`;
  }).join('');
}

// ── Ficha de una escuela ──────────────────────────────────────────────

function regCantAbrirEscuela(id) {
  if (!regCant.escuelaSel) regCant.scrollLista = window.scrollY || 0;
  regCant.escuelaSel = id;
  renderRegistroCantidad();
  window.scrollTo(0, 0);
}

function regCantCerrarEscuela() {
  regCant.escuelaSel = null;
  regCant.nuevoPara = null;
  renderRegistroCantidad();
  window.scrollTo(0, regCant.scrollLista || 0);
}

// Botón atrás del celular (atras.js): con una ficha abierta, vuelve a la lista
function registroCantAtras() {
  const cont = document.getElementById('registro-cant-contenido');
  if (!regCant.escuelaSel || !cont || cont.style.display === 'none') return false;
  regCantCerrarEscuela();
  return true;
}

function regCantFichaHtml(escId) {
  const o = regCantEscuelasLista().find(x => x.id === escId) || {
    id: escId, escuela: regCant.escuelas.get(escId) || { id: escId }, nombre: regCantNombreEscuela(escId),
    sol: 0, emp: 0, ent: 0, pend: 0, pct: 0, pctEmp: 0, lineas: [], esp: [],
  };
  const e = o.escuela;
  const nombreLargo = e.nombre && e.alias ? ` <span class="rc-sub">${rcEsc(e.nombre)}</span>` : '';
  const acciones = [
    typeof _avanceEscIrA === 'function' && o.sol ? `<button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('empacar','${escId}')">🧺 Empacar</button>` : '',
    typeof _avanceEscIrA === 'function' && o.sol ? `<button class="btn btn-ghost btn-sm" onclick="_avanceEscIrA('entrega','${escId}')">🚚 Entrega</button>` : '',
    typeof editarEscuela === 'function' ? `<button class="btn btn-ghost btn-sm" onclick="editarEscuela('${escId}')">✏️ Datos de la escuela</button>` : '',
  ].join('');
  return `
    <div class="rc-ficha">
      <button class="btn btn-ghost rc-volver" onclick="regCantCerrarEscuela()">← Escuelas</button>
      <div class="card rc-card">
        <div class="rc-ficha-nom">🏫 ${rcEsc(o.nombre)}${nombreLargo}</div>
        <div class="rc-sub">${e.codigo_cde ? 'CDE ' + rcEsc(e.codigo_cde) : ''}</div>
        ${o.sol ? `
        <div class="rc-kpis" style="margin-top:8px">
          <div><b>${rcNum(o.sol)}</b><span>pedido</span></div>
          <div style="color:var(--success-text)"><b>${rcNum(o.emp)}</b><span>empacado</span></div>
          <div style="color:var(--azul2)"><b>${rcNum(o.ent)}</b><span>entregado</span></div>
          <div style="color:#C2660A"><b>${rcNum(o.pend)}</b><span>falta empacar</span></div>
        </div>
        <div class="rc-barra" title="${o.pct}% entregado · ${o.pctEmp}% empacado">
          <div style="background:var(--azul2);width:${o.pct}%"></div><div style="background:var(--verde);width:${o.pctEmp}%"></div>
        </div>` : ''}
        ${acciones ? `<div class="rc-acciones">${acciones}</div>` : ''}
      </div>
      ${regCantPedidoHtml(o)}
      ${regCantEspFichaHtml(o)}
    </div>`;
}

function regCantPedidoHtml(o) {
  const titulo = '<div class="rc-card-cab">📦 Pedido por prenda y talla</div>';
  if (!o.lineas.length) {
    return `<div class="card rc-card-tabla">${titulo}<div class="rc-sub" style="padding:10px 12px">Esta escuela no tiene pedido en la temporada.</div></div>`;
  }
  const ordP = cod => (typeof dashOrdenPrenda === 'function' ? dashOrdenPrenda(cod) : 0);
  const ordT = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
  const lineas = o.lineas.slice().sort((a, b) => ordP(a.cod) - ordP(b.cod) || ordT(a.talla, b.talla));
  const nombre = cod => (typeof dashPrendaNombre === 'function' ? dashPrendaNombre(cod) : cod);
  const fila = (l) => `
        <tr>
          <td><span class="rc-talla">${rcEsc(l.cod + String(l.talla).replace(/^T/, ''))}</span><span class="rc-prenda">${rcEsc(nombre(l.cod))}</span></td>
          <td>${rcNum(l.sol)}</td>
          <td class="rc-c-emp">${rcNum(l.emp)}</td>
          <td class="rc-c-ent">${rcNum(l.ent)}</td>
          <td class="rc-c-falta${l.pend > 0 ? '' : ' cero'}">${rcNum(l.pend)}</td>
        </tr>`;
  return `
    <div class="card rc-card-tabla">
      ${titulo}
      <table class="rc-tabla">
        <thead><tr><th>Talla</th><th>Pedido</th><th>Empac.</th><th>Entreg.</th><th>Falta</th></tr></thead>
        <tbody>${lineas.map(fila).join('')}</tbody>
        <tfoot><tr><td>Total</td><td>${rcNum(o.sol)}</td><td class="rc-c-emp">${rcNum(o.emp)}</td><td class="rc-c-ent">${rcNum(o.ent)}</td><td class="rc-c-falta">${rcNum(o.pend)}</td></tr></tfoot>
      </table>
      <div class="rc-sub" style="padding:6px 12px 10px">Falta = pedido − empacado − entregado.</div>
    </div>`;
}

function regCantEspFichaHtml(o) {
  const filas = o.esp;
  const c = tespConteo(filas);
  const abierto = regCant.nuevoPara === o.id;
  return `
    <div class="card rc-card" id="rc-esp-sec">
      <div class="rc-card-cab rc-card-cab-plano">
        <span>📏 Tallas especiales (${filas.length})</span>
      </div>
      ${filas.length ? `<div class="rc-chips" style="margin-bottom:8px">${tespConteoHtml(c)}</div>` : ''}
      ${abierto ? tespNuevoHtml(o.id)
        : `<button class="btn btn-success rc-agregar" onclick="tespNuevoAbrir('${o.id}')">➕ Agregar alumno especial</button>`}
      ${filas.length ? filas.map(tespFilaHtml).join('')
        : (abierto ? '' : '<div class="rc-sub" style="padding:8px 2px">Esta escuela no tiene alumnos de talla especial.</div>')}
    </div>`;
}

// ── Fila de un alumno especial (tocar = abrir para editar) ────────────

function tespFilaHtml(r) {
  const abierto = regCant.abiertos.has(r.id);
  const sucio = regCant.borradores.has(r.id);
  const est = tespEstado(r.estado);
  const medidas = TESP_MEDIDAS.filter(m => tespTxt(r[m.campo]))
    .map(m => `${m.corto} ${rcEsc(r[m.campo])}`).join(' · ');
  const meta = [r.grado, r.sexo, r.nie ? 'NIE ' + r.nie : '', r.empresa].filter(Boolean).map(rcEsc).join(' · ');
  return `
    <div class="tesp-fila${abierto ? ' abierta' : ''}" id="tesp-${r.id}">
      <button type="button" class="tesp-cab" onclick="tespToggle('${r.id}')" aria-expanded="${abierto}">
        <span class="tesp-cab-txt">
          <span class="tesp-nombre">${rcEsc(r.nombre)}</span>
          ${meta ? `<span class="tesp-meta">${meta}</span>` : ''}
          <span class="tesp-talla">${tespTxt(r.talla) ? '👕 ' + rcEsc(r.talla) : '<em class="tesp-sin">sin talla</em>'}${medidas ? ` <span class="tesp-medidas-txt">· ${medidas}</span>` : ''}</span>
          ${tespTxt(r.observaciones) ? `<span class="tesp-obs">📝 ${rcEsc(r.observaciones)}</span>` : ''}
        </span>
        <span class="tesp-lado">
          <span class="tesp-estado" style="background:${est.bg};color:${est.fg}">${est.ico} ${est.txt}</span>
          <span class="tesp-sucio-dot"${sucio ? '' : ' hidden'}>● sin guardar</span>
        </span>
      </button>
      ${abierto ? tespFormHtml(r) : ''}
    </div>`;
}

function tespFormHtml(r) {
  const id = r.id;
  const b = regCant.borradores.get(id) || {};
  const v = campo => (campo in b ? b[campo] : (r[campo] == null ? '' : r[campo]));
  const sucio = Object.keys(b).length > 0;
  const guardando = regCant.guardando.has(id);
  const input = (campo, txt, ph) => `
        <label>${txt}<input type="text" value="${rcEsc(v(campo))}" placeholder="${ph || ''}" autocomplete="off"
          data-campo="${campo}" oninput="tespCambio('${id}', this)"></label>`;
  return `
    <div class="tesp-form">
      ${input('talla', 'Talla', 'Ej: C16 / P18')}
      <div class="tesp-medidas">${TESP_MEDIDAS.map(m => input(m.campo, m.txt, 'cm')).join('')}</div>
      <div class="tesp-lbl">Estado</div>
      <div class="tesp-opciones">${TESP_ESTADOS.map(e => `
        <button type="button" class="tesp-op${v('estado') === e.val ? ' activo' : ''}" data-val="${e.val}"
          onclick="tespSetEstado('${id}', '${e.val}', this)">${e.ico} ${e.txt}</button>`).join('')}
      </div>
      <label>Observaciones<textarea rows="2" data-campo="observaciones" oninput="tespCambio('${id}', this)">${rcEsc(v('observaciones'))}</textarea></label>
      <div class="tesp-acciones">
        <span class="tesp-sucio-dot"${sucio ? '' : ' hidden'}>● Sin guardar</span>
        <button type="button" class="btn btn-ghost tesp-descartar"${sucio ? '' : ' hidden'} onclick="tespDescartar('${id}')">Descartar</button>
        <button type="button" class="btn ${sucio ? 'btn-success' : 'btn-ghost'} tesp-guardar" onclick="tespGuardar('${id}')"${guardando ? ' disabled' : ''}>${guardando ? 'Guardando…' : '💾 Guardar'}</button>
      </div>
    </div>`;
}

function tespRepintarFila(id) {
  const el = document.getElementById('tesp-' + id);
  const r = tespFila(id);
  if (el && r) el.outerHTML = tespFilaHtml(r);
}

function tespResaltar(id) {
  const el = document.getElementById('tesp-' + id);
  if (!el) return;
  el.classList.remove('flash');
  void el.offsetWidth;   // reinicia la animación
  el.classList.add('flash');
}

// Cerrar NO borra lo escrito: queda como borrador («● sin guardar»).
function tespToggle(id) {
  if (regCant.abiertos.has(id)) regCant.abiertos.delete(id);
  else regCant.abiertos.add(id);
  tespRepintarFila(id);
}

function tespCambio(id, el) {
  const r = tespFila(id);
  if (!r || !el || !el.dataset) return;
  tespAnotar(id, el.dataset.campo, el.value);
}

function tespSetEstado(id, val, btn) {
  tespAnotar(id, 'estado', val);
  const cont = btn && btn.parentElement;
  if (cont) cont.querySelectorAll('.tesp-op').forEach(b => b.classList.toggle('activo', b.dataset.val === val));
}

function tespAnotar(id, campo, valor) {
  const r = tespFila(id);
  if (!r || !campo) return;
  const b = regCant.borradores.get(id) || {};
  if (tespTxt(valor) === tespTxt(r[campo])) delete b[campo];
  else b[campo] = valor;
  if (Object.keys(b).length) regCant.borradores.set(id, b);
  else regCant.borradores.delete(id);
  tespMarcarSucio(id);
}

function tespMarcarSucio(id) {
  const el = document.getElementById('tesp-' + id);
  if (!el) return;
  const sucio = regCant.borradores.has(id);
  el.querySelectorAll('.tesp-sucio-dot, .tesp-descartar').forEach(x => { x.hidden = !sucio; });
  const g = el.querySelector('.tesp-guardar');
  if (g) {
    g.classList.toggle('btn-success', sucio);
    g.classList.toggle('btn-ghost', !sucio);
  }
}

function tespDescartar(id) {
  regCant.borradores.delete(id);
  tespRepintarFila(id);
}

async function tespGuardar(id) {
  const r = tespFila(id);
  if (!r || regCant.guardando.has(id)) return;
  const b = regCant.borradores.get(id);
  if (!b || !Object.keys(b).length) {
    showToast('No hay cambios que guardar.', 'info', 2500);
    return;
  }
  const patch = {};
  for (const [k, val] of Object.entries(b)) patch[k] = k === 'estado' ? val : (tespTxt(val) || null);
  patch.actualizado_en = new Date().toISOString();
  regCant.guardando.add(id);
  tespRepintarFila(id);
  try {
    const fila = await tespPatch(id, patch);
    Object.assign(r, fila || patch);
    regCant.borradores.delete(id);
    regCant.abiertos.delete(id);
    regCant.guardando.delete(id);
    showToast('Guardado: ' + r.nombre, 'success', 2500);
    renderRegistroCantidad();
    tespResaltar(id);
  } catch (e) {
    regCant.guardando.delete(id);
    tespRepintarFila(id);
    showToast('No se guardó: ' + e.message, 'error', 7000);
  }
}

// PATCH que devuelve la fila: si RLS no deja editar, PostgREST responde 200
// con [] (no da error); así se detecta y se avisa en vez de callar.
async function tespPatch(id, data) {
  const tok = (typeof authToken === 'function' ? authToken() : null) || SUPA_KEY;
  const res = await fetch(`${SUPA_URL}/rest/v1/talla_especial?id=eq.${id}&select=${TESP_SELECT}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json', 'apikey': SUPA_KEY,
      'Authorization': `Bearer ${tok}`, 'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('la sesión expiró; iniciá sesión de nuevo');
    const t = await res.text();
    let msg = t;
    try { const j = JSON.parse(t); msg = j.message || j.error || t; } catch (_) {}
    throw new Error(String(msg).slice(0, 200));
  }
  const filas = await res.json();
  if (!Array.isArray(filas) || !filas.length) throw new Error('no se encontró el alumno o no tenés permiso para editarlo');
  return filas[0];
}

// ── Agregar alumno especial ───────────────────────────────────────────

function tespNuevoAbrir(escId) {
  const deEsc = regCant.esp.filter(r => r.escuela_id === escId && r.empresa);
  const cuenta = new Map();
  for (const r of deEsc) cuenta.set(r.empresa, (cuenta.get(r.empresa) || 0) + 1);
  const empresa = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
  regCant.nuevoPara = escId;
  regCant.nuevo = { estado: 'pendiente', empresa: empresa ? empresa[0] : '' };
  renderRegistroCantidad();
  const el = document.getElementById('tesp-nuevo');
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
}

function tespNuevoCerrar() {
  regCant.nuevoPara = null;
  regCant.nuevo = {};
  renderRegistroCantidad();
}

function tespNuevoCampo(campo, valor) {
  regCant.nuevo[campo] = valor;
}

function tespNuevoOpcion(campo, valor, btn) {
  regCant.nuevo[campo] = regCant.nuevo[campo] === valor && campo !== 'estado' ? '' : valor;
  const cont = btn && btn.parentElement;
  if (cont) cont.querySelectorAll('.tesp-op').forEach(b => b.classList.toggle('activo', b.dataset.val === regCant.nuevo[campo]));
}

function tespNuevoHtml(escId) {
  const n = regCant.nuevo;
  const val = campo => rcEsc(n[campo] || '');
  const input = (campo, txt, ph, extra) => `
        <label>${txt}<input type="text" value="${val(campo)}" placeholder="${ph || ''}" autocomplete="off" ${extra || ''}
          oninput="tespNuevoCampo('${campo}', this.value)"></label>`;
  const opciones = (campo, lista) => `
      <div class="tesp-opciones">${lista.map(([v, txt]) => `
        <button type="button" class="tesp-op${n[campo] === v ? ' activo' : ''}" data-val="${v}"
          onclick="tespNuevoOpcion('${campo}', '${v}', this)">${txt}</button>`).join('')}
      </div>`;
  const grados = [...new Set(regCant.esp.map(r => tespTxt(r.grado)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  return `
    <div class="tesp-form tesp-nuevo" id="tesp-nuevo">
      <div class="tesp-nuevo-tit">➕ Alumno especial nuevo · ${rcEsc(regCantNombreEscuela(escId))}</div>
      ${input('nombre', 'Nombre *', 'APELLIDOS NOMBRES', 'id="tesp-n-nombre" style="text-transform:uppercase"')}
      <div class="tesp-medidas">
        ${input('grado', 'Grado', 'Ej: Primer Año', 'list="tesp-grados"')}
        ${input('nie', 'NIE', 'Número', 'inputmode="numeric"')}
      </div>
      <datalist id="tesp-grados">${grados.map(g => `<option value="${rcEsc(g)}">`).join('')}</datalist>
      <div class="tesp-lbl">Sexo</div>
      ${opciones('sexo', [['Mujer', '♀ Mujer'], ['Hombre', '♂ Hombre']])}
      <div class="tesp-lbl">Empresa</div>
      ${opciones('empresa', TESP_EMPRESAS.map(x => [x, x]))}
      ${input('talla', 'Talla', 'Ej: C16 / P18')}
      <div class="tesp-medidas">${TESP_MEDIDAS.map(m => input(m.campo, m.txt, 'cm')).join('')}</div>
      <div class="tesp-lbl">Estado</div>
      ${opciones('estado', TESP_ESTADOS.map(e => [e.val, e.ico + ' ' + e.txt]))}
      <label>Observaciones<textarea rows="2" oninput="tespNuevoCampo('observaciones', this.value)">${val('observaciones')}</textarea></label>
      <div class="tesp-acciones">
        <button type="button" class="btn btn-ghost" onclick="tespNuevoCerrar()">Cancelar</button>
        <button type="button" class="btn btn-success" id="tesp-n-agregar" onclick="tespAgregar('${escId}')">➕ Agregar</button>
      </div>
    </div>`;
}

async function tespAgregar(escId) {
  const n = regCant.nuevo;
  const nombre = tespTxt(n.nombre).toUpperCase();
  if (!nombre) {
    showToast('Falta el nombre del alumno.', 'error', 4000);
    const el = document.getElementById('tesp-n-nombre');
    if (el) el.focus();
    return;
  }
  const nie = tespTxt(n.nie);
  const repetido = nie && regCant.esp.find(r => tespTxt(r.nie) === nie);
  if (repetido) {
    showToast(`Ese NIE ya está: ${repetido.nombre} (${regCantNombreEscuela(repetido.escuela_id)}).`, 'warn', 7000);
    return;
  }
  const body = {
    temporada_id: regCant.temporadaId, escuela_id: escId, nombre,
    empresa: n.empresa || null, grado: tespTxt(n.grado) || null, sexo: n.sexo || null, nie: nie || null,
    talla: tespTxt(n.talla) || null, estado: n.estado || 'pendiente',
    observaciones: tespTxt(n.observaciones) || null,
  };
  for (const m of TESP_MEDIDAS) body[m.campo] = tespTxt(n[m.campo]) || null;
  const btn = document.getElementById('tesp-n-agregar');
  if (btn) { btn.disabled = true; btn.textContent = 'Agregando…'; }
  try {
    const res = await supaFetch('talla_especial', 'POST', body);
    const fila = Array.isArray(res) ? res[0] : res;
    if (!fila || !fila.id) throw new Error('no se pudo agregar (¿permiso?)');
    regCant.esp.push(fila);
    regCant.esp.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
    regCant.nuevoPara = null;
    regCant.nuevo = {};
    regCant.enfocar = fila.id;
    if (typeof buscadorCache !== 'undefined') buscadorCache.especiales = null;
    showToast('Agregado: ' + nombre, 'success', 3000);
    renderRegistroCantidad();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '➕ Agregar'; }
    showToast('No se agregó: ' + e.message, 'error', 7000);
  }
}

// ── Vista global «📏 Especiales» ──────────────────────────────────────

function tespFiltradas(opts = {}) {
  const q = opts.sinBusqueda ? '' : rcNorm(regCant.busqEsp);
  return regCant.esp.filter(r =>
    (opts.sinEstado || !regCant.filtroEstado || r.estado === regCant.filtroEstado) &&
    (opts.sinEmpresa || !regCant.filtroEmpresa || r.empresa === regCant.filtroEmpresa) &&
    (!q || rcNorm(r.nombre).includes(q) || rcNorm(r.nie).includes(q) ||
      rcNorm(regCantNombreEscuela(r.escuela_id)).includes(q)));
}

function tespFiltro(campo, valor) {
  if (campo === 'estado') regCant.filtroEstado = valor;
  if (campo === 'empresa') regCant.filtroEmpresa = valor;
  renderRegistroCantidad();
}

function tespBuscar(v) {
  regCant.busqEsp = v;
  const el = document.getElementById('rc-esp-lista');
  if (el) el.innerHTML = regCantEspListaHtml();
}

function regCantEspecialesHtml() {
  const cEst = tespConteo(tespFiltradas({ sinEstado: true, sinBusqueda: true }));
  const porEmp = tespFiltradas({ sinEmpresa: true, sinBusqueda: true });
  const empresas = [...new Set([...TESP_EMPRESAS, ...regCant.esp.map(r => r.empresa)])]
    .filter(x => x && /^[\w .-]+$/.test(x));   // va dentro de un onclick
  const chip = (campo, val, txt, n, actual) => `
      <button class="btn btn-sm ${actual === val ? 'btn-primary' : 'btn-ghost'}" onclick="tespFiltro('${campo}', '${val}')">${txt}${n == null ? '' : ` <span class="rc-n">${n}</span>`}</button>`;
  return `
    <div class="card rc-card">
      <div class="rc-resumen-tit">📏 Tallas especiales</div>
      <div class="rc-sub" style="margin-bottom:8px">Alumnos con medida propia: los únicos con nombre en esta temporada.</div>
      <div class="rc-filtro">
        <span class="rc-filtro-lbl">Estado</span>
        ${chip('estado', '', 'Todos', cEst.total, regCant.filtroEstado)}
        ${TESP_ESTADOS.map(e => chip('estado', e.val, e.ico + ' ' + e.txt, cEst[e.val], regCant.filtroEstado)).join('')}
      </div>
      <div class="rc-filtro">
        <span class="rc-filtro-lbl">Empresa</span>
        ${chip('empresa', '', 'Todas', porEmp.length, regCant.filtroEmpresa)}
        ${empresas.map(x => chip('empresa', x, rcEsc(x), porEmp.filter(r => r.empresa === x).length, regCant.filtroEmpresa)).join('')}
      </div>
      <div class="rc-buscar-fila">
        <input type="search" class="rc-buscar" placeholder="🔍 Nombre, NIE o escuela…" value="${rcEsc(regCant.busqEsp)}"
          oninput="tespBuscar(this.value)" aria-label="Buscar alumno especial">
        <button class="btn btn-primary" onclick="tespDescargarCSV()">⬇ Descargar CSV</button>
      </div>
    </div>
    <div id="rc-esp-lista">${regCantEspListaHtml()}</div>`;
}

function regCantEspListaHtml() {
  if (!regCant.esp.length) {
    return '<div class="alert alert-info">Todavía no hay alumnos de talla especial en esta temporada. Se agregan desde la ficha de cada escuela.</div>';
  }
  const filas = tespFiltradas();
  if (!filas.length) return '<div class="alert alert-info">Nadie con esos filtros.</div>';
  const grupos = new Map();
  for (const r of filas) {
    if (!grupos.has(r.escuela_id)) grupos.set(r.escuela_id, []);
    grupos.get(r.escuela_id).push(r);
  }
  const lista = [...grupos.entries()]
    .map(([id, arr]) => ({ id, arr, nombre: regCantNombreEscuela(id) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return `<div class="rc-sub" style="margin:0 2px 8px">${filas.length} alumno(s) en ${lista.length} escuela(s)</div>` +
    lista.map(g => `
      <div class="rc-grupo">
        <div class="rc-grupo-cab">
          <span class="rc-grupo-nom">🏫 ${rcEsc(g.nombre)} <span class="rc-n">${g.arr.length}</span></span>
          <button class="btn btn-ghost btn-sm" onclick="regCantAbrirEscuela('${g.id}')">Ver escuela ›</button>
        </div>
        <div class="rc-chips" style="margin:0 0 8px">${tespConteoHtml(tespConteo(regCant.esp.filter(r => r.escuela_id === g.id)))}</div>
        ${g.arr.map(tespFilaHtml).join('')}
      </div>`).join('');
}

function tespDescargarCSV() {
  const filas = tespFiltradas().slice().sort((a, b) =>
    regCantNombreEscuela(a.escuela_id).localeCompare(regCantNombreEscuela(b.escuela_id), 'es') ||
    String(a.grado || '').localeCompare(String(b.grado || ''), 'es') ||
    String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
  if (!filas.length) {
    showToast('No hay alumnos para descargar con esos filtros.', 'warn', 4000);
    return;
  }
  const esc = id => regCant.escuelas.get(id) || {};
  const cols = [
    { label: 'Escuela', get: r => esc(r.escuela_id).nombre || regCantNombreEscuela(r.escuela_id) },
    { label: 'CDE', get: r => esc(r.escuela_id).codigo_cde || '' },
    { label: 'Empresa', key: 'empresa' },
    { label: 'Grado', key: 'grado' },
    { label: 'Sexo', key: 'sexo' },
    { label: 'NIE', key: 'nie' },
    { label: 'Nombre', key: 'nombre' },
    { label: 'Talla', key: 'talla' },
    ...TESP_MEDIDAS.map(m => ({ label: m.txt, key: m.campo })),
    { label: 'Estado', get: r => tespEstado(r.estado).txt },
    { label: 'Observaciones', key: 'observaciones' },
    { label: 'Actualizado', get: r => String(r.actualizado_en || '').slice(0, 10) },
  ];
  const t = regCantTemporada();
  const d = new Date();   // fecha LOCAL (toISOString da la de UTC: de noche ya es mañana)
  const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const nombre = `tallas_especiales_${t ? t.codigo : 'temporada'}_${hoy}.csv`;
  descargarArchivo(nombre, arrayToCSV(filas, cols));
  showToast(`Descargado: ${filas.length} alumno(s).`, 'success', 3000);
}

let SUPA_URL = localStorage.getItem('supa_url') || 'https://kszdievqesveluzcnzsh.supabase.co';
let SUPA_KEY = localStorage.getItem('supa_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzemRpZXZxZXN2ZWx1emNuenNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTgwMTgsImV4cCI6MjA5MDM5NDAxOH0.r28goEyUxZeKK9j0efu1BXC8ssU9lYxRK7dp3BGix1M';

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

// ══════════════════════════════════════════════════════════════════════
// NAV
// ══════════════════════════════════════════════════════════════════════
function switchTab(tab, el) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + tab).classList.add('active');
  if (el) el.classList.add('active');
  if (tab === 'historial') cargarHistorial('trazo');
  if (tab === 'config') initConfig();
  if (tab === 'produccion') initProduccion();
  if (tab === 'nuevo') {} // menu se arma en init
  window.scrollTo(0, 0);
}

function irA(seccion) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + seccion).classList.add('active');
  window.scrollTo(0, 0);
  if (seccion === 'trazo') initTrazo();
  if (seccion === 'tendido') initTendido();
  if (seccion === 'bulto') initBulto();
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
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Prefer': method === 'POST' ? 'return=representation' : '' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
  return method === 'DELETE' ? null : res.json();
}

async function supaUploadFoto(file, trazoId) {
  const ext = file.name.split('.').pop();
  const path = `${trazoId}.${ext}`;
  const res = await fetch(`${SUPA_URL}/storage/v1/object/trazo-fotos/${path}`, {
    method: 'POST',
    headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': file.type },
    body: file
  });
  if (!res.ok) throw new Error('Error subiendo foto');
  return `${SUPA_URL}/storage/v1/object/public/trazo-fotos/${path}`;
}

async function supaUpdate(table, id, data) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
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
// (nada específico, el menú nuevo ya está visible por default)

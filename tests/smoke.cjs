#!/usr/bin/env node
// Smoke tests del bundle produccion.html
// Verifica:
//   1) El archivo existe y es razonable de tamaño.
//   2) Cada <script> block del bundle parsea sin errores de sintaxis JS.
//   3) Funciones críticas están definidas en el bundle (búsqueda por texto).
// Exit 0 = OK, 1 = falló.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROD = path.join(__dirname, '..', 'produccion.html');

function fail(msg) {
  console.error('❌ ' + msg);
  process.exit(1);
}
function ok(msg) {
  console.log('✓ ' + msg);
}

// 1) Existe + tamaño razonable
if (!fs.existsSync(PROD)) fail('produccion.html no existe. Corré `python build.py` o `pwsh ./build.ps1` primero.');
const stat = fs.statSync(PROD);
const sizeKB = stat.size / 1024;
if (sizeKB < 100) fail(`produccion.html es muy chico (${sizeKB.toFixed(1)} KB) — build incompleto?`);
if (sizeKB > 5000) fail(`produccion.html es muy grande (${sizeKB.toFixed(1)} KB) — algo está mal`);
ok(`Bundle existe (${sizeKB.toFixed(1)} KB)`);

const html = fs.readFileSync(PROD, 'utf8');

// 2) Extraer scripts inline (ignorar src="" externos como html2pdf, supabase, xlsx)
const scriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, count = 0, totalScriptKB = 0;
const errors = [];
while ((m = scriptRegex.exec(html)) !== null) {
  const code = m[1];
  if (!code.trim()) continue;
  count++;
  totalScriptKB += code.length / 1024;
  // Validar sintaxis usando vm.Script (compila sin ejecutar). Wrapeo en función
  // para permitir `return`, `await` top-level, etc., que sería tope para JS plano.
  try {
    new vm.Script(`async function _t(){\n${code}\n}`, { filename: `script[${count}]` });
  } catch (e) {
    errors.push(`Script #${count} (~${(code.length/1024).toFixed(1)}KB): ${e.message}`);
  }
}
if (errors.length > 0) {
  for (const e of errors) console.error('   ' + e);
  fail(`${errors.length} script(s) con error de sintaxis`);
}
ok(`Sintaxis JS OK (${count} script(s), ${totalScriptKB.toFixed(1)} KB)`);

// 3) Funciones críticas presentes (defensivo contra regressions de build order)
const ESPERADAS = [
  // Core
  'function bootApp', 'function supaFetch', 'function supaFetchAll',
  // Tabs
  'function initBodega', 'function initProduccion', 'function initEstadistica',
  'function initRegistro', 'function initConfig', 'function initDashboard',
  // Funciones de negocio críticas
  'async function empacarAlumnosDesdeRegistro',
  'async function desempacarPieza',
  'async function initEmpaque',
  'async function emqAbrirReserva',
  'async function emqEmpacar',
  'async function emqEntregar',
  'async function descargarResumenEjecutivoPDF',
  'async function descargarListaEmpaquePDF',
  'async function descargarEtiquetasBolsaPDF',
  // Features recientes
  'function initTallasResumen', 'function initHistorico',
  'function buscadorOnInput', 'function actualizarBadgeEscuelasEsperando',
  'function cachedFetch', 'function invalidarCache',
];
const faltantes = ESPERADAS.filter(needle => !html.includes(needle));
if (faltantes.length > 0) {
  console.error('   Faltan funciones:');
  for (const f of faltantes) console.error('     - ' + f);
  fail(`${faltantes.length} función(es) crítica(s) faltante(s) en el bundle`);
}
ok(`${ESPERADAS.length} funciones críticas presentes`);

// 4) Verificar paridad de <script>/</script> — si hay más cierres que aperturas,
//    algún literal rompe el bundle al cargar.
const opens = (html.match(/<script(?:\s[^>]*)?>/gi) || []).length;
const closes = (html.match(/<\/script>/gi) || []).length;
if (closes > opens) {
  fail(`Más </script> (${closes}) que <script> (${opens}) — algún literal sin escapar rompe el bundle`);
}
ok(`Paridad <script>/</script> OK (${opens} aperturas / ${closes} cierres)`);

console.log('\n✓ Smoke tests pasaron OK');
process.exit(0);

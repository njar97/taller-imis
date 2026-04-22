// ══════════════════════════════════════════════════════════════════════
// REPORTES IMPRIMIBLES (v26)
// Hoja de tallaje, lista de empaque, hoja de entrega
// ══════════════════════════════════════════════════════════════════════

async function imprimirHojaTallaje(escuelaId, grado) {
  try {
    const esc = registroCache.escuelas.find(e => e.escuela_id === escuelaId);
    if (!esc) { alert('Escuela no encontrada'); return; }
    
    // Obtener alumnos del grado (si hay). Si no, genera hoja en blanco
    const alumnos = grado 
      ? await supaFetch('alumno', 'GET', null, 
          `?escuela_id=eq.${escuelaId}&temporada_id=eq.${registroCache.temporadaActual}&grado=eq.${encodeURIComponent(grado)}&order=nombre&limit=200`)
      : [];
    
    const filasVacias = Math.max(30 - alumnos.length, 10);
    abrirVentanaImpresion(generarHojaTallaje(esc, grado, alumnos, filasVacias));
  } catch(e) { alert('Error: ' + e.message); }
}

function generarHojaTallaje(esc, grado, alumnos, vacias) {
  const fecha = new Date().toLocaleDateString('es-SV');
  const rows = [];
  
  alumnos.forEach((a, i) => {
    rows.push(`
      <tr>
        <td class="num">${i+1}</td>
        <td class="nombre">${a.nombre}</td>
        <td class="sexo">${a.sexo === 'F' ? '♀' : (a.sexo === 'M' ? '♂' : '')}</td>
        <td class="talla-t">${a.talla_top_key || ''}</td>
        <td class="talla-b">${a.talla_bottom_key || ''}</td>
        <td class="largo"></td>
        <td class="obs"></td>
      </tr>
    `);
  });
  
  for (let i = 0; i < vacias; i++) {
    rows.push(`
      <tr>
        <td class="num">${alumnos.length + i + 1}</td>
        <td class="nombre"></td>
        <td class="sexo"></td>
        <td class="talla-t"></td>
        <td class="talla-b"></td>
        <td class="largo"></td>
        <td class="obs"></td>
      </tr>
    `);
  }
  
  return `
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Hoja de Tallaje - ${esc.escuela_nombre} - ${grado || ''}</title>
    <style>
      @page { size: A4; margin: 10mm; }
      body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; margin: 0; }
      .header { border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
      .header h1 { font-size: 14pt; margin: 0; }
      .header-info { display: flex; justify-content: space-between; margin-top: 4px; font-size: 9pt; }
      .header-info div { flex: 1; }
      table { width: 100%; border-collapse: collapse; font-size: 9pt; }
      th, td { border: 1px solid #000; padding: 3px 4px; text-align: left; }
      th { background: #DDD; text-align: center; font-size: 8pt; }
      td.num { width: 25px; text-align: center; color: #666; }
      td.nombre { width: 30%; }
      td.sexo { width: 20px; text-align: center; }
      td.talla-t { width: 50px; text-align: center; font-family: monospace; }
      td.talla-b { width: 50px; text-align: center; font-family: monospace; }
      td.largo { width: 40px; text-align: center; }
      td.obs { }
      tr { height: 18px; }
      .footer { margin-top: 16px; font-size: 9pt; display: flex; justify-content: space-between; }
      .firma { border-top: 1px solid #000; padding-top: 4px; width: 45%; text-align: center; }
      @media print { .no-print { display: none; } }
    </style></head>
    <body>
    <div class="header">
      <h1>Hoja de Tallaje</h1>
      <div class="header-info">
        <div><strong>Centro Escolar:</strong> ${esc.escuela_nombre}</div>
        <div><strong>CDE:</strong> ${esc.codigo_cde}</div>
      </div>
      <div class="header-info">
        <div><strong>Grado:</strong> ${grado || '____________'}</div>
        <div><strong>Fecha:</strong> ${fecha}</div>
        <div><strong>Tallador:</strong> ____________________</div>
      </div>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Nombre del alumno</th>
          <th>Sx</th>
          <th>Camisa/Blusa</th>
          <th>Pantalón/Falda</th>
          <th>Largo</th>
          <th>Observaciones</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join('')}
      </tbody>
    </table>
    
    <div class="footer">
      <div class="firma">Firma del tallador</div>
      <div class="firma">Firma del director</div>
    </div>
    
    <div class="no-print" style="margin-top:20px;text-align:center">
      <button onclick="window.print()" style="padding:10px 20px;font-size:14pt">🖨 Imprimir</button>
      <button onclick="window.close()" style="padding:10px 20px;font-size:14pt">✕ Cerrar</button>
    </div>
    </body></html>
  `;
}

async function imprimirListaEmpaque(escuelaId) {
  try {
    const esc = registroCache.escuelas.find(e => e.escuela_id === escuelaId);
    if (!esc) return;
    
    const alumnos = await supaFetch('alumno', 'GET', null, 
      `?escuela_id=eq.${escuelaId}&temporada_id=eq.${registroCache.temporadaActual}&activo=eq.true&order=nivel,grado,nombre&limit=2000`);
    
    if (alumnos.length === 0) { alert('Sin alumnos cargados'); return; }
    
    abrirVentanaImpresion(generarListaEmpaque(esc, alumnos));
  } catch(e) { alert('Error: ' + e.message); }
}

function generarListaEmpaque(esc, alumnos) {
  const fecha = new Date().toLocaleDateString('es-SV');
  
  // Agrupar por grado
  const grupos = {};
  for (const a of alumnos) {
    const g = `${a.nivel || ''} · ${a.grado || 'Sin grado'}`;
    if (!grupos[g]) grupos[g] = [];
    grupos[g].push(a);
  }
  
  let contenido = '';
  let contador = 0;
  
  for (const [grado, lista] of Object.entries(grupos)) {
    const completos = lista.filter(a => a.estado_top === 'empacado' && a.estado_bottom === 'empacado').length;
    
    contenido += `
      <div class="grupo">
        <div class="grupo-header">
          ${grado} 
          <span style="float:right;font-weight:normal">${completos}/${lista.length} empacados</span>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:25px">#</th>
              <th>Nombre</th>
              <th style="width:60px">Top</th>
              <th style="width:20px">☑</th>
              <th style="width:60px">Bottom</th>
              <th style="width:20px">☑</th>
              <th style="width:30px">Obs</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    lista.forEach(a => {
      contador++;
      const tCheck = a.estado_top === 'empacado' ? '☑' : '☐';
      const bCheck = a.estado_bottom === 'empacado' ? '☑' : '☐';
      contenido += `
        <tr>
          <td class="num">${contador}</td>
          <td class="nombre">${a.nombre}</td>
          <td class="talla">${a.talla_top_key || '—'}</td>
          <td class="check">${tCheck}</td>
          <td class="talla">${a.talla_bottom_key || '—'}</td>
          <td class="check">${bCheck}</td>
          <td></td>
        </tr>
      `;
    });
    contenido += `</tbody></table></div>`;
  }
  
  return `
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Lista de Empaque - ${esc.escuela_nombre}</title>
    <style>
      @page { size: A4; margin: 10mm; }
      body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; margin: 0; }
      .header { border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
      .header h1 { font-size: 14pt; margin: 0; }
      .header-info { display: flex; justify-content: space-between; margin-top: 4px; font-size: 9pt; }
      .grupo { margin-bottom: 12px; page-break-inside: avoid; }
      .grupo-header { background: #EEE; padding: 4px 8px; font-weight: bold; border: 1px solid #000; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #000; padding: 2px 4px; font-size: 9pt; }
      th { background: #DDD; text-align: center; font-size: 8pt; }
      td.num { text-align: center; color: #666; }
      td.nombre { }
      td.talla { text-align: center; font-family: monospace; }
      td.check { text-align: center; font-size: 14pt; }
      tr { height: 16px; }
      .footer { margin-top: 20px; page-break-inside: avoid; }
      .firma { border-top: 1px solid #000; padding-top: 4px; width: 45%; display: inline-block; text-align: center; margin-right: 10%; }
      @media print { .no-print { display: none; } }
    </style></head>
    <body>
    <div class="header">
      <h1>Lista de Empaque</h1>
      <div class="header-info">
        <div><strong>Centro Escolar:</strong> ${esc.escuela_nombre}</div>
        <div><strong>CDE:</strong> ${esc.codigo_cde}</div>
        <div><strong>Fecha:</strong> ${fecha}</div>
      </div>
      <div style="font-size:10pt;margin-top:4px">
        Total: <strong>${alumnos.length}</strong> alumnos
      </div>
    </div>
    
    ${contenido}
    
    <div class="footer">
      <div class="firma">Armado por</div>
      <div class="firma">Revisado por</div>
    </div>
    
    <div class="no-print" style="margin-top:20px;text-align:center">
      <button onclick="window.print()" style="padding:10px 20px;font-size:14pt">🖨 Imprimir</button>
      <button onclick="window.close()" style="padding:10px 20px;font-size:14pt">✕ Cerrar</button>
    </div>
    </body></html>
  `;
}

async function imprimirHojaEntrega(escuelaId) {
  try {
    const esc = registroCache.escuelas.find(e => e.escuela_id === escuelaId);
    if (!esc) return;
    
    // Resumen por talla pedido vs entregado
    const pedidos = await supaFetch('pedido', 'GET', null, 
      `?escuela_id=eq.${escuelaId}&order=nivel,cod_prenda,talla_key&limit=500`);
    
    if (pedidos.length === 0) { alert('Sin pedidos cargados para esta escuela'); return; }
    
    abrirVentanaImpresion(generarHojaEntrega(esc, pedidos));
  } catch(e) { alert('Error: ' + e.message); }
}

function generarHojaEntrega(esc, pedidos) {
  const fecha = new Date().toLocaleDateString('es-SV');
  
  // Agrupar por nivel y prenda
  const grupos = {};
  for (const p of pedidos) {
    const k = `${p.nivel} · ${p.nombre_prenda || p.cod_prenda}`;
    if (!grupos[k]) grupos[k] = [];
    grupos[k].push(p);
  }
  
  const totalSol = pedidos.reduce((s,p) => s + p.cantidad_solicitada, 0);
  const totalEnt = pedidos.reduce((s,p) => s + (p.cantidad_entregada || 0), 0);
  
  let contenido = '';
  for (const [grupo, lista] of Object.entries(grupos)) {
    const sol = lista.reduce((s,p) => s + p.cantidad_solicitada, 0);
    const ent = lista.reduce((s,p) => s + (p.cantidad_entregada || 0), 0);
    
    contenido += `
      <div class="grupo">
        <div class="grupo-header">
          ${grupo} <span style="float:right">${ent}/${sol}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Talla</th>
              <th>Pedido</th>
              <th>Entregado</th>
              <th>Esta entrega</th>
              <th>Recibe (firma)</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map(p => `
              <tr>
                <td class="talla">${p.talla_key}</td>
                <td class="num">${p.cantidad_solicitada}</td>
                <td class="num">${p.cantidad_entregada || 0}</td>
                <td class="num"></td>
                <td></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  return `
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Hoja de Entrega - ${esc.escuela_nombre}</title>
    <style>
      @page { size: A4; margin: 10mm; }
      body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; margin: 0; }
      .header { border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
      .header h1 { font-size: 14pt; margin: 0; }
      .header-info { display: flex; justify-content: space-between; margin-top: 4px; font-size: 9pt; }
      .resumen { background: #F5F5F5; padding: 6px; margin: 8px 0; border: 1px solid #000; }
      .grupo { margin-bottom: 10px; page-break-inside: avoid; }
      .grupo-header { background: #EEE; padding: 4px 8px; font-weight: bold; border: 1px solid #000; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #000; padding: 3px 6px; }
      th { background: #DDD; font-size: 9pt; }
      td.talla { font-family: monospace; font-weight: bold; }
      td.num { text-align: center; }
      .footer { margin-top: 30px; page-break-inside: avoid; }
      .firma { border-top: 1px solid #000; padding-top: 4px; width: 30%; display: inline-block; text-align: center; margin: 0 10%; }
      @media print { .no-print { display: none; } }
    </style></head>
    <body>
    <div class="header">
      <h1>Hoja de Entrega</h1>
      <div class="header-info">
        <div><strong>Centro Escolar:</strong> ${esc.escuela_nombre}</div>
        <div><strong>CDE:</strong> ${esc.codigo_cde}</div>
        <div><strong>Fecha:</strong> ${fecha}</div>
      </div>
      <div class="header-info">
        <div><strong>Director:</strong> ${esc.director || '____________________'}</div>
        <div><strong>Contrato:</strong> ME-03/${(new Date()).getFullYear()}</div>
      </div>
    </div>
    
    <div class="resumen">
      <strong>Resumen general:</strong>
      Piezas contratadas: <strong>${totalSol}</strong> · 
      Entregadas antes: <strong>${totalEnt}</strong> · 
      Pendientes: <strong>${totalSol - totalEnt}</strong>
    </div>
    
    ${contenido}
    
    <div class="footer">
      <div class="firma">Entrega (Proveedor)</div>
      <div class="firma">Recibe (Director)</div>
      <div class="firma">Sello Centro Escolar</div>
    </div>
    
    <div class="no-print" style="margin-top:20px;text-align:center">
      <button onclick="window.print()" style="padding:10px 20px;font-size:14pt">🖨 Imprimir</button>
      <button onclick="window.close()" style="padding:10px 20px;font-size:14pt">✕ Cerrar</button>
    </div>
    </body></html>
  `;
}

function abrirVentanaImpresion(html) {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('Tu navegador bloqueó la ventana. Permití popups y reintentá.'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// Menú de reportes para la escuela actual
function abrirMenuReportes(escuelaId) {
  const esc = registroCache.escuelas.find(e => e.escuela_id === escuelaId);
  if (!esc) return;
  
  const modal = document.getElementById('reportes-modal');
  if (!modal) return;
  
  document.getElementById('rep-escuela-nombre').textContent = esc.escuela_nombre;
  
  // Obtener grados únicos de la escuela para el selector
  supaFetch('alumno', 'GET', null, 
    `?escuela_id=eq.${escuelaId}&temporada_id=eq.${registroCache.temporadaActual}&select=grado&limit=5000`)
    .then(alumnos => {
      const grados = [...new Set(alumnos.map(a => a.grado).filter(Boolean))].sort();
      const sel = document.getElementById('rep-grado-select');
      sel.innerHTML = '<option value="">— (hoja en blanco) —</option>' + 
        grados.map(g => `<option value="${g}">${g}</option>`).join('');
    }).catch(() => {});
  
  modal.dataset.escuelaId = escuelaId;
  modal.style.display = 'flex';
}

function cerrarMenuReportes() {
  const modal = document.getElementById('reportes-modal');
  if (modal) modal.style.display = 'none';
}

function ejecutarReporte(tipo) {
  const modal = document.getElementById('reportes-modal');
  const escuelaId = modal.dataset.escuelaId;
  if (!escuelaId) return;
  
  if (tipo === 'tallaje') {
    const grado = document.getElementById('rep-grado-select').value;
    imprimirHojaTallaje(escuelaId, grado);
  } else if (tipo === 'empaque') {
    imprimirListaEmpaque(escuelaId);
  } else if (tipo === 'entrega') {
    imprimirHojaEntrega(escuelaId);
  }
  cerrarMenuReportes();
}

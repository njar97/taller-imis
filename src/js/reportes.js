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
    
    const alumnos = await supaFetchAll('alumno',
      `?escuela_id=eq.${escuelaId}&temporada_id=eq.${registroCache.temporadaActual}&activo=eq.true&order=nivel,grado,nombre`);
    
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

// Versión PDF descargable (mobile-friendly) de la lista de empaque.
// Usa generarPdfDirecto que está en alumnos_global.js (lazy-load html2pdf).
// Se puede llamar desde cualquier lugar pasando solo escuelaId.
async function descargarListaEmpaquePDF(escuelaId) {
  try {
    const rows = await supaFetch('escuela', 'GET', null, `?id=eq.${escuelaId}&select=id,nombre,codigo_cde,alias&limit=1`);
    if (!rows || !rows[0]) { alert('Escuela no encontrada'); return; }
    const e = rows[0];
    const esc = { escuela_id: e.id, escuela_nombre: e.nombre || e.alias || '', codigo_cde: e.codigo_cde || '' };

    // Temporada activa para filtrar
    const tempActiva = (registroCache?.temporadas || []).find(t => t.estado === 'activa')
      || (registroCache?.temporadas || [])[0];
    const tempFilter = tempActiva ? `&temporada_id=eq.${tempActiva.id}` : '';

    const alumnos = await supaFetchAll('alumno',
      `?escuela_id=eq.${escuelaId}&activo=eq.true${tempFilter}&order=nivel,grado,nombre`);
    if (alumnos.length === 0) { alert('Sin alumnos cargados para esta escuela'); return; }

    const html = generarListaEmpaque(esc, alumnos);
    const safe = (esc.escuela_nombre || 'esc').replace(/[^\w]+/g, '_').slice(0, 40);
    await generarPdfDirecto(html, `lista-empaque-${safe}.pdf`);
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

// ─── RESUMEN EJECUTIVO POR ESCUELA (PDF de 2 hojas) ───────────────────
// Hoja 1: encabezado, resumen contrato (con balance), desglose nivel×grado×sexo, fechas.
// Hoja 2: yardaje por color (utilizado vs recibido) + recomendaciones.
async function descargarResumenEjecutivoPDF(escuelaId) {
  try {
    // 1) Escuela + temporada activa
    const escRows = await supaFetch('escuela', 'GET', null,
      `?id=eq.${escuelaId}&select=id,nombre,codigo_cde,alias,director,telefono&limit=1`);
    if (!escRows || !escRows[0]) { alert('Escuela no encontrada'); return; }
    const esc = escRows[0];
    const temps = await supaFetch('vw_temporada_resumen', 'GET', null, '?order=anio.desc&limit=10');
    const temp = (temps || []).find(t => t.estado === 'activa') || (temps || [])[0];
    if (!temp) { alert('No hay temporada cargada'); return; }

    // 2) Datos en paralelo
    const [alumnos, pedidos, contratos, entregas] = await Promise.all([
      supaFetchAll('alumno',
        `?escuela_id=eq.${escuelaId}&temporada_id=eq.${temp.id}&activo=eq.true&select=nivel,ciclo,grado,sexo,prenda_top,talla_top_key,prenda_bottom,talla_bottom_key,estado_top,estado_bottom,creado_en,actualizado_en`),
      supaFetchAll('pedido',
        `?escuela_id=eq.${escuelaId}&select=nivel,cod_prenda,nombre_prenda,cantidad_solicitada,cantidad_entregada`),
      supaFetchAll('contrato_escuela',
        `?escuela_id=eq.${escuelaId}&anio=eq.${temp.anio}&select=tela_celeste_yd,tela_blanca_yd,tela_azul_yd,tela_beige_yd&limit=1`),
      supaFetchAll('entrega_escuela',
        `?escuela_id=eq.${escuelaId}&select=fecha,cantidad_piezas,receptor&order=fecha.asc`),
    ]);

    // 3) Resumen contrato
    const totalSolicitado = pedidos.reduce((s,p) => s + (Number(p.cantidad_solicitada)||0), 0);
    const totalEntregado  = pedidos.reduce((s,p) => s + (Number(p.cantidad_entregada)||0), 0);
    const balance = totalEntregado - totalSolicitado;

    // Desglose por prenda
    const prendaMap = {};
    for (const p of pedidos) {
      const k = p.nombre_prenda || p.cod_prenda || '?';
      if (!prendaMap[k]) prendaMap[k] = { prenda: k, sol: 0, ent: 0 };
      prendaMap[k].sol += Number(p.cantidad_solicitada)||0;
      prendaMap[k].ent += Number(p.cantidad_entregada)||0;
    }
    const prendaArr = Object.values(prendaMap).sort((a,b) => b.sol - a.sol);

    // 4) Desglose nivel × grado × sexo
    const desglose = {};
    for (const a of alumnos) {
      const k = `${a.nivel||'?'}|${a.grado||'?'}`;
      if (!desglose[k]) desglose[k] = { nivel: a.nivel||'?', grado: a.grado||'?', M:0, F:0, total:0 };
      if (a.sexo === 'M') desglose[k].M++; else if (a.sexo === 'F') desglose[k].F++;
      desglose[k].total++;
    }
    const desgloseArr = Object.values(desglose).sort((a,b) =>
      (a.nivel||'').localeCompare(b.nivel||'') ||
      (a.grado||'').localeCompare(b.grado||'', 'es', { numeric: true }));
    const totM = desgloseArr.reduce((s,r) => s + r.M, 0);
    const totF = desgloseArr.reduce((s,r) => s + r.F, 0);

    // 5) Fechas clave
    const conTallas = alumnos.filter(a => a.talla_top_key || a.talla_bottom_key);
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-SV', { day:'2-digit', month:'short', year:'numeric' }) : '—';
    const fechaTallaje = conTallas.length > 0
      ? fmtDate(new Date(Math.min(...conTallas.map(a => new Date(a.actualizado_en || a.creado_en).getTime()))))
      : null;
    const entregasArr = (entregas || []).filter(e => e.fecha);

    // 6) Yardaje (reusa factores definidos en yardaje.js)
    const yardajeData = _computarYardajeEscuelaParaResumen(alumnos);
    const telaRec = (contratos && contratos[0]) || {};
    const balanceTela = {
      celeste: (Number(telaRec.tela_celeste_yd)||0) - yardajeData.celeste,
      blanca:  (Number(telaRec.tela_blanca_yd)||0)  - yardajeData.blanca,
      azul:    (Number(telaRec.tela_azul_yd)||0)    - yardajeData.azul,
      beige:   (Number(telaRec.tela_beige_yd)||0)   - yardajeData.beige,
    };

    // 7) Generar HTML 2 páginas
    const html = _htmlResumenEjecutivo({
      esc, temp, totalSolicitado, totalEntregado, balance, prendaArr,
      desgloseArr, alumnos, totM, totF, fechaTallaje, entregasArr,
      yardajeData, telaRec, balanceTela,
    });

    const safe = (esc.nombre || 'esc').replace(/[^\w]+/g, '_').slice(0, 40);
    await generarPdfDirecto(html, `resumen-ejecutivo-${safe}.pdf`);
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

function _computarYardajeEscuelaParaResumen(alumnos) {
  // Reusa los factores de yardaje.js (YARDAJE_FACTORES + YARDAJE_NIVELES)
  // que están en globalScope tras cargar el bundle.
  const acc = { celeste: 0, blanca: 0, azul: 0, beige: 0 };
  if (typeof YARDAJE_FACTORES === 'undefined' || typeof YARDAJE_NIVELES === 'undefined') {
    return acc;
  }
  for (const n of YARDAJE_NIVELES) {
    const enNivel = alumnos.filter(n.match);
    const m = enNivel.filter(a => a.sexo === 'M');
    const f = enNivel.filter(a => a.sexo === 'F');
    const mTop = m.filter(a => a.prenda_top).length;
    const fTop = f.filter(a => a.prenda_top).length;
    const mBot = m.filter(a => a.prenda_bottom).length;
    const fBot = f.filter(a => a.prenda_bottom).length;
    const fact = YARDAJE_FACTORES[n.key] || {};
    for (const [color, factor] of Object.entries(fact)) {
      const esTop = color === 'celeste' || color === 'blanca';
      const cantM = esTop ? mTop : mBot;
      const cantF = esTop ? fTop : fBot;
      acc[color] += cantM * factor.M + cantF * factor.F;
    }
  }
  return acc;
}

function _htmlResumenEjecutivo(d) {
  const hoy = new Date().toLocaleDateString('es-SV', { day:'2-digit', month:'short', year:'numeric' });
  const fmtYd = (n) => n > 0 ? n.toFixed(2) + ' yd' : '—';
  const fmtDiff = (n) => {
    if (Math.abs(n) < 0.5) return '—';
    return (n>0?'+':'') + n.toFixed(2) + ' yd';
  };
  const balanceLabel = d.balance < 0
    ? `<span style="color:#c44">Falta entregar ${(-d.balance).toLocaleString()}</span>`
    : d.balance > 0
      ? `<span style="color:#a82">Se entregó ${d.balance.toLocaleString()} de más</span>`
      : '<span style="color:#2a6">Entrega completa</span>';

  // Página 1
  const pagina1 = `
    <div class="page">
      <div class="header">
        <h1>Resumen Ejecutivo</h1>
        <div class="hsub">
          <div><strong>${d.esc.nombre || ''}</strong>${d.esc.alias?' · '+d.esc.alias:''}</div>
          <div>CDE ${d.esc.codigo_cde || '—'}${d.esc.director?' · Director: '+d.esc.director:''}${d.esc.telefono?' · '+d.esc.telefono:''}</div>
          <div style="margin-top:4px">Temporada: <strong>${d.temp.codigo || d.temp.nombre || d.temp.anio || '—'}</strong> · Informe: ${hoy}</div>
        </div>
      </div>

      <h2>Resumen de contrato</h2>
      <table class="kpi-table">
        <tr>
          <td><div class="kpi-lbl">Solicitadas</div><div class="kpi-val">${d.totalSolicitado.toLocaleString()}</div></td>
          <td><div class="kpi-lbl">Entregadas</div><div class="kpi-val" style="color:#2a6">${d.totalEntregado.toLocaleString()}</div></td>
          <td><div class="kpi-lbl">Balance</div><div class="kpi-val">${balanceLabel}</div></td>
        </tr>
      </table>
      ${d.prendaArr.length > 0 ? `
        <table class="t small">
          <thead><tr><th>Prenda</th><th class="r">Solicitadas</th><th class="r">Entregadas</th><th class="r">Diferencia</th></tr></thead>
          <tbody>
            ${d.prendaArr.map(p => {
              const diff = p.ent - p.sol;
              return `<tr>
                <td><strong>${_esc(p.prenda)}</strong></td>
                <td class="r">${p.sol}</td>
                <td class="r">${p.ent}</td>
                <td class="r" style="color:${diff<0?'#c44':(diff>0?'#a82':'#888')};font-weight:600">${diff===0?'—':(diff>0?'+':'')+diff}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      ` : ''}

      <h2>Desglose por nivel / grado / sexo</h2>
      ${d.desgloseArr.length === 0 ? '<div class="muted">Sin alumnos cargados.</div>' : `
        <table class="t small">
          <thead><tr><th>Nivel</th><th>Grado</th><th class="r">♂ M</th><th class="r">♀ F</th><th class="r">Total</th></tr></thead>
          <tbody>
            ${d.desgloseArr.map(r => `
              <tr>
                <td>${_esc(r.nivel)}</td>
                <td>${_esc(r.grado)}</td>
                <td class="r">${r.M}</td>
                <td class="r">${r.F}</td>
                <td class="r"><strong>${r.total}</strong></td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;background:#f5f7fa">
              <td colspan="2">TOTAL</td>
              <td class="r">${d.totM}</td>
              <td class="r">${d.totF}</td>
              <td class="r">${d.alumnos.length}</td>
            </tr>
          </tfoot>
        </table>
      `}

      <h2>Fechas clave</h2>
      <table class="t small">
        <tr><td>📏 Primera toma de tallas</td><td><strong>${d.fechaTallaje || 'Sin tallar aún'}</strong></td></tr>
        ${d.entregasArr.length === 0
          ? `<tr><td>🚚 Entregas</td><td><em>Sin entregas registradas</em></td></tr>`
          : d.entregasArr.map((e,i) => `
              <tr>
                <td>🚚 Entrega ${i+1}</td>
                <td><strong>${new Date(e.fecha).toLocaleDateString('es-SV', { day:'2-digit', month:'short', year:'numeric' })}</strong> · ${e.cantidad_piezas||0} pieza(s)${e.receptor?' · '+_esc(e.receptor):''}</td>
              </tr>
          `).join('')}
      </table>
    </div>
  `;

  // Página 2 — Yardaje
  const tieneRecibida = (Number(d.telaRec.tela_celeste_yd)||0) + (Number(d.telaRec.tela_blanca_yd)||0)
                      + (Number(d.telaRec.tela_azul_yd)||0)    + (Number(d.telaRec.tela_beige_yd)||0) > 0;
  const filasTela = [
    { color:'Celeste', rec: Number(d.telaRec.tela_celeste_yd)||0, util: d.yardajeData.celeste, dif: d.balanceTela.celeste, hex:'#8EC5E8' },
    { color:'Blanca',  rec: Number(d.telaRec.tela_blanca_yd)||0,  util: d.yardajeData.blanca,  dif: d.balanceTela.blanca,  hex:'#FFF' },
    { color:'Azul',    rec: Number(d.telaRec.tela_azul_yd)||0,    util: d.yardajeData.azul,    dif: d.balanceTela.azul,    hex:'#1F4E79' },
    { color:'Beige',   rec: Number(d.telaRec.tela_beige_yd)||0,   util: d.yardajeData.beige,   dif: d.balanceTela.beige,   hex:'#D4C59E' },
  ];
  const totRec = filasTela.reduce((s,r) => s + r.rec, 0);
  const totUtil = filasTela.reduce((s,r) => s + r.util, 0);
  const totDif = totRec - totUtil;
  const accion = (dif) => dif > 0.5 ? ['↩ devolver','#2a6'] : dif < -0.5 ? ['➕ solicitar más','#c44'] : ['✓ ok','#666'];

  const pagina2 = `
    <div class="page page-break">
      <div class="header">
        <h1>Resumen Ejecutivo · Hoja 2</h1>
        <div class="hsub">
          <div><strong>${d.esc.nombre || ''}</strong> · CDE ${d.esc.codigo_cde || '—'}</div>
          <div>Tela y yardaje</div>
        </div>
      </div>

      <h2>Tela utilizada vs recibida</h2>
      ${!tieneRecibida ? `
        <div class="alert">No hay tela registrada como recibida en el contrato. Cargá los valores en el formulario de escuela (Registro → ✏ Editar escuela) para que el balance se muestre.</div>
      ` : ''}

      <table class="t">
        <thead>
          <tr>
            <th>Color de tela</th>
            <th class="r">Recibida</th>
            <th class="r">Utilizada (cálculo)</th>
            <th class="r">Diferencia</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          ${filasTela.map(r => {
            const [acc, col] = accion(r.dif);
            return `
              <tr>
                <td>
                  <span style="display:inline-block;width:12px;height:12px;background:${r.hex};border:1px solid #666;margin-right:6px"></span>
                  <strong>${r.color}</strong>
                </td>
                <td class="r">${fmtYd(r.rec)}</td>
                <td class="r" style="color:#26a">${fmtYd(r.util)}</td>
                <td class="r" style="font-weight:700;color:${col}">${fmtDiff(r.dif)}</td>
                <td style="color:${col};font-weight:600">${acc}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr style="font-weight:700;background:#f5f7fa;border-top:2px solid #ccc">
            <td>TOTAL</td>
            <td class="r">${fmtYd(totRec)}</td>
            <td class="r">${fmtYd(totUtil)}</td>
            <td class="r" style="color:${totDif<0?'#c44':(totDif>0?'#2a6':'#666')}">${fmtDiff(totDif)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <div class="muted small" style="margin-top:10px">
        Cálculo basado en los factores yarda/alumno por nivel y sexo del Excel RESUMEN.
        Solo se considera al alumno cuando tiene prenda cargada. Si el % de tallaje sube, el consumo sube.
      </div>

      <div class="footer">
        <div class="firma">Verificó</div>
        <div class="firma">Director / encargado</div>
      </div>
    </div>
  `;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Resumen Ejecutivo - ${_esc(d.esc.nombre||'')}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; margin: 0; }
      h1 { font-size: 17pt; margin: 0; }
      h2 { font-size: 12pt; margin: 14px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #000; }
      .header { padding-bottom: 8px; margin-bottom: 14px; border-bottom: 1px solid #aaa; }
      .hsub { font-size: 10pt; color: #444; margin-top: 4px; }
      .page-break { page-break-before: always; }
      .kpi-table { width: 100%; margin-bottom: 8px; }
      .kpi-table td { width: 33%; text-align: center; padding: 8px; border: 1px solid #ddd; vertical-align: top; }
      .kpi-lbl { font-size: 9pt; color: #666; text-transform: uppercase; }
      .kpi-val { font-size: 18pt; font-weight: 700; margin-top: 4px; }
      table.t { width: 100%; border-collapse: collapse; margin-top: 4px; }
      table.t th, table.t td { border: 1px solid #ccc; padding: 4px 6px; font-size: 10pt; }
      table.t th { background: #eef1f5; text-align: left; }
      table.t.small th, table.t.small td { font-size: 9pt; padding: 3px 5px; }
      table.t .r { text-align: right; }
      .muted { color: #666; }
      .small { font-size: 9pt; }
      .alert { background: #FFF4E6; border: 1px solid #F2C97D; padding: 8px; border-radius: 4px; font-size: 10pt; margin-bottom: 8px; }
      .footer { margin-top: 30px; }
      .firma { border-top: 1px solid #000; padding-top: 4px; width: 45%; display: inline-block; text-align: center; margin-right: 5%; }
    </style></head><body>
    ${pagina1}
    ${pagina2}
    </body></html>`;
}

function _esc(s) {
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
  supaFetchAll('alumno',
    `?escuela_id=eq.${escuelaId}&temporada_id=eq.${registroCache.temporadaActual}&select=grado`)
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

// ══════════════════════════════════════════════════════════════════════
// ESCANEAR ETIQUETA (botón flotante)
// Abre la cámara, lee el QR de la etiqueta de un bulto y abre ESE bulto en
// Producción con sus operaciones a la vista. El QR trae la dirección
// …/B/<primeras letras del id del bulto> (también sirve …?b=<id>).
// ══════════════════════════════════════════════════════════════════════
const _qr = { stream: null, activo: false, ultimoAviso: 0 };

function qrIdDeTexto(txt) {
  const s = String(txt || '').trim();
  const m = s.match(/\/B\/([0-9A-Fa-f]{6,12})\/?$/i) || s.match(/[?&]b=([0-9A-Fa-f]{6,12})(?![0-9A-Fa-f])/i);
  return m ? m[1].toLowerCase() : null;
}

function _qrMsg(texto, error) {
  const el = document.getElementById('qr-msg');
  if (!el) return;
  el.textContent = texto;
  el.style.color = error ? '#ffb4a9' : '#fff';
}

function _qrCargarLector() {
  // Respaldo para los teléfonos que no leen QR por sí solos (iPhone).
  if (window.jsQR) return Promise.resolve();
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    s.onload = () => ok();
    s.onerror = () => mal(new Error('sin lector'));
    document.head.appendChild(s);
  });
}

async function abrirEscanerQR() {
  const modal = document.getElementById('qr-modal');
  const video = document.getElementById('qr-video');
  if (!modal || !video || _qr.activo) return;
  modal.style.display = 'flex';
  _qrMsg('Abriendo la cámara…');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    _qrMsg('Este aparato no deja usar la cámara desde la app.', true);
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e) {
    _qrMsg(e && e.name === 'NotAllowedError'
      ? 'La cámara no tiene permiso. Actívelo en el candado de la dirección y toque otra vez el botón.'
      : 'No se pudo abrir la cámara.', true);
    return;
  }
  if (modal.style.display === 'none') { stream.getTracks().forEach(t => t.stop()); return; }   // la cerraron mientras abría
  _qr.stream = stream;
  _qr.activo = true;
  video.srcObject = stream;
  try { await video.play(); } catch (_) {}

  let leer = null;
  if ('BarcodeDetector' in window) {
    try {
      const det = new BarcodeDetector({ formats: ['qr_code'] });
      leer = async () => { const r = await det.detect(video); return r && r.length ? r[0].rawValue : null; };
    } catch (_) { leer = null; }
  }
  if (!leer) {
    try { await _qrCargarLector(); } catch (_) {
      _qrMsg('No se pudo preparar el lector. Revise el internet y vuelva a intentar.', true);
      return;
    }
    const lienzo = document.createElement('canvas');
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    leer = async () => {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return null;
      const k = Math.min(1, 640 / Math.max(w, h));
      lienzo.width = Math.round(w * k); lienzo.height = Math.round(h * k);
      ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
      const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
      const r = window.jsQR(img.data, img.width, img.height);
      return r ? r.data : null;
    };
  }
  _qrMsg('Apunte la cámara al código de la etiqueta');

  const vuelta = async () => {
    if (!_qr.activo) return;
    let texto = null;
    try { if (video.readyState >= 2) texto = await leer(); } catch (_) { texto = null; }
    if (!_qr.activo) return;
    if (texto) {
      const id = qrIdDeTexto(texto);
      if (id) {
        try { if (navigator.vibrate) navigator.vibrate(80); } catch (_) {}
        cerrarEscanerQR();
        window._prodHintBulto = id;
        prodEntrarPorEnlace();
        return;
      }
      if (Date.now() - _qr.ultimoAviso > 2500) {
        _qr.ultimoAviso = Date.now();
        _qrMsg('Ese código no es de una etiqueta de bulto.', true);
      }
    }
    setTimeout(vuelta, 180);
  };
  vuelta();
}

// Lista de bultos mientras se escribe el código: sale desde la primera letra o
// número y se achica con cada tecla. Tocar uno lo abre.
let _qrBultos = null, _qrBultosT = 0, _qrBultosP = null;
function _qrBultosCargar() {
  if (_qrBultos && Date.now() - _qrBultosT < 120000) return Promise.resolve(_qrBultos);
  if (!_qrBultosP) {
    _qrBultosP = supaFetch('vw_produccion_estado', 'GET', null,
      '?produccion_bulto_id=not.is.null&select=produccion_bulto_id,codigo_bulto,cod_prenda,talla_key_salida,cantidad_original,estado_manual&limit=3000')
      .then(r => { _qrBultos = r || []; _qrBultosT = Date.now(); return _qrBultos; })
      .catch(() => _qrBultos || [])
      .finally(() => { _qrBultosP = null; });
  }
  return _qrBultosP;
}
async function qrSugerir() {
  const campo = document.getElementById('qr-codigo'), ops = document.getElementById('qr-opciones');
  if (!campo || !ops) return;
  const t = String(campo.value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!t) { ops.innerHTML = ''; return; }
  const todos = await _qrBultosCargar();
  if (String(campo.value || '').toUpperCase().replace(/[^0-9A-Z]/g, '') !== t) return;   // ya se escribió otra cosa
  const cod = x => String(x.codigo_bulto || '').split('-')[0].toUpperCase();
  const lista = todos.filter(x => cod(x).startsWith(t))
    .sort((a, b) => (a.estado_manual === 'terminado') - (b.estado_manual === 'terminado') || cod(a).length - cod(b).length || cod(a).localeCompare(cod(b)));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  if (!lista.length) { ops.innerHTML = `<div style="padding:10px;color:#ffb4a9;font-size:15px;text-align:center">Ningún bulto empieza con ${esc(t)}.</div>`; return; }
  ops.innerHTML = lista.slice(0, 12).map(x => {
    const nombre = (typeof CATALOGO !== 'undefined' && CATALOGO[x.cod_prenda] && CATALOGO[x.cod_prenda].nombre) || x.cod_prenda || '';
    const talla = (typeof prodTalla2026 === 'function' && prodTalla2026(x.cod_prenda, x.talla_key_salida)) || '';
    const fin = x.estado_manual === 'terminado';
    return `<button type="button" onclick="qrAbrirBulto('${x.produccion_bulto_id}')" style="display:flex;width:100%;align-items:center;gap:10px;margin-top:6px;padding:12px;border:0;border-radius:12px;background:${fin ? '#D1D5DB' : '#fff'};font-size:16px;text-align:left;cursor:pointer"><strong style="flex:none;font-size:18px">${esc(cod(x))}</strong><span style="flex:1;min-width:0;color:#374151">${esc(nombre)} ${esc(talla)} · ${Number(x.cantidad_original) || 0}${fin ? ' · ya terminado' : ''}</span></button>`;
  }).join('') + (lista.length > 12 ? `<div style="padding:8px;color:#fff;font-size:13px;text-align:center">y ${lista.length - 12} más: siga escribiendo</div>` : '');
}
function qrAbrirBulto(id) {
  cerrarEscanerQR();
  window._prodHintCodigo = null;
  window._prodHintBulto = String(id).toLowerCase().slice(0, 12);
  prodEntrarPorEnlace();
}

// Etiqueta caída o sin QR: se escribe el código del bulto (3BA, KCH) y se abre
// igual que si se hubiera escaneado.
function qrAbrirPorCodigo() {
  const campo = document.getElementById('qr-codigo');
  const codigo = String((campo && campo.value) || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!codigo) { _qrMsg('Escriba el código que trae el bulto.', true); return; }
  cerrarEscanerQR();
  window._prodHintBulto = null;
  window._prodHintCodigo = codigo;
  prodEntrarPorEnlace();
}

function cerrarEscanerQR() {
  const campo = document.getElementById('qr-codigo');
  if (campo) campo.value = '';
  const ops = document.getElementById('qr-opciones');
  if (ops) ops.innerHTML = '';
  _qr.activo = false;
  if (_qr.stream) { try { _qr.stream.getTracks().forEach(t => t.stop()); } catch (_) {} }
  _qr.stream = null;
  const video = document.getElementById('qr-video');
  if (video) { try { video.pause(); } catch (_) {} video.srcObject = null; }
  const modal = document.getElementById('qr-modal');
  if (modal) modal.style.display = 'none';
}

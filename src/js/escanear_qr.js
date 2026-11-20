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

function cerrarEscanerQR() {
  _qr.activo = false;
  if (_qr.stream) { try { _qr.stream.getTracks().forEach(t => t.stop()); } catch (_) {} }
  _qr.stream = null;
  const video = document.getElementById('qr-video');
  if (video) { try { video.pause(); } catch (_) {} video.srcObject = null; }
  const modal = document.getElementById('qr-modal');
  if (modal) modal.style.display = 'none';
}

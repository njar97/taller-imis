"""
Genera los íconos PWA para Taller IMIS.
- icon-192.png, icon-512.png — íconos "any" (contenido al borde)
- icon-maskable-512.png — íconos "maskable" (contenido dentro del safe zone 80%)
- apple-touch-icon.png — 180x180 para iOS
Diseño: fondo azul brand (#1F4E79) con letras "TI" blancas bold centradas.
Run: python _gen_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
BRAND = (31, 78, 121)     # #1F4E79
ACCENT = (255, 215, 0)    # #FFD700
WHITE = (255, 255, 255)

def find_font(size):
    """Buscar una fuente bold del sistema; fallback al default."""
    candidates = [
        "arialbd.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except Exception:
            continue
    return ImageFont.load_default()

def make_icon(size, *, maskable=False, rounded=False):
    img = Image.new("RGBA", (size, size), BRAND + (255,))
    d = ImageDraw.Draw(img)

    # Si es "any" (no maskable) le damos esquinas redondeadas opcionales.
    # Maskable: fondo sólido full-bleed; el contenido va dentro del 80% center.
    safe_ratio = 0.80 if maskable else 0.92
    inner = int(size * safe_ratio)
    margin = (size - inner) // 2

    # Pequeño acento dorado en la esquina inferior derecha (sutil)
    if not maskable:
        dot_r = max(4, size // 30)
        cx, cy = size - margin - dot_r * 2, size - margin - dot_r * 2
        d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=ACCENT + (255,))

    # Texto "TI"
    text = "TI"
    font_size = int(inner * 0.62)
    font = find_font(font_size)
    bbox = d.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2 - bbox[0]
    # Ajuste vertical: los bounds incluyen ascender; centramos visualmente
    ty = (size - th) // 2 - bbox[1] - int(size * 0.02)
    d.text((tx, ty), text, fill=WHITE + (255,), font=font)

    if rounded and not maskable:
        # Recortar a esquinas redondeadas
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size, size], radius=int(size * 0.22), fill=255)
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out
    return img

def main():
    targets = [
        ("icon-192.png",        192, False, True),
        ("icon-512.png",        512, False, True),
        ("icon-maskable-512.png", 512, True,  False),
        ("apple-touch-icon.png", 180, False, False),  # iOS: sin rounded (iOS aplica máscara)
        ("favicon-32.png",       32,  False, True),
    ]
    for name, size, maskable, rounded in targets:
        img = make_icon(size, maskable=maskable, rounded=rounded)
        out = ROOT / name
        img.save(out, "PNG", optimize=True)
        print(f"  + {name} ({size}x{size}{'  maskable' if maskable else ''})")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# Taller IMIS - Build Script (Python port of build.ps1)
# Toma los archivos separados de src/ y genera produccion.html
# Uso: python3 build.py

from datetime import datetime
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "produccion.html"

JS_ORDER = [
    "core.js",
    "dashboard.js",
    "resumen_escuela.js",
    "corte.js",
    "estadistica.js",
    "estadistica_tallas.js",
    "inventario.js",
    "costos.js",
    "yardaje.js",
    "contratos.js",
    "trazo.js",
    "tendido.js",
    "bulto.js",
    "historial.js",
    "produccion.js",
    "asignaciones.js",
    "registro.js",
    "tallaje.js",
    "importacion.js",
    "alumnos.js",
    "bodega.js",
    "reportes.js",
    "matcher.js",
    "alumnos_global.js",
    "historico.js",
    "exportar.js",
    "grupos.js",
    "auditoria.js",
    "config.js",
]

VIEWS_ORDER = [
    "inicio.html",
    "corte.html",
    "nuevo.html",
    "trazo.html",
    "tendido.html",
    "bulto.html",
    "historial.html",
    "produccion.html",
    "estadistica.html",
    "registro.html",
    "bodega.html",
    "auditoria.html",
    "config.html",
]


def read(path: Path) -> str:
    if not path.exists():
        sys.exit(f"Falta archivo: {path}")
    return path.read_text(encoding="utf-8")


def main() -> int:
    if not SRC.is_dir():
        sys.exit(f"No se encontro la carpeta src/ en {ROOT}")

    print("====================================================")
    print(" Taller IMIS - Build")
    print("====================================================\n")
    print("Leyendo fuentes...")

    css = read(SRC / "css" / "styles.css")
    head_tpl = read(SRC / "head.html")
    nav = read(SRC / "nav.html")
    modals = read(SRC / "modals.html")
    footer_tpl = read(SRC / "footer.html")

    views_parts = []
    for v in VIEWS_ORDER:
        views_parts.append(read(SRC / "views" / v))
        print(f"  + views/{v}")
    views = "\r\n".join(views_parts)

    js_parts = []
    for jf in JS_ORDER:
        content = read(SRC / "js" / jf)
        js_parts.append(f"// +++++++++++++++++++ {jf} +++++++++++++++++++\r\n{content}")
        print(f"  + js/{jf}")
    js_combined = "\r\n\r\n".join(js_parts)

    print("\nCombinando...")

    head_filled = head_tpl.replace("@@CSS_INLINE@@", css)
    footer_filled = footer_tpl.replace("@@MODALS@@", modals).replace("@@JS_INLINE@@", js_combined)

    build_date = datetime.now().strftime("%Y-%m-%d %H:%M")

    html = (
        f"<!-- Generado: {build_date} | Build: src/ -> produccion.html -->\r\n"
        f"{head_filled}\r\n"
        f"{nav}\r\n"
        f"{views}\r\n"
        f"{footer_filled}"
    )

    html = re.sub(r"(\r?\n){3,}", "\r\n\r\n", html)

    OUT.write_text(html, encoding="utf-8", newline="")

    size = OUT.stat().st_size
    lines = html.count("\n") + 1

    print("\n====================================================")
    print(" [OK] Build OK")
    print("====================================================")
    print(f"  Archivo:  {OUT}")
    print(f"  Tamano:   {round(size/1024, 1)} KB ({size} bytes)")
    print(f"  Lineas:   {lines}")
    print(f"  Fecha:    {build_date}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

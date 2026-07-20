# Rediseño: Sesión de empaque unificada

> Origen: auditoría UX 2026-07-20. Problema: un solo motor (`empacarAlumnosDesdeRegistro`)
> con 4 puertas de entrada distintas (selector de combos, empacar acaparados manual/auto,
> asignar-a-alumnos, atajos del dashboard) y 5 conceptos que el usuario debía dominar
> (stock libre, pool, reservado, combos, parejas).

## Flujo nuevo (src/js/empaque.js + src/views/empaque.html, vista `empaque`)

1. **Escuela** — cards con "pendientes" y "empacables ya" (simulación greedy pool→stock).
2. **Lista tap-para-empacar** — agrupada por grado; cada pieza es un botón:
   azul = disponible (tap marca), ⚠ gris = sin stock de esa talla (tap abre talla
   alterna), ✓ verde = ya empacada, 🧺 verde lleno = marcada. "Marcar todos los
   empacables", toggle 🧷 Parejas (default ON: al marcar una pieza se marca la otra
   del alumno si hay stock), buscador. Barra fija abajo con contador + [Empacar].
3. **Confirmar** — motor real (pool de la escuela primero, stock después, tallas
   alternas persisten en `talla_empacada_*`). Panel de éxito con:
   **↩️ Deshacer** (desempacarPieza en lote), 🚚 Registrar entrega, seguir/otra escuela.

El usuario nunca elige entre pool y stock: el motor lo resuelve (como siempre lo hizo).

## Fases

- **Fase 1 (HECHA 2026-07-20)**: sesión nueva en paralelo, sin borrar nada.
  Accesos: Bodega → Acciones → "🧺 Sesión de empaque BETA", y Ctrl+K "empaque".
- **Fase 2 (HECHA 2026-07-20, mismo día tras validación del usuario)**:
  · Dashboard: botones Acaparar+Empacar por escuela → un solo "🧺 Empacar" que
    abre la sesión con la escuela preseleccionada (`window._emqHintEscuela`,
    sin cadenas de setTimeout).
  · Bodega→Acciones: la sesión es la acción principal; se quitaron los botones
    de Empacar-selector, Empacar-pool y Asignar (código vivo pero sin UI,
    se borra en Fase 3). "Acaparar por cantidad" demotado a Otras acciones.
  · Badge de Producción → sesión (antes selector con hint de prenda).
  · "🔒 Reservar tallas" (rediseñado mismo día por feedback del usuario:
    reservar es por TALLA y CANTIDAD, no por alumno — marcar niño por niño
    duplicaba el flujo de empacar). Botón arriba junto a "Marcar todos":
    tabla necesidad-vs-bodega por prenda-talla (pendientes / ya reservado /
    stock libre) con cantidad pre-llenada en lo que falta, topada al stock
    fresco (validado al abrir Y al confirmar, todo-o-nada). Mecánica de
    escritura igual que acaparar: SALIDA_EMPAQUE sin alumno + escuela_acaparado.
    La barra inferior queda solo para 📦 Empacar.
  · Entrega integrada en el paso 3 (fecha+receptor inline → _bulkPatchAlumno
    empacado→entregado + registro en entrega_escuela). Sin saltar a Bodega.
- **Fase 3 (HECHA 2026-07-20, mismo día, aprobada por el usuario)**: ~2,200 líneas
  eliminadas — bodega.js −1,108 (selector de combos, empacarAcaparados manual/auto,
  acaparar modal, asignar modal: 32 bloques), alumnos_global.js −895 (todo el modo
  empaque: supply/marcados/banner/talla-alt/bulk: 19 bloques), bodega.html −192
  (4 modales). Registro volvió a ser solo padrón (la celda Top/Bot conserva la
  vista de talla alterna persistida). El smoke test se actualizó (funciones
  críticas: fuera las muertas, entran initEmpaque/emqAbrirReserva/emqEmpacar/
  emqEntregar). Motor intacto: empacarAlumnosDesdeRegistro, desempacarPieza,
  _consumePoolBatch, _bulkPatchAlumno, _codPrenda.

## Plan del pool/acaparado (decisión abierta)

- La tabla `escuela_acaparado` y el motor NO cambian en ninguna fase.
- Fase 2 elimina las *pantallas* del pool (empacar acaparados manual/auto) porque el
  motor ya consume pool automáticamente; "reservar" queda como acción secundaria
  contextual dentro de la sesión.
- Si tras ~2 meses de uso real no se reserva nada (hoy: 1 registro histórico),
  evaluar eliminar el concepto por completo (stock global único).

## Decisiones del usuario (2026-07-20)

- 🧷 Parejas: **activado por defecto** (el caso normal es uniforme completo).
- Pool: simplificar según plan de arriba; decisión final pospuesta hasta probar.
- Fase 1: aprobada ("sí, dale").

## Notas técnicas

- Se REUSA de bodega.js: `empacarAlumnosDesdeRegistro` (con `planExterno` +
  `tallasAlt`), `desempacarPieza` (silencioso, apto para lote), `_codPrenda`.
- `emqRestante()` espeja la lógica pool→stock del motor para pintar disponibilidad
  en vivo descontando lo ya marcado.
- La vista vive fuera del nav (como auditoría); `switchTab('empaque')`.

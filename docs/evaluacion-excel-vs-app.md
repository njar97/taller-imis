# Evaluación: Excel del taller vs app Taller IMIS (v32)

**Fecha:** 2026-07-12 · **Fuente:** análisis con openpyxl de los libros en
`OneDrive\Documentos\UDP Confecciones\` y `Contabilidad\Hojas de Calculo\Produccion_Taller\`.

## Veredicto

La app ya reemplaza **~95% del núcleo operativo** de los Excel, con mejor
arquitectura (multiusuario, event-log en vez de SUMIFS frágiles). Lo que queda
solo en Excel es la **capa financiera/gerencial** (costeo de materiales,
techos de gobierno, utilidad por contrato).

## Mapa de cobertura

### `BASE_2025_OPTIMIZADA.xlsm` / `BASE 2025 2do.Uniforme.xlsm` (sistema madre)

| Hoja Excel | Qué hacía | ¿En la app? |
|---|---|---|
| BASE (6,935 filas) | Padrón alumnos + tallas, KEY = `VLOOKUP(CODPRENDA)&talla&largo&detalle`, flag IN/OUT | ✅ `alumno` + `catalogo_key`, `tallaje.js`, `matcher.js` |
| CONTRATO (6,814) | Contratos por escuela (proveedor/NIT/DUI/director), cantidades × precio (5.1/4.8/5.4/7.2) | ✅ `contrato_escuela` + hoja entrega "contrato vs entregado" |
| RESUMEN | COUNTIFS nivel/ciclo/sexo × escuela + costo mano de obra | ✅ `costos.js` (portado explícito, mismos precios: PARV 5.10/4.80, BASICA 5.40/7.20, BACH 5.39/7.20) |
| ESTADISTICA | Grid prenda×talla: TOTAL/BODEGA/PRODUCCIÓN/CORTE/EXISTENCIA | ✅ `estadistica.js` + `estadistica_tallas.js` + vistas |
| INVENTARIO | Kardex SUMIFS por estado (corte→prod→bodega) | ✅ flujo con `vw_bodega_stock`, `bodega_movimiento` |
| CORTE A/B | Tendido: rollos, yardas, lienzos, pares | ✅ `tendido.js` + `trazo.js` (+3 tablas tendido_*) |
| RENDIMIENTO (664) | BULTO·CANTIDAD·QUIEN·FECHA·OPERACIÓN | ✅ `produccion_registro_operacion` + `vw_operaria_productividad` |
| Corte_bultos/BODEGA/Desglose | Saldos por bulto, DUPLICADO check, movs IN/OUT | ✅ `bulto.js`, `asignacion_bulto`, vistas etapas |
| FACTOR | Catálogo grado→nivel/ciclo, prendas, tallas maestras | ✅ `grado_catalogo` + `catalogo_key` |

### Plantillas sueltas

- `Formato_Control_Produccion.xlsx` (etapas fecha/responsable) → ✅ etapas por bulto
- `Plantilla_Control_Corte_Produccion.xlsx` (operaciones: pinzas, zipper, pretina) → ✅ `produccion_operacion`
- `Consolidado_Estadistica_Lote2.xlsx` (cruce de libros + EMPACADO/PENDIENTE) → ✅ estadística + bodega-vs-demanda

## Gaps (lo que falta implementar)

### GAP 1 — Costeo de materiales y utilidad (`Cotizaciones\costo_uniformes_imis.xlsx`) — GRANDE
La app solo costea **mano de obra** (`costos.js`). El Excel además hace:
1. **Precios de materiales** desde facturas DTE (botón, zipper, peloom, elástico) con factor a unidad base
2. **Costo de materiales por prenda** (receta: cantidades × precio)
3. **Precios techo gobierno 2025** por prenda/nivel → margen (`techo/1.13 − costo`)
4. **Margen real** (prorratea costo fijo del taller ~$3,785/mes) y **utilidad por contrato** (incluye neto post-IVA/renta `×0.73`)

Propuesta: módulo "Costos y utilidad" en Config (solo admin — el modo operario
ya oculta costos): tabla materiales, receta por prenda, techos por año,
utilidad por contrato cruzando cantidades + mano de obra que la app ya tiene.

### GAP 2 — Prioridad de corte (menor)
`Planificación_Prioridad_Corte.xlsx`: lista manual prenda→prioridad. El
dashboard tiene "Top escuelas con pendientes" (parcial); falta prioridad
**por prenda**. Fix: campo `prioridad` en catálogo de prendas.

### GAP 3 — Etiquetas (verificar)
Las BASEs generaban etiquetas de bulto/alumno. La app menciona "etiqueta" en
registro/reportes; falta confirmar si las **imprime**.

## Notas de arqueología

- Los `.xlsm` arrastran una hoja `GPT cache` oculta (veryHidden) de 1M filas ×
  15k columnas — puro bloat, explica el peso de los archivos.
- Precios mano de obra variaron entre lotes: OPTIMIZADA usa 5.09/4.79/5.39/7.19,
  el 2do lote 5.10/4.80/5.40/7.20. La app usa los del 2do lote (+BACH 5.39).
- El factor de tela Beige usa los factores de Azul (gotcha ya documentado en
  la hoja de entrega).

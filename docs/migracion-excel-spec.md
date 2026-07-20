# Spec: migración BASE 2026 / PRONOSTICO (Excel) → taller-imis-pedidos

> Fuente: extracción completa de fórmulas de `BASE 2026.xlsm` y `2026 PRONOSTICO.xlsm`
> (OneDrive\Documentos\UDP Confecciones\Uniformes Escolares\2026\) — 2026-07-20.
> Hallazgo clave: **no hay LAMBDAs de usuario** (los `_xleta.*`/`_xlpm.*` son marcadores
> internos de LET). Toda la lógica son columnas calculadas de tablas + fórmulas
> LET/FILTER/UNIQUE/COUNTIFS. Es 100 % reconstruible en JS/SQL.

## 1. Modelo conceptual (qué hace el Excel)

Es el sistema de **uniformes escolares por contrato MINED**: tallaje de alumnos →
resumen/facturación por centro escolar → estadística de tallas (matriz SKU×centro) →
corte por bultos → producción → bodega/entrega.

### 1.1 Identidad de producto: el KEY (SKU)
Todo gira alrededor de un código compuesto:

```
KEY = CodPrenda & Talla & Largo & Detalle     (largo/detalle omitidos si 0/vacío)
```

- `CodPrenda` viene del catálogo **Cod_Prenda** (AUX!L2:M11, 9-10 prendas):
  CAMISA→C, CAMISA_CELESTE→CC, BLUSA→B, PANTALON, PANTALON_BEIGE, FALDA,
  FALDA_C.E, FALDA_BEIGE, SHORT (códigos tipo C/CC/B/P/PB/F/FCE/FB/S).
- Prendas "de torso" (C, CC, B) usan la talla T (TALLAT); el resto usa la talla P.
- `FALDA_MERGE` = agregado virtual FALDA + FALDA_C.E (prefijo FM ↔ F + FCE).

### 1.2 Tabla BASE (tallaje, 1 fila = 1 alumno)
Columnas de entrada: `EstadoT, EstadoP, SexoFlag, Nombre, TALLAT, LARGOT, DETALLET,
TALLAP, LargoP, detalleP, Grado, Centro, C.E`.
- `SexoFlag`: `""` = niño, `"."` = niña.
- `EstadoT/EstadoP`: vacío = pendiente de asignar; `"PTE"`/`"OK"` estados; **cuando la
  prenda se entrega, la celda guarda el KEY entregado** (los conteos de entrega son
  `COUNTIF(BASE[EstadoT], KEY)`).

Columnas derivadas:
- `NIVEL`, `CICLO`: lookup de `Grado` en tabla **Nivel** (AUX, 164 filas:
  grado → PARV/BASICA/BACH → ciclo 0-3).
- `PRENDAT` (prenda de torso que le corresponde): si el estado ya trae dato/KEY/talla
  ⇒ vacío; si no, `INDEX(Prenda[], idx, 6)` donde `idx` sale de un IFS por
  (SexoFlag, NIVEL, talla): niño/PARV→1, niña/PARV→2, niño/BASICA→3,
  niña/BASICA talla<8→4, niña/BASICA talla≥8→5, niño/BACH→6, niña/BACH→7,
  sin centro→8/9 (col 6 de la tabla **Prenda** = TORSO).
- `PRENDAP` (prenda de pierna/falda): mismo IFS pero col 7 (PIERNAS); en niña/BASICA
  el corte es talla≤4→idx9, >4→idx5.
- `KEYT` = codigo(PRENDAT)&TALLAT&LARGOT&DETALLET; `KEYP` análogo.
- `Columna1` = "IN" si ambos estados OK, si no "OUT".

Tabla **Prenda** (AUX D1:J10): ITEM, SANCRISTOBAL, TALLA, TIPO, NIVEL, TORSO, PIERNAS
— define qué prenda de torso/pierna corresponde a cada segmento sexo×nivel.

### 1.3 RESUMEN (por centro escolar, $B$62 = centro seleccionado)
- Conteos: `COUNTIFS(BASE[TALLAT]>0, Centro, CICLO/NIVEL, SexoFlag)` (+ caso talla "ES").
- **Precios hardcodeados por nivel** (aparecen en RESUMEN y CONTRATO):
  - Parvularia: blusa/falda/camisa **5.1**, pantalón corto **4.8**
  - Básica/Bachillerato: blusa/falda/camisa **5.4**, pantalón **7.2**
  - Valor por alumno tipo: niña×2 prendas + niño camisa + niño pantalón.
- Compara conteo real vs contrato (`CONTRATO_1`/`CONTRATOS`) y calcula % avance.
- **Yardas de tela**: factores por ciclo/nivel: parv 0.75 (y 0.6 alt.), ciclo1 ×1,
  ciclo2 ×1.25, ciclo3 ×1.5, bachillerato ×1.65. Yardas contratadas − estimadas
  = a devolver a bodega (o a solicitar).

### 1.4 ESTADISTICA / ESTADISTICA2 (matriz de tallas)
Matriz dinámica **SKU × centro**:
- Filas: combinaciones únicas (Prenda, Talla, Largo, Detalle) unión de
  BASE[PRENDAT…] + BASE[PRENDAP…] + Corte_bultos + Movs, ordenadas.
- Columnas: centros únicos donde aparece la prenda + `TOTAL, BODEGA, PRODUCCION,
  CORTE, EXISTENCIA`.
- Celda = `COUNTIFS(KEYT|KEYP, key, Centro, centro)` — para prendas C/CC/B se
  cuenta contra KEYT, resto contra KEYP. FALDA_MERGE suma F + FCE.

### 1.5 CONTRATO
- **CONTRATOS** (1 fila = 1 centro): datos del centro (código CDE, distrito,
  municipio, director…), Nº contrato, fecha, cantidades contratadas por
  prenda×nivel (BLUSA_PARV … PANT_BACHI) y `Total ($)` con los precios de §1.3.
- **CONTRATO_1**: cantidades por talla (columnas 1-13) × precio por talla
  (5.1/4.8/5.4/7.2) → montos P*, y agregados por color CELESTE/AZUL.

### 1.6 BODEGA (tabla Movs)
1 fila = 1 movimiento de inventario: Fecha, CodBulto_v2, Prenda, Talla, Largo,
Detalle, Cant_Asignada, Tipo (IN/OUT), Almacen, KEY.
- `QtySigned` = +cant si IN, −cant si OUT.
- `Pendiente` (por KEY) = Σ Cant_Asignada del KEY − **entregados** según BASE
  (COUNTIF de EstadoT para C/CC/B, de EstadoP para el resto).
- `Saldo_Bulto` = pendiente del bulto en Desglose_prod.

### 1.7 Corte_bultos + Desglose_prod (corte y producción)
- **Corte_bultos**: 1 fila = 1 bulto cortado. `CodBulto_v2` = código compuesto
  `NroBulto & CorteID & TrazoID & Cantidad & "-" & CodPrenda & Talla & Largo(2díg) & Detalle`.
  `Flag_Duplicado` si el código se repite. `Asignado_x_Bulto` = Σ asignado en
  Desglose_prod; `Pendiente_x_Bulto` = max(0, cantidad − asignado);
  `Estado` = RESERVA (nada asignado) / ASIGNADO / AGOTADO.
- **Desglose_prod**: 1 fila = asignación de un bulto a producción: Proceso,
  Operario, Estado, Fecha_fin, Obs. Hereda prenda/talla del bulto por lookup.
  `Asignado_x_bulto` = Σ Movs del bulto (lo que ya entró a bodega);
  `Pendiente_x_Bulto` = cantidad − asignado.
- Flujo: **CORTE (bulto) → PRODUCCION (desglose) → BODEGA (movs) → ENTREGA
  (Estado en BASE = KEY)** — las 4 columnas extra de ESTADISTICA salen de aquí.

### 1.8 PRONOSTICO (2026 PRONOSTICO.xlsm)
- Su BASE es la **histórica 2024** (23k filas, mismas columnas).
- Hojas PANTALON/BLUSA/CAMISA: la misma matriz de §1.4 sobre la base histórica,
  más el escalado: `pronóstico_talla = conteo_2024_talla / total_2024 × objetivo_2026`
  (objetivo = cantidad contratada 2026). Es una **distribución de tallas histórica
  aplicada a un total nuevo** — eso es todo el "pronóstico".

## 2. Qué NO hay que migrar
- Macros: solo exportaban rangos a PDF (la app ya genera PDFs).
- Hoja "GPT cache": basura.
- Slicers/segmentaciones, rangos ListaT_* (validaciones de datos para dropdowns
  de Excel — en la app son selects normales).
- `BASE 2025 2do.Uniforme.xlsm`: mismo esquema, es histórico; solo importar datos.

## 3. Esquema propuesto en Supabase (proyecto kszdievqesveluzcnzsh)

```
uni_centros        (centro escolar: codigo_cde, nombre, distrito, municipio, depto,
                    director, tel, contrato_nro, fecha_contrato)
uni_contrato_items (centro_id, prenda, nivel, cantidad)        ← CONTRATOS/CONTRATO_1
uni_prendas        (nombre, codigo, tipo torso|pierna, precios por nivel)  ← Cod_Prenda+Prenda
uni_niveles        (grado → nivel, ciclo)                      ← tabla Nivel
uni_alumnos        (centro_id, nombre, sexo, grado,
                    talla_t, largo_t, detalle_t, estado_t, key_t_entregado,
                    talla_p, largo_p, detalle_p, estado_p, key_p_entregado)  ← BASE
uni_bultos         (fecha, nro_bulto, corte_id, trazo_id, prenda, talla, largo,
                    detalle, cantidad, ubicacion)              ← Corte_bultos
uni_produccion     (bulto_id, proceso, operario, estado, fecha_fin, obs, cantidad) ← Desglose_prod
uni_movs           (fecha, bulto_id, prenda, talla, largo, detalle, cantidad,
                    tipo IN/OUT, almacen)                      ← Movs
```

Derivados (KEY, pendientes, estados de bulto, matriz estadística, yardas,
pronóstico) = **vistas SQL o cálculo en JS**, nunca columnas escritas a mano.

## 4. Reglas de negocio a portar (resumen ejecutable)
1. `key(prenda, talla, largo, detalle)` y `prendaQueCorresponde(sexo, nivel, talla)`
   (los dos IFS de §1.2) — módulo JS puro + tests.
2. Matriz estadística SKU×centro con columnas TOTAL/BODEGA/PRODUCCION/CORTE/EXISTENCIA.
3. Pendiente por KEY y por bulto (§1.6-1.7) + estados RESERVA/ASIGNADO/AGOTADO.
4. Resumen por centro: conteos, avance vs contrato, $ con precios §1.3, yardas.
5. Pronóstico: distribución histórica de tallas × objetivo contratado.
```

-- ════════════════════════════════════════════════════════════════════
-- TALLER IMIS · Migración v3.9
-- Fase 2 integrada: tipo de registro + vistas útiles
-- ════════════════════════════════════════════════════════════════════
-- Requisito: v3.1..v3.8 aplicadas
-- Idempotente
-- ════════════════════════════════════════════════════════════════════

-- 1. Tipo de registro (normal / reproceso) ──────────────────────────
ALTER TABLE produccion_registro_operacion
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'normal'
  CHECK (tipo IN ('normal','reproceso'));
COMMENT ON COLUMN produccion_registro_operacion.tipo IS 
  'normal = trabajo regular. reproceso = piezas devueltas que se rehacen. Solo los normal cuentan para el estado del bulto.';

-- 2. Vista actualizada: estado derivado + info de avance ────────────
DROP VIEW IF EXISTS vw_produccion_progreso CASCADE;
CREATE VIEW vw_produccion_progreso AS
SELECT
  pb.id                                             AS produccion_bulto_id,
  ttm.cod_prenda,
  (SELECT COUNT(*) FROM produccion_operacion po 
   WHERE po.cod_prenda = ttm.cod_prenda AND po.activo = true) AS total_operaciones,
  (SELECT COUNT(DISTINCT po.id) 
   FROM produccion_registro_operacion pro
   JOIN produccion_operacion po ON po.id = pro.operacion_id
   WHERE pro.produccion_bulto_id = pb.id 
     AND pro.tipo = 'normal'
     AND po.cod_prenda = ttm.cod_prenda) AS operaciones_registradas
FROM produccion_bulto pb
JOIN tendido_rollo_salida trs   ON trs.id = pb.tendido_rollo_salida_id
JOIN tendido_talla_marcada ttm  ON ttm.id = trs.tendido_talla_marcada_id
WHERE pb.unido_a_id IS NULL;

-- 3. Vista principal con estado derivado (cuando Fase 2 está activa) ─
-- Se mantiene vw_produccion_estado del v3.7, pero agregamos columnas
-- para que la app pueda calcular estado por etapas.
DROP VIEW IF EXISTS vw_produccion_estado CASCADE;
CREATE VIEW vw_produccion_estado AS
SELECT
  trs.id                      AS salida_id,
  pb.id                       AS produccion_bulto_id,
  t.id                        AS tendido_id,
  t.codigo_corte,
  t.letra_corte,
  t.fecha                     AS fecha_corte,
  tr.numero_rollo,
  ttm.letra_local             AS letra_talla,
  ttm.talla_key_original,
  ttm.talla_key_complemento,
  ttm.cod_prenda,
  trs.talla_key_salida,
  trs.cantidad                                        AS cantidad_trs_original,
  COALESCE(pb.cantidad_ajustada, trs.cantidad)        AS cantidad_original,
  pb.cantidad_final,
  pb.bulto_origen_id,
  pb.sufijo_division,
  pb.unido_a_id,
  COALESCE(pb.estado, 'pendiente')                    AS estado_manual,
  -- Estado derivado por etapas (útil cuando Fase 2 está activa)
  (SELECT COUNT(*) FROM produccion_operacion po 
   WHERE po.cod_prenda = ttm.cod_prenda AND po.activo = true) AS total_etapas,
  (SELECT COUNT(DISTINCT po.id) 
   FROM produccion_registro_operacion pro
   JOIN produccion_operacion po ON po.id = pro.operacion_id
   WHERE pro.produccion_bulto_id = pb.id 
     AND pro.tipo = 'normal'
     AND po.cod_prenda = ttm.cod_prenda) AS etapas_hechas,
  pb.fecha_ingreso,
  pb.fecha_terminado,
  pb.observaciones,
  (
    tr.numero_rollo::text 
    || COALESCE(t.letra_corte, '?') 
    || ttm.letra_local 
    || COALESCE(pb.cantidad_ajustada, trs.cantidad)::text 
    || '-' 
    || REPLACE(trs.talla_key_salida, '.', '')
    || COALESCE(pb.sufijo_division, '')
  )                                                   AS codigo_bulto
FROM tendido_rollo_salida trs
JOIN tendido_rollo tr           ON tr.id  = trs.tendido_rollo_id
JOIN tendido t                  ON t.id   = tr.tendido_id
JOIN tendido_talla_marcada ttm  ON ttm.id = trs.tendido_talla_marcada_id
LEFT JOIN produccion_bulto pb   ON pb.tendido_rollo_salida_id = trs.id
WHERE pb.unido_a_id IS NULL
ORDER BY t.fecha DESC, t.codigo_corte, tr.numero_rollo, ttm.letra_local;

-- 4. Vista: detalle de etapas por bulto (para expandir) ──────────────
DROP VIEW IF EXISTS vw_bulto_etapas CASCADE;
CREATE VIEW vw_bulto_etapas AS
SELECT
  pb.id                       AS produccion_bulto_id,
  po.id                       AS operacion_id,
  po.cod_prenda,
  po.orden,
  po.nombre                   AS operacion_nombre,
  po.codigo                   AS operacion_codigo,
  po.maquina,
  po.tiempo_estandar_min,
  -- Info del registro si existe (último normal)
  (SELECT pro.id FROM produccion_registro_operacion pro 
   WHERE pro.produccion_bulto_id = pb.id AND pro.operacion_id = po.id 
     AND pro.tipo = 'normal' 
   ORDER BY pro.creado_en DESC LIMIT 1) AS registro_id,
  (SELECT op.nombre FROM produccion_registro_operacion pro 
   LEFT JOIN operaria op ON op.id = pro.operaria_id
   WHERE pro.produccion_bulto_id = pb.id AND pro.operacion_id = po.id 
     AND pro.tipo = 'normal'
   ORDER BY pro.creado_en DESC LIMIT 1) AS operaria_nombre,
  (SELECT pro.fecha FROM produccion_registro_operacion pro 
   WHERE pro.produccion_bulto_id = pb.id AND pro.operacion_id = po.id 
     AND pro.tipo = 'normal'
   ORDER BY pro.creado_en DESC LIMIT 1) AS fecha_hecha,
  (SELECT pro.cantidad_realizada FROM produccion_registro_operacion pro 
   WHERE pro.produccion_bulto_id = pb.id AND pro.operacion_id = po.id 
     AND pro.tipo = 'normal'
   ORDER BY pro.creado_en DESC LIMIT 1) AS cantidad_hecha,
  -- Cuántos reprocesos hay
  (SELECT COUNT(*) FROM produccion_registro_operacion pro 
   WHERE pro.produccion_bulto_id = pb.id AND pro.operacion_id = po.id 
     AND pro.tipo = 'reproceso') AS n_reprocesos
FROM produccion_bulto pb
JOIN tendido_rollo_salida trs   ON trs.id = pb.tendido_rollo_salida_id
JOIN tendido_talla_marcada ttm  ON ttm.id = trs.tendido_talla_marcada_id
JOIN produccion_operacion po    ON po.cod_prenda = ttm.cod_prenda AND po.activo = true
WHERE pb.unido_a_id IS NULL
ORDER BY pb.id, po.orden;

-- ════════════════════════════════════════════════════════════════════
-- FIN v3.9
-- ════════════════════════════════════════════════════════════════════

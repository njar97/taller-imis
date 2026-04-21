-- ════════════════════════════════════════════════════════════════════
-- TALLER IMIS · Migración v3.10
-- Sistema de asignaciones: planificar quién hace qué
-- ════════════════════════════════════════════════════════════════════
-- Requisito: v3.1..v3.9 aplicadas
-- Idempotente
-- ════════════════════════════════════════════════════════════════════
--
-- Modelo conceptual:
--   Asignación = intención  ("a Blanky le toca ensamble de estos 10 bultos")
--   Registro   = hecho      (ya lo hicimos, existe en produccion_registro_operacion)
--
-- Una asignación cubre: 1 operaria + 1 operación + N bultos.
-- Cuando todos los bultos de la asignación tienen registro, pasa a completada.
-- ════════════════════════════════════════════════════════════════════

-- 1. Tabla principal: asignacion ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS asignacion (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operaria_id       UUID NOT NULL REFERENCES operaria(id) ON DELETE RESTRICT,
    operacion_id      UUID NOT NULL REFERENCES produccion_operacion(id) ON DELETE RESTRICT,
    fecha_asignacion  DATE NOT NULL DEFAULT CURRENT_DATE,
    estado            TEXT NOT NULL DEFAULT 'activa' 
                      CHECK (estado IN ('activa','completada','cancelada')),
    observaciones     TEXT,
    creado_en         TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asignacion_operaria ON asignacion(operaria_id, estado);
CREATE INDEX IF NOT EXISTS idx_asignacion_estado ON asignacion(estado);

ALTER TABLE asignacion DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asignacion IS 
    'Planificación: a qué operaria le toca qué operación sobre qué bultos. Multi-día.';

-- 2. Tabla de unión: asignacion_bulto ────────────────────────────────
CREATE TABLE IF NOT EXISTS asignacion_bulto (
    asignacion_id         UUID NOT NULL REFERENCES asignacion(id) ON DELETE CASCADE,
    produccion_bulto_id   UUID NOT NULL REFERENCES produccion_bulto(id) ON DELETE CASCADE,
    creado_en             TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (asignacion_id, produccion_bulto_id)
);

CREATE INDEX IF NOT EXISTS idx_asig_bulto_asignacion ON asignacion_bulto(asignacion_id);
CREATE INDEX IF NOT EXISTS idx_asig_bulto_bulto ON asignacion_bulto(produccion_bulto_id);

ALTER TABLE asignacion_bulto DISABLE ROW LEVEL SECURITY;

-- 3. Vista: estado detallado de cada asignación ─────────────────────
-- Por cada asignación, calcula cuántos bultos están hechos/pendientes
-- según los registros de produccion_registro_operacion existentes.
DROP VIEW IF EXISTS vw_asignacion_estado CASCADE;
CREATE VIEW vw_asignacion_estado AS
SELECT 
    a.id                        AS asignacion_id,
    a.operaria_id,
    op.nombre                   AS operaria_nombre,
    a.operacion_id,
    po.nombre                   AS operacion_nombre,
    po.cod_prenda,
    po.orden                    AS operacion_orden,
    a.fecha_asignacion,
    a.estado,
    a.observaciones,
    a.creado_en,
    -- Totales
    (SELECT COUNT(*) FROM asignacion_bulto ab 
     WHERE ab.asignacion_id = a.id) AS bultos_total,
    (SELECT COUNT(*) FROM asignacion_bulto ab 
     JOIN produccion_registro_operacion pro 
       ON pro.produccion_bulto_id = ab.produccion_bulto_id 
      AND pro.operacion_id = a.operacion_id 
      AND pro.tipo = 'normal'
     WHERE ab.asignacion_id = a.id) AS bultos_hechos
FROM asignacion a
JOIN operaria op ON op.id = a.operaria_id
JOIN produccion_operacion po ON po.id = a.operacion_id
ORDER BY a.estado, op.nombre, a.creado_en DESC;

-- 4. Vista: detalle de bultos por asignación ─────────────────────────
-- Para la vista expandida de cada asignación.
DROP VIEW IF EXISTS vw_asignacion_bultos CASCADE;
CREATE VIEW vw_asignacion_bultos AS
SELECT 
    ab.asignacion_id,
    ab.produccion_bulto_id,
    pb.estado                   AS bulto_estado_manual,
    -- Código del bulto reconstruido desde la vista general
    vpe.codigo_bulto,
    vpe.codigo_corte,
    vpe.letra_corte,
    vpe.cod_prenda,
    vpe.talla_key_salida,
    vpe.cantidad_original,
    -- Si la operación específica ya fue registrada
    (SELECT pro.id FROM produccion_registro_operacion pro
     JOIN asignacion a ON a.id = ab.asignacion_id
     WHERE pro.produccion_bulto_id = ab.produccion_bulto_id
       AND pro.operacion_id = a.operacion_id
       AND pro.tipo = 'normal'
     LIMIT 1) AS registro_id,
    (SELECT pro.fecha FROM produccion_registro_operacion pro
     JOIN asignacion a ON a.id = ab.asignacion_id
     WHERE pro.produccion_bulto_id = ab.produccion_bulto_id
       AND pro.operacion_id = a.operacion_id
       AND pro.tipo = 'normal'
     LIMIT 1) AS fecha_hecho,
    (SELECT pro.cantidad_realizada FROM produccion_registro_operacion pro
     JOIN asignacion a ON a.id = ab.asignacion_id
     WHERE pro.produccion_bulto_id = ab.produccion_bulto_id
       AND pro.operacion_id = a.operacion_id
       AND pro.tipo = 'normal'
     LIMIT 1) AS cantidad_hecho
FROM asignacion_bulto ab
JOIN produccion_bulto pb ON pb.id = ab.produccion_bulto_id
LEFT JOIN vw_produccion_estado vpe ON vpe.produccion_bulto_id = ab.produccion_bulto_id;

-- 5. Vista: asignaciones activas por bulto ──────────────────────────
-- Para el dashboard principal, mostrar "quién tiene asignado este bulto".
DROP VIEW IF EXISTS vw_bulto_asignaciones CASCADE;
CREATE VIEW vw_bulto_asignaciones AS
SELECT 
    ab.produccion_bulto_id,
    a.id                AS asignacion_id,
    a.operaria_id,
    op.nombre           AS operaria_nombre,
    a.operacion_id,
    po.nombre           AS operacion_nombre,
    po.orden            AS operacion_orden,
    a.estado
FROM asignacion_bulto ab
JOIN asignacion a ON a.id = ab.asignacion_id
JOIN operaria op ON op.id = a.operaria_id
JOIN produccion_operacion po ON po.id = a.operacion_id
WHERE a.estado = 'activa';

-- ════════════════════════════════════════════════════════════════════
-- FIN v3.10
-- ════════════════════════════════════════════════════════════════════

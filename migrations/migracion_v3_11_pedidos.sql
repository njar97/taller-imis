-- ════════════════════════════════════════════════════════════════════
-- TALLER IMIS · Migración v3.11
-- Sistema de pedidos: temporadas, escuelas, proveedores, contratos
-- ════════════════════════════════════════════════════════════════════
-- Requisito: v3.1..v3.10 aplicadas
-- Idempotente
-- ════════════════════════════════════════════════════════════════════
--
-- Modelo:
--   temporada   → 2026, 2025, etc.  Varias pueden convivir.
--   proveedor   → América, IMIS, Javier/Nelson. Las tres operan juntas.
--   contrato    → código MINED (ME-03/2026). Vincula proveedor+temporada.
--   escuela     → centro educativo. Reusable entre temporadas.
--   pedido      → UNA LÍNEA = cantidad de piezas de UNA talla a producir
--                 para UNA escuela en UN nivel dentro de UN contrato.
--                 Multi-temporada, multi-proveedor, multi-contrato.
-- ════════════════════════════════════════════════════════════════════

-- 1. TEMPORADA ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS temporada (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo          TEXT UNIQUE NOT NULL,
    nombre          TEXT NOT NULL,
    anio            INT NOT NULL,
    estado          TEXT NOT NULL DEFAULT 'activa'
                    CHECK (estado IN ('activa','cerrada','planificacion')),
    fecha_inicio    DATE,
    fecha_cierre    DATE,
    observaciones   TEXT,
    creada_en       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE temporada DISABLE ROW LEVEL SECURITY;
COMMENT ON TABLE temporada IS 'Ciclos de producción anuales. Soporta varias en paralelo.';

-- 2. PROVEEDOR ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proveedor (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo          TEXT UNIQUE NOT NULL,
    nombre          TEXT NOT NULL,
    nombre_legal    TEXT,
    nit             TEXT,
    dui             TEXT,
    responsable     TEXT,
    activo          BOOLEAN DEFAULT TRUE,
    observaciones   TEXT,
    creado_en       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE proveedor DISABLE ROW LEVEL SECURITY;
COMMENT ON TABLE proveedor IS 'Entidades legales facturadoras (América, IMIS, Javier-Nelson).';

-- 3. ESCUELA ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escuela (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_cde      TEXT UNIQUE NOT NULL,
    nombre          TEXT NOT NULL,
    alias           TEXT,
    director        TEXT,
    distrito        TEXT,
    municipio       TEXT,
    departamento    TEXT,
    direccion       TEXT,
    coordenadas     TEXT,
    telefono        TEXT,
    activa          BOOLEAN DEFAULT TRUE,
    observaciones   TEXT,
    creada_en       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE escuela DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_escuela_nombre ON escuela(nombre);
COMMENT ON TABLE escuela IS 'Centros educativos. Se reusan entre temporadas.';

-- 4. CONTRATO ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contrato (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo          TEXT NOT NULL,
    temporada_id    UUID NOT NULL REFERENCES temporada(id) ON DELETE RESTRICT,
    proveedor_id    UUID NOT NULL REFERENCES proveedor(id) ON DELETE RESTRICT,
    fecha_firma     DATE,
    monto_usd       NUMERIC(12,2),
    observaciones   TEXT,
    creado_en       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (codigo, proveedor_id)
);
ALTER TABLE contrato DISABLE ROW LEVEL SECURITY;
COMMENT ON TABLE contrato IS 'Un contrato = proveedor + temporada + código MINED.';

-- 5. PEDIDO ─────────────────────────────────────────────────────────
-- Una línea = cantidad de piezas de una talla a producir para una escuela.
CREATE TABLE IF NOT EXISTS pedido (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id           UUID NOT NULL REFERENCES contrato(id) ON DELETE CASCADE,
    escuela_id            UUID NOT NULL REFERENCES escuela(id) ON DELETE RESTRICT,
    nivel                 TEXT NOT NULL
                          CHECK (nivel IN ('PARV','BASICA','BACH','OTRO')),
    cod_prenda            TEXT NOT NULL,  -- 'C','B','P','F','CC','S','FCE','FB','PB'
    nombre_prenda         TEXT,           -- opcional: etiqueta humana
    talla_key             TEXT NOT NULL,  -- 'C14','B12','P1075', etc.
    cantidad_solicitada   INT NOT NULL CHECK (cantidad_solicitada > 0),
    cantidad_entregada    INT NOT NULL DEFAULT 0 CHECK (cantidad_entregada >= 0),
    uniforme              INT DEFAULT 1   -- 1=primer uniforme, 2=segundo
                          CHECK (uniforme IN (1,2)),
    fuente                TEXT DEFAULT 'pronostico'
                          CHECK (fuente IN ('pronostico','real','manual')),
    observaciones         TEXT,
    creado_en             TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en        TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE pedido DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pedido_contrato ON pedido(contrato_id);
CREATE INDEX IF NOT EXISTS idx_pedido_escuela ON pedido(escuela_id);
CREATE INDEX IF NOT EXISTS idx_pedido_prenda_talla ON pedido(cod_prenda, talla_key);

COMMENT ON TABLE pedido IS 
    'Una fila por (escuela, nivel, prenda, talla). cantidad_solicitada = contrato, cantidad_entregada se actualiza manualmente al despachar.';

-- 6. VISTAS ─────────────────────────────────────────────────────────

-- Progreso por escuela
DROP VIEW IF EXISTS vw_pedido_escuela CASCADE;
CREATE VIEW vw_pedido_escuela AS
SELECT
    t.id           AS temporada_id,
    t.codigo       AS temporada_codigo,
    e.id           AS escuela_id,
    e.codigo_cde,
    e.nombre       AS escuela_nombre,
    e.alias,
    COUNT(p.id)                              AS lineas_pedido,
    COALESCE(SUM(p.cantidad_solicitada), 0)  AS piezas_solicitadas,
    COALESCE(SUM(p.cantidad_entregada), 0)   AS piezas_entregadas,
    COALESCE(SUM(p.cantidad_solicitada - p.cantidad_entregada), 0) AS piezas_pendientes,
    CASE WHEN COALESCE(SUM(p.cantidad_solicitada),0) > 0
         THEN ROUND(100.0 * SUM(p.cantidad_entregada) / SUM(p.cantidad_solicitada), 1)
         ELSE 0 END                          AS porcentaje_avance
FROM escuela e
LEFT JOIN pedido p ON p.escuela_id = e.id
LEFT JOIN contrato c ON c.id = p.contrato_id
LEFT JOIN temporada t ON t.id = c.temporada_id
WHERE e.activa
GROUP BY t.id, t.codigo, e.id, e.codigo_cde, e.nombre, e.alias;

-- Progreso por temporada (total general)
DROP VIEW IF EXISTS vw_temporada_resumen CASCADE;
CREATE VIEW vw_temporada_resumen AS
SELECT
    t.id, t.codigo, t.nombre, t.anio, t.estado,
    COUNT(DISTINCT e.id)                   AS num_escuelas,
    COUNT(p.id)                            AS num_pedidos,
    COALESCE(SUM(p.cantidad_solicitada),0) AS piezas_solicitadas,
    COALESCE(SUM(p.cantidad_entregada),0)  AS piezas_entregadas,
    COALESCE(SUM(p.cantidad_solicitada - p.cantidad_entregada),0) AS piezas_pendientes,
    CASE WHEN COALESCE(SUM(p.cantidad_solicitada),0) > 0
         THEN ROUND(100.0 * SUM(p.cantidad_entregada) / SUM(p.cantidad_solicitada), 1)
         ELSE 0 END                        AS porcentaje_avance
FROM temporada t
LEFT JOIN contrato c ON c.temporada_id = t.id
LEFT JOIN pedido p ON p.contrato_id = c.id
LEFT JOIN escuela e ON e.id = p.escuela_id
GROUP BY t.id, t.codigo, t.nombre, t.anio, t.estado;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════
-- FIN v3.11
-- ════════════════════════════════════════════════════════════════════

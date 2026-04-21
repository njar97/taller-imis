-- ════════════════════════════════════════════════════════════════════
-- TALLER IMIS · Migración v3.13
-- Bodega: inventario de prendas terminadas
-- ════════════════════════════════════════════════════════════════════
-- Requisito: v3.12 aplicada
-- Idempotente
-- ════════════════════════════════════════════════════════════════════
--
-- Modelo:
--   bodega_movimiento = movimiento de entrada o salida por talla
--   stock = entradas - salidas (calculado en vista)
--
-- Tipos de movimiento:
--   ENTRADA_PRODUCCION  = bulto terminado entra a bodega
--   ENTRADA_MANUAL      = ajuste manual (piezas encontradas, devoluciones)
--   SALIDA_EMPAQUE      = se empaca para un alumno (reserva)
--   SALIDA_ENTREGA      = se entrega físicamente a la escuela
--   AJUSTE_INVENTARIO   = corrección de stock
--   DEFECTO             = prenda devuelta a producción (sale de stock disponible)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bodega_movimiento (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo            TEXT NOT NULL
                    CHECK (tipo IN ('ENTRADA_PRODUCCION','ENTRADA_MANUAL',
                                     'SALIDA_EMPAQUE','SALIDA_ENTREGA',
                                     'AJUSTE_INVENTARIO','DEFECTO')),
    cod_prenda      TEXT NOT NULL,
    nombre_prenda   TEXT,
    talla_key       TEXT NOT NULL,
    cantidad        INT NOT NULL CHECK (cantidad > 0),
    -- Enlaces opcionales
    produccion_bulto_id UUID REFERENCES produccion_bulto(id) ON DELETE SET NULL,
    alumno_id        UUID REFERENCES alumno(id) ON DELETE SET NULL,
    escuela_id       UUID REFERENCES escuela(id) ON DELETE SET NULL,
    pedido_id        UUID REFERENCES pedido(id) ON DELETE SET NULL,
    -- Metadata
    fecha           DATE DEFAULT CURRENT_DATE,
    usuario         TEXT,
    observaciones   TEXT,
    creado_en       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE bodega_movimiento DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bodega_mov_talla ON bodega_movimiento(cod_prenda, talla_key);
CREATE INDEX IF NOT EXISTS idx_bodega_mov_fecha ON bodega_movimiento(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_bodega_mov_tipo ON bodega_movimiento(tipo);
CREATE INDEX IF NOT EXISTS idx_bodega_mov_bulto ON bodega_movimiento(produccion_bulto_id);
CREATE INDEX IF NOT EXISTS idx_bodega_mov_alumno ON bodega_movimiento(alumno_id);

COMMENT ON TABLE bodega_movimiento IS 'Todos los movimientos de entrada/salida. El stock se calcula sumando.';

-- ─── VISTA: Stock actual ────────────────────────────────────────────
DROP VIEW IF EXISTS vw_bodega_stock CASCADE;
CREATE VIEW vw_bodega_stock AS
SELECT
    cod_prenda,
    nombre_prenda,
    talla_key,
    SUM(CASE WHEN tipo IN ('ENTRADA_PRODUCCION','ENTRADA_MANUAL') THEN cantidad ELSE 0 END) AS total_entrado,
    SUM(CASE WHEN tipo IN ('SALIDA_EMPAQUE','SALIDA_ENTREGA','DEFECTO') THEN cantidad ELSE 0 END) AS total_salido,
    SUM(CASE WHEN tipo IN ('AJUSTE_INVENTARIO') THEN cantidad ELSE 0 END) AS total_ajustes,
    SUM(CASE WHEN tipo IN ('ENTRADA_PRODUCCION','ENTRADA_MANUAL') THEN cantidad
             WHEN tipo IN ('SALIDA_EMPAQUE','SALIDA_ENTREGA','DEFECTO') THEN -cantidad
             WHEN tipo = 'AJUSTE_INVENTARIO' THEN cantidad
             ELSE 0 END) AS stock_actual,
    -- Solo lo que queda disponible (no reservado para un alumno)
    SUM(CASE WHEN tipo IN ('ENTRADA_PRODUCCION','ENTRADA_MANUAL') THEN cantidad
             WHEN tipo IN ('SALIDA_ENTREGA','DEFECTO') THEN -cantidad
             WHEN tipo = 'AJUSTE_INVENTARIO' THEN cantidad
             ELSE 0 END) AS stock_disponible,
    -- Lo que ya está empacado para un alumno pero no ha salido a escuela
    SUM(CASE WHEN tipo = 'SALIDA_EMPAQUE' THEN cantidad ELSE 0 END) AS reservado_empaque
FROM bodega_movimiento
GROUP BY cod_prenda, nombre_prenda, talla_key;

-- ─── VISTA: Stock vs Demanda (lo que falta producir) ────────────────
DROP VIEW IF EXISTS vw_bodega_vs_demanda CASCADE;
CREATE VIEW vw_bodega_vs_demanda AS
SELECT
    COALESCE(s.talla_key, d.talla_key)        AS talla_key,
    COALESCE(s.nombre_prenda, d.prenda)       AS prenda,
    COALESCE(s.cod_prenda, '?')               AS cod_prenda,
    COALESCE(d.demandada, 0)                  AS demandada,
    COALESCE(d.empacados, 0)                  AS empacados,
    COALESCE(d.pendientes, 0)                 AS por_empacar,
    COALESCE(s.stock_disponible, 0)           AS stock_disponible,
    COALESCE(s.reservado_empaque, 0)          AS reservado,
    -- Cuánto falta producir para cubrir todo lo pendiente
    GREATEST(0, COALESCE(d.pendientes, 0) - COALESCE(s.stock_disponible, 0)) AS faltante
FROM vw_bodega_stock s
FULL OUTER JOIN vw_alumno_demanda d
    ON s.talla_key = d.talla_key
    AND s.nombre_prenda = d.prenda;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════
-- FIN v3.13
-- ════════════════════════════════════════════════════════════════════

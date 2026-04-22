-- ════════════════════════════════════════════════════════════════════
-- TALLER IMIS · Migración v3.14
-- Grupo de producción (C.E del Excel) en escuela
-- ════════════════════════════════════════════════════════════════════
-- Requisito: v3.12 aplicada
-- Idempotente
-- ════════════════════════════════════════════════════════════════════

-- Agregar campo grupo_produccion si no existe
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'escuela' AND column_name = 'grupo_produccion'
    ) THEN
        ALTER TABLE escuela ADD COLUMN grupo_produccion TEXT;
        COMMENT ON COLUMN escuela.grupo_produccion IS 
            'Grupo de producción (C.E del Excel): G1, G2... para escuelas agrupadas, o nombre propio para escuelas grandes.';
    END IF;
END $$;

-- Índice
CREATE INDEX IF NOT EXISTS idx_escuela_grupo_prod ON escuela(grupo_produccion);

-- Vista: alumnos agrupados por grupo de producción
DROP VIEW IF EXISTS vw_alumno_grupo_produccion CASCADE;
CREATE VIEW vw_alumno_grupo_produccion AS
SELECT
    a.temporada_id,
    COALESCE(e.grupo_produccion, e.codigo_cde) AS grupo,
    a.nivel,
    a.prenda_top,
    a.talla_top_key,
    a.prenda_bottom,
    a.talla_bottom_key,
    COUNT(*) FILTER (WHERE a.activo) AS cantidad
FROM alumno a
JOIN escuela e ON e.id = a.escuela_id
WHERE a.activo
GROUP BY a.temporada_id, COALESCE(e.grupo_produccion, e.codigo_cde), a.nivel,
         a.prenda_top, a.talla_top_key, a.prenda_bottom, a.talla_bottom_key;

-- Vista: lista única de grados usados (para autocomplete)
DROP VIEW IF EXISTS vw_grados_conocidos CASCADE;
CREATE VIEW vw_grados_conocidos AS
SELECT DISTINCT grado, nivel, COUNT(*) AS usos
FROM alumno
WHERE grado IS NOT NULL AND grado != ''
GROUP BY grado, nivel
ORDER BY usos DESC;

NOTIFY pgrst, 'reload schema';

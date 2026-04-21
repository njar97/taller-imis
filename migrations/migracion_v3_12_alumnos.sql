-- ════════════════════════════════════════════════════════════════════
-- TALLER IMIS · Migración v3.12
-- Alumnos + estado de empaque
-- ════════════════════════════════════════════════════════════════════
-- Requisito: v3.11 aplicada
-- Idempotente
-- ════════════════════════════════════════════════════════════════════
--
-- Modelo:
--   alumno = un estudiante en una temporada particular
--   cada alumno necesita 2 prendas (top + bottom)
--   el estado de empaque es por cada prenda (EstadoT, EstadoP)
-- ════════════════════════════════════════════════════════════════════

-- 1. ALUMNO ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alumno (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    temporada_id     UUID NOT NULL REFERENCES temporada(id) ON DELETE RESTRICT,
    escuela_id       UUID NOT NULL REFERENCES escuela(id) ON DELETE RESTRICT,
    nombre           TEXT NOT NULL,
    grado            TEXT,
    nivel            TEXT CHECK (nivel IN ('PARV','BASICA','BACH','OTRO')),
    ciclo            INT,
    sexo             TEXT CHECK (sexo IN ('F','M','NA')),
    -- Prenda top (camisa/blusa/camisa_celeste)
    prenda_top       TEXT,
    talla_top_key    TEXT,
    estado_top       TEXT DEFAULT 'pendiente'
                     CHECK (estado_top IN ('pendiente','reservado','empacado','entregado','cancelado')),
    empacado_top_en  TIMESTAMPTZ,
    -- Prenda bottom (pantalón/falda/short)
    prenda_bottom    TEXT,
    talla_bottom_key TEXT,
    estado_bottom    TEXT DEFAULT 'pendiente'
                     CHECK (estado_bottom IN ('pendiente','reservado','empacado','entregado','cancelado')),
    empacado_bottom_en TIMESTAMPTZ,
    -- Estado global
    activo           BOOLEAN DEFAULT TRUE,  -- FALSE = alumno dado de baja (OUT del Excel)
    observaciones    TEXT,
    creado_en        TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE alumno DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_alumno_escuela ON alumno(escuela_id);
CREATE INDEX IF NOT EXISTS idx_alumno_temporada ON alumno(temporada_id);
CREATE INDEX IF NOT EXISTS idx_alumno_talla_top ON alumno(talla_top_key);
CREATE INDEX IF NOT EXISTS idx_alumno_talla_bottom ON alumno(talla_bottom_key);
CREATE INDEX IF NOT EXISTS idx_alumno_estado ON alumno(estado_top, estado_bottom);
CREATE INDEX IF NOT EXISTS idx_alumno_nombre ON alumno(nombre);

COMMENT ON TABLE alumno IS 'Estudiantes con sus tallas. Cada alumno = 2 prendas (top + bottom).';

-- 2. VISTA: resumen por escuela + grado ─────────────────────────────
DROP VIEW IF EXISTS vw_alumno_escuela CASCADE;
CREATE VIEW vw_alumno_escuela AS
SELECT
    a.temporada_id,
    a.escuela_id,
    e.codigo_cde,
    e.nombre AS escuela_nombre,
    a.grado,
    a.nivel,
    COUNT(*) FILTER (WHERE a.activo) AS total_alumnos,
    COUNT(*) FILTER (WHERE a.activo AND a.estado_top = 'empacado') AS top_empacados,
    COUNT(*) FILTER (WHERE a.activo AND a.estado_bottom = 'empacado') AS bottom_empacados,
    COUNT(*) FILTER (WHERE a.activo AND a.estado_top = 'empacado' AND a.estado_bottom = 'empacado') AS completos,
    COUNT(*) FILTER (WHERE a.activo AND a.estado_top = 'entregado' AND a.estado_bottom = 'entregado') AS entregados
FROM alumno a
JOIN escuela e ON e.id = a.escuela_id
GROUP BY a.temporada_id, a.escuela_id, e.codigo_cde, e.nombre, a.grado, a.nivel;

-- 3. VISTA: demanda agregada por talla (para planificar producción) ──
-- Cuánto se necesita de cada talla según los alumnos activos no entregados
DROP VIEW IF EXISTS vw_alumno_demanda CASCADE;
CREATE VIEW vw_alumno_demanda AS
SELECT talla_key, prenda, demandada, empacados, pendientes FROM (
    -- Demanda de tops
    SELECT 
        a.talla_top_key AS talla_key,
        a.prenda_top AS prenda,
        COUNT(*) FILTER (WHERE a.activo) AS demandada,
        COUNT(*) FILTER (WHERE a.activo AND a.estado_top IN ('empacado','entregado')) AS empacados,
        COUNT(*) FILTER (WHERE a.activo AND a.estado_top IN ('pendiente','reservado')) AS pendientes
    FROM alumno a
    WHERE a.talla_top_key IS NOT NULL
    GROUP BY a.talla_top_key, a.prenda_top
    
    UNION ALL
    
    -- Demanda de bottoms
    SELECT 
        a.talla_bottom_key AS talla_key,
        a.prenda_bottom AS prenda,
        COUNT(*) FILTER (WHERE a.activo) AS demandada,
        COUNT(*) FILTER (WHERE a.activo AND a.estado_bottom IN ('empacado','entregado')) AS empacados,
        COUNT(*) FILTER (WHERE a.activo AND a.estado_bottom IN ('pendiente','reservado')) AS pendientes
    FROM alumno a
    WHERE a.talla_bottom_key IS NOT NULL
    GROUP BY a.talla_bottom_key, a.prenda_bottom
) x;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════
-- FIN v3.12
-- ════════════════════════════════════════════════════════════════════

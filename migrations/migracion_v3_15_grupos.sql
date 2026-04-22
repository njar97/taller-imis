-- ════════════════════════════════════════════════════════════════════
-- TALLER IMIS · Migración v3.15
-- Grupos de trabajo (salió de la reunión con Nelson e Imelda)
-- ════════════════════════════════════════════════════════════════════
-- Requisito: v3.8 (operaria) aplicada
-- Idempotente
-- ════════════════════════════════════════════════════════════════════
--
-- Modelo:
--   grupo_trabajo    = un equipo de operarias (permanente o ad-hoc)
--   grupo_operaria   = pertenencia actual de operarias a grupos
--   grupo_produccion = cuando un grupo toma una tarea de producción
--                      + registro opcional de contribución individual
-- ════════════════════════════════════════════════════════════════════

-- 1. GRUPO DE TRABAJO ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grupo_trabajo (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo          TEXT UNIQUE NOT NULL,
    nombre          TEXT NOT NULL,
    tipo            TEXT NOT NULL DEFAULT 'permanente'
                    CHECK (tipo IN ('permanente','adhoc')),
    activo          BOOLEAN DEFAULT TRUE,
    observaciones   TEXT,
    creado_en       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE grupo_trabajo DISABLE ROW LEVEL SECURITY;
COMMENT ON TABLE grupo_trabajo IS 
    'Equipos de trabajo. Permanentes (Costura/Acabado) o ad-hoc (para tareas específicas).';

-- 2. GRUPO ↔ OPERARIA (membresía) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS grupo_operaria (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo_id        UUID NOT NULL REFERENCES grupo_trabajo(id) ON DELETE CASCADE,
    operaria_id     UUID NOT NULL REFERENCES operaria(id) ON DELETE CASCADE,
    rol             TEXT,  -- opcional: lider, soporte, etc.
    activo          BOOLEAN DEFAULT TRUE,
    desde           DATE DEFAULT CURRENT_DATE,
    hasta           DATE,
    creado_en       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (grupo_id, operaria_id, desde)
);
ALTER TABLE grupo_operaria DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_grupo_op_grupo ON grupo_operaria(grupo_id);
CREATE INDEX IF NOT EXISTS idx_grupo_op_op ON grupo_operaria(operaria_id);

COMMENT ON TABLE grupo_operaria IS 
    'Quién está en qué grupo. Una operaria puede estar en varios grupos a la vez.';

-- 3. PRODUCCIÓN POR GRUPO ──────────────────────────────────────────
-- Cuando un grupo toma una tarea (un bulto, una operación específica)
CREATE TABLE IF NOT EXISTS grupo_produccion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo_id              UUID NOT NULL REFERENCES grupo_trabajo(id) ON DELETE RESTRICT,
    produccion_bulto_id   UUID REFERENCES produccion_bulto(id) ON DELETE CASCADE,
    operacion_id          UUID REFERENCES produccion_operacion(id) ON DELETE SET NULL,
    cantidad_asignada     INT NOT NULL DEFAULT 0,
    cantidad_terminada    INT NOT NULL DEFAULT 0,
    fecha_asignada        DATE DEFAULT CURRENT_DATE,
    fecha_cerrada         DATE,
    estado                TEXT DEFAULT 'en_curso'
                          CHECK (estado IN ('en_curso','terminada','cancelada')),
    observaciones         TEXT,
    creado_en             TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE grupo_produccion DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_grupo_prod_grupo ON grupo_produccion(grupo_id);
CREATE INDEX IF NOT EXISTS idx_grupo_prod_bulto ON grupo_produccion(produccion_bulto_id);
CREATE INDEX IF NOT EXISTS idx_grupo_prod_estado ON grupo_produccion(estado);

-- 4. CONTRIBUCIÓN INDIVIDUAL (opcional, para destajo) ──────────────
-- Cuando querés saber cuánto hizo cada una dentro del grupo
CREATE TABLE IF NOT EXISTS grupo_contribucion (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo_produccion_id     UUID NOT NULL REFERENCES grupo_produccion(id) ON DELETE CASCADE,
    operaria_id             UUID NOT NULL REFERENCES operaria(id) ON DELETE RESTRICT,
    cantidad                INT NOT NULL CHECK (cantidad >= 0),
    fecha                   DATE DEFAULT CURRENT_DATE,
    observaciones           TEXT,
    creado_en               TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE grupo_contribucion DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_grupo_contrib_prod ON grupo_contribucion(grupo_produccion_id);
CREATE INDEX IF NOT EXISTS idx_grupo_contrib_op ON grupo_contribucion(operaria_id);

COMMENT ON TABLE grupo_contribucion IS 
    'Cuánto hizo cada operaria dentro de una tarea de grupo. Opcional, para destajo.';

-- 5. VISTAS ─────────────────────────────────────────────────────────

-- Grupos activos con sus operarias
DROP VIEW IF EXISTS vw_grupo_con_operarias CASCADE;
CREATE VIEW vw_grupo_con_operarias AS
SELECT
    g.id                AS grupo_id,
    g.codigo,
    g.nombre,
    g.tipo,
    g.activo,
    COUNT(go.id) FILTER (WHERE go.activo) AS num_operarias,
    STRING_AGG(o.nombre, ', ' ORDER BY o.nombre) FILTER (WHERE go.activo) AS operarias_nombres
FROM grupo_trabajo g
LEFT JOIN grupo_operaria go ON go.grupo_id = g.id
LEFT JOIN operaria o ON o.id = go.operaria_id
GROUP BY g.id, g.codigo, g.nombre, g.tipo, g.activo;

-- Productividad por operaria (cuánto hizo cada una)
DROP VIEW IF EXISTS vw_operaria_productividad CASCADE;
CREATE VIEW vw_operaria_productividad AS
SELECT
    o.id                AS operaria_id,
    o.nombre,
    COUNT(DISTINCT gc.grupo_produccion_id) AS tareas_participadas,
    COALESCE(SUM(gc.cantidad), 0) AS total_piezas,
    MIN(gc.fecha) AS primera_fecha,
    MAX(gc.fecha) AS ultima_fecha
FROM operaria o
LEFT JOIN grupo_contribucion gc ON gc.operaria_id = o.id
GROUP BY o.id, o.nombre;

-- Productividad por grupo
DROP VIEW IF EXISTS vw_grupo_productividad CASCADE;
CREATE VIEW vw_grupo_productividad AS
SELECT
    g.id                AS grupo_id,
    g.codigo,
    g.nombre,
    COUNT(DISTINCT gp.id) AS tareas_totales,
    COUNT(DISTINCT gp.id) FILTER (WHERE gp.estado = 'terminada') AS tareas_terminadas,
    COUNT(DISTINCT gp.id) FILTER (WHERE gp.estado = 'en_curso')  AS tareas_en_curso,
    COALESCE(SUM(gp.cantidad_terminada), 0) AS total_piezas_terminadas
FROM grupo_trabajo g
LEFT JOIN grupo_produccion gp ON gp.grupo_id = g.id
GROUP BY g.id, g.codigo, g.nombre;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════
-- FIN v3.15
-- ════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- TALLER IMIS · Migración v3.32
-- Materiales (avíos): catálogo + movimientos + stock
-- ════════════════════════════════════════════════════════════════════
-- Requisito: v3.21 aplicada (fn_audit, current_user_role)
-- Idempotente
-- ════════════════════════════════════════════════════════════════════
--
-- Modelo:
--   material             = un insumo (hilo, botón, zipper, elástico, pelum…)
--                          con su nombre de factura, unidad y lo que pide el lote 1.
--   material_movimiento  = CONTEO (stock absoluto contado), COMPRA (+),
--                          SALIDA (−), AJUSTE (±).
--   vw_material_stock    = último CONTEO + movimientos posteriores.
--                          faltante = necesidad − stock − pedido (lo ya pedido
--                          al proveedor y todavía no recibido).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.material (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo          TEXT NOT NULL UNIQUE,
    nombre          TEXT NOT NULL,
    nombre_factura  TEXT,
    categoria       TEXT NOT NULL
                    CHECK (categoria IN ('HILO','BOTON','ZIPPER','ELASTICO','ENTRETELA','ETIQUETA','EMPAQUE','OTRO')),
    unidad          TEXT NOT NULL,              -- cono, gruesa, unidad, yd, rollo
    presentacion    TEXT,                       -- caja de 50, rollo de 75 yd, gruesa = 144
    proveedor       TEXT,
    precio_ref      NUMERIC,                    -- por unidad, sin IVA, última factura
    necesidad_lote1 NUMERIC NOT NULL DEFAULT 0,
    pedido          NUMERIC NOT NULL DEFAULT 0, -- pedido al proveedor, no recibido
    orden           INT NOT NULL DEFAULT 100,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    observaciones   TEXT,
    creado_en       TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.material IS 'Catálogo de avíos (hilo, botón, zipper, elástico, entretela). nombre_factura = como lo vende el proveedor; se pide con ese nombre.';

CREATE TABLE IF NOT EXISTS public.material_movimiento (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id     UUID NOT NULL REFERENCES public.material(id) ON DELETE CASCADE,
    tipo            TEXT NOT NULL CHECK (tipo IN ('CONTEO','COMPRA','SALIDA','AJUSTE')),
    cantidad        NUMERIC NOT NULL,           -- CONTEO: total contado; SALIDA: positivo (se resta); AJUSTE: ±
    fecha           DATE DEFAULT CURRENT_DATE,
    usuario         TEXT,
    observaciones   TEXT,
    creado_en       TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.material_movimiento IS 'Movimientos de avíos. El stock = último CONTEO + COMPRA/AJUSTE − SALIDA posteriores.';

CREATE INDEX IF NOT EXISTS idx_material_mov_material ON public.material_movimiento(material_id, creado_en DESC);

-- ─── RLS (mismo esquema biz_* que el resto del negocio) ─────────────
ALTER TABLE public.material ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_movimiento ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['material','material_movimiento'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS biz_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_delete ON public.%I', t);
    EXECUTE format('CREATE POLICY biz_select ON public.%I FOR SELECT TO authenticated USING (public.current_user_role() = ANY (ARRAY[''admin'',''operador'']))', t);
    EXECUTE format('CREATE POLICY biz_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = ANY (ARRAY[''admin'',''operador'']))', t);
    EXECUTE format('CREATE POLICY biz_update ON public.%I FOR UPDATE TO authenticated USING (public.current_user_role() = ANY (ARRAY[''admin'',''operador''])) WITH CHECK (public.current_user_role() = ANY (ARRAY[''admin'',''operador'']))', t);
    EXECUTE format('CREATE POLICY biz_delete ON public.%I FOR DELETE TO authenticated USING (public.current_user_role() = ''admin'')', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_audit()', t);
  END LOOP;
END $$;

REVOKE ALL ON public.material, public.material_movimiento FROM anon;

-- ─── VISTA: stock por material ──────────────────────────────────────
DROP VIEW IF EXISTS public.vw_material_stock;
CREATE VIEW public.vw_material_stock WITH (security_invoker = true) AS
WITH ult AS (
  SELECT DISTINCT ON (material_id) material_id, cantidad AS base, creado_en AS conteo_en, fecha AS conteo_fecha
  FROM public.material_movimiento
  WHERE tipo = 'CONTEO'
  ORDER BY material_id, creado_en DESC
),
mov AS (
  SELECT m.material_id,
         SUM(CASE WHEN m.tipo IN ('COMPRA','AJUSTE') THEN m.cantidad
                  WHEN m.tipo = 'SALIDA' THEN -m.cantidad
                  ELSE 0 END) AS delta
  FROM public.material_movimiento m
  LEFT JOIN ult ON ult.material_id = m.material_id
  WHERE m.tipo <> 'CONTEO'
    AND (ult.conteo_en IS NULL OR m.creado_en > ult.conteo_en)
  GROUP BY m.material_id
)
SELECT mat.id, mat.codigo, mat.nombre, mat.nombre_factura, mat.categoria, mat.unidad,
       mat.presentacion, mat.proveedor, mat.precio_ref, mat.necesidad_lote1, mat.pedido,
       mat.orden, mat.activo, mat.observaciones,
       COALESCE(ult.base, 0) + COALESCE(mov.delta, 0)                       AS stock,
       ult.conteo_fecha                                                     AS ultimo_conteo,
       GREATEST(0, mat.necesidad_lote1 - (COALESCE(ult.base, 0) + COALESCE(mov.delta, 0)) - mat.pedido) AS faltante
FROM public.material mat
LEFT JOIN ult ON ult.material_id = mat.id
LEFT JOIN mov ON mov.material_id = mat.id;

GRANT SELECT ON public.vw_material_stock TO authenticated;
REVOKE ALL ON public.vw_material_stock FROM anon;

INSERT INTO public._migraciones (nombre, aplicada_en)
SELECT 'migracion_v3_32_materiales.sql', NOW()
WHERE NOT EXISTS (SELECT 1 FROM public._migraciones WHERE nombre = 'migracion_v3_32_materiales.sql');

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════
-- FIN v3.32
-- ════════════════════════════════════════════════════════════════════

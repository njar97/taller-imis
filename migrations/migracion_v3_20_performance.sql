-- =====================================================================
-- Migración v3.20 — Performance (fixes de Supabase Advisors)
-- =====================================================================
-- Aborda los hallazgos del Performance Linter tras v3.19:
--
--  1. multiple_permissive_policies (100 WARN) — en v3.18/v3.19 cada
--     tabla quedó con 4 policies separadas: biz_admin_all (ALL para
--     admin) + biz_op_select/insert/update (operador). Para cada query
--     a una tabla, Postgres evalúa AMBAS policies aplicables al rol y
--     a la acción, lo que es costoso. Consolidamos en 4 policies
--     no superpuestas (una por acción): SELECT/INSERT/UPDATE para
--     {admin, operador}, DELETE solo admin. Semánticamente idéntico,
--     una sola evaluación por acción.
--
--  2. auth_rls_initplan (1 WARN) — la policy aur_select_self llama
--     auth.uid() per row. Wrappeamos en (SELECT auth.uid()) para que
--     se evalúe una vez por query y se cachee (Postgres trata a la
--     subquery como un InitPlan).
--
--  3. unindexed_foreign_keys (17 WARN) — todos los FKs sin índice
--     covering. Agregamos CREATE INDEX IF NOT EXISTS.
--
--  4. duplicate_index (3 WARN) — pares de índices idénticos en
--     bordados (estatus) y pedidos (cliente, estatus). Borramos las
--     variantes con prefijo idx_ y conservamos las <tabla>_<col>_idx.
--
-- No se tocan los 43 unused_index (INFO): sin tráfico real todo índice
-- aparece como no usado. Se revisará cuando haya métricas reales.
--
-- Idempotente.
-- =====================================================================

BEGIN;

-- 1. Consolidación de policies de negocio -------------------------------------
-- 33 tablas de v3.18 + 5 fantasma de v3.19 = 38 tablas.
DO $$
DECLARE
  t text;
  tablas text[] := ARRAY[
    -- v3.18 (33)
    'escuela', 'grupo_trabajo', 'prenda_detalle', 'temporada', '_migraciones',
    'tendido_talla_marcada', 'contrato', 'operaria', 'alumno', 'proveedor',
    'bodega_movimiento', 'prenda_talla_largo', 'grupo_operaria', 'grupo_contribucion',
    'catalogo_key', 'produccion_registro_operacion', 'asignacion', 'produccion_bulto',
    'pedido', 'grupo_produccion', 'tendido_rollo_salida', 'prenda', 'asignacion_bulto',
    'trazo_talla_marcada', 'prenda_talla', 'produccion_operacion', 'prenda_largo',
    'tendido', 'tendido_rollo', 'trazo', 'trazo_pieza', 'trazo_prenda', 'trazo_secundaria',
    -- v3.19 (5 fantasma)
    'bordados', 'catalogo', 'clientes', 'cuellos', 'pedidos'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    -- Dropear las 4 viejas (v3.18/v3.19)
    EXECUTE format('DROP POLICY IF EXISTS biz_admin_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_op_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_op_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_op_update ON public.%I', t);
    -- Dropear las nuevas (idempotencia en re-run)
    EXECUTE format('DROP POLICY IF EXISTS biz_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_delete ON public.%I', t);

    -- Crear las 4 consolidadas
    EXECUTE format($f$
      CREATE POLICY biz_select ON public.%I
        FOR SELECT TO authenticated
        USING (public.current_user_role() IN ('admin','operador'))
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY biz_insert ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (public.current_user_role() IN ('admin','operador'))
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY biz_update ON public.%I
        FOR UPDATE TO authenticated
        USING (public.current_user_role() IN ('admin','operador'))
        WITH CHECK (public.current_user_role() IN ('admin','operador'))
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY biz_delete ON public.%I
        FOR DELETE TO authenticated
        USING (public.current_user_role() = 'admin')
    $f$, t);
  END LOOP;
END$$;


-- 2. Reorganizar policies de app_user_role -----------------------------------
-- Pasaba lo mismo que en las 38 tablas: aur_admin_all (FOR ALL) y
-- aur_select_self (FOR SELECT) se solapaban en SELECT, generando 1
-- multiple_permissive_policies. Y aur_select_self llamaba auth.uid()
-- per row. Reemplazamos por 4 policies no superpuestas (una por acción):
--   - aur_select: SELECT — uno mismo, o admin
--   - aur_insert/update/delete: solo admin
DROP POLICY IF EXISTS aur_admin_all ON public.app_user_role;
DROP POLICY IF EXISTS aur_select_self ON public.app_user_role;
DROP POLICY IF EXISTS aur_select ON public.app_user_role;
DROP POLICY IF EXISTS aur_insert ON public.app_user_role;
DROP POLICY IF EXISTS aur_update ON public.app_user_role;
DROP POLICY IF EXISTS aur_delete ON public.app_user_role;

CREATE POLICY aur_select ON public.app_user_role
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.current_user_role() = 'admin'
  );

CREATE POLICY aur_insert ON public.app_user_role
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY aur_update ON public.app_user_role
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY aur_delete ON public.app_user_role
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');


-- 3. Índices en FKs sin covering ---------------------------------------------
CREATE INDEX IF NOT EXISTS bodega_movimiento_escuela_id_idx
  ON public.bodega_movimiento (escuela_id);
CREATE INDEX IF NOT EXISTS bodega_movimiento_pedido_id_idx
  ON public.bodega_movimiento (pedido_id);

CREATE INDEX IF NOT EXISTS contrato_proveedor_id_idx
  ON public.contrato (proveedor_id);
CREATE INDEX IF NOT EXISTS contrato_temporada_id_idx
  ON public.contrato (temporada_id);

CREATE INDEX IF NOT EXISTS grupo_produccion_operacion_id_idx
  ON public.grupo_produccion (operacion_id);

CREATE INDEX IF NOT EXISTS produccion_bulto_bulto_origen_id_idx
  ON public.produccion_bulto (bulto_origen_id);
CREATE INDEX IF NOT EXISTS produccion_bulto_unido_a_id_idx
  ON public.produccion_bulto (unido_a_id);

CREATE INDEX IF NOT EXISTS produccion_registro_operacion_operaria_id_idx
  ON public.produccion_registro_operacion (operaria_id);
CREATE INDEX IF NOT EXISTS produccion_registro_operacion_produccion_bulto_id_idx
  ON public.produccion_registro_operacion (produccion_bulto_id);

CREATE INDEX IF NOT EXISTS tendido_rollo_tendido_id_idx
  ON public.tendido_rollo (tendido_id);

CREATE INDEX IF NOT EXISTS tendido_rollo_salida_bulto_hermano_id_idx
  ON public.tendido_rollo_salida (bulto_hermano_id);

CREATE INDEX IF NOT EXISTS tendido_talla_marcada_complemento_id_idx
  ON public.tendido_talla_marcada (complemento_id);
CREATE INDEX IF NOT EXISTS tendido_talla_marcada_trazo_talla_marcada_id_idx
  ON public.tendido_talla_marcada (trazo_talla_marcada_id);

CREATE INDEX IF NOT EXISTS trazo_pieza_trazo_prenda_id_idx
  ON public.trazo_pieza (trazo_prenda_id);

CREATE INDEX IF NOT EXISTS trazo_prenda_trazo_id_idx
  ON public.trazo_prenda (trazo_id);

CREATE INDEX IF NOT EXISTS trazo_secundaria_trazo_id_idx
  ON public.trazo_secundaria (trazo_id);

CREATE INDEX IF NOT EXISTS trazo_talla_marcada_complemento_id_idx
  ON public.trazo_talla_marcada (complemento_id);


-- 4. Drop de índices duplicados ----------------------------------------------
-- Mantenemos los <tabla>_<col>_idx, dropeamos los idx_<tabla>_<col>.
DROP INDEX IF EXISTS public.idx_bordados_estatus;
DROP INDEX IF EXISTS public.idx_pedidos_cliente;
DROP INDEX IF EXISTS public.idx_pedidos_estatus;

COMMIT;

-- =====================================================================
-- Verificación post-aplicación:
--
--   -- 38 tablas con 4 policies biz_* (select/insert/update/delete)
--   SELECT tablename, count(*) AS n,
--          string_agg(policyname, ',' ORDER BY policyname) AS pols
--   FROM pg_policies
--   WHERE schemaname='public'
--     AND policyname LIKE 'biz_%'
--   GROUP BY tablename
--   HAVING count(*) <> 4 OR string_agg(policyname,',' ORDER BY policyname)
--          <> 'biz_delete,biz_insert,biz_select,biz_update';
--   -- Debe devolver 0 filas si todo está consistente.
--
--   -- Los 17 índices creados
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname='public' AND indexname LIKE '%_idx'
--   ORDER BY indexname;
--
--   -- Los 3 duplicados borrados (no deben aparecer)
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname='public'
--     AND indexname IN ('idx_bordados_estatus','idx_pedidos_cliente','idx_pedidos_estatus');
--
--   -- get_advisors(performance) debe pasar de 164 → ~46 lints
--   -- (quedan los 43 unused_index INFO + algún rastro).
-- =====================================================================

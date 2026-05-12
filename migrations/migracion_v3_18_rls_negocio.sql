-- =====================================================================
-- Migración v3.18 — RLS sobre tablas de negocio (admin / operador)
-- =====================================================================
-- Cierra el agujero: anon ya no puede leer/escribir las tablas. Solo
-- usuarios autenticados, con permisos según su rol en app_user_role:
--
--   admin    → ALL (SELECT, INSERT, UPDATE, DELETE)
--   operador → SELECT, INSERT, UPDATE (no DELETE)
--
-- Prerequisitos:
--   1. v3.17 aplicada (tabla app_user_role + current_user_role()).
--   2. Existe al menos UN usuario en app_user_role con role='admin'.
--      Si no, ningún admin podrá borrar nada nunca más, y la app
--      empezará a fallar para todos los anónimos (efecto esperado).
--   3. produccion.html en GitHub Pages ya tiene la nueva versión con
--      login (de la PR v3.17). Si no, los usuarios verán "no autorizado"
--      en cada request porque el código todavía manda anon key como Bearer.
--
-- También tira las policies "acceso_publico_*" viejas que dejaban
-- pasar a todo el mundo en las 6 tablas con RLS ya activa pero inútil.
--
-- Idempotente: re-ejecutable sin errores.
-- =====================================================================

BEGIN;

DO $$
DECLARE
  t text;
  -- 27 tablas de negocio + 6 con RLS-inútil = 33 total.
  -- (app_user_role queda fuera; ya tiene sus propias policies en v3.17.)
  tables text[] := ARRAY[
    -- Sin RLS hasta ahora:
    'escuela', 'grupo_trabajo', 'prenda_detalle', 'temporada', '_migraciones',
    'tendido_talla_marcada', 'contrato', 'operaria', 'alumno', 'proveedor',
    'bodega_movimiento', 'prenda_talla_largo', 'grupo_operaria', 'grupo_contribucion',
    'catalogo_key', 'produccion_registro_operacion', 'asignacion', 'produccion_bulto',
    'pedido', 'grupo_produccion', 'tendido_rollo_salida', 'prenda', 'asignacion_bulto',
    'trazo_talla_marcada', 'prenda_talla', 'produccion_operacion', 'prenda_largo',
    -- Con RLS y policy acceso_publico_* (inútil):
    'tendido', 'tendido_rollo', 'trazo', 'trazo_pieza', 'trazo_prenda', 'trazo_secundaria'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- 1. Habilitar RLS (idempotente).
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- 2. Tirar la policy vieja "acceso_publico_<tabla>" si existe.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'acceso_publico_' || t, t);

    -- 3. Limpiar las nuevas antes de recrearlas (idempotencia).
    EXECUTE format('DROP POLICY IF EXISTS biz_admin_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_op_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_op_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_op_update ON public.%I', t);

    -- 4. Crear policies.
    --    admin: acceso total.
    EXECUTE format($f$
      CREATE POLICY biz_admin_all ON public.%I
        FOR ALL TO authenticated
        USING (public.current_user_role() = 'admin')
        WITH CHECK (public.current_user_role() = 'admin')
    $f$, t);

    --    operador: leer / insertar / actualizar. Sin DELETE.
    EXECUTE format($f$
      CREATE POLICY biz_op_select ON public.%I
        FOR SELECT TO authenticated
        USING (public.current_user_role() = 'operador')
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY biz_op_insert ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (public.current_user_role() = 'operador')
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY biz_op_update ON public.%I
        FOR UPDATE TO authenticated
        USING (public.current_user_role() = 'operador')
        WITH CHECK (public.current_user_role() = 'operador')
    $f$, t);
  END LOOP;
END$$;

COMMIT;

-- =====================================================================
-- Verificación post-aplicación (ejecutar a mano para auditar):
--
--   SELECT tablename, count(*) AS policies_count
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   GROUP BY tablename
--   ORDER BY tablename;
--
-- Esperado: 4 policies por cada una de las 33 tablas de negocio
-- (biz_admin_all + biz_op_select + biz_op_insert + biz_op_update)
-- + las 2 de app_user_role.
-- =====================================================================

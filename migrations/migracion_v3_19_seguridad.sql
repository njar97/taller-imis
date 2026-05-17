-- =====================================================================
-- Migración v3.19 — Endurecer seguridad (fixes de Supabase Advisors)
-- =====================================================================
-- Cubre los hallazgos del Supabase Database Linter tras v3.18:
--
--  1. ERROR — 24 views vw_* tenían SECURITY DEFINER, que las hacía
--     ejecutarse con permisos del owner (postgres) y bypassear la RLS
--     del consultante. Las pasamos a SECURITY INVOKER. Postgres 15+:
--         ALTER VIEW v SET (security_invoker = true);
--     Esto es lo que queremos: la view se evalúa con permisos del
--     usuario que la consulta → la RLS de las tablas debajo aplica.
--
--  2. WARN — 5 tablas (bordados, catalogo, clientes, cuellos, pedidos)
--     tenían RLS habilitado pero con policies USING (true) /
--     WITH CHECK (true) para INSERT/UPDATE/DELETE, lo que efectivamente
--     dejaba pasar a `anon` y a `authenticated` sin filtro. Esas tablas
--     no se usan desde el front (las búsquedas que matcheaban eran
--     variables JS llamadas `pedidos`, la tabla real es `pedido` en
--     singular). Las dejamos con las mismas biz_* policies que las 33
--     tablas de v3.18 — siguen presentes con sus datos por si las
--     necesitamos más adelante; si se confirma que son legacy, una
--     migración futura puede dropearlas.
--
--  3. WARN — funciones update_updated_at() y _touch_updated_at() con
--     search_path mutable. Fijamos search_path = '' (vacío) porque
--     solo usan NEW y now()/pg_catalog, no resuelven nombres del
--     esquema public. Bloquea hijacking via objetos plantados en
--     schemas temporales.
--
--  4. WARN — current_user_role() era ejecutable por el rol `anon`
--     vía /rest/v1/rpc/current_user_role. Como `anon` no tiene
--     auth.uid() la función devolvería NULL igual, pero el WARN es
--     ruidoso. REVOKE EXECUTE de anon (authenticated SÍ la sigue
--     necesitando: las policies la llaman en cada evaluación).
--
-- Idempotente: re-ejecutable sin errores.
-- =====================================================================

BEGIN;

-- 1. Views públicas → SECURITY INVOKER ---------------------------------------
-- Iteramos pg_views dinámicamente para no depender de un listado fijo:
-- captura las 23 vw_* actuales y cualquier vista nueva que matchee.
DO $$
DECLARE
  v text;
  n int := 0;
BEGIN
  FOR v IN
    SELECT viewname
    FROM pg_views
    WHERE schemaname = 'public' AND viewname LIKE 'vw_%'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'v3.19: views actualizadas a SECURITY INVOKER: %', n;
END$$;


-- 2. Tablas fantasma → RLS real con biz_* ------------------------------------
-- Reemplaza las policies "always true" por las mismas que las 33 tablas
-- de v3.18. Borra dinámicamente cualquier policy existente para arrancar
-- de cero y evita conflictos por nombres viejos como bordados_select.
DO $$
DECLARE
  t text;
  p record;
  tablas_fantasma text[] := ARRAY[
    'bordados', 'catalogo', 'clientes', 'cuellos', 'pedidos'
  ];
BEGIN
  FOREACH t IN ARRAY tablas_fantasma LOOP
    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format($f$
      CREATE POLICY biz_admin_all ON public.%I
        FOR ALL TO authenticated
        USING (public.current_user_role() = 'admin')
        WITH CHECK (public.current_user_role() = 'admin')
    $f$, t);

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


-- 3. search_path explícito en triggers de updated_at -------------------------
ALTER FUNCTION public.update_updated_at() SET search_path = '';
ALTER FUNCTION public._touch_updated_at() SET search_path = '';


-- 4. anon ya no puede llamar current_user_role() ------------------------------
-- authenticated la sigue necesitando: las policies la invocan.
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM anon;

COMMIT;

-- =====================================================================
-- Verificación post-aplicación:
--
--   -- Todas las vw_* deben tener security_invoker = true
--   SELECT c.relname, c.reloptions
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname='public' AND c.relkind='v' AND c.relname LIKE 'vw_%'
--   ORDER BY c.relname;
--
--   -- Las 5 tablas fantasma con sus 4 policies biz_* nuevas
--   SELECT tablename, count(*) AS n_policies
--   FROM pg_policies
--   WHERE schemaname='public'
--     AND tablename IN ('bordados','catalogo','clientes','cuellos','pedidos')
--   GROUP BY tablename
--   ORDER BY tablename;
--
--   -- get_advisors(security) no debería listar ningún ERROR y debería
--   -- haber bajado los WARN de rls_policy_always_true, security_definer_view
--   -- y function_search_path_mutable para esas funciones.
-- =====================================================================

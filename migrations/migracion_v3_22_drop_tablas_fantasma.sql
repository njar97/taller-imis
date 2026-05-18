-- =====================================================================
-- Migración v3.22 — Drop de las 5 tablas fantasma
-- =====================================================================
-- En v3.18/v3.19 vimos 5 tablas que tenían las mismas biz_* policies
-- que las 33 de negocio pero el front NO las usaba (los matches en
-- el código eran nombres de variables JS — la tabla real es `pedido`
-- en singular, `catalogo_key`, etc.):
--
--   bordados     (2 filas)
--   catalogo     (0 filas)
--   clientes     (5 filas)
--   cuellos      (0 filas)
--   pedidos      (14 filas)
--
-- Auditoría de dependencias previa al drop (todas vacías):
--   - SELECT de pg_constraint para FKs entrantes  → []
--   - SELECT de pg_views referenciando los nombres → []
--   - SELECT de pg_proc con def que mencione esos nombres → []
--
-- Por eso usamos DROP TABLE sin CASCADE: si alguien introdujo después
-- una dependencia que no detectamos, falla la migración antes de
-- destruir nada.
--
-- Los datos quedan recuperables desde los backups automáticos de
-- Supabase (retención 7 días en Free) y desde git history (todas las
-- referencias a estas tablas en el código se eliminaron como tablas
-- fantasma; no había seed en migraciones).
--
-- Idempotente: usa IF EXISTS.
-- =====================================================================

BEGIN;

-- Drop policies primero (no es estrictamente necesario porque DROP TABLE
-- las elimina solas, pero deja log explícito en caso de re-aplicar)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bordados','catalogo','clientes','cuellos','pedidos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS biz_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_delete ON public.%I', t);
  END LOOP;
EXCEPTION WHEN undefined_table THEN
  -- Tabla ya dropeada en una corrida previa; seguir.
  NULL;
END$$;

DROP TABLE IF EXISTS public.bordados;
DROP TABLE IF EXISTS public.catalogo;
DROP TABLE IF EXISTS public.clientes;
DROP TABLE IF EXISTS public.cuellos;
DROP TABLE IF EXISTS public.pedidos;

COMMIT;

-- =====================================================================
-- Verificación post-aplicación:
--
--   -- Las 5 tablas no deberían existir
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public'
--     AND table_name IN ('bordados','catalogo','clientes','cuellos','pedidos');
--   -- Esperado: []
--
--   -- biz_* debería estar sobre 33 tablas, no 38
--   SELECT count(DISTINCT tablename)
--   FROM pg_policies
--   WHERE schemaname='public' AND policyname LIKE 'biz_%';
--   -- Esperado: 33
-- =====================================================================

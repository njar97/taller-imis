-- =====================================================================
-- Migración v3.21 — Audit log para tablas críticas del taller
-- =====================================================================
-- Tabla append-only public.app_audit que captura todo INSERT/UPDATE/
-- DELETE sobre las tablas core del flujo de producción:
--   trazo, tendido, pedido, asignacion, produccion_bulto,
--   produccion_registro_operacion, bodega_movimiento
--
-- Cada fila guarda:
--   - actor_id (auth.uid), actor_email y actor_role en el momento del cambio
--   - tabla afectada, PK de la fila, tipo de operación
--   - row_before y row_after como jsonb (NULL en el extremo que no aplica)
--   - changed_cols (solo en UPDATE): columnas cuyo valor cambió
--
-- Reglas de acceso:
--   - Solo admin puede SELECT (policy audit_admin_select).
--   - Nadie puede INSERT/UPDATE/DELETE vía PostgREST — no hay policy
--     que lo permita.
--   - El trigger fn_audit() es SECURITY DEFINER y se ejecuta como
--     postgres (BYPASSRLS por default en Supabase), así que sí puede
--     insertar pase lo que pase con el rol del que disparó el cambio.
--
-- No se aplica a tablas catalogales (escuela, prenda, operaria,
-- proveedor, etc) — cambian poco y el volumen no justifica el log.
-- Si después aparece la necesidad, se agregan triggers extra.
--
-- Idempotente.
-- =====================================================================

BEGIN;

-- 1. Tabla app_audit ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_audit (
  id            bigserial PRIMARY KEY,
  happened_at   timestamptz NOT NULL DEFAULT now(),
  actor_id      uuid,
  actor_email   text,
  actor_role    text,
  table_name    text NOT NULL,
  row_pk        text,
  op            text NOT NULL CHECK (op IN ('INSERT','UPDATE','DELETE')),
  row_before    jsonb,
  row_after     jsonb,
  changed_cols  text[]
);

CREATE INDEX IF NOT EXISTS app_audit_table_time_idx
  ON public.app_audit (table_name, happened_at DESC);
CREATE INDEX IF NOT EXISTS app_audit_actor_time_idx
  ON public.app_audit (actor_id, happened_at DESC);


-- 2. RLS: solo admin SELECT, no hay forma de INSERT/UPDATE/DELETE vía API ----
ALTER TABLE public.app_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_admin_select ON public.app_audit;
CREATE POLICY audit_admin_select ON public.app_audit
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');


-- 3. Función fn_audit() genérica para trigger --------------------------------
-- SECURITY DEFINER → corre como postgres (BYPASSRLS). search_path = ''
-- bloquea hijacking via objetos plantados en schemas temporales.
CREATE OR REPLACE FUNCTION public.fn_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id    uuid;
  v_actor_email text;
  v_actor_role  text;
  v_row_before  jsonb;
  v_row_after   jsonb;
  v_changed     text[];
  v_pk          text;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NOT NULL THEN
    SELECT u.email::text INTO v_actor_email
      FROM auth.users u WHERE u.id = v_actor_id;
    v_actor_role := public.current_user_role();
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_row_after := to_jsonb(NEW);
    v_pk        := v_row_after->>'id';
  ELSIF TG_OP = 'UPDATE' THEN
    v_row_before := to_jsonb(OLD);
    v_row_after  := to_jsonb(NEW);
    v_pk         := v_row_after->>'id';
    SELECT array_agg(key)
      INTO v_changed
      FROM jsonb_each(v_row_after) AS e(key, val)
     WHERE v_row_after -> e.key IS DISTINCT FROM v_row_before -> e.key;
  ELSIF TG_OP = 'DELETE' THEN
    v_row_before := to_jsonb(OLD);
    v_pk         := v_row_before->>'id';
  END IF;

  INSERT INTO public.app_audit (
    actor_id, actor_email, actor_role,
    table_name, row_pk, op,
    row_before, row_after, changed_cols
  ) VALUES (
    v_actor_id, v_actor_email, v_actor_role,
    TG_TABLE_NAME, v_pk, TG_OP,
    v_row_before, v_row_after, v_changed
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Nadie llama esta función directamente. Solo los triggers.
REVOKE EXECUTE ON FUNCTION public.fn_audit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_audit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_audit() FROM authenticated;


-- 4. Trigger trg_audit en las 7 tablas críticas ------------------------------
DO $$
DECLARE
  t text;
  tablas text[] := ARRAY[
    'trazo',
    'tendido',
    'pedido',
    'asignacion',
    'produccion_bulto',
    'produccion_registro_operacion',
    'bodega_movimiento'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit
         AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.fn_audit()',
      t
    );
  END LOOP;
END$$;

COMMIT;

-- =====================================================================
-- Verificación post-aplicación:
--
--   -- La tabla y sus 2 índices
--   SELECT relname FROM pg_class
--   WHERE relname IN ('app_audit','app_audit_table_time_idx','app_audit_actor_time_idx');
--
--   -- Las policies de app_audit (solo admin SELECT, nada más)
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname='public' AND tablename='app_audit';
--
--   -- Los 7 triggers conectados
--   SELECT event_object_table, trigger_name, event_manipulation
--   FROM information_schema.triggers
--   WHERE trigger_name = 'trg_audit'
--   ORDER BY event_object_table;
--
--   -- Smoke test (correr una vez logueado como admin desde la app):
--   --   1. Crear un trazo nuevo
--   --   2. Editar el trazo
--   --   3. (opcional) borrar
--   --   4. SELECT * FROM app_audit ORDER BY happened_at DESC LIMIT 5;
--   --   → debería haber 1 INSERT + 1 UPDATE (+ 1 DELETE) con tu actor_email
-- =====================================================================

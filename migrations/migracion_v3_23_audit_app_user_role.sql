-- =====================================================================
-- Migración v3.23 — Audit log también sobre app_user_role
-- =====================================================================
-- v3.21 dejó audit sobre 7 tablas core del flujo de producción. Ahora
-- agregamos app_user_role para tener trazabilidad de:
--   - INSERT (cuando un user nuevo es invitado y confirma)
--   - UPDATE (cambios de role hechos desde la UI o el dashboard)
--   - DELETE (cuando se borra un user)
--
-- app_user_role NO tiene columna "id" — su PK es "user_id". La función
-- fn_audit() v3.21 hardcodeaba v_pk := v_row->>'id', que para esta
-- tabla devolvería NULL. La extendemos con COALESCE id ‖ user_id
-- para que también funcione acá (y para cualquier tabla futura con
-- ese patrón). Las 7 tablas core no cambian de comportamiento porque
-- todas tienen "id" como primer candidato.
--
-- Idempotente.
-- =====================================================================

BEGIN;

-- 1. fn_audit: PK con COALESCE para soportar app_user_role -------------------
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
    v_pk        := COALESCE(v_row_after->>'id', v_row_after->>'user_id');
  ELSIF TG_OP = 'UPDATE' THEN
    v_row_before := to_jsonb(OLD);
    v_row_after  := to_jsonb(NEW);
    v_pk         := COALESCE(v_row_after->>'id', v_row_after->>'user_id');
    SELECT array_agg(key)
      INTO v_changed
      FROM jsonb_each(v_row_after) AS e(key, val)
     WHERE v_row_after -> e.key IS DISTINCT FROM v_row_before -> e.key;
  ELSIF TG_OP = 'DELETE' THEN
    v_row_before := to_jsonb(OLD);
    v_pk         := COALESCE(v_row_before->>'id', v_row_before->>'user_id');
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

-- 2. Trigger nuevo sobre app_user_role ---------------------------------------
DROP TRIGGER IF EXISTS trg_audit ON public.app_user_role;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.app_user_role
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit();

COMMIT;

-- =====================================================================
-- Verificación post-aplicación:
--
--   -- El trigger debe estar en app_user_role
--   SELECT event_object_table, event_manipulation
--   FROM information_schema.triggers
--   WHERE trigger_name = 'trg_audit'
--     AND event_object_table = 'app_user_role';
--   -- Esperado: 3 filas (INSERT, UPDATE, DELETE)
--
--   -- Smoke test: hacer un cambio de role desde la UI y ver
--   SELECT happened_at, actor_email, op, row_pk, changed_cols
--   FROM public.app_audit
--   WHERE table_name = 'app_user_role'
--   ORDER BY happened_at DESC LIMIT 5;
-- =====================================================================

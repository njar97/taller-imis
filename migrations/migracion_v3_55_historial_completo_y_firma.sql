-- v3.55 · Historial de cambios en las tablas que faltaban + firma de las cargas
-- Auditoría 27-nov, Etapa 1 paso 5 (AJU-04, DAT-11).
--
-- 1. fn_audit: cuando el cambio no viene de una cuenta de la app (cargas
--    directas en la base), guarda la firma puesta con
--        select set_config('app.firma', 'Claude · orden de Javier · 27-nov', true);
--    en la misma corrida. Si no hay firma queda «sin firma (usuario de la base)».
--    Además toma la llave de tablas que no tienen columna «id».
-- 2. trg_audit en 20 tablas que la app o las cargas escriben y no dejaban rastro.

CREATE OR REPLACE FUNCTION public.fn_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id    uuid;
  v_actor_email text;
  v_actor_role  text;
  v_row_before  jsonb;
  v_row_after   jsonb;
  v_changed     text[];
  v_row         jsonb;
  v_pk          text;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NOT NULL THEN
    SELECT u.email::text INTO v_actor_email
      FROM auth.users u WHERE u.id = v_actor_id;
    v_actor_role := public.current_user_role();
  ELSE
    -- Cambio hecho directo en la base (sin cuenta de la app): firma o aviso.
    v_actor_email := COALESCE(NULLIF(current_setting('app.firma', true), ''),
                              'sin firma (' || session_user || ')');
    v_actor_role  := 'carga';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_row_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_row_before := to_jsonb(OLD);
    v_row_after  := to_jsonb(NEW);
    SELECT array_agg(key)
      INTO v_changed
      FROM jsonb_each(v_row_after) AS e(key, val)
     WHERE v_row_after -> e.key IS DISTINCT FROM v_row_before -> e.key;
  ELSIF TG_OP = 'DELETE' THEN
    v_row_before := to_jsonb(OLD);
  END IF;
  v_row := COALESCE(v_row_after, v_row_before);
  v_pk  := COALESCE(v_row->>'id', v_row->>'user_id', v_row->>'clave', v_row->>'grado',
                    (v_row->>'asignacion_id') || '|' || (v_row->>'produccion_bulto_id'));

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
$function$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'produccion_en_proceso','tendido_rollo','tendido_rollo_salida','tendido_talla_marcada',
    'trazo_talla_marcada','trazo_pieza','trazo_prenda','trazo_secundaria',
    'asignacion_bulto','produccion_operacion','plan_produccion_config','talla_equivalencia',
    'operaria','planilla_periodo','planilla_linea',
    'escuela','contrato','contrato_escuela','grado_catalogo','temporada'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_audit()', t);
  END LOOP;
END $$;

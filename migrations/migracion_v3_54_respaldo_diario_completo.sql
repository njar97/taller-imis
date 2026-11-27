-- v3.54 · Copia de seguridad de TODAS las tablas, todos los días
-- Auditoría 27-nov, Etapa 1 paso 4 (AJU-03, DAT-14, EST-15) y dos puntos del
-- paso 12 que tocan lo mismo (AJU-10: lanzar la copia sin cuenta; contraseña
-- interna escrita en el código).
--
-- 1. app_secreto: las contraseñas internas viven en la base, cerradas a todos
--    menos al servicio. Se generan aquí al azar: no quedan escritas en ningún
--    archivo ni en el código.
-- 2. backup_tablas(): la lista de tablas se saca de la base, así una tabla
--    nueva entra sola en la copia.
-- 3. trigger_backup(): lee la contraseña de app_secreto; quien no tiene
--    cuenta ya no puede lanzarla. La copia automática sigue funcionando.
-- 4. La copia automática pasa de semanal (domingo) a diaria, 9 p. m. de El
--    Salvador (03:00 UTC).

CREATE TABLE IF NOT EXISTS public.app_secreto (
  clave     text PRIMARY KEY,
  valor     text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_secreto ENABLE ROW LEVEL SECURITY;   -- sin políticas: nadie con cuenta la lee
REVOKE ALL ON public.app_secreto FROM PUBLIC, anon, authenticated;

INSERT INTO public.app_secreto (clave, valor) VALUES
  ('backup_token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
  ('backup_bajar_token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
ON CONFLICT (clave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.backup_tablas()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select tablename::text from pg_tables
   where schemaname = 'public'
     and tablename not in ('app_secreto', 'subida_token')
   order by tablename;
$function$;
REVOKE ALL ON FUNCTION public.backup_tablas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_tablas() TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_backup()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url    text := 'https://kszdievqesveluzcnzsh.supabase.co/functions/v1/backup-export';
  v_token  text;
  v_req_id bigint;
BEGIN
  -- Con cuenta: solo admin. Sin cuenta (auth.uid() nulo) solo llega la copia
  -- automática, porque a «anon» se le quitó el permiso de ejecutar esto.
  IF auth.uid() IS NOT NULL AND current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo admin puede lanzar la copia de seguridad';
  END IF;
  SELECT valor INTO v_token FROM app_secreto WHERE clave = 'backup_token';
  IF v_token IS NULL THEN RAISE EXCEPTION 'Falta la contraseña interna de la copia'; END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Backup-Token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO v_req_id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_req_id, 'iniciado_en', now());
END;
$function$;
REVOKE ALL ON FUNCTION public.trigger_backup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_backup() TO authenticated, service_role;

-- Diario hasta que pase la entrega del 18-dic (después se puede volver a semanal).
SELECT cron.unschedule('weekly-backup') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-backup');
SELECT cron.schedule('daily-backup', '0 3 * * *', 'SELECT public.trigger_backup();');

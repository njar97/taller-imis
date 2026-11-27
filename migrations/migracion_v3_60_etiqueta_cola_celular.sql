-- v3.60 · Mandar etiquetas desde el celular
-- El celular no tiene la Brother: deja el pedido en una cola (etiqueta_trabajo)
-- con las etiquetas ya dibujadas (PNG de 382 × 156). El ayudante de la compu
-- del taller (v4) toma de la cola solo cuando la impresora está lista, imprime
-- y avisa cómo le fue. Si no se pudo imprimir, la cuenta se corrige sola
-- (se anula o se recorta la tanda) para que no queden números sin etiqueta.

-- 1. El reporte de la impresora dice qué versión del ayudante corre
--    (la cola necesita la v4). Se cambia la firma: el ayudante v3 sigue
--    funcionando porque no manda p_version.
ALTER TABLE public.etiqueta_impresora_estado ADD COLUMN IF NOT EXISTS version integer;
DROP FUNCTION IF EXISTS public.etiqueta_impresora_reportar(text, text, text, integer, text);
CREATE OR REPLACE FUNCTION public.etiqueta_impresora_reportar(
  p_token text, p_estado text, p_mensaje text DEFAULT NULL, p_cola integer DEFAULT 0,
  p_equipo text DEFAULT NULL, p_version integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_token IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.app_secreto WHERE clave = 'etiqueta_impresora_token' AND valor = p_token) THEN
    RAISE EXCEPTION 'no autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_estado IS NULL OR p_estado NOT IN ('lista', 'desconectada', 'error', 'no_instalada') THEN
    RAISE EXCEPTION 'estado no válido';
  END IF;
  INSERT INTO public.etiqueta_impresora_estado (id, estado, mensaje, trabajos_en_cola, equipo, version, actualizado_en)
  VALUES ('brother', p_estado, left(p_mensaje, 200), GREATEST(COALESCE(p_cola, 0), 0), left(p_equipo, 60), p_version, now())
  ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado, mensaje = EXCLUDED.mensaje,
    trabajos_en_cola = EXCLUDED.trabajos_en_cola, equipo = EXCLUDED.equipo,
    version = EXCLUDED.version, actualizado_en = now();
END $$;
REVOKE ALL ON FUNCTION public.etiqueta_impresora_reportar(text, text, text, integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.etiqueta_impresora_reportar(text, text, text, integer, text, integer) TO anon, authenticated;

-- 2. La cola: una fila por cada envío de hasta 100 etiquetas.
CREATE TABLE IF NOT EXISTS public.etiqueta_trabajo (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impresion_id uuid NOT NULL REFERENCES public.etiqueta_bolsa_impresion(id),
  primero      integer NOT NULL,              -- n.º de control de la primera etiqueta de este envío
  reintento    boolean NOT NULL DEFAULT false, -- «mandar otra vez»: si falla, no toca la cuenta
  png          text[] NOT NULL CHECK (cardinality(png) BETWEEN 1 AND 100),
  nombre       text,
  estado       text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'imprimiendo', 'impreso', 'error', 'cancelado')),
  mensaje      text,
  pedido_por   text DEFAULT public._etiqueta_bolsa_quien(),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  tomado_en    timestamptz,
  terminado_en timestamptz
);
CREATE INDEX IF NOT EXISTS etiqueta_trabajo_pendiente_idx ON public.etiqueta_trabajo (creado_en) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS etiqueta_trabajo_impresion_idx ON public.etiqueta_trabajo (impresion_id);
ALTER TABLE public.etiqueta_trabajo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS biz_select ON public.etiqueta_trabajo;
DROP POLICY IF EXISTS biz_insert ON public.etiqueta_trabajo;
CREATE POLICY biz_select ON public.etiqueta_trabajo FOR SELECT TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['admin','operador']));
CREATE POLICY biz_insert ON public.etiqueta_trabajo FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = ANY (ARRAY['admin','operador']) AND estado = 'pendiente');
REVOKE ALL ON public.etiqueta_trabajo FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.etiqueta_trabajo FROM authenticated;

-- Si un envío no se imprimió: corrige la cuenta y cancela lo que falta de esa tanda.
CREATE OR REPLACE FUNCTION public._etiqueta_trabajo_fallo(p_trabajo uuid, p_mensaje text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.etiqueta_trabajo; i public.etiqueta_bolsa_impresion; v_hasta integer; v_nota text;
BEGIN
  SELECT * INTO t FROM public.etiqueta_trabajo WHERE id = p_trabajo;
  UPDATE public.etiqueta_trabajo SET estado = 'cancelado', terminado_en = now(),
         mensaje = 'No se mandó porque falló un envío anterior de esta tanda'
   WHERE impresion_id = t.impresion_id AND estado = 'pendiente' AND reintento = t.reintento AND id <> t.id;
  IF t.reintento THEN RETURN 'reintento: la cuenta no cambia'; END IF;
  SELECT * INTO i FROM public.etiqueta_bolsa_impresion WHERE id = t.impresion_id;
  IF i.anulada THEN RETURN 'la tanda ya estaba anulada'; END IF;
  v_nota := 'No salió por la impresora del taller: ' || COALESCE(p_mensaje, 'error');
  v_hasta := CASE WHEN i.tipo = 'nueva' AND t.primero > i.desde THEN t.primero - 1 ELSE NULL END;
  BEGIN
    PERFORM public.etiqueta_bolsa_corregir(i.id, v_hasta, v_nota);
    RETURN CASE WHEN v_hasta IS NULL THEN 'tanda anulada' ELSE 'tanda recortada hasta la ' || v_hasta END;
  EXCEPTION WHEN others THEN
    RETURN 'no se pudo corregir la cuenta: ' || SQLERRM;
  END;
END $$;
REVOKE ALL ON FUNCTION public._etiqueta_trabajo_fallo(uuid, text) FROM PUBLIC, anon, authenticated;

-- 3. El ayudante toma el siguiente envío (solo con su contraseña).
CREATE OR REPLACE FUNCTION public.etiqueta_trabajo_tomar(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.etiqueta_trabajo;
BEGIN
  IF p_token IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.app_secreto WHERE clave = 'etiqueta_impresora_token' AND valor = p_token) THEN
    RAISE EXCEPTION 'no autorizado' USING ERRCODE = '42501';
  END IF;
  -- Envíos de tandas ya anuladas no se imprimen.
  UPDATE public.etiqueta_trabajo w SET estado = 'cancelado', terminado_en = now(), mensaje = 'La tanda se anuló antes de imprimir'
    FROM public.etiqueta_bolsa_impresion i
   WHERE w.impresion_id = i.id AND w.estado = 'pendiente' AND i.anulada;
  SELECT * INTO t FROM public.etiqueta_trabajo
   WHERE estado = 'pendiente' ORDER BY creado_en, primero LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.etiqueta_trabajo SET estado = 'imprimiendo', tomado_en = now() WHERE id = t.id;
  RETURN jsonb_build_object('id', t.id, 'nombre', COALESCE(t.nombre, 'Etiquetas de bolsa'), 'png', to_jsonb(t.png));
END $$;

-- 4. El ayudante avisa cómo le fue.
CREATE OR REPLACE FUNCTION public.etiqueta_trabajo_terminar(p_token text, p_id uuid, p_ok boolean, p_mensaje text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_res text;
BEGIN
  IF p_token IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.app_secreto WHERE clave = 'etiqueta_impresora_token' AND valor = p_token) THEN
    RAISE EXCEPTION 'no autorizado' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.firma', 'Ayudante de etiquetas (compu del taller)', true);
  UPDATE public.etiqueta_trabajo SET estado = CASE WHEN p_ok THEN 'impreso' ELSE 'error' END,
         mensaje = left(p_mensaje, 300), terminado_en = now()
   WHERE id = p_id AND estado = 'imprimiendo';
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese envío no estaba imprimiéndose'; END IF;
  IF NOT p_ok THEN
    v_res := public._etiqueta_trabajo_fallo(p_id, p_mensaje);
    UPDATE public.etiqueta_trabajo SET mensaje = concat_ws(' · ', mensaje, v_res) WHERE id = p_id;
  END IF;
  RETURN jsonb_build_object('id', p_id, 'ok', p_ok, 'cuenta', v_res);
END $$;
REVOKE ALL ON FUNCTION public.etiqueta_trabajo_tomar(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.etiqueta_trabajo_terminar(text, uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.etiqueta_trabajo_tomar(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etiqueta_trabajo_terminar(text, uuid, boolean, text) TO anon, authenticated;

-- 5. Cancelar desde la app lo que todavía no se empezó a imprimir.
CREATE OR REPLACE FUNCTION public.etiqueta_trabajo_cancelar(p_impresion uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer; v_tocados integer; v_res text;
BEGIN
  IF COALESCE(public.current_user_role(), '') NOT IN ('admin', 'operador') THEN
    RAISE EXCEPTION 'no autorizado' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_tocados FROM public.etiqueta_trabajo
   WHERE impresion_id = p_impresion AND NOT reintento AND estado IN ('imprimiendo', 'impreso');
  UPDATE public.etiqueta_trabajo SET estado = 'cancelado', terminado_en = now(), mensaje = 'Cancelado desde la app'
   WHERE impresion_id = p_impresion AND estado = 'pendiente';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Ya no hay nada en espera: la impresora del taller ya lo tomó'; END IF;
  IF v_tocados = 0 AND EXISTS (SELECT 1 FROM public.etiqueta_trabajo WHERE impresion_id = p_impresion AND NOT reintento) THEN
    BEGIN
      PERFORM public.etiqueta_bolsa_corregir(p_impresion, NULL, 'Cancelada desde la app antes de imprimir');
      v_res := 'tanda anulada';
    EXCEPTION WHEN others THEN v_res := 'no se pudo anular: ' || SQLERRM; END;
  END IF;
  RETURN jsonb_build_object('cancelados', n, 'cuenta', v_res, 'ya_impresos', v_tocados);
END $$;
REVOKE ALL ON FUNCTION public.etiqueta_trabajo_cancelar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.etiqueta_trabajo_cancelar(uuid) TO authenticated;

INSERT INTO public._migraciones (nombre, aplicada_en)
SELECT 'migracion_v3_60_etiqueta_cola_celular.sql', now()
WHERE NOT EXISTS (SELECT 1 FROM public._migraciones WHERE nombre = 'migracion_v3_60_etiqueta_cola_celular.sql');

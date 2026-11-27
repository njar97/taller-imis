-- v3.59 · Estado de la impresora de etiquetas, visible desde cualquier aparato
-- La compu del taller (ayudante de etiquetas) reporta cada 30 s si la Brother
-- está lista. La app lo lee para mostrar el aviso también en el celular.
-- El reporte entra por una función con contraseña propia (app_secreto), sin
-- sesión; no se guarda en el historial (sería un renglón cada 30 s).

CREATE TABLE IF NOT EXISTS public.etiqueta_impresora_estado (
  id               text PRIMARY KEY,
  estado           text NOT NULL CHECK (estado IN ('lista', 'desconectada', 'error', 'no_instalada')),
  mensaje          text,
  trabajos_en_cola integer NOT NULL DEFAULT 0,
  equipo           text,
  actualizado_en   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.etiqueta_impresora_estado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS biz_select ON public.etiqueta_impresora_estado;
CREATE POLICY biz_select ON public.etiqueta_impresora_estado FOR SELECT TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['admin','operador']));
REVOKE ALL ON public.etiqueta_impresora_estado FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.etiqueta_impresora_estado FROM authenticated;

-- Contraseña del ayudante (al azar; no va en el código ni en el repo).
INSERT INTO public.app_secreto (clave, valor)
SELECT 'etiqueta_impresora_token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE NOT EXISTS (SELECT 1 FROM public.app_secreto WHERE clave = 'etiqueta_impresora_token');

CREATE OR REPLACE FUNCTION public.etiqueta_impresora_reportar(
  p_token text, p_estado text, p_mensaje text DEFAULT NULL, p_cola integer DEFAULT 0, p_equipo text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_token IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.app_secreto WHERE clave = 'etiqueta_impresora_token' AND valor = p_token) THEN
    RAISE EXCEPTION 'no autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_estado IS NULL OR p_estado NOT IN ('lista', 'desconectada', 'error', 'no_instalada') THEN
    RAISE EXCEPTION 'estado no válido';
  END IF;
  INSERT INTO public.etiqueta_impresora_estado (id, estado, mensaje, trabajos_en_cola, equipo, actualizado_en)
  VALUES ('brother', p_estado, left(p_mensaje, 200), GREATEST(COALESCE(p_cola, 0), 0), left(p_equipo, 60), now())
  ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado, mensaje = EXCLUDED.mensaje,
    trabajos_en_cola = EXCLUDED.trabajos_en_cola, equipo = EXCLUDED.equipo, actualizado_en = now();
END $$;
REVOKE ALL ON FUNCTION public.etiqueta_impresora_reportar(text, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.etiqueta_impresora_reportar(text, text, text, integer, text) TO anon, authenticated;

INSERT INTO public._migraciones (nombre, aplicada_en)
SELECT 'migracion_v3_59_etiqueta_impresora_estado.sql', now()
WHERE NOT EXISTS (SELECT 1 FROM public._migraciones WHERE nombre = 'migracion_v3_59_etiqueta_impresora_estado.sql');

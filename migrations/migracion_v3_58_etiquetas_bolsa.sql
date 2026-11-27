-- v3.58 · Etiquetas de bolsa (Brother 51 × 26 mm) impresas desde la app
-- Cada etiqueta sirve para CONTAR bolsas: lleva un n.º de control correlativo
-- por empresa + prenda + color + talla. La app pide «las siguientes N» y la
-- base reparte los números (dos aparatos nunca sacan el mismo). Reponer una
-- etiqueta repite su número y no suma a la cuenta. Nada se borra: se anula.

-- 1. Datos de cada empresa que salen en la etiqueta ───────────────────────
ALTER TABLE public.proveedor ADD COLUMN IF NOT EXISTS codigo_mined    text;
ALTER TABLE public.proveedor ADD COLUMN IF NOT EXISTS nombre_etiqueta text;
ALTER TABLE public.proveedor ADD COLUMN IF NOT EXISTS marca_etiqueta  text;
DO $$ BEGIN
  ALTER TABLE public.proveedor ADD CONSTRAINT proveedor_marca_etiqueta_chk
    CHECK (marca_etiqueta IS NULL OR marca_etiqueta IN ('franja_arriba', 'franja_abajo'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- JAV normal · IMIS franja negra arriba · AME franja negra abajo (código pendiente)
UPDATE public.proveedor SET codigo_mined = COALESCE(codigo_mined, '03-073'),
       nombre_etiqueta = COALESCE(nombre_etiqueta, 'NELSON JAVIER RAMÍREZ MANCÍA')
 WHERE codigo = 'NELSON';
UPDATE public.proveedor SET codigo_mined = COALESCE(codigo_mined, '03-095'),
       nombre_etiqueta = COALESCE(nombre_etiqueta, 'IMELDA DEL CARMEN MANCÍA DE RAMÍREZ'),
       marca_etiqueta = COALESCE(marca_etiqueta, 'franja_arriba')
 WHERE codigo = 'IMIS';
UPDATE public.proveedor SET
       nombre_etiqueta = COALESCE(nombre_etiqueta, 'ROSA AMÉRICA CRUZ RIVAS'),
       marca_etiqueta = COALESCE(marca_etiqueta, 'franja_abajo')
 WHERE codigo = 'AMERICA';

-- 2. Cómo se rotula cada prenda del pedido ────────────────────────────────
-- Dos prendas con el mismo texto (prenda + color) comparten cuenta y números.
-- activo = false: todavía no se imprime (falta definir cómo se rotula).
CREATE TABLE IF NOT EXISTS public.etiqueta_bolsa_prenda (
  cod_prenda text PRIMARY KEY,
  prenda     text NOT NULL,
  color      text NOT NULL,
  activo     boolean NOT NULL DEFAULT true,
  nota       text,
  orden      integer NOT NULL DEFAULT 100
);
INSERT INTO public.etiqueta_bolsa_prenda (cod_prenda, prenda, color, activo, nota, orden) VALUES
  ('C',   'CAMISA',            'BLANCA',  true,  NULL, 10),
  ('B',   'CAMISA',            'BLANCA',  false, 'Blusa: falta que el Lic. Alas diga si va junta con la camisa', 20),
  ('CC',  'CAMISA',            'CELESTE', true,  NULL, 30),
  ('P',   'PANTALÓN',          'AZUL',    true,  NULL, 40),
  ('PB',  'PANTALÓN',          'BEIGE',   true,  NULL, 50),
  ('S',   'SHORT',             'AZUL',    true,  NULL, 60),
  ('F',   'FALDA',             'AZUL',    true,  NULL, 70),
  ('FB',  'FALDA',             'BEIGE',   true,  NULL, 80),
  ('FCE', 'FALDA C/ ELÁSTICO', 'AZUL',    true,  NULL, 90)
ON CONFLICT (cod_prenda) DO NOTHING;

-- 3. Cada impresión ───────────────────────────────────────────────────────
-- tipo 'nueva': números desde–hasta, suman a la cuenta.
-- tipo 'reposicion': números sueltos en controles[], NO suman.
CREATE TABLE IF NOT EXISTS public.etiqueta_bolsa_impresion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  temporada_id uuid NOT NULL REFERENCES public.temporada(id),
  proveedor_id uuid NOT NULL REFERENCES public.proveedor(id),
  prenda       text NOT NULL,
  color        text NOT NULL,
  talla        text NOT NULL,
  tipo         text NOT NULL CHECK (tipo IN ('nueva', 'reposicion')),
  desde        integer,
  hasta        integer,
  controles    integer[],
  anulada      boolean NOT NULL DEFAULT false,
  anulada_en   timestamptz,
  anulada_por  text,
  nota         text,
  usuario      text,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT etiqueta_bolsa_impresion_forma_chk CHECK (
    (tipo = 'nueva'      AND desde >= 1 AND hasta >= desde AND controles IS NULL) OR
    (tipo = 'reposicion' AND desde IS NULL AND hasta IS NULL AND cardinality(controles) >= 1)
  )
);
CREATE INDEX IF NOT EXISTS etiqueta_bolsa_impresion_clave_idx
  ON public.etiqueta_bolsa_impresion (temporada_id, proveedor_id, prenda, color, talla);

ALTER TABLE public.etiqueta_bolsa_prenda    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etiqueta_bolsa_impresion ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['etiqueta_bolsa_prenda', 'etiqueta_bolsa_impresion'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS biz_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_update ON public.%I', t);
    EXECUTE format($p$CREATE POLICY biz_select ON public.%I FOR SELECT TO authenticated USING (public.current_user_role() = ANY (ARRAY['admin','operador']))$p$, t);
    EXECUTE format($p$CREATE POLICY biz_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = ANY (ARRAY['admin','operador']))$p$, t);
    EXECUTE format($p$CREATE POLICY biz_update ON public.%I FOR UPDATE TO authenticated USING (public.current_user_role() = ANY (ARRAY['admin','operador'])) WITH CHECK (public.current_user_role() = ANY (ARRAY['admin','operador']))$p$, t);
    -- Sin política de DELETE: no se borra, se anula.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE DELETE, TRUNCATE ON public.%I FROM authenticated', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit ON public.%I', t);
  END LOOP;
  -- Historial solo en las impresiones (la otra tabla no tiene columna id).
  CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.etiqueta_bolsa_impresion
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit();
END $$;

-- 4. La cuenta: bolsas del pedido, impresas y la que sigue ────────────────
-- bolsas = prendas del pedido ÷ 2, redondeado arriba (la última puede llevar 1).
CREATE OR REPLACE VIEW public.vw_etiqueta_bolsa_cuenta WITH (security_invoker = true) AS
WITH ped AS (
  SELECT c.temporada_id, c.proveedor_id, m.prenda, m.color,
         'T' || substr(p.talla_key, length(p.cod_prenda) + 1) AS talla,
         m.activo, min(m.orden) AS orden,
         string_agg(DISTINCT m.nota, ' · ') AS nota,
         sum(p.cantidad_solicitada)::integer AS piezas
    FROM public.pedido p
    JOIN public.contrato c ON c.id = p.contrato_id
    JOIN public.etiqueta_bolsa_prenda m ON m.cod_prenda = p.cod_prenda
   GROUP BY 1, 2, 3, 4, 5, 6
  HAVING sum(p.cantidad_solicitada) > 0
), imp AS (
  SELECT temporada_id, proveedor_id, prenda, color, talla,
         COALESCE(sum(hasta - desde + 1) FILTER (WHERE tipo = 'nueva'), 0)::integer AS impresas,
         COALESCE(max(hasta) FILTER (WHERE tipo = 'nueva'), 0)::integer AS ultimo,
         COALESCE(sum(cardinality(controles)) FILTER (WHERE tipo = 'reposicion'), 0)::integer AS repuestas
    FROM public.etiqueta_bolsa_impresion
   WHERE NOT anulada
   GROUP BY 1, 2, 3, 4, 5
)
SELECT ped.temporada_id, ped.proveedor_id, ped.prenda, ped.color, ped.talla,
       ped.activo, ped.nota, ped.orden, ped.piezas,
       ceil(ped.piezas / 2.0)::integer AS bolsas,
       CASE WHEN ped.activo THEN COALESCE(imp.impresas, 0) ELSE 0 END AS impresas,
       CASE WHEN ped.activo THEN COALESCE(imp.ultimo, 0) ELSE 0 END AS ultimo,
       CASE WHEN ped.activo THEN COALESCE(imp.repuestas, 0) ELSE 0 END AS repuestas
  FROM ped
  LEFT JOIN imp ON imp.temporada_id = ped.temporada_id AND imp.proveedor_id = ped.proveedor_id
               AND imp.prenda = ped.prenda AND imp.color = ped.color AND imp.talla = ped.talla;
REVOKE ALL ON public.vw_etiqueta_bolsa_cuenta FROM anon;
GRANT SELECT ON public.vw_etiqueta_bolsa_cuenta TO authenticated;

-- 5. Funciones (corren con los permisos de quien entra a la app) ──────────
CREATE OR REPLACE FUNCTION public._etiqueta_bolsa_quien() RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT COALESCE(NULLIF(auth.jwt() ->> 'email', ''), NULLIF(current_setting('app.firma', true), ''), 'sin firma');
$$;

-- Imprimir las siguientes N: reparte los números y lo deja anotado.
CREATE OR REPLACE FUNCTION public.etiqueta_bolsa_imprimir(
  p_temporada uuid, p_proveedor uuid, p_prenda text, p_color text, p_talla text, p_n integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v record; v_cod text; v_id uuid;
BEGIN
  IF p_n IS NULL OR p_n < 1 OR p_n > 500 THEN
    RAISE EXCEPTION 'La cantidad tiene que ser de 1 a 500';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('etq_bolsa|' || p_temporada || '|' || p_proveedor || '|' || p_prenda || '|' || p_color || '|' || p_talla));
  SELECT codigo_mined INTO v_cod FROM public.proveedor WHERE id = p_proveedor;
  IF COALESCE(v_cod, '') = '' THEN
    RAISE EXCEPTION 'Falta el código de proveedor de esa empresa';
  END IF;
  SELECT * INTO v FROM public.vw_etiqueta_bolsa_cuenta
   WHERE temporada_id = p_temporada AND proveedor_id = p_proveedor
     AND prenda = p_prenda AND color = p_color AND talla = p_talla AND activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa prenda y talla no está en el pedido de esa empresa';
  END IF;
  IF v.ultimo + p_n > v.bolsas THEN
    RAISE EXCEPTION 'Solo faltan % etiquetas (el pedido lleva % bolsas)', v.bolsas - v.ultimo, v.bolsas;
  END IF;
  INSERT INTO public.etiqueta_bolsa_impresion (temporada_id, proveedor_id, prenda, color, talla, tipo, desde, hasta, usuario)
  VALUES (p_temporada, p_proveedor, p_prenda, p_color, p_talla, 'nueva', v.ultimo + 1, v.ultimo + p_n, public._etiqueta_bolsa_quien())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'desde', v.ultimo + 1, 'hasta', v.ultimo + p_n, 'bolsas', v.bolsas, 'piezas', v.piezas);
END $$;

-- Reponer: mismos números, no suma a la cuenta. Solo números ya impresos.
CREATE OR REPLACE FUNCTION public.etiqueta_bolsa_reponer(
  p_temporada uuid, p_proveedor uuid, p_prenda text, p_color text, p_talla text, p_controles integer[], p_nota text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v record; v_id uuid; v_lista integer[]; v_malo integer;
BEGIN
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_lista FROM unnest(p_controles) AS x WHERE x IS NOT NULL;
  IF v_lista IS NULL THEN RAISE EXCEPTION 'Escriba los números a reponer'; END IF;
  IF cardinality(v_lista) > 500 THEN RAISE EXCEPTION 'Son demasiadas de una vez (máximo 500)'; END IF;
  SELECT * INTO v FROM public.vw_etiqueta_bolsa_cuenta
   WHERE temporada_id = p_temporada AND proveedor_id = p_proveedor
     AND prenda = p_prenda AND color = p_color AND talla = p_talla AND activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa prenda y talla no está en el pedido de esa empresa';
  END IF;
  SELECT x INTO v_malo FROM unnest(v_lista) AS x WHERE x < 1 OR x > v.ultimo LIMIT 1;
  IF v_malo IS NOT NULL THEN
    RAISE EXCEPTION 'La % no se ha impreso todavía (van impresas hasta la %)', v_malo, v.ultimo;
  END IF;
  INSERT INTO public.etiqueta_bolsa_impresion (temporada_id, proveedor_id, prenda, color, talla, tipo, controles, nota, usuario)
  VALUES (p_temporada, p_proveedor, p_prenda, p_color, p_talla, 'reposicion', v_lista, NULLIF(btrim(p_nota), ''), public._etiqueta_bolsa_quien())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'controles', to_jsonb(v_lista), 'bolsas', v.bolsas, 'piezas', v.piezas);
END $$;

-- Corregir una tanda que no salió completa.
--   p_salio_hasta NULL  → no salió ninguna: la tanda se anula.
--   p_salio_hasta = n   → salieron hasta la n: la tanda se recorta ahí.
-- Solo la ÚLTIMA tanda de esa prenda y talla (para no dejar huecos).
CREATE OR REPLACE FUNCTION public.etiqueta_bolsa_corregir(
  p_id uuid, p_salio_hasta integer DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r public.etiqueta_bolsa_impresion; v_ult integer;
        v_nota text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  SELECT * INTO r FROM public.etiqueta_bolsa_impresion WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró esa impresión'; END IF;
  IF r.anulada THEN RAISE EXCEPTION 'Esa impresión ya estaba anulada'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('etq_bolsa|' || r.temporada_id || '|' || r.proveedor_id || '|' || r.prenda || '|' || r.color || '|' || r.talla));
  IF r.tipo = 'nueva' THEN
    SELECT max(hasta) INTO v_ult FROM public.etiqueta_bolsa_impresion
     WHERE temporada_id = r.temporada_id AND proveedor_id = r.proveedor_id AND prenda = r.prenda
       AND color = r.color AND talla = r.talla AND tipo = 'nueva' AND NOT anulada;
    IF r.hasta <> v_ult THEN
      RAISE EXCEPTION 'Solo se corrige la última tanda (la que llega a la %)', v_ult;
    END IF;
    IF p_salio_hasta IS NOT NULL AND p_salio_hasta >= r.desde THEN
      IF p_salio_hasta >= r.hasta THEN RAISE EXCEPTION 'Esa tanda llega a la %: no hay nada que corregir', r.hasta; END IF;
      UPDATE public.etiqueta_bolsa_impresion
         SET hasta = p_salio_hasta,
             nota = concat_ws(' · ', nota, 'Se mandó hasta la ' || r.hasta || '; salió hasta la ' || p_salio_hasta, v_nota)
       WHERE id = p_id;
      RETURN jsonb_build_object('id', p_id, 'recortada', true, 'hasta', p_salio_hasta);
    END IF;
  END IF;
  UPDATE public.etiqueta_bolsa_impresion
     SET anulada = true, anulada_en = now(), anulada_por = public._etiqueta_bolsa_quien(),
         nota = concat_ws(' · ', nota, v_nota)
   WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'anulada', true);
END $$;

REVOKE ALL ON FUNCTION public._etiqueta_bolsa_quien() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.etiqueta_bolsa_imprimir(uuid, uuid, text, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.etiqueta_bolsa_reponer(uuid, uuid, text, text, text, integer[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.etiqueta_bolsa_corregir(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._etiqueta_bolsa_quien() TO authenticated;
GRANT EXECUTE ON FUNCTION public.etiqueta_bolsa_imprimir(uuid, uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.etiqueta_bolsa_reponer(uuid, uuid, text, text, text, integer[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.etiqueta_bolsa_corregir(uuid, integer, text) TO authenticated;

INSERT INTO public._migraciones (nombre, aplicada_en)
SELECT 'migracion_v3_58_etiquetas_bolsa.sql', now()
WHERE NOT EXISTS (SELECT 1 FROM public._migraciones WHERE nombre = 'migracion_v3_58_etiquetas_bolsa.sql');

-- 6. CARGA INICIAL (aparte, firmada, con el «dale» de Javier) ─────────────
-- Lo impreso antes de que existiera esta pantalla. NO va en la migración:
--   select set_config('app.firma', 'Claude · orden de Javier · 27-nov-2026', true);
--   JAV · PANTALÓN AZUL T16 · 001–150 (26-nov)
--   JAV · CAMISA BLANCA T16 · 001–050 (26-nov)
--   JAV · CAMISA BLANCA T16 · 051–057 (27-nov; se mandó 051–109, se acabó el rollo)

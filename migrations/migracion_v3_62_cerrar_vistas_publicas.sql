-- v3.62 · Cerrar las vistas que se podían leer sin entrar a la app
-- Auditoría 27-nov, Etapa 1 paso 12 (parte A).
--
-- Ocho vistas (incluida la del pago por operación) se podían leer con la llave
-- pública, sin cuenta. Ahora respetan los permisos de quien consulta
-- (security_invoker) y la llave pública ya no las ve. Quien entra con su
-- cuenta ve exactamente lo mismo que antes.
-- También se le quita a la llave pública la función que descuenta del empaque.

DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['vw_acaparado_disponible','vw_avance_diario','vw_bulto_avance',
                           'vw_bulto_propuesto','vw_contrato_avance','vw_pago_operacion',
                           'vw_plan_produccion','vw_produccion_estado'] LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.consume_pool_batch(jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_pool_batch(jsonb) TO authenticated;

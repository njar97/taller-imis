-- v3.63 · La fecha de «hoy» es la de El Salvador
-- Auditoría 27-nov, Etapa 1 paso 15.
--
-- La base trabaja en hora universal: después de las 6 p. m. de El Salvador
-- «hoy» ya era el día siguiente. Lo que se anotaba a esa hora sin fecha
-- escrita (movimientos de bodega al empacar o desempacar, registros de
-- operación, entregas…) quedaba con la fecha de mañana.
-- Ahora la fecha por defecto es la de El Salvador. No se toca ningún dato ya
-- guardado.

CREATE OR REPLACE FUNCTION public.hoy_sv() RETURNS date
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$ SELECT (now() AT TIME ZONE 'America/El_Salvador')::date $$;

GRANT EXECUTE ON FUNCTION public.hoy_sv() TO authenticated, service_role;

ALTER TABLE public.bodega_movimiento             ALTER COLUMN fecha          SET DEFAULT public.hoy_sv();
ALTER TABLE public.produccion_registro_operacion ALTER COLUMN fecha          SET DEFAULT public.hoy_sv();
ALTER TABLE public.produccion_bulto              ALTER COLUMN fecha_ingreso  SET DEFAULT public.hoy_sv();
ALTER TABLE public.entrega_escuela               ALTER COLUMN fecha          SET DEFAULT public.hoy_sv();
ALTER TABLE public.material_movimiento           ALTER COLUMN fecha          SET DEFAULT public.hoy_sv();
ALTER TABLE public.corte_seguimiento             ALTER COLUMN fecha          SET DEFAULT public.hoy_sv();
ALTER TABLE public.grupo_operaria                ALTER COLUMN desde          SET DEFAULT public.hoy_sv();
ALTER TABLE public.grupo_contribucion            ALTER COLUMN fecha          SET DEFAULT public.hoy_sv();
ALTER TABLE public.grupo_produccion              ALTER COLUMN fecha_asignada SET DEFAULT public.hoy_sv();
ALTER TABLE public.molde_version                 ALTER COLUMN fecha          SET DEFAULT public.hoy_sv();

-- Empacar y desempacar ponían la fecha universal a mano: mismo cambio,
-- sin tocar nada más de esas funciones.
DO $$
DECLARE f text; d text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.empacar_por_pedido', 'public.desempacar_por_pedido'] LOOP
    d := pg_get_functiondef(f::regproc);
    IF d ~ 'current_date' THEN
      EXECUTE replace(d, 'current_date', 'hoy_sv()');
    END IF;
  END LOOP;
END $$;

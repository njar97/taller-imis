-- v3.65 · No se anota trabajo en operaciones apagadas
-- Auditoría 27-nov, Etapa 1 paso 18 (PRO-8).
--
-- Había 119 registros en operaciones de pantalón que ya no se usan
-- (apagadas y sin ser detalle de ningún paso). No cuentan para el avance
-- ni para el pago, pero ensucian el historial del bulto.
-- Regla nueva: la base rechaza registros NUEVOS en una operación apagada.
-- Los registros viejos se anulan aparte, con firma (no en esta migración).

CREATE OR REPLACE FUNCTION public.trg_registro_operacion_viva() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE o record;
BEGIN
  SELECT activo, detalle, nombre INTO o FROM produccion_operacion WHERE id = NEW.operacion_id;
  IF FOUND AND NOT o.activo AND NOT COALESCE(o.detalle, false) THEN
    RAISE EXCEPTION 'La operación «%» ya no se usa. Elija una de la lista actual.', o.nombre;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_registro_operacion_viva ON public.produccion_registro_operacion;
CREATE TRIGGER trg_registro_operacion_viva
  BEFORE INSERT ON public.produccion_registro_operacion
  FOR EACH ROW EXECUTE FUNCTION public.trg_registro_operacion_viva();

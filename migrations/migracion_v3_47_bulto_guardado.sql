-- v3.47 · Bulto guardado
-- Un bulto cortado que por ahora NO se confecciona se marca «guardado»: sale de
-- la lista de Producción y se ve en el apartado «Guardados». Conserva el paso
-- en que iba; al sacarlo de guardado vuelve a la lista en ese mismo paso.

ALTER TABLE public.produccion_bulto
  ADD COLUMN IF NOT EXISTS guardado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guardado_en timestamptz;

CREATE INDEX IF NOT EXISTS produccion_bulto_guardado_idx
  ON public.produccion_bulto (id) WHERE guardado;

INSERT INTO public._migraciones (nombre, aplicada_en)
SELECT 'migracion_v3_47_bulto_guardado.sql', now()
WHERE NOT EXISTS (SELECT 1 FROM public._migraciones WHERE nombre = 'migracion_v3_47_bulto_guardado.sql');

-- v3.64 · El orden de los planes de corte lo fija Javier
-- Auditoría 27-nov, Etapa 1 paso 17.
--
-- «Sigue» elegía el plan por orden alfabético (Plan A antes que Plan B),
-- aunque en el taller tocara otro. Ahora cada plan puede llevar un número
-- de orden; los que no lo tengan siguen por nombre, como antes.
-- No se cambia ningún plan: la columna nace vacía.

ALTER TABLE public.trazo ADD COLUMN IF NOT EXISTS orden integer;
COMMENT ON COLUMN public.trazo.orden IS 'Orden en que se tiende (menor primero). Vacío = por nombre.';

CREATE OR REPLACE VIEW public.vw_trazos_sin_tendido WITH (security_invoker = true) AS
 SELECT id,
    fecha,
    codigo_corte,
    capas,
    yardas_estimadas,
    observaciones,
    creado_en,
    foto_url,
    video_url,
    letra_corte,
    ( SELECT count(*) AS count
           FROM trazo_talla_marcada
          WHERE (trazo_talla_marcada.trazo_id = t.id)) AS n_tallas_marcadas,
    ( SELECT count(*) AS count
           FROM tendido
          WHERE (tendido.trazo_id = t.id)) AS n_tendidos,
    orden
   FROM trazo t
  WHERE (NOT (EXISTS ( SELECT 1
           FROM tendido
          WHERE (tendido.trazo_id = t.id))))
  ORDER BY fecha DESC, creado_en DESC;

-- v3.51 · Etiqueta de conteo en el bulto (aplicada 21-nov-2026)
-- Bultos sin tiquete, contados y marcados con una etiqueta QR de letras (KAA, KAB…).
-- Si el bulto tiene etiqueta, ese es el código que muestra la app (lo que va antes del guion).
alter table produccion_bulto add column if not exists etiqueta text;
create unique index if not exists produccion_bulto_etiqueta_uq on produccion_bulto (etiqueta) where etiqueta is not null;

-- vw_produccion_estado: igual que antes, solo cambia la última columna:
--   codigo_bulto = CASE WHEN pb.etiqueta IS NOT NULL
--                    THEN pb.etiqueta || '-' || replace(trs.talla_key_salida,'.','') || COALESCE(pb.sufijo_division,'')
--                    ELSE <código de siempre: rollo + letra de corte + letra de talla + cantidad + '-' + talla + sufijo> END
-- (la definición completa está aplicada en la base; se recreó con CREATE OR REPLACE VIEW sin tocar las demás columnas)

-- v3.50 · Pago por operación: lo anotado con nombre × pago por prenda de la operación.
-- Un paso anotado entero (botón verde) con nombre paga lo del paso que nadie anotó por operación.
CREATE OR REPLACE VIEW public.vw_pago_operacion AS
SELECT r.fecha, r.operaria_id,
       COALESCE(op.nombre, NULLIF(r.operaria, ''), 'Sin nombre') AS operaria_nombre,
       o.cod_prenda, o.nombre AS operacion, r.produccion_bulto_id,
       sum(r.cantidad_realizada) AS cantidad,
       COALESCE(CASE WHEN o.detalle THEN o.pago_prenda
            ELSE GREATEST(
              COALESCE((SELECT sum(d.pago_prenda) FROM produccion_operacion d WHERE d.paso_id = o.id AND d.detalle), 0)
              - COALESCE((SELECT sum(d.pago_prenda) FROM produccion_operacion d
                           WHERE d.paso_id = o.id AND d.detalle
                             AND EXISTS (SELECT 1 FROM produccion_registro_operacion r2
                                          WHERE r2.produccion_bulto_id = r.produccion_bulto_id AND r2.operacion_id = d.id AND r2.tipo = 'normal')), 0), 0)
       END, 0) AS pago_unit
  FROM produccion_registro_operacion r
  JOIN produccion_operacion o ON o.id = r.operacion_id
  LEFT JOIN operaria op ON op.id = r.operaria_id
 WHERE r.tipo = 'normal' AND (o.activo OR o.detalle)
 GROUP BY r.fecha, r.operaria_id, op.nombre, r.operaria, o.cod_prenda, o.nombre, o.id, o.detalle, o.pago_prenda, r.produccion_bulto_id;

GRANT SELECT ON public.vw_pago_operacion TO anon, authenticated;

INSERT INTO public._migraciones (nombre, aplicada_en)
SELECT 'migracion_v3_50_pago_por_operacion.sql', now()
WHERE NOT EXISTS (SELECT 1 FROM public._migraciones WHERE nombre = 'migracion_v3_50_pago_por_operacion.sql');

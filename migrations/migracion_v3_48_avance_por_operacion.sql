-- v3.48 · Avance por operación, pesado por tiempo
-- Cada paso grande (Corte · Preparación · Armado · Limpia) puede tener operaciones
-- de detalle (detalle = true, paso_id = el paso). El avance de un bulto suma los
-- minutos de lo ya hecho sobre los minutos totales de la prenda: si el paso está
-- anotado cuenta entero; si no, cuentan las operaciones de detalle anotadas.
-- Tiempos: tesis IMIS (tabla de destajo v2). Corte 1.0 y limpia·plancha·empaque
-- 3.5 son a ojo.

ALTER TABLE public.produccion_operacion
  ADD COLUMN IF NOT EXISTS paso_id uuid REFERENCES public.produccion_operacion(id),
  ADD COLUMN IF NOT EXISTS detalle boolean NOT NULL DEFAULT false;

-- Corte: peso a ojo
UPDATE public.produccion_operacion SET tiempo_estandar_min = 1.0
 WHERE activo AND codigo = 'corte' AND tiempo_estandar_min IS NULL;

-- Camisa (11 operaciones activas): tiempos de la tabla de destajo
UPDATE public.produccion_operacion o SET tiempo_estandar_min = v.t
  FROM (VALUES ('ruedo_manga',0.25),('pecheras_bolsa',3.0),('canesu',0.25),('cuello_plana',1.0),
               ('cuello_mano',2.0),('hombros',0.75),('mangas_costados',2.75),('escote_cuello',1.25),
               ('ruedo_camisa',1.0),('ojal_boton',1.75),('limpia_plancha_empaque',3.5)) v(codigo, t)
 WHERE o.cod_prenda IN ('C','B','CC') AND o.activo AND o.codigo = v.codigo AND o.tiempo_estandar_min IS NULL;

-- Operaciones de detalle dentro de cada paso
INSERT INTO public.produccion_operacion (id, cod_prenda, codigo, nombre, orden, maquina, tiempo_estandar_min, activo, creado_en, paso_id, detalle)
SELECT gen_random_uuid(), p.cod_prenda, v.codigo, v.nombre, p.orden * 10 + v.n, NULL, v.t, false, now(), p.id, true
  FROM (VALUES
    ('P','preparacion','d_prep_bolsas','Preparación de bolsas (tiros y bolsa trasera)',1,9.0),
    ('P','preparacion','d_cintura_bolsas_del','Cintura y bolsas delanteras',2,3.0),
    ('P','armado','d_bragueta_ziper','Bragueta y zíper',1,10.0),
    ('P','armado','d_cerrado_cuerpo','Cerrado de cuerpo (entrepierna, costados, pretina)',2,11.5),
    ('P','armado','d_portacinchos_ruedo','Portacinchos y ruedo',3,5.0),
    ('P','limpia','d_ojal_boton_atraque','Ojal, botón y atraque',1,1.0),
    ('P','limpia','d_limpia_plancha','Limpia, plancha y empaque',2,3.5),
    ('F','preparacion','d_ziper_paleton','Zíper y paletón (pinzas)',1,8.25),
    ('F','preparacion','d_bolsa','Bolsa (sobrehilar, unir, decorar)',2,2.75),
    ('F','armado','d_cerrado_pretina','Cerrado y pretina',1,6.5),
    ('F','armado','d_ruedo','Ruedo',2,1.5),
    ('F','limpia','d_ojal_boton','Ojal y botón',1,1.0),
    ('F','limpia','d_limpia_plancha','Limpia, plancha y empaque',2,3.5),
    ('S','preparacion','d_bolsas','Bolsas (tiros, sobrehilar, unir, decorar)',1,3.5),
    ('S','armado','d_cerrado_cuerpo','Cerrado de cuerpo (entrepierna y costados)',1,3.0),
    ('S','armado','d_pretina_elastico','Pretina y elástico',2,6.0),
    ('S','armado','d_ruedo','Ruedo',3,1.5),
    ('S','limpia','d_ojal_boton','Ojal y botón',1,1.0),
    ('S','limpia','d_limpia_plancha','Limpia, plancha y empaque',2,3.5)
  ) v(familia, paso, codigo, nombre, n, t)
  JOIN public.produccion_operacion p
    ON p.activo AND p.codigo = v.paso
   AND ((v.familia = 'P' AND p.cod_prenda IN ('P','PB'))
     OR (v.familia = 'F' AND p.cod_prenda IN ('F','FB','FCE'))
     OR (v.familia = 'S' AND p.cod_prenda = 'S'))
ON CONFLICT (cod_prenda, codigo) DO NOTHING;

-- etapas_hechas: solo cuentan los pasos activos (las operaciones de detalle no)
CREATE OR REPLACE VIEW public.vw_produccion_estado AS
 SELECT trs.id AS salida_id,
    pb.id AS produccion_bulto_id,
    t.id AS tendido_id,
    t.codigo_corte,
    t.letra_corte,
    t.fecha AS fecha_corte,
    tr.numero_rollo,
    ttm.letra_local AS letra_talla,
    ttm.talla_key_original,
    ttm.talla_key_complemento,
    ttm.cod_prenda,
    trs.talla_key_salida,
    trs.cantidad AS cantidad_trs_original,
    COALESCE(pb.cantidad_ajustada, trs.cantidad) AS cantidad_original,
    pb.cantidad_final,
    pb.bulto_origen_id,
    pb.sufijo_division,
    pb.unido_a_id,
    COALESCE(pb.estado, 'pendiente'::text) AS estado_manual,
    ( SELECT count(*) AS count
           FROM produccion_operacion po
          WHERE ((po.cod_prenda = ttm.cod_prenda) AND (po.activo = true))) AS total_etapas,
    ( SELECT count(DISTINCT po.id) AS count
           FROM (produccion_registro_operacion pro
             JOIN produccion_operacion po ON ((po.id = pro.operacion_id)))
          WHERE ((pro.produccion_bulto_id = pb.id) AND (pro.tipo = 'normal'::text) AND (po.cod_prenda = ttm.cod_prenda) AND (po.activo = true))) AS etapas_hechas,
    pb.fecha_ingreso,
    pb.fecha_terminado,
    pb.observaciones,
    (((((((tr.numero_rollo)::text || COALESCE(t.letra_corte, '?'::text)) || ttm.letra_local) || (COALESCE(pb.cantidad_ajustada, trs.cantidad))::text) || '-'::text) || replace(trs.talla_key_salida, '.'::text, ''::text)) || COALESCE(pb.sufijo_division, ''::text)) AS codigo_bulto
   FROM ((((tendido_rollo_salida trs
     JOIN tendido_rollo tr ON ((tr.id = trs.tendido_rollo_id)))
     JOIN tendido t ON ((t.id = tr.tendido_id)))
     JOIN tendido_talla_marcada ttm ON ((ttm.id = trs.tendido_talla_marcada_id)))
     LEFT JOIN produccion_bulto pb ON ((pb.tendido_rollo_salida_id = trs.id)))
  WHERE (pb.unido_a_id IS NULL)
  ORDER BY t.fecha DESC, t.codigo_corte, tr.numero_rollo, ttm.letra_local;

-- Avance de cada bulto (0 a 1), pesado por minutos
CREATE OR REPLACE VIEW public.vw_bulto_avance AS
WITH paso AS (
  SELECT p.id, p.cod_prenda,
         COALESCE((SELECT sum(d.tiempo_estandar_min) FROM produccion_operacion d WHERE d.paso_id = p.id AND d.detalle),
                  p.tiempo_estandar_min, 0) AS peso
    FROM produccion_operacion p WHERE p.activo
), tot AS (
  SELECT cod_prenda, sum(peso) AS total FROM paso GROUP BY cod_prenda
), hecho AS (
  SELECT e.produccion_bulto_id,
         sum(CASE
               WHEN EXISTS (SELECT 1 FROM produccion_registro_operacion r
                             WHERE r.produccion_bulto_id = e.produccion_bulto_id AND r.operacion_id = p.id AND r.tipo = 'normal')
                 THEN p.peso
               ELSE COALESCE((SELECT sum(d.tiempo_estandar_min) FROM produccion_operacion d
                               WHERE d.paso_id = p.id AND d.detalle
                                 AND EXISTS (SELECT 1 FROM produccion_registro_operacion r
                                              WHERE r.produccion_bulto_id = e.produccion_bulto_id AND r.operacion_id = d.id AND r.tipo = 'normal')), 0)
             END) AS min_hechos
    FROM vw_produccion_estado e JOIN paso p ON p.cod_prenda = e.cod_prenda
   WHERE e.produccion_bulto_id IS NOT NULL
   GROUP BY e.produccion_bulto_id
)
SELECT e.produccion_bulto_id, e.cod_prenda, e.talla_key_salida, e.codigo_corte, e.estado_manual,
       COALESCE(e.cantidad_final, e.cantidad_original) AS cantidad,
       e.fecha_terminado,
       t.total AS min_prenda,
       COALESCE(h.min_hechos, 0) AS min_hechos,
       CASE WHEN e.estado_manual = 'terminado' THEN 1
            WHEN COALESCE(t.total, 0) > 0 THEN LEAST(1, COALESCE(h.min_hechos, 0) / t.total)
            WHEN e.total_etapas > 0 THEN e.etapas_hechas::numeric / e.total_etapas
            ELSE 0 END AS fraccion
  FROM vw_produccion_estado e
  LEFT JOIN tot t ON t.cod_prenda = e.cod_prenda
  LEFT JOIN hecho h ON h.produccion_bulto_id = e.produccion_bulto_id
 WHERE e.produccion_bulto_id IS NOT NULL AND e.codigo_corte <> 'SIM-DEMO';

-- Trabajo anotado por día, en «prendas equivalentes» (minutos hechos / minutos de la prenda)
CREATE OR REPLACE VIEW public.vw_avance_diario AS
WITH paso AS (
  SELECT p.id, p.cod_prenda,
         COALESCE((SELECT sum(d.tiempo_estandar_min) FROM produccion_operacion d WHERE d.paso_id = p.id AND d.detalle),
                  p.tiempo_estandar_min, 0) AS peso
    FROM produccion_operacion p WHERE p.activo
), tot AS (
  SELECT cod_prenda, sum(peso) AS total FROM paso GROUP BY cod_prenda
), reg AS (
  SELECT r.fecha, o.cod_prenda, r.produccion_bulto_id, o.id AS op_id, o.detalle, o.tiempo_estandar_min,
         sum(r.cantidad_realizada) AS cant
    FROM produccion_registro_operacion r
    JOIN produccion_operacion o ON o.id = r.operacion_id
   WHERE r.tipo = 'normal' AND (o.activo OR o.detalle)
   GROUP BY r.fecha, o.cod_prenda, r.produccion_bulto_id, o.id, o.detalle, o.tiempo_estandar_min
)
SELECT g.fecha, g.cod_prenda,
       round(sum(g.cant * CASE
           WHEN g.detalle THEN COALESCE(g.tiempo_estandar_min, 0)
           ELSE GREATEST((SELECT p.peso FROM paso p WHERE p.id = g.op_id)
                - COALESCE((SELECT sum(d.tiempo_estandar_min) FROM produccion_operacion d
                             WHERE d.paso_id = g.op_id AND d.detalle
                               AND EXISTS (SELECT 1 FROM produccion_registro_operacion r2
                                            WHERE r2.produccion_bulto_id = g.produccion_bulto_id AND r2.operacion_id = d.id AND r2.tipo = 'normal')), 0), 0)
         END / NULLIF(t.total, 0)), 1) AS prendas_equiv
  FROM reg g JOIN tot t ON t.cod_prenda = g.cod_prenda
 GROUP BY g.fecha, g.cod_prenda;

GRANT SELECT ON public.vw_bulto_avance, public.vw_avance_diario TO anon, authenticated;

-- Fechas del plazo (YYYYMMDD): retiro de tela y entrega
INSERT INTO public.plan_produccion_config (clave, valor)
SELECT v.clave, v.valor FROM (VALUES ('fecha_inicio',20261019),('fecha_entrega',20261218)) v(clave, valor)
 WHERE NOT EXISTS (SELECT 1 FROM public.plan_produccion_config c WHERE c.clave = v.clave);

INSERT INTO public._migraciones (nombre, aplicada_en)
SELECT 'migracion_v3_48_avance_por_operacion.sql', now()
WHERE NOT EXISTS (SELECT 1 FROM public._migraciones WHERE nombre = 'migracion_v3_48_avance_por_operacion.sql');

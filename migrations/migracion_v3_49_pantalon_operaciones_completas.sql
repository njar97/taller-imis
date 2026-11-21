-- v3.49 · Pantalón: lista completa de operaciones de detalle con tiempo y pago por prenda
-- (Javier 20-nov: $2.50 sin trabillas; hacer trabillas $4 el lote de 500; pegar 1:15; ojal y botón 15 s c/u)
-- Minutos: tesis IMIS por grupo, repartidos entre las operaciones de cada grupo (estimado).
ALTER TABLE public.produccion_operacion ADD COLUMN IF NOT EXISTS pago_prenda numeric;

DELETE FROM public.produccion_operacion WHERE detalle AND cod_prenda IN ('P','PB');

INSERT INTO public.produccion_operacion (id, cod_prenda, codigo, nombre, orden, maquina, tiempo_estandar_min, activo, creado_en, paso_id, detalle, pago_prenda)
SELECT gen_random_uuid(), p.cod_prenda, v.codigo, v.nombre, p.orden * 100 + v.n, NULL, v.t, false, now(), p.id, true, v.pago
  FROM (VALUES
    ('preparacion','d_ranear_tiros','Ranear tiros',1,2.0,0.13),
    ('preparacion','d_bolsa_delantera','Pegar bolsa delantera',2,2.0,0.13),
    ('preparacion','d_ziper','Pegar zíper',3,10.0,0.65),
    ('preparacion','d_bolsa_trasera','Pegar bolsa trasera',4,3.0,0.20),
    ('preparacion','d_picar_bolsa_trasera','Picar bolsa trasera',5,1.0,0.07),
    ('preparacion','d_tapadera_decorar','Tapadera + decorar bolsa trasera',6,3.0,0.20),
    ('preparacion','d_ranear_bolsas','Ranear bolsas',7,1.0,0.07),
    ('preparacion','d_atraque_bolsas','Atraque delantero + bolsa trasera',8,0.75,0.05),
    ('preparacion','d_pares','Hacer pares',9,0.5,0.03),
    ('preparacion','d_hacer_trabillas','Hacer trabillas (cortar, hacer y cortar)',10,0.9,0.04),
    ('armado','d_ranear_costados','Ranear costados y tiros',1,3.0,0.20),
    ('armado','d_taclear_talla','Taclear + pegar talla',2,0.5,0.03),
    ('armado','d_pegar_pretina','Pegar pretina',3,3.0,0.20),
    ('armado','d_decorar_pretina','Decorar pretina',4,1.5,0.10),
    ('armado','d_puntear_trasero','Puntear trasero',5,0.5,0.03),
    ('armado','d_cerrar_traseros','Cerrar traseros + medida de cintura',6,2.0,0.13),
    ('armado','d_asentar_trasero','Asentar trasero',7,1.0,0.07),
    ('armado','d_taclear_cintura','Taclear cintura',8,1.0,0.07),
    ('armado','d_ruedo','Ruedo',9,1.5,0.10),
    ('armado','d_pegar_trabillas','Pegar trabillas',10,1.25,0.08),
    ('limpia','d_ojal','Ojal',1,0.25,0.02),
    ('limpia','d_boton','Botón',2,0.25,0.02),
    ('limpia','d_limpia_plancha','Limpia, plancha y empaque',3,3.5,NULL)
  ) v(paso, codigo, nombre, n, t, pago)
  JOIN public.produccion_operacion p ON p.activo AND p.codigo = v.paso AND p.cod_prenda IN ('P','PB');

INSERT INTO public._migraciones (nombre, aplicada_en)
SELECT 'migracion_v3_49_pantalon_operaciones_completas.sql', now()
WHERE NOT EXISTS (SELECT 1 FROM public._migraciones WHERE nombre = 'migracion_v3_49_pantalon_operaciones_completas.sql');

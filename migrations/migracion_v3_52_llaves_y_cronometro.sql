-- v3.52 · Llaves entre operaciones + tiempo medido con cronómetro
-- requiere: códigos de las operaciones (de la misma prenda) que deben estar
--   hechas antes; '*' = todas las demás. Vacío o null = libre.
-- segundos: tiempo medido con el cronómetro de la app al anotar (opcional).
-- Pantalón (P y PB): se agrega «Ranear ruedo» antes de «Ruedo» (Javier 23-nov)
--   y se cargan las llaves. Botón NO depende del ojal.
ALTER TABLE public.produccion_operacion ADD COLUMN IF NOT EXISTS requiere text[];
ALTER TABLE public.produccion_registro_operacion ADD COLUMN IF NOT EXISTS segundos integer;

UPDATE public.produccion_operacion SET orden = 311 WHERE cod_prenda IN ('P','PB') AND codigo = 'd_pegar_trabillas';
UPDATE public.produccion_operacion SET orden = 310 WHERE cod_prenda IN ('P','PB') AND codigo = 'd_ruedo';
INSERT INTO public.produccion_operacion (cod_prenda, codigo, nombre, orden, activo, detalle, paso_id)
SELECT p.cod_prenda, 'd_ranear_ruedo', 'Ranear ruedo', 309, false, true, p.id
  FROM public.produccion_operacion p
 WHERE p.cod_prenda IN ('P','PB') AND p.codigo = 'armado'
ON CONFLICT (cod_prenda, codigo) DO NOTHING;

-- Bultos que ya tenían «Ruedo» anotado: el raneado del ruedo ya estaba hecho.
INSERT INTO public.produccion_registro_operacion (produccion_bulto_id, operacion_id, operaria_id, operaria, fecha, cantidad_realizada, tipo, observaciones)
SELECT r.produccion_bulto_id, n.id, r.operaria_id, r.operaria, r.fecha, r.cantidad_realizada, 'normal', 'Ya estaba hecho al agregar la operación (v3.52)'
  FROM public.produccion_registro_operacion r
  JOIN public.produccion_operacion o ON o.id = r.operacion_id AND o.codigo = 'd_ruedo'
  JOIN public.produccion_operacion n ON n.cod_prenda = o.cod_prenda AND n.codigo = 'd_ranear_ruedo'
 WHERE r.tipo = 'normal'
   AND NOT EXISTS (SELECT 1 FROM public.produccion_registro_operacion x WHERE x.produccion_bulto_id = r.produccion_bulto_id AND x.operacion_id = n.id);

UPDATE public.produccion_operacion o SET requiere = v.req
  FROM (VALUES
    ('d_hacer_trabillas',     ARRAY[]::text[]),
    ('d_ranear_tiros',        ARRAY[]::text[]),
    ('d_bolsa_delantera',     ARRAY['d_ranear_tiros']),
    ('d_ziper',               ARRAY['d_bolsa_delantera']),
    ('d_bolsa_trasera',       ARRAY['d_ranear_tiros']),
    ('d_picar_bolsa_trasera', ARRAY['d_bolsa_trasera']),
    ('d_tapadera_decorar',    ARRAY['d_picar_bolsa_trasera']),
    ('d_ranear_bolsas',       ARRAY['d_tapadera_decorar','d_bolsa_delantera']),
    ('d_atraque_bolsas',      ARRAY['d_ranear_bolsas','d_ziper']),
    ('d_pares',               ARRAY['d_atraque_bolsas']),
    ('d_ranear_costados',     ARRAY['d_pares']),
    ('d_taclear_talla',       ARRAY['d_ranear_costados']),
    ('d_pegar_pretina',       ARRAY['d_taclear_talla']),
    ('d_decorar_pretina',     ARRAY['d_pegar_pretina']),
    ('d_puntear_trasero',     ARRAY['d_pegar_pretina']),
    ('d_cerrar_traseros',     ARRAY['d_puntear_trasero']),
    ('d_asentar_trasero',     ARRAY['d_cerrar_traseros']),
    ('d_taclear_cintura',     ARRAY['d_asentar_trasero']),
    ('d_ranear_ruedo',        ARRAY['d_ranear_costados']),
    ('d_ruedo',               ARRAY['d_ranear_ruedo']),
    ('d_pegar_trabillas',     ARRAY['d_puntear_trasero','d_hacer_trabillas']),
    ('d_ojal',                ARRAY['d_decorar_pretina']),
    ('d_boton',               ARRAY['d_decorar_pretina']),
    ('d_limpia_plancha',      ARRAY['*'])
  ) AS v(codigo, req)
 WHERE o.cod_prenda IN ('P','PB') AND o.codigo = v.codigo;

-- Pasos que ya tienen TODAS sus operaciones anotadas pero no el paso (cargas a mano).
INSERT INTO public.produccion_registro_operacion (produccion_bulto_id, operacion_id, fecha, cantidad_realizada, tipo, observaciones)
SELECT b.id, p.id, CURRENT_DATE, COALESCE(b.cantidad_final, b.cantidad_ajustada, trs.cantidad), 'normal', 'Paso completo por sus operaciones (v3.52)'
  FROM public.produccion_bulto b
  JOIN public.tendido_rollo_salida trs ON trs.id = b.tendido_rollo_salida_id
  JOIN public.tendido_talla_marcada ttm ON ttm.id = trs.tendido_talla_marcada_id
  JOIN public.produccion_operacion p ON p.cod_prenda = ttm.cod_prenda AND p.activo
 WHERE EXISTS (SELECT 1 FROM public.produccion_operacion d WHERE d.paso_id = p.id AND d.detalle)
   AND NOT EXISTS (SELECT 1 FROM public.produccion_registro_operacion r WHERE r.produccion_bulto_id = b.id AND r.operacion_id = p.id AND r.tipo = 'normal')
   AND NOT EXISTS (SELECT 1 FROM public.produccion_operacion d WHERE d.paso_id = p.id AND d.detalle
                    AND NOT EXISTS (SELECT 1 FROM public.produccion_registro_operacion r WHERE r.produccion_bulto_id = b.id AND r.operacion_id = d.id AND r.tipo = 'normal'));

INSERT INTO public._migraciones (nombre) VALUES ('migracion_v3_52_llaves_y_cronometro.sql') ON CONFLICT DO NOTHING;

-- v3.31 — Operaciones de camisa/blusa según el proceso real del taller (audio de Javier, 24-sep-2026)
-- Reemplaza las 6 etapas agrupadas de la tesis 2019 (v3.8) por 11 filas: una por trabajo que hace UNA persona.
-- Coincide con el tiquete de bulto v6. Las etapas viejas NO se borran: quedan activo=false con sufijo _tesis.
-- Tiempos en NULL hasta medirlos con el tiquete.

UPDATE produccion_operacion
   SET activo = false, codigo = codigo || '_tesis'
 WHERE cod_prenda IN ('C', 'B', 'CC') AND activo = true AND codigo NOT LIKE '%\_tesis';

INSERT INTO produccion_operacion (cod_prenda, codigo, nombre, orden, maquina, tiempo_estandar_min)
SELECT p.cod, o.codigo, o.nombre, o.orden, o.maquina, NULL
  FROM (VALUES ('C'), ('B'), ('CC')) AS p(cod)
 CROSS JOIN (VALUES
   ('ruedo_manga',            'Ruedo de manga',                                  1, 'Plana'),
   ('pecheras_bolsa',         'Pecheras y bolsa',                                2, 'Multiaguja / Plana'),
   ('canesu',                 'Canesú',                                          3, 'Plana'),
   ('cuello_plana',           'Cuello en plana (pelum, decorar, unir patita)',   4, 'Plana'),
   ('cuello_mano',            'Cuello a mano (voltear, recortar, emparejar)',    5, 'Manual'),
   ('hombros',                'Hombros (unir + decorar)',                        6, 'Rana / Plana'),
   ('mangas_costados',        'Mangas y costados',                               7, 'Rana'),
   ('escote_cuello',          'Escote y pegar cuello',                           8, 'Manual / Plana'),
   ('ruedo_camisa',           'Ruedo de camisa',                                 9, 'Plana'),
   ('ojal_boton',             'Ojal y botón',                                   10, 'Ojaleadora / Botonera'),
   ('limpia_plancha_empaque', 'Limpia, plancha y empaque',                      11, 'Manual / Plancha')
 ) AS o(codigo, nombre, orden, maquina);

-- v3.34 — Operaciones de PANTALÓN según el flujo real del taller (Imelda + Javier, 11-nov-2026)
-- Fuente: operarias\destajo\flujo_pantalon.py (25 pasos, confirmado por Javier «todo está correcto»).
-- Reemplaza las 6 etapas agrupadas de la tesis (v3.8). Javier 12-nov: «en la app no va agrupado».
-- Las etapas viejas NO se borran: quedan activo=false con sufijo _agrupado.
-- Máquina solo donde el flujo la dice; tiempos en NULL hasta medirlos.

UPDATE produccion_operacion
   SET activo = false, codigo = codigo || '_agrupado'
 WHERE cod_prenda IN ('P', 'PB') AND activo = true AND codigo NOT LIKE '%\_agrupado';

INSERT INTO produccion_operacion (cod_prenda, codigo, nombre, orden, maquina, tiempo_estandar_min)
SELECT p.cod, o.codigo, o.nombre, o.orden, o.maquina, NULL
  FROM (VALUES ('P'), ('PB')) AS p(cod)
 CROSS JOIN (VALUES
   ('corte',               'Corte',                                        1, NULL),
   ('paquetes',            'Preparar paquetes (bultos con tiquete)',       2, 'Manual'),
   ('ranear_tiros',        'Ranear tiros (delantero y trasero)',           3, 'Rana'),
   ('bolsa_delantera',     'Pegar bolsa delantera',                        4, NULL),
   ('ziper',               'Pegar zíper',                                  5, NULL),
   ('bolsa_trasera',       'Pegar bolsa trasera',                          6, NULL),
   ('picar_bolsa_trasera', 'Picar bolsa trasera',                          7, 'Manual'),
   ('tapadera_decorar',    'Pegar tapadera + decorar bolsa trasera',       8, NULL),
   ('ranear_bolsas',       'Ranear bolsas',                                9, 'Rana'),
   ('atraque_bolsas',      'Atraque delantero + bolsa trasera',           10, 'Atracadora'),
   ('pares',               'Hacer pares',                                 11, 'Manual'),
   ('ranear_costados',     'Ranear costados y tiros',                     12, 'Rana'),
   ('taclear_talla',       'Taclear + pegar talla',                       13, NULL),
   ('pegar_pretina',       'Pegar pretina',                               14, NULL),
   ('decorar_pretina',     'Decorar pretina',                             15, NULL),
   ('puntear_trasero',     'Puntear trasero (marcar trabillas)',          16, 'Manual'),
   ('cerrar_traseros',     'Cerrar traseros + dar medida de cintura',     17, 'Plana'),
   ('asentar_trasero',     'Asentar trasero',                             18, 'Manual'),
   ('taclear_cintura',     'Taclear cintura (doblar sobrante y sellar)',  19, NULL),
   ('ruedo',               'Ruedo',                                       20, NULL),
   ('portacinchos',        'Portacinchos (5)',                            21, 'Atracadora'),
   ('ojal_boton_atraque',  'Ojal · botón · atraque',                      22, 'Ojaleadora / Botonera / Atracadora'),
   ('limpia',              'Limpia',                                      23, 'Manual'),
   ('plancha',             'Plancha',                                     24, 'Plancha'),
   ('revisar_empacar',     'Revisar · empacar',                           25, 'Manual')
 ) AS o(codigo, nombre, orden, maquina);

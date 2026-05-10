-- =====================================================================
-- Migración v3.16 — Catálogo de prendas + tallas + largos + detalles
-- =====================================================================
-- Modelo:
--   prenda                — catálogo maestro (10 prendas)
--   prenda_talla          — tallas válidas por prenda
--   prenda_largo          — largos válidos por prenda
--   prenda_detalle        — detalles válidos por prenda (cintura, cadera...)
--   prenda_talla_largo    — matriz histórica (talla, largo) realmente usada
--
-- Cada tabla hija lleva es_estandar (true = curado en AUX, false = solo
-- aparece en histórico BASE). El flag se usa para alimentar selects sin
-- ruido y para detectar combinaciones nuevas que requieran aprobación.
--
-- También agrega alumno.tiene_talla_no_estandar y lo marca para los 6
-- alumnos ya cargados cuya combinación cae fuera del catálogo curado.
--
-- Idempotente: re-ejecutable sin errores.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) DDL
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.prenda (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       text NOT NULL UNIQUE,
  nombre       text NOT NULL UNIQUE,
  usa_largo    boolean NOT NULL DEFAULT false,
  usa_detalle  boolean NOT NULL DEFAULT false,
  orden        integer NOT NULL DEFAULT 100,
  activo       boolean NOT NULL DEFAULT true,
  creado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prenda_talla (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prenda_id    uuid NOT NULL REFERENCES public.prenda(id) ON DELETE CASCADE,
  talla        text NOT NULL,
  es_estandar  boolean NOT NULL DEFAULT true,
  orden        integer,
  usos         integer NOT NULL DEFAULT 0,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prenda_id, talla)
);

CREATE TABLE IF NOT EXISTS public.prenda_largo (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prenda_id    uuid NOT NULL REFERENCES public.prenda(id) ON DELETE CASCADE,
  largo        text NOT NULL,
  es_estandar  boolean NOT NULL DEFAULT true,
  orden        integer,
  usos         integer NOT NULL DEFAULT 0,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prenda_id, largo)
);

CREATE TABLE IF NOT EXISTS public.prenda_detalle (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prenda_id    uuid NOT NULL REFERENCES public.prenda(id) ON DELETE CASCADE,
  detalle      text NOT NULL,
  es_estandar  boolean NOT NULL DEFAULT true,
  usos         integer NOT NULL DEFAULT 0,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prenda_id, detalle)
);

CREATE TABLE IF NOT EXISTS public.prenda_talla_largo (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prenda_id    uuid NOT NULL REFERENCES public.prenda(id) ON DELETE CASCADE,
  talla        text NOT NULL,
  largo        text NOT NULL,
  es_estandar  boolean NOT NULL DEFAULT false,
  usos         integer NOT NULL DEFAULT 0,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prenda_id, talla, largo)
);

ALTER TABLE public.alumno
  ADD COLUMN IF NOT EXISTS tiene_talla_no_estandar boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------
-- 2) Catálogo de prendas
-- ---------------------------------------------------------------------

INSERT INTO public.prenda (codigo, nombre, usa_largo, usa_detalle, orden) VALUES
  ('C',   'CAMISA',         true,  false, 10),
  ('B',   'BLUSA',          true,  false, 20),
  ('CC',  'CAMISA_CELESTE', true,  false, 30),
  ('P',   'PANTALON',       true,  false, 40),
  ('PB',  'PANTALON_BEIGE', true,  false, 50),
  ('S',   'SHORT',          false, false, 60),
  ('F',   'FALDA',          true,  true,  70),
  ('FB',  'FALDA_BEIGE',    true,  true,  80),
  ('FCE', 'FALDA_C.E',      true,  false, 90),
  ('FM',  'FALDA_MERGE',    true,  false, 99)
ON CONFLICT (codigo) DO UPDATE
  SET nombre      = EXCLUDED.nombre,
      usa_largo   = EXCLUDED.usa_largo,
      usa_detalle = EXCLUDED.usa_detalle,
      orden       = EXCLUDED.orden;

-- ---------------------------------------------------------------------
-- 3) Tallas curadas (incluye no estándar detectadas en histórico)
-- ---------------------------------------------------------------------

WITH datos(codigo, talla, es_estandar, orden) AS (VALUES
  -- CAMISA
  ('C','2',true,1),('C','4',true,2),('C','6',true,3),('C','8',true,4),
  ('C','10',true,5),('C','12',true,6),('C','14',true,7),('C','16',true,8),
  ('C','17',true,9),('C','20',true,10),('C','22',true,11),('C','24',true,12),
  ('C','26',true,13),('C','28',true,14),('C','30',true,15),('C','ES',true,16),
  ('C','3',false,17),('C','1',false,18),
  -- BLUSA
  ('B','8',true,1),('B','10',true,2),('B','12',true,3),('B','14',true,4),
  ('B','16',true,5),('B','17',true,6),('B','20',true,7),('B','22',true,8),
  ('B','24',true,9),('B','26',true,10),('B','28',true,11),('B','30',true,12),
  ('B','ES',true,13),
  -- CAMISA_CELESTE
  ('CC','2',true,1),('CC','3',true,2),('CC','4',true,3),('CC','6',true,4),
  ('CC','8',true,5),('CC','10',true,6),('CC','12',true,7),('CC','14',true,8),
  ('CC','16',true,9),('CC','1',false,10),
  -- PANTALON
  ('P','4',true,1),('P','6',true,2),('P','7',true,3),('P','8',true,4),
  ('P','10',true,5),('P','11',true,6),('P','12',true,7),('P','14',true,8),
  ('P','15',true,9),('P','16',true,10),('P','17',true,11),('P','19',true,12),
  ('P','20',true,13),('P','22',true,14),('P','24',true,15),('P','25',true,16),
  ('P','26',true,17),('P','28',true,18),('P','30',true,19),('P','32',true,20),
  ('P','ES',true,21),
  -- PANTALON_BEIGE
  ('PB','12',true,1),('PB','14',true,2),('PB','15',true,3),('PB','16',true,4),
  ('PB','17',true,5),('PB','19',true,6),('PB','20',true,7),('PB','22',true,8),
  ('PB','24',true,9),('PB','25',true,10),('PB','26',true,11),('PB','28',true,12),
  ('PB','30',true,13),('PB','ES',true,14),('PB','32',false,15),
  -- SHORT
  ('S','3',true,1),('S','4',true,2),('S','6',true,3),('S','8',true,4),
  ('S','10',true,5),('S','12',true,6),('S','14',true,7),('S','16',true,8),
  ('S','ES',true,9),
  -- FALDA
  ('F','4',true,1),('F','6',true,2),('F','7',true,3),('F','8',true,4),
  ('F','10',true,5),('F','12',true,6),('F','14',true,7),('F','16',true,8),
  ('F','17',true,9),('F','18',true,10),('F','20',true,11),('F','22',true,12),
  ('F','23',true,13),('F','24',true,14),('F','25',true,15),('F','26',true,16),
  ('F','28',true,17),('F','30',true,18),('F','ES',true,19),
  -- FALDA_BEIGE
  ('FB','7',true,1),('FB','8',true,2),('FB','10',true,3),('FB','12',true,4),
  ('FB','14',true,5),('FB','16',true,6),('FB','17',true,7),('FB','18',true,8),
  ('FB','20',true,9),('FB','22',true,10),('FB','23',true,11),('FB','24',true,12),
  ('FB','25',true,13),('FB','26',true,14),('FB','28',true,15),('FB','30',true,16),
  ('FB','32',true,17),('FB','ES',true,18),
  -- FALDA_C.E
  ('FCE','3',true,1),('FCE','4',true,2),('FCE','6',true,3),('FCE','7',true,4),
  ('FCE','8',true,5),('FCE','10',true,6),('FCE','12',true,7),('FCE','14',true,8),
  ('FCE','16',true,9),('FCE','ES',true,10),('FCE','17',false,11)
)
INSERT INTO public.prenda_talla (prenda_id, talla, es_estandar, orden)
SELECT p.id, d.talla, d.es_estandar, d.orden
FROM datos d JOIN public.prenda p ON p.codigo = d.codigo
ON CONFLICT (prenda_id, talla) DO UPDATE
  SET es_estandar = EXCLUDED.es_estandar,
      orden       = EXCLUDED.orden;

-- ---------------------------------------------------------------------
-- 4) Largos curados
-- ---------------------------------------------------------------------

WITH datos(codigo, largo, es_estandar, orden) AS (VALUES
  ('C','+4dA',true,1),('C','-3L',true,2),('C','-5L',true,3),
  ('C','+3L',true,4),('C','+5L',true,5),('C','+2B',true,6),
  ('B','-3L',true,1),('B','-5L',true,2),('B','+3L',true,3),
  ('B','+5L',true,4),('B','+2B',true,5),
  ('CC','-3L',true,1),('CC','-5L',true,2),('CC','+3L',true,3),('CC','+5L',true,4),
  ('P','60',true,1),('P','65',true,2),('P','65X',true,3),('P','70',true,4),
  ('P','75',true,5),('P','80',true,6),('P','85',true,7),('P','90',true,8),
  ('P','95',true,9),('P','100',true,10),('P','105',true,11),('P','110',true,12),
  ('P','ES',true,13),('P','40',false,14),
  ('PB','90',true,1),('PB','95',true,2),('PB','100',true,3),('PB','105',true,4),
  ('PB','110',true,5),('PB','ES',true,6),
  ('F','35',true,1),('F','40',true,2),('F','45',true,3),('F','50',true,4),
  ('F','55',true,5),('F','58',true,6),('F','60',true,7),('F','65',true,8),
  ('F','ES',true,9),('F','90',false,10),('F','95',false,11),
  ('FB','45',true,1),('FB','50',true,2),('FB','55',true,3),('FB','58',true,4),
  ('FB','60',true,5),('FB','65',true,6),('FB','70',true,7),('FB','ES',true,8),
  ('FCE','25',true,1),('FCE','30',true,2),('FCE','35',true,3),('FCE','40',true,4),
  ('FCE','45',true,5),('FCE','50',true,6),('FCE','ES',true,7),('FCE','55',false,8)
)
INSERT INTO public.prenda_largo (prenda_id, largo, es_estandar, orden)
SELECT p.id, d.largo, d.es_estandar, d.orden
FROM datos d JOIN public.prenda p ON p.codigo = d.codigo
ON CONFLICT (prenda_id, largo) DO UPDATE
  SET es_estandar = EXCLUDED.es_estandar,
      orden       = EXCLUDED.orden;

-- ---------------------------------------------------------------------
-- 5) Detalles curados (cintura/cadera para FALDA y FALDA_BEIGE)
-- ---------------------------------------------------------------------

WITH datos(codigo, detalle, es_estandar) AS (VALUES
  ('B','NA',false),
  ('F','CAD.14',true),('F','CINT.7',true),('F','CINT.8',true),('F','CINT.10',true),
  ('F','CINT.12',true),('F','CINT.14',true),('F','CINT.16',true),('F','CINT.17',true),
  ('F','CINT.18',true),('F','CINT.20',true),('F','CINT.22',true),('F','CINT.23',true),
  ('F','CINT.24',true),('F','CINT.25',true),
  ('FB','CINT.6',true),('FB','CINT.7',true),('FB','CINT.8',true),('FB','CINT.10',true),
  ('FB','CINT.12',true),('FB','CINT.14',true),('FB','CINT.16',true),('FB','CINT.17',true),
  ('FB','CINT.18',true),('FB','CINT.20',true),('FB','CINT.22',true),('FB','CINT.23',true),
  ('FB','CINT.24',true),('FB','CINT.25',true),('FB','CINT.26',true)
)
INSERT INTO public.prenda_detalle (prenda_id, detalle, es_estandar)
SELECT p.id, d.detalle, d.es_estandar
FROM datos d JOIN public.prenda p ON p.codigo = d.codigo
ON CONFLICT (prenda_id, detalle) DO UPDATE
  SET es_estandar = EXCLUDED.es_estandar;

-- ---------------------------------------------------------------------
-- 6) Matriz histórica (talla, largo) — derivada de BASE histórico
--    es_estandar=true cuando además aparece en AUX curado.
-- ---------------------------------------------------------------------

WITH datos(codigo, talla, largo, es_estandar) AS (VALUES
  ('C', '10', '+3L', true),
  ('C', '12', '-3L', true),
  ('C', '14', '-3L', true),
  ('C', '14', '-5L', true),
  ('C', '14', '+3L', true),
  ('C', '16', '-3L', true),
  ('C', '16', '-5L', true),
  ('C', '16', '+4dA', true),
  ('C', '17', '-3L', true),
  ('C', '17', '+3L', true),
  ('C', '20', '-3L', true),
  ('C', '22', '-3L', true),
  ('C', '22', '-5L', true),
  ('B', '10', '+5L', true),
  ('B', '12', '-3L', true),
  ('B', '14', '-3L', true),
  ('B', '16', '-3L', true),
  ('B', '16', '-5L', true),
  ('B', '17', '-3L', true),
  ('B', '17', '-5L', true),
  ('B', '20', '-3L', true),
  ('B', '20', '-5L', true),
  ('B', '20', '+2B', true),
  ('B', '8',  '-3L', true),
  ('CC','8',  '-3L', true),
  ('P', '10', '65', true),  ('P', '10', '70', true),  ('P', '10', '75', true),
  ('P', '10', '80', true),  ('P', '10', '85', true),  ('P', '10', '90', true),
  ('P', '11', '65', true),  ('P', '11', '70', true),  ('P', '11', '75', true),
  ('P', '11', '80', true),  ('P', '11', '85', true),  ('P', '11', '90', true),
  ('P', '12', '40', false), ('P', '12', '60', true),  ('P', '12', '65', true),
  ('P', '12', '70', true),  ('P', '12', '75', true),  ('P', '12', '80', true),
  ('P', '12', '85', true),  ('P', '12', '90', true),  ('P', '12', '95', true),
  ('P', '12', '100', true),
  ('P', '14', '65', true),  ('P', '14', '70', true),  ('P', '14', '75', true),
  ('P', '14', '80', true),  ('P', '14', '85', true),  ('P', '14', '90', true),
  ('P', '14', '95', true),  ('P', '14', '100', true),
  ('P', '15', '70', true),  ('P', '15', '75', true),  ('P', '15', '80', true),
  ('P', '15', '85', true),  ('P', '15', '90', true),  ('P', '15', '95', true),
  ('P', '15', '100', true),
  ('P', '16', '70', true),  ('P', '16', '75', true),  ('P', '16', '80', true),
  ('P', '16', '85', true),  ('P', '16', '90', true),  ('P', '16', '95', true),
  ('P', '16', '100', true), ('P', '16', '105', true),
  ('P', '17', '75', true),  ('P', '17', '80', true),  ('P', '17', '85', true),
  ('P', '17', '90', true),  ('P', '17', '95', true),  ('P', '17', '100', true),
  ('P', '19', '75', true),  ('P', '19', '80', true),  ('P', '19', '85', true),
  ('P', '19', '90', true),  ('P', '19', '95', true),  ('P', '19', '100', true),
  ('P', '19', '105', true),
  ('P', '20', '75', true),  ('P', '20', '80', true),  ('P', '20', '85', true),
  ('P', '20', '90', true),  ('P', '20', '95', true),  ('P', '20', '100', true),
  ('P', '20', '105', true),
  ('P', '22', '75', true),  ('P', '22', '80', true),  ('P', '22', '85', true),
  ('P', '22', '90', true),  ('P', '22', '95', true),  ('P', '22', '100', true),
  ('P', '22', '105', true),
  ('P', '24', '75', true),  ('P', '24', '80', true),  ('P', '24', '85', true),
  ('P', '24', '90', true),  ('P', '24', '95', true),  ('P', '24', '100', true),
  ('P', '24', '105', true), ('P', '24', '110', true),
  ('P', '25', '90', true),  ('P', '25', '95', true),  ('P', '25', '100', true),
  ('P', '25', '105', true),
  ('P', '26', '85', true),  ('P', '26', '90', true),  ('P', '26', '95', true),
  ('P', '26', '100', true), ('P', '26', '105', true),
  ('P', '28', '95', true),  ('P', '28', '100', true), ('P', '28', '105', true),
  ('P', '30', '100', true),
  ('P', '32', '100', true), ('P', '32', '105', true), ('P', '32', '110', true),
  ('P', '4',  '60', true),  ('P', '4',  '65', true),
  ('P', '6',  '60', true),  ('P', '6',  '65', true),  ('P', '6',  '70', true),
  ('P', '6',  '75', true),  ('P', '6',  '80', true),
  ('P', '7',  '65', true),  ('P', '7',  '70', true),  ('P', '7',  '75', true),
  ('P', '7',  '80', true),
  ('P', '8',  '60', true),  ('P', '8',  '65', true),  ('P', '8',  '70', true),
  ('P', '8',  '75', true),  ('P', '8',  '80', true),  ('P', '8',  '85', true),
  ('PB','14','90', true),  ('PB','14','95', true),  ('PB','14','100',true),
  ('PB','15','90', true),  ('PB','15','95', true),  ('PB','15','100',true),
  ('PB','15','105',true),
  ('PB','16','90', true),  ('PB','16','95', true),  ('PB','16','100',true),
  ('PB','16','105',true),
  ('PB','17','90', true),  ('PB','17','95', true),  ('PB','17','100',true),
  ('PB','17','105',true),
  ('PB','19','90', true),  ('PB','19','95', true),  ('PB','19','100',true),
  ('PB','19','105',true),
  ('PB','20','90', true),  ('PB','20','95', true),  ('PB','20','100',true),
  ('PB','20','105',true),
  ('PB','22','95', true),  ('PB','22','100',true),  ('PB','22','105',true),
  ('PB','24','90', true),  ('PB','24','95', true),  ('PB','24','100',true),
  ('PB','24','105',true),
  ('PB','25','95', true),  ('PB','25','100',true),  ('PB','25','105',true),
  ('PB','26','95', true),  ('PB','26','100',true),  ('PB','26','105',true),
  ('PB','28','90', true),  ('PB','28','95', true),  ('PB','28','100',true),
  ('PB','28','105',true),
  ('PB','30','100',true),
  ('PB','32','95', false), ('PB','32','100',false),
  ('F','6','35',true),('F','6','40',true),('F','6','45',true),('F','6','50',true),
  ('F','7','35',true),('F','7','40',true),('F','7','45',true),('F','7','50',true),('F','7','55',true),
  ('F','8','35',true),('F','8','40',true),('F','8','45',true),('F','8','50',true),('F','8','55',true),
  ('F','10','40',true),('F','10','45',true),('F','10','50',true),('F','10','55',true),('F','10','60',true),
  ('F','12','40',true),('F','12','45',true),('F','12','50',true),('F','12','55',true),('F','12','60',true),
  ('F','14','40',true),('F','14','45',true),('F','14','50',true),('F','14','55',true),('F','14','60',true),
  ('F','16','40',true),('F','16','45',true),('F','16','50',true),('F','16','55',true),('F','16','60',true),('F','16','90',false),
  ('F','17','45',true),('F','17','50',true),('F','17','55',true),('F','17','60',true),('F','17','65',true),
  ('F','18','45',true),('F','18','50',true),('F','18','55',true),('F','18','60',true),
  ('F','20','45',true),('F','20','50',true),('F','20','55',true),('F','20','60',true),
  ('F','22','50',true),('F','22','55',true),('F','22','60',true),
  ('F','23','50',true),('F','23','55',true),('F','23','60',true),
  ('F','24','55',true),('F','24','60',true),
  ('F','25','50',true),('F','25','55',true),('F','25','60',true),('F','25','95',false),
  ('F','26','55',true),('F','26','60',true),
  ('FB','8','50',true),
  ('FB','10','50',true),('FB','10','55',true),('FB','10','60',true),
  ('FB','12','50',true),('FB','12','55',true),('FB','12','60',true),
  ('FB','14','50',true),('FB','14','55',true),('FB','14','60',true),
  ('FB','16','50',true),('FB','16','55',true),('FB','16','60',true),
  ('FB','17','50',true),('FB','17','55',true),('FB','17','60',true),
  ('FB','18','50',true),('FB','18','55',true),('FB','18','60',true),
  ('FB','20','50',true),('FB','20','55',true),('FB','20','60',true),
  ('FB','22','50',true),('FB','22','55',true),('FB','22','60',true),
  ('FB','23','50',true),('FB','23','55',true),('FB','23','65',true),
  ('FB','24','55',true),('FB','24','60',true),
  ('FB','25','55',true),('FB','25','60',true),
  ('FB','26','55',true),('FB','26','60',true),
  ('FB','30','60',true),
  ('FB','32','60',true),
  ('FCE','3','30',true),('FCE','3','35',true),
  ('FCE','4','30',true),('FCE','4','35',true),('FCE','4','40',true),
  ('FCE','6','30',true),('FCE','6','35',true),('FCE','6','40',true),
  ('FCE','7','35',true),('FCE','7','40',true),
  ('FCE','8','35',true),('FCE','8','40',true),('FCE','8','45',true),
  ('FCE','10','35',true),('FCE','10','40',true),('FCE','10','45',true),
  ('FCE','12','50',true),
  ('FCE','14','40',true),('FCE','14','45',true),('FCE','14','55',false),
  ('FCE','16','45',true),
  ('FCE','17','55',false)
)
INSERT INTO public.prenda_talla_largo (prenda_id, talla, largo, es_estandar)
SELECT p.id, d.talla, d.largo, d.es_estandar
FROM datos d JOIN public.prenda p ON p.codigo = d.codigo
ON CONFLICT (prenda_id, talla, largo) DO UPDATE
  SET es_estandar = EXCLUDED.es_estandar;

-- ---------------------------------------------------------------------
-- 7) Marcar alumnos con combinaciones fuera del catálogo curado
-- ---------------------------------------------------------------------

WITH keys_estandar AS (
  SELECT p.nombre AS prenda, p.codigo || pt.talla AS k
    FROM public.prenda p JOIN public.prenda_talla pt ON pt.prenda_id = p.id
   WHERE pt.es_estandar
  UNION
  SELECT p.nombre, p.codigo || ptl.talla || ptl.largo
    FROM public.prenda p JOIN public.prenda_talla_largo ptl ON ptl.prenda_id = p.id
   WHERE ptl.es_estandar
  UNION
  SELECT p.nombre, p.codigo || pt.talla || pl.largo
    FROM public.prenda p
    JOIN public.prenda_talla pt ON pt.prenda_id = p.id
    JOIN public.prenda_largo pl ON pl.prenda_id = p.id
   WHERE pt.es_estandar AND pl.es_estandar
  UNION
  SELECT p.nombre, p.codigo || ptl.talla || ptl.largo || pd.detalle
    FROM public.prenda p
    JOIN public.prenda_talla_largo ptl ON ptl.prenda_id = p.id
    JOIN public.prenda_detalle pd ON pd.prenda_id = p.id
   WHERE ptl.es_estandar AND pd.es_estandar
)
UPDATE public.alumno a SET tiene_talla_no_estandar = true
WHERE
  (a.talla_top_key IS NOT NULL AND a.prenda_top IS NOT NULL AND
   NOT EXISTS (SELECT 1 FROM keys_estandar k
                WHERE k.prenda = a.prenda_top AND k.k = a.talla_top_key))
  OR
  (a.talla_bottom_key IS NOT NULL AND a.prenda_bottom IS NOT NULL AND
   NOT EXISTS (SELECT 1 FROM keys_estandar k
                WHERE k.prenda = a.prenda_bottom AND k.k = a.talla_bottom_key));

COMMIT;

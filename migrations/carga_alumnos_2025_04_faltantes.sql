-- PARTE 4/3: Alumnos 2025 faltantes (62 huérfanos sin columna 'Centro' en BASE_2025_2do_Uniforme.xlsm)
-- Detalle: 60 SALOMON (PARV) + 2 ALBERTOGUERRA (BASICA 8A)
-- Idempotente: borra primero los 62 por nombre+escuela y los reinserta.
-- Requisito: PARTES 1, 2 y 3 ya aplicadas

BEGIN;

-- Limpieza previa (por si se corrió antes)
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='HERNANDEZ JACO, JIMENA MONSERRAT';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='MESQUITA OSORIO, DAYANA STEFANY';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='SHENTE SAMBRANO, JOHANA ELIZABETH';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='AREVALO CAMPOS, JAZLYN VERONICA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='BLANCO GUIRAO, SOFIA MARGARITA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='GARCIA MENJIVAR, ANA SOFIA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='GUARDADO SOLORZANO, AMANDA CRISTEL';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='IRAHETA CHICAL, IRMA YANIRA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='MARTINEZ RIVAS, JIMENA ALEXANDRA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='ANAYA FLORES, AINHOA VALERIA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='CHUNCO PEREZ, KELSY GABRIELA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='LOPEZ CAMPOS, ESTER VALENTINA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='CHINQUE LOPEZ, MARIAN YELIZ';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='LUE TUNACA, VALERIA MONTSERRAT';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='SHENTE GOMEZ, HASSEL VICTORIA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='VENTURA OSEGUEDA, KARINA BEATRIZ';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='GOMEZ PEREZ, ALEJANDRA GABRIELA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='MAYE RODRIGUEZ, NATHALY YAMILETH';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='ALVARADO MUÑOZ, STEFANY ELIZABETH';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='BARRIENTOS TESHE, SARAI ABIGAIL';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='MARTINEZ CHANICO, SARA ELIZABETH';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='SAAVEDRA VASQUEZ, ESTEFANI YOLANDA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='ZUNIGA CRUZ, GISELA PAMELA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='AQUINO GOMEZ, HEYSSELL JAZMIN';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='GUILLEN BONILLA, ANGELA SUGEY';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='FERNANDEZ FLORES, JOSUE CALEB';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='TEPAS GARCIA, MOISES ALEXANDER';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='JACINTO SALAZAR, DULCE MARIA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='MARTINEZ RAMIREZ, GENESIS CAMILA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='MENDOZA HERNANDEZ, MAYERLI FERNANDA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='PARADA DURAN, NATHALIA ABIGAIL';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='RIOS BARRIENTOS, ROCIO ALEXANDRA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='AREVALO TEPAS, HEYDI ELIZABETH';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='PEREZ GARCIA, FATIMA ALEXANDRA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='Ramirez Chue, Estefani Valeria';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='SANCHEZ GALICIA, ADRIANA MICHEL';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='SARCEÑO HERNANDEZ, ANA SUJEY';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='TEPATA VASQUEZ, GENESIS ZENAYDA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='ZUNIGA CACERES, DANIELA GUADALUPE';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='CAMPOS GUTIERREZ, MELANIE BRISEYDA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='GUTIERREZ PINTO, DAYLIN ISAMAR';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='VASQUEZ ZUNIGA, KENIA MARISOL';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='CISNEROS PERAZA, KEYLA ALEJANDRA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='HERRERA ORELLANA, JAILYNE ALEXANDRA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='FUENTES ALVARADO, DILCYA MELANY';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='ESCOBAR HERNANDEZ, DYLAN ALEXANDER';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='GOMEZ DOMINGUEZ, JEFFERSON ALEXIS';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='GOMEZ SARAVIA, MATIAS JOSE';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='MOLINA MATA, MOISES DE JESUS';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='MORAN SALES, ANDERSON EDENILSON';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='PINTE HERNANDEZ, ALFREDO ISAAC';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='CORDOVA ESQUINA, TERESA VALENTINA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='CORTEZ GARCIA, ARIANA MAGDALENA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='CALVO CALVO, ARTURO BENJAMIN';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='CAMPOS CERRATO, NERY ANTONIO';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='PATIÑO RIVERA, KEVIN FRANCISCO';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='PUSHAGUA RODRIGUEZ, ESTEBAN MAURICIO';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='TINO MARTINEZ, JOSUE ALBERTO';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='PINTO CORTEZ, ALYSON ANTONELLA';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10634') AND nombre='HERNANDEZ SHENTE, LIAM GAEL';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10573') AND nombre='ALCANTARA MARTINEZ, DARLENE YAMILETH';
DELETE FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025') AND escuela_id=(SELECT id FROM escuela WHERE codigo_cde='10573') AND nombre='MURCIA MURCIA, KAREN DANIELA';

INSERT INTO alumno (
  temporada_id, escuela_id, nombre, grado, nivel, ciclo, sexo,
  prenda_top, talla_top_key, estado_top,
  prenda_bottom, talla_bottom_key, estado_bottom,
  activo
) VALUES
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'HERNANDEZ JACO, JIMENA MONSERRAT', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C4', 'pendiente', 'FALDA_C.E', 'FCE330', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'MESQUITA OSORIO, DAYANA STEFANY', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C4', 'pendiente', 'FALDA_C.E', 'FCE330', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'SHENTE SAMBRANO, JOHANA ELIZABETH', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C3', 'pendiente', 'FALDA_C.E', 'FCE430', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'AREVALO CAMPOS, JAZLYN VERONICA', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C4', 'pendiente', 'FALDA_C.E', 'FCE435', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'BLANCO GUIRAO, SOFIA MARGARITA', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C4', 'pendiente', 'FALDA_C.E', 'FCE435', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'GARCIA MENJIVAR, ANA SOFIA', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C4', 'pendiente', 'FALDA_C.E', 'FCE435', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'GUARDADO SOLORZANO, AMANDA CRISTEL', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C4', 'pendiente', 'FALDA_C.E', 'FCE435', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'IRAHETA CHICAL, IRMA YANIRA', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE435', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'MARTINEZ RIVAS, JIMENA ALEXANDRA', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C4', 'pendiente', 'FALDA_C.E', 'FCE435', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'ANAYA FLORES, AINHOA VALERIA', 'P5A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE435', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'CHUNCO PEREZ, KELSY GABRIELA', 'P5A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE435', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'LOPEZ CAMPOS, ESTER VALENTINA', 'P5A', 'PARV', 0, 'F', 'CAMISA', 'C4', 'pendiente', 'FALDA_C.E', 'FCE435', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'CHINQUE LOPEZ, MARIAN YELIZ', 'P5B', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE435', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'LUE TUNACA, VALERIA MONTSERRAT', 'P5B', 'PARV', 0, 'F', 'CAMISA', 'C4', 'pendiente', 'FALDA_C.E', 'FCE435', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'SHENTE GOMEZ, HASSEL VICTORIA', 'P5B', 'PARV', 0, 'F', 'CAMISA', 'C4', 'pendiente', 'FALDA_C.E', 'FCE435', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'VENTURA OSEGUEDA, KARINA BEATRIZ', 'P5B', 'PARV', 0, 'F', 'CAMISA', 'C4', 'pendiente', 'FALDA_C.E', 'FCE440', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'GOMEZ PEREZ, ALEJANDRA GABRIELA', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE630', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'MAYE RODRIGUEZ, NATHALY YAMILETH', 'P5A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE630', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'ALVARADO MUÑOZ, STEFANY ELIZABETH', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C4', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'BARRIENTOS TESHE, SARAI ABIGAIL', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'MARTINEZ CHANICO, SARA ELIZABETH', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'SAAVEDRA VASQUEZ, ESTEFANI YOLANDA', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'ZUNIGA CRUZ, GISELA PAMELA', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'AQUINO GOMEZ, HEYSSELL JAZMIN', 'P5A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'GUILLEN BONILLA, ANGELA SUGEY', 'P5A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'FERNANDEZ FLORES, JOSUE CALEB', 'P4A', 'PARV', 0, 'M', 'CAMISA', 'C6', 'pendiente', 'PANTALON', 'P4', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'TEPAS GARCIA, MOISES ALEXANDER', 'P4A', 'PARV', 0, 'M', 'CAMISA', 'C4', 'pendiente', 'PANTALON', 'P4', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'JACINTO SALAZAR, DULCE MARIA', 'P5A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'MARTINEZ RAMIREZ, GENESIS CAMILA', 'P5A', 'PARV', 0, 'F', 'CAMISA', 'C4', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'MENDOZA HERNANDEZ, MAYERLI FERNANDA', 'P5A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'PARADA DURAN, NATHALIA ABIGAIL', 'P5A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'RIOS BARRIENTOS, ROCIO ALEXANDRA', 'P5A', 'PARV', 0, 'F', 'CAMISA', 'C8', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'AREVALO TEPAS, HEYDI ELIZABETH', 'P5B', 'PARV', 0, 'F', 'CAMISA', 'C4', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'PEREZ GARCIA, FATIMA ALEXANDRA', 'P5B', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'Ramirez Chue, Estefani Valeria', 'P5B', 'PARV', 0, 'F', 'CAMISA', 'C4', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'SANCHEZ GALICIA, ADRIANA MICHEL', 'P5B', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'SARCEÑO HERNANDEZ, ANA SUJEY', 'P5B', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'TEPATA VASQUEZ, GENESIS ZENAYDA', 'P5B', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'ZUNIGA CACERES, DANIELA GUADALUPE', 'P5B', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE635', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'CAMPOS GUTIERREZ, MELANIE BRISEYDA', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE640', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'GUTIERREZ PINTO, DAYLIN ISAMAR', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C8', 'pendiente', 'FALDA_C.E', 'FCE640', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'VASQUEZ ZUNIGA, KENIA MARISOL', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE640', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'CISNEROS PERAZA, KEYLA ALEJANDRA', 'P5A', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE640', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'HERRERA ORELLANA, JAILYNE ALEXANDRA', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C8', 'pendiente', 'FALDA_C.E', 'FCE735', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'FUENTES ALVARADO, DILCYA MELANY', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C8', 'pendiente', 'FALDA_C.E', 'FCE740', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'ESCOBAR HERNANDEZ, DYLAN ALEXANDER', 'P4A', 'PARV', 0, 'M', 'CAMISA', 'C6', 'pendiente', 'PANTALON', 'P6', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'GOMEZ DOMINGUEZ, JEFFERSON ALEXIS', 'P4A', 'PARV', 0, 'M', 'CAMISA', 'C4', 'pendiente', 'PANTALON', 'P6', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'GOMEZ SARAVIA, MATIAS JOSE', 'P4A', 'PARV', 0, 'M', 'CAMISA', 'C6', 'pendiente', 'PANTALON', 'P6', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'MOLINA MATA, MOISES DE JESUS', 'P4A', 'PARV', 0, 'M', 'CAMISA', 'C6', 'pendiente', 'PANTALON', 'P6', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'MORAN SALES, ANDERSON EDENILSON', 'P4A', 'PARV', 0, 'M', 'CAMISA', 'C6', 'pendiente', 'PANTALON', 'P6', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'PINTE HERNANDEZ, ALFREDO ISAAC', 'P4A', 'PARV', 0, 'M', 'CAMISA', 'C6', 'pendiente', 'PANTALON', 'P6', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'CORDOVA ESQUINA, TERESA VALENTINA', 'P5B', 'PARV', 0, 'F', 'CAMISA', 'C6', 'pendiente', 'FALDA_C.E', 'FCE835', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'CORTEZ GARCIA, ARIANA MAGDALENA', 'P5A', 'PARV', 0, 'F', 'CAMISA', 'C8', 'pendiente', 'FALDA_C.E', 'FCE840', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'CALVO CALVO, ARTURO BENJAMIN', 'P4A', 'PARV', 0, 'M', 'CAMISA', 'C8', 'pendiente', 'PANTALON', 'P8', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'CAMPOS CERRATO, NERY ANTONIO', 'P4A', 'PARV', 0, 'M', 'CAMISA', 'C8', 'pendiente', 'PANTALON', 'P8', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'PATIÑO RIVERA, KEVIN FRANCISCO', 'P4A', 'PARV', 0, 'M', 'CAMISA', 'C6', 'pendiente', 'PANTALON', 'P8', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'PUSHAGUA RODRIGUEZ, ESTEBAN MAURICIO', 'P4A', 'PARV', 0, 'M', 'CAMISA', 'C6', 'pendiente', 'PANTALON', 'P8', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'TINO MARTINEZ, JOSUE ALBERTO', 'P4A', 'PARV', 0, 'M', 'CAMISA', 'C6', 'pendiente', 'PANTALON', 'P8', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'PINTO CORTEZ, ALYSON ANTONELLA', 'P4A', 'PARV', 0, 'F', 'CAMISA', 'C8', 'pendiente', 'FALDA_C.E', 'FCE1040', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10634'), 'HERNANDEZ SHENTE, LIAM GAEL', 'P5B', 'PARV', 0, 'M', 'CAMISA', 'C12-3L', 'pendiente', 'PANTALON', 'P1240', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10573'), 'ALCANTARA MARTINEZ, DARLENE YAMILETH', '8A', 'BASICA', 3, 'F', 'CAMISA', 'C16', 'pendiente', 'FALDA_C.E', 'FCE1455', 'pendiente', FALSE),
  ((SELECT id FROM temporada WHERE codigo='2025'), (SELECT id FROM escuela WHERE codigo_cde='10573'), 'MURCIA MURCIA, KAREN DANIELA', '8A', 'BASICA', 3, 'F', 'CAMISA', 'C16', 'pendiente', 'FALDA_C.E', 'FCE1755', 'pendiente', FALSE);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verificación
SELECT 'Total alumnos 2025: ' || COUNT(*) FROM alumno WHERE temporada_id=(SELECT id FROM temporada WHERE codigo='2025');

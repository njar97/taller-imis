-- PARTE 1/3: Temporada 2025 + 16 escuelas + limpieza previa
-- Correr ANTES de parte 2 y parte 3

-- ════════════════════════════════════════════════════════════════════
-- Carga histórica: Temporada 2025 + 16 escuelas + 6,423 alumnos reales
-- Desde BASE_2025_2do_Uniforme.xlsm
-- Requisito: v3.12 aplicada
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. TEMPORADA 2025 (cerrada)
INSERT INTO temporada (codigo, nombre, anio, estado, observaciones)
VALUES ('2025', 'Temporada 2025', 2025, 'cerrada', 'Contrato ME-03/2025 completado')
ON CONFLICT (codigo) DO UPDATE SET estado = 'cerrada';

-- 2. ESCUELAS 2025 (algunas pueden existir ya del contrato 2026)
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('10627', 'CDE CE CANTON CUYAGUALO', 'CUYAGUALO', 'JOSE ADALVERTO SANCHEZ LOPEZ', 'IZALCO', 'SONSONATE ESTE', 'CANTON CUYAGUALO', 'Q99C+7Q6, cantón, Cuyagualo', '75589870', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('10573', 'CDE CE ALBERTO GUERRA TRIGUEROS', 'ALBERTOGUERRA', 'VICTOR RIGOBERTO MENDOZA JUAREZ', 'ARMENIA', 'SONSONATE ESTE', '3A. AV. SUR N°10, BARRIO NUEVO', 'PFVW+FRR, primera av sur cuarta call pon, Armenia', '24511117-75107551', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('10570', 'CDE ESCUELA DE EDUCACIÓN PARVULARIA "DE ACAJUTLA"', 'PARV.ACAJUTLA', 'GLORIA MARIBEL GUARDADO DE COLETO', 'ACAJUTLA', 'SONSONATE OESTE', 'CALZADA PRINCIPAL CONTIGUA A BOMBAS DE ANDA', 'H5R8+HMP, Acajutla', '70432524', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('64101', 'CDE CENTRO ESCOLAR CASERÍO AGUA ESCONDIDA, CANTÓN LAS TABLAS', 'AGUAESCONDIDA', 'VICTOR MANUEL LUE PATRIZ', 'SONSONATE', 'SONSONATE CENTRO', 'CASERIO AGUA ESCONDIDA, LAS TABLAS, SONSONATE', 'M6J5+X39, Las Tablas', '68229720', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('10548', 'CDE COED DE "FE Y ALEGRIA COLONIA LOS LAURELES"', 'LAURELES', 'JOSE ANTONIO CASTRO LINARES', 'ACAJUTLA', 'SONSONATE OESTE', 'COLONIA LOS LAURELES', NULL, '78444421', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('10590', 'CDE CE FRANCISCO JOSE BARRIENTOS', 'JOSEBARRIENTOS', 'MARCELA BEATRIZ ALVARADO DELGADO', 'CALUCO', 'SONSONATE OESTE', 'CANTON SUQUIAT', 'P83R+37 Caluco', '79106073', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('64123', 'CDE CE CASERIO SAN CRISTOBAL, CANTON MIRAVALLES', 'SANCRISTOBAL', 'NELLY DEL CARMEN CABALLERO DE LOPEZ', 'SONSONATE', 'SONSONATE CENTRO', 'CASERIO SAN CRISTOBAL, CANTON MIRAVALLES', 'J6FH+X45, Colonia Arqumedes Herrera', '64243502', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('64001', 'CDE CE CASERIO COLONIA NUEVA SANTAMARTA, CANTON SAN JULIAN', 'NUEVA.STAMARTA', 'JOSE OMAR LEIVA MENJIVAR', 'ACAJUTLA', 'SONSONATE OESTE', 'CASERIO COLONIA NUEVA SANTA MARTA, SAN JULIAN', 'J6G5+HRJ, San Julián', '61503140', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('64103', 'CDE CE CASERIO HACIENDA SIHUANANGO, CANTON SANTA EMILIA', 'SIHUANANGO', 'CARLOS DANIEL VARGAS SALAZAR', 'SONSONATE', 'SONSONATE CENTRO', 'CASERIO HACIENDA SIHUANANGO', NULL, '71514283', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('64002', 'CDE CE CASERIO MIRAMAR, CANTON METALIO', 'MIRAMAR', 'VIOLETA DE JESUS RUIZ DE BOLAÑOS', 'ACAJUTLA', 'SONSONATE OESTE', 'CASERIO MIRAMAR, CANTON METALIO', 'M4MM+X5M, Caserío Miramar, Cantón Metálico, Acajutla', '72186535', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('10716', 'CDE INSTITUTO NACIONAL THOMAS JEFFERSON', 'JEFFERSON', 'OSWALDO ENRIQUE LARIN DELEON', 'SONSONATE', 'SONSONATE CENTRO', NULL, NULL, '79893303', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('10634', 'CDE COED "SALOMON DAVID GONZALEZ"', 'SALOMON', 'CARLOS BENJAMIN ESCOBAR GARRIZANO', 'SONSONATE', 'SONSONATE CENTRO', '2A. CALLE ORIENTE Y PASAJE ASUNCION, BARRIO ASUNCION', NULL, '79893303', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('10556', 'CDE CENTRO ESCOLAR "HACIENDA GRANDE, CANTON SAN JULIAN"', 'HDAGRANDE', 'GUADALUPE DEL CARMEN VILLALOBOS DE JOYA', 'ACAJUTLA', 'SONSONATE OESTE', 'CANTON SAN JULIAN', 'J6VG+4H Hacienda Santa Clara', '78135454', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('10561', 'CDE COED RENE ARMANDO ARCE SUAREZ', 'ARCE', 'JULIO CESAR ORTIZ FLORES', 'ACAJUTLA', 'SONSONATE OESTE', 'KM.88 CARRETERA A LA HACHADURA', 'J4QP+XG Metalío', '24125542-72215574', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('10041', 'CDE CE COLONIA SAN GENARO', 'SANGENARO', 'ROXANA ANGELITA CAMPOS FLORES', 'SONSONATE', 'SONSONATE CENTRO', '3A CALLE PONIENTE, LOTE N°24', 'P7JC+Q4V, Avenida No3, Sonsonate', '79862309', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);
INSERT INTO escuela (codigo_cde, nombre, alias, director, distrito, municipio, direccion, coordenadas, telefono, activa)
VALUES ('10566', 'CDE CE CASERIO EL MORA', 'ELMORA', 'PEDRO ANTONIO FLORES SANCHEZ', 'SONSONATE', 'SONSONATE OESTE', 'CASERIO EL MORA, CANTON METALIO', NULL, '76631650', TRUE)
ON CONFLICT (codigo_cde) DO UPDATE SET
  alias = COALESCE(escuela.alias, EXCLUDED.alias),
  director = COALESCE(escuela.director, EXCLUDED.director);

-- 3. Limpiar alumnos previos de temporada 2025 (idempotencia)
DELETE FROM alumno WHERE temporada_id = (SELECT id FROM temporada WHERE codigo = '2025');


COMMIT;

NOTIFY pgrst, 'reload schema';

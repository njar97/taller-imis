-- ════════════════════════════════════════════════════════════════════
-- TALLER IMIS · Migración v3.8
-- Fase 2: operarias + catálogo de operaciones + registro diario
-- ════════════════════════════════════════════════════════════════════
-- Requisito: v3.1..v3.7 aplicadas
-- Idempotente
-- ════════════════════════════════════════════════════════════════════

-- 1. TABLA: operaria ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operaria (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL UNIQUE,
  activo      BOOLEAN DEFAULT TRUE,
  creado_en   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE operaria DISABLE ROW LEVEL SECURITY;

-- Datos iniciales
INSERT INTO operaria (nombre) VALUES 
  ('Blanky'), ('Sandra'), ('Tere'), ('Paty'), ('Morena'),
  ('Imelda'), ('Nelson'), ('Javier')
ON CONFLICT (nombre) DO NOTHING;

-- 2. Ajustar produccion_registro_operacion para FK a operaria ────────
-- Si el campo existía como TEXT, lo reemplazamos por FK
DO $$
BEGIN
  -- Agregar operaria_id si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='produccion_registro_operacion' AND column_name='operaria_id'
  ) THEN
    ALTER TABLE produccion_registro_operacion
      ADD COLUMN operaria_id UUID REFERENCES operaria(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Poblar produccion_operacion con 50 etapas Fase 2 ────────────────
-- Camisa, Blusa, Camisa celeste comparten esquema (6 etapas)
-- Pantalón, Pantalón beige (6 etapas)
-- Falda, Falda beige, Falda C.E. (5 etapas)
-- Short (5 etapas)

-- Limpiar registros de tesis cargados parcialmente (si hubiera)
DELETE FROM produccion_operacion WHERE true;

-- Camisa (C)
INSERT INTO produccion_operacion (cod_prenda, codigo, nombre, orden, maquina, tiempo_estandar_min) VALUES
  ('C','preparacion','Preparación (canesú + pecheras)',1,'Recta / Overlock',2.75),
  ('C','ensamble','Ensamble cuerpo (hombros + cuello)',2,'Recta',4.75),
  ('C','mangas_costados','Mangas y costados',3,'Recta / Overlock',3.50),
  ('C','ruedos','Ruedos (bajo + cadera)',4,'Recta / Ruedera',3.25),
  ('C','ojal_boton','Ojal y botón',5,'Ojaleadora / Botonera',3.00),
  ('C','acabados','Acabados (inspección + planchado)',6,'Manual / Plancha',1.00);

-- Blusa (B) — mismo esquema que camisa
INSERT INTO produccion_operacion (cod_prenda, codigo, nombre, orden, maquina, tiempo_estandar_min) VALUES
  ('B','preparacion','Preparación (canesú + pecheras)',1,'Recta / Overlock',2.75),
  ('B','ensamble','Ensamble cuerpo (hombros + cuello)',2,'Recta',4.75),
  ('B','mangas_costados','Mangas y costados',3,'Recta / Overlock',3.50),
  ('B','ruedos','Ruedos (bajo + cadera)',4,'Recta / Ruedera',3.25),
  ('B','ojal_boton','Ojal y botón',5,'Ojaleadora / Botonera',3.00),
  ('B','acabados','Acabados (inspección + planchado)',6,'Manual / Plancha',1.00);

-- Camisa celeste (CC)
INSERT INTO produccion_operacion (cod_prenda, codigo, nombre, orden, maquina, tiempo_estandar_min) VALUES
  ('CC','preparacion','Preparación (canesú + pecheras)',1,'Recta / Overlock',2.75),
  ('CC','ensamble','Ensamble cuerpo (hombros + cuello)',2,'Recta',4.75),
  ('CC','mangas_costados','Mangas y costados',3,'Recta / Overlock',3.50),
  ('CC','ruedos','Ruedos (bajo + cadera)',4,'Recta / Ruedera',3.25),
  ('CC','ojal_boton','Ojal y botón',5,'Ojaleadora / Botonera',3.00),
  ('CC','acabados','Acabados (inspección + planchado)',6,'Manual / Plancha',1.00);

-- Pantalón (P)
INSERT INTO produccion_operacion (cod_prenda, codigo, nombre, orden, maquina, tiempo_estandar_min) VALUES
  ('P','preparacion_bolsas','Preparación bolsas (tiros + bolsa trasera)',1,'Overlock / Recta',8.00),
  ('P','cintura_bolsas_del','Cintura y bolsas delanteras',2,'Recta / Overlock',7.50),
  ('P','bragueta_zipper','Bragueta y zipper',3,'Overlock / Recta',4.50),
  ('P','cerrado_cuerpo','Cerrado cuerpo (entrepierna + costados + pretina)',4,'Overlock / Recta',12.00),
  ('P','portacinchos_ruedo','Porta cinchos y ruedo',5,'Collaretera / Ruedera',7.00),
  ('P','ojal_boton_acabados','Ojal, botón y acabados',6,'Ojaleadora / Botonera',4.50);

-- Pantalón beige (PB)
INSERT INTO produccion_operacion (cod_prenda, codigo, nombre, orden, maquina, tiempo_estandar_min) VALUES
  ('PB','preparacion_bolsas','Preparación bolsas (tiros + bolsa trasera)',1,'Overlock / Recta',8.00),
  ('PB','cintura_bolsas_del','Cintura y bolsas delanteras',2,'Recta / Overlock',7.50),
  ('PB','bragueta_zipper','Bragueta y zipper',3,'Overlock / Recta',4.50),
  ('PB','cerrado_cuerpo','Cerrado cuerpo (entrepierna + costados + pretina)',4,'Overlock / Recta',12.00),
  ('PB','portacinchos_ruedo','Porta cinchos y ruedo',5,'Collaretera / Ruedera',7.00),
  ('PB','ojal_boton_acabados','Ojal, botón y acabados',6,'Ojaleadora / Botonera',4.50);

-- Falda (F)
INSERT INTO produccion_operacion (cod_prenda, codigo, nombre, orden, maquina, tiempo_estandar_min) VALUES
  ('F','zipper_paleton','Zipper y paletón (pinzas)',1,'Recta',6.00),
  ('F','bolsa','Bolsa (sobrehilar + unir + decorar)',2,'Overlock / Recta',5.50),
  ('F','cerrado_pretina','Cerrado y pretina',3,'Overlock / Recta',6.00),
  ('F','ruedo','Ruedo',4,'Overlock / Ruedera',3.50),
  ('F','ojal_boton_acabados','Ojal, botón y acabados',5,'Ojaleadora / Botonera',2.00);

-- Falda beige (FB)
INSERT INTO produccion_operacion (cod_prenda, codigo, nombre, orden, maquina, tiempo_estandar_min) VALUES
  ('FB','zipper_paleton','Zipper y paletón (pinzas)',1,'Recta',6.00),
  ('FB','bolsa','Bolsa (sobrehilar + unir + decorar)',2,'Overlock / Recta',5.50),
  ('FB','cerrado_pretina','Cerrado y pretina',3,'Overlock / Recta',6.00),
  ('FB','ruedo','Ruedo',4,'Overlock / Ruedera',3.50),
  ('FB','ojal_boton_acabados','Ojal, botón y acabados',5,'Ojaleadora / Botonera',2.00);

-- Falda C.E. (FCE)
INSERT INTO produccion_operacion (cod_prenda, codigo, nombre, orden, maquina, tiempo_estandar_min) VALUES
  ('FCE','zipper_paleton','Zipper y paletón (pinzas)',1,'Recta',6.00),
  ('FCE','bolsa','Bolsa (sobrehilar + unir + decorar)',2,'Overlock / Recta',5.50),
  ('FCE','cerrado_pretina','Cerrado y pretina',3,'Overlock / Recta',6.00),
  ('FCE','ruedo','Ruedo',4,'Overlock / Ruedera',3.50),
  ('FCE','ojal_boton_acabados','Ojal, botón y acabados',5,'Ojaleadora / Botonera',2.00);

-- Short (S)
INSERT INTO produccion_operacion (cod_prenda, codigo, nombre, orden, maquina, tiempo_estandar_min) VALUES
  ('S','bolsas','Bolsas (sobrehilar + unir + decorar)',1,'Overlock / Recta',4.50),
  ('S','cerrado_cuerpo','Cerrado cuerpo (entrepierna + costados)',2,'Overlock',5.00),
  ('S','pretina_elastico','Pretina y elástico',3,'Recta',4.50),
  ('S','ruedo','Ruedo',4,'Overlock / Ruedera',2.50),
  ('S','acabados','Acabados (inspección + empaque)',5,'Manual',1.50);

-- 4. Vista: resumen de progreso por bulto (etapas completadas/total) ─
DROP VIEW IF EXISTS vw_produccion_progreso CASCADE;
CREATE VIEW vw_produccion_progreso AS
SELECT
  pb.id                                             AS produccion_bulto_id,
  ttm.cod_prenda,
  (SELECT COUNT(*) FROM produccion_operacion po 
   WHERE po.cod_prenda = ttm.cod_prenda AND po.activo = true)          AS total_operaciones,
  (SELECT COUNT(DISTINCT po.id) FROM produccion_registro_operacion pro
   JOIN produccion_operacion po ON po.id = pro.operacion_id
   WHERE pro.produccion_bulto_id = pb.id)                              AS operaciones_registradas
FROM produccion_bulto pb
JOIN tendido_rollo_salida trs   ON trs.id = pb.tendido_rollo_salida_id
JOIN tendido_talla_marcada ttm  ON ttm.id = trs.tendido_talla_marcada_id
WHERE pb.unido_a_id IS NULL;

-- ════════════════════════════════════════════════════════════════════
-- FIN v3.8
-- ════════════════════════════════════════════════════════════════════

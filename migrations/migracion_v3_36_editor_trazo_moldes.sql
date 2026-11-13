-- v3.36 — Editor de trazos dentro de la app + biblioteca de moldes escalados
-- Javier 12-nov-2026: «el artefacto (mover/girar piezas sobre la foto) que quede disponible para cada trazo
-- que se cargue, y cargado con las tallas que ya tenemos escaladas».
-- Requisito: v3.21 aplicada (fn_audit, current_user_role). Tablas nuevas: sin DROP previos.

-- Moldes de CORTE por prenda y talla (contorno en cm, centrado en 0,0; x = largo de la tela, y = ancho)
CREATE TABLE IF NOT EXISTS public.molde_pieza (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_prenda  text NOT NULL,          -- P pantalón · F falda · S short (mismo molde para azul y beige)
  talla       text NOT NULL,          -- '12', '14', '1X'… (talla 2026)
  pieza       text NOT NULL,          -- D, T, PR, BD, BT, TA, BR, BF, F-DEL, F-TRAS, F-PRET, S-DEL, S-TRAS, S-PRET, S-BOLSA
  nombre      text NOT NULL,          -- Delantero, Trasero, Pretina…
  contorno    jsonb NOT NULL,         -- [[x,y],…] cm
  ancho_cm    numeric, alto_cm numeric, area_cm2 numeric,
  por_prenda  integer NOT NULL DEFAULT 1,   -- cuántas lleva una prenda (en tendido en pares, la otra capa da la otra mano)
  giro_libre  boolean NOT NULL DEFAULT false, -- true = puede ir atravesada (pretina, tapadera); false = al hilo
  fuente      text,
  activo      boolean NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cod_prenda, talla, pieza)
);

-- Acomodo de un trazo: cada guardado es una versión nueva (historial)
CREATE TABLE IF NOT EXISTS public.trazo_layout (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trazo_id        uuid NOT NULL REFERENCES public.trazo(id) ON DELETE CASCADE,
  version         integer NOT NULL DEFAULT 1,
  ancho_cm        numeric NOT NULL DEFAULT 151,
  largo_cm        numeric,
  piezas          jsonb NOT NULL,     -- [{cod, talla, pieza, pts:[[x,y]…] locales, cx, cy, ang, fx, fy}]
  foto_fondo_url  text,               -- foto de la mesa enderezada (opcional)
  nota            text,
  creado_por      text DEFAULT (auth.jwt() ->> 'email'),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trazo_id, version)
);
CREATE INDEX IF NOT EXISTS trazo_layout_trazo_idx ON public.trazo_layout (trazo_id, version DESC);

ALTER TABLE public.molde_pieza  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trazo_layout ENABLE ROW LEVEL SECURITY;
CREATE POLICY biz_select ON public.molde_pieza  FOR SELECT TO authenticated USING (public.current_user_role() = ANY (ARRAY['admin','operador']));
CREATE POLICY biz_insert ON public.molde_pieza  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY biz_update ON public.molde_pieza  FOR UPDATE TO authenticated USING (public.current_user_role() = 'admin') WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY biz_delete ON public.molde_pieza  FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');
CREATE POLICY biz_select ON public.trazo_layout FOR SELECT TO authenticated USING (public.current_user_role() = ANY (ARRAY['admin','operador']));
CREATE POLICY biz_insert ON public.trazo_layout FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = ANY (ARRAY['admin','operador']));
CREATE POLICY biz_update ON public.trazo_layout FOR UPDATE TO authenticated USING (public.current_user_role() = ANY (ARRAY['admin','operador'])) WITH CHECK (public.current_user_role() = ANY (ARRAY['admin','operador']));
CREATE POLICY biz_delete ON public.trazo_layout FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.molde_pieza  FOR EACH ROW EXECUTE FUNCTION public.fn_audit();
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.trazo_layout FOR EACH ROW EXECUTE FUNCTION public.fn_audit();

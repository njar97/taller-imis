-- v3.35 — Seguimiento de cada corte (trazo → tendido → bultos → producción)
-- Javier 12-nov-2026: «que quede la evidencia de los trazos en la app, que después entró a producción,
-- y el seguimiento que yo te voy dando, que vaya quedando registrado».
-- Requisito: v3.21 aplicada (fn_audit, current_user_role). Tabla nueva: sin DROP previos.

-- Largo del lienzo del trazo (cm), para mostrarlo en la ficha del corte
ALTER TABLE public.trazo ADD COLUMN IF NOT EXISTS largo_cm numeric;

CREATE TABLE IF NOT EXISTS public.corte_seguimiento (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trazo_id    uuid REFERENCES public.trazo(id) ON DELETE CASCADE,
  tendido_id  uuid REFERENCES public.tendido(id) ON DELETE CASCADE,
  fecha       date NOT NULL DEFAULT current_date,
  texto       text NOT NULL,
  quien       text,            -- quién lo dijo o lo hizo (Javier, Imelda, Paty, cuaderno…)
  foto_url    text,            -- evidencia (foto de la mesa, del cuaderno, de la etiqueta…)
  creado_por  text DEFAULT (auth.jwt() ->> 'email'),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corte_seguimiento_tiene_corte CHECK (trazo_id IS NOT NULL OR tendido_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS corte_seguimiento_trazo_idx   ON public.corte_seguimiento (trazo_id, fecha);
CREATE INDEX IF NOT EXISTS corte_seguimiento_tendido_idx ON public.corte_seguimiento (tendido_id, fecha);

ALTER TABLE public.corte_seguimiento ENABLE ROW LEVEL SECURITY;
CREATE POLICY biz_select ON public.corte_seguimiento FOR SELECT TO authenticated USING (public.current_user_role() = ANY (ARRAY['admin','operador']));
CREATE POLICY biz_insert ON public.corte_seguimiento FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = ANY (ARRAY['admin','operador']));
CREATE POLICY biz_update ON public.corte_seguimiento FOR UPDATE TO authenticated USING (public.current_user_role() = ANY (ARRAY['admin','operador'])) WITH CHECK (public.current_user_role() = ANY (ARRAY['admin','operador']));
CREATE POLICY biz_delete ON public.corte_seguimiento FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.corte_seguimiento FOR EACH ROW EXECUTE FUNCTION public.fn_audit();

-- v3.57 · Estado «anulado» para bultos duplicados
-- Auditoría 27-nov, Etapa 1 paso 8 (INI-11, PRO-3, DAT-4).
--
-- Un bulto anulado no se borra: queda en gris, no suma en ninguna cuenta y no
-- se puede revertir ni terminar. Sus operaciones anotadas pasan a tipo
-- «anulado» y dejan de contar en el avance y en el pago.
-- Para no tocar las ~15 cuentas de la app que preguntan «¿está terminado?»,
-- la vista lo sigue entregando como terminado (con 0 piezas) y agrega la
-- columna «anulado».

ALTER TABLE public.produccion_bulto DROP CONSTRAINT IF EXISTS produccion_bulto_estado_check;
ALTER TABLE public.produccion_bulto ADD CONSTRAINT produccion_bulto_estado_check
  CHECK (estado = ANY (ARRAY['pendiente'::text, 'en_proceso'::text, 'terminado'::text, 'anulado'::text]));

DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.produccion_registro_operacion'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%tipo%normal%reproceso%' LOOP
    EXECUTE format('ALTER TABLE public.produccion_registro_operacion DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.produccion_registro_operacion ADD CONSTRAINT produccion_registro_operacion_tipo_check
  CHECK (tipo = ANY (ARRAY['normal'::text, 'reproceso'::text, 'anulado'::text]));

CREATE OR REPLACE VIEW public.vw_produccion_estado AS
 SELECT trs.id AS salida_id,
    pb.id AS produccion_bulto_id,
    t.id AS tendido_id,
    t.codigo_corte,
    t.letra_corte,
    t.fecha AS fecha_corte,
    tr.numero_rollo,
    ttm.letra_local AS letra_talla,
    ttm.talla_key_original,
    ttm.talla_key_complemento,
    ttm.cod_prenda,
    COALESCE(pb.talla_corregida, trs.talla_key_salida) AS talla_key_salida,
    trs.cantidad AS cantidad_trs_original,
    COALESCE(pb.cantidad_ajustada, trs.cantidad) AS cantidad_original,
    pb.cantidad_final,
    pb.bulto_origen_id,
    pb.sufijo_division,
    pb.unido_a_id,
    CASE WHEN pb.estado = 'anulado'::text THEN 'terminado'::text
         ELSE COALESCE(pb.estado, 'pendiente'::text) END AS estado_manual,
    ( SELECT count(*) AS count
           FROM produccion_operacion po
          WHERE po.cod_prenda = ttm.cod_prenda AND po.activo = true) AS total_etapas,
    ( SELECT count(DISTINCT po.id) AS count
           FROM produccion_registro_operacion pro
             JOIN produccion_operacion po ON po.id = pro.operacion_id
          WHERE pro.produccion_bulto_id = pb.id AND pro.tipo = 'normal'::text AND po.cod_prenda = ttm.cod_prenda AND po.activo = true) AS etapas_hechas,
    pb.fecha_ingreso,
    pb.fecha_terminado,
    pb.observaciones,
        CASE
            WHEN pb.etiqueta IS NOT NULL THEN ((pb.etiqueta || '-'::text) || replace(trs.talla_key_salida, '.'::text, ''::text)) || COALESCE(pb.sufijo_division, ''::text)
            ELSE (((((tr.numero_rollo::text || COALESCE(t.letra_corte, '?'::text)) || ttm.letra_local) || COALESCE(pb.cantidad_ajustada, trs.cantidad)::text) || '-'::text) || replace(trs.talla_key_salida, '.'::text, ''::text)) || COALESCE(pb.sufijo_division, ''::text)
        END AS codigo_bulto,
    trs.talla_key_salida AS talla_key_corte,
    -- nuevo (al final)
    COALESCE(pb.estado = 'anulado'::text, false) AS anulado
   FROM tendido_rollo_salida trs
     JOIN tendido_rollo tr ON tr.id = trs.tendido_rollo_id
     JOIN tendido t ON t.id = tr.tendido_id
     JOIN tendido_talla_marcada ttm ON ttm.id = trs.tendido_talla_marcada_id
     LEFT JOIN produccion_bulto pb ON pb.tendido_rollo_salida_id = trs.id
  WHERE pb.unido_a_id IS NULL
  ORDER BY t.fecha DESC, t.codigo_corte, tr.numero_rollo, ttm.letra_local;

-- ── Anular un bulto (no se borra nada) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.anular_bulto(p_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v        produccion_bulto%rowtype;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_regs   int;
begin
  if auth.uid() is not null and current_user_role() is distinct from 'admin' then
    raise exception 'Solo un administrador puede anular un bulto.';
  end if;
  if v_motivo is null then raise exception 'Falta el motivo de la anulación.'; end if;
  select * into v from produccion_bulto where id = p_id for update;
  if not found then raise exception 'No se encontró el bulto.'; end if;
  if v.estado = 'anulado' then return jsonb_build_object('cambio', false); end if;
  if exists (select 1 from bodega_movimiento where produccion_bulto_id = p_id and tipo = 'ENTRADA_PRODUCCION') then
    raise exception 'Ese bulto ya metió piezas a bodega: primero hay que revertirlo.';
  end if;

  update produccion_bulto
     set estado = 'anulado',
         cantidad_final = 0,
         fecha_terminado = coalesce(fecha_terminado, (now() at time zone 'America/El_Salvador')::date),
         observaciones = concat_ws(' · ', nullif(trim(observaciones), ''), 'ANULADO: ' || v_motivo),
         actualizado_en = now()
   where id = p_id;

  update produccion_registro_operacion
     set tipo = 'anulado',
         observaciones = concat_ws(' · ', nullif(trim(observaciones), ''), 'Anulado con su bulto')
   where produccion_bulto_id = p_id and tipo = 'normal';
  get diagnostics v_regs = row_count;
  return jsonb_build_object('cambio', true, 'registros_anulados', v_regs);
end $function$;
REVOKE ALL ON FUNCTION public.anular_bulto(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anular_bulto(uuid, text) TO authenticated;

-- ── Un bulto anulado queda quieto: ni dividir, ni unir, ni cambiar talla ──
CREATE OR REPLACE FUNCTION public.trg_bulto_anulado_quieto()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.estado = 'anulado' and new.estado = 'anulado'
     and (new.cantidad_ajustada is distinct from old.cantidad_ajustada
          or new.cantidad_final  is distinct from old.cantidad_final
          or new.talla_corregida is distinct from old.talla_corregida
          or new.unido_a_id      is distinct from old.unido_a_id) then
    raise exception 'Ese bulto está anulado: no se puede cambiar.';
  end if;
  return new;
end $function$;
DROP TRIGGER IF EXISTS trg_bulto_anulado_quieto ON public.produccion_bulto;
CREATE TRIGGER trg_bulto_anulado_quieto BEFORE UPDATE ON public.produccion_bulto
  FOR EACH ROW EXECUTE FUNCTION public.trg_bulto_anulado_quieto();

-- ── Un bulto anulado no se puede terminar ─────────────────────────────
CREATE OR REPLACE FUNCTION public.terminar_bulto(
  p_id uuid, p_cantidad integer, p_nombre_prenda text DEFAULT NULL, p_nota text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v        produccion_bulto%rowtype;
  v_cod    text;
  v_talla  text;
  v_codigo text;
  v_hoy    date := (now() at time zone 'America/El_Salvador')::date;
  v_nota   text := nullif(trim(coalesce(p_nota, '')), '');
begin
  select * into v from produccion_bulto where id = p_id for update;
  if not found then raise exception 'No se encontró el bulto.'; end if;
  if v.estado = 'anulado' then raise exception 'Ese bulto está anulado: no se puede terminar.'; end if;
  if v.unido_a_id is not null then raise exception 'Este bulto fue unido a otro: termine ese.'; end if;
  if exists (select 1 from bodega_movimiento
              where produccion_bulto_id = p_id and tipo = 'ENTRADA_PRODUCCION') then
    raise exception 'Ese bulto ya está en bodega.';
  end if;
  if v.estado = 'terminado' then raise exception 'Ese bulto ya está terminado.'; end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'Falta la cantidad de piezas que terminaron.';
  end if;

  select ttm.cod_prenda, coalesce(v.talla_corregida, trs.talla_key_salida) into v_cod, v_talla
    from tendido_rollo_salida trs
    join tendido_talla_marcada ttm on ttm.id = trs.tendido_talla_marcada_id
   where trs.id = v.tendido_rollo_salida_id;
  if v_cod is null or v_talla is null then
    raise exception 'El bulto no tiene prenda o talla: no se puede pasar a bodega.';
  end if;
  select codigo_bulto into v_codigo from vw_produccion_estado where produccion_bulto_id = p_id;

  update produccion_bulto
     set estado = 'terminado',
         fecha_terminado = v_hoy,
         cantidad_final = p_cantidad,
         -- la nota del bulto (REBAJA, casi listo…) se conserva; lo nuevo se agrega
         observaciones = case when v_nota is null then observaciones
                              else concat_ws(' · ', nullif(trim(observaciones), ''), v_nota) end,
         actualizado_en = now()
   where id = p_id;

  insert into bodega_movimiento (tipo, cod_prenda, nombre_prenda, talla_key, cantidad,
                                 produccion_bulto_id, fecha, observaciones)
  values ('ENTRADA_PRODUCCION', v_cod, nullif(trim(coalesce(p_nombre_prenda, '')), ''), v_talla, p_cantidad,
          p_id, v_hoy, 'Bulto ' || coalesce(v_codigo, left(p_id::text, 6)) || ' terminado');

  return jsonb_build_object('cantidad', p_cantidad, 'talla', v_talla, 'cod_prenda', v_cod,
                            'fecha', v_hoy, 'codigo', v_codigo);
end $function$;

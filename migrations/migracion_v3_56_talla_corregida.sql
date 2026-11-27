-- v3.56 · Talla corregida en el bulto (rebajas de talla)
-- Auditoría 27-nov, Etapa 1 paso 7 (PRO-4, DAT-2, INI-9).
--
-- El bulto toma su talla del corte. Cuando se decide coserlo en otra talla
-- (rebaja), eso vivía solo en una nota y al terminar entraba a bodega con la
-- talla vieja. Ahora el bulto guarda su «talla corregida»:
--   · la lista de bultos, el avance y las cuentas la usan (vw_produccion_estado);
--   · la entrada a bodega la usa (terminar_bulto);
--   · el corte y la etiqueta NO cambian (el código sigue siendo el mismo).

ALTER TABLE public.produccion_bulto ADD COLUMN IF NOT EXISTS talla_corregida text;

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
    COALESCE(pb.estado, 'pendiente'::text) AS estado_manual,
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
    -- nuevo (al final): la talla con la que se cortó, cuando el bulto fue corregido
    trs.talla_key_salida AS talla_key_corte
   FROM tendido_rollo_salida trs
     JOIN tendido_rollo tr ON tr.id = trs.tendido_rollo_id
     JOIN tendido t ON t.id = tr.tendido_id
     JOIN tendido_talla_marcada ttm ON ttm.id = trs.tendido_talla_marcada_id
     LEFT JOIN produccion_bulto pb ON pb.tendido_rollo_salida_id = trs.id
  WHERE pb.unido_a_id IS NULL
  ORDER BY t.fecha DESC, t.codigo_corte, tr.numero_rollo, ttm.letra_local;

-- ── Pasar un bulto a otra talla (deja nota; no toca el corte) ──────────
CREATE OR REPLACE FUNCTION public.corregir_talla_bulto(p_id uuid, p_talla text, p_motivo text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v        produccion_bulto%rowtype;
  v_cod    text;
  v_corte  text;
  v_antes  text;
  v_nueva  text := upper(trim(coalesce(p_talla, '')));
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  select * into v from produccion_bulto where id = p_id for update;
  if not found then raise exception 'No se encontró el bulto.'; end if;
  if v.estado = 'terminado' then raise exception 'Ese bulto ya está terminado: su talla ya entró a bodega.'; end if;
  select ttm.cod_prenda, trs.talla_key_salida into v_cod, v_corte
    from tendido_rollo_salida trs
    join tendido_talla_marcada ttm on ttm.id = trs.tendido_talla_marcada_id
   where trs.id = v.tendido_rollo_salida_id;
  if v_nueva = '' or left(v_nueva, length(v_cod)) <> v_cod or length(v_nueva) <= length(v_cod) then
    raise exception 'Talla no válida: debe empezar con % (por ejemplo %12).', v_cod, v_cod;
  end if;
  v_antes := coalesce(v.talla_corregida, v_corte);
  if v_nueva = v_antes then return jsonb_build_object('antes', v_antes, 'ahora', v_nueva, 'cambio', false); end if;

  update produccion_bulto
     set talla_corregida = case when v_nueva = v_corte then null else v_nueva end,
         observaciones = case when v_motivo is null then observaciones
                              else concat_ws(' · ', nullif(trim(observaciones), ''),
                                             'Talla ' || v_antes || ' → ' || v_nueva || ': ' || v_motivo) end,
         actualizado_en = now()
   where id = p_id;
  return jsonb_build_object('antes', v_antes, 'ahora', v_nueva, 'cambio', true);
end $function$;
REVOKE ALL ON FUNCTION public.corregir_talla_bulto(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.corregir_talla_bulto(uuid, text, text) TO authenticated;

-- ── La entrada a bodega usa la talla corregida ────────────────────────
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

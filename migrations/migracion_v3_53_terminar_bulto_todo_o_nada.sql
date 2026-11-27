-- v3.53 · Terminar bulto + entrada a bodega en un solo paso (todo o nada)
-- Auditoría 27-nov, Etapa 1 pasos 2, 3 y 6 (BOD-2, BOD-3, DAT-9, PRO-6, PRO-16, DAT-15, DAT-2).
--
-- 1. Un bulto no puede entrar dos veces a bodega (índice único).
-- 2. Una salida de tendido no puede tener dos bultos (índice único; los
--    bultos divididos llevan bulto_origen_id y no cuentan).
-- 3. El bulto nace cuando se guarda la salida del tendido (trigger), no
--    cuando alguien abre Producción.
-- 4. terminar_bulto(): marca terminado y mete las piezas a bodega juntas.
--    No borra la nota del bulto. Fecha de El Salvador.
-- 5. revertir_bulto(): vuelve a costura y saca la entrada, juntas.

CREATE UNIQUE INDEX IF NOT EXISTS bodega_mov_entrada_bulto_uq
  ON public.bodega_movimiento (produccion_bulto_id)
  WHERE tipo = 'ENTRADA_PRODUCCION' AND produccion_bulto_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS produccion_bulto_salida_uq
  ON public.produccion_bulto (tendido_rollo_salida_id)
  WHERE bulto_origen_id IS NULL;

-- ── El bulto nace con la salida del tendido ───────────────────────────
CREATE OR REPLACE FUNCTION public.trg_salida_crea_bulto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  insert into produccion_bulto (tendido_rollo_salida_id, estado)
  values (new.id, 'pendiente')
  on conflict (tendido_rollo_salida_id) where bulto_origen_id is null do nothing;
  return new;
end $function$;

DROP TRIGGER IF EXISTS trg_salida_crea_bulto ON public.tendido_rollo_salida;
CREATE TRIGGER trg_salida_crea_bulto
  AFTER INSERT ON public.tendido_rollo_salida
  FOR EACH ROW EXECUTE FUNCTION public.trg_salida_crea_bulto();

-- ── Terminar: bulto + bodega, todo o nada ─────────────────────────────
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

  select ttm.cod_prenda, trs.talla_key_salida into v_cod, v_talla
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

-- ── Revertir: bulto vuelve a costura y sale de bodega, todo o nada ────
CREATE OR REPLACE FUNCTION public.revertir_bulto(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v       produccion_bulto%rowtype;
  v_habia int;
  v_n     int;
begin
  select * into v from produccion_bulto where id = p_id for update;
  if not found then raise exception 'No se encontró el bulto.'; end if;
  if v.estado <> 'terminado' then raise exception 'Ese bulto no está terminado.'; end if;

  select count(*) into v_habia from bodega_movimiento
   where produccion_bulto_id = p_id and tipo = 'ENTRADA_PRODUCCION';
  delete from bodega_movimiento
   where produccion_bulto_id = p_id and tipo = 'ENTRADA_PRODUCCION';
  get diagnostics v_n = row_count;
  if v_n < v_habia then
    -- sin permiso de borrar, la entrada se quedaría y el bulto entraría dos veces
    raise exception 'Su cuenta no puede sacar piezas de bodega. Pídale a un administrador que lo revierta.';
  end if;

  update produccion_bulto
     set estado = 'pendiente', fecha_terminado = null, cantidad_final = null, actualizado_en = now()
   where id = p_id;
  return jsonb_build_object('salieron', v_n);
end $function$;

REVOKE ALL ON FUNCTION public.terminar_bulto(uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revertir_bulto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terminar_bulto(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revertir_bulto(uuid) TO authenticated;

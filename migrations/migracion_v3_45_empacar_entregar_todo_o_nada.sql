-- v3.45 · Empacar y entregar por pedido «todo o nada» + deshacer (19-nov-2026)
-- Auditoría funcional 18-nov, puntos 3.2 y 3.3.
--   · Empacar, entregar, desempacar y anular una entrega pasan a ser UN solo
--     paso en la base: si se cae la señal no queda nada a medias.
--   · Cada entrega guarda su detalle (qué empacado consumió y a qué filas del
--     pedido sumó) para poder anularla después.
-- No cambia ningún dato existente.

alter table entrega_escuela add column if not exists detalle jsonb;

-- ── Empacar: sale de bodega y queda apartado para la escuela ──────────
-- p_items: [{pedido_id, cod_prenda, nombre_prenda, talla_key, cantidad, observaciones}]
create or replace function empacar_por_pedido(p_escuela uuid, p_items jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  it      jsonb;
  v_stock numeric;
  v_mov   uuid;
  v_acap  uuid;
  v_ids   jsonb := '[]'::jsonb;
  v_n     int;
begin
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'No hay nada para empacar.'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_n := (it->>'cantidad')::int;
    if v_n is null or v_n <= 0 then raise exception 'Cantidad inválida.'; end if;
    if not exists (select 1 from pedido where id = (it->>'pedido_id')::uuid and escuela_id = p_escuela) then
      raise exception 'Una línea no es del pedido de esta escuela.';
    end if;
    select coalesce(sum(stock_actual), 0) into v_stock from vw_bodega_stock
     where cod_prenda = it->>'cod_prenda' and talla_key = it->>'talla_key';
    if v_stock < v_n then
      raise exception 'En bodega ya no hay % de % (quedan %). Alguien empacó antes; se refresca la lista.', v_n, it->>'talla_key', v_stock;
    end if;
    insert into bodega_movimiento (tipo, cod_prenda, nombre_prenda, talla_key, cantidad, escuela_id, pedido_id, fecha, observaciones)
    values ('SALIDA_EMPAQUE', it->>'cod_prenda', it->>'nombre_prenda', it->>'talla_key', v_n, p_escuela,
            (it->>'pedido_id')::uuid, coalesce(nullif(it->>'fecha', '')::date, current_date), it->>'observaciones')
    returning id into v_mov;
    insert into escuela_acaparado (escuela_id, cod_prenda, nombre_prenda, talla_key, cantidad_acaparada,
                                   cantidad_consumida, movimiento_bodega_id, observaciones)
    values (p_escuela, it->>'cod_prenda', it->>'nombre_prenda', it->>'talla_key', v_n, 0, v_mov,
            'Empacado por pedido (sin nombres)')
    returning id into v_acap;
    v_ids := v_ids || to_jsonb(v_acap);
  end loop;
  return v_ids;
end $$;

-- ── Entregar lo empacado ──────────────────────────────────────────────
-- p: {escuela_id, fecha, receptor, observaciones, total,
--     consumos: {acap_id: n}, patches: [{id, sumar}]}
create or replace function entregar_por_pedido(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_esc uuid := (p->>'escuela_id')::uuid;
  v_id  uuid;
  k     text;
  v_n   int;
  x     jsonb;
  v_c   int := 0;
  v_p   int := 0;
begin
  for k in select jsonb_object_keys(coalesce(p->'consumos', '{}'::jsonb)) loop
    v_n := (p->'consumos'->>k)::int;
    if v_n is null or v_n <= 0 then continue; end if;
    update escuela_acaparado
       set cantidad_consumida = cantidad_consumida + v_n, actualizado_en = now()
     where id = k::uuid and escuela_id = v_esc and cantidad_acaparada - cantidad_consumida >= v_n;
    if not found then raise exception 'Lo empacado cambió (alguien entregó o desempacó antes). Refrescá y volvé a intentar.'; end if;
    v_c := v_c + v_n;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'patches', '[]'::jsonb)) loop
    update pedido set cantidad_entregada = coalesce(cantidad_entregada, 0) + (x->>'sumar')::int, actualizado_en = now()
     where id = (x->>'id')::uuid and escuela_id = v_esc;
    if not found then raise exception 'Una fila del pedido no es de esta escuela.'; end if;
    v_p := v_p + (x->>'sumar')::int;
  end loop;
  if v_c = 0 then raise exception 'No hay nada para entregar.'; end if;
  if v_c <> v_p then raise exception 'La entrega no cuadra (% empacadas contra % sumadas al pedido).', v_c, v_p; end if;
  insert into entrega_escuela (escuela_id, fecha, cantidad_piezas, receptor, observaciones, detalle)
  values (v_esc, (p->>'fecha')::date, v_c, nullif(p->>'receptor', ''), nullif(p->>'observaciones', ''),
          jsonb_build_object('consumos', p->'consumos', 'patches', p->'patches'))
  returning id into v_id;
  return v_id;
end $$;

-- ── Desempacar: lo empacado sin entregar vuelve a bodega ──────────────
create or replace function desempacar_por_pedido(p_acap_ids uuid[])
returns int language plpgsql security invoker set search_path = public as $$
declare
  a     record;
  v_tot int := 0;
  v_res int;
begin
  for a in select ea.*, bm.pedido_id from escuela_acaparado ea
             left join bodega_movimiento bm on bm.id = ea.movimiento_bodega_id
            where ea.id = any (p_acap_ids) for update of ea loop
    v_res := a.cantidad_acaparada - a.cantidad_consumida;
    if v_res <= 0 then continue; end if;   -- ya entregado: no se toca
    update escuela_acaparado set cantidad_acaparada = cantidad_consumida, actualizado_en = now() where id = a.id;
    insert into bodega_movimiento (tipo, cod_prenda, nombre_prenda, talla_key, cantidad, escuela_id, pedido_id, fecha, observaciones)
    values ('ENTRADA_MANUAL', a.cod_prenda, a.nombre_prenda, a.talla_key, v_res, a.escuela_id, a.pedido_id,
            current_date, 'Desempacado: vuelve a bodega');
    v_tot := v_tot + v_res;
  end loop;
  return v_tot;
end $$;

-- ── Anular una entrega: las piezas vuelven a «empacado sin entregar» ───
create or replace function anular_entrega(p_id uuid)
returns int language plpgsql security invoker set search_path = public as $$
declare
  e     entrega_escuela%rowtype;
  k     text;
  v_n   int;
  x     jsonb;
  v_tot int := 0;
begin
  select * into e from entrega_escuela where id = p_id for update;
  if not found then raise exception 'No se encontró la entrega.'; end if;
  if e.detalle is null then
    raise exception 'Esta entrega es de antes del cambio y no guardó su detalle: no se puede anular sola.';
  end if;
  for k in select jsonb_object_keys(coalesce(e.detalle->'consumos', '{}'::jsonb)) loop
    v_n := (e.detalle->'consumos'->>k)::int;
    update escuela_acaparado set cantidad_consumida = cantidad_consumida - v_n, actualizado_en = now()
     where id = k::uuid and cantidad_consumida >= v_n;
    if not found then raise exception 'No se pudo devolver lo entregado a «empacado».'; end if;
    v_tot := v_tot + v_n;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(e.detalle->'patches', '[]'::jsonb)) loop
    update pedido set cantidad_entregada = cantidad_entregada - (x->>'sumar')::int, actualizado_en = now()
     where id = (x->>'id')::uuid and coalesce(cantidad_entregada, 0) >= (x->>'sumar')::int;
    if not found then raise exception 'No se pudo restar lo entregado del pedido.'; end if;
  end loop;
  delete from entrega_escuela where id = p_id;
  if not found then raise exception 'No se pudo borrar el registro de la entrega (¿sin permiso?).'; end if;
  return v_tot;
end $$;

grant execute on function empacar_por_pedido(uuid, jsonb) to authenticated;
grant execute on function entregar_por_pedido(jsonb) to authenticated;
grant execute on function desempacar_por_pedido(uuid[]) to authenticated;
grant execute on function anular_entrega(uuid) to authenticated;

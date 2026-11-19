-- v3.46 · Dividir un bulto repartiendo sus operaciones (19-nov-2026)
-- Auditoría funcional 18-nov, sección 4.
-- Antes: el bulto derivado nacía con 0 operaciones aunque sus piezas ya
-- llevaran trabajo, y la división se guardaba en pasos sueltos.
-- Ahora: un solo paso; cada operación ya marcada se reparte entre el bulto
-- original y el derivado en proporción a las piezas (el total de piezas
-- anotado a cada operaria no cambia).

create or replace function dividir_bulto(p_id uuid, p_piezas int, p_motivo text default null)
returns text language plpgsql security invoker set search_path = public as $$
declare
  v      produccion_bulto%rowtype;
  v_cant int;
  n      int := 2;
  v_new  uuid;
  r      record;
  v_part int;
begin
  select * into v from produccion_bulto where id = p_id for update;
  if not found then raise exception 'No se encontró el bulto.'; end if;
  if v.estado = 'terminado' then raise exception 'Este bulto ya está terminado: no se puede dividir.'; end if;
  if v.unido_a_id is not null then raise exception 'Este bulto ya fue unido a otro.'; end if;
  v_cant := coalesce(v.cantidad_ajustada, (select cantidad from tendido_rollo_salida where id = v.tendido_rollo_salida_id));
  if p_piezas is null or p_piezas <= 0 or p_piezas >= v_cant then
    raise exception 'Cantidad inválida. Debe ser entre 1 y %.', v_cant - 1;
  end if;
  while exists (select 1 from produccion_bulto
                 where (id = p_id or bulto_origen_id = p_id) and sufijo_division = '/' || n) loop
    n := n + 1;
  end loop;

  update produccion_bulto set cantidad_ajustada = v_cant - p_piezas, actualizado_en = now() where id = p_id;
  insert into produccion_bulto (tendido_rollo_salida_id, estado, cantidad_ajustada, bulto_origen_id, sufijo_division, observaciones)
  values (v.tendido_rollo_salida_id, coalesce(v.estado, 'pendiente'), p_piezas, p_id, '/' || n, nullif(p_motivo, ''))
  returning id into v_new;

  for r in select * from produccion_registro_operacion where produccion_bulto_id = p_id loop
    if r.cantidad_realizada is null then
      -- sin cantidad anotada: la operación queda hecha en los dos
      insert into produccion_registro_operacion (produccion_bulto_id, operacion_id, operaria, fecha, cantidad_realizada, observaciones, operaria_id, tipo)
      values (v_new, r.operacion_id, r.operaria, r.fecha, null, r.observaciones, r.operaria_id, r.tipo);
      continue;
    end if;
    v_part := least(r.cantidad_realizada, round(r.cantidad_realizada::numeric * p_piezas / v_cant)::int);
    if v_part > 0 then
      insert into produccion_registro_operacion (produccion_bulto_id, operacion_id, operaria, fecha, cantidad_realizada, observaciones, operaria_id, tipo)
      values (v_new, r.operacion_id, r.operaria, r.fecha, v_part, r.observaciones, r.operaria_id, r.tipo);
      if r.cantidad_realizada - v_part > 0 then
        update produccion_registro_operacion set cantidad_realizada = r.cantidad_realizada - v_part where id = r.id;
      else
        delete from produccion_registro_operacion where id = r.id;
      end if;
    end if;
  end loop;
  return '/' || n;
end $$;

grant execute on function dividir_bulto(uuid, int, text) to authenticated;

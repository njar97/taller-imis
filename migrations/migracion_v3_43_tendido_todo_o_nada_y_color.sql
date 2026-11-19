-- v3.43 · Tendido y bultos «todo o nada» + color de cada rollo (19-nov-2026)
-- Auditoría funcional 18-nov, puntos 2.3, 2.4 y 2.5.
--   · Guardar un tendido o sus bultos pasa a ser UN solo paso: si algo falla
--     no queda nada a medias y reintentar no duplica.
--   · Cada rollo tendido recuerda de qué rollo de bodega salió y su color.
--   · En un trazo de dos colores (falda azul + beige) los rollos beige
--     proponen la prenda beige (F16 → FB16).
--   · Eliminar un tendido devuelve las yardas a los rollos y se niega si ya
--     hay producción.
-- No cambia ningún dato existente (las columnas nuevas quedan vacías).

alter table tendido_rollo add column if not exists tela_rollo_id uuid references tela_rollo(id) on delete set null;
alter table tendido_rollo add column if not exists color text;
alter table tendido_talla_marcada add column if not exists color text;

-- La misma letra del trazo puede salir en dos colores (A azul y A beige).
alter table tendido_talla_marcada drop constraint if exists uq_tendido_letra;
create unique index if not exists uq_tendido_letra_color
  on tendido_talla_marcada (tendido_id, letra_local, coalesce(color, ''));

-- Prenda que corresponde a un color de tela (solo las que tienen pareja).
create or replace function prenda_por_color(p_cod text, p_color text)
returns text language sql immutable as $$
  select case upper(coalesce(p_color, ''))
    when 'BEIGE' then case p_cod when 'F' then 'FB' when 'P' then 'PB' else p_cod end
    when 'AZUL'  then case p_cod when 'FB' then 'F' when 'PB' then 'P' else p_cod end
    else p_cod end;
$$;

-- Bultos propuestos: cada talla solo con los rollos de su color.
create or replace view vw_bulto_propuesto as
 SELECT t.id AS tendido_id,
    t.codigo_corte,
    t.letra_corte,
    tr.id AS rollo_id,
    tr.numero_rollo,
    ttm.id AS talla_marcada_id,
    ttm.letra_local,
    ttm.talla_key_original AS talla_key,
    ttm.tipo,
    ttm.multiplicidad,
    COALESCE(tr.lienzos_salidos, 0) AS capas,
        CASE
            WHEN (ttm.tipo = 'par'::text) THEN ((COALESCE(tr.lienzos_salidos, 0) / 2) * ttm.multiplicidad)
            ELSE (COALESCE(tr.lienzos_salidos, 0) * ttm.multiplicidad)
        END AS cantidad_propuesta,
        CASE
            WHEN ((ttm.tipo = 'par'::text) AND ((COALESCE(tr.lienzos_salidos, 0) % 2) <> 0)) THEN 1
            ELSE 0
        END AS lienzo_sobrante,
    'principal'::text AS rol_par,
    ttm.talla_key_complemento AS hermano_talla_key
   FROM ((tendido t
     JOIN tendido_rollo tr ON ((tr.tendido_id = t.id)))
     JOIN tendido_talla_marcada ttm ON ((ttm.tendido_id = t.id)))
  WHERE (ttm.color IS NULL OR tr.color IS NULL OR upper(ttm.color) = upper(tr.color))
UNION ALL
 SELECT t.id AS tendido_id,
    t.codigo_corte,
    t.letra_corte,
    tr.id AS rollo_id,
    tr.numero_rollo,
    ttm.id AS talla_marcada_id,
    ttm.letra_local,
    ttm.talla_key_complemento AS talla_key,
    ttm.tipo,
    ttm.multiplicidad,
    COALESCE(tr.lienzos_salidos, 0) AS capas,
    ((COALESCE(tr.lienzos_salidos, 0) / 2) * ttm.multiplicidad) AS cantidad_propuesta,
        CASE
            WHEN ((COALESCE(tr.lienzos_salidos, 0) % 2) <> 0) THEN 1
            ELSE 0
        END AS lienzo_sobrante,
    'complemento'::text AS rol_par,
    ttm.talla_key_original AS hermano_talla_key
   FROM ((tendido t
     JOIN tendido_rollo tr ON ((tr.tendido_id = t.id)))
     JOIN tendido_talla_marcada ttm ON ((ttm.tendido_id = t.id)))
  WHERE ((ttm.tipo = 'par'::text) AND (ttm.talla_key_complemento IS NOT NULL))
    AND (ttm.color IS NULL OR tr.color IS NULL OR upper(ttm.color) = upper(tr.color))
  ORDER BY 5, 7, 15;

-- ── Guardar un tendido completo en un solo paso ───────────────────────
create or replace function guardar_tendido(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_trazo   trazo%rowtype;
  v_id      uuid;
  v_letra   text := upper(trim(coalesce(p->>'letra', '')));
  v_colores text[];
  v_defecto text;
  r         jsonb;
  m         record;
  c         text;
  v_cod     text;
  v_hechos  text[];
  v_varios  boolean;
  v_tela    tela_rollo%rowtype;
  v_color   text;
  v_sob     numeric;
begin
  select * into v_trazo from trazo where id = (p->>'trazo_id')::uuid;
  if not found then raise exception 'No se encontró el trazo.'; end if;
  if exists (select 1 from tendido where trazo_id = v_trazo.id) then
    raise exception 'Este trazo ya tiene un tendido guardado. Revisá «Ya tendidos» antes de guardarlo otra vez.';
  end if;
  if v_letra !~ '^[A-Z]$' then raise exception 'Falta la letra del corte.'; end if;
  if jsonb_array_length(coalesce(p->'rollos', '[]'::jsonb)) = 0 then raise exception 'Agregá al menos 1 rollo.'; end if;

  insert into tendido (fecha, codigo_corte, letra_corte, trazo_id, prendas, equipo,
                       completo_en_un_dia, fecha_continuacion, observaciones_generales)
  values ((p->>'fecha')::date, v_trazo.codigo_corte, v_letra, v_trazo.id, null,
          nullif(p->>'equipo', ''), coalesce((p->>'completo')::boolean, true),
          nullif(p->>'fecha_continuacion', '')::date, nullif(p->>'observaciones', ''))
  returning id into v_id;

  if v_trazo.letra_corte is distinct from v_letra then
    update trazo set letra_corte = v_letra where id = v_trazo.id;
  end if;

  -- Rollos: color = el del rollo de bodega; si no está en la lista, el que
  -- se eligió; si tampoco, el primer color del trazo.
  v_defecto := upper(coalesce(v_trazo.colores_tela[1], ''));
  for r in select * from jsonb_array_elements(p->'rollos') loop
    v_color := null;
    v_tela := null;
    if nullif(r->>'tela_rollo_id', '') is not null then
      select * into v_tela from tela_rollo where id = (r->>'tela_rollo_id')::uuid for update;
      if not found then raise exception 'Uno de los rollos ya no está en bodega. Volvé a abrir el tendido.'; end if;
      if coalesce(v_tela.yardas_disponibles, 0) <= 0 then
        raise exception 'El rollo % ya no tiene yardas: alguien lo usó en otro tendido.', coalesce(v_tela.numero_rollo, '');
      end if;
      v_color := upper(v_tela.color);
    end if;
    v_color := coalesce(v_color, nullif(upper(r->>'color'), ''), nullif(v_defecto, ''));
    v_sob := nullif(r->>'yardas_sobrantes', '')::numeric;

    insert into tendido_rollo (tendido_id, numero_rollo, codigo_rollo, yardas_rollo, lienzos_salidos,
                               yardas_sobrantes, observacion_tono, tela_rollo_id, color)
    values (v_id, (r->>'numero_rollo')::int, nullif(r->>'codigo_rollo', ''),
            nullif(r->>'yardas_rollo', '')::numeric, nullif(r->>'lienzos_salidos', '')::int,
            v_sob, nullif(r->>'observacion_tono', ''), v_tela.id, v_color);

    if v_tela.id is not null then
      update tela_rollo
         set yardas_disponibles = greatest(0, coalesce(v_sob, 0)),
             estado = case when greatest(0, coalesce(v_sob, 0)) > 0 then 'en_bodega' else 'agotado' end,
             actualizado_en = now()
       where id = v_tela.id;
    end if;
  end loop;

  select array_agg(distinct color) into v_colores from tendido_rollo where tendido_id = v_id and color is not null;

  -- Tallas del trazo: una fila por talla; si los rollos piden otra prenda
  -- (beige en un trazo de falda azul), una fila por cada prenda/color.
  for m in select * from trazo_talla_marcada where trazo_id = v_trazo.id order by orden loop
    select count(distinct prenda_por_color(m.cod_prenda, x)) > 1
           or bool_or(prenda_por_color(m.cod_prenda, x) is distinct from m.cod_prenda)
      into v_varios from unnest(coalesce(v_colores, array[]::text[])) x;
    if not coalesce(v_varios, false) then
      insert into tendido_talla_marcada (tendido_id, trazo_talla_marcada_id, letra_local, talla_key_original,
             talla_key_complemento, tipo, multiplicidad, orden, prenda, cod_prenda, talla, largo, detalle, color)
      values (v_id, m.id, m.letra_local, m.talla_key_original, m.talla_key_complemento, m.tipo,
              m.multiplicidad, m.orden, m.prenda, m.cod_prenda, m.talla, m.largo, m.detalle, null);
    else
      v_hechos := array[]::text[];
      foreach c in array v_colores loop
        v_cod := prenda_por_color(m.cod_prenda, c);
        if v_cod = any (v_hechos) then continue; end if;
        v_hechos := v_hechos || v_cod;
        insert into tendido_talla_marcada (tendido_id, trazo_talla_marcada_id, letra_local, talla_key_original,
               talla_key_complemento, tipo, multiplicidad, orden, prenda, cod_prenda, talla, largo, detalle, color)
        values (v_id, m.id, m.letra_local,
                case when m.cod_prenda is not null and m.talla_key_original like m.cod_prenda || '%'
                     then v_cod || substr(m.talla_key_original, length(m.cod_prenda) + 1) else m.talla_key_original end,
                case when m.talla_key_complemento is null then null
                     when m.cod_prenda is not null and m.talla_key_complemento like m.cod_prenda || '%'
                     then v_cod || substr(m.talla_key_complemento, length(m.cod_prenda) + 1) else m.talla_key_complemento end,
                m.tipo, m.multiplicidad, m.orden, m.prenda, v_cod, m.talla, m.largo, m.detalle, c);
      end loop;
    end if;
  end loop;

  return v_id;
end $$;

-- ── Guardar todos los bultos de un tendido en un solo paso ────────────
-- p_bultos: [{uid, rollo_id, talla_marcada_id, talla, cantidad, orden, hermano_uid}]
create or replace function guardar_bultos(p_tendido uuid, p_bultos jsonb)
returns int language plpgsql security invoker set search_path = public as $$
declare
  b    jsonb;
  v_id uuid;
  v_n  int := 0;
  ids  jsonb := '{}'::jsonb;
begin
  if exists (select 1 from tendido_rollo_salida s join tendido_rollo r on r.id = s.tendido_rollo_id
              where r.tendido_id = p_tendido) then
    raise exception 'Este tendido ya tiene sus bultos guardados.';
  end if;
  for b in select * from jsonb_array_elements(coalesce(p_bultos, '[]'::jsonb)) loop
    if not exists (select 1 from tendido_rollo where id = (b->>'rollo_id')::uuid and tendido_id = p_tendido) then
      raise exception 'Un bulto no pertenece a este tendido.';
    end if;
    insert into tendido_rollo_salida (tendido_rollo_id, tendido_talla_marcada_id, talla_key_salida, cantidad, orden)
    values ((b->>'rollo_id')::uuid, (b->>'talla_marcada_id')::uuid, trim(b->>'talla'),
            (b->>'cantidad')::int, coalesce((b->>'orden')::int, 1))
    returning id into v_id;
    v_n := v_n + 1;
    if nullif(b->>'uid', '') is not null then ids := ids || jsonb_build_object(b->>'uid', v_id); end if;
  end loop;
  if v_n = 0 then raise exception 'No hay bultos que guardar.'; end if;
  for b in select * from jsonb_array_elements(p_bultos) loop
    if nullif(b->>'hermano_uid', '') is not null and ids ? (b->>'uid') and ids ? (b->>'hermano_uid') then
      update tendido_rollo_salida set bulto_hermano_id = (ids->>(b->>'hermano_uid'))::uuid
       where id = (ids->>(b->>'uid'))::uuid;
    end if;
  end loop;
  return v_n;
end $$;

-- ── Eliminar un tendido devolviendo las yardas ────────────────────────
create or replace function eliminar_tendido(p_id uuid)
returns int language plpgsql security invoker set search_path = public as $$
declare
  v_emp int;
  v_dev int := 0;
  r     record;
begin
  select count(*) into v_emp
    from produccion_bulto pb
    join tendido_rollo_salida s on s.id = pb.tendido_rollo_salida_id
    join tendido_rollo tr on tr.id = s.tendido_rollo_id
   where tr.tendido_id = p_id
     and (coalesce(pb.estado, 'pendiente') <> 'pendiente'
          or exists (select 1 from produccion_registro_operacion o where o.produccion_bulto_id = pb.id)
          or exists (select 1 from bodega_movimiento bm where bm.produccion_bulto_id = pb.id));
  if v_emp > 0 then
    raise exception 'Este tendido no se puede eliminar: % de sus bultos ya están en costura o terminados.', v_emp;
  end if;
  for r in select tela_rollo_id, sum(coalesce(yardas_rollo, 0) - coalesce(yardas_sobrantes, 0)) as usadas
             from tendido_rollo where tendido_id = p_id and tela_rollo_id is not null group by 1 loop
    update tela_rollo
       set yardas_disponibles = least(coalesce(yardas, yardas_disponibles + r.usadas), coalesce(yardas_disponibles, 0) + r.usadas),
           estado = 'en_bodega', actualizado_en = now()
     where id = r.tela_rollo_id and r.usadas > 0;
    v_dev := v_dev + 1;
  end loop;
  delete from tendido where id = p_id;
  if not found then raise exception 'No se pudo eliminar el tendido (¿sin permiso?).'; end if;
  return v_dev;
end $$;

grant execute on function guardar_tendido(jsonb) to authenticated;
grant execute on function guardar_bultos(uuid, jsonb) to authenticated;
grant execute on function eliminar_tendido(uuid) to authenticated;

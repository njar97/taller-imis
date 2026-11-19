-- v3.44 · «Cómo vamos» ya no retrocede al empacar (19-nov-2026)
-- Auditoría funcional 18-nov, punto 3.1.
-- Antes: lo hecho = lo que hay en bodega. Al empacar, las piezas salen de
-- bodega y la cuenta las devolvía a «Sin empezar» (con todo entregado: 0 %).
-- Ahora: lo empacado sin entregar y lo entregado cuentan como hecho
-- (columna nueva `fuera`); `de_bodega` es lo que hay en bodega y todavía
-- hace falta. Sin nada empacado ni entregado los números no cambian.
create or replace view vw_plan_produccion as
 WITH cfg AS (
         SELECT to_date(((( SELECT plan_produccion_config.valor
                   FROM plan_produccion_config
                  WHERE (plan_produccion_config.clave = 'conteo_valido_desde'::text)))::integer)::text, 'YYYYMMDD'::text) AS desde
        ), conteo AS (
         SELECT bodega_movimiento.cod_prenda,
            max(bodega_movimiento.fecha) AS ultimo_conteo
           FROM bodega_movimiento
          WHERE (bodega_movimiento.tipo = 'AJUSTE_INVENTARIO'::text)
          GROUP BY bodega_movimiento.cod_prenda
        ), ped AS (
         SELECT
                CASE
                    WHEN (pedido.cod_prenda = 'B'::text) THEN 'C'::text
                    ELSE pedido.cod_prenda
                END AS cod_prenda,
            max(
                CASE
                    WHEN (pedido.cod_prenda = 'B'::text) THEN 'CAMISA'::text
                    ELSE pedido.nombre_prenda
                END) AS nombre_prenda,
            ('T'::text || substr(pedido.talla_key, (length(pedido.cod_prenda) + 1))) AS talla_2026,
            sum(pedido.cantidad_solicitada) AS pedido,
            sum(COALESCE(pedido.cantidad_entregada, 0)) AS entregado
           FROM pedido
          GROUP BY
                CASE
                    WHEN (pedido.cod_prenda = 'B'::text) THEN 'C'::text
                    ELSE pedido.cod_prenda
                END, ('T'::text || substr(pedido.talla_key, (length(pedido.cod_prenda) + 1)))
        ), emp AS (
         SELECT
                CASE
                    WHEN (pd.cod_prenda = 'B'::text) THEN 'C'::text
                    ELSE pd.cod_prenda
                END AS cod_prenda,
            ('T'::text || substr(pd.talla_key, (length(pd.cod_prenda) + 1))) AS talla_2026,
            sum(GREATEST((COALESCE(a.cantidad_acaparada, 0) - COALESCE(a.cantidad_consumida, 0)), 0)) AS empacado
           FROM ((escuela_acaparado a
             JOIN bodega_movimiento bm ON ((bm.id = a.movimiento_bodega_id)))
             JOIN pedido pd ON ((pd.id = bm.pedido_id)))
          GROUP BY
                CASE
                    WHEN (pd.cod_prenda = 'B'::text) THEN 'C'::text
                    ELSE pd.cod_prenda
                END, ('T'::text || substr(pd.talla_key, (length(pd.cod_prenda) + 1)))
        ), bod AS (
         SELECT vw_bodega_equivalente.cod_prenda,
            vw_bodega_equivalente.talla_2026,
            COALESCE(sum(vw_bodega_equivalente.stock_actual) FILTER (WHERE vw_bodega_equivalente.largo_alcanza), (0)::numeric) AS sirve,
            COALESCE(sum(vw_bodega_equivalente.stock_actual) FILTER (WHERE (NOT vw_bodega_equivalente.largo_alcanza)), (0)::numeric) AS corto
           FROM vw_bodega_equivalente
          GROUP BY vw_bodega_equivalente.cod_prenda, vw_bodega_equivalente.talla_2026
        ), mov AS (
         SELECT bodega_movimiento.cod_prenda,
            bodega_movimiento.talla_key,
            bodega_movimiento.fecha,
            bodega_movimiento.cantidad
           FROM bodega_movimiento
          WHERE ((bodega_movimiento.tipo = 'ENTRADA_PRODUCCION'::text) AND (bodega_movimiento.produccion_bulto_id IS NOT NULL))
        ), entr AS (
         SELECT m.cod_prenda,
            e.talla_2026,
            m.fecha,
            m.cantidad
           FROM ((mov m
             CROSS JOIN ( VALUES (1), (2)) v(n))
             JOIN talla_equivalencia e ON (((e.cod_prenda = m.cod_prenda) AND (e.talla_vieja = substr(m.talla_key, (length(m.cod_prenda) + 1), v.n)))))
          WHERE ((length(substr(m.talla_key, (length(m.cod_prenda) + 1), v.n)) = v.n) AND ((substr(m.talla_key, ((length(m.cod_prenda) + 1) + v.n)) ~ '^[1-9]\d{1,2}$'::text) OR ((substr(m.talla_key, ((length(m.cod_prenda) + 1) + v.n)) = ''::text) AND (e.largo_2026_cm IS NULL))))
        UNION ALL
         SELECT m.cod_prenda,
            ('T'::text || substr(m.talla_key, (length(m.cod_prenda) + 1))),
            m.fecha,
            m.cantidad
           FROM mov m
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM talla_equivalencia e
                  WHERE (e.cod_prenda = m.cod_prenda))))
        ), procb AS (
         SELECT produccion_en_proceso.cod_prenda,
            produccion_en_proceso.talla_2026,
            sum(produccion_en_proceso.cantidad) AS cant,
            min(produccion_en_proceso.fecha) AS desde
           FROM produccion_en_proceso
          WHERE (produccion_en_proceso.estado = 'EN_PROCESO'::text)
          GROUP BY produccion_en_proceso.cod_prenda, produccion_en_proceso.talla_2026
        ), proc AS (
         SELECT b.cod_prenda,
            b.talla_2026,
            GREATEST((b.cant - COALESCE(( SELECT sum(x_1.cantidad) AS sum
                   FROM entr x_1
                  WHERE ((x_1.cod_prenda = b.cod_prenda) AND (x_1.talla_2026 = b.talla_2026) AND (x_1.fecha >= b.desde))), (0)::bigint)), (0)::bigint) AS en_proceso
           FROM procb b
        ), x AS (
         SELECT p.cod_prenda,
            p.nombre_prenda,
            p.talla_2026,
            p.pedido,
            p.entregado,
            c.ultimo_conteo,
            COALESCE((c.ultimo_conteo >= ( SELECT cfg.desde
                   FROM cfg)), false) AS contado,
            COALESCE(b.sirve, (0)::numeric) AS sirve,
            COALESCE(b.corto, (0)::numeric) AS corto,
            COALESCE((r.en_proceso)::numeric, (0)::numeric) AS en_proceso,
            LEAST((p.pedido)::numeric, ((COALESCE(em.empacado, (0)::bigint))::numeric + (p.entregado)::numeric)) AS fuera
           FROM ((((ped p
             LEFT JOIN conteo c ON ((c.cod_prenda = p.cod_prenda)))
             LEFT JOIN bod b ON (((b.cod_prenda = p.cod_prenda) AND (b.talla_2026 = p.talla_2026))))
             LEFT JOIN proc r ON (((r.cod_prenda = p.cod_prenda) AND (r.talla_2026 = p.talla_2026))))
             LEFT JOIN emp em ON (((em.cod_prenda = p.cod_prenda) AND (em.talla_2026 = p.talla_2026))))
        ), y AS (
         SELECT x.cod_prenda,
            x.nombre_prenda,
            x.talla_2026,
            x.pedido,
            x.entregado,
            x.ultimo_conteo,
            x.contado,
            x.sirve,
            x.corto,
            x.en_proceso,
            x.fuera,
                CASE
                    WHEN x.contado THEN LEAST(x.sirve, ((x.pedido)::numeric - x.fuera))
                    ELSE (0)::numeric
                END AS de_bodega_c,
                CASE
                    WHEN x.contado THEN x.corto
                    ELSE (0)::numeric
                END AS bodega_corto_c
           FROM x
        )
 SELECT cod_prenda,
    nombre_prenda,
    talla_2026,
    pedido,
    entregado,
    ultimo_conteo,
    contado,
    de_bodega_c AS de_bodega,
    bodega_corto_c AS bodega_corto,
    (((pedido)::numeric - fuera) - de_bodega_c) AS falta_hacer,
    en_proceso,
    GREATEST(((((pedido)::numeric - fuera) - de_bodega_c) - en_proceso), (0)::numeric) AS falta_iniciar,
    fuera
   FROM y;

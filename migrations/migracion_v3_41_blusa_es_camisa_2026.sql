-- v3.41 · 2026: solo CAMISA (lineamientos MINED; Javier, 15-nov-2026)
-- Lo que el pedido trae como blusa (B) se confecciona y entrega como camisa (C).
-- vw_plan_produccion suma el pedido de blusa al de camisa, por talla. Las blusas
-- viejas de bodega no se restan (ya no hay renglón de blusa que las use).
-- Solo cambia el CTE "ped"; columnas y demás cálculo quedan iguales.
CREATE OR REPLACE VIEW public.vw_plan_produccion AS
 WITH cfg AS (
         SELECT to_date((( SELECT plan_produccion_config.valor
                   FROM plan_produccion_config
                  WHERE plan_produccion_config.clave = 'conteo_valido_desde'::text))::integer::text, 'YYYYMMDD'::text) AS desde
        ), conteo AS (
         SELECT bodega_movimiento.cod_prenda,
            max(bodega_movimiento.fecha) AS ultimo_conteo
           FROM bodega_movimiento
          WHERE bodega_movimiento.tipo = 'AJUSTE_INVENTARIO'::text
          GROUP BY bodega_movimiento.cod_prenda
        ), ped AS (
         SELECT (CASE WHEN pedido.cod_prenda = 'B'::text THEN 'C'::text ELSE pedido.cod_prenda END) AS cod_prenda,
            max(CASE WHEN pedido.cod_prenda = 'B'::text THEN 'CAMISA'::text ELSE pedido.nombre_prenda END) AS nombre_prenda,
            'T'::text || substr(pedido.talla_key, length(pedido.cod_prenda) + 1) AS talla_2026,
            sum(pedido.cantidad_solicitada) AS pedido,
            sum(COALESCE(pedido.cantidad_entregada, 0)) AS entregado
           FROM pedido
          GROUP BY (CASE WHEN pedido.cod_prenda = 'B'::text THEN 'C'::text ELSE pedido.cod_prenda END),
                   ('T'::text || substr(pedido.talla_key, length(pedido.cod_prenda) + 1))
        ), bod AS (
         SELECT vw_bodega_equivalente.cod_prenda,
            vw_bodega_equivalente.talla_2026,
            COALESCE(sum(vw_bodega_equivalente.stock_actual) FILTER (WHERE vw_bodega_equivalente.largo_alcanza), 0::numeric) AS sirve,
            COALESCE(sum(vw_bodega_equivalente.stock_actual) FILTER (WHERE NOT vw_bodega_equivalente.largo_alcanza), 0::numeric) AS corto
           FROM vw_bodega_equivalente
          GROUP BY vw_bodega_equivalente.cod_prenda, vw_bodega_equivalente.talla_2026
        ), proc AS (
         SELECT produccion_en_proceso.cod_prenda,
            produccion_en_proceso.talla_2026,
            sum(produccion_en_proceso.cantidad) AS en_proceso
           FROM produccion_en_proceso
          WHERE produccion_en_proceso.estado = 'EN_PROCESO'::text
          GROUP BY produccion_en_proceso.cod_prenda, produccion_en_proceso.talla_2026
        ), x AS (
         SELECT p.cod_prenda,
            p.nombre_prenda,
            p.talla_2026,
            p.pedido,
            p.entregado,
            c.ultimo_conteo,
            COALESCE(c.ultimo_conteo >= (( SELECT cfg.desde
                   FROM cfg)), false) AS contado,
            COALESCE(b.sirve, 0::numeric) AS sirve,
            COALESCE(b.corto, 0::numeric) AS corto,
            COALESCE(r.en_proceso::numeric, 0::numeric) AS en_proceso
           FROM ped p
             LEFT JOIN conteo c ON c.cod_prenda = p.cod_prenda
             LEFT JOIN bod b ON b.cod_prenda = p.cod_prenda AND b.talla_2026 = p.talla_2026
             LEFT JOIN proc r ON r.cod_prenda = p.cod_prenda AND r.talla_2026 = p.talla_2026
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
                CASE
                    WHEN x.contado THEN LEAST(x.sirve, x.pedido::numeric)
                    ELSE 0::numeric
                END AS de_bodega_c,
                CASE
                    WHEN x.contado THEN x.corto
                    ELSE 0::numeric
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
    pedido::numeric - de_bodega_c AS falta_hacer,
    en_proceso,
    GREATEST(pedido::numeric - de_bodega_c - en_proceso, 0::numeric) AS falta_iniciar
   FROM y;

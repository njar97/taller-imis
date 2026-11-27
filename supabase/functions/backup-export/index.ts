// backup-export — copia de seguridad de TODAS las tablas a JSON.gz en el bucket
// privado «backups». La lanza public.trigger_backup() (a mano desde Ajustes o
// sola cada día). También entrega la última copia para guardarla fuera de
// Supabase (accion=bajar).
//
// Las contraseñas internas NO van escritas aquí: viven en la tabla
// public.app_secreto y se leen con la llave de servicio.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Respaldo por si la base no pudiera dar su lista de tablas.
const TABLAS_MINIMAS = [
  'temporada','escuela','alumno','grado_catalogo','contrato_escuela',
  'pedido','bodega_movimiento','escuela_acaparado','entrega_escuela',
  'tendido','tendido_rollo','tendido_rollo_salida','tendido_talla_marcada',
  'trazo','trazo_pieza','trazo_prenda','trazo_talla_marcada','trazo_secundaria',
  'produccion_bulto','produccion_registro_operacion','produccion_operacion',
  'produccion_en_proceso','operaria','talla_especial','tela_rollo',
  'corte_seguimiento','plan_produccion_config','asignacion','asignacion_bulto',
  'app_user_role','app_audit',
];

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const svc = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` };

  const provided = req.headers.get('X-Backup-Token') || '';
  let secretos: Record<string, string> = {};
  try {
    const r = await fetch(`${url}/rest/v1/app_secreto?select=clave,valor&clave=in.(backup_token,backup_bajar_token)`, { headers: svc });
    if (r.ok) for (const s of await r.json()) secretos[s.clave] = s.valor;
  } catch (_) { /* sin secretos nadie pasa */ }
  const igual = (a: string, b?: string) => !!b && b.length >= 32 && a === b;
  const puedeCopiar = igual(provided, secretos.backup_token);
  const puedeBajar = puedeCopiar || igual(provided, secretos.backup_bajar_token);
  if (!puedeBajar) return json({ error: 'unauthorized' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const accion = new URL(req.url).searchParams.get('accion') || body.accion || 'copiar';

  // ── Entregar la última copia (para guardarla fuera de Supabase) ──────
  if (accion === 'bajar') {
    const lr = await fetch(`${url}/storage/v1/object/list/backups`, {
      method: 'POST',
      headers: { ...svc, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit: 5, sortBy: { column: 'name', order: 'desc' } }),
    });
    if (!lr.ok) return json({ error: 'list-failed', detail: await lr.text() }, 500);
    const lista = (await lr.json()).filter((o: any) => /^backup-.*\.json\.gz$/.test(o.name));
    if (!lista.length) return json({ error: 'sin-copias' }, 404);
    const nombre = lista[0].name;
    const fr = await fetch(`${url}/storage/v1/object/backups/${encodeURIComponent(nombre)}`, { headers: svc });
    if (!fr.ok) return json({ error: 'download-failed', detail: await fr.text() }, 500);
    return new Response(fr.body, {
      headers: { 'Content-Type': 'application/gzip', 'X-Backup-Nombre': nombre },
    });
  }

  if (!puedeCopiar) return json({ error: 'unauthorized' }, 401);

  // ── Hacer la copia ───────────────────────────────────────────────────
  let tablas: string[] = [];
  if (Array.isArray(body.tablas) && body.tablas.length > 0) tablas = body.tablas;
  else {
    try {
      const r = await fetch(`${url}/rest/v1/rpc/backup_tablas`, {
        method: 'POST', headers: { ...svc, 'Content-Type': 'application/json' }, body: '{}',
      });
      if (r.ok) tablas = await r.json();
    } catch (_) {}
    if (!Array.isArray(tablas) || tablas.length === 0) tablas = TABLAS_MINIMAS;
  }

  const dump: Record<string, any[]> = {};
  const errores: Record<string, string> = {};
  for (const t of tablas) {
    try {
      const all: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=${pageSize}&offset=${offset}`, { headers: svc });
        if (!r.ok) { errores[t] = (await r.text()).slice(0, 300); break; }
        const page = await r.json();
        if (!Array.isArray(page) || page.length === 0) break;
        all.push(...page);
        if (page.length < pageSize) break;
        offset += pageSize;
      }
      dump[t] = all;
    } catch (e) {
      errores[t] = String(e).slice(0, 300);
      dump[t] = dump[t] || [];
    }
  }

  const meta = {
    generated_at: new Date().toISOString(),
    project_id: 'kszdievqesveluzcnzsh',
    n_tablas: tablas.length,
    tables: Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])),
    errores,
  };
  const payload = JSON.stringify({ _meta: meta, ...dump }, null, 0);
  const gz = await compress(payload);

  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const fileName = `backup-${ts}.json.gz`;
  const upRes = await fetch(`${url}/storage/v1/object/backups/${fileName}`, {
    method: 'POST',
    headers: { ...svc, 'Content-Type': 'application/gzip', 'x-upsert': 'true' },
    body: gz,
  });
  if (!upRes.ok) return json({ error: 'upload-failed', detail: await upRes.text() }, 500);
  return json({ ok: true, fileName, size: gz.byteLength, meta });
});

async function compress(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

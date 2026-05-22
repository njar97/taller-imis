// ══════════════════════════════════════════════════════════════════════
// CACHE GLOBAL DE FETCHES PESADOS
// In-memory key→value cache con TTL para evitar refetch repetido de
// alumnos, escuelas, stock, etc. Las funciones que modifican datos
// invalidan el namespace correspondiente.
//
// Uso:
//   const alumnos = await cachedFetch('alumnos-all', () =>
//     supaFetchAll('alumno', '?activo=eq.true&...'),
//     { ttl: 60_000, group: 'alumnos' });
//
//   invalidarCache('alumnos');   // tras empacar / acaparar / editar
// ══════════════════════════════════════════════════════════════════════

const _DC = {
  data: new Map(),     // key → { val, expira, group }
  pending: new Map(),  // key → Promise (dedupe concurrentes)
};

const DEFAULT_TTL = 60_000;  // 60s

async function cachedFetch(key, fetchFn, opts = {}) {
  const ttl = opts.ttl || DEFAULT_TTL;
  const group = opts.group || null;
  const ahora = Date.now();

  // Hit en cache vigente
  const cached = _DC.data.get(key);
  if (cached && cached.expira > ahora) return cached.val;

  // Dedupe: si ya hay un fetch en curso para esta key, esperar
  if (_DC.pending.has(key)) return _DC.pending.get(key);

  const promise = (async () => {
    try {
      const val = await fetchFn();
      _DC.data.set(key, { val, expira: Date.now() + ttl, group });
      return val;
    } finally {
      _DC.pending.delete(key);
    }
  })();
  _DC.pending.set(key, promise);
  return promise;
}

function invalidarCache(group) {
  if (!group) {
    _DC.data.clear();
    return;
  }
  for (const [k, v] of [..._DC.data.entries()]) {
    if (v.group === group) _DC.data.delete(k);
  }
}

// Expone helpers globales con nombres más cortos
window.cachedFetch = cachedFetch;
window.invalidarCache = invalidarCache;

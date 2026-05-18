// =====================================================================
// Edge function: invite-user
// =====================================================================
// Permite a un admin invitar usuarios nuevos vía Supabase Auth Admin
// API. La service-role key vive solamente en el entorno de la function;
// nunca llega al cliente.
//
// Request:  POST /functions/v1/invite-user
//   Headers:
//     Authorization: Bearer <jwt del admin que invita>
//   Body:
//     {
//       "email":      "nuevo@correo.com",
//       "role":       "admin" | "operador"  (default: "operador"),
//       "redirectTo": "https://njar97.github.io/.../produccion.html"  (opcional)
//     }
//
// Response 200:
//   { "ok": true, "user": { "id": "...", "email": "..." } }
// Response 4xx/5xx:
//   { "error": "mensaje" }
//
// Verificaciones:
//   - JWT válido (auth.getUser con el token del request)
//   - Caller tiene role='admin' en public.app_user_role
//   - Body bien formado
//
// Side-effects:
//   - Llama auth.admin.inviteUserByEmail → Supabase manda email con link
//   - Si role solicitado = 'admin', UPDATE en app_user_role para
//     promover (el trigger on_auth_user_created ya creó la row con
//     role='operador' por default cuando se confirma el user).
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
function jsonErr(message: string, status: number): Response {
  return jsonOk({ error: message }, status);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return jsonErr("Method not allowed", 405);
  }

  try {
    const supaUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const srvKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supaUrl || !anonKey || !srvKey) {
      return jsonErr("Faltan env vars (SUPABASE_URL / ANON / SERVICE_ROLE)", 500);
    }

    // 1. Autenticar al caller con su JWT y verificar que es admin.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonErr("Falta Authorization header", 401);

    const userClient = createClient(supaUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonErr("Token inválido", 401);
    const caller = userData.user;

    const { data: roleRow, error: roleErr } = await userClient
      .from("app_user_role")
      .select("role")
      .eq("user_id", caller.id)
      .single();
    if (roleErr || !roleRow || roleRow.role !== "admin") {
      return jsonErr("Solo los admins pueden invitar usuarios", 403);
    }

    // 2. Validar body.
    let body: { email?: string; role?: string; redirectTo?: string } = {};
    try {
      body = await req.json();
    } catch {
      return jsonErr("Body inválido (esperaba JSON)", 400);
    }

    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "operador").trim();
    const redirectTo = body.redirectTo
      ? String(body.redirectTo).trim()
      : undefined;

    if (!email) return jsonErr("Email requerido", 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonErr("Email con formato inválido", 400);
    }
    if (!["admin", "operador"].includes(role)) {
      return jsonErr("role debe ser 'admin' u 'operador'", 400);
    }

    // 3. Llamar admin API con la service-role key.
    const admin = createClient(supaUrl, srvKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: invited, error: inviteErr } = await admin.auth.admin
      .inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);

    if (inviteErr || !invited?.user) {
      return jsonErr(inviteErr?.message || "No se pudo invitar", 400);
    }

    // 4. Promover a admin si corresponde (el trigger on_auth_user_created
    //    deja al user como 'operador' por default).
    if (role === "admin") {
      const { error: upErr } = await admin
        .from("app_user_role")
        .update({ role: "admin" })
        .eq("user_id", invited.user.id);
      if (upErr) {
        // Caso borde: el user fue invitado pero falló la promoción.
        // No tiramos el user; devolvemos warning para que el admin
        // promueva manualmente si hace falta.
        return jsonOk({
          ok: true,
          user: { id: invited.user.id, email: invited.user.email },
          warning: `Invitado, pero no se pudo asignar admin: ${upErr.message}`,
        });
      }
    }

    return jsonOk({
      ok: true,
      user: { id: invited.user.id, email: invited.user.email },
      role,
    });
  } catch (e) {
    return jsonErr((e as Error).message || "Error interno", 500);
  }
});

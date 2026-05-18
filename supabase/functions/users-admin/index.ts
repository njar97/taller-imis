// =====================================================================
// Edge function: users-admin
// =====================================================================
// Acciones de administración de usuarios para que un admin pueda
// listar, cambiar role y eliminar usuarios sin tocar el dashboard.
//
// Reusa el patrón de invite-user: verify_jwt=true + service-role key
// vive solo en el entorno de la función. Verifica que el caller sea
// admin con el JWT que viene en el header.
//
// Acciones (router por body.action):
//
//   POST { action: "list" }
//     → { ok: true, users: [{
//         id, email, role, created_at, last_sign_in_at, confirmed_at
//       }, ...] }
//
//   POST { action: "set-role", user_id, role: "admin" | "operador" }
//     → { ok: true }
//     Guards: no self-demotion + no demotion del último admin.
//
//   POST { action: "delete", user_id }
//     → { ok: true }
//     Guards: no self-delete + no delete del último admin.
//     auth.users tiene FK ON DELETE CASCADE desde app_user_role así
//     que se limpia solo.
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonErr("Falta Authorization header", 401);

    // 1. Verificar caller = admin
    const userClient = createClient(supaUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonErr("Token inválido", 401);
    const caller = userData.user;

    const { data: callerRole } = await userClient
      .from("app_user_role")
      .select("role")
      .eq("user_id", caller.id)
      .single();
    if (!callerRole || callerRole.role !== "admin") {
      return jsonErr("Solo los admins pueden administrar usuarios", 403);
    }

    // 2. Parsear body
    let body: { action?: string; user_id?: string; role?: string } = {};
    try { body = await req.json(); } catch { /* allow empty for some actions */ }
    const action = String(body.action || "").trim();
    if (!action) return jsonErr("Falta action", 400);

    // Client con service-role para acciones admin
    const admin = createClient(supaUrl, srvKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "list") {
      const { data: usersData, error: usersErr } = await admin.auth.admin
        .listUsers({ perPage: 1000 });
      if (usersErr) return jsonErr(usersErr.message, 500);

      const { data: rolesData, error: rolesErr } = await admin
        .from("app_user_role")
        .select("user_id, role");
      if (rolesErr) return jsonErr(rolesErr.message, 500);

      const roleMap = new Map<string, string>();
      for (const r of rolesData || []) roleMap.set(r.user_id as string, r.role as string);

      const users = (usersData.users || []).map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        confirmed_at: u.email_confirmed_at || u.confirmed_at || null,
        role: roleMap.get(u.id) || null,
        is_self: u.id === caller.id,
      }));
      // ordenar por creación descendente (más nuevos arriba)
      users.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

      return jsonOk({ ok: true, users });
    }

    if (action === "set-role") {
      const targetId = String(body.user_id || "");
      const newRole = String(body.role || "");
      if (!targetId) return jsonErr("user_id requerido", 400);
      if (!["admin", "operador"].includes(newRole)) {
        return jsonErr("role debe ser 'admin' u 'operador'", 400);
      }
      if (targetId === caller.id && newRole !== "admin") {
        return jsonErr("No podés sacarte el rol de admin a vos mismo", 400);
      }

      // Guard: si está bajando un admin a operador, asegurar que queda
      // al menos un admin restante.
      if (newRole === "operador") {
        const { data: targetRow } = await admin
          .from("app_user_role").select("role").eq("user_id", targetId).single();
        if (targetRow?.role === "admin") {
          const { count } = await admin
            .from("app_user_role")
            .select("*", { count: "exact", head: true })
            .eq("role", "admin");
          if ((count || 0) <= 1) {
            return jsonErr("No se puede dejar al sistema sin admins", 400);
          }
        }
      }

      const { error: upErr } = await admin
        .from("app_user_role")
        .update({ role: newRole })
        .eq("user_id", targetId);
      if (upErr) return jsonErr(upErr.message, 500);
      return jsonOk({ ok: true });
    }

    if (action === "delete") {
      const targetId = String(body.user_id || "");
      if (!targetId) return jsonErr("user_id requerido", 400);
      if (targetId === caller.id) {
        return jsonErr("No podés eliminar tu propio usuario", 400);
      }

      // Guard: no eliminar al último admin
      const { data: targetRow } = await admin
        .from("app_user_role").select("role").eq("user_id", targetId).single();
      if (targetRow?.role === "admin") {
        const { count } = await admin
          .from("app_user_role")
          .select("*", { count: "exact", head: true })
          .eq("role", "admin");
        if ((count || 0) <= 1) {
          return jsonErr("No se puede eliminar al último admin", 400);
        }
      }

      const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
      if (delErr) return jsonErr(delErr.message, 500);
      // app_user_role se limpia solo por FK ON DELETE CASCADE
      return jsonOk({ ok: true });
    }

    return jsonErr(`Action desconocida: ${action}`, 400);
  } catch (e) {
    return jsonErr((e as Error).message || "Error interno", 500);
  }
});

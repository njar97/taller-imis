-- =====================================================================
-- Migración v3.17 — Auth: roles de aplicación (admin / operador)
-- =====================================================================
-- Crea la tabla `app_user_role` que liga cada auth.users.id con un rol
-- de aplicación. Las policies RLS de las tablas de negocio (próxima
-- migración v3.18) van a consultar `current_user_role()` para decidir.
--
-- IMPORTANTE: esta migración NO habilita RLS sobre las tablas de
-- negocio existentes. Solo prepara la infraestructura. La app sigue
-- funcionando con anon key como fallback hasta que se haga el switch.
--
-- PASOS POST-MIGRACION (manuales, una sola vez):
--   1. Ir a Supabase dashboard → Authentication → Users → Invite user
--      (o "Add user → Create new user" con password) y crear tu usuario.
--   2. Volver acá, copiar el user.id (uuid) y correr:
--        INSERT INTO public.app_user_role (user_id, role)
--        VALUES ('<UUID-DE-TU-USUARIO>', 'admin');
--   3. Loguearte en la app con ese email/password.
--   4. Cuando funcione, recién ahí aplicar la migración v3.18 que
--      habilita RLS sobre las tablas de negocio.
--
-- Idempotente: re-ejecutable sin errores.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Enum de roles
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'operador');
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- 2) Tabla user_id -> rol
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_user_role (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL DEFAULT 'operador',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_user_role IS
  'Rol de aplicación por usuario. Consultado por current_user_role() en RLS.';

-- ---------------------------------------------------------------------
-- 3) Helper: rol del usuario actual (texto). Se usa en RLS:
--      USING ( public.current_user_role() = 'admin' )
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.app_user_role WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, anon;

-- ---------------------------------------------------------------------
-- 4) Trigger: cada nuevo usuario en auth.users entra con rol 'operador'
--    (se puede promover a admin manualmente con UPDATE).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.app_user_role (user_id, role)
  VALUES (NEW.id, 'operador')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- 5) RLS sobre la propia app_user_role
--    - El usuario solo puede leer su propia fila.
--    - Solo admin puede modificar roles.
-- ---------------------------------------------------------------------
ALTER TABLE public.app_user_role ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aur_select_self ON public.app_user_role;
CREATE POLICY aur_select_self ON public.app_user_role
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin');

DROP POLICY IF EXISTS aur_admin_all ON public.app_user_role;
CREATE POLICY aur_admin_all ON public.app_user_role
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

COMMIT;

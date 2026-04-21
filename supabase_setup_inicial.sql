-- ════════════════════════════════════════════════════════════════════
-- SETUP INICIAL - CORRER UNA SOLA VEZ EN SUPABASE SQL EDITOR
-- ════════════════════════════════════════════════════════════════════
-- Este SQL crea una función RPC que permite al script migrar.ps1
-- ejecutar SQL arbitrario desde PowerShell.
--
-- IMPORTANTE: solo correr este SQL una vez desde la consola web de Supabase.
-- Después, todas las migraciones futuras se pueden hacer desde PowerShell
-- con .\migrar.ps1
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    EXECUTE sql;
    RETURN json_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION exec_sql IS 
    'Permite ejecutar SQL arbitrario desde scripts autorizados (service_role key). Usado por migrar.ps1';

-- Revocar permisos del rol anon por seguridad
REVOKE EXECUTE ON FUNCTION exec_sql FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION exec_sql TO service_role;

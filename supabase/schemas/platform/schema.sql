CREATE SCHEMA "platform";

GRANT USAGE ON SCHEMA "platform" TO "anon", "authenticated";

GRANT CREATE, USAGE ON SCHEMA "platform" TO "postgres";

GRANT USAGE ON SCHEMA "platform" TO "service_role", "supabase_auth_admin";

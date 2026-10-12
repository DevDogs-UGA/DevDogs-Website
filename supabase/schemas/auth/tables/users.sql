CREATE TRIGGER users_reject_password_change
  BEFORE UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  WHEN ((((old.encrypted_password)::text IS DISTINCT FROM (new.encrypted_password)::text) AND ((COALESCE(new.encrypted_password, ''::character varying))::text <> ''::text)))
  EXECUTE FUNCTION platform.reject_password_change();

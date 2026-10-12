CREATE TRIGGER oauth_clients_drop_moderation_registration
  AFTER UPDATE OF deleted_at ON auth.oauth_clients
  FOR EACH ROW
  WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL)))
  EXECUTE FUNCTION platform.drop_moderation_registration();
